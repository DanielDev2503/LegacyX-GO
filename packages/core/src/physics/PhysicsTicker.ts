/**
 * PhysicsTicker - Reloj fijo isomórfico a 60 Hz con protección contra espiral de la muerte (MAX_STEPS_PER_FRAME = 4).
 */
export class PhysicsTicker {
  private worker: any = null;
  public onTick?: (dt?: number) => void;
  public isRunning: boolean = false;
  public fixedStep: number = 1 / 60;
  public accumulator: number = 0;
  private lastTime: number = 0;

  constructor() {
    const g = globalThis as any;
    if (typeof g !== 'undefined' && typeof g.Worker === 'function' && typeof g.Blob === 'function' && typeof g.URL?.createObjectURL === 'function') {
      try {
        const workerCode = `
          let intervalId = null;
          self.onmessage = function(e) {
            if (e.data === 'START') {
              if (!intervalId) {
                intervalId = setInterval(function() {
                  self.postMessage('TICK');
                }, 1000 / 60);
              }
            } else if (e.data === 'STOP') {
              if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
              }
            }
          };
        `;
        const blob = new g.Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = g.URL.createObjectURL(blob);
        this.worker = new g.Worker(workerUrl);

        this.worker.onmessage = (e: { data: string }) => {
          if (e.data === 'TICK' && this.isRunning && this.onTick) {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const rawDelta = this.lastTime > 0 ? (now - this.lastTime) / 1000 : this.fixedStep;
            this.lastTime = now;
            this.update(rawDelta);
          }
        };
      } catch {
        this.worker = null;
      }
    }
  }

  public update(rawDelta: number): void {
    const maxDelta = 0.1; // 100 ms máximo
    const dt = Math.min(rawDelta, maxDelta);
    this.accumulator += dt;

    let steps = 0;
    const MAX_STEPS_PER_FRAME = 4;

    while (this.accumulator >= this.fixedStep && steps < MAX_STEPS_PER_FRAME) {
      if (this.onTick) {
        this.onTick(this.fixedStep);
      }
      this.accumulator -= this.fixedStep;
      steps++;
    }

    // Descartar exceso residual si el motor se quedó atrás
    if (this.accumulator >= this.fixedStep) {
      this.accumulator = 0;
    }
  }

  public start(): void {
    this.isRunning = true;
    this.accumulator = 0;
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.worker) {
      this.worker.postMessage('START');
    }
  }

  public stop(): void {
    this.isRunning = false;
    this.accumulator = 0;
    this.lastTime = 0;
    if (this.worker) {
      this.worker.postMessage('STOP');
    }
  }

  public destroy(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
