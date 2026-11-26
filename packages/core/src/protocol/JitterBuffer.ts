import { lerp } from '../math/MathUtils';
import { BinaryProtocol, type GameStateSnapshot } from './BinaryProtocol';
import { type GameSnapshot, type DiscSnapshot } from '../game/GameState';
import { MatchPhase, toMatchPhase } from '../game/GameFSM';
import { clampDiscToGoalAwareBounds } from '../physics/ContinuousCollision';
import { DEFAULT_GAMEPLAY_CONFIG } from '../game/GameConfig';

export type AnySnapshot = GameSnapshot | GameStateSnapshot;
export type InterpolationMode = 'linear' | 'hermite';

export interface BufferedSnapshot<T extends AnySnapshot = any> {
  snapshot: T;
  receivedAt: number;
  timelineAt?: number;
}

/**
 * Spline cúbico Hermite con tangentes continuas de velocidad (C^1).
 * Suprime oscilaciones y saltos visuales durante transmisiones adaptativas a 30 Hz.
 */
export function hermite(p0: number, p1: number, v0: number, v1: number, t: number, dtSec: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const m0 = v0 * dtSec;
  const m1 = v1 * dtSec;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

export class JitterBuffer<T extends AnySnapshot = any> {
  public buffer: BufferedSnapshot<T>[] = [];
  public interpolationDelayMs: number;
  public maxBufferSize: number;
  public currentMatchState: MatchPhase | string | number | null = null;
  public isAdaptive: boolean;

  // Jitter tracking & dynamic delay (RFC 3550 standard) + Host clock synchronization
  public meanJitter: number = 0;
  public lastProcessedTick: number = 0;
  private lastArrival: number | null = null;
  private lastTick: number | null = null;
  private clockOffsetMs: number | null = null;

  public static readonly MIN_DELAY_MS = 28;
  public static readonly MAX_DELAY_MS = 100;
  public static readonly DEFAULT_AUTO_EXTRAPOLATION_MS = 200;
  public static readonly MAX_AUTO_EXTRAPOLATION_MS = 200;
  private static readonly TICK_MS = 1000 / 60;

  // Pools Zero-GC (anillo de 4 slots para evitar aliasing entre referencias simultáneas sin alocar)
  private readonly scratchDiscLookup = new Map<number, any>();
  private readonly scratchClampProxy = { x: 0, y: 0, vx: 0, vy: 0, radius: 15 };
  private readonly outSnapSlots: [Record<string, any>, Record<string, any>, Record<string, any>, Record<string, any>] = [
    { discs: [] },
    { discs: [] },
    { discs: [] },
    { discs: [] }
  ];
  private readonly outDiscListSlots: [any[], any[], any[], any[]] = [[], [], [], []];
  private readonly outDiscPools: [any[], any[], any[], any[]] = [[], [], [], []];
  private outSlotIndex = 0;

  public autoExtrapolationMs: number = JitterBuffer.DEFAULT_AUTO_EXTRAPOLATION_MS;
  public arenaBounds: {
    halfWidth: number;
    halfHeight: number;
    runOff?: number;
    goalHalfHeight?: number;
    goalDepth?: number;
    ballRadius?: number;
    playerRadius?: number;
  } | null = null;

  constructor(interpolationDelayMs: number = 25, maxBufferSize: number = 30, isAdaptive: boolean = false) {
    this.interpolationDelayMs = interpolationDelayMs;
    this.maxBufferSize = maxBufferSize;
    this.isAdaptive = isAdaptive;
  }

  public setAutoExtrapolationMs(ms: number): void {
    this.autoExtrapolationMs = Number.isFinite(ms)
      ? Math.max(0, Math.min(JitterBuffer.MAX_AUTO_EXTRAPOLATION_MS, ms))
      : 0;
  }

  public setArenaBounds(
    halfWidth: number,
    halfHeight: number,
    runOff: number = 0,
    goalHalfHeight: number = 0,
    goalDepth: number = 0,
    ballRadius?: number,
    playerRadius?: number
  ): void {
    this.arenaBounds = halfWidth > 0 && halfHeight > 0
      ? {
          halfWidth,
          halfHeight,
          runOff,
          goalHalfHeight,
          goalDepth,
          ...(ballRadius !== undefined ? { ballRadius } : {}),
          ...(playerRadius !== undefined ? { playerRadius } : {})
        }
      : null;
  }

  public setAdaptive(enabled: boolean): void {
    this.isAdaptive = enabled;
  }

  public setMatchState(state: MatchPhase | string | number): void {
    this.currentMatchState = state;
  }

  public calculateTargetDelay(): number {
    const raw = this.meanJitter * 2.5 + JitterBuffer.TICK_MS;
    return Math.max(JitterBuffer.MIN_DELAY_MS, Math.min(JitterBuffer.MAX_DELAY_MS, raw));
  }

  private acquireSlot(): { outSnap: Record<string, any>; outDiscs: any[]; pool: any[] } {
    const idx = this.outSlotIndex;
    this.outSlotIndex = (idx + 1) & 3;
    const outDiscs = this.outDiscListSlots[idx]!;
    outDiscs.length = 0;
    return {
      outSnap: this.outSnapSlots[idx]!,
      outDiscs,
      pool: this.outDiscPools[idx]!
    };
  }

  private borrowDisc(pool: any[], index: number): any {
    let slot = pool[index];
    if (!slot) {
      slot = {
        id: 0,
        team: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        flags: 0,
        radius: 15,
        kicking: false,
        avatar: '',
        stamina: 100,
        isDashing: false,
        isTurbo: false,
        isTyping: false,
        isSpinActive: false,
        isCurvingAllowed: false,
        isPowerShot: false,
        spin: 0,
        lastKickerId: undefined,
        curveFactor: undefined,
        lastAckedInputSeq: 0,
        dashTimer: 0,
        dashCooldown: 0
      };
      pool[index] = slot;
    }
    return slot;
  }

  private copyDiscInto(dst: any, src: any): void {
    dst.id = src.id;
    dst.team = src.team;
    dst.x = src.x;
    dst.y = src.y;
    dst.vx = src.vx;
    dst.vy = src.vy;
    dst.flags = src.flags;
    dst.radius = src.radius;
    dst.kicking = src.kicking;
    dst.avatar = src.avatar;
    dst.stamina = src.stamina;
    dst.isDashing = src.isDashing;
    dst.isTurbo = src.isTurbo;
    dst.isTyping = src.isTyping;
    dst.isSpinActive = src.isSpinActive;
    dst.isCurvingAllowed = src.isCurvingAllowed;
    dst.isPowerShot = src.isPowerShot;
    dst.spin = src.spin;
    dst.lastKickerId = src.lastKickerId;
    dst.curveFactor = src.curveFactor;
    dst.lastAckedInputSeq = src.lastAckedInputSeq;
    dst.dashTimer = src.dashTimer;
    dst.dashCooldown = src.dashCooldown;
  }

  private copySnapshotHeaderInto(dst: Record<string, any>, src: Record<string, any>, discs: any[]): any {
    dst.tick = src.tick;
    dst.phase = src.phase;
    dst.matchTimer = src.matchTimer;
    dst.redScore = src.redScore;
    dst.blueScore = src.blueScore;
    dst.soundMask = src.soundMask;
    dst.kickoffActive = src.kickoffActive;
    dst.isGoldenGoal = src.isGoldenGoal;
    dst.isNeutralKickoff = src.isNeutralKickoff;
    dst.kickoffPossessingTeam = src.kickoffPossessingTeam;
    dst.matchPhase = src.matchPhase;
    dst.matchState = src.matchState;
    dst.timerSeconds = src.timerSeconds;
    dst.matchTimerSeconds = src.matchTimerSeconds;
    dst.subStateTimer = src.subStateTimer;
    dst.countdownSeconds = src.countdownSeconds;
    dst.targetTeam = src.targetTeam;
    dst.scoreRed = src.scoreRed;
    dst.scoreBlue = src.scoreBlue;
    dst.kickoffMode = src.kickoffMode;
    dst.possessingTeam = src.possessingTeam;
    dst.discs = discs;
    return dst;
  }

  public get targetDelay(): number {
    return this.calculateTargetDelay();
  }

  public clear(): void {
    this.buffer = [];
    this.lastArrival = null;
    this.lastTick = null;
    this.clockOffsetMs = null;
  }

  public push(
    raw: T | ArrayBuffer,
    now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  ): void {
    const snapshot = (raw instanceof ArrayBuffer ? BinaryProtocol.decodeSnapshot(raw) : raw) as T | null;
    if (!snapshot) return;

    // Descarte de paquetes obsoletos una vez iniciada la reproducción
    if (this.lastProcessedTick > 0 && snapshot.tick < this.lastProcessedTick) {
      if (snapshot.tick < this.lastProcessedTick - 100) {
        this.clear();
        this.lastProcessedTick = snapshot.tick;
      } else {
        return;
      }
    }

    const snapAny = snapshot as any;
    const isGameSnapshot = snapAny.matchPhase !== undefined || snapAny.matchState !== undefined;

    if (isGameSnapshot) {
      const newPhase = snapAny.matchPhase !== undefined
        ? snapAny.matchPhase
        : (snapAny.matchState !== undefined ? toMatchPhase(snapAny.matchState) : this.currentMatchState);
      this.currentMatchState = newPhase;

      if (newPhase === MatchPhase.STOPPED) {
        this.clear();
        this.buffer.push({ snapshot, receivedAt: now });
        this.lastProcessedTick = snapshot.tick;
        return;
      }
    }

    // Descarte de duplicados
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].snapshot.tick === snapshot.tick) {
        return;
      }
    }

    // Cálculo dinámico de fluctuación (jitter RFC 3550)
    if (this.lastArrival !== null && this.lastTick !== null && snapshot.tick > this.lastTick) {
      const expectedDelta = (snapshot.tick - this.lastTick) * (1000 / 60);
      const actualDelta = now - this.lastArrival;
      const instantJitter = Math.abs(actualDelta - expectedDelta);

      if (this.meanJitter === 0) {
        this.meanJitter = instantJitter;
      } else {
        this.meanJitter = this.meanJitter * 0.85 + instantJitter * 0.15;
      }

      if (this.isAdaptive) {
        const target = this.calculateTargetDelay();
        this.interpolationDelayMs = this.interpolationDelayMs * 0.9 + target * 0.1;
      }
    }

    this.lastArrival = now;
    this.lastTick = snapshot.tick;

    // Sincronización simétrica y acotada del reloj lógico del Host (evita inversiones de timeline)
    const logicalMs = snapshot.tick * JitterBuffer.TICK_MS;
    const measuredOffset = now - logicalMs;
    if (this.clockOffsetMs === null || Math.abs(measuredOffset - this.clockOffsetMs) > 350) {
      this.clockOffsetMs = measuredOffset;
    } else {
      const err = measuredOffset - this.clockOffsetMs;
      const step = Math.max(-2.5, Math.min(2.5, err * 0.05));
      this.clockOffsetMs += step;
    }

    const item: BufferedSnapshot<T> = {
      snapshot,
      receivedAt: now,
      timelineAt: logicalMs + this.clockOffsetMs
    };

    if (this.lastProcessedTick > 0 && this.buffer.length > 0) {
      const latest = this.buffer[this.buffer.length - 1];
      if (snapshot.tick < latest.snapshot.tick - 100) {
        this.clear();
        this.clockOffsetMs = now - logicalMs;
        item.timelineAt = now;
        this.buffer.push(item);
      } else {
        // Insertar ordenado por tick (acepta paquetes desordenados si tick >= lastProcessedTick)
        let inserted = false;
        for (let i = this.buffer.length - 1; i >= 0; i--) {
          if (snapshot.tick > this.buffer[i].snapshot.tick) {
            this.buffer.splice(i + 1, 0, item);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          this.buffer.unshift(item);
        }
      }
    } else {
      // Inserción ordenada por número de tick cuando aún no ha corrido reproducción
      let inserted = false;
      for (let i = this.buffer.length - 1; i >= 0; i--) {
        if (snapshot.tick > this.buffer[i].snapshot.tick) {
          this.buffer.splice(i + 1, 0, item);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this.buffer.unshift(item);
      }
    }

    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  public getInterpolatedSnapshot(
    now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    arenaBounds?: { halfWidth: number; halfHeight: number; runOff?: number; goalHalfHeight?: number; goalDepth?: number } | null
  ): T | null {
    if (this.buffer.length === 0) return null;

    const latestSnapshot = this.buffer[this.buffer.length - 1].snapshot as any;
    const isGameSnapshot = latestSnapshot.matchPhase !== undefined || latestSnapshot.matchState !== undefined;
    const isBinarySnapshot = !isGameSnapshot && typeof latestSnapshot.phase === 'number';

    if (isGameSnapshot) {
      const effectivePhase = typeof this.currentMatchState === 'number'
        ? this.currentMatchState
        : (this.currentMatchState ? toMatchPhase(this.currentMatchState) : (latestSnapshot.matchPhase ?? toMatchPhase(latestSnapshot.matchState)));

      const isGoalReplay = Math.abs(Number(effectivePhase) - 3.5) < 0.01;
      const isSimulationActive = effectivePhase === MatchPhase.PLAYING ||
                                 effectivePhase === MatchPhase.GOAL_CELEBRATION ||
                                 effectivePhase === MatchPhase.VICTORY_CELEBRATION ||
                                 isGoalReplay;

      if (!isSimulationActive) {
        const { outSnap, outDiscs, pool } = this.acquireSlot();
        const srcDiscs = latestSnapshot.discs;
        for (let i = 0; i < srcDiscs.length; i++) {
          const dst = this.borrowDisc(pool, i);
          this.copyDiscInto(dst, srcDiscs[i]);
          dst.vx = 0;
          dst.vy = 0;
          outDiscs.push(dst);
        }
        this.lastProcessedTick = Math.max(this.lastProcessedTick, latestSnapshot.tick);
        return this.copySnapshotHeaderInto(outSnap, latestSnapshot, outDiscs) as T;
      }
    } else if (isBinarySnapshot) {
      const p = latestSnapshot.phase as number;
      const isGoalReplay = Math.abs(p - 3.5) < 0.01;
      const isForcedPaused = !isGoalReplay && (this.currentMatchState === 'PAUSED' || this.currentMatchState === 2.1 || this.currentMatchState === 2.2);
      const isBinarySimActive =
        !isForcedPaused && (p === 1 || p === 2 || p === 3 || isGoalReplay || p === 4);

      if (!isBinarySimActive) {
        const { outSnap, outDiscs, pool } = this.acquireSlot();
        const srcDiscs = latestSnapshot.discs;
        for (let i = 0; i < srcDiscs.length; i++) {
          const dst = this.borrowDisc(pool, i);
          this.copyDiscInto(dst, srcDiscs[i]);
          dst.vx = 0;
          dst.vy = 0;
          outDiscs.push(dst);
        }
        this.lastProcessedTick = Math.max(this.lastProcessedTick, latestSnapshot.tick);
        return this.copySnapshotHeaderInto(outSnap, latestSnapshot, outDiscs) as T;
      }
    }

    if (this.buffer.length === 1) {
      this.lastProcessedTick = Math.max(this.lastProcessedTick, this.buffer[0].snapshot.tick);
      return this.buffer[0].snapshot;
    }

    const renderTime = now - this.interpolationDelayMs;
    const getTime = (b: BufferedSnapshot<T>): number =>
      this.clockOffsetMs !== null
        ? b.snapshot.tick * JitterBuffer.TICK_MS + this.clockOffsetMs
        : (b.timelineAt !== undefined ? b.timelineAt : b.receivedAt);

    if (renderTime <= getTime(this.buffer[0])) {
      this.lastProcessedTick = Math.max(this.lastProcessedTick, this.buffer[0].snapshot.tick);
      return this.buffer[0].snapshot;
    }

    let s0: BufferedSnapshot<T> | null = null;
    let s1: BufferedSnapshot<T> | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      const t0 = getTime(this.buffer[i]);
      const t1 = getTime(this.buffer[i + 1]);
      if (t0 <= renderTime && t1 >= renderTime) {
        s0 = this.buffer[i];
        s1 = this.buffer[i + 1];
        break;
      }
    }

    if (!s0 || !s1) {
      const latest = this.buffer[this.buffer.length - 1];
      this.lastProcessedTick = Math.max(this.lastProcessedTick, latest.snapshot.tick);
      const rawDeltaSec = Math.max(0, (renderTime - getTime(latest)) / 1000);
      if (rawDeltaSec === 0) return latest.snapshot;

      // Extrapolación cinemática suave hasta autoExtrapolationMs (máx 200 ms) con decaimiento continuo de velocidad
      const maxExtrapSec = Math.max(0, Math.min(JitterBuffer.MAX_AUTO_EXTRAPOLATION_MS, this.autoExtrapolationMs)) / 1000;
      if (maxExtrapSec <= 0) return latest.snapshot;

      const fullSpeedSec = maxExtrapSec * 0.5;
      const tailSec = maxExtrapSec - fullSpeedSec;

      let effectiveDeltaSec: number;
      let decay: number;
      if (rawDeltaSec <= fullSpeedSec) {
        effectiveDeltaSec = rawDeltaSec;
        decay = 1.0;
      } else if (rawDeltaSec < maxExtrapSec && tailSec > 0) {
        const tailElapsed = rawDeltaSec - fullSpeedSec;
        effectiveDeltaSec = fullSpeedSec + tailElapsed * (1 - tailElapsed / (2 * tailSec));
        decay = Math.max(0, 1 - tailElapsed / tailSec);
      } else {
        effectiveDeltaSec = fullSpeedSec + 0.5 * tailSec;
        decay = 0;
      }

      const bounds = arenaBounds !== undefined ? arenaBounds : this.arenaBounds;
      const defaultBallR = (bounds as any)?.ballRadius ?? DEFAULT_GAMEPLAY_CONFIG.ballRadius;
      const defaultPlayerR = (bounds as any)?.playerRadius ?? DEFAULT_GAMEPLAY_CONFIG.playerRadius;
      const { outSnap, outDiscs, pool } = this.acquireSlot();
      const srcDiscs = (latest.snapshot as any).discs;
      const proxy = this.scratchClampProxy;

      for (let i = 0; i < srcDiscs.length; i++) {
        const d = srcDiscs[i];
        const vx = d.vx || 0;
        const vy = d.vy || 0;
        let nextX = d.x + vx * effectiveDeltaSec;
        let nextY = d.y + vy * effectiveDeltaSec;
        let nextVx = vx * decay;
        let nextVy = vy * decay;

        if (bounds && bounds.halfWidth > 0 && bounds.halfHeight > 0) {
          const r = typeof d.radius === 'number' && d.radius > 0
            ? d.radius
            : (d.id === 0 || d.team === 0 ? defaultBallR : defaultPlayerR);
          const isPlayer = d.id !== 0 && d.team !== 0;
          const runOff = isPlayer ? (bounds.runOff ?? 0) : 0;
          const goalHalfHeight = bounds.goalHalfHeight ?? 0;
          const goalDepth = bounds.goalDepth ?? 0;

          proxy.x = nextX;
          proxy.y = nextY;
          proxy.vx = nextVx;
          proxy.vy = nextVy;
          proxy.radius = r;
          clampDiscToGoalAwareBounds(proxy, bounds.halfWidth, bounds.halfHeight, goalHalfHeight, goalDepth, runOff);
          nextX = proxy.x;
          nextY = proxy.y;
          nextVx = proxy.vx;
          nextVy = proxy.vy;
        }

        const dst = this.borrowDisc(pool, i);
        this.copyDiscInto(dst, d);
        dst.x = nextX;
        dst.y = nextY;
        dst.vx = nextVx;
        dst.vy = nextVy;
        outDiscs.push(dst);
      }

      return this.copySnapshotHeaderInto(outSnap, latest.snapshot as any, outDiscs) as T;
    }

    const t0 = getTime(s0);
    const t1 = getTime(s1);
    const timeSpan = t1 - t0;
    const alpha = timeSpan > 0 ? Math.max(0, Math.min(1, (renderTime - t0) / timeSpan)) : 0;
    const dtSec = Math.max(0.001, timeSpan / 1000);

    this.lastProcessedTick = Math.max(this.lastProcessedTick, s0.snapshot.tick);

    if (isGameSnapshot) {
      this.scratchDiscLookup.clear();
      const s1Discs = (s1.snapshot as any).discs;
      for (let i = 0; i < s1Discs.length; i++) {
        const d = s1Discs[i];
        this.scratchDiscLookup.set(d.id, d);
      }

      const { outSnap, outDiscs, pool } = this.acquireSlot();
      const s0DiscsArr = (s0.snapshot as any).discs;
      for (let i = 0; i < s0DiscsArr.length; i++) {
        const d0 = s0DiscsArr[i];
        const d1 = this.scratchDiscLookup.get(d0.id);
        const dst = this.borrowDisc(pool, i);
        if (d1) {
          const jumpDist = Math.hypot(d1.x - d0.x, d1.y - d0.y);
          const sameDirection = (d0.vx * d1.vx + d0.vy * d1.vy) >= 0;
          const useHermite =
            jumpDist < 80 &&
            sameDirection &&
            Number.isFinite(d0.vx) &&
            Number.isFinite(d1.vx) &&
            Number.isFinite(d0.vy) &&
            Number.isFinite(d1.vy);
          this.copyDiscInto(dst, d1);
          dst.id = d0.id;
          dst.x = useHermite ? hermite(d0.x, d1.x, d0.vx, d1.vx, alpha, dtSec) : lerp(d0.x, d1.x, alpha);
          dst.y = useHermite ? hermite(d0.y, d1.y, d0.vy, d1.vy, alpha, dtSec) : lerp(d0.y, d1.y, alpha);
          dst.vx = lerp(d0.vx, d1.vx, alpha);
          dst.vy = lerp(d0.vy, d1.vy, alpha);
        } else {
          this.copyDiscInto(dst, d0);
        }
        outDiscs.push(dst);
      }

      return this.copySnapshotHeaderInto(outSnap, s1.snapshot as any, outDiscs) as T;
    }

    // Interpolación Zero-GC para GameStateSnapshot (EngineInstance) preservando metadatos FSM
    this.scratchDiscLookup.clear();
    const s0DiscsArr = (s0.snapshot as any).discs;
    for (let i = 0; i < s0DiscsArr.length; i++) {
      const d = s0DiscsArr[i];
      this.scratchDiscLookup.set(d.id, d);
    }

    const snap0 = s0.snapshot as any;
    const snap1 = s1.snapshot as any;
    const crossesReplayBoundary =
      snap0.phase !== snap1.phase &&
      (Math.abs(snap0.phase - 3.5) < 0.01 || Math.abs(snap1.phase - 3.5) < 0.01);

    const { outSnap, outDiscs, pool } = this.acquireSlot();
    const s1DiscsArr = snap1.discs;
    for (let i = 0; i < s1DiscsArr.length; i++) {
      const d1 = s1DiscsArr[i];
      const dst = this.borrowDisc(pool, i);
      this.copyDiscInto(dst, d1);

      if (!crossesReplayBoundary) {
        const d0 = this.scratchDiscLookup.get(d1.id);
        if (d0) {
          const jumpDist = Math.hypot(d1.x - d0.x, d1.y - d0.y);
          if (jumpDist <= 120) {
            const sameDirection = (d0.vx * d1.vx + d0.vy * d1.vy) >= 0;
            const useHermite =
              jumpDist < 80 &&
              sameDirection &&
              Number.isFinite(d0.vx) &&
              Number.isFinite(d1.vx) &&
              Number.isFinite(d0.vy) &&
              Number.isFinite(d1.vy);
            dst.x = useHermite ? hermite(d0.x, d1.x, d0.vx, d1.vx, alpha, dtSec) : lerp(d0.x, d1.x, alpha);
            dst.y = useHermite ? hermite(d0.y, d1.y, d0.vy, d1.vy, alpha, dtSec) : lerp(d0.y, d1.y, alpha);
            dst.vx = lerp(d0.vx, d1.vx, alpha);
            dst.vy = lerp(d0.vy, d1.vy, alpha);
            dst.spin = d1.spin !== undefined && d0.spin !== undefined ? lerp(d0.spin, d1.spin, alpha) : d1.spin;
            dst.stamina =
              d1.stamina !== undefined && d0.stamina !== undefined
                ? lerp(d0.stamina, d1.stamina, alpha)
                : (d1.stamina ?? 100);
          }
        }
      }
      outDiscs.push(dst);
    }

    this.copySnapshotHeaderInto(outSnap, snap1, outDiscs);
    outSnap.tick = Math.round(lerp(snap0.tick, snap1.tick, alpha));
    return outSnap as T;
  }

  public getInterpolatedState(
    now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    arenaBounds?: { halfWidth: number; halfHeight: number; runOff?: number; goalHalfHeight?: number; goalDepth?: number } | null
  ): T | null {
    return this.getInterpolatedSnapshot(now, arenaBounds);
  }
}
