import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EngineInstance,
  INPUT_FLAG_RIGHT,
  MatchPhase,
  type GameStateSnapshot
} from '@legacyx/core';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction.js';
import { NetworkHost } from '../../src/net/NetworkHost.js';
import { NetworkClient } from '../../src/net/NetworkClient.js';
import { GameApp } from '../../src/net/GameApp.js';
import { SignalingClient } from '../../src/net/SignalingClient.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public sentMessages: Array<Record<string, any>> = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sentMessages.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  simulateMessage(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

interface MockChannel {
  label: string;
  readyState: 'connecting' | 'open' | 'closed';
  binaryType: string;
  bufferedAmount: number;
  sent: Array<string | ArrayBuffer>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
}

function createMockChannel(label: string): MockChannel {
  const ch: MockChannel = {
    label,
    readyState: 'connecting',
    binaryType: 'arraybuffer',
    bufferedAmount: 0,
    sent: [],
    send: vi.fn((data: any) => ch.sent.push(data)),
    close: vi.fn(() => {
      ch.readyState = 'closed';
    }),
    onopen: null,
    onclose: null,
    onmessage: null
  };
  return ch;
}

describe('Goal Replay Synchronization, Scorer-Only Skip, Prediction & Auto-Extrapolation', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalRTC = (globalThis as any).RTCPeerConnection;
  const originalSessionDesc = (globalThis as any).RTCSessionDescription;
  const originalIceCandidate = (globalThis as any).RTCIceCandidate;
  let mockPcList: any[] = [];

  beforeEach(() => {
    MockWebSocket.instances = [];
    mockPcList = [];
    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).RTCSessionDescription = function (d: any) {
      return d;
    };
    (globalThis as any).RTCIceCandidate = function (c: any) {
      return c;
    };
    (globalThis as any).RTCPeerConnection = function () {
      const channels: Record<string, MockChannel> = {};
      const pc: any = {
        channels,
        remoteDescription: null,
        localDescription: null,
        iceConnectionState: 'new',
        connectionState: 'new',
        signalingState: 'stable',
        createDataChannel: vi.fn((label: string) => {
          const dc = createMockChannel(label);
          channels[label] = dc;
          return dc;
        }),
        createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'mock-offer' })),
        createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'mock-answer' })),
        setLocalDescription: vi.fn(async (d: any) => {
          pc.localDescription = d;
        }),
        setRemoteDescription: vi.fn(async (d: any) => {
          pc.remoteDescription = d;
        }),
        addIceCandidate: vi.fn(async () => {}),
        close: vi.fn(() => {
          pc.connectionState = 'closed';
        }),
        onicecandidate: null,
        oniceconnectionstatechange: null,
        onconnectionstatechange: null,
        ondatachannel: null,
        simulateIncomingDataChannel(label: string) {
          const dc = createMockChannel(label);
          channels[label] = dc;
          pc.ondatachannel?.({ channel: dc });
          return dc;
        }
      };
      mockPcList.push(pc);
      return pc;
    };
    gameUI.resetRoomSession();
    gameUI.isHost = true;
    gameUI.localPlayerId = 1;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (globalThis as any).WebSocket = originalWebSocket;
    (globalThis as any).RTCPeerConnection = originalRTC;
    (globalThis as any).RTCSessionDescription = originalSessionDesc;
    (globalThis as any).RTCIceCandidate = originalIceCandidate;
  });

  async function connectSignaling(peerId: string) {
    const sig = new SignalingClient('ws://localhost:8080', false);
    const p = sig.ensureConnected();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: 'WELCOME', peerId, iceServers: [] });
    await p;
    return { sig, ws };
  }

  describe('1. Goal Replay Synchronization & Scorer-Only Skip', () => {
    it('NetworkHost includes lastGoalScorerId & scorerPlayerId in ROOM_STATE_SYNC and MATCH_BANNER_EVENT and authoritatively validates SKIP_GOAL_REPLAY', async () => {
      const { sig: hostSig, ws: hostWs } = await connectSignaling('host-1');
      const host = new NetworkHost(hostSig, 'Anfitrion', { peerId: 'host-1' });

      const skipSpy = vi.fn(() => true);
      const mockEngine = {
        lastGoalScorerId: 2,
        skipGoalReplay: skipSpy
      };
      (host as any).engine = mockEngine;

      // Connect two remote guests (playerId 2 = scorer, playerId 3 = non-scorer admin)
      hostWs.simulateMessage({ type: 'PEER_JOINED', peerId: 'guest-scorer', nickname: 'Scorer' });
      await vi.waitFor(() => expect(mockPcList.length).toBe(1));
      const pcScorer = mockPcList[0]!;
      pcScorer.channels.game.readyState = 'open';
      pcScorer.channels.reliable.readyState = 'open';
      pcScorer.iceConnectionState = 'connected';
      pcScorer.oniceconnectionstatechange?.();

      hostWs.simulateMessage({ type: 'PEER_JOINED', peerId: 'guest-other', nickname: 'Other' });
      await vi.waitFor(() => expect(mockPcList.length).toBe(2));
      const pcOther = mockPcList[1]!;
      pcOther.channels.game.readyState = 'open';
      pcOther.channels.reliable.readyState = 'open';
      pcOther.iceConnectionState = 'connected';
      pcOther.oniceconnectionstatechange?.();

      // Clear initial messages, then broadcast ROOM_STATE_SYNC and MATCH_BANNER_EVENT
      pcScorer.channels.reliable.sent = [];
      pcOther.channels.reliable.sent = [];
      host.matchPhase = 3.5;
      host.broadcastRoomStateSync(true);
      host.broadcastMatchBanner({ kind: 'GOAL', scoringTeam: 'red', scorerName: 'Scorer' });

      const sentPayloads = pcScorer.channels.reliable.sent.map((raw: string) => JSON.parse(raw));
      const syncMsg = sentPayloads.find((m: any) => m.type === 'ROOM_STATE_SYNC');
      const bannerMsg = sentPayloads.find((m: any) => m.type === 'MATCH_BANNER_EVENT');

      expect(syncMsg).toBeDefined();
      expect(syncMsg.lastGoalScorerId).toBe(2);
      expect(syncMsg.scorerPlayerId).toBe(2);

      expect(bannerMsg).toBeDefined();
      expect(bannerMsg.lastGoalScorerId).toBe(2);
      expect(bannerMsg.scorerPlayerId).toBe(2);

      // Non-scorer (player 3) tries to skip (even spoofing playerId: 2) -> MUST BE REJECTED
      pcOther.channels.reliable.onmessage?.({
        data: JSON.stringify({ type: 'SKIP_GOAL_REPLAY', playerId: 2 })
      });
      expect(skipSpy).not.toHaveBeenCalled();

      // Actual scorer (player 2) sends SKIP_GOAL_REPLAY -> MUST SUCCEED
      pcScorer.channels.reliable.onmessage?.({
        data: JSON.stringify({ type: 'SKIP_GOAL_REPLAY' })
      });
      expect(skipSpy).toHaveBeenCalledTimes(1);
      expect(skipSpy).toHaveBeenCalledWith(2);

      host.destroy();
    });

    it('NetworkClient tracks activeGoalScorerId, notifies onGoalScorerIdChanged, resets on KICKOFF/STOP, and sends SKIP_GOAL_REPLAY over reliableChannel', async () => {
      const { sig: clientSig } = await connectSignaling('guest-2');
      const client = new NetworkClient(clientSig, 'Scorer', 9);
      const changes: Array<number | null> = [];
      client.onGoalScorerIdChanged = (id) => changes.push(id);

      await client.connectToHost('host-1');
      const pc = mockPcList[0]!;
      const gameDc = pc.simulateIncomingDataChannel('game');
      const reliableDc = pc.simulateIncomingDataChannel('reliable');
      gameDc.readyState = 'open';
      reliableDc.readyState = 'open';
      pc.iceConnectionState = 'connected';
      pc.oniceconnectionstatechange?.();

      // Receive MATCH_BANNER_EVENT with scorerPlayerId = 2
      reliableDc.onmessage?.({
        data: JSON.stringify({
          type: 'MATCH_BANNER_EVENT',
          lastGoalScorerId: 2,
          scorerPlayerId: 2,
          banner: { kind: 'GOAL', scoringTeam: 'red', scorerName: 'Scorer' }
        })
      });
      expect(client.activeGoalScorerId).toBe(2);
      expect(changes).toEqual([2]);

      // Send skip over reliable channel
      reliableDc.sent = [];
      client.sendSkipGoalReplay();
      expect(reliableDc.sent.length).toBe(1);
      expect(JSON.parse(String(reliableDc.sent[0]))).toEqual({ type: 'SKIP_GOAL_REPLAY' });

      // Reset on KICKOFF (1)
      reliableDc.onmessage?.({
        data: JSON.stringify({
          type: 'ROOM_STATE_SYNC',
          assignedPlayerId: 2,
          playersList: [],
          matchPhase: 1,
          lastGoalScorerId: null
        })
      });
      expect(client.activeGoalScorerId).toBeNull();
      expect(changes).toEqual([2, null]);

      // Re-set during GOAL_REPLAY (3.5), then reset on STOP (0)
      reliableDc.onmessage?.({
        data: JSON.stringify({
          type: 'ROOM_STATE_SYNC',
          assignedPlayerId: 2,
          playersList: [],
          matchPhase: 3.5,
          lastGoalScorerId: 2,
          scorerPlayerId: 2
        })
      });
      expect(client.activeGoalScorerId).toBe(2);

      reliableDc.onmessage?.({
        data: JSON.stringify({
          type: 'ROOM_STATE_SYNC',
          assignedPlayerId: 2,
          playersList: [],
          matchPhase: 0
        })
      });
      expect(client.activeGoalScorerId).toBeNull();

      client.disconnect();
    });

    it('GameApp.skipGoalReplay() enforces scorer-only check on Host and delegates to networkClient.sendSkipGoalReplay() on Guest', async () => {
      const { sig } = await connectSignaling('host-app');
      const app = new GameApp(sig);

      // Host path: local player 1 did NOT score (player 2 scored) -> blocked
      app.isHost = true;
      gameUI.isHost = true;
      gameUI.isPracticeMode = false;
      gameUI.localPlayerId = 1;
      const hostSkipFn = vi.fn(() => true);
      const mockEngine = {
        lastGoalScorerId: 2,
        isPracticeMode: false,
        skipGoalReplay: hostSkipFn
      };
      (app as any).hostEngine = mockEngine;

      expect(app.skipGoalReplay()).toBe(false);
      expect(hostSkipFn).not.toHaveBeenCalled();

      // Host path: local player 1 IS scorer -> executes skipGoalReplay(1)
      mockEngine.lastGoalScorerId = 1;
      expect(app.skipGoalReplay()).toBe(true);
      expect(hostSkipFn).toHaveBeenCalledWith(1);

      // Guest path: delegates to networkClient.sendSkipGoalReplay()
      app.isHost = false;
      gameUI.isHost = false;
      const sendSkipSpy = vi.fn();
      app.networkClient = { sendSkipGoalReplay: sendSkipSpy } as any;
      expect(app.skipGoalReplay()).toBe(true);
      expect(sendSkipSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Non-Host Prediction & Auto-Extrapolation Scaling', () => {
    it('NetworkClient.setAutoExtrapolationMs updates jitterBuffer smoothly and syncs phase 3.5 without frozen pause', async () => {
      const { sig } = await connectSignaling('guest-extrap');
      const client = new NetworkClient(sig, 'Guest', 7);

      const initialDelay = client.jitterBuffer.interpolationDelayMs;
      client.setAutoExtrapolationMs(80);
      expect(client.autoExtrapolationMs).toBe(80);
      expect((client.jitterBuffer as any).autoExtrapolationMs).toBe(80);
      // Smoothly blends interpolationDelayMs rather than abrupt 0 -> max jump
      expect(client.jitterBuffer.interpolationDelayMs).toBeGreaterThan(initialDelay);
      expect(client.jitterBuffer.interpolationDelayMs).toBeLessThan(80);

      // Clamps out-of-range values
      client.setAutoExtrapolationMs(-50);
      expect(client.autoExtrapolationMs).toBe(0);

      await client.connectToHost('host-1');
      const pc = mockPcList[0]!;
      const gameDc = pc.simulateIncomingDataChannel('game');
      const reliableDc = pc.simulateIncomingDataChannel('reliable');
      gameDc.readyState = 'open';
      reliableDc.readyState = 'open';
      pc.iceConnectionState = 'connected';
      pc.oniceconnectionstatechange?.();

      // Sync phase 3.5 (GOAL_REPLAY) -> jitterBuffer must NOT be 'PAUSED'
      reliableDc.onmessage?.({
        data: JSON.stringify({
          type: 'ROOM_STATE_SYNC',
          assignedPlayerId: 2,
          playersList: [],
          matchPhase: 3.5,
          lastGoalScorerId: 2
        })
      });
      expect(client.jitterBuffer.currentMatchState).toBe(3.5);
      expect(client.jitterBuffer.currentMatchState).not.toBe('PAUSED');

      client.disconnect();
    });

    it('ClientPredictionReconciler hard-syncs and clears inputBuffer during phase 3.5 (GOAL_REPLAY) and frozen phases', () => {
      const reconciler = new ClientPredictionReconciler();
      const engine = new EngineInstance('AF 3v3');
      engine.startMatch(false);
      const p = engine.addPlayer(2, 'blue');
      p.pos.set(150, 40);

      reconciler.recordInput(1, INPUT_FLAG_RIGHT);
      reconciler.recordInput(2, INPUT_FLAG_RIGHT);
      reconciler.visualOffset.x = 12;
      reconciler.visualOffset.y = -5;

      const replaySnap: GameStateSnapshot = {
        tick: 120,
        phase: 3.5, // MatchPhase.GOAL_REPLAY
        matchTimer: 30,
        redScore: 1,
        blueScore: 0,
        soundMask: 0,
        discs: [
          {
            id: 0,
            team: 0,
            x: 390,
            y: 12,
            vx: 250,
            vy: -30,
            flags: 0
          },
          {
            id: 2,
            team: 2,
            x: -80,
            y: 25,
            vx: 110,
            vy: 0,
            flags: 0,
            stamina: 92
          }
        ]
      };

      const res = reconciler.reconcile(engine, replaySnap, 2);
      expect(res.replayed).toBe(false);
      expect(res.hardSnapped).toBe(true);
      expect(reconciler.inputBuffer).toHaveLength(0);
      expect(reconciler.visualOffset).toEqual({ x: 0, y: 0 });
      expect(engine.players.get(2)!.pos.x).toBe(-80);
      expect(engine.players.get(2)!.pos.y).toBe(25);
    });

    it('ClientPredictionReconciler monotonic lastRecordedSeq guard prevents sequence regression after slice(-45) at high RTT', () => {
      const reconciler = new ClientPredictionReconciler();
      const engine = new EngineInstance('AF 3v3');
      engine.startMatch(false);
      engine.addPlayer(1, 'red');

      // Simulate 60 ticks of unacked inputs (> MAX_REPLAY_TICKS = 45, e.g. 1000ms RTT)
      for (let t = 1; t <= 60; t++) {
        reconciler.recordInput(t, INPUT_FLAG_RIGHT);
      }
      expect(reconciler.lastRecordedSeq).toBe(60);

      // Authoritative snapshot only acked tick 10
      const authSnap: GameStateSnapshot = {
        tick: 10,
        phase: MatchPhase.PLAYING,
        matchTimer: 170,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          {
            id: 1,
            team: 1,
            x: -100,
            y: 0,
            vx: 0,
            vy: 0,
            flags: 0,
            stamina: 100,
            lastAckedInputSeq: 10
          }
        ]
      };

      // reconcile trims inputBuffer from 50 -> 45 entries (ticks 16..60) and replays 45 ticks
      reconciler.reconcile(engine, authSnap, 1);
      expect(reconciler.inputBuffer).toHaveLength(45);
      // engine.currentTick must NOT regress below lastRecordedSeq (10 + 45 = 55 < 60 would otherwise regress!)
      expect(engine.currentTick).toBeGreaterThanOrEqual(60);

      // Even if a caller passes a lower tick (e.g., 56), recordInput enforces monotonic sequence > 60
      reconciler.recordInput(56, INPUT_FLAG_RIGHT);
      expect(reconciler.lastRecordedSeq).toBe(61);
      const lastEntry = reconciler.inputBuffer[reconciler.inputBuffer.length - 1]!;
      expect(lastEntry.seq).toBe(61);
      expect(lastEntry.tick).toBe(61);

      // Monotonicity holds for predictStep as well
      const stepSeq = reconciler.predictStep(INPUT_FLAG_RIGHT);
      expect(stepSeq).toBe(62);
      expect(reconciler.lastRecordedSeq).toBe(62);
    });
  });
});
