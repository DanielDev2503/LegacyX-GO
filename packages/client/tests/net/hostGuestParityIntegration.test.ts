import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BinaryProtocol,
  DEFAULT_GAMEPLAY_CONFIG,
  EngineInstance,
  MatchPhase,
  applyPredictiveRenderSeparation,
  createStadium,
  type GameStateSnapshot
} from '@legacyx/core';
import { SignalingClient } from '../../src/net/SignalingClient.js';
import { NetworkClient } from '../../src/net/NetworkClient.js';
import { NetworkHost } from '../../src/net/NetworkHost.js';
import { GameApp } from '../../src/net/GameApp.js';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction.js';
import { matchRecorder } from '../../src/recorder/MatchRecorder.svelte.js';
import {
  gameUI,
  DEFAULT_PHYSICS_MODIFIERS,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  isFloatingScoreCategoryEnabled,
  classifyScoreEvent
} from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';

const CLIENT_SRC_DIR = resolve(process.cwd(), 'src');

function readClientFile(relPath: string): string {
  return readFileSync(resolve(CLIENT_SRC_DIR, relPath), 'utf8');
}

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readonly url: string;
  public readyState: number = MockWebSocket.CONNECTING;
  public sentMessages: Array<Record<string, any>> = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public send(data: string): void {
    this.sentMessages.push(JSON.parse(data));
  }

  public close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  public simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  public simulateMessage(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('Task 6: Strict Host & Non-Host Parity Integration', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    gameUI.resetRoomSession();
    gameUI.rooms = [];
    userProfile.logout();
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Items 15, 27, 28: SignalingClient single-socket guard, session identity & room ping probes', () => {
    it('guards ensureConnected() against CONNECTING and OPEN states to avoid duplicate parallel WebSockets', async () => {
      const client = new SignalingClient('ws://localhost:8080', false);
      client.setUserId('user-123');

      const p1 = client.ensureConnected();
      const p2 = client.ensureConnected();
      expect(MockWebSocket.instances.length).toBe(1);

      const ws = MockWebSocket.instances[0]!;
      ws.simulateOpen();
      await Promise.all([p1, p2]);

      await client.ensureConnected();
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('generates stable per-tab clientSessionId and includes userId + clientSessionId in signaling payloads', async () => {
      const clientA = new SignalingClient('ws://localhost:8080', false);
      const clientB = new SignalingClient('ws://localhost:8080', false);
      expect(clientA.clientSessionId).toBeTruthy();
      expect(clientB.clientSessionId).toBe(clientA.clientSessionId);

      clientA.setUserId('user-abc');
      const connectPromise = clientA.ensureConnected();
      const ws = MockWebSocket.instances[0]!;
      ws.simulateOpen();
      await connectPromise;

      clientA.createRoom('Sala Competitiva', 'mediano', 8);
      clientA.joinRoom('room-99', 'pass123');

      const createMsg = ws.sentMessages.find((m) => m.type === 'CREATE_ROOM');
      const joinMsg = ws.sentMessages.find((m) => m.type === 'JOIN_ROOM');
      const identifyMsg = ws.sentMessages.find((m) => m.type === 'IDENTIFY');

      expect(identifyMsg?.userId).toBe('user-abc');
      expect(identifyMsg?.clientSessionId).toBe(clientA.clientSessionId);
      expect(createMsg?.userId).toBe('user-abc');
      expect(createMsg?.clientSessionId).toBe(clientA.clientSessionId);
      expect(joinMsg?.userId).toBe('user-abc');
      expect(joinMsg?.clientSessionId).toBe(clientA.clientSessionId);
    });

    it('immediately replies PONG_PROBE with same probeId, roomId, t0 when server sends PING_PROBE (even while hosting)', async () => {
      const client = new SignalingClient('ws://localhost:8080', false);
      const p = client.ensureConnected();
      const ws = MockWebSocket.instances[0]!;
      ws.simulateOpen();
      await p;

      ws.sentMessages = [];
      ws.simulateMessage({
        type: 'PING_PROBE',
        roomId: 'room-42',
        probeId: 'probe-xyz',
        requesterId: 'peer_guest',
        clientSentAt: 1700000000000,
        t0: 123456
      });

      const pong = ws.sentMessages.find((m) => m.type === 'PONG_PROBE');
      expect(pong).toBeDefined();
      expect(pong!.roomId).toBe('room-42');
      expect(pong!.probeId).toBe('probe-xyz');
      expect(pong!.t0).toBe(123456);
      expect(pong!.requesterId).toBe('peer_guest');
      expect(pong!.clientSentAt).toBe(1700000000000);
    });

    it('probeRoomPing(roomId) resolves with pingMs on ROOM_PING_RESULT and updates GameApp/gameUI availableRooms ping', async () => {
      const client = new SignalingClient('ws://localhost:8080', false);
      const app = new GameApp(client);
      gameUI.availableRooms = [
        {
          id: 'room-live',
          name: 'Arena PRO',
          playersCount: 3,
          maxPlayers: 6,
          ping: 0,
          roomType: 'casual',
          isPrivate: false,
          stadium: 'mediano'
        }
      ];

      const p = client.ensureConnected();
      const ws = MockWebSocket.instances[0]!;
      ws.simulateOpen();
      await p;

      const pingPromise = client.probeRoomPing('room-live');
      const sentProbe = ws.sentMessages.find((m) => m.type === 'ROOM_PING_PROBE');
      expect(sentProbe?.roomId).toBe('room-live');
      expect(typeof sentProbe?.probeId).toBe('string');

      ws.simulateMessage({
        type: 'ROOM_PING_RESULT',
        roomId: 'room-live',
        probeId: sentProbe!.probeId,
        pingMs: 37,
        ping: 37
      });

      const measured = await pingPromise;
      expect(measured).toBe(37);
      expect(gameUI.availableRooms[0]!.ping).toBe(37);
      expect(app.signaling).toBe(client);
    });
  });

  describe('Items 3, 5, 6, 8, 29: gameUI defaults, slidingEventQueue & room lifecycle isolation', () => {
    it('aligns DEFAULT_PHYSICS_MODIFIERS and syncGameplayConfigToModifiers with staminaRegenMoving=false & rate=25 and includes account tab', () => {
      expect(DEFAULT_PHYSICS_MODIFIERS.staminaRegenMoving).toBe(false);
      expect(DEFAULT_PHYSICS_MODIFIERS.staminaRegenMovingRate).toBe(25);
      expect(DEFAULT_PHYSICS_MODIFIERS.boostMultiplier).toBe(DEFAULT_GAMEPLAY_CONFIG.boostMultiplier);
      expect(DEFAULT_PHYSICS_MODIFIERS.dashesPerFullBar).toBe(DEFAULT_GAMEPLAY_CONFIG.dashesPerFullBar);

      gameUI.applyRemoteGameplayConfig({ staminaRegenMoving: undefined as any, staminaRegenMovingRate: undefined as any });
      expect(gameUI.modifiers.staminaRegenMoving).toBe(false);
      expect(gameUI.modifiers.staminaRegenMovingRate).toBe(25);

      gameUI.activeSettingsTab = 'account';
      expect(gameUI.activeSettingsTab).toBe('account');
    });

    it('maintains max 3 stacked events in slidingEventQueue with independent auto-expiry and resets cleanly on resetRoomSession', () => {
      vi.useFakeTimers();
      gameUI.isPracticeMode = true;
      gameUI.isGoldenGoal = true;

      gameUI.pushScoreEvent({ playerName: '', eventType: 'PASE', pointsText: '+10 PTS', color: '#00e5ff', team: 'red' });
      vi.advanceTimersByTime(500);
      gameUI.pushScoreEvent({ playerName: '', eventType: 'TIRO', pointsText: '+15 PTS', color: '#00e5ff', team: 'red' });
      vi.advanceTimersByTime(500);
      gameUI.pushScoreEvent({ playerName: '', eventType: 'ATAJADA', pointsText: '+25 PTS', color: '#00e5ff', team: 'red' });
      expect(gameUI.slidingEventQueue.length).toBe(3);

      // 4th event caps queue at 3 oldest-evicted
      gameUI.pushScoreEvent({ playerName: '', eventType: 'GOL', pointsText: '+100 PTS', color: '#22c55e', team: 'red' });
      expect(gameUI.slidingEventQueue.length).toBe(3);
      expect(gameUI.slidingEventQueue.map((e) => e.eventType)).toEqual(['TIRO', 'ATAJADA', 'GOL']);

      // Earliest (TIRO, pushed at t=500, expires at t=2900) expires independently while ATAJADA & GOL (t=1000, expire at t=3400) remain visible
      vi.advanceTimersByTime(1950);
      expect(gameUI.slidingEventQueue.map((e) => e.eventType)).toEqual(['ATAJADA', 'GOL']);

      gameUI.resetRoomSession();
      expect(gameUI.isPracticeMode).toBe(false);
      expect(gameUI.isGoldenGoal).toBe(false);
      expect(gameUI.slidingEventQueue).toEqual([]);
      expect(gameUI.currentSlidingEvent).toBeNull();
      vi.useRealTimers();
    });

    it('clears isPracticeMode and room/WebRTC state on createRoom/joinRoom/leaveCurrentRoom/logout', async () => {
      const client = new SignalingClient('ws://localhost:8080', false);
      const app = new GameApp(client);
      const p = client.ensureConnected();
      const ws = MockWebSocket.instances[0]!;
      ws.simulateOpen();
      await p;

      app.setupPracticeMode();
      expect(gameUI.isPracticeMode).toBe(true);

      const joinPromise = app.joinRoom('R-100');
      await Promise.resolve();
      await Promise.resolve();
      ws.simulateMessage({ type: 'ROOM_JOINED', roomId: 'R-100', hostPeerId: 'host-peer', stadiumId: 'mediano' });
      const ok = await joinPromise;
      expect(ok).toBe(true);
      expect(gameUI.isPracticeMode).toBe(false);

      app.leaveCurrentRoom();
      expect(gameUI.isPracticeMode).toBe(false);
      expect(app.currentRoomId).toBeNull();
      expect(app.networkClient).toBeNull();
    });
  });

  describe('Items 9 & 26: BinaryProtocol -> NetworkClient -> Prediction & Banner parity', () => {
    it('propagates isGoldenGoal, isNeutralKickoff, and kickoffPossessingTeam through NetworkClient interpolation & prediction', () => {
      const signaling = new SignalingClient('ws://localhost:8080', false);
      const netClient = new NetworkClient(signaling, 'GuestPlayer', 10);

      const s0: GameStateSnapshot = {
        tick: 600,
        phase: 1,
        matchTimer: 180,
        redScore: 1,
        blueScore: 1,
        soundMask: 0,
        kickoffActive: true,
        isGoldenGoal: true,
        isNeutralKickoff: false,
        kickoffPossessingTeam: 'blue',
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0, spin: 0 },
          { id: 1, team: 1, x: -120, y: 0, vx: 0, vy: 0, flags: 0, stamina: 100 },
          { id: 2, team: 2, x: 120, y: 0, vx: 0, vy: 0, flags: 0, stamina: 100 }
        ]
      };
      const s1: GameStateSnapshot = { ...s0, tick: 602, phase: 2 };

      const buf0 = BinaryProtocol.encodeSnapshot(s0);
      const buf1 = BinaryProtocol.encodeSnapshot(s1);
      const dec0 = BinaryProtocol.decodeSnapshot(buf0)!;
      const dec1 = BinaryProtocol.decodeSnapshot(buf1)!;

      netClient.latestSnapshot = dec1;
      netClient.jitterBuffer.push(dec0, 1000);
      netClient.jitterBuffer.push(dec1, 1033);

      const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1035);
      const interp = netClient.jitterBuffer.getInterpolatedState(1015);
      // Verify NetworkClient wrapper patches missing fields onto interpolated snapshots
      const patchedInterp = (() => {
        (netClient as any).jitterBuffer.interpolationDelayMs = 20;
        return netClient.getInterpolatedState();
      })();
      nowSpy.mockRestore();

      expect(dec1.isGoldenGoal).toBe(true);
      expect(dec1.isNeutralKickoff).toBe(false);
      expect(dec1.kickoffPossessingTeam).toBe('blue');
      expect(interp).not.toBeNull();
      expect(patchedInterp).not.toBeNull();
      expect(patchedInterp!.isGoldenGoal).toBe(true);
      expect(patchedInterp!.isNeutralKickoff).toBe(false);
      expect(patchedInterp!.kickoffPossessingTeam).toBe('blue');

      const predEngine = new EngineInstance(createStadium('mediano'));
      const reconciler = new ClientPredictionReconciler();
      reconciler.reconcile(predEngine, dec1, 2);
      expect(predEngine.fsm.isOvertime).toBe(true);
      expect(predEngine.isNeutralKickoff).toBe(false);
      expect(predEngine.kickoffPossessingTeam).toBe('blue');
    });

    it('preserves speedKmh, isPower, isCurve, scorerName, assisterName & isOwnGoal in Host->Non-Host GOAL banner and SCORE_EVENT packets', () => {
      const signaling = new SignalingClient('ws://localhost:8080', false);
      const host = new NetworkHost(signaling, 'HostPro');
      const netClient = new NetworkClient(signaling, 'GuestPro', 7);

      const sentPayloads: any[] = [];
      (host as any).peers.set('guest-peer', {
        sendReliable: (m: any) => sentPayloads.push(m),
        close: () => {}
      });

      host.broadcastMatchBanner({
        kind: 'GOAL',
        scoringTeam: 'red',
        scorerName: 'Striker',
        assisterName: 'Wing',
        isOwnGoal: false,
        redScore: 2,
        blueScore: 1,
        speedKmh: 142,
        isPower: true,
        isCurve: true
      });
      host.broadcastScoreEvent({
        playerId: 7,
        playerName: 'GuestPro',
        team: 'red',
        category: 'power_goal',
        points: 100
      });

      const banners: any[] = [];
      const scoreEvents: any[] = [];
      netClient.onMatchBanner = (b) => banners.push(b);
      netClient.onScoreEvent = (e) => scoreEvents.push(e);

      for (const msg of sentPayloads) {
        (netClient as any).handleReliableMessage(msg);
      }

      expect(banners[0]).toMatchObject({
        kind: 'GOAL',
        scorerName: 'Striker',
        assisterName: 'Wing',
        isOwnGoal: false,
        speedKmh: 142,
        isPower: true,
        isCurve: true
      });
      expect(scoreEvents[0]).toMatchObject({
        playerId: 7,
        playerName: 'GuestPro',
        team: 'red',
        category: 'power_goal',
        points: 100
      });

      host.destroy();
      netClient.disconnect();
    });
  });

  describe('Items 4, 5, 6, 7, 16-27: App.svelte parity wiring', () => {
    it('wires non-sticky turbo input flush, own-only score events without canvas floating text, chatBounds, teamKits, recorder metadata/chat/banner, copy-chat, goal speed & logout guard', () => {
      const appSrc = readClientFile('App.svelte');

      // Item 4: flush zero/non-turbo input on blur, visibilitychange, focusin, modal opening
      expect(appSrc).toContain('visibilitychange');
      expect(appSrc).toContain('focusin');
      expect(appSrc).toContain('releaseAndFlushHeldInputs');

      // Item 5: predEngine & engine practice isolation
      expect(appSrc).toContain('targetEngine.isPracticeMode = Boolean(gameUI.isPracticeMode)');

      // Item 6: own-only score event filter + playerName: '' + no renderer.addFloatingScore
      expect(appSrc).toMatch(/pId\s*!==\s*String\(localId\)/);
      expect(appSrc).toContain('isFloatingScoreCategoryEnabled(gameUI.settings');
      expect(appSrc).toMatch(/playerName:\s*''/);
      expect(appSrc).not.toContain('addFloatingScore');

      // Item 7: chatBounds measurement passed into renderer.setChatBounds
      expect(appSrc).toContain('setChatBounds(');
      expect(appSrc).toContain('.hud-chat-container');

      // Item 9: Golden Goal & kickoff flags synced on HUD & scratchRenderSnapshot
      expect(appSrc).toContain('gameUI.isGoldenGoal');
      expect(appSrc).toContain('scratchRenderSnapshot.isGoldenGoal');
      expect(appSrc).toContain('scratchRenderSnapshot.isNeutralKickoff');
      expect(appSrc).toContain('scratchRenderSnapshot.kickoffPossessingTeam');

      // Items 16-23: Recorder metadata + recordChat + recordBanner
      expect(appSrc).toContain('cameraZoom');
      expect(appSrc).toContain('viewportWidth');
      expect(appSrc).toContain('viewportHeight');
      expect(appSrc).toContain('recordingPlayerId');
      expect(appSrc).toContain('recordingPlayerName');
      expect(appSrc).toContain('timeLimitSeconds');
      expect(appSrc).toContain('matchRecorder.recordChat(');
      expect(appSrc).toContain('matchRecorder.recordBanner(');

      // Item 24: allow Ctrl+C / Cmd+C copy without preventDefault
      expect(appSrc).toMatch(/e\.ctrlKey\s*\|\|\s*e\.metaKey/);

      // Item 25: call renderer.setTeamKits(redActiveKit, blueActiveKit)
      expect(appSrc).toContain('renderer.setTeamKits(redActiveKit, blueActiveKit)');

      // Item 26: forward speedKmh, isPower, isCurve into GOAL banner
      expect(appSrc).toContain('speedKmh:');
      expect(appSrc).toContain('isPower:');
      expect(appSrc).toContain('isCurve:');

      // Item 27: guard Lobby/GATEKEEPER route transition so logout never bounces back to LOBBY
      expect(appSrc).toContain('didAutoRouteAuthenticatedBoot');
      expect(appSrc).toMatch(/REPLAY_VIEWER.*userProfile\.isAuthenticated\s*&&\s*!userProfile\.isGuest/);
    });
  });

  describe('Items 1, 3 & 7: Score event parity, Practice/Stop stats, Host 0ms telemetry & Solid ball migration', () => {
    it('Item 7: migrates legacy saved ballMode=texture + ballSkin=solid to ballMode=color & ballSkin=classic while preserving custom color', () => {
      expect(DEFAULT_SETTINGS.ballSkin).not.toBe('solid');

      const originalStorage = (globalThis as any).localStorage;
      const store = new Map<string, string>();
      const memoryStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => {
          store.clear();
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        }
      };
      (globalThis as any).localStorage = memoryStorage;

      try {
        memoryStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({
            ...DEFAULT_SETTINGS,
            ballMode: 'texture',
            ballSkin: 'solid',
            ballCustomColor: '#ff00aa'
          })
        );
        memoryStorage.setItem('haxball_ball_skin', 'solid');

        gameUI.loadPersistedState();
        expect(gameUI.settings.ballMode).toBe('color');
        expect(gameUI.settings.ballSkin).toBe('classic');
        expect(gameUI.settings.ballCustomColor).toBe('#ff00aa');
        expect(memoryStorage.getItem('haxball_ball_skin')).toBe('classic');
        expect(JSON.parse(memoryStorage.getItem(SETTINGS_STORAGE_KEY)!).ballSkin).toBe('classic');
        expect(JSON.parse(memoryStorage.getItem(SETTINGS_STORAGE_KEY)!).ballMode).toBe('color');

        // Empty custom color falls back cleanly to #ffffff on migration
        memoryStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({
            ...DEFAULT_SETTINGS,
            ballMode: 'texture',
            ballSkin: 'solid',
            ballCustomColor: ''
          })
        );
        gameUI.loadPersistedState();
        expect(gameUI.settings.ballMode).toBe('color');
        expect(gameUI.settings.ballSkin).toBe('classic');
        expect(gameUI.settings.ballCustomColor).toBe('#ffffff');

        // saveSettings also normalizes legacy 'solid' if ever passed programmatically
        gameUI.saveSettings({
          ballMode: 'texture',
          ballSkin: 'solid' as any,
          ballCustomColor: '#00ff88'
        });
        expect(gameUI.settings.ballMode).toBe('color');
        expect(gameUI.settings.ballSkin).toBe('classic');
        expect(gameUI.settings.ballCustomColor).toBe('#00ff88');
      } finally {
        (globalThis as any).localStorage = originalStorage;
      }
    });

    it('Item 3: resets stale telemetry samples on resetRoomSession/enterPracticeMode and wires Host=0ms vs Guest=pingMs in App.svelte renderLoop', () => {
      gameUI.recordTelemetrySample(48, 60);
      gameUI.recordTelemetrySample(62, 60);
      gameUI.realPing = 55;
      expect(gameUI.pingMs).toBe(62);
      expect(gameUI.avgPingMs).toBe(55);

      gameUI.resetRoomSession();
      expect(gameUI.pingMs).toBe(0);
      expect(gameUI.avgPingMs).toBe(0);
      expect(gameUI.pingSampleCount).toBe(0);
      expect(gameUI.pingSamples[0]).toBe(0);

      // Guest PONG_PROBE updates WebRTC RTT; entering practice/reset returns telemetry to 0 ms
      const signaling = new SignalingClient('ws://localhost:8080', false);
      const netClient = new NetworkClient(signaling, 'GuestPing', 2);
      gameUI.isHost = false;
      (netClient as any).handleReliableMessage({
        type: 'PONG_PROBE',
        t: performance.now() - 42
      });
      expect(gameUI.pingMs).toBeGreaterThan(0);

      gameUI.enterPracticeMode();
      expect(gameUI.pingMs).toBe(0);
      expect(gameUI.avgPingMs).toBe(0);

      const appSrc = readClientFile('App.svelte');
      expect(appSrc).toContain('gameUI.recordTelemetrySample(gameUI.isHost ? 0 : gameUI.pingMs');
      netClient.disconnect();
    });

    it('Item 1: classifies all EngineInstance score_event categories & labels, enforces playable Practice startup, and wires Host/Guest score & stop-match stats parity', () => {
      expect(
        classifyScoreEvent({
          category: 'goal',
          text: '¡Gol de Potencia! +150',
          points: 150
        })
      ).toEqual({
        filterCat: 'goal',
        eventType: 'GOL POTENCIA',
        pointsText: '+150 PTS'
      });

      expect(
        classifyScoreEvent({
          category: 'goal',
          text: '¡Gol de Efecto! +150',
          points: 150
        })
      ).toEqual({
        filterCat: 'goal',
        eventType: 'GOL EFECTO',
        pointsText: '+150 PTS'
      });

      expect(
        classifyScoreEvent({
          category: 'assist',
          text: 'Asistencia con Efecto +70',
          points: 70
        })
      ).toEqual({
        filterCat: 'assist',
        eventType: 'ASISTENCIA EFECTO',
        pointsText: '+70 PTS'
      });

      expect(
        classifyScoreEvent({
          category: 'ownGoal',
          text: 'Autogol -50',
          points: -50
        })
      ).toEqual({
        filterCat: 'ownGoal',
        eventType: 'AUTOGOL',
        pointsText: '-50 PTS'
      });

      expect(
        classifyScoreEvent({
          category: 'shot',
          text: 'Tiro al arco +20',
          points: 20
        })
      ).toEqual({
        filterCat: 'shot',
        eventType: 'TIRO',
        pointsText: '+20 PTS'
      });

      expect(
        classifyScoreEvent({
          category: 'pass',
          text: 'Pase completado +10',
          points: 10
        })
      ).toEqual({
        filterCat: 'pass',
        eventType: 'PASE',
        pointsText: '+10 PTS'
      });

      expect(
        classifyScoreEvent({
          category: 'save',
          text: 'Atajada +100',
          points: 100
        })
      ).toEqual({
        filterCat: 'save',
        eventType: 'ATAJADA',
        pointsText: '+100 PTS'
      });

      expect(
        classifyScoreEvent({
          category: 'hattrick',
          text: '¡Hattrick Bonus +100!',
          points: 100
        })
      ).toEqual({
        filterCat: 'hattrick',
        eventType: 'HATTRICK',
        pointsText: '+100 PTS'
      });

      // Enter Practice Mode directly into active playable state (no blocking TEAM_MANAGEMENT modal)
      gameUI.enterPracticeMode();
      expect(gameUI.isPracticeMode).toBe(true);
      expect(gameUI.fsmPhase).toBe('PLAYING');
      expect(gameUI.matchPhase).toBe(2);
      expect(gameUI.activeModal).toBe('NONE');
      expect(gameUI.pingMs).toBe(0);

      // App.svelte activates practice EngineInstance, maps Guest localPlayerId fallback, preserves stats on stopMatch when actions occurred
      const appSrc = readClientFile('App.svelte');
      expect(appSrc).toContain('classifyScoreEvent(ev)');
      expect(appSrc).toContain('gameApp.networkClient?.localPlayerId');
      expect(appSrc).toContain('activatePracticeEngine');
      expect(appSrc).toContain('startMatch(false)');
      expect(appSrc).toContain('fsm.startPlaying()');
      expect(appSrc).toContain('hasMatchActivity');
      expect(appSrc).toContain('gameApp.networkHost?.broadcastMatchStats(');
    });

    it('Item 1: strictly keeps Ranked DB submission gated on roomType=ranked && !isPracticeMode', () => {
      const client = new SignalingClient('ws://localhost:8080', false);
      const app = new GameApp(client);
      const sendSpy = vi.spyOn(client, 'send').mockImplementation(() => {});

      (app as any).isHost = true;
      (app as any).currentRoomId = 'R-RANK';
      (app as any).activeMatchToken = 'tok-123';
      (app as any).networkHost = new NetworkHost(client, 'HostUser');
      userProfile.jwt = 'jwt-test-token';

      gameUI.isPracticeMode = true;
      gameUI.roomType = 'ranked';
      app.reportRankedMatchIfEligible({
        stadiumId: 'mediano',
        durationSeconds: 60,
        redScore: 2,
        blueScore: 0,
        winner: 'red',
        stats: [],
        mvpPlayerId: '1'
      });
      expect(sendSpy).not.toHaveBeenCalled();

      gameUI.isPracticeMode = false;
      gameUI.roomType = 'casual';
      app.reportRankedMatchIfEligible({
        stadiumId: 'mediano',
        durationSeconds: 60,
        redScore: 2,
        blueScore: 0,
        winner: 'red',
        stats: [],
        mvpPlayerId: '1'
      });
      expect(sendSpy).not.toHaveBeenCalled();

      // Ranked real match reports cleanly
      gameUI.isPracticeMode = false;
      gameUI.roomType = 'ranked';
      app.reportRankedMatchIfEligible({
        stadiumId: 'mediano',
        durationSeconds: 60,
        redScore: 2,
        blueScore: 0,
        winner: 'red',
        stats: [],
        mvpPlayerId: '1'
      });
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RANKED_MATCH_REPORT',
          roomId: 'R-RANK'
        })
      );

      // Casual + Practice categories stay enabled via floating settings regardless of mode
      expect(isFloatingScoreCategoryEnabled(gameUI.settings, 'goal')).toBe(true);
      expect(isFloatingScoreCategoryEnabled(gameUI.settings, 'shot')).toBe(true);
      expect(isFloatingScoreCategoryEnabled(gameUI.settings, 'pass')).toBe(true);
      expect(isFloatingScoreCategoryEnabled(gameUI.settings, 'save')).toBe(true);
    });

    it('Item 1: delivers Host->Guest SCORE_EVENT & MATCH_STATS_SUMMARY to Non-Host HUD sliding queue & post-match STATS slide', () => {
      const signaling = new SignalingClient('ws://localhost:8080', false);
      const host = new NetworkHost(signaling, 'HostPro');
      const netClient = new NetworkClient(signaling, 'GuestTwo', 2);
      const sentPayloads: any[] = [];
      (host as any).peers.set('guest-2', {
        sendReliable: (m: any) => sentPayloads.push(m),
        close: () => {}
      });

      gameUI.isHost = false;
      gameUI.localPlayerId = 2;
      gameUI.rosterPlayers = [
        { id: 1, peerId: 'host', nickname: 'HostPro', name: 'HostPro', team: 'red', number: 1, isAdmin: true, isHost: true, avatar: 'H', ping: 0 },
        { id: 2, peerId: 'guest-2', nickname: 'GuestTwo', name: 'GuestTwo', team: 'blue', number: 2, isAdmin: false, isHost: false, avatar: 'G', ping: 30 }
      ];

      netClient.onScoreEvent = (ev) => {
        const localId = gameUI.localPlayerId || netClient.localPlayerId || 0;
        const pId = String(ev.playerId ?? '');
        if (!localId || !pId || pId !== String(localId)) return;
        const { filterCat, eventType, pointsText } = classifyScoreEvent(ev);
        if (!isFloatingScoreCategoryEnabled(gameUI.settings, filterCat)) return;
        gameUI.pushScoreEvent({
          playerName: '',
          eventType,
          pointsText,
          color: String(ev.color || '#00e5ff'),
          team: 'blue'
        });
      };

      // Host broadcasts score event for Host (ignored on Guest) and for Guest (shown on Guest)
      host.broadcastScoreEvent({
        playerId: '1',
        team: 'red',
        category: 'shot',
        text: 'Tiro al arco +20',
        points: 20,
        color: '#ffbe0b'
      });
      host.broadcastScoreEvent({
        playerId: '2',
        team: 'blue',
        category: 'goal',
        text: '¡Gol de Potencia! +150',
        points: 150,
        color: '#ffd700'
      });
      host.broadcastMatchStats(
        { redScore: 0, blueScore: 1, matchDuration: 35, winner: 'blue', winnerTeamName: 'BLUE' },
        [{ playerId: '2', nickname: 'GuestTwo', team: 'blue', goals: 1, assists: 0, saves: 0, shots: 1, passes: 0, touches: 1, points: 150 }],
        { playerId: '2', nickname: 'GuestTwo', team: 'blue', points: 150 },
        [],
        [{ playerId: '2', nickname: 'GuestTwo', team: 'blue', goals: 1, points: 150 }]
      );

      for (const msg of sentPayloads) {
        (netClient as any).handleReliableMessage(msg);
      }

      expect(gameUI.slidingEventQueue.length).toBe(1);
      expect(gameUI.slidingEventQueue[0]!.eventType).toBe('GOL POTENCIA');
      expect(gameUI.slidingEventQueue[0]!.pointsText).toBe('+150 PTS');
      expect(gameUI.hasCompletedMatch).toBe(true);
      expect(gameUI.activeSlide).toBe('STATS');
      expect(gameUI.activeModal).toBe('TEAM_SELECT');
      expect((gameUI.lastMatchStats as any)?.blueScore).toBe(1);
      expect(gameUI.blueTeamStats.length).toBe(1);

      host.destroy();
      netClient.disconnect();
    });
  });

  describe('Wave-3 Integration: GOAL_REPLAY + Zero Overlap + LXR3 Timeline + Guest Auth Gating', () => {
    it('wires userProfile auth reader into gameUI so guests fall back cleanly without circular imports', () => {
      userProfile.isAuthenticated = false;
      userProfile.isGuest = true;
      gameUI.settings.ballMode = 'color';
      gameUI.settings.ballSkin = 'wc2026';
      gameUI.settings.ballCustomColor = '#ff00aa';
      (gameUI.settings as any).scoreboardDesign = 'wc2026';

      expect(gameUI.isAuthenticatedUser).toBe(false);
      expect(gameUI.effectiveBallMode).toBe('texture');
      expect(gameUI.effectiveBallSkin).toBe('classic');
      expect(gameUI.effectiveBallCustomColor).toBe('#ffffff');
      expect(gameUI.effectiveScoreboardDesign).toBe('original');

      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      expect(gameUI.isAuthenticatedUser).toBe(true);
      expect(gameUI.effectiveBallMode).toBe('color');
      expect(gameUI.effectiveBallSkin).toBe('wc2026');
      expect(gameUI.effectiveBallCustomColor).toBe('#ff00aa');
      expect(gameUI.effectiveScoreboardDesign).toBe('wc2026');

      const profileSrc = readClientFile('ui/state/userProfile.svelte.ts');
      expect(profileSrc).toContain('gameUI.setAuthStatusReader(');
    });

    it('synchronizes GOAL_REPLAY + scorer-only skipGoalReplay across Host, Guest, and App.svelte wiring', () => {
      const app = new GameApp();
      const engine = new EngineInstance('mediano');
      engine.setPlayerTeam(1, 'red');
      engine.setPlayerTeam(2, 'blue');
      engine.startMatch(false);
      engine.fsm.startPlaying();

      gameUI.isHost = true;
      gameUI.isPracticeMode = false;
      gameUI.localPlayerId = 1;
      app.attachHostEngine(engine);

      // Force goal scored by player 2 while local host is player 1
      engine.lastGoalScorerId = 2;
      (engine as any).goalReplayClip = [engine.getState()];
      (engine as any).goalReplayCursor = 0;
      (engine.fsm as any).state = MatchPhase.GOAL_REPLAY;
      gameUI.handleMatchPhaseTransition(MatchPhase.GOAL_REPLAY);
      gameUI.activeGoalScorerId = 2;

      // Non-scorer local host cannot skip another player's goal replay
      expect(app.skipGoalReplay()).toBe(false);
      expect(engine.fsm.state).toBe(MatchPhase.GOAL_REPLAY);

      // Scorer can skip and resets activeGoalScorerId
      gameUI.localPlayerId = 2;
      expect(app.skipGoalReplay()).toBe(true);
      expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);
      gameUI.handleMatchPhaseTransition(MatchPhase.KICKOFF);
      expect(gameUI.activeGoalScorerId).toBeNull();

      // Guest onGoalScorerIdChanged syncs activeGoalScorerId and resets on KICKOFF/STOP
      const signaling = new SignalingClient('ws://localhost:8080', false);
      const netClient = new NetworkClient(signaling, 'GuestTwo', 2);
      const sentSkip: any[] = [];
      (netClient as any).peer = {
        sendReliable: (msg: any) => sentSkip.push(msg),
        close: () => {}
      };
      netClient.onGoalScorerIdChanged = (scorerId) => {
        gameUI.activeGoalScorerId = scorerId;
      };
      (netClient as any).handleReliableMessage({
        type: 'ROOM_STATE_SYNC',
        matchPhase: MatchPhase.GOAL_REPLAY,
        lastGoalScorerId: 2,
        playersList: []
      });
      expect(gameUI.activeGoalScorerId).toBe(2);
      netClient.sendSkipGoalReplay();
      expect(sentSkip).toEqual([{ type: 'SKIP_GOAL_REPLAY' }]);

      gameUI.handleMatchPhaseTransition(MatchPhase.STOP);
      expect(gameUI.activeGoalScorerId).toBeNull();

      const appSrc = readClientFile('App.svelte');
      expect(appSrc).toContain('gameApp.attachHostEngine(engine)');
      expect(appSrc).toContain('MatchPhase.GOAL_REPLAY');
      expect(appSrc).toContain('gameApp.skipGoalReplay(');
      expect(appSrc).toContain('renderer.focusBallOnly = gameUI.isFocusingBall || liveRenderPhase === MatchPhase.GOAL_REPLAY');

      netClient.disconnect();
    });

    it('wires applyPredictiveRenderSeparation, effectiveExtrapolationMs, and effectiveBall visuals in App.svelte', () => {
      const localDisc = { x: 10, y: 0, vx: 120, vy: 0, radius: 15 };
      const remoteOther = [
        { id: 0, team: 0, x: 18, y: 0, vx: 0, vy: 0, radius: 5.8 },
        { id: 2, team: 2, x: 25, y: 0, vx: 0, vy: 0, radius: 15 }
      ];
      applyPredictiveRenderSeparation(localDisc, remoteOther, 420, 200);
      expect(localDisc.x).toBeLessThan(10);
      expect(remoteOther[0]!.x).toBe(18);
      expect(remoteOther[1]!.x).toBe(25);

      const signaling = new SignalingClient('ws://localhost:8080', false);
      const netClient = new NetworkClient(signaling, 'GuestExtrapolation', 2);
      gameUI.settings.autoExtrapolation = true;
      gameUI.pingMs = 120;
      netClient.setAutoExtrapolationMs(gameUI.effectiveExtrapolationMs);
      expect((netClient as any).autoExtrapolationMs).toBe(gameUI.effectiveExtrapolationMs);

      const appSrc = readClientFile('App.svelte');
      expect(appSrc).toContain('applyPredictiveRenderSeparation(');
      expect(appSrc).toContain('gameApp.networkClient.setAutoExtrapolationMs(effExtrapMs)');
      expect(appSrc).toContain('gameUI.effectiveBallSkin');
      expect(appSrc).toContain('gameUI.effectiveBallMode');
      expect(appSrc).toContain('gameUI.effectiveBallCustomColor');

      netClient.disconnect();
    });

    it('wires full LXR3 HUD timeline metadata and events into MatchRecorder', () => {
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      gameUI.roomType = 'ranked';
      gameUI.isPracticeMode = false;
      (gameUI.settings as any).scoreboardDesign = 'wc2022';
      gameUI.settings.theme = 'light';
      gameUI.settings.ballMode = 'color';
      gameUI.settings.ballSkin = 'wc2022';
      gameUI.settings.ballCustomColor = '#38bdf8';

      matchRecorder.start(null, {
        roomName: 'Copa LXR3',
        roomType: 'ranked',
        stadiumId: 'mediano',
        scoreboardDesign: 'wc2022',
        theme: 'light',
        ballMode: 'color',
        ballSkin: 'wc2022',
        ballCustomColor: '#38bdf8',
        chatOpacity: 0.75,
        minimapEnabled: true,
        minimapOpacity: 0.55,
        minimapSize: 'large',
        minimapCameraFrustum: false
      });

      matchRecorder.recordFrame({
        tick: 1,
        phase: MatchPhase.PLAYING,
        matchTimer: 5,
        redScore: 1,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 }]
      });
      matchRecorder.recordTelemetry(28, 120);
      matchRecorder.recordScoreEvent({
        kind: 'GOL',
        points: 100,
        label: 'GOL',
        playerName: 'CapRojo',
        team: 'red',
        color: '#ff0055'
      });
      matchRecorder.recordUiOverlay({
        overlay: 'NONE',
        activeSlide: 'MENU',
        isPaused: false,
        postMatchStats: null
      });

      const clip = matchRecorder.stop();
      expect(clip?.magic).toBe('LXR3');
      if (clip?.magic !== 'LXR3') throw new Error('Expected LXR3');
      expect(clip.roomType).toBe('ranked');
      expect(clip.scoreboardDesign).toBe('wc2022');
      expect(clip.theme).toBe('light');
      expect(clip.ballMode).toBe('color');
      expect(clip.ballCustomColor).toBe('#38bdf8');
      expect(clip.hudEvents.some((e) => e.type === 'telemetry')).toBe(true);
      expect(clip.hudEvents.some((e) => e.type === 'score_event')).toBe(true);
      expect(clip.hudEvents.some((e) => e.type === 'ui_overlay')).toBe(true);

      const appSrc = readClientFile('App.svelte');
      expect(appSrc).toContain('gameUI.onHudStateChange =');
      expect(appSrc).toContain('matchRecorder.recordTelemetry(');
      expect(appSrc).toContain('matchRecorder.recordScoreEvent(');
      expect(appSrc).toContain('matchRecorder.recordUiOverlay(');
      expect(appSrc).toContain('scoreboardDesign: gameUI.effectiveScoreboardDesign');
    });
  });
});
