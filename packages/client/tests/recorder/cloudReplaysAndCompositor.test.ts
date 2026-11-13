import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameMatchPhase, MatchPhase, type CompactDiscState, type GameStateSnapshot } from '@legacyx/core';
import {
  compressReplayGzip,
  decompressReplayGzip,
  matchRecorder,
  type LxrReplayV1,
  type LxrReplayV2
} from '../../src/recorder/MatchRecorder.js';
import {
  computeReplayEffectiveZoom,
  exportReplayToWebm,
  getActiveReplayBanner,
  getVisibleReplayChat,
  renderReplayHudOverlay
} from '../../src/recorder/ReplayHudCompositor.js';
import { ScoreboardHUD } from '../../src/controllers/components/ScoreboardHUD.js';
import { userProfile, validateAccountUsername } from '../../src/ui/state/userProfile.svelte.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

function makeBase64UrlJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.sig_test_url-safe`;
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
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    }
  };
}

function makeSnapshot(overrides: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  const ball: CompactDiscState = {
    id: 0,
    team: 0,
    x: 100,
    y: -25,
    vx: 420,
    vy: -80,
    flags: 0,
    stamina: 0,
    spin: 12
  };
  const p1: CompactDiscState = {
    id: 1,
    team: 1,
    x: -120,
    y: 10,
    vx: 200,
    vy: 0,
    flags: 1,
    stamina: 85,
    spin: 0
  };
  return {
    tick: 60,
    phase: MatchPhase.PLAYING,
    matchTimer: 125.5,
    redScore: 2,
    blueScore: 1,
    soundMask: 0,
    isGoldenGoal: false,
    discs: [ball, p1],
    ...overrides
  };
}

function makeMockCanvas2dContext() {
  const fillTexts: string[] = [];
  const fillStyles: unknown[] = [];
  const strokeStyles: unknown[] = [];
  const gradientStops: Array<[number, string]> = [];
  const shadowColors: string[] = [];
  const arcCalls: Array<[number, number, number]> = [];
  const roundRectCalls: Array<[number, number, number, number, number]> = [];
  const stateStack: Array<{ shadowColor: string; shadowBlur: number }> = [];
  const ctx: Record<string, unknown> = {
    canvas: { width: 1280, height: 720 },
    save: vi.fn(() => {
      stateStack.push({
        shadowColor: String(ctx.shadowColor ?? 'transparent'),
        shadowBlur: Number(ctx.shadowBlur ?? 0)
      });
    }),
    restore: vi.fn(() => {
      const prev = stateStack.pop();
      if (prev) {
        ctx.shadowColor = prev.shadowColor;
        ctx.shadowBlur = prev.shadowBlur;
      }
    }),
    scale: vi.fn(),
    translate: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn((x: number, y: number, r: number) => {
      arcCalls.push([x, y, r]);
    }),
    rect: vi.fn(),
    roundRect: vi.fn((x: number, y: number, w: number, h: number, r: number) => {
      roundRectCalls.push([x, y, w, h, r]);
    }),
    fill: vi.fn(() => {
      fillStyles.push(ctx.fillStyle);
      if (Number(ctx.shadowBlur ?? 0) > 0) {
        shadowColors.push(String(ctx.shadowColor));
      }
    }),
    stroke: vi.fn(() => {
      strokeStyles.push(ctx.strokeStyle);
    }),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      fillTexts.push(String(text));
    }),
    strokeText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: String(text).length * 8 })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn((offset: number, color: string) => {
        gradientStops.push([offset, color]);
      })
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn((offset: number, color: string) => {
        gradientStops.push([offset, color]);
      })
    })),
    fillStyle: '#ffffff',
    strokeStyle: '#ffffff',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillTexts,
    fillStyles,
    strokeStyles,
    gradientStops,
    shadowColors,
    arcCalls,
    roundRectCalls
  };
}

describe('Task 4: Gzip LXR2, JWT Refresh, Cloud Replays & 16:9 HUD Compositor', () => {
  let memoryStorage: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    memoryStorage = makeMemoryStorage();
    vi.stubGlobal('localStorage', memoryStorage);
    userProfile.logout();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('Gzip compression, LXR2 format & LXR1 backwards compatibility', () => {
    it('compresses and decompresses LXR2 with metadata, chat, banners, zoom & isGoldenGoal without truncating chunks', async () => {
      const frames = Array.from({ length: 40 }, (_, i) => ({
        t: Number((i / 20).toFixed(3)),
        snapshot: makeSnapshot({
          tick: i * 3,
          matchTimer: 180 - i * 0.05,
          isGoldenGoal: i >= 30,
          discs: [
            {
              id: 0,
              team: 0,
              x: i * 6,
              y: Math.sin(i) * 40,
              vx: 300,
              vy: 20,
              flags: 0,
              stamina: 0,
              spin: 8
            },
            {
              id: 7,
              team: 1,
              x: -80 + i * 2,
              y: 12,
              vx: 150,
              vy: 5,
              flags: 0,
              stamina: 95,
              spin: 0
            }
          ]
        })
      }));

      const replay: LxrReplayV2 = {
        magic: 'LXR2',
        version: 2,
        createdAt: '2026-11-13T10:00:00.000Z',
        roomName: 'Copa Cyber-Pitch Final',
        stadiumId: 'grande',
        durationSeconds: 2,
        redScore: 1,
        blueScore: 0,
        recordingPlayerId: 7,
        recordingPlayerName: 'StrikerPro',
        cameraZoom: 0.78,
        viewportWidth: 1920,
        viewportHeight: 1080,
        timeLimitSeconds: 180,
        redKit: {
          tag: 'REDPRO',
          primaryColor: '#ef4444',
          secondaryColor: '#991b1b',
          borderColor: '#ffffff',
          textColor: '#ffffff',
          pattern: 'solid'
        },
        blueKit: {
          tag: 'BLUMAX',
          primaryColor: '#3b82f6',
          secondaryColor: '#1e40af',
          borderColor: '#ffffff',
          textColor: '#ffffff',
          pattern: 'stripes'
        },
        players: [
          { id: 7, nickname: 'StrikerPro', team: 'red', avatar: '⚡' },
          { id: 9, nickname: 'KeeperBlue', team: 'blue', avatar: '🛡' }
        ],
        chatMessages: [
          { t: 0.25, kind: 'chat', sender: 'StrikerPro', senderTeam: 'RED', text: 'Buena jugada!' },
          { t: 1.5, kind: 'goal', sender: 'Sistema', text: '¡Gol de StrikerPro!' }
        ],
        banners: [
          { t: 0.1, payload: { kind: 'VS', label: 'REDPRO vs BLUMAX' } },
          {
            t: 1.5,
            payload: {
              kind: 'GOAL',
              scoringTeam: 'red',
              scorerName: 'StrikerPro',
              speedKmh: 124,
              isPower: true,
              isCurve: true
            }
          }
        ],
        goals: [{ t: 1.5, scoringTeam: 'red', scorerName: 'StrikerPro', redScore: 1, blueScore: 0 }],
        frames
      };

      const rawJsonBytes = new TextEncoder().encode(JSON.stringify(replay)).byteLength;
      const gzBytes = await compressReplayGzip(replay);
      expect(gzBytes.byteLength).toBeGreaterThan(20);
      expect(gzBytes.byteLength).toBeLessThan(rawJsonBytes);

      const roundtrip = await decompressReplayGzip(gzBytes);
      expect(roundtrip.magic).toBe('LXR2');
      expect(roundtrip.version).toBe(2);
      if (roundtrip.magic !== 'LXR2') throw new Error('Expected LXR2');
      expect(roundtrip.roomName).toBe('Copa Cyber-Pitch Final');
      expect(roundtrip.recordingPlayerId).toBe(7);
      expect(roundtrip.recordingPlayerName).toBe('StrikerPro');
      expect(roundtrip.cameraZoom).toBe(0.78);
      expect(roundtrip.viewportWidth).toBe(1920);
      expect(roundtrip.viewportHeight).toBe(1080);
      expect(roundtrip.timeLimitSeconds).toBe(180);
      expect(roundtrip.chatMessages).toEqual(replay.chatMessages);
      expect(roundtrip.banners).toEqual(replay.banners);
      expect(roundtrip.frames[35].snapshot.isGoldenGoal).toBe(true);
    });

    it('keeps LXR1 backwards compatibility in parseReplayText and decompressReplayGzip', async () => {
      const legacyV1: LxrReplayV1 = {
        magic: 'LXR1',
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        roomName: 'Legacy Room',
        stadiumId: 'clasico',
        durationSeconds: 1,
        redScore: 0,
        blueScore: 0,
        players: [{ id: 1, nickname: 'LegacyUser', team: 'red' }],
        goals: [],
        frames: [{ t: 0, snapshot: makeSnapshot() }]
      };

      const parsedPlain = matchRecorder.parseReplayText(JSON.stringify(legacyV1));
      expect(parsedPlain.magic).toBe('LXR1');
      expect(parsedPlain.version).toBe(1);
      expect(parsedPlain.frames).toHaveLength(1);

      const gzV1 = await compressReplayGzip(legacyV1);
      const parsedGzV1 = await decompressReplayGzip(gzV1);
      expect(parsedGzV1.magic).toBe('LXR1');
      expect(parsedGzV1.players[0].nickname).toBe('LegacyUser');
    });
  });

  describe('MatchRecorder LXR2 capture, chat/banners & cloud auto-upload', () => {
    it('removes downloadReplay/MediaRecorder, captures chat & banners, auto-uploads on stop & auto-dismisses notice after 5.5s', async () => {
      vi.useFakeTimers();

      expect((matchRecorder as unknown as Record<string, unknown>).downloadReplay).toBeUndefined();
      expect((matchRecorder as unknown as Record<string, unknown>).downloadVideo).toBeUndefined();

      const createElementSpy = vi.fn();
      vi.stubGlobal('document', { createElement: createElementSpy });

      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      const uploadSpy = vi.spyOn(userProfile, 'uploadUserReplay').mockResolvedValue({
        id: 'rep-1',
        user_id: 'u-1',
        name: 'Arena Neon',
        stadium_id: 'chico',
        duration_seconds: 1,
        red_score: 1,
        blue_score: 0,
        red_acronym: 'RED',
        blue_acronym: 'BLU',
        storage_path: 'u-1/rep-1.lxr.gz',
        file_size_bytes: 512,
        created_at: '2026-11-13T10:00:00.000Z'
      });

      matchRecorder.start(null, {
        roomName: 'Arena Neon',
        stadiumId: 'chico',
        players: [{ id: 3, nickname: 'HostPlayer', team: 'red' }],
        recordingPlayerId: 3,
        recordingPlayerName: 'HostPlayer',
        cameraZoom: 0.9,
        viewportWidth: 1600,
        viewportHeight: 900,
        timeLimitSeconds: 300
      });

      matchRecorder.recordFrame(makeSnapshot({ isGoldenGoal: true }));
      matchRecorder.recordChat({ kind: 'chat', sender: 'HostPlayer', senderTeam: 'RED', text: 'Golazo!' });
      matchRecorder.recordBanner({
        kind: 'GOAL',
        scoringTeam: 'red',
        scorerName: 'HostPlayer',
        speedKmh: 112,
        isPower: true,
        isCurve: false
      });

      const last = matchRecorder.stop();
      await matchRecorder.waitForCloudUpload();

      // Must NOT trigger any .lxr or video browser download
      expect(createElementSpy).not.toHaveBeenCalled();

      expect(last?.magic).toBe('LXR2');
      if (last?.magic !== 'LXR2') throw new Error('Expected LXR2');
      expect(last.roomName).toBe('Arena Neon');
      expect(last.recordingPlayerId).toBe(3);
      expect(last.cameraZoom).toBe(0.9);
      expect(last.viewportWidth).toBe(1600);
      expect(last.viewportHeight).toBe(900);
      expect(last.timeLimitSeconds).toBe(300);
      expect(last.chatMessages).toHaveLength(1);
      expect(last.banners).toHaveLength(1);
      expect(last.frames[0].snapshot.isGoldenGoal).toBe(true);

      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect(matchRecorder.showPostRecordPrompt).toBe(true);
      expect(matchRecorder.isUploadingToCloud).toBe(false);
      expect(matchRecorder.cloudSaveError).toBeNull();
      expect(matchRecorder.savedCloudNotice).toBe(
        'Grabación guardada en tu cuenta. Ve al Visor de Repeticiones para verla o descargar el video.'
      );

      vi.advanceTimersByTime(5600);
      expect(matchRecorder.savedCloudNotice).toBeNull();
    });

    it('records cloudSaveError when auto-upload fails', async () => {
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      vi.spyOn(userProfile, 'uploadUserReplay').mockRejectedValue(new Error('Bucket quota exceeded'));

      matchRecorder.start(null, { roomName: 'Sala Fail', stadiumId: 'clasico', players: [] });
      matchRecorder.recordFrame(makeSnapshot());
      matchRecorder.stop();
      await matchRecorder.waitForCloudUpload();

      expect(matchRecorder.isUploadingToCloud).toBe(false);
      expect(matchRecorder.savedCloudNotice).toBeNull();
      expect(matchRecorder.cloudSaveError).toContain('Bucket quota exceeded');
    });
  });

  describe('UserProfile JWT refresh, Replay API wiring, validation & logout', () => {
    it('decodes URL-safe base64 JWT exp, avoids refresh when >60s left, refreshes within 60s and wires into all 5 replay operations', async () => {
      const freshToken = makeBase64UrlJwt({
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        note: 'url_safe-padding_test??'
      });
      userProfile.jwt = freshToken;
      userProfile.refreshToken = 'rt-1';

      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      expect(await userProfile.ensureValidAccessToken()).toBe(freshToken);
      expect(fetchMock).not.toHaveBeenCalled();

      // Expiring within 30s -> must refresh via /auth/v1/token?grant_type=refresh_token
      const expiringToken = makeBase64UrlJwt({
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 30
      });
      const refreshedToken = makeBase64UrlJwt({
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 7200
      });

      userProfile.jwt = expiringToken;
      userProfile.refreshToken = 'rt-old';
      userProfile.id = 'user-1';
      userProfile.username = 'ProUser';
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      userProfile.isVerified = true;

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
          const headers = init?.headers as Record<string, string>;
          expect(headers?.apikey || headers?.Apikey).toBeTruthy();
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: refreshedToken,
              refresh_token: 'rt-new'
            })
          };
        }
        if (url.includes('/rest/v1/user_replays') && (!init?.method || init.method === 'GET')) {
          const headers = init?.headers as Record<string, string>;
          expect(headers?.Authorization).toBe(`Bearer ${refreshedToken}`);
          return {
            ok: true,
            status: 200,
            json: async () => []
          };
        }
        if (url.includes('/storage/v1/object/replays/') && init?.method === 'POST') {
          const headers = init?.headers as Record<string, string>;
          expect(headers?.Authorization).toBe(`Bearer ${refreshedToken}`);
          return { ok: true, status: 200, json: async () => ({ Key: 'x' }) };
        }
        if (url.includes('/rest/v1/user_replays') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          expect(body.red_acronym).toHaveLength(6);
          expect(body.blue_acronym).toHaveLength(6);
          return {
            ok: true,
            status: 201,
            json: async () => [{ id: 'db-1', ...body, created_at: '2026-11-13T00:00:00Z' }]
          };
        }
        if (url.includes('/storage/v1/object/replays/') && (!init?.method || init.method === 'GET')) {
          const headers = init?.headers as Record<string, string>;
          expect(headers?.Authorization).toBe(`Bearer ${refreshedToken}`);
          const gz = await compressReplayGzip({
            magic: 'LXR2',
            version: 2,
            createdAt: '2026-11-13T00:00:00.000Z',
            roomName: 'Cloud',
            stadiumId: 'clasico',
            durationSeconds: 1,
            redScore: 0,
            blueScore: 0,
            recordingPlayerId: 1,
            recordingPlayerName: 'ProUser',
            cameraZoom: 1,
            viewportWidth: 1280,
            viewportHeight: 720,
            timeLimitSeconds: 180,
            players: [],
            chatMessages: [],
            banners: [],
            goals: [],
            frames: [{ t: 0, snapshot: makeSnapshot() }]
          });
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength)
          };
        }
        if (url.includes('/rest/v1/user_replays') && (init?.method === 'PATCH' || init?.method === 'DELETE')) {
          return { ok: true, status: 204, json: async () => ({}) };
        }
        if (url.includes('/storage/v1/object/replays/') && init?.method === 'DELETE') {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
      });

      // Trigger all 5 operations when token needs refresh
      await userProfile.fetchUserReplays();
      expect(userProfile.jwt).toBe(refreshedToken);
      expect(userProfile.refreshToken).toBe('rt-new');

      const sampleReplay: LxrReplayV2 = {
        magic: 'LXR2',
        version: 2,
        createdAt: '2026-11-13T00:00:00.000Z',
        roomName: 'Long Tags Match',
        stadiumId: 'clasico',
        durationSeconds: 1,
        redScore: 2,
        blueScore: 1,
        recordingPlayerId: 1,
        recordingPlayerName: 'ProUser',
        cameraZoom: 1,
        viewportWidth: 1280,
        viewportHeight: 720,
        timeLimitSeconds: 180,
        redKit: { tag: 'REDTEAM_TOO_LONG' },
        blueKit: { tag: 'BLUETEAM_TOO_LONG' },
        players: [],
        chatMessages: [],
        banners: [],
        goals: [],
        frames: [{ t: 0, snapshot: makeSnapshot() }]
      };

      userProfile.jwt = expiringToken;
      await userProfile.uploadUserReplay(sampleReplay, 'Partido 1');
      expect(userProfile.jwt).toBe(refreshedToken);

      userProfile.jwt = expiringToken;
      const dl = await userProfile.downloadUserReplay('user-1/rep.lxr.gz');
      expect(dl.magic).toBe('LXR2');

      userProfile.jwt = expiringToken;
      await userProfile.renameUserReplay('db-1', 'Nuevo Nombre');

      userProfile.jwt = expiringToken;
      await userProfile.deleteUserReplay('db-1', 'user-1/rep.lxr.gz');

      const refreshCalls = fetchMock.mock.calls.filter(([u]) =>
        String(u).includes('/auth/v1/token?grant_type=refresh_token')
      );
      expect(refreshCalls.length).toBeGreaterThanOrEqual(5);
    });

    it('clears session with Spanish error when refresh fails permanently', async () => {
      userProfile.jwt = makeBase64UrlJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 10 });
      userProfile.refreshToken = 'revoked-refresh';
      userProfile.id = 'u1';
      userProfile.username = 'PlayerOne';
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid_grant' })
        }))
      );

      const token = await userProfile.ensureValidAccessToken();
      expect(token).toBeNull();
      expect(userProfile.isAuthenticated).toBe(false);
      expect(userProfile.isGuest).toBe(true);
      expect(userProfile.jwt).toBeNull();
      expect(userProfile.refreshToken).toBeNull();
      expect(userProfile.authError).toBe('Tu sesión expiró. Vuelve a iniciar sesión.');
    });

    it('deletes orphaned storage object when user_replays DB insert fails', async () => {
      userProfile.jwt = makeBase64UrlJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
      userProfile.id = 'u1';
      userProfile.username = 'PlayerOne';
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;

      const calls: Array<{ method: string; url: string }> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          const method = init?.method ?? 'GET';
          calls.push({ method, url });
          if (url.includes('/rest/v1/user_replays') && method === 'GET') {
            return { ok: true, status: 200, json: async () => [] };
          }
          if (url.includes('/storage/v1/object/replays/') && method === 'POST') {
            return { ok: true, status: 200, json: async () => ({}) };
          }
          if (url.includes('/rest/v1/user_replays') && method === 'POST') {
            return { ok: false, status: 400, json: async () => ({ message: 'acronym constraint' }) };
          }
          if (url.includes('/storage/v1/object/replays/') && method === 'DELETE') {
            return { ok: true, status: 200, json: async () => ({}) };
          }
          throw new Error(`Unexpected ${method} ${url}`);
        })
      );

      await expect(
        userProfile.uploadUserReplay({
          magic: 'LXR2',
          version: 2,
          createdAt: '2026-11-13T00:00:00.000Z',
          roomName: 'Orphan Test',
          stadiumId: 'clasico',
          durationSeconds: 1,
          redScore: 0,
          blueScore: 0,
          recordingPlayerId: 1,
          recordingPlayerName: 'PlayerOne',
          cameraZoom: 1,
          viewportWidth: 1280,
          viewportHeight: 720,
          timeLimitSeconds: 180,
          players: [],
          chatMessages: [],
          banners: [],
          goals: [],
          frames: [{ t: 0, snapshot: makeSnapshot() }]
        })
      ).rejects.toThrow();

      expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('/storage/v1/object/replays/u1/'))).toBe(true);
    });

    it('checks token validity in loadPersistedSession(), handles applyServerProfilePayload nameChanged, validates 3..15 usernames & fully resets on logout()', () => {
      // 1. Expired JWT without refreshToken in storage -> cleared and stays guest
      memoryStorage.setItem(
        'legacyx_auth_session_v1',
        JSON.stringify({
          jwt: makeBase64UrlJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 100 }),
          id: 'u1',
          username: 'ExpiredUser',
          isVerified: true
        })
      );
      userProfile.loadPersistedSession();
      expect(userProfile.isAuthenticated).toBe(false);
      expect(userProfile.isGuest).toBe(true);
      expect(memoryStorage.getItem('legacyx_auth_session_v1')).toBeNull();

      // 2. Valid JWT in storage -> restored cleanly
      memoryStorage.setItem(
        'legacyx_auth_session_v1',
        JSON.stringify({
          jwt: makeBase64UrlJwt({ sub: 'u2', exp: Math.floor(Date.now() / 1000) + 3600 }),
          refreshToken: 'rt-valid',
          id: 'u2',
          username: 'ValidUser',
          displayName: 'Valid Display',
          email: 'valid@example.com',
          isVerified: true,
          nameChanged: true,
          elo: 1450,
          stats: {
            matchesPlayed: 12,
            wins: 8,
            losses: 3,
            draws: 1,
            goals: 20,
            assists: 9,
            saves: 4,
            mvpCount: 5
          }
        })
      );
      userProfile.loadPersistedSession();
      expect(userProfile.isAuthenticated).toBe(true);
      expect(userProfile.username).toBe('ValidUser');
      expect(userProfile.nameChanged).toBe(true);

      // 3. applyServerProfilePayload supports both camelCase & snake_case
      (userProfile as unknown as { applyServerProfilePayload: (p: unknown) => void }).applyServerProfilePayload({
        profile: {
          id: 'u2',
          username: 'CamelUser',
          nameChanged: false
        }
      });
      expect(userProfile.nameChanged).toBe(false);
      (userProfile as unknown as { applyServerProfilePayload: (p: unknown) => void }).applyServerProfilePayload({
        profile: {
          id: 'u2',
          username: 'CamelUser',
          nameChanged: true
        }
      });
      expect(userProfile.nameChanged).toBe(true);

      // 4. validateAccountUsername matches ^[a-zA-Z0-9_.-]{3,15}$ and blocks inv_
      expect(validateAccountUsername('ab').valid).toBe(false);
      expect(validateAccountUsername('1234567890123456').valid).toBe(false);
      expect(validateAccountUsername('inv_hack').valid).toBe(false);
      expect(validateAccountUsername('bad space').valid).toBe(false);
      expect(validateAccountUsername('pro.user-09_X').valid).toBe(true);

      // 5. logout() wipes every field and navigates to GATEKEEPER
      const nickSpy = vi.spyOn(gameUI, 'setPlayerNickname');
      const navSpy = vi.spyOn(gameUI, 'navigateTo');
      userProfile.personalRank = { position: 3, elo: 1450, goals: 20, assists: 9, saves: 4 };
      userProfile.logout();

      expect(userProfile.username).toBe('');
      expect(userProfile.displayName).toBe('');
      expect(userProfile.email).toBe('');
      expect(userProfile.nameChanged).toBe(false);
      expect(userProfile.elo).toBe(1000);
      expect(userProfile.stats).toEqual({
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goals: 0,
        assists: 0,
        saves: 0,
        mvpCount: 0
      });
      expect(userProfile.personalRank).toBeNull();
      expect(userProfile.jwt).toBeNull();
      expect(userProfile.refreshToken).toBeNull();
      expect(userProfile.id).toBeNull();
      expect(userProfile.isAuthenticated).toBe(false);
      expect(userProfile.isGuest).toBe(true);
      expect(nickSpy).toHaveBeenCalledWith('');
      expect(navSpy).toHaveBeenCalledWith('GATEKEEPER');
    });
  });

  describe('Proportional 16:9 zoom, HUD overlay compositor & WebM exporter', () => {
    it('computes proportional zoom preserving 16:9 viewport framing', () => {
      expect(computeReplayEffectiveZoom(0.78, 1920, 1080, 1280, 720)).toBeCloseTo(0.52, 4);
      expect(computeReplayEffectiveZoom(1.1, 1280, 720, 1280, 720)).toBeCloseTo(1.1, 4);
      expect(computeReplayEffectiveZoom(1.0, 0, 0, 1280, 720)).toBeCloseTo(1.0, 4);
    });

    it('filters active banners & chat timestamps deterministically', () => {
      const chat = getVisibleReplayChat(
        [
          { t: 1, kind: 'chat', sender: 'A', senderTeam: 'RED', text: 'Uno' },
          { t: 5, kind: 'goal', sender: 'Sys', text: 'Gol!' },
          { t: 25, kind: 'chat', sender: 'B', senderTeam: 'BLUE', text: 'Futuro' }
        ],
        10
      );
      expect(chat.map((c) => c.text)).toEqual(['Uno', 'Gol!']);

      const banners = [
        { t: 0.5, payload: { kind: 'PAUSED' as const, label: 'PAUSA' } },
        { t: 4.0, payload: { kind: 'GOAL' as const, scoringTeam: 'red' as const, scorerName: 'A', speedKmh: 118, isPower: true } }
      ];
      expect(getActiveReplayBanner(banners, 2.5)?.kind).toBe('PAUSED');
      expect(getActiveReplayBanner(banners, 4.5)?.kind).toBe('GOAL');
      expect(getActiveReplayBanner(banners, 9.0)).toBeNull();
    });

    it('renders room card, scoreboard, 30s pulse, Golden Goal metallic gold ball emblem (no card/text), chat & speed-only GOAL banner on Canvas 2D', () => {
      const { ctx, fillTexts, shadowColors, roundRectCalls } = makeMockCanvas2dContext();
      renderReplayHudOverlay(
        ctx,
        {
          roomName: 'Torneo Nocturno',
          phase: MatchPhase.PLAYING,
          matchTimer: 24,
          redScore: 3,
          blueScore: 2,
          isGoldenGoal: false,
          redAcronym: 'RED',
          blueAcronym: 'BLU',
          redColor: '#ef4444',
          blueColor: '#3b82f6',
          chatMessages: [{ t: 1.0, kind: 'chat', sender: 'Ace', senderTeam: 'RED', text: 'Buen pase' }],
          activeBanner: {
            kind: 'GOAL',
            scoringTeam: 'red',
            scorerName: 'Ace',
            assisterName: 'Wing',
            speedKmh: 127.6,
            isPower: true,
            isCurve: true
          },
          currentTimeSec: 3.0
        },
        1280,
        720
      );

      expect(fillTexts.some((t) => t.includes('Torneo Nocturno'))).toBe(true);
      expect(fillTexts.some((t) => t.includes('00:24'))).toBe(true);
      expect(fillTexts.some((t) => t.includes('Ace (Asist: Wing)'))).toBe(true);
      expect(fillTexts.some((t) => t.includes('128 km/h'))).toBe(true);
      expect(fillTexts.some((t) => t.includes('POTENTE'))).toBe(false);
      expect(fillTexts.some((t) => t.includes('EFECTO'))).toBe(false);
      expect(fillTexts.some((t) => t.includes('Buen pase'))).toBe(true);
      // 30s red warning scoreboard pulse remains active
      expect(shadowColors.some((c) => c.includes('239, 68, 68'))).toBe(true);
      expect(roundRectCalls.some(([, , w, h]) => w === 480 && h === 116)).toBe(true);

      // GOAL banner with isPower/isCurve and no positive speedKmh omits badge row cleanly
      const noSpeedGoal = makeMockCanvas2dContext();
      renderReplayHudOverlay(
        noSpeedGoal.ctx,
        {
          roomName: 'Final',
          phase: MatchPhase.PLAYING,
          matchTimer: 90,
          redScore: 1,
          blueScore: 0,
          isGoldenGoal: false,
          redAcronym: 'RED',
          blueAcronym: 'BLU',
          redColor: '#ef4444',
          blueColor: '#3b82f6',
          chatMessages: [],
          activeBanner: {
            kind: 'GOAL',
            scoringTeam: 'red',
            scorerName: 'Ace',
            isPower: true,
            isCurve: true
          },
          currentTimeSec: 5.0
        },
        1280,
        720
      );
      expect(noSpeedGoal.fillTexts.some((t) => t.includes('POTENTE'))).toBe(false);
      expect(noSpeedGoal.fillTexts.some((t) => t.includes('EFECTO'))).toBe(false);
      expect(noSpeedGoal.fillTexts.some((t) => t.includes('km/h'))).toBe(false);
      expect(noSpeedGoal.roundRectCalls.some(([, , w, h]) => w === 480 && h === 86)).toBe(true);

      const gg = makeMockCanvas2dContext();
      renderReplayHudOverlay(
        gg.ctx,
        {
          roomName: 'Final',
          phase: MatchPhase.PLAYING,
          matchTimer: 0,
          redScore: 2,
          blueScore: 2,
          isGoldenGoal: true,
          redAcronym: 'RED',
          blueAcronym: 'BLU',
          redColor: '#ef4444',
          blueColor: '#3b82f6',
          chatMessages: [],
          activeBanner: { kind: 'VICTORY', winner: 'red', redScore: 3, blueScore: 2 },
          currentTimeSec: 12
        },
        1280,
        720
      );
      expect(gg.fillTexts.some((t) => t.includes('GOL DE ORO'))).toBe(false);
      expect(gg.roundRectCalls.some(([, , w, h]) => w === 134 && h === 36)).toBe(false);
      // Gold ball drawn right of scoreboard (centerX=640, barW=336 => right edge=808)
      expect(gg.arcCalls.some(([x, y, r]) => x > 808 && y < 60 && r >= 10)).toBe(true);
      const stopColors = gg.gradientStops.map(([, c]) => c.toUpperCase());
      expect(stopColors).toEqual(
        expect.arrayContaining(['#FEF9C3', '#FACC15', '#CA8A04', '#713F12'])
      );
      expect(gg.fillStyles).toContain('#451A03');
      expect(gg.strokeStyles).toContain('#854D0E');
      expect(gg.shadowColors.some((c) => c.includes('250, 204, 21') || c.includes('251, 191, 36'))).toBe(true);
    });

    it('renders golden soccer ball SVG without GOL DE ORO card/text in ScoreboardHUD while keeping victory text', () => {
      const elementsById = new Map<string, Record<string, unknown>>();
      const makeMockEl = (tag: string, id = '', className = '') => {
        const classSet = new Set(className.split(' ').filter(Boolean));
        const attrs = new Map<string, string>();
        const el: Record<string, unknown> = {
          tagName: tag.toUpperCase(),
          id,
          className,
          style: {} as Record<string, string>,
          dataset: {} as Record<string, string>,
          textContent: '',
          innerHTML: '',
          title: '',
          children: [] as unknown[],
          classList: {
            add: (...cls: string[]) => {
              cls.forEach((c) => classSet.add(c));
              el.className = Array.from(classSet).join(' ');
            },
            remove: (...cls: string[]) => {
              cls.forEach((c) => classSet.delete(c));
              el.className = Array.from(classSet).join(' ');
            },
            toggle: (c: string, force?: boolean) => {
              const next = force !== undefined ? force : !classSet.has(c);
              if (next) classSet.add(c);
              else classSet.delete(c);
              el.className = Array.from(classSet).join(' ');
              return next;
            },
            contains: (c: string) => classSet.has(c)
          },
          setAttribute: (name: string, val: string) => {
            attrs.set(name, val);
          },
          getAttribute: (name: string) => attrs.get(name) ?? null,
          appendChild: (child: Record<string, unknown>) => {
            if (typeof child.id === 'string' && child.id) elementsById.set(child.id, child);
            (el.children as unknown[]).push(child);
            return child;
          },
          removeChild: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        };
        return el;
      };

      const docEl = makeMockEl('html', 'html');
      const bodyEl = makeMockEl('body', 'body');
      const appEl = makeMockEl('div', 'app-root');
      const bannerEl = makeMockEl('header', 'hudTopBanner', 'hud-container hud-top-banner');
      bodyEl.appendChild(appEl);
      appEl.appendChild(bannerEl);

      vi.stubGlobal('document', {
        documentElement: docEl,
        body: bodyEl,
        getElementById: (id: string) => elementsById.get(id) ?? null,
        querySelector: (sel: string) => {
          if (sel === '.hud-top-banner' || sel === '.hud-container') return bannerEl;
          return null;
        },
        querySelectorAll: () => [],
        createElement: (tag: string) => makeMockEl(tag),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      const hud = new ScoreboardHUD();
      try {
        const badge = elementsById.get('goldenGoalBadge') as {
          textContent: string;
          innerHTML: string;
          style: Record<string, string>;
          classList: { contains: (c: string) => boolean };
        };
        expect(badge).toBeDefined();
        expect(badge.textContent).not.toContain('GOL DE ORO');

        // Active Golden Goal overtime: gold ball SVG only, no GOL DE ORO text, no card box
        hud.update(2, 2, 14, true, GameMatchPhase.PLAYING);
        expect(badge.style.display).toBe('inline-flex');
        expect(badge.classList.contains('u-hidden')).toBe(false);
        expect(badge.textContent).not.toContain('GOL DE ORO');
        expect(badge.innerHTML).not.toContain('GOL DE ORO');
        expect(badge.innerHTML).toContain('<svg');
        expect(badge.innerHTML).toContain('#FACC15');
        expect(badge.innerHTML).toContain('#451A03');
        expect(badge.style.background).toBe('transparent');
        expect(badge.style.border).toBe('none');

        // Victory after Golden Goal keeps VICTORIA ROJO / VICTORIA AZUL intact (never GOL DE ORO)
        hud.update(3, 2, 14, true, GameMatchPhase.VICTORY_CELEBRATION, 1);
        expect(badge.style.display).toBe('inline-flex');
        expect(badge.textContent).toBe('VICTORIA ROJO');
        expect(badge.innerHTML).toBe('');
        expect(badge.style.background).toBe('');

        hud.update(2, 3, 0, false, GameMatchPhase.MATCH_ENDED, 2);
        expect(badge.textContent).toBe('VICTORIA AZUL');

        // Normal play hides badge
        hud.update(1, 1, 90, false, GameMatchPhase.PLAYING);
        expect(badge.style.display).toBe('none');
        expect(badge.classList.contains('u-hidden')).toBe(true);
      } finally {
        hud.destroy();
      }
    });

    it('rejects cleanly in exportReplayToWebm when replay has no frames', async () => {
      await expect(
        exportReplayToWebm({
          magic: 'LXR2',
          version: 2,
          createdAt: '2026-11-13T00:00:00.000Z',
          roomName: 'Empty',
          stadiumId: 'clasico',
          durationSeconds: 0,
          redScore: 0,
          blueScore: 0,
          recordingPlayerId: null,
          recordingPlayerName: '',
          cameraZoom: 1,
          viewportWidth: 1280,
          viewportHeight: 720,
          timeLimitSeconds: 180,
          players: [],
          chatMessages: [],
          banners: [],
          goals: [],
          frames: []
        })
      ).rejects.toThrow();
    });
  });
});
