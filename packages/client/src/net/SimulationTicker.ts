/**
 * SimulationTicker.ts
 * High-precision background simulation ticker for Host and Physics loop.
 * Uses a dedicated Web Worker to prevent browser tab throttling / suspension,
 * with graceful fallback to setInterval for environments where Worker is not present.
 */

export class SimulationTicker {
  private static readonly FIXED_STEP_MS = 1000 / 60;
  private static readonly MAX_ACCUMULATOR_MS = 100;

  private worker: Worker | null = null;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;
  private onTick: (now: number) => void;
  private isRunning: boolean = false;
  private blobUrl: string | null = null;
  private lastTime: number = 0;
  private accumulator: number = 0;

  constructor(onTick: (now: number) => void) {
    this.onTick = onTick;
  }

  private stepAccumulator(now: number): void {
    if (!this.isRunning) return;
    if (this.lastTime === 0) {
      this.lastTime = now;
      this.onTick(now);
      return;
    }

    let delta = now - this.lastTime;
    if (delta < 0) delta = 0;
    if (delta > SimulationTicker.MAX_ACCUMULATOR_MS) {
      delta = SimulationTicker.MAX_ACCUMULATOR_MS;
    }
    this.lastTime = now;
    this.accumulator += delta;

    while (this.accumulator >= SimulationTicker.FIXED_STEP_MS) {
      this.onTick(now);
      this.accumulator -= SimulationTicker.FIXED_STEP_MS;
    }
  }

  public start(): void {
    if (this.isRunning) {
      this.stop();
    }
    this.isRunning = true;
    this.lastTime = 0;
    this.accumulator = 0;

    if (typeof Worker !== 'undefined') {
      try {
        const workerCode = `
          var id = null;
          self.onmessage = function(e) {
            if (e.data && e.data.type === 'START') {
              if (id !== null) return;
              id = setInterval(function() {
                self.postMessage({ type: 'TICK', now: performance.now() });
              }, 1000 / 60);
            } else if (e.data && e.data.type === 'STOP') {
              if (id !== null) {
                clearInterval(id);
                id = null;
              }
            }
          };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.blobUrl = URL.createObjectURL(blob);
        this.worker = new Worker(this.blobUrl);
        this.worker.onmessage = (e: MessageEvent<{ type: string; now?: number }>) => {
          if (e.data?.type === 'TICK') {
            this.stepAccumulator(e.data.now ?? performance.now());
          }
        };
        this.worker.postMessage({ type: 'START' });
        return;
      } catch {
        // Fallback below
        this.worker = null;
      }
    }

    // Fallback for non-browser / test environments
    this.fallbackInterval = setInterval(() => {
      this.stepAccumulator(performance.now());
    }, 1000 / 60);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.lastTime = 0;
    this.accumulator = 0;

    if (this.worker) {
      this.worker.postMessage({ type: 'STOP' });
      this.worker.terminate();
      this.worker = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    if (this.fallbackInterval !== null) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }
}
