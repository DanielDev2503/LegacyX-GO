/**
 * NetworkImpairmentSimulator.ts
 * Simulador sintético de condiciones adversas de red UDP/WebRTC (latencia, jitter,
 * pérdida de paquetes y reordenamiento) determinista para auditorías y tests automatizados.
 */

export interface NetworkImpairmentConfig {
  /** Latencia base unidireccional en ms (RTT = 2 * latencyMs). */
  latencyMs: number;
  /** Jitter pico-a-pico máximo en ms (±jitterMs / 2 sobre la latencia base). */
  jitterMs: number;
  /** Tasa de pérdida de paquetes [0..1] (ej. 0.10 = 10% packet loss). */
  packetLossRate: number;
  /** Probabilidad de reordenamiento UDP [0..1] (añade retardo extra para invertir orden). */
  reorderRate?: number;
  /** Semilla PRNG determinista para reproducibilidad exacta en CI/Vitest. */
  seed?: number;
  /** Permite inyectar una regla personalizada de descarte por índice de paquete enviado. */
  dropPredicate?: (packetIndex: number) => boolean;
}

interface QueuedPacket<T> {
  payload: T;
  deliverAtMs: number;
  seqOrder: number;
  deliver: (payload: T, arrivedAtMs: number) => void;
}

export class NetworkImpairmentSimulator<T = ArrayBuffer> {
  private readonly config: Required<Omit<NetworkImpairmentConfig, 'dropPredicate'>> & {
    dropPredicate?: (packetIndex: number) => boolean;
  };
  private prngState: number;
  private queue: Array<QueuedPacket<T>> = [];
  private seqCounter = 0;

  public sentCount = 0;
  public deliveredCount = 0;
  public droppedCount = 0;
  public reorderedCount = 0;

  constructor(config: NetworkImpairmentConfig) {
    this.config = {
      latencyMs: Math.max(0, config.latencyMs),
      jitterMs: Math.max(0, config.jitterMs),
      packetLossRate: Math.max(0, Math.min(1, config.packetLossRate)),
      reorderRate: Math.max(0, Math.min(1, config.reorderRate ?? 0)),
      seed: config.seed ?? 0x5f3759df,
      dropPredicate: config.dropPredicate
    };
    this.prngState = this.config.seed >>> 0;
  }

  /** PRNG Mulberry32 determinista en [0, 1) sin alocaciones. */
  private nextRandom(): number {
    let t = (this.prngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Encola un paquete saliente aplicando pérdida, latencia base, jitter y reordenamiento UDP.
   * Devuelve `true` si el paquete fue programado para entrega o `false` si se descartó.
   */
  public send(
    payload: T,
    nowMs: number,
    deliver: (payload: T, arrivedAtMs: number) => void
  ): boolean {
    const packetIdx = this.sentCount++;

    const shouldDrop = this.config.dropPredicate
      ? this.config.dropPredicate(packetIdx)
      : this.nextRandom() < this.config.packetLossRate;

    if (shouldDrop) {
      this.droppedCount++;
      return false;
    }

    const jitterOffset = (this.nextRandom() - 0.5) * this.config.jitterMs;
    let delayMs = Math.max(0, this.config.latencyMs + jitterOffset);

    if (this.config.reorderRate > 0 && this.nextRandom() < this.config.reorderRate) {
      // Retrasa este paquete 1–2 ticks adicionales para provocar inversión real de orden UDP
      delayMs += 18 + this.nextRandom() * 24;
      this.reorderedCount++;
    }

    const clonedPayload =
      payload instanceof ArrayBuffer ? (payload.slice(0) as unknown as T) : payload;

    this.queue.push({
      payload: clonedPayload,
      deliverAtMs: nowMs + delayMs,
      seqOrder: this.seqCounter++,
      deliver
    });
    return true;
  }

  /**
   * Entrega en orden de llegada todos los paquetes cuyo `deliverAtMs <= nowMs`.
   */
  public flushDue(nowMs: number): number {
    if (this.queue.length === 0) return 0;

    const ready: Array<QueuedPacket<T>> = [];
    const remaining: Array<QueuedPacket<T>> = [];
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i]!;
      if (item.deliverAtMs <= nowMs) {
        ready.push(item);
      } else {
        remaining.push(item);
      }
    }
    this.queue = remaining;

    ready.sort((a, b) => (a.deliverAtMs !== b.deliverAtMs ? a.deliverAtMs - b.deliverAtMs : a.seqOrder - b.seqOrder));

    for (let i = 0; i < ready.length; i++) {
      const pkt = ready[i]!;
      this.deliveredCount++;
      pkt.deliver(pkt.payload, pkt.deliverAtMs);
    }
    return ready.length;
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public getObservedLossRate(): number {
    return this.sentCount > 0 ? this.droppedCount / this.sentCount : 0;
  }

  public reset(): void {
    this.queue.length = 0;
    this.sentCount = 0;
    this.deliveredCount = 0;
    this.droppedCount = 0;
    this.reorderedCount = 0;
    this.seqCounter = 0;
    this.prngState = this.config.seed >>> 0;
  }
}
