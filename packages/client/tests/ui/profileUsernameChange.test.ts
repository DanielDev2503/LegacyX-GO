import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SESSION_STORAGE_KEY,
  userProfile
} from '../../src/ui/state/userProfile.svelte.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.sig_test`;
}

function makeMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

describe('userProfile username change RPC & authoritative profile hydration', () => {
  let memoryStorage: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    memoryStorage = makeMemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);
    userProfile.logout();
    userProfile.onUsernameChanged = null;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    userProfile.onUsernameChanged = null;
    vi.unstubAllGlobals();
  });

  it('calls POST /rest/v1/rpc/change_username_once (not PATCH /rest/v1/profiles), persists state, syncs gameUI, fires callback and refreshes rank & leaderboard', async () => {
    const validJwt = makeJwt({ sub: 'u-victor', exp: Math.floor(Date.now() / 1000) + 3600 });
    userProfile.isAuthenticated = true;
    userProfile.isGuest = false;
    userProfile.id = 'u-victor';
    userProfile.username = 'victorsamchez40';
    userProfile.displayName = 'victorsamchez40';
    userProfile.isVerified = true;
    userProfile.nameChanged = false;
    userProfile.jwt = validJwt;
    userProfile.refreshToken = 'rt-1';
    userProfile.leaderboardCategory = 'elo';

    const onChanged = vi.fn();
    userProfile.onUsernameChanged = onChanged;
    const nickSpy = vi.spyOn(gameUI, 'setPlayerNickname');
    const rankSpy = vi.spyOn(userProfile, 'fetchPersonalRank');
    const lbSpy = vi.spyOn(userProfile, 'fetchLeaderboard');

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/rest/v1/profiles') && init?.method === 'PATCH') {
        throw new Error('Must NOT call PATCH /rest/v1/profiles directly');
      }
      if (url.includes('/rest/v1/rpc/change_username_once')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ p_new_username: 'Yami' });
        expect((init?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${validJwt}`);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            username: 'Yami',
            display_name: 'Yami',
            name_changed: true
          })
        };
      }
      if (url.startsWith('/api/leaderboard')) {
        return {
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'text/html' })
        };
      }
      if (url.includes('/rest/v1/rpc/get_player_rank_summary')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [{ rank_position: 2, elo: 1250, goals: 10, assists: 5, saves: 3 }]
        };
      }
      if (url.includes('/rest/v1/rpc/get_leaderboard')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [
            { position: 2, player_id: 'u-victor', username: 'Yami', metric_value: 1250, elo: 1250 }
          ]
        };
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await userProfile.changeUsernameOnce('  Yami  ');
    expect(ok).toBe(true);
    expect(userProfile.username).toBe('Yami');
    expect(userProfile.displayName).toBe('Yami');
    expect(userProfile.nameChanged).toBe(true);
    expect(userProfile.authError).toBeNull();

    const saved = JSON.parse(memoryStorage.getItem(AUTH_SESSION_STORAGE_KEY) || '{}');
    expect(saved.username).toBe('Yami');
    expect(saved.displayName).toBe('Yami');
    expect(saved.nameChanged).toBe(true);

    expect(nickSpy).toHaveBeenCalledWith('Yami');
    expect(gameUI.nickname).toBe('Yami');
    expect(onChanged).toHaveBeenCalledWith('Yami');
    expect(rankSpy).toHaveBeenCalledWith('elo');
    expect(lbSpy).toHaveBeenCalledWith('elo');
    expect(userProfile.personalRank?.position).toBe(2);
    expect(userProfile.leaderboard[0]?.username).toBe('Yami');
  });

  it('rejects duplicate or invalid RPC response without mutating username or flipping nameChanged, and populates authError', async () => {
    const validJwt = makeJwt({ sub: 'u-dev', exp: Math.floor(Date.now() / 1000) + 3600 });
    userProfile.isAuthenticated = true;
    userProfile.isGuest = false;
    userProfile.id = 'u-dev';
    userProfile.username = 'Dev_test';
    userProfile.displayName = 'Dev_test';
    userProfile.isVerified = true;
    userProfile.nameChanged = false;
    userProfile.jwt = validJwt;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rest/v1/rpc/change_username_once')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: false,
              error: 'Ese nombre de usuario ya está en uso.'
            })
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    await expect(userProfile.changeUsernameOnce('Yami')).rejects.toThrow(
      'Ese nombre de usuario ya está en uso.'
    );
    expect(userProfile.username).toBe('Dev_test');
    expect(userProfile.displayName).toBe('Dev_test');
    expect(userProfile.nameChanged).toBe(false);
    expect(userProfile.authError).toBe('Ese nombre de usuario ya está en uso.');
  });

  it('refreshes JWT via ensureValidAccessToken on 401 and retries RPC cleanly', async () => {
    const staleServerJwt = makeJwt({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    const freshJwt = makeJwt({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) + 7200 });

    userProfile.isAuthenticated = true;
    userProfile.isGuest = false;
    userProfile.id = 'u-1';
    userProfile.username = 'OldAlias';
    userProfile.displayName = 'OldAlias';
    userProfile.isVerified = true;
    userProfile.nameChanged = false;
    userProfile.jwt = staleServerJwt;
    userProfile.refreshToken = 'rt-old';

    let rpcAttempt = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/rest/v1/rpc/change_username_once')) {
        rpcAttempt++;
        if (rpcAttempt === 1) {
          return {
            ok: false,
            status: 401,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ message: 'JWT expired' })
          };
        }
        expect((init?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${freshJwt}`);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            success: true,
            username: 'NewAlias',
            display_name: 'NewAlias',
            name_changed: true
          })
        };
      }
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            access_token: freshJwt,
            refresh_token: 'rt-new'
          })
        };
      }
      if (url.startsWith('/api/leaderboard')) {
        return { ok: false, status: 404, headers: new Headers({ 'content-type': 'text/html' }) };
      }
      if (url.includes('/rest/v1/rpc/get_player_rank_summary')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => []
        };
      }
      if (url.includes('/rest/v1/rpc/get_leaderboard')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => []
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await userProfile.changeUsernameOnce('NewAlias');
    expect(ok).toBe(true);
    expect(rpcAttempt).toBe(2);
    expect(userProfile.jwt).toBe(freshJwt);
    expect(userProfile.refreshToken).toBe('rt-new');
    expect(userProfile.username).toBe('NewAlias');
    expect(userProfile.nameChanged).toBe(true);
  });

  it('refreshes authoritative profiles.username on reload and ignores stale cached or OAuth metadata', async () => {
    const validJwt = makeJwt({ sub: 'u-victor', exp: Math.floor(Date.now() / 1000) + 3600 });
    memoryStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        jwt: validJwt,
        refreshToken: 'rt-1',
        id: 'u-victor',
        username: 'victorsamchez40',
        displayName: 'Yami',
        email: 'victor@legacyx.gg',
        role: 'jugador',
        isVerified: true,
        nameChanged: true,
        elo: 1000
      })
    );

    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:5173', hash: '', pathname: '/', search: '' },
      history: { replaceState }
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/auth/session') || url.startsWith('/api/leaderboard')) {
          return { ok: false, status: 404, headers: new Headers({ 'content-type': 'text/html' }) };
        }
        if (url.includes('/rest/v1/profiles')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => [
              {
                id: 'u-victor',
                username: 'Yami',
                display_name: 'Google OAuth Stale Name',
                email: 'victor@legacyx.gg',
                role: 'jugador',
                is_verified: true,
                name_changed: true
              }
            ]
          };
        }
        if (url.includes('/rest/v1/player_rankings')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => [{ elo: 1210, matches_played: 6, wins: 4, losses: 2, draws: 0, goals: 8, assists: 3, saves: 2, mvp_count: 1 }]
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => []
        };
      })
    );

    userProfile.loadPersistedSession();
    await vi.waitFor(() => {
      expect(userProfile.username).toBe('Yami');
    });
    expect(userProfile.displayName).toBe('Yami');
    expect(userProfile.elo).toBe(1210);
    expect(gameUI.nickname).toBe('Yami');
    expect(JSON.parse(memoryStorage.getItem(AUTH_SESSION_STORAGE_KEY) || '{}').username).toBe('Yami');

    // OAuth redirect must also prefer profiles.username over auth.users user_metadata
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:5173',
        hash: `#access_token=${validJwt}&refresh_token=rt-oauth`,
        pathname: '/',
        search: ''
      },
      history: { replaceState }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/v1/user')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              id: 'u-victor',
              user_metadata: { full_name: 'Victor Sanchez Google', username: 'victorsamchez40' }
            })
          };
        }
        if (url.includes('/rest/v1/profiles')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => [
              {
                id: 'u-victor',
                username: 'Yami',
                display_name: 'Victor Sanchez Google',
                email: 'victor@legacyx.gg',
                role: 'jugador',
                is_verified: true,
                name_changed: true
              }
            ]
          };
        }
        if (url.includes('/rest/v1/player_rankings')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => [{ elo: 1210, matches_played: 6 }]
          };
        }
        if (url.startsWith('/api/leaderboard')) {
          return { ok: false, status: 404, headers: new Headers({ 'content-type': 'text/html' }) };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => []
        };
      })
    );

    const okOAuth = await userProfile.handleOAuthRedirect();
    expect(okOAuth).toBe(true);
    expect(userProfile.username).toBe('Yami');
    expect(userProfile.displayName).toBe('Yami');
    expect(userProfile.nameChanged).toBe(true);
  });

  it('preserves stats and authoritative username on /api/auth/login response', async () => {
    const validJwt = makeJwt({ sub: 'u-1', exp: Math.floor(Date.now() / 1000) + 3600 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/login') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ok: true,
              accessToken: validJwt,
              refreshToken: 'rt-api',
              profile: {
                id: 'u-1',
                username: 'Yami',
                displayName: 'Yami',
                email: 'yami@legacyx.gg',
                role: 'jugador',
                isVerified: true,
                nameChanged: true,
                elo: 1320,
                matchesPlayed: 15,
                wins: 9,
                losses: 4,
                draws: 2,
                goals: 18,
                assists: 7,
                saves: 12,
                mvpCount: 3
              }
            })
          };
        }
        return {
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'text/html' })
        };
      })
    );

    const res = await userProfile.login('Yami', 'secret123');
    expect(res.ok).toBe(true);
    expect(userProfile.username).toBe('Yami');
    expect(userProfile.nameChanged).toBe(true);
    expect(userProfile.elo).toBe(1320);
    expect(userProfile.stats).toEqual({
      matchesPlayed: 15,
      wins: 9,
      losses: 4,
      draws: 2,
      goals: 18,
      assists: 7,
      saves: 12,
      mvpCount: 3
    });
  });
});
