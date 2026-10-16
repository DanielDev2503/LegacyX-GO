<script lang="ts">
  import { pingCore, CORE_TICK_RATE, CORE_DT } from '@legacyx/core';

  const coreStatus = pingCore();
</script>

<main>
  <div class="card">
    <h1>LegacyX-GO</h1>
    <p class="subtitle">Simulador multijugador de fútbol físico P2P en tiempo real</p>
    <div class="status-box">
      <div class="indicator"></div>
      <span>{coreStatus}</span>
    </div>
    <div class="metrics">
      <div class="metric">
        <span class="label">Tick Rate:</span>
        <span class="value">{CORE_TICK_RATE} Hz</span>
      </div>
      <div class="metric">
        <span class="label">Delta Time (&Delta;t):</span>
        <span class="value">{CORE_DT.toFixed(4)} s</span>
      </div>
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #0b0f19;
    color: #f3f4f6;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }

  .card {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 12px;
    padding: 2.5rem;
    max-width: 520px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    text-align: center;
  }

  h1 {
    margin-top: 0;
    font-size: 2.25rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: #38bdf8;
  }

  .subtitle {
    color: #9ca3af;
    font-size: 0.95rem;
    margin-bottom: 2rem;
  }

  .status-box {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    background-color: #064e3b;
    border: 1px solid #059669;
    border-radius: 8px;
    color: #a7f3d0;
    font-weight: 500;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
  }

  .indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: #10b981;
    box-shadow: 0 0 8px #10b981;
  }

  .metrics {
    display: flex;
    justify-content: space-around;
    padding: 1rem;
    background-color: #1f2937;
    border-radius: 8px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #9ca3af;
    letter-spacing: 0.05em;
  }

  .value {
    font-weight: 600;
    color: #f9fafb;
    font-size: 1.1rem;
  }
</style>
