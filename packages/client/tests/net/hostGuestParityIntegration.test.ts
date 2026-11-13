import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BinaryProtocol,
  DEFAULT_GAMEPLAY_CONFIG,
  EngineInstance,
  createStadium,
  type GameStateSnapshot
} from '@legacyx/core';
import { SignalingClient } from '../../src/net/SignalingClient.js';
import { NetworkClient } from '../../src/net/NetworkClient.js';
import { NetworkHost } from '../../src/net/NetworkHost.js';
import { GameApp } from '../../src/net/GameApp.js';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction.js';
import { gameUI, DEFAULT_PHYSICS_MODIFIERS } from '../../src/ui/state/gameUI.svelte.js';
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
});
