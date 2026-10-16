import { lerp } from '../math/MathUtils';
import { BinaryProtocol, type GameStateSnapshot, type CompactDiscState } from './BinaryProtocol';

export interface BufferedSnapshot {
  snapshot: GameStateSnapshot;
  receivedAt: number;
}

export class JitterBuffer {
  public buffer: BufferedSnapshot[] = [];
  public interpolationDelayMs: number;
  public maxBufferSize: number;
  public lastProcessedTick: number = 0;

  constructor(interpolationDelayMs: number = 33, maxBufferSize: number = 20) {
    this.interpolationDelayMs = interpolationDelayMs;
    this.maxBufferSize = maxBufferSize;
  }

  public clear(): void {
    this.buffer = [];
    this.lastProcessedTick = 0;
  }

  /**
   * Inserta un snapshot en el búfer. Admite tanto GameStateSnapshot como ArrayBuffer codificado.
   * Descarta duplicados y reordena paquetes llegados fuera de secuencia.
   */
  public push(raw: GameStateSnapshot | ArrayBuffer, now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now())): void {
    const snapshot = raw instanceof ArrayBuffer ? BinaryProtocol.decodeSnapshot(raw) : raw;
    if (!snapshot) return;

    // Descarte de paquetes obsoletos (más antiguos que el último tick procesado)
    if (this.lastProcessedTick > 0 && snapshot.tick < this.lastProcessedTick) {
      if (snapshot.tick < this.lastProcessedTick - 100) {
        // Reinicio de partida o wrap de ticks
        this.clear();
      } else {
        return;
      }
    }

    // Descarte de duplicados si ya existe un snapshot con el mismo tick en el búfer
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].snapshot.tick === snapshot.tick) {
        return;
      }
    }

    const item: BufferedSnapshot = { snapshot, receivedAt: now };

    // Inserción ordenada por número de tick (garantiza secuencia incluso con llegada desordenada)
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

    // Mantener tamaño máximo del búfer circular
    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Extrae el estado interpolado para el fotograma de renderizado actual.
   * Aplica un retardo fijo de interpolación (por defecto 33-50 ms).
   */
  public getInterpolatedSnapshot(now: number = (typeof performance !== 'undefined' ? performance.now() : Date.now())): GameStateSnapshot | null {
    if (this.buffer.length === 0) return null;

    if (this.buffer.length === 1) {
      this.lastProcessedTick = Math.max(this.lastProcessedTick, this.buffer[0].snapshot.tick);
      return this.buffer[0].snapshot;
    }

    const renderTime = now - this.interpolationDelayMs;

    // Si renderTime es anterior al snapshot más viejo, devolver el más viejo
    if (renderTime <= this.buffer[0].receivedAt) {
      this.lastProcessedTick = Math.max(this.lastProcessedTick, this.buffer[0].snapshot.tick);
      return this.buffer[0].snapshot;
    }

    // Si renderTime supera al snapshot más reciente, extrapolar linealmente con velocidades
    const latest = this.buffer[this.buffer.length - 1];
    if (renderTime >= latest.receivedAt) {
      this.lastProcessedTick = Math.max(this.lastProcessedTick, latest.snapshot.tick);
      const deltaSec = Math.max(0, (renderTime - latest.receivedAt) / 1000);
      if (deltaSec === 0) return latest.snapshot;

      const extrapolatedDiscs: CompactDiscState[] = latest.snapshot.discs.map((d) => ({
        ...d,
        x: d.x + d.vx * deltaSec,
        y: d.y + d.vy * deltaSec
      }));

      return {
        ...latest.snapshot,
        discs: extrapolatedDiscs
      };
    }

    // Buscar los dos snapshots consecutivos s0 y s1 que rodean renderTime
    let s0: BufferedSnapshot = this.buffer[0];
    let s1: BufferedSnapshot = this.buffer[1];

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].receivedAt <= renderTime && this.buffer[i + 1].receivedAt >= renderTime) {
        s0 = this.buffer[i];
        s1 = this.buffer[i + 1];
        break;
      }
    }

    const timeSpan = s1.receivedAt - s0.receivedAt;
    const alpha = timeSpan > 0 ? Math.max(0, Math.min(1, (renderTime - s0.receivedAt) / timeSpan)) : 0;

    this.lastProcessedTick = Math.max(this.lastProcessedTick, s0.snapshot.tick);

    // Mapear e interpolar discos entre s0 y s1
    const s0Discs = new Map<number, CompactDiscState>();
    for (let i = 0; i < s0.snapshot.discs.length; i++) {
      s0Discs.set(s0.snapshot.discs[i].id, s0.snapshot.discs[i]);
    }

    const interpolatedDiscs: CompactDiscState[] = s1.snapshot.discs.map((d1) => {
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

    return {
      tick: Math.round(lerp(s0.snapshot.tick, s1.snapshot.tick, alpha)),
      phase: s1.snapshot.phase,
      matchTimer: s1.snapshot.matchTimer,
      redScore: s1.snapshot.redScore,
      blueScore: s1.snapshot.blueScore,
      soundMask: s1.snapshot.soundMask,
      discs: interpolatedDiscs
    };
  }
}
