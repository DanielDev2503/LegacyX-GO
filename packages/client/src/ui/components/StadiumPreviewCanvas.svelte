<script lang="ts">
  import { StadiumRegistry } from '@legacyx/core';

  interface Props {
    stadiumId?: string;
    compact?: boolean;
  }

  let { stadiumId = 'mediano', compact = false }: Props = $props();

  const stadium = $derived(StadiumRegistry.getStadium(stadiumId || 'mediano'));
  const w = $derived(stadium.width || stadium.halfWidth * 2 || 1200);
  const h = $derived(stadium.height || stadium.halfHeight * 2 || 540);
  const hw = $derived(w / 2);
  const hh = $derived(h / 2);
  const gd = $derived(stadium.goalDepth || 35);
  const gh = $derived(stadium.goalHalfHeight || 70);
  const cr = $derived(stadium.centerRadius || 80);
  const pr = $derived(Math.max(6, stadium.postRadius || 8));
  const penW = $derived(Math.round(w * 0.085));
  const penH = $derived(Math.min(h - 24, gh * 2.85));

  const padX = $derived(gd + 26);
  const padY = 26;
  const vbMinX = $derived(-(hw + padX));
  const vbMinY = $derived(-(hh + padY));
  const vbW = $derived(w + padX * 2);
  const vbH = $derived(h + padY * 2);

  const stripeCount = $derived(Math.max(6, Math.min(14, Math.round(w / 110))));
  const stripeW = $derived(w / stripeCount);
</script>

<div class="stadium-preview-canvas" class:compact>
  <svg
    class="pitch-geometry-svg"
    viewBox="{vbMinX} {vbMinY} {vbW} {vbH}"
    preserveAspectRatio="xMidYMid meet"
    aria-label="Geometría real del estadio {stadium.name}"
  >
    <!-- Run-off exterior con el bgColor real del estadio -->
    <rect
      x={vbMinX}
      y={vbMinY}
      width={vbW}
      height={vbH}
      rx="18"
      fill={stadium.bgColor || '#0b1322'}
    />

    <!-- Superficie principal de juego -->
    <rect x={-hw} y={-hh} width={w} height={h} fill="#081221" />

    <!-- Franjas tácticas proporcionales al ancho real -->
    {#each Array.from({ length: stripeCount }, (_, i) => i) as idx}
      {#if idx % 2 === 0}
        <rect
          x={-hw + idx * stripeW}
          y={-hh}
          width={stripeW}
          height={h}
          fill="rgba(0, 229, 255, 0.032)"
        />
      {/if}
    {/each}

    <!-- Área penal izquierda (Rojo) -->
    <rect
      x={-hw}
      y={-penH / 2}
      width={penW}
      height={penH}
      fill="rgba(255, 0, 85, 0.07)"
      stroke="rgba(255, 0, 85, 0.48)"
      stroke-width="4"
    />

    <!-- Área penal derecha (Azul/Cian) -->
    <rect
      x={hw - penW}
      y={-penH / 2}
      width={penW}
      height={penH}
      fill="rgba(0, 229, 255, 0.07)"
      stroke="rgba(0, 229, 255, 0.48)"
      stroke-width="4"
    />

    <!-- Arco izquierdo real (goalDepth x goalSize) -->
    <rect
      x={-(hw + gd)}
      y={-gh}
      width={gd}
      height={gh * 2}
      rx="4"
      fill="rgba(255, 71, 87, 0.16)"
      stroke="#ff4757"
      stroke-width="4.5"
    />

    <!-- Arco derecho real (goalDepth x goalSize) -->
    <rect
      x={hw}
      y={-gh}
      width={gd}
      height={gh * 2}
      rx="4"
      fill="rgba(0, 229, 255, 0.16)"
      stroke="#00e5ff"
      stroke-width="4.5"
    />

    <!-- Perímetro reglamentario -->
    <rect
      x={-hw}
      y={-hh}
      width={w}
      height={h}
      fill="none"
      stroke="#93c5fd"
      stroke-opacity="0.65"
      stroke-width="5"
    />

    <!-- Línea media y círculo central real -->
    <line
      x1="0"
      y1={-hh}
      x2="0"
      y2={hh}
      stroke="#00e5ff"
      stroke-opacity="0.52"
      stroke-width="4.5"
    />
    <circle
      cx="0"
      cy="0"
      r={cr}
      fill="none"
      stroke="#00e5ff"
      stroke-opacity="0.58"
      stroke-width="4.5"
    />
    <circle cx="0" cy="0" r="8" fill="#00e5ff" />

    <!-- Esquinas reglamentarias -->
    <path
      d="M {-hw + 24} {-hh} A 24 24 0 0 1 {-hw} {-hh + 24}"
      fill="none"
      stroke="rgba(0, 229, 255, 0.45)"
      stroke-width="3.5"
    />
    <path
      d="M {hw - 24} {-hh} A 24 24 0 0 0 {hw} {-hh + 24}"
      fill="none"
      stroke="rgba(0, 229, 255, 0.45)"
      stroke-width="3.5"
    />
    <path
      d="M {-hw} {hh - 24} A 24 24 0 0 1 {-hw + 24} {hh}"
      fill="none"
      stroke="rgba(0, 229, 255, 0.45)"
      stroke-width="3.5"
    />
    <path
      d="M {hw} {hh - 24} A 24 24 0 0 0 {hw - 24} {hh}"
      fill="none"
      stroke="rgba(0, 229, 255, 0.45)"
      stroke-width="3.5"
    />

    <!-- 4 postes físicos reales -->
    <circle cx={-hw} cy={-gh} r={pr * 1.15} fill="#ff4757" stroke="#ffffff" stroke-width="3" />
    <circle cx={-hw} cy={gh} r={pr * 1.15} fill="#ff4757" stroke="#ffffff" stroke-width="3" />
    <circle cx={hw} cy={-gh} r={pr * 1.15} fill="#00e5ff" stroke="#ffffff" stroke-width="3" />
    <circle cx={hw} cy={gh} r={pr * 1.15} fill="#00e5ff" stroke="#ffffff" stroke-width="3" />
  </svg>

  {#if !compact}
    <span class="dims-chip">{w}×{h} · Arco {gh * 2}</span>
  {/if}
</div>

<style>
  .stadium-preview-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #060b14;
    overflow: hidden;
  }

  .pitch-geometry-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .dims-chip {
    position: absolute;
    top: 6px;
    right: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #0a1220;
    border: 1px solid rgba(0, 229, 255, 0.35);
    color: #93e8f8;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
    pointer-events: none;
  }
</style>
