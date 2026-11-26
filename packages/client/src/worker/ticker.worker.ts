/**
 * ticker.worker.ts
 * Dedicated high-frequency Web Worker ticker for 60 Hz deterministic game simulation.
 * Web Workers do not suffer from requestAnimationFrame pausing in background tabs or minimized windows.
 */

const TICK_INTERVAL_MS = 1000 / 60; // 16.666 ms
let timerId: ReturnType<typeof setTimeout> | null = null;
let running = false;
let nextTickAt = 0;

function runCompensatedTick(): void {
  if (!running) return;
  const now = performance.now();
  self.postMessage({ type: 'TICK', now });
  nextTickAt += TICK_INTERVAL_MS;
  if (now - nextTickAt > 100) {
    nextTickAt = now + TICK_INTERVAL_MS;
  }
  const delay = Math.max(1, nextTickAt - performance.now());
  timerId = setTimeout(runCompensatedTick, delay);
}

self.onmessage = (e: MessageEvent<{ type: 'START' | 'STOP' }>) => {
  if (e.data?.type === 'START') {
    if (running) return;
    running = true;
    nextTickAt = performance.now() + TICK_INTERVAL_MS;
    timerId = setTimeout(runCompensatedTick, TICK_INTERVAL_MS);
  } else if (e.data?.type === 'STOP') {
    running = false;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }
};
