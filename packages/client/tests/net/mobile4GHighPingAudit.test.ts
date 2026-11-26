import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BinaryProtocol,
  EngineInstance,
  InputPacket,
  JitterBuffer,
  MatchPhase,
  createStadium,
  stepPlayerKinematics,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH,
  INPUT_FLAG_KICK,
  type GameStateSnapshot,
  type PlayerInput,
  type PlayerKinematicsState
} from '@legacyx/core';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction';
import { NetworkClient } from '../../src/net/NetworkClient';
import { GameApp } from '../../src/net/GameApp';
import { SignalingClient } from '../../src/net/SignalingClient';
import { NetworkImpairmentSimulator } from '../../src/net/NetworkImpairmentSimulator';
import { DiscRenderer } from '../../src/renderer/DiscRenderer';
import { gameUI, LEGACYX_NET_MODE_KEY } from '../../src/ui/state/gameUI.svelte.js';

describe('4G Mobile High-Ping (260 ms RTT + ±40 ms Jitter + 3–5% Loss) Verification Suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    gameUI.setSimLag(0, 0, 0);
  });

  it('Test 1 (JitterBuffer PLL): absorbs 260 ms RTT + ±40 ms jitter + 3% loss smoothly with bounded 60 ms underflow & 300 ms hard-reset guard', () => {
    const jb = new JitterBuffer<GameStateSnapshot>(32, 45, true);
    // Simulador: latencia 130 ms unidireccional (260 ms RTT), jitterMs = 80 (±40 ms), 3% loss, 12% reorder
    const downLink = new NetworkImpairmentSimulator<GameStateSnapshot>({
      latencyMs: 130,
      jitterMs: 80,
      packetLossRate: 0.03,
      reorderRate: 0.12,
      seed: 0x46473236
    });

    const TICK_MS = 1000 / 60;
    const ballSpeedX = 240; // 4 px/tick constantes
    let prevBallX: number | null = null;
    let maxStepPx = 0;
    let minDxPx = Infinity;
    let renderedCount = 0;

    for (let tick = 1; tick <= 360; tick++) {
      const nowMs = tick * TICK_MS;
      const snap: GameStateSnapshot = {
        tick,
        phase: MatchPhase.PLAYING,
        matchTimer: 180,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          {
            id: 0,
            team: 0,
            x: (tick * ballSpeedX) / 60,
            y: 0,
            vx: ballSpeedX,
            vy: 0,
            flags: 0
          },
          {
            id: 2,
            team: 2,
            x: -100 + (tick * 120) / 60,
            y: 0,
            vx: 120,
            vy: 0,
            flags: 0,
            stamina: 100
          }
        ]
      };

      downLink.send(snap, nowMs, (arrivedSnap, arrivedAtMs) => {
        jb.push(arrivedSnap, arrivedAtMs);
      });
      downLink.flushDue(nowMs);

      const interp = jb.getInterpolatedSnapshot(nowMs);
      if (interp) {
        renderedCount++;
        const bx = interp.discs[0]!.x;
        expect(Number.isFinite(bx)).toBe(true);
        expect(jb.lastTimeScale).toBeGreaterThanOrEqual(JitterBuffer.PLL_MIN_SCALE);
        expect(jb.lastTimeScale).toBeLessThanOrEqual(JitterBuffer.PLL_MAX_SCALE);
        if (prevBallX !== null) {
          const dx = bx - prevBallX;
          if (dx < minDxPx) minDxPx = dx;
          if (Math.abs(dx) > maxStepPx) maxStepPx = Math.abs(dx);
        }
        prevBallX = bx;
      }
    }

    expect(renderedCount).toBeGreaterThan(220);
    expect(jb.pllHardResetCount).toBe(0);
    expect(jb.targetDelay).toBeGreaterThan(30);
    expect(jb.targetDelay).toBeLessThanOrEqual(140);
    // Cero saltos hacia atrás ni teletransportes bruscos
    expect(minDxPx).toBeGreaterThanOrEqual(-0.5);
    expect(maxStepPx).toBeLessThan(12);

    // Verificar protección de underflow (máx 60 ms con amortiguación exponencial) al pausar paquetes 500 ms
    const lastBufferedX = jb.buffer[jb.buffer.length - 1]!.snapshot.discs[0]!.x;
    const staleNowBase = 360 * TICK_MS;
    const duringUnderflow = jb.getInterpolatedSnapshot(staleNowBase + 160);
    const farUnderflow = jb.getInterpolatedSnapshot(staleNowBase + 260);
    expect(duringUnderflow).not.toBeNull();
    expect(farUnderflow).not.toBeNull();
    // Max desplazamiento acotado por la integral de 60 ms con decaimiento exponencial (< 15 px vs 240 px/s)
    expect(farUnderflow!.discs[0]!.x - lastBufferedX).toBeLessThanOrEqual(15);
    expect(farUnderflow!.discs[0]!.x - lastBufferedX).toBeGreaterThanOrEqual(0);
    expect(farUnderflow!.discs[0]!.vx).toBeLessThan(ballSpeedX * 0.25);

    // Hard reset SÓLO si la deriva/salto supera 300 ms
    jb.push(
      {
        tick: 900,
        phase: MatchPhase.PLAYING,
        matchTimer: 165,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 0, team: 0, x: 100, y: 0, vx: 0, vy: 0, flags: 0 }]
      },
      staleNowBase + 800
    );
    jb.getInterpolatedSnapshot(staleNowBase + 816);
    expect(jb.pllHardResetCount).toBeGreaterThanOrEqual(1);
  });

  it('Test 2 (ClientPrediction a 260 ms RTT): re-simula los 16 inputs en vuelo con stepPlayerKinematics, 0 falsos resets y error < 0.1 px', () => {
    const stadium = createStadium('mediano');

    // A. Sobrecarga EngineInstance con 16 inputs en vuelo (~267 ms RTT) incluyendo Movimiento, Turbo y Dash
    const hostEngine = new EngineInstance(stadium);
    hostEngine.isPracticeMode = true;
    hostEngine.startMatch(false);
    hostEngine.fsm.startPlaying();
    const hostP = hostEngine.addPlayer(2, 'red');
    hostP.pos.set(-150, 0);
    hostEngine.ball.pos.set(450, 200);

    const predEngine = new EngineInstance(stadium);
    predEngine.isPracticeMode = true;
    predEngine.startMatch(false);
    predEngine.fsm.startPlaying();
    predEngine.setState(hostEngine.getState());

    const kinematicsCfg = { ...(hostEngine.modifiers as any), playerFriction: hostP.damping };
    const reconciler = new ClientPredictionReconciler();
    const inputMap = new Map<number, PlayerInput>();
    const predStateOnly: PlayerKinematicsState = {
      pos: { x: -150, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 15,
      stamina: 100,
      staminaIdleTimer: 0,
      staminaRegenUnlocked: false,
      isDashing: false,
      dashTicksRemaining: 0,
      dashCooldownTimer: 0,
      dashSlowdownTimer: 0,
      dashDirX: 0,
      dashDirY: 0,
      isTurbo: false,
      kicking: false,
      prevDashState: false,
      team: 'red'
    };

    const reconcilerOnly = new ClientPredictionReconciler();
    reconcilerOnly.predictedState.pos.set(-150, 0);
    reconcilerOnly.predictedState.vel.set(0, 0);
    reconcilerOnly.predictedState.team = 'red';

    const TOTAL_TICKS = 40;
    const ACKED_TICK = 24; // 40 - 24 = 16 inputs pendientes en vuelo (~267 ms RTT)
    let snapshotAt24!: GameStateSnapshot;

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      let mask = INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO;
      if (tick === 28) mask |= INPUT_FLAG_DASH; // Dash dentro de la ventana de los 16 inputs en vuelo

      const seq = reconciler.recordInput(tick, mask, null, 0);
      reconcilerOnly.recordInput(tick, mask, null, 0);

      inputMap.clear();
      inputMap.set(2, { inputMask: mask, sequence: seq } as any);
      hostEngine.step(inputMap);
      predEngine.step(inputMap, true);
      stepPlayerKinematics(predStateOnly, { inputMask: mask }, stadium, null, kinematicsCfg, 1 / 60);
      reconcilerOnly.predictedState.pos.x = predStateOnly.pos.x;
      reconcilerOnly.predictedState.pos.y = predStateOnly.pos.y;
      reconcilerOnly.predictedState.vel.x = predStateOnly.vel.x;
      reconcilerOnly.predictedState.vel.y = predStateOnly.vel.y;

      if (tick === ACKED_TICK) {
        snapshotAt24 = BinaryProtocol.decodeSnapshot(BinaryProtocol.encodeSnapshot(hostEngine.getState()))!;
      }
    }

    // Primera llamada verifica exactitud determinista en los 16 ticks en vuelo
    const resEngine = reconciler.reconcile(predEngine, snapshotAt24, 2);

    expect(resEngine.replayed).toBe(true);
    expect(resEngine.replayedTicks).toBe(16);
    expect(resEngine.hardSnapped).toBe(false);

    // Medir rendimiento en régimen estable (post-JIT, como en el bucle real de 60 Hz)
    const t0 = performance.now();
    reconciler.reconcile(predEngine, snapshotAt24, 2);
    const elapsedMs = performance.now() - t0;
    expect(elapsedMs).toBeLessThan(5);

    const resimP = predEngine.players.get(2)!;
    const errEnginePx = Math.hypot(resimP.pos.x - hostP.pos.x, resimP.pos.y - hostP.pos.y);
    expect(errEnginePx).toBeLessThan(0.1);

    // Misma verificación para la sobrecarga directa de snapshot + Stadium
    const resStateOnly = reconcilerOnly.reconcile(snapshotAt24, 2, stadium, null, kinematicsCfg);
    expect(resStateOnly.replayed).toBe(true);
    expect(resStateOnly.replayedTicks).toBe(16);
    expect(resStateOnly.hardSnapped).toBe(false);
    const errStateOnlyPx = Math.hypot(
      reconcilerOnly.predictedState.pos.x - hostP.pos.x,
      reconcilerOnly.predictedState.pos.y - hostP.pos.y
    );
    expect(errStateOnlyPx).toBeLessThan(0.1);

    // Umbral catastrófico elevado a > 120 px: 100 px no dispara hard-snap; 140 px sí
    predEngine.players.get(2)!.pos.x += 100;
    const resNonCatastrophic = reconciler.reconcile(predEngine, snapshotAt24, 2);
    expect(resNonCatastrophic.hardSnapped).toBe(false);

    predEngine.players.get(2)!.pos.x += 140;
    const resCatastrophic = reconciler.reconcile(predEngine, snapshotAt24, 2);
    expect(resCatastrophic.hardSnapped).toBe(true);
    // Tampoco vacía pendingInputs ante discrepancias en fase PLAYING
    expect(reconciler.pendingInputs.length).toBe(16);
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
        if (dash) {
          appliedDashes++;
        }
        prevAppliedSeq = seq;
        prevAppliedKick = kick;
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

  it('Test 4 (/netmode, /simlag & extrapolateAllDiscs): switches modes with persistence, toggles live impairment, and extrapolates local + ball uniformly in classic mode', () => {
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
      expect(gameUI.handleChatCommand('/netmode predicted')).toBe(true);
      expect(gameUI.settings.netMode).toBe('predicted');
      expect(store.get(LEGACYX_NET_MODE_KEY)).toBe('predicted');

      expect(gameUI.handleChatCommand('/netmode classic')).toBe(true);
      expect(gameUI.settings.netMode).toBe('classic');
      expect(store.get(LEGACYX_NET_MODE_KEY)).toBe('classic');

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

      // DiscRenderer en modo classic extrapola jugador local y balón de forma uniforme sin separateFrameDiscs
      const dr = new DiscRenderer();
      dr.setExtrapolation(100);
      dr.extrapolateAllDiscs = true;
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        clip: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        setLineDash: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
      } as unknown as CanvasRenderingContext2D;

      dr.render(
        mockCtx,
        [
          { id: 0, team: 0, x: 100, y: 0, vx: 120, vy: 0, radius: 8, avatar: '' },
          { id: 2, team: 2, x: 85, y: 0, vx: 120, vy: 0, radius: 15, avatar: '2' }
        ],
        2
      );
      const renderedBall = dr['frameRenderDiscs'][0]!;
      const renderedLocal = dr['frameRenderDiscs'][1]!;
      expect(renderedBall.x).toBeGreaterThan(100);
      expect(renderedLocal.x).toBeGreaterThan(85);
    } finally {
      (globalThis as any).localStorage = origStorage;
    }
  });
});
