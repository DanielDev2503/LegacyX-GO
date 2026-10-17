import { lerp } from '../math/MathUtils';
import { BinaryProtocol, type GameStateSnapshot } from './BinaryProtocol';
import { type GameSnapshot, type DiscSnapshot } from '../game/GameState';
import { MatchPhase, toMatchPhase } from '../game/GameFSM';

export type AnySnapshot = GameSnapshot | GameStateSnapshot;
export type InterpolationMode = 'linear' | 'hermite';

export interface BufferedSnapshot<T extends AnySnapshot = any> {
  snapshot: T;
  receivedAt: number;
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

  // Jitter tracking & dynamic delay (RFC 3550 standard)
  public meanJitter: number = 0;
  public lastProcessedTick: number = 0;
  private lastArrival: number | null = null;
  private lastTick: number | null = null;

  public static readonly MIN_DELAY_MS = 16;
  public static readonly MAX_DELAY_MS = 60;

  constructor(interpolationDelayMs: number = 33, maxBufferSize: number = 30, isAdaptive: boolean = false) {
    this.interpolationDelayMs = interpolationDelayMs;
    this.maxBufferSize = maxBufferSize;
    this.isAdaptive = isAdaptive;
  }

  public setAdaptive(enabled: boolean): void {
    this.isAdaptive = enabled;
  }

  public setMatchState(state: MatchPhase | string | number): void {
    this.currentMatchState = state;
  }

  public calculateTargetDelay(): number {
    const raw = this.meanJitter * 1.5;
    return Math.max(JitterBuffer.MIN_DELAY_MS, Math.min(JitterBuffer.MAX_DELAY_MS, raw));
  }

  public get targetDelay(): number {
    return this.calculateTargetDelay();
  }

  public clear(): void {
    this.buffer = [];
    this.lastArrival = null;
    this.lastTick = null;
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

    const item: BufferedSnapshot<T> = { snapshot, receivedAt: now };

    if (this.lastProcessedTick > 0 && this.buffer.length > 0) {
      const latest = this.buffer[this.buffer.length - 1];
      if (snapshot.tick <= latest.snapshot.tick) {
        if (snapshot.tick < latest.snapshot.tick - 100) {
          this.clear();
        } else {
          return;
        }
      }
      this.buffer.push(item);
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
    now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  ): T | null {
    if (this.buffer.length === 0) return null;

    const latestSnapshot = this.buffer[this.buffer.length - 1].snapshot as any;
    const isGameSnapshot = latestSnapshot.matchPhase !== undefined || latestSnapshot.matchState !== undefined;

    if (isGameSnapshot) {
      const effectivePhase = typeof this.currentMatchState === 'number'
        ? this.currentMatchState
        : (this.currentMatchState ? toMatchPhase(this.currentMatchState) : (latestSnapshot.matchPhase ?? toMatchPhase(latestSnapshot.matchState)));

      const isSimulationActive = effectivePhase === MatchPhase.PLAYING ||
                                 effectivePhase === MatchPhase.GOAL_CELEBRATION ||
                                 effectivePhase === MatchPhase.VICTORY_CELEBRATION;

      if (!isSimulationActive) {
        const frozenDiscs: DiscSnapshot[] = latestSnapshot.discs.map((d: any) => ({
          ...d,
          vx: 0,
          vy: 0
        }));
        this.lastProcessedTick = Math.max(this.lastProcessedTick, latestSnapshot.tick);
        return {
          ...latestSnapshot,
          discs: frozenDiscs
        } as T;
      }
    }

    if (this.buffer.length === 1) {
      this.lastProcessedTick = Math.max(this.lastProcessedTick, this.buffer[0].snapshot.tick);
      return this.buffer[0].snapshot;
    }

    const renderTime = now - this.interpolationDelayMs;

    if (renderTime <= this.buffer[0].receivedAt) {
      this.lastProcessedTick = Math.max(this.lastProcessedTick, this.buffer[0].snapshot.tick);
      return this.buffer[0].snapshot;
    }

    let s0: BufferedSnapshot<T> | null = null;
    let s1: BufferedSnapshot<T> | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].receivedAt <= renderTime && this.buffer[i + 1].receivedAt >= renderTime) {
        s0 = this.buffer[i];
        s1 = this.buffer[i + 1];
        break;
      }
    }

    if (!s0 || !s1) {
      const latest = this.buffer[this.buffer.length - 1];
      this.lastProcessedTick = Math.max(this.lastProcessedTick, latest.snapshot.tick);
      const deltaSec = Math.max(0, (renderTime - latest.receivedAt) / 1000);
      if (deltaSec === 0) return latest.snapshot;

      const extrapolatedDiscs = (latest.snapshot as any).discs.map((d: any) => ({
        ...d,
        x: d.x + d.vx * deltaSec,
        y: d.y + d.vy * deltaSec
      }));

      return {
        ...latest.snapshot,
        discs: extrapolatedDiscs
      } as T;
    }

    const timeSpan = s1.receivedAt - s0.receivedAt;
    const alpha = timeSpan > 0 ? Math.max(0, Math.min(1, (renderTime - s0.receivedAt) / timeSpan)) : 0;
    const dtSec = Math.max(0.001, timeSpan / 1000);

    this.lastProcessedTick = Math.max(this.lastProcessedTick, s0.snapshot.tick);

    if (isGameSnapshot) {
      const s1DiscsById = new Map<number, any>();
      for (const d of (s1.snapshot as any).discs) {
        s1DiscsById.set(d.id, d);
      }

      const interpolatedDiscs: any[] = [];
      for (const d0 of (s0.snapshot as any).discs) {
        const d1 = s1DiscsById.get(d0.id);
        if (d1) {
          interpolatedDiscs.push({
            id: d0.id,
            team: d1.team,
            x: hermite(d0.x, d1.x, d0.vx, d1.vx, alpha, dtSec),
            y: hermite(d0.y, d1.y, d0.vy, d1.vy, alpha, dtSec),
            vx: lerp(d0.vx, d1.vx, alpha),
            vy: lerp(d0.vy, d1.vy, alpha),
            radius: d1.radius,
            kicking: d1.kicking,
            avatar: d1.avatar,
            stamina: d1.stamina,
            isDashing: d1.isDashing,
            isTurbo: d1.isTurbo,
            isTyping: d1.isTyping,
            isSpinActive: d1.isSpinActive,
            isCurvingAllowed: d1.isCurvingAllowed,
            isPowerShot: d1.isPowerShot,
            spin: d1.spin,
            lastKickerId: d1.lastKickerId,
            curveFactor: d1.curveFactor
          });
        } else {
          interpolatedDiscs.push(d0);
        }
      }

      return {
        ...s1.snapshot,
        discs: interpolatedDiscs
      } as T;
    }

    // Interpolación para GameStateSnapshot (EngineInstance)
    const s0Discs = new Map<number, any>();
    for (let i = 0; i < (s0.snapshot as any).discs.length; i++) {
      const d = (s0.snapshot as any).discs[i];
      s0Discs.set(d.id, d);
    }

    const interpolatedDiscs = (s1.snapshot as any).discs.map((d1: any) => {
      const d0 = s0Discs.get(d1.id);
      if (!d0) return d1;

      return {
        id: d1.id,
        team: d1.team,
        x: lerp(d0.x, d1.x, alpha),
        y: lerp(d0.y, d1.y, alpha),
        vx: lerp(d0.vx, d1.vx, alpha),
        vy: lerp(d0.vy, d1.vy, alpha),
        flags: d1.flags,
        spin: d1.spin !== undefined && d0.spin !== undefined ? lerp(d0.spin, d1.spin, alpha) : d1.spin
      };
    });

    const snap0 = s0.snapshot as any;
    const snap1 = s1.snapshot as any;
    return {
      tick: Math.round(lerp(snap0.tick, snap1.tick, alpha)),
      phase: snap1.phase,
      matchTimer: snap1.matchTimer,
      redScore: snap1.redScore,
      blueScore: snap1.blueScore,
      soundMask: snap1.soundMask,
      discs: interpolatedDiscs
    } as T;
  }

  public getInterpolatedState(
    now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  ): T | null {
    return this.getInterpolatedSnapshot(now);
  }
}
