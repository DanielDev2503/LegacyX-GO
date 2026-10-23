/**
 * ticker.worker.ts
 * Dedicated high-frequency Web Worker ticker for 60 Hz deterministic game simulation.
 * Web Workers do not suffer from requestAnimationFrame pausing in background tabs or minimized windows.
 */

const TICK_INTERVAL_MS = 1000 / 60; // 16.666 ms
let intervalId: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<{ type: 'START' | 'STOP' }>) => {
  if (e.data?.type === 'START') {
    if (intervalId !== null) return;
    intervalId = setInterval(() => {
      self.postMessage({ type: 'TICK', now: performance.now() });
    }, TICK_INTERVAL_MS);
  } else if (e.data?.type === 'STOP') {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
