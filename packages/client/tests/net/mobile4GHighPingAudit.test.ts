import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  BinaryProtocol,
  EngineInstance,
  InputPacket,
  MatchPhase,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH,
  INPUT_FLAG_KICK,
  type GameStateSnapshot,
  type PlayerInput
} from '@legacyx/core';
import { SharedSimSync } from '../../src/net/SharedSimSync';
import { NetworkClient } from '../../src/net/NetworkClient';
import { GameApp } from '../../src/net/GameApp';
import { SignalingClient } from '../../src/net/SignalingClient';
import { NetworkImpairmentSimulator } from '../../src/net/NetworkImpairmentSimulator';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

describe('4G Mobile High-Ping (260 ms RTT + ±40 ms Jitter + 3–5% Loss) Verification Suite (Option 3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    gameUI.setSimLag(0, 0, 0);
  });

  it('Test 1 (SharedSimSync at 260 ms RTT + ±40 ms jitter + 3% loss): absorbs jitter/loss smoothly with 0 hard snaps & disconnect cap', () => {
    const sync = new SharedSimSync('mediano');
    const hostEngine = new EngineInstance('mediano');
    hostEngine.isPracticeMode = true;
    hostEngine.startMatch(false);
    hostEngine.fsm.startPlaying();
    const hostP = hostEngine.addPlayer(2, 'red');
    hostP.pos.set(-300, 0);
    hostEngine.ball.pos.set(0, 0);

    const downLink = new NetworkImpairmentSimulator<ArrayBuffer>({
      latencyMs: 130,
      jitterMs: 80,
      packetLossRate: 0.03,
      reorderRate: 0.12,
      seed: 0x46473236
    });

    const TICK_MS = 1000 / 60;
    const inputs = new Map<number, PlayerInput>([[2, { inputMask: INPUT_FLAG_RIGHT }]]);
    let prevBallX: number | null = null;
    let maxStepPx = 0;
    let minDxPx = Infinity;
    let renderedCount = 0;

    for (let tick = 1; tick <= 360; tick++) {
      const nowMs = tick * TICK_MS;
      hostEngine.step(inputs);
      const buf = BinaryProtocol.encodeSnapshot(hostEngine.getState());

      downLink.send(buf, nowMs, (arrivedBuf, arrivedAtMs) => {
        const decoded = BinaryProtocol.decodeSnapshot(arrivedBuf);
        if (decoded) {
          sync.onSnapshot(decoded, arrivedAtMs);
        }
      });
      downLink.flushDue(nowMs);
      sync.update(1 / 60, nowMs);

      const snap = sync.buildRenderSnapshot(60, nowMs);
      if (snap) {
        renderedCount++;
        const p2 = snap.discs.find((d) => d.id === 2)!;
        expect(Number.isFinite(p2.x)).toBe(true);
        if (prevBallX !== null) {
          const dx = p2.x - prevBallX;
          if (hostP.pos.x < 400 && hostP.vel.x > 0 && dx < minDxPx) minDxPx = dx;
          if (Math.abs(dx) > maxStepPx) maxStepPx = Math.abs(dx);
        }
        prevBallX = p2.x;
      }
    }

    const tel = sync.getTelemetry(undefined, 360 * TICK_MS);
    expect(renderedCount).toBeGreaterThan(220);
    expect(tel.hardSnaps).toBe(0);
    expect(tel.syncCorrectionAvgPx).toBeLessThan(6);
    expect(minDxPx).toBeGreaterThanOrEqual(-0.5);
    expect(maxStepPx).toBeLessThan(12);

    // Disconnect cap stops local progression cleanly at 250 ms (15 steps max)
    const staleBase = 360 * TICK_MS;
    for (let k = 1; k <= 30; k++) {
      sync.update(1 / 60, staleBase + k * TICK_MS);
    }
    const stalledTel = sync.getTelemetry(undefined, staleBase + 500);
    expect(stalledTel.localStepsSinceSnap).toBeLessThanOrEqual(SharedSimSync.MAX_LOCAL_STEPS_SINCE_SNAP);
    expect(stalledTel.networkStalled).toBe(true);
  });

  it('Test 2 (SharedSimSync deterministic replay parity with inputMask + Turbo + Dash)', () => {
    const hostEngine = new EngineInstance('mediano');
    hostEngine.isPracticeMode = true;
    hostEngine.startMatch(false);
    hostEngine.fsm.startPlaying();
    const hostP = hostEngine.addPlayer(2, 'red');
    hostP.pos.set(-150, 0);
    hostEngine.ball.pos.set(450, 200);

    const sync = new SharedSimSync('mediano');
    sync.configure('mediano', hostEngine.modifiers, true);
    const inputMap = new Map<number, PlayerInput>();

    // Deliver snapshot 1 carrying held INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO
    inputMap.set(2, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO });
    hostEngine.step(inputMap);
    sync.onSnapshot(BinaryProtocol.decodeSnapshot(BinaryProtocol.encodeSnapshot(hostEngine.getState()))!, 1000);

    // Simulate 10 dropped ticks (166 ms): Host and SharedSimSync step independently from shared snapshot inputMask!
    for (let i = 1; i <= 10; i++) {
      hostEngine.step(inputMap);
      sync.update(1 / 60, 1000 + i * (1000 / 60));
    }

    const errPx = Math.hypot(
      sync.simWorld.players.get(2)!.pos.x - hostP.pos.x,
      sync.simWorld.players.get(2)!.pos.y - hostP.pos.y
    );
    expect(errPx).toBeLessThan(0.05);
  });

  it('Test 3 (InputPacket 4x redundancia): entrega 100% de Kick/Dash con 0 duplicados ante 5% pérdida aleatoria + ráfaga de 3 pérdidas consecutivas', () => {
    expect(InputPacket.REDUNDANCY_COUNT).toBe(4);
    expect(BinaryProtocol.INPUT_BUNDLE_MAX_COUNT).toBe(4);

    const sig = new SignalingClient('ws://localhost:8080', false);
    const app = new GameApp(sig);
    (app as any).setupHostState('FourGArena', 'mediano', 8, true, 'R-4G');
    const hostNet = app.networkHost!;

    const client = new NetworkClient(sig, 'FourGGuest', 9);
    let sentBuffer: ArrayBuffer | null = null;
    (client as any).peer = {
      sendUnreliable: (buf: ArrayBuffer) => {
        sentBuffer = buf.slice(0);
      },
      close: vi.fn()
    };

    // 5% pérdida aleatoria + ±40 ms jitter + 15% reordering + ráfaga de 3 paquetes perdidos seguidos en ticks 50..52
    const upSim = new NetworkImpairmentSimulator<ArrayBuffer>({
      latencyMs: 130,
      jitterMs: 80,
      packetLossRate: 0.05,
      reorderRate: 0.15,
      seed: 0x20260404
    });

    const scratchDecode: PlayerInput[] = [{}, {}, {}, {}];
    const TICK_MS = 1000 / 60;
    const sentKickSeqs = new Set<number>();
    const sentDashSeqs = new Set<number>();
    let appliedKicks = 0;
    let appliedDashes = 0;
    let prevAppliedSeq = -1;
    let prevAppliedKick = false;
    let prevAppliedDash = false;
    const tickMap = new Map<number, PlayerInput>();

    const applyHostTick = () => {
      tickMap.clear();
      app.popRemoteInputsForTick(tickMap);
      const inp = tickMap.get(2);
      if (inp) {
        const seq = ((inp as any).sequence ?? inp.tick ?? 0) >>> 0;
        const kick = ((inp.inputMask ?? 0) & INPUT_FLAG_KICK) !== 0;
        const dash = ((inp.inputMask ?? 0) & INPUT_FLAG_DASH) !== 0;
        if (kick && (seq !== prevAppliedSeq || !prevAppliedKick)) {
          appliedKicks++;
        }
        if (dash && (seq !== prevAppliedSeq || !prevAppliedDash)) {
          appliedDashes++;
        }
        prevAppliedSeq = seq;
        prevAppliedKick = kick;
        prevAppliedDash = dash;
      }
      app.consumeRemoteImpulses();
    };

    for (let tick = 1; tick <= 240; tick++) {
      const nowMs = tick * TICK_MS;
      let mask = INPUT_FLAG_RIGHT;
      if (tick === 50 || tick % 24 === 8) {
        mask |= INPUT_FLAG_KICK;
        sentKickSeqs.add(tick);
      }
      if (tick === 51 || tick % 24 === 16) {
        mask |= INPUT_FLAG_DASH;
        sentDashSeqs.add(tick);
      }

      sentBuffer = null;
      client.sendInput(mask, tick, null, 0);
      expect(sentBuffer).not.toBeNull();
      if (tick >= 4) {
        expect((sentBuffer as ArrayBuffer).byteLength).toBe(2 + 4 * 9);
      }

      // Forzar pérdida determinista de 3 paquetes consecutivos (ticks 50, 51, 52) para verificar recuperación via paquete 53
      if (tick >= 50 && tick <= 52) {
        upSim.droppedCount++;
      } else {
        upSim.send(sentBuffer!, nowMs, (arrivedBuf) => {
          const n = BinaryProtocol.decodeInputBundleInto(arrivedBuf, scratchDecode);
          for (let i = 0; i < n; i++) {
            const d = scratchDecode[i]!;
            const seq = (d.tick ?? d.sequence ?? 0) >>> 0;
            if (seq > 0 && !(hostNet as any).checkAndMarkSeenInputSeq(2, seq)) {
              hostNet.onPlayerInput?.(2, d.inputMask ?? 0, seq, d.aimAngle, d.aimThrottle);
            }
          }
        });
      }

      upSim.flushDue(nowMs);
      applyHostTick();
    }

    for (let tick = 241; tick <= 290; tick++) {
      upSim.flushDue(tick * TICK_MS);
      applyHostTick();
    }

    expect(sentKickSeqs.size).toBeGreaterThanOrEqual(10);
    expect(sentDashSeqs.size).toBeGreaterThanOrEqual(10);
    expect(upSim.droppedCount).toBeGreaterThan(8);
    expect(appliedKicks).toBe(sentKickSeqs.size);
    expect(appliedDashes).toBe(sentDashSeqs.size);

    client.disconnect();
    app.teardownNetworkSession();
  });

  it('Test 4 (/netdebug, /simlag & SharedSimSync real physics extrapolation): toggles debug panel, live impairment, and extrapolates ball + players cleanly', () => {
    const store = new Map<string, string>();
    const origStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear()
    };

    try {
      gameUI.showNetDebug = false;
      expect(gameUI.handleChatCommand('/netdebug on')).toBe(true);
      expect(gameUI.showNetDebug).toBe(true);
      expect(gameUI.handleChatCommand('/netdebug off')).toBe(true);
      expect(gameUI.showNetDebug).toBe(false);

      const sig = new SignalingClient('ws://localhost:8080', false);
      const client = new NetworkClient(sig, 'SimGuest', 7);
      gameUI.onSimLagChanged = (cfg) => client.setNetworkImpairment(cfg);

      expect(gameUI.handleChatCommand('/simlag 260 40 3')).toBe(true);
      expect(gameUI.simLagConfig).toEqual({
        enabled: true,
        rttMs: 260,
        jitterMs: 40,
        lossPct: 3
      });
      expect((client as any).uplinkImpairment).not.toBeNull();
      expect((client as any).downlinkImpairment).not.toBeNull();

      expect(gameUI.handleChatCommand('/simlag 0')).toBe(true);
      expect(gameUI.simLagConfig.enabled).toBe(false);
      expect((client as any).uplinkImpairment).toBeNull();
      expect((client as any).downlinkImpairment).toBeNull();
      client.disconnect();

      const sync = new SharedSimSync('mediano');
      sync.onSnapshot(
        {
          tick: 10,
          phase: MatchPhase.PLAYING,
          matchTimer: 30,
          redScore: 0,
          blueScore: 0,
          soundMask: 0,
          discs: [
            { id: 0, team: 0, x: 100, y: 0, vx: 120, vy: 0, flags: 0 },
            { id: 2, team: 2, x: 85, y: 0, vx: 120, vy: 0, flags: 0, stamina: 100 }
          ]
        },
        1000
      );
      const extrap = sync.buildRenderSnapshot(100, 1000)!;
      expect(extrap.discs.find((d) => d.id === 0)!.x).toBeGreaterThan(100);
      expect(extrap.discs.find((d) => d.id === 2)!.x).toBeGreaterThan(85);
    } finally {
      (globalThis as any).localStorage = origStorage;
    }
  });
});
