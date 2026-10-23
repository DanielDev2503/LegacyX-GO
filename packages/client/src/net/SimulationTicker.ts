/**
 * SimulationTicker.ts
 * High-precision background simulation ticker for Host and Physics loop.
 * Uses a dedicated Web Worker to prevent browser tab throttling / suspension,
 * with graceful fallback to setInterval for environments where Worker is not present.
 */

export class SimulationTicker {
  private worker: Worker | null = null;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;
  private onTick: (now: number) => void;
  private isRunning: boolean = false;
  private blobUrl: string | null = null;

  constructor(onTick: (now: number) => void) {
    this.onTick = onTick;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

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
            this.onTick(e.data.now ?? performance.now());
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
      this.onTick(performance.now());
    }, 1000 / 60);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

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
