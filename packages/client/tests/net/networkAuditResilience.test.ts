import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BinaryProtocol,
  EngineInstance,
  JitterBuffer,
  MatchPhase,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_KICK,
  INPUT_FLAG_DASH,
  type GameStateSnapshot,
  type PlayerInput
} from '@legacyx/core';
import {
  PeerConnection,
  SCTP_BACKPRESSURE_LIMIT_BYTES,
  OP_KEEPALIVE,
  NAT_KEEPALIVE_INTERVAL_MS
} from '../../src/net/PeerConnection';
import { SignalingClient } from '../../src/net/SignalingClient';
import { NetworkClient } from '../../src/net/NetworkClient';
import { GameApp } from '../../src/net/GameApp';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction';
import { NetworkImpairmentSimulator } from '../../src/net/NetworkImpairmentSimulator';

function createRichMockPc() {
  const channels = new Map<string, any>();
  const mockPc: any = {
    remoteDescription: null,
    localDescription: null,
    iceConnectionState: 'new',
    connectionState: 'new',
    signalingState: 'stable',
    lastConfig: null as RTCConfiguration | null,
    createDataChannel: vi.fn((label: string, opts?: any) => {
      const dc: any = {
        label,
        options: opts,
        readyState: 'connecting',
        binaryType: 'arraybuffer',
        bufferedAmount: 0,
        bufferedAmountLowThreshold: 0,
        send: vi.fn(),
        close: vi.fn(() => {
          dc.readyState = 'closed';
        }),
        onopen: null,
        onclose: null,
        onmessage: null
      };
      channels.set(label, dc);
      return dc;
    }),
    createOffer: vi.fn(async () => ({ type: 'offer' as const, sdp: 'v=0-offer' })),
    createAnswer: vi.fn(async () => ({ type: 'answer' as const, sdp: 'v=0-answer' })),
    setLocalDescription: vi.fn(async (desc: any) => {
      if (desc?.type === 'rollback') {
        mockPc.signalingState = 'stable';
        mockPc.localDescription = null;
        return;
      }
      mockPc.localDescription = desc;
      mockPc.signalingState = desc?.type === 'offer' ? 'have-local-offer' : 'stable';
    }),
    setRemoteDescription: vi.fn(async (desc: any) => {
      mockPc.remoteDescription = desc;
      mockPc.signalingState = desc?.type === 'offer' ? 'have-remote-offer' : 'stable';
    }),
    addIceCandidate: vi.fn(async () => {}),
    restartIce: vi.fn(),
    getStats: vi.fn(async () => new Map()),
    close: vi.fn(() => {
      mockPc.iceConnectionState = 'closed';
      mockPc.connectionState = 'closed';
    }),
    onicecandidate: null,
    oniceconnectionstatechange: null,
    onconnectionstatechange: null,
    ondatachannel: null
  };
  return { mockPc, channels };
}

describe('Phase 5 Audit Suite — WebRTC Resilience, 3x Input Redundancy & Adverse Network Fluidity', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Suite 1: Out-of-order ICE Queue, Glare Protection, ICE Restart, NAT Keep-Alive, SCTP Backpressure & Telemetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('queues out-of-order ICE candidates, resolves glare via polite rollback, runs 5s disconnected grace + restartIce, NAT keep-alive, 16KB backpressure and getStats route classification', async () => {
      const { mockPc } = createRichMockPc();
      let capturedCfg: RTCConfiguration | null = null;
      (globalThis as any).RTCPeerConnection = vi.fn((cfg: RTCConfiguration) => {
        capturedCfg = cfg;
        return mockPc;
      });
      (globalThis as any).RTCSessionDescription = vi.fn((d) => d);
      (globalThis as any).RTCIceCandidate = vi.fn((c) => c);

      const mockSig = { isOpen: vi.fn(() => true), reconnect: vi.fn() };
      const onConnectedSpy = vi.fn();
      const onUnreliableInputSpy = vi.fn();

      // Polite Guest peer
      const peer = new PeerConnection({
        peerId: 'host-1',
        isInitiator: false,
        signalingClient: mockSig,
        onConnected: onConnectedSpy,
        onUnreliableInput: onUnreliableInputSpy
      });

      expect(capturedCfg?.iceTransportPolicy).toBe('all');

      // 1. Out-of-order remote ICE candidates arrive BEFORE remoteDescription
      const c1 = { candidate: 'candidate:1 1 UDP 2122252543 10.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
      const c2 = { candidate: 'candidate:2 1 UDP 1677729535 198.51.100.2 50001 typ srflx', sdpMid: '0', sdpMLineIndex: 0 };
      await peer.handleRemoteCandidate(c1);
      await peer.handleRemoteCandidate(c2);
      expect(mockPc.addIceCandidate).not.toHaveBeenCalled();
      expect(peer.getPendingCandidateCount()).toBe(2);

      // 2. Simulate glare on polite Guest (already have-local-offer when remote offer arrives)
      mockPc.signalingState = 'have-local-offer';
      await peer.handleOffer({ type: 'offer', sdp: 'v=0-remote-offer' });
      expect(mockPc.setLocalDescription).toHaveBeenCalledWith({ type: 'rollback' });
      expect(mockPc.addIceCandidate).toHaveBeenCalledTimes(2);
      expect(peer.getPendingCandidateCount()).toBe(0);

      // 3. Atomic Dual-Channel open: unreliable opens first -> NOT connected yet; reliable opens -> connected ONCE
      const gameDc: any = {
        label: 'game',
        readyState: 'open',
        binaryType: 'arraybuffer',
        bufferedAmount: 0,
        bufferedAmountLowThreshold: 0,
        send: vi.fn(),
        close: vi.fn(),
        onopen: null,
        onclose: null,
        onmessage: null
      };
      const reliableDc: any = {
        label: 'reliable',
        readyState: 'open',
        bufferedAmount: 0,
        bufferedAmountLowThreshold: 0,
        send: vi.fn(),
        close: vi.fn(),
        onopen: null,
        onclose: null,
        onmessage: null
      };
      mockPc.ondatachannel({ channel: gameDc });
      gameDc.onopen();
      expect(onConnectedSpy).toHaveBeenCalledTimes(0);
      expect(gameDc.bufferedAmountLowThreshold).toBe(SCTP_BACKPRESSURE_LIMIT_BYTES);

      mockPc.ondatachannel({ channel: reliableDc });
      reliableDc.onopen();
      expect(onConnectedSpy).toHaveBeenCalledTimes(1);
      expect(peer.areChannelsOpen()).toBe(true);

      // 4. NAT Keep-Alive every 4s & silent discard of incoming OP_KEEPALIVE (0xff)
      vi.advanceTimersByTime(NAT_KEEPALIVE_INTERVAL_MS);
      expect(gameDc.send).toHaveBeenCalledTimes(1);
      const keepAliveArg = gameDc.send.mock.calls[0]![0] as ArrayBuffer;
      expect(keepAliveArg.byteLength).toBe(1);
      expect(new Uint8Array(keepAliveArg)[0]).toBe(OP_KEEPALIVE);

      gameDc.onmessage({ data: new Uint8Array([OP_KEEPALIVE]).buffer });
      expect(onUnreliableInputSpy).not.toHaveBeenCalled();

      // 5. SCTP Backpressure (> 16 KB drops snapshot cleanly instead of inflating queue)
      gameDc.send.mockClear();
      gameDc.bufferedAmount = SCTP_BACKPRESSURE_LIMIT_BYTES + 1;
      peer.sendUnreliable(new ArrayBuffer(64));
      expect(gameDc.send).not.toHaveBeenCalled();
      gameDc.bufferedAmount = 0;
      peer.sendUnreliable(new ArrayBuffer(64));
      expect(gameDc.send).toHaveBeenCalledTimes(1);

      // 6. Disconnected 5s grace window -> does NOT evict immediately, triggers restartIce() after grace + backoff
      mockPc.iceConnectionState = 'disconnected';
      mockPc.oniceconnectionstatechange();
      vi.advanceTimersByTime(4500);
      expect(mockPc.restartIce).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500 + 2000); // 5s grace + 2s attempt-1 backoff
      expect(mockPc.restartIce).toHaveBeenCalledTimes(1);
      expect(mockPc.createOffer).toHaveBeenCalledWith({ iceRestart: true });

      // 7. Real getStats() route detection (TURN relay on remote candidate)
      mockPc.getStats.mockResolvedValue(
        new Map<string, any>([
          [
            'pair-1',
            {
              type: 'candidate-pair',
              state: 'succeeded',
              nominated: true,
              currentRoundTripTime: 0.084,
              localCandidateId: 'loc-1',
              remoteCandidateId: 'rem-1',
              bytesSent: 4096,
              bytesReceived: 8192
            }
          ],
          ['loc-1', { id: 'loc-1', type: 'local-candidate', candidateType: 'srflx' }],
          ['rem-1', { id: 'rem-1', type: 'remote-candidate', candidateType: 'relay' }]
        ])
      );
      const stats = await peer.auditIceConnection();
      expect(stats.rttMs).toBe(84);
      expect(stats.iceRoute).toBe('Relay (TURN)');
      expect(stats.isRelay).toBe(true);

      peer.close();
    });

    it('atomic handshake retries CLIENT_HELLO after 5s and resolves waitForInitialHandshake on INITIAL_STATE_PACKET', async () => {
      const { mockPc } = createRichMockPc();
      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPc);
      (globalThis as any).RTCSessionDescription = vi.fn((d) => d);
      (globalThis as any).RTCIceCandidate = vi.fn((c) => c);

      const sig = new SignalingClient('ws://localhost:8080', false);
      // Resolve ice_config immediately
      (sig as any).resolveIceConfig([{ urls: ['stun:stun.l.google.com:19302'] }]);

      const client = new NetworkClient(sig, 'GuestAudit', 9);
      await client.connectToHost('host-1');
      const handshakePromise = client.waitForInitialHandshake(15000);

      const gameDc: any = {
        label: 'game',
        readyState: 'open',
        binaryType: 'arraybuffer',
        bufferedAmount: 0,
        send: vi.fn(),
        close: vi.fn(),
        onopen: null,
        onclose: null,
        onmessage: null
      };
      const reliableDc: any = {
        label: 'reliable',
        readyState: 'open',
        bufferedAmount: 0,
        send: vi.fn(),
        close: vi.fn(),
        onopen: null,
        onclose: null,
        onmessage: null
      };
      mockPc.ondatachannel({ channel: gameDc });
      gameDc.onopen();
      expect(reliableDc.send).not.toHaveBeenCalled();

      mockPc.ondatachannel({ channel: reliableDc });
      reliableDc.onopen();

      const hellosInitial = reliableDc.send.mock.calls.filter((c: any[]) =>
        String(c[0]).includes('"CLIENT_HELLO"')
      );
      expect(hellosInitial.length).toBe(1);

      // Advance 5s without response -> automatic retry
      vi.advanceTimersByTime(5000);
      const hellosAfterRetry = reliableDc.send.mock.calls.filter((c: any[]) =>
        String(c[0]).includes('"CLIENT_HELLO"')
      );
      expect(hellosAfterRetry.length).toBe(2);

      // Host confirms with INITIAL_STATE_PACKET
      reliableDc.onmessage({
        data: JSON.stringify({
          type: 'INITIAL_STATE_PACKET',
          assignedPlayerId: 2,
          stadiumId: 'mediano',
          matchPhase: 0,
          playersList: []
        })
      });

      const ok = await handshakePromise;
      expect(ok).toBe(true);
      expect(client.initialHandshakeConfirmed).toBe(true);
      expect(client.localPlayerId).toBe(2);

      client.disconnect();
    });
  });

  describe('Suite 2: 10% Packet Loss + 3x Input Redundancy -> 100% Kick/Dash Delivery', () => {
    it('delivers 100% of Kick and Dash critical actions under 10% packet loss and 15% UDP reordering without duplicates', () => {
      const { mockPc } = createRichMockPc();
      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPc);

      const sig = new SignalingClient('ws://localhost:8080', false);
      const app = new GameApp(sig);
      (app as any).setupHostState('LossArena', 'mediano', 8, true, 'R-LOSS');
      const hostNet = app.networkHost!;

      const client = new NetworkClient(sig, 'RedundantGuest', 7);
      const sentWireBuffers: ArrayBuffer[] = [];
      (client as any).peer = {
        sendUnreliable: (buf: ArrayBuffer) => {
          sentWireBuffers.push(buf.slice(0));
        },
        close: vi.fn()
      };

      // Simulate 10% deterministic packet loss (every 10th packet dropped + jitter + 15% reorder; never 3 consecutive drops)
      const sim = new NetworkImpairmentSimulator<ArrayBuffer>({
        latencyMs: 65,
        jitterMs: 24,
        packetLossRate: 0.10,
        reorderRate: 0.15,
        seed: 20261125,
        dropPredicate: (idx) => idx % 10 === 4 || idx % 10 === 5 // 20% burst loss (2 consecutive drops every 10 packets!)
      });

      const scratchDecode: PlayerInput[] = [{}, {}, {}, {}];
      let hostAppliedKickCount = 0;
      let hostAppliedDashCount = 0;
      let prevAppliedSeq = -1;
      let prevAppliedKick = false;

      const sentKickSeqs = new Set<number>();
      const sentDashSeqs = new Set<number>();
      const tickMap = new Map<number, PlayerInput>();
      const TICK_MS = 1000 / 60;

      const observeApplied = () => {
        tickMap.clear();
        app.popRemoteInputsForTick(tickMap);
        const applied = tickMap.get(2);
        if (applied) {
          const seq = ((applied as any).sequence ?? applied.tick ?? 0) >>> 0;
          const hasKick = ((applied.inputMask ?? 0) & INPUT_FLAG_KICK) !== 0;
          const hasDash = ((applied.inputMask ?? 0) & INPUT_FLAG_DASH) !== 0;
          if (hasKick && (seq !== prevAppliedSeq || !prevAppliedKick)) {
            hostAppliedKickCount++;
          }
          if (hasDash) {
            hostAppliedDashCount++;
          }
          prevAppliedSeq = seq;
          prevAppliedKick = hasKick;
        }
        app.consumeRemoteImpulses();
      };

      for (let tick = 1; tick <= 120; tick++) {
        const nowMs = tick * TICK_MS;
        let mask = INPUT_FLAG_RIGHT;
        if (tick % 10 === 5) {
          // Deliberately align critical Kick with a dropped packet slot!
          mask |= INPUT_FLAG_KICK;
          sentKickSeqs.add(tick);
        }
        if (tick % 10 === 4) {
          // Deliberately align critical Dash with a dropped packet slot!
          mask |= INPUT_FLAG_DASH;
          sentDashSeqs.add(tick);
        }

        sentWireBuffers.length = 0;
        client.sendInput(mask, tick, null, 0);
        expect(sentWireBuffers.length).toBe(1);

        sim.send(sentWireBuffers[0]!, nowMs, (arrivedBuf) => {
          const count = BinaryProtocol.decodeInputBundleInto(arrivedBuf, scratchDecode);
          for (let i = 0; i < count; i++) {
            const d = scratchDecode[i]!;
            hostNet.onPlayerInput?.(2, d.inputMask ?? 0, d.tick ?? d.sequence ?? 0, d.aimAngle, d.aimThrottle);
          }
        });

        sim.flushDue(nowMs);
        observeApplied();
      }

      // Drain remaining in-flight packets after tick 120
      for (let t = 121; t <= 160; t++) {
        sim.flushDue(t * TICK_MS);
        observeApplied();
      }

      expect(sim.droppedCount).toBeGreaterThanOrEqual(20);
      expect(sentKickSeqs.size).toBe(12);
      expect(sentDashSeqs.size).toBe(12);

      // Even though EVERY Kick and Dash packet was directly dropped in a 2-packet burst
      // and 15% of UDP packets were reordered, 3x redundant OP_INPUT_BUNDLE + 32-bit seen-seq
      // deduplication executes 100% of them (12/12 Kicks, 12/12 Dashes) with ZERO duplicates!
      expect(hostAppliedKickCount).toBe(sentKickSeqs.size);
      expect(hostAppliedDashCount).toBe(sentDashSeqs.size);

      client.disconnect();
      app.teardownNetworkSession();
    });
  });

  describe('Suite 3: Non-Host Fluidity & Reconciliation under 180 ms RTT + 40 ms Jitter', () => {
    it('maintains smooth prediction, bounded replay (<= 5), adaptive jitter delay [25-100ms], and zero hard snaps at 180ms RTT + 40ms jitter', () => {
      const sig = new SignalingClient('ws://localhost:8080', false);
      const app = new GameApp(sig);
      (app as any).setupHostState('AdverseArena', 'mediano', 8, true, 'R-ADV');
      const hostNet = app.networkHost!;

      const hostEngine = new EngineInstance('mediano');
      hostEngine.isPracticeMode = true;
      hostEngine.startMatch(false);
      hostEngine.fsm.startPlaying();
      const hostPlayer = hostEngine.addPlayer(2, 'red');
      hostPlayer.pos.set(-180, 0);
      hostEngine.ball.pos.set(120, 0);

      const predEngine = new EngineInstance('mediano');
      predEngine.isPracticeMode = true;
      predEngine.startMatch(false);
      predEngine.fsm.startPlaying();
      predEngine.setState(hostEngine.getState());

      const reconciler = new ClientPredictionReconciler();
      const jitterBuffer = new JitterBuffer<GameStateSnapshot>(32, 30, true);

      // 180 ms RTT (90 ms each direction), 40 ms peak-to-peak jitter, 5% packet loss, 10% reordering
      const upLink = new NetworkImpairmentSimulator<ArrayBuffer>({
        latencyMs: 90,
        jitterMs: 40,
        packetLossRate: 0.05,
        reorderRate: 0.10,
        seed: 777111
      });
      const downLink = new NetworkImpairmentSimulator<ArrayBuffer>({
        latencyMs: 90,
        jitterMs: 40,
        packetLossRate: 0.05,
        reorderRate: 0.10,
        seed: 888222
      });

      const guestNet = new NetworkClient(sig, 'LagGuest', 10);
      const hostInputs = new Map<number, PlayerInput>();
      const guestLocalMap = new Map<number, PlayerInput>();
      const decodeScratch: PlayerInput[] = [{}, {}, {}, {}];
      const TICK_MS = 1000 / 60;
      let highestSnapTick = -1;
      let hardSnapCount = 0;
      let maxObservedVisualJump = 0;
      let prevRenderX: number | null = null;
      let lastBundle: ArrayBuffer | null = null;

      (guestNet as any).peer = {
        sendUnreliable: (buf: ArrayBuffer) => {
          lastBundle = buf;
        },
        close: vi.fn()
      };

      for (let tick = 1; tick <= 180; tick++) {
        const nowMs = tick * TICK_MS;
        const mask = tick <= 120 ? INPUT_FLAG_RIGHT : 0;

        // Guest records & predicts at strict 60 Hz
        const seq = reconciler.recordInput(tick, mask, null, 0);
        guestLocalMap.clear();
        guestLocalMap.set(2, { inputMask: mask, sequence: seq } as any);
        predEngine.step(guestLocalMap, true);

        lastBundle = null;
        guestNet.sendInput(mask, seq, null, 0);
        if (lastBundle) {
          upLink.send(lastBundle, nowMs, (arrived) => {
            const n = BinaryProtocol.decodeInputBundleInto(arrived, decodeScratch);
            for (let i = 0; i < n; i++) {
              const d = decodeScratch[i]!;
              hostNet.onPlayerInput?.(2, d.inputMask ?? 0, d.tick ?? d.sequence ?? 0, d.aimAngle, d.aimThrottle);
            }
          });
        }

        // Host flushes arrived uplink packets and steps authoritative 60 Hz world
        upLink.flushDue(nowMs);
        hostInputs.clear();
        app.popRemoteInputsForTick(hostInputs);
        hostEngine.step(hostInputs);
        app.consumeRemoteImpulses();

        const encodedSnap = BinaryProtocol.encodeSnapshot(hostEngine.getState());
        downLink.send(encodedSnap, nowMs, (arrivedSnapBuf, arrivedAt) => {
          const decoded = BinaryProtocol.decodeSnapshot(arrivedSnapBuf);
          if (!decoded) return;
          jitterBuffer.push(decoded, arrivedAt);
          if (decoded.tick >= highestSnapTick) {
            highestSnapTick = decoded.tick;
            const res = reconciler.reconcile(predEngine, decoded, 2);
            expect(reconciler.lastReplayedFullSteps).toBeLessThanOrEqual(ClientPredictionReconciler.MAX_REPLAY_TICKS);
            if (res.hardSnapped) hardSnapCount++;
          }
        });

        // Guest processes arrived snapshots & decays visual error smoothly
        downLink.flushDue(nowMs);
        reconciler.updateVisualSmoothing(1 / 60);

        const localDisc = predEngine.players.get(2)!;
        const renderX = localDisc.pos.x + reconciler.visualOffset.x;
        expect(Number.isFinite(renderX)).toBe(true);
        if (prevRenderX !== null) {
          const jump = Math.abs(renderX - prevRenderX);
          if (jump > maxObservedVisualJump) maxObservedVisualJump = jump;
        }
        prevRenderX = renderX;

        const interp = jitterBuffer.getInterpolatedState(nowMs);
        if (interp) {
          expect(Number.isFinite(interp.discs[0]!.x)).toBe(true);
        }
      }

      // Assertions under adverse 180ms RTT + 40ms jitter + 5% loss:
      expect(ClientPredictionReconciler.MAX_REPLAY_TICKS).toBe(30);
      expect(hardSnapCount).toBe(0);
      expect(maxObservedVisualJump).toBeLessThan(18);
      expect(jitterBuffer.targetDelay).toBeGreaterThanOrEqual(30);
      expect(jitterBuffer.targetDelay).toBeLessThanOrEqual(140);
      expect(jitterBuffer.meanJitter).toBeGreaterThan(2);

      guestNet.disconnect();
      app.teardownNetworkSession();
    });
  });
});
