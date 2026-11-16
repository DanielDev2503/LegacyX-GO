import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_INVITE_STORAGE_KEY,
  gameUI
} from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import Gatekeeper from '../../src/ui/screens/Gatekeeper.svelte';
import Lobby from '../../src/ui/screens/Lobby.svelte';

const UI_SCREENS_DIR = resolve(__dirname, '../../src/ui/screens');

function readScreenSource(filename: 'Gatekeeper.svelte' | 'Lobby.svelte'): string {
  return readFileSync(resolve(UI_SCREENS_DIR, filename), 'utf8');
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

describe('Room Invite Links (#room=ID / ?room=ID) & Gatekeeper/Lobby Integration', () => {
  let localStorageMock: ReturnType<typeof makeMemoryStorage>;
  let sessionStorageMock: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    localStorageMock = makeMemoryStorage();
    sessionStorageMock = makeMemoryStorage();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    gameUI.pendingInviteRoomId = null;
    gameUI.pendingPasswordRoom = null;
    gameUI.lobbyError = null;
    gameUI.activeModal = 'NONE';
    gameUI.overlayStack = [];
    gameUI.currentScreen = 'GATEKEEPER';
    gameUI.rooms = [];

    userProfile.isAuthenticated = false;
    userProfile.isGuest = true;
    userProfile.username = '';
  });

  afterEach(() => {
    gameUI.pendingInviteRoomId = null;
    gameUI.pendingPasswordRoom = null;
    gameUI.lobbyError = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('1. Invite URL extraction edge cases', () => {
    it('extracts room ID from #room=XYZ, #/room/XYZ, #room/XYZ and ?room=XYZ', () => {
      expect(gameUI.extractRoomIdFromLocation({ hash: '#room=XYZ-01', search: '' })).toBe('XYZ-01');
      expect(gameUI.extractRoomIdFromLocation({ hash: '#foo=1&room=ABC_99', search: '' })).toBe('ABC_99');
      expect(gameUI.extractRoomIdFromLocation({ hash: '#/room/COPA2026', search: '' })).toBe('COPA2026');
      expect(gameUI.extractRoomIdFromLocation({ hash: '#room/COPA2026?x=1', search: '' })).toBe('COPA2026');
      expect(gameUI.extractRoomIdFromLocation({ hash: '', search: '?room=SALA_77' })).toBe('SALA_77');
      expect(gameUI.extractRoomIdFromLocation({ hash: '', search: '?mode=fast&room=R-8821&ref=share' })).toBe('R-8821');
    });

    it('ignores OAuth callback #access_token=... fragments and invalid room IDs', () => {
      expect(
        gameUI.extractRoomIdFromLocation({
          hash: '#access_token=eyJhbGci&token_type=bearer&room=SHOULD_IGNORE',
          search: ''
        })
      ).toBeNull();

      expect(gameUI.extractRoomIdFromLocation({ hash: '#room=ab', search: '' })).toBeNull();
      expect(gameUI.extractRoomIdFromLocation({ hash: '', search: '?room=bad/char' })).toBeNull();
      expect(gameUI.extractRoomIdFromLocation({ hash: '', search: '' })).toBeNull();
    });
  });

  describe('2. OAuth sessionStorage persistence & clearRoomInviteUrl', () => {
    it('persists pendingInviteRoomId to sessionStorage and restores it across OAuth redirect', () => {
      gameUI.pendingInviteRoomId = 'ROOM_OAUTH_42';
      gameUI.persistPendingInviteRoomId();

      expect(sessionStorageMock.getItem(PENDING_INVITE_STORAGE_KEY)).toBe('ROOM_OAUTH_42');

      // Simulate OAuth callback return where URL hash holds #access_token=... instead of #room=
      vi.stubGlobal('window', {
        location: {
          href: 'https://legacyx.test/#access_token=mock_jwt&token_type=bearer',
          pathname: '/',
          search: '',
          hash: '#access_token=mock_jwt&token_type=bearer'
        },
        history: {
          state: null,
          replaceState: vi.fn()
        }
      });

      gameUI.pendingInviteRoomId = null;
      gameUI.loadPersistedState();
      expect(gameUI.pendingInviteRoomId).toBe('ROOM_OAUTH_42');

      gameUI.persistPendingInviteRoomId(null);
      expect(sessionStorageMock.getItem(PENDING_INVITE_STORAGE_KEY)).toBeNull();
    });

    it('clearRoomInviteUrl clears sessionStorage and strips ?room= and #room= via history.replaceState', () => {
      const replaceStateMock = vi.fn();
      sessionStorageMock.setItem(PENDING_INVITE_STORAGE_KEY, 'ROOM_77');

      vi.stubGlobal('window', {
        location: {
          href: 'https://legacyx.test/play?foo=bar&room=ROOM_77#room=ROOM_77',
          pathname: '/play',
          search: '?foo=bar&room=ROOM_77',
          hash: '#room=ROOM_77'
        },
        history: {
          state: { page: 1 },
          replaceState: replaceStateMock
        }
      });

      gameUI.clearRoomInviteUrl();

      expect(sessionStorageMock.getItem(PENDING_INVITE_STORAGE_KEY)).toBeNull();
      expect(replaceStateMock).toHaveBeenCalledTimes(1);
      const [, , nextUrl] = replaceStateMock.mock.calls[0]!;
      expect(nextUrl).toBe('/play?foo=bar');
      expect(String(nextUrl)).not.toContain('room=');
    });

    it('clearRoomInviteUrl strips #/room/ID while preserving #access_token=...', () => {
      const replaceStateMock = vi.fn();
      vi.stubGlobal('window', {
        location: {
          href: 'https://legacyx.test/?room=R99#access_token=tok123',
          pathname: '/',
          search: '?room=R99',
          hash: '#access_token=tok123'
        },
        history: {
          state: null,
          replaceState: replaceStateMock
        }
      });

      gameUI.clearRoomInviteUrl();
      expect(replaceStateMock).toHaveBeenCalledWith(null, '', '/#access_token=tok123');

      replaceStateMock.mockClear();
      vi.stubGlobal('window', {
        location: {
          href: 'https://legacyx.test/#/room/R99',
          pathname: '/',
          search: '',
          hash: '#/room/R99'
        },
        history: {
          state: null,
          replaceState: replaceStateMock
        }
      });

      gameUI.clearRoomInviteUrl();
      expect(replaceStateMock).toHaveBeenCalledWith(null, '', '/');
    });
  });

  describe('3. Gatekeeper.svelte invite banner & Google OAuth persistence', () => {
    it('renders the invite context banner only when gameUI.pendingInviteRoomId is set', () => {
      gameUI.pendingInviteRoomId = null;
      const { html: defaultHtml } = render(Gatekeeper);
      expect(defaultHtml).not.toContain('invite-context-banner');
      expect(defaultHtml).not.toContain('INVITACIÓN A SALA');

      gameUI.pendingInviteRoomId = 'CUP-909';
      const { html: inviteHtml } = render(Gatekeeper);
      expect(inviteHtml).toContain('invite-context-banner');
      expect(inviteHtml).toContain('INVITACIÓN A SALA');
      expect(inviteHtml).toContain('#CUP-909');
      expect(inviteHtml).toContain('Inicia sesión o elige un nickname de invitado para unirte automáticamente');
    });

    it('persists pending invite room ID before Google OAuth redirect and keeps Svelte 5 runes + scoped styles', () => {
      const src = readScreenSource('Gatekeeper.svelte');
      compile(src, { generate: 'client' });

      expect(src).toContain('function handleGoogleLogin()');
      expect(src).toMatch(/handleGoogleLogin[\s\S]*?gameUI\.persistPendingInviteRoomId\(\)[\s\S]*?userProfile\.loginWithGoogle\(\)/);
      expect(src).toContain('onclick={handleGoogleLogin}');
      expect(src).toContain("gameUI.navigateTo('LOBBY')");

      expect(src).not.toMatch(/\bexport\s+let\b/);
      expect(src).not.toMatch(/^\s*\$:\s/m);
      expect(src).not.toMatch(/:global\(/);
      expect(src).not.toMatch(/backdrop-filter\s*:\s*blur/i);
    });
  });

  describe('4. Lobby.svelte auto-join $effect, INVALID_PASSWORD & RANKED_ACCOUNT_REQUIRED contracts', () => {
    it('renders Lobby cleanly and displays PASSWORD_PROMPT modal when pendingPasswordRoom is set', () => {
      gameUI.currentScreen = 'LOBBY';
      gameUI.pendingPasswordRoom = {
        id: 'PRIV-123',
        name: 'Sala PRIV-123',
        playersCount: 1,
        maxPlayers: 12,
        ping: 0,
        roomType: 'casual',
        isPrivate: true,
        stadium: 'mediano'
      };
      gameUI.activeModal = 'PASSWORD_PROMPT';

      const { html } = render(Lobby);
      expect(html).toContain('SALA PRIVADA');
      expect(html).toContain('Sala PRIV-123');
    });

    it('implements guarded auto-join $effect, INVALID_PASSWORD modal fallback, and RANKED_ACCOUNT_REQUIRED re-invite', () => {
      const src = readScreenSource('Lobby.svelte');
      compile(src, { generate: 'client' });

      // Svelte 5 runes & clean style checks
      expect(src).not.toMatch(/\bexport\s+let\b/);
      expect(src).not.toMatch(/^\s*\$:\s/m);
      expect(src).not.toMatch(/backdrop-filter\s*:\s*blur/i);

      // Guarded $effect tracking gameUI.pendingInviteRoomId
      expect(src).toMatch(
        /\$effect\(\(\) => \{\s*const targetRoomId = gameUI\.pendingInviteRoomId;\s*if \(!targetRoomId \|\| isAutoJoiningInvite\) return;\s*isAutoJoiningInvite = true;/
      );
      expect(src).toContain('gameUI.pendingInviteRoomId = null;');
      expect(src).toContain('gameUI.clearRoomInviteUrl();');
      expect(src).toContain('sharedSignaling.ensureConnected().catch(() => {})');
      expect(src).toContain('await gameApp.joinRoom(targetRoomId)');
      expect(src).toMatch(/finally\s*\{\s*isAutoJoiningInvite = false;\s*\}/);

      // Success -> IN_GAME + TEAM_SELECT
      expect(src).toMatch(
        /if \(ok\) \{\s*gameUI\.navigateTo\('IN_GAME'\);\s*gameUI\.clearModalStack\(\);\s*gameUI\.openModal\('TEAM_SELECT'\);/
      );

      // INVALID_PASSWORD -> clear lobbyError, lookup or fallback RoomInfo, open PASSWORD_PROMPT
      expect(src).toContain("errCode === 'INVALID_PASSWORD'");
      expect(src).toContain('gameUI.lobbyError = null;');
      expect(src).toContain('gameUI.rooms.find((r) => r.id === targetRoomId)');
      expect(src).toContain('name: `Sala ${targetRoomId}`');
      expect(src).toContain('gameUI.pendingPasswordRoom = room;');
      expect(src).toContain("gameUI.openModal('PASSWORD_PROMPT');");

      // RANKED_ACCOUNT_REQUIRED -> save pendingRankedInviteRoomId and restore on goCreateAccount
      expect(src).toContain('let pendingRankedInviteRoomId = $state<string | null>(null);');
      expect(src).toContain("errCode === 'RANKED_ACCOUNT_REQUIRED'");
      expect(src).toContain('pendingRankedInviteRoomId = targetRoomId;');
      expect(src).toMatch(
        /function goCreateAccount\(\)[\s\S]*?if \(pendingRankedInviteRoomId\)[\s\S]*?gameUI\.pendingInviteRoomId = pendingRankedInviteRoomId;/
      );
      expect(src).toContain('{#if userProfile.isGuest || pendingRankedInviteRoomId}');
    });
  });
});
