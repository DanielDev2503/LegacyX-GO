<script lang="ts">
  import { createStadium } from '@legacyx/core';

  let {
    stadiumId = 'mediano',
    height = 120,
    showBadges = true
  }: {
    stadiumId?: string;
    height?: number;
    showBadges?: boolean;
  } = $props();

  const stadium = $derived.by(() => {
    try {
      return createStadium(stadiumId || 'mediano');
    } catch {
      return createStadium('mediano');
    }
  });

  const goalDepth = $derived(stadium.goalDepth ?? 32);
  const totalW = $derived(stadium.width + goalDepth * 2 + 64);
  const totalH = $derived(stadium.height + 56);
  const hw = $derived(stadium.halfWidth);
  const hh = $derived(stadium.halfHeight);
  const gh = $derived(stadium.goalHalfHeight);
  const cr = $derived(stadium.centerRadius || 70);
  const boxW = $derived(Math.min(hw * 0.34, 150));
  const boxH = $derived(Math.min(hh * 0.66, gh * 1.95));
  const bgPrimary = $derived(stadium.bgColor || '#1b5e20');
  const bgStripe = $derived(stadium.stripeColor || '#236b28');
  const lineCol = $derived(stadium.lineColor || '#e2e8f0');
</script>

<div class="stadium-preview-wrap" style={`height: ${height}px;`}>
  <svg
    class="stadium-svg"
    viewBox={`${-totalW / 2} ${-totalH / 2} ${totalW} ${totalH}`}
    preserveAspectRatio="xMidYMid meet"
    aria-label={`Previsualización real de estadio ${stadium.name}`}
  >
    <!-- Fondo exterior -->
    <rect
      x={-totalW / 2}
      y={-totalH / 2}
      width={totalW}
      height={totalH}
      rx="14"
      fill="#09101d"
      stroke="#1e2d48"
      stroke-width="4"
    />

    <!-- Césped con franjas proporcionales reales -->
    <rect x={-hw} y={-hh} width={stadium.width} height={stadium.height} fill={bgPrimary} />
    {#each [0, 1, 2, 3, 4, 5, 6, 7] as stripeIdx}
      {#if stripeIdx % 2 === 1}
        <rect
          x={-hw + (stadium.width / 8) * stripeIdx}
          y={-hh}
          width={stadium.width / 8}
          height={stadium.height}
          fill={bgStripe}
          opacity="0.75"
        />
      {/if}
    {/each}

    <!-- Áreas de penal -->
    <rect
      x={-hw}
      y={-boxH}
      width={boxW}
      height={boxH * 2}
      fill="none"
      stroke={lineCol}
      stroke-width="3.5"
      opacity="0.85"
    />
    <rect
      x={hw - boxW}
      y={-boxH}
      width={boxW}
      height={boxH * 2}
      fill="none"
      stroke={lineCol}
      stroke-width="3.5"
      opacity="0.85"
    />

    <!-- Perímetro real de la cancha -->
    <rect
      x={-hw}
      y={-hh}
      width={stadium.width}
      height={stadium.height}
      fill="none"
      stroke={lineCol}
      stroke-width="4.5"
    />

    <!-- Línea media y círculo central real -->
    <line x1="0" y1={-hh} x2="0" y2={hh} stroke={lineCol} stroke-width="4" />
    <circle cx="0" cy="0" r={cr} fill="none" stroke={lineCol} stroke-width="4" />
    <circle cx="0" cy="0" r="6" fill={lineCol} />

    <!-- Arcos izquierdo y derecho a escala exacta -->
    <rect
      x={-hw - goalDepth}
      y={-gh}
      width={goalDepth}
      height={gh * 2}
      fill="rgba(255, 71, 87, 0.18)"
      stroke="#ff4757"
      stroke-width="4"
    />
    <rect
      x={hw}
      y={-gh}
      width={goalDepth}
      height={gh * 2}
      fill="rgba(0, 229, 255, 0.18)"
      stroke="#00e5ff"
      stroke-width="4"
    />

    <!-- Postes reales del estadio -->
    {#each stadium.posts as post}
      <circle
        cx={post.pos.x}
        cy={post.pos.y}
        r={Math.max(post.radius, 7)}
        fill={post.color || '#ffffff'}
        stroke="#0a0e17"
        stroke-width="2.5"
      />
    {/each}
  </svg>

  {#if showBadges}
    <div class="stadium-meta-bar">
      <span class="meta-chip">{stadium.width} × {stadium.height} px</span>
      <span class="meta-chip">Arco {gh * 2} px</span>
    </div>
  {/if}
</div>

<style>
  .stadium-preview-wrap {
    position: relative;
    width: 100%;
    background: #080d18;
    border: 1px solid #1d2b44;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
  }

  .stadium-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .stadium-meta-bar {
    position: absolute;
    right: 8px;
    bottom: 6px;
    display: flex;
    gap: 6px;
    pointer-events: none;
  }

  .meta-chip {
    background: #0b1322;
    border: 1px solid #243656;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
  }
</style>
