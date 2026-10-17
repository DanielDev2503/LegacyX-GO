<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte';

  const HISTORY_SIZE = 40;
  const pingHistory = new Float32Array(HISTORY_SIZE);
  let headIndex = 0;

  let displayPing = $state(0);
  let displayFps = $state(60);
  let displayJitter = $state(0);
  let sparkCanvas = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    const interval = setInterval(() => {
      displayPing = Math.round(gameUI.pingMs);
      displayFps = Math.round(gameUI.fps);
      displayJitter = Math.round(gameUI.jitterMs);

      pingHistory[headIndex] = displayPing;
      headIndex = (headIndex + 1) % HISTORY_SIZE;

      if (sparkCanvas) {
        const ctx = sparkCanvas.getContext('2d');
        if (ctx) {
          const w = sparkCanvas.width;
          const h = sparkCanvas.height;
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = displayPing > 120 ? '#ff4757' : displayPing > 65 ? '#f59e0b' : '#00e5ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < HISTORY_SIZE; i++) {
            const idx = (headIndex + i) % HISTORY_SIZE;
            const val = pingHistory[idx] ?? 0;
            const x = (i / (HISTORY_SIZE - 1)) * w;
            const norm = val > 200 ? 1 : val / 200;
            const y = h - 2 - norm * (h - 4);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }, 250);

    return () => clearInterval(interval);
  });
</script>

{#if gameUI.settings.showStatsMonitor}
  <div class="telemetry-pill" aria-label="Telemetría de Red y FPS">
    <div class="metrics-col">
      <div class="metric">
        <span class="label">PING</span>
        <strong id="pingValue" class:warn={displayPing > 80}>{displayPing} ms</strong>
      </div>
      <div class="metric">
        <span class="label">FPS</span>
        <strong id="fpsValue">{displayFps}</strong>
      </div>
      <div class="metric">
        <span class="label">JIT</span>
        <strong>{displayJitter} ms</strong>
      </div>
    </div>
    <canvas bind:this={sparkCanvas} width="72" height="24" class="sparkline"></canvas>
  </div>
{/if}

<style>
  .telemetry-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.35rem 0.65rem;
    border-radius: 8px;
    background: rgba(10, 16, 26, 0.92);
    border: 1px solid rgba(0, 229, 255, 0.3);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 229, 255, 0.15);
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.72rem;
    color: #cbd5e1;
    pointer-events: none;
  }

  .metrics-col {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .metric {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .label {
    font-size: 0.62rem;
    color: #64748b;
    font-weight: 700;
  }

  strong {
    color: #00e5ff;
    font-weight: 800;
  }

  strong.warn {
    color: #f59e0b;
  }

  .sparkline {
    display: block;
    opacity: 0.9;
  }
</style>
