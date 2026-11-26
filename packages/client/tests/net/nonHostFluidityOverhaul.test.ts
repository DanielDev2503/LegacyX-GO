import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EngineInstance,
  BinaryProtocol,
  MatchPhase,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_DASH,
  type GameStateSnapshot,
  type PlayerInput
} from '@legacyx/core';
import { SimulationTicker } from '../../src/net/SimulationTicker.js';
import { PeerConnection } from '../../src/net/PeerConnection.js';
import { NetworkClient } from '../../src/net/NetworkClient.js';
import { GameApp } from '../../src/net/GameApp.js';
import { SignalingClient } from '../../src/net/SignalingClient.js';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction.js';
import { Camera } from '../../src/renderer/Camera.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

function createMockRtcPair() {
  const createdChannels: any[] = [];
  const mockPc: any = {
    remoteDescription: null,
    localDescription: null,
    iceConnectionState: 'new',
    connectionState: 'new',
    signalingState: 'stable',
    createDataChannel: vi.fn((label: string) => {
      const dc: any = {
        label,
        readyState: 'connecting',
        binaryType: 'arraybuffer',
        bufferedAmount: 0,
        send: vi.fn(),
        close: vi.fn(() => {
          dc.readyState = 'closed';
        }),
        onopen: null,
        onclose: null,
        onmessage: null
      };
      createdChannels.push(dc);
      return dc;
    }),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'v=0' })),
    createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'v=0' })),
    setLocalDescription: vi.fn(async (d) => {
      mockPc.localDescription = d;
    }),
    setRemoteDescription: vi.fn(async (d) => {
      mockPc.remoteDescription = d;
    }),
    addIceCandidate: vi.fn(async () => {}),
    getStats: vi.fn(async () => new Map()),
    close: vi.fn(),
    onicecandidate: null,
    oniceconnectionstatechange: null,
    onconnectionstatechange: null,
    ondatachannel: null
  };
  return { mockPc, createdChannels };
}

describe('Non-Host Fluidity, Netcode & Rendering Overhaul', () => {
  const originalRTC = (globalThis as any).RTCPeerConnection;

  beforeEach(() => {
    vi.restoreAllMocks();
    gameUI.pingMs = 0;
    gameUI.fps = 60;
    gameUI.settings.autoExtrapolation = true;
  });

  afterEach(() => {
    (globalThis as any).RTCPeerConnection = originalRTC;
  });

  it('SimulationTicker.pump + getInterpolationAlpha steps fixed 60 Hz across 60/120/144Hz monitors without beat-frequency jumps', () => {
    for (const refreshHz of [60, 120, 144]) {
      let tickCount = 0;
      const ticker = new SimulationTicker(() => {
        tickCount++;
      });

      const perfSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
      ticker.start();

      const frameDtMs = 1000 / refreshHz;
      const totalFrames = refreshHz; // 1 full second
      const alphas: number[] = [];
      let prevEffectiveTick = -1;
      let maxTicksPerFrame = 0;

      for (let f = 0; f < totalFrames; f++) {
        const now = 1000 + f * frameDtMs;
        const ran = ticker.pump(now);
        const alpha = ticker.getInterpolationAlpha(now);
        if (f > 0 && ran > maxTicksPerFrame) {
          maxTicksPerFrame = ran;
        }
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
        alphas.push(alpha);

        const effectiveTick = tickCount + alpha;
        if (prevEffectiveTick >= 0) {
          expect(effectiveTick).toBeGreaterThanOrEqual(prevEffectiveTick - 1e-6);
        }
        prevEffectiveTick = effectiveTick;
      }

      ticker.stop();
      perfSpy.mockRestore();

      // Strictly 60 Hz simulation rate over 1s
      expect(tickCount).toBeGreaterThanOrEqual(59);
      expect(tickCount).toBeLessThanOrEqual(61);
      // 120Hz/144Hz never execute >= 2 physics ticks in one rendered frame
      if (refreshHz >= 120) {
        expect(maxTicksPerFrame).toBeLessThanOrEqual(1);
      }
      // 144Hz renders multiple smooth fractional alpha steps between ticks
      if (refreshHz === 144) {
        const uniqueFractional = alphas.filter((a) => a > 0.05 && a < 0.95).length;
        expect(uniqueFractional).toBeGreaterThan(50);
      }
    }
  });

  it('PeerConnection fires onConnected strictly once across all handshake state transitions', () => {
    const { mockPc } = createMockRtcPair();
    (globalThis as any).RTCPeerConnection = vi.fn(() => mockPc);

    const onConnectedSpy = vi.fn();
    const peer = new PeerConnection({
      peerId: 'host-1',
      isInitiator: true,
      onConnected: onConnectedSpy
    });

    expect(peer.hasEverConnected).toBe(false);

    // Unreliable opens first -> atomic dual-channel handshake waits until reliable also opens
    peer.unreliableChannel!.readyState = 'open';
    peer.unreliableChannel!.onopen?.(new Event('open') as any);
    expect(onConnectedSpy).toHaveBeenCalledTimes(0);
    expect(peer.hasEverConnected).toBe(false);
    expect(peer.areChannelsOpen()).toBe(false);

    // Reliable opens -> both channels open, hasEverConnected becomes true, onConnected fires strictly once
    peer.reliableChannel!.readyState = 'open';
    peer.reliableChannel!.onopen?.(new Event('open') as any);
    expect(peer.hasEverConnected).toBe(true);
    expect(peer.areChannelsOpen()).toBe(true);
    expect(onConnectedSpy).toHaveBeenCalledTimes(1);

    // ICE & connection state changes do not burst duplicate onConnected callbacks
    mockPc.iceConnectionState = 'connected';
    mockPc.oniceconnectionstatechange?.();
    mockPc.connectionState = 'connected';
    mockPc.onconnectionstatechange?.();
    expect(onConnectedSpy).toHaveBeenCalledTimes(1);

    peer.close();
  });

  it('NetworkClient rejects out-of-order snapshots, deduplicates unchanged phase sync, and drops handshake RTT spikes via median window', async () => {
    const { mockPc } = createMockRtcPair();
    (globalThis as any).RTCPeerConnection = vi.fn(() => mockPc);

    const sig = new SignalingClient('ws://localhost:8080', false);
    const client = new NetworkClient(sig, 'Guest', 7);
    const decodedTicks: number[] = [];
    client.onSnapshotDecoded = (snap) => decodedTicks.push(snap.tick);

    const stadiumSpy = vi.fn();
    gameUI.onStadiumChanged = stadiumSpy;
    const configSpy = vi.spyOn(gameUI, 'applyRemoteGameplayConfig');

    await client.connectToHost('host-1');
    const gameDc = (client as any).peer.pc.ondatachannel
      ? (() => {
          const g = {
            label: 'game',
            readyState: 'open',
            binaryType: 'arraybuffer',
            send: vi.fn(),
            close: vi.fn(),
            onopen: null as any,
            onclose: null as any,
            onmessage: null as any
          };
          (client as any).peer.pc.ondatachannel({ channel: g });
          return g;
        })()
      : null;

    expect(gameDc).not.toBeNull();

    // 1. Out-of-order UDP snapshot guard: deliver tick 50 then late tick 49
    const snap50 = BinaryProtocol.encodeSnapshot({
      tick: 50,
      phase: MatchPhase.PLAYING,
      matchTimer: 100,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [{ id: 0, team: 0, x: 100, y: 0, vx: 60, vy: 0, flags: 0 }]
    });
    const snap49 = BinaryProtocol.encodeSnapshot({
      tick: 49,
      phase: MatchPhase.PLAYING,
      matchTimer: 100,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [{ id: 0, team: 0, x: 99, y: 0, vx: 60, vy: 0, flags: 0 }]
    });

    gameDc!.onmessage({ data: snap50 });
    gameDc!.onmessage({ data: snap49 });

    expect(client.latestSnapshot?.tick).toBe(50);
    expect(decodedTicks).toEqual([50]);

    // 2. ROOM_STATE_SYNC deduplication across match phase changes
    const payload = {
      type: 'ROOM_STATE_SYNC',
      assignedPlayerId: 2,
      stadiumId: 'mediano',
      modifiers: { speedMultiplier: 1.0 },
      gameplayConfig: { ballRadius: 6.2 },
      playersList: []
    };
    (client as any).handleReliableMessage({ ...payload, matchPhase: MatchPhase.PLAYING });
    (client as any).handleReliableMessage({ ...payload, matchPhase: MatchPhase.GOAL });
    (client as any).handleReliableMessage({ ...payload, matchPhase: MatchPhase.GOAL_REPLAY });

    expect(stadiumSpy).toHaveBeenCalledTimes(1);
    expect(configSpy).toHaveBeenCalledTimes(1);

    // Actual stadium change DOES propagate once
    (client as any).handleReliableMessage({ ...payload, stadiumId: 'big', matchPhase: MatchPhase.STOP });
    expect(stadiumSpy).toHaveBeenCalledTimes(2);

    // 3. RTT median window recovers quickly from initial 330ms handshake congestion spike
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1330);
    (client as any).handleReliableMessage({ type: 'PONG_PROBE', t: 1000 });
    expect(gameUI.pingMs).toBe(330);

    nowSpy.mockReturnValue(2024);
    (client as any).handleReliableMessage({ type: 'PONG_PROBE', t: 2000 });
    nowSpy.mockReturnValue(3026);
    (client as any).handleReliableMessage({ type: 'PONG_PROBE', t: 3000 });

    // Within 3 samples total (no 15-second EMA tail!), median of [330, 24, 26] = 26ms
    expect(gameUI.pingMs).toBeLessThanOrEqual(30);

    nowSpy.mockRestore();
    client.disconnect();
  });

  it('GameApp ordered remote input queue executes burst/reordered inputs sequentially and prevents duplicate dash impulses', () => {
    const sig = new SignalingClient('ws://localhost:8080', false);
    const app = new GameApp(sig);
    const host = (app as any).setupHostState
      ? (() => {
          (app as any).setupHostState('Room', 'mediano', 8, true, 'r-queue');
          return app.networkHost!;
        })()
      : null;
    expect(host).not.toBeNull();

    // Deliver seq 10 (dash + right), then out-of-order seq 12, then seq 11 inside one Host frame burst
    host!.onPlayerInput?.(2, INPUT_FLAG_RIGHT | INPUT_FLAG_DASH, 10, null, 0);
    host!.onPlayerInput?.(2, INPUT_FLAG_RIGHT | INPUT_FLAG_DASH, 10, null, 0); // Redundant dash duplicate
    host!.onPlayerInput?.(2, INPUT_FLAG_RIGHT, 12, null, 0);
    host!.onPlayerInput?.(2, INPUT_FLAG_RIGHT, 11, null, 0);

    const tickMap = new Map<number, PlayerInput>();

    app.popRemoteInputsForTick(tickMap);
    expect((tickMap.get(2) as any)?.sequence).toBe(10);
    expect((tickMap.get(2)!.inputMask & INPUT_FLAG_DASH) !== 0).toBe(true);
    app.consumeRemoteImpulses();

    // Late duplicate of already-consumed seq 10 must be ignored
    host!.onPlayerInput?.(2, INPUT_FLAG_RIGHT | INPUT_FLAG_DASH, 10, null, 0);

    tickMap.clear();
    app.popRemoteInputsForTick(tickMap);
    expect((tickMap.get(2) as any)?.sequence).toBe(11);
    expect((tickMap.get(2)!.inputMask & INPUT_FLAG_DASH) !== 0).toBe(false);
    app.consumeRemoteImpulses();

    tickMap.clear();
    app.popRemoteInputsForTick(tickMap);
    expect((tickMap.get(2) as any)?.sequence).toBe(12);
    app.consumeRemoteImpulses();

    // Queue empty on jitter gap: holds movement direction without repeating dash and without faking seq 13
    tickMap.clear();
    app.popRemoteInputsForTick(tickMap);
    expect((tickMap.get(2) as any)?.sequence).toBe(12);
    expect((tickMap.get(2)!.inputMask & INPUT_FLAG_RIGHT) !== 0).toBe(true);
    expect((tickMap.get(2)!.inputMask & INPUT_FLAG_DASH) !== 0).toBe(false);

    app.teardownNetworkSession();
  });

  it('integrated Host + Non-Host dribble simulation keeps predicted ball in front of dribbling player without hard snaps at 40ms and 160ms RTT', () => {
    for (const rttMs of [40, 160]) {
      const halfTicks = Math.max(1, Math.round((rttMs / 2) / (1000 / 60)));
      const sig = new SignalingClient('ws://localhost:8080', false);
      const app = new GameApp(sig);
      (app as any).setupHostState('Sim', 'mediano', 8, true, `r-${rttMs}`);
      const hostNet = app.networkHost!;

      const hostEngine = new EngineInstance('mediano');
      hostEngine.isPracticeMode = true;
      hostEngine.startMatch(false);
      hostEngine.fsm.startPlaying();
      const hostP = hostEngine.addPlayer(2, 'red');
      hostP.pos.set(-55, 0);
      hostEngine.ball.pos.set(0, 0);

      const predEngine = new EngineInstance('mediano');
      predEngine.isPracticeMode = true;
      predEngine.startMatch(false);
      predEngine.fsm.startPlaying();
      predEngine.setState(hostEngine.getState());

      const reconciler = new ClientPredictionReconciler();
      const inFlightInputs: Array<{ deliverTick: number; seq: number; mask: number }> = [];
      const inFlightSnaps: Array<{ deliverTick: number; snap: GameStateSnapshot }> = [];
      const hostInputs = new Map<number, PlayerInput>();
      let highestSnapTick = -1;

      for (let tick = 1; tick <= 120; tick++) {
        // Guest steps fixed 60Hz prediction and enqueues input with jitter
        const seq = reconciler.recordInput(tick, INPUT_FLAG_RIGHT, null, 0);
        predEngine.step(new Map([[2, { inputMask: INPUT_FLAG_RIGHT, sequence: seq } as any]]), true);

        const inputJitter = tick % 2 === 0 ? 1 : 0;
        inFlightInputs.push({
          deliverTick: tick + halfTicks + inputJitter,
          seq,
          mask: INPUT_FLAG_RIGHT
        });

        // Host receives arrived inputs into ordered queue, steps one tick
        for (let i = inFlightInputs.length - 1; i >= 0; i--) {
          if (inFlightInputs[i]!.deliverTick <= tick) {
            const item = inFlightInputs.splice(i, 1)[0]!;
            hostNet.onPlayerInput?.(2, item.mask, item.seq, null, 0);
          }
        }

        hostInputs.clear();
        app.popRemoteInputsForTick(hostInputs);
        hostEngine.step(hostInputs);
        app.consumeRemoteImpulses();

        const snapJitter = tick % 3 === 0 ? 1 : 0;
        inFlightSnaps.push({
          deliverTick: tick + halfTicks + snapJitter,
          snap: BinaryProtocol.decodeSnapshot(BinaryProtocol.encodeSnapshot(hostEngine.getState()))!
        });

        // Guest delivers latest monotonic snapshot
        let newestArrived: GameStateSnapshot | null = null;
        for (let i = inFlightSnaps.length - 1; i >= 0; i--) {
          if (inFlightSnaps[i]!.deliverTick <= tick) {
            const s = inFlightSnaps.splice(i, 1)[0]!.snap;
            if (s.tick >= highestSnapTick) {
              highestSnapTick = s.tick;
              newestArrived = s;
            }
          }
        }
        if (newestArrived) {
          reconciler.reconcile(predEngine, newestArrived, 2);
          expect(reconciler.didHardSnapLastReconcile).toBe(false);
          expect(reconciler.didBallHardSnapLastReconcile).toBe(false);
        }

        reconciler.updateVisualSmoothing(1 / 60);
        const predPlayer = predEngine.players.get(2)!;
        const renderPlayerX = predPlayer.pos.x + reconciler.visualOffset.x;
        const renderBallX = predEngine.ball.pos.x + reconciler.ballVisualOffset.x;

        // Ball NEVER clips behind the dribbling Non-Host player!
        expect(renderBallX).toBeGreaterThan(renderPlayerX + predPlayer.radius + predEngine.ball.radius - 1.0);
      }

      app.teardownNetworkSession();
    }
  });

  it('Camera.follow and Camera.followDual converge identically at 60 FPS and 144 FPS when dt is provided', () => {
    const cam60 = new Camera(0, 0);
    const cam144 = new Camera(0, 0);

    for (let i = 0; i < 30; i++) {
      cam60.follow(240, -120, 1 / 60);
    }
    for (let i = 0; i < 72; i++) {
      cam144.follow(240, -120, 1 / 144);
    }
    expect(Math.hypot(cam60.x - cam144.x, cam60.y - cam144.y)).toBeLessThan(0.05);

    const dual60 = new Camera(0, 0);
    const dual144 = new Camera(0, 0);
    for (let i = 0; i < 30; i++) {
      dual60.followDual(100, 40, 300, -80, 0.25, 180, 1 / 60);
    }
    for (let i = 0; i < 72; i++) {
      dual144.followDual(100, 40, 300, -80, 0.25, 180, 1 / 144);
    }
    expect(Math.hypot(dual60.x - dual144.x, dual60.y - dual144.y)).toBeLessThan(0.05);
  });
});
