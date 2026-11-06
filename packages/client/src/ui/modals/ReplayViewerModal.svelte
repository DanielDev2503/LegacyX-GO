<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte';
  import { matchRecorder, type LxrReplayDocument } from '../../recorder/MatchRecorder';
  import { createStadium } from '@legacyx/core';

  let replayDoc = $state<LxrReplayDocument | null>(matchRecorder.latestReplay);
  let isPlaying = $state<boolean>(true);
  let playbackSpeed = $state<number>(1);
  let currentFrameIdx = $state<number>(0);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  const totalFrames = $derived(replayDoc?.frames.length ?? 0);
  const currentFrame = $derived(
    replayDoc && replayDoc.frames.length > 0
      ? replayDoc.frames[Math.min(currentFrameIdx, replayDoc.frames.length - 1)]
      : null
  );
  const currentTimeSec = $derived(currentFrame ? currentFrame.t : 0);
  const totalDurationSec = $derived(
    replayDoc && replayDoc.frames.length > 0
      ? Math.max(1, replayDoc.frames[replayDoc.frames.length - 1].t)
      : (replayDoc?.durationSeconds ?? 1)
  );

  function renderFrameToCanvas() {
    if (!canvasEl || !replayDoc || !currentFrame) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const stadium = createStadium(replayDoc.stadiumId || 'mediano');
    const w = canvasEl.width;
    const h = canvasEl.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    const scale = Math.min((w - 60) / (stadium.width + 80), (h - 60) / (stadium.height + 60));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);

    // Césped
    ctx.fillStyle = stadium.bgColor || '#1b5e20';
    ctx.fillRect(-stadium.halfWidth, -stadium.halfHeight, stadium.width, stadium.height);

    // Líneas de cancha
    ctx.strokeStyle = stadium.lineColor || '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(-stadium.halfWidth, -stadium.halfHeight, stadium.width, stadium.height);
    ctx.beginPath();
    ctx.moveTo(0, -stadium.halfHeight);
    ctx.lineTo(0, stadium.halfHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, stadium.centerRadius || 70, 0, Math.PI * 2);
    ctx.stroke();

    // Arcos
    const gd = stadium.goalDepth || 32;
    const gh = stadium.goalHalfHeight || 64;
    ctx.strokeStyle = '#ff4757';
    ctx.strokeRect(-stadium.halfWidth - gd, -gh, gd, gh * 2);
    ctx.strokeStyle = '#00e5ff';
    ctx.strokeRect(stadium.halfWidth, -gh, gd, gh * 2);

    // Discos
    for (const d of currentFrame.discs) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      if (d.team === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffd700';
      } else if (d.team === 1) {
        ctx.fillStyle = '#ff4757';
        ctx.strokeStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#00e5ff';
        ctx.strokeStyle = '#ffffff';
      }
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  $effect(() => {
    renderFrameToCanvas();
  });

  $effect(() => {
    if (!isPlaying || !replayDoc || replayDoc.frames.length === 0) return;
    const intervalMs = Math.max(12, Math.round(33 / playbackSpeed));
    const timer = setInterval(() => {
      if (currentFrameIdx < replayDoc!.frames.length - 1) {
        currentFrameIdx += 1;
      } else {
        isPlaying = false;
      }
    }, intervalMs);
    return () => clearInterval(timer);
  });

  function jumpToGoal(goalTime: number) {
    if (!replayDoc) return;
    const idx = replayDoc.frames.findIndex((f) => f.t >= Math.max(0, goalTime - 2));
    if (idx >= 0) {
      currentFrameIdx = idx;
    }
  }

  async function handleFileUpload(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as LxrReplayDocument;
      if (parsed && Array.isArray(parsed.frames)) {
        matchRecorder.setLoadedReplay(parsed);
        replayDoc = parsed;
        currentFrameIdx = 0;
        isPlaying = true;
      }
    } catch {
      // Archivo inválido
    }
  }
</script>

<div class="replay-modal-backdrop" role="dialog" aria-modal="true">
  <div class="replay-modal-card">
    <header class="replay-header">
      <div class="title-block">
        <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <div>
          <h2>REPRODUCTOR DE PARTIDAS (.LXR / .WEBM)</h2>
          <p>{replayDoc ? `${replayDoc.roomName} — Estadio: ${replayDoc.stadiumId}` : 'Carga o graba una partida para reproducirla'}</p>
        </div>
      </div>
      <div class="header-actions">
        <input
          bind:this={fileInputEl}
          type="file"
          accept=".lxr,.json"
          class="hidden-file"
          onchange={handleFileUpload}
        />
        <button class="action-btn secondary" onclick={() => fileInputEl?.click()}>
          CARGAR .LXR
        </button>
        {#if matchRecorder.hasVideo}
          <button class="action-btn cyan" onclick={() => matchRecorder.downloadVideoWebm()}>
            DESCARGAR VIDEO (.WEBM)
          </button>
        {/if}
        {#if replayDoc}
          <button class="action-btn gold" onclick={() => matchRecorder.downloadReplayLxr(replayDoc)}>
            DESCARGAR REPLAY (.LXR)
          </button>
        {/if}
        <button class="close-btn" onclick={() => (gameUI.showReplayModal = false)}>CERRAR</button>
      </div>
    </header>

    {#if replayDoc && replayDoc.frames.length > 0}
      <div class="score-strip">
        <span class="team-red">ROJO {currentFrame?.redScore ?? replayDoc.redScore}</span>
        <span class="time-readout">{currentTimeSec.toFixed(1)}s / {totalDurationSec.toFixed(1)}s</span>
        <span class="team-blue">{currentFrame?.blueScore ?? replayDoc.blueScore} AZUL</span>
      </div>

      <div class="canvas-stage">
        <canvas bind:this={canvasEl} width="760" height="390"></canvas>
      </div>

      <div class="timeline-controls">
        <button class="play-btn" onclick={() => (isPlaying = !isPlaying)}>
          {isPlaying ? 'PAUSAR' : 'REPRODUCIR'}
        </button>

        <div class="scrubber-wrap">
          <input
            type="range"
            min="0"
            max={Math.max(0, totalFrames - 1)}
            bind:value={currentFrameIdx}
            class="scrubber-slider"
          />
          <div class="goal-markers">
            {#each replayDoc.goals as g}
              <button
                class="goal-pin {g.team}"
                style={`left: ${Math.min(98, Math.max(2, (g.t / totalDurationSec) * 100))}%`}
                title={`Gol ${g.team.toUpperCase()} (${g.t}s)`}
                onclick={() => jumpToGoal(g.t)}
              >
                G
              </button>
            {/each}
          </div>
        </div>

        <div class="speed-group">
          {#each [0.5, 1, 2] as spd}
            <button
              class="spd-btn"
              class:active={playbackSpeed === spd}
              onclick={() => (playbackSpeed = spd)}
            >
              {spd}x
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="empty-replay">
        <p>No hay una repetición activa en memoria. Usa el botón <strong>[ ● REC ]</strong> durante cualquier partido o carga un archivo <code>.lxr</code>.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .replay-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 9, 18, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2600;
    padding: 16px;
  }

  .replay-modal-card {
    width: 100%;
    max-width: 880px;
    background: #0d1526;
    border: 1px solid #00e5ff;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: #f1f5f9;
  }

  .replay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #1e2d48;
    padding-bottom: 10px;
  }

  .title-block {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .icon-svg {
    width: 24px;
    height: 24px;
    color: #00e5ff;
  }

  .title-block h2 {
    margin: 0;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 1rem;
    letter-spacing: 0.06em;
    color: #00e5ff;
  }

  .title-block p {
    margin: 2px 0 0;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .hidden-file {
    display: none;
  }

  .action-btn,
  .close-btn,
  .play-btn,
  .spd-btn {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 7px 11px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #2b3f63;
    background: #142038;
    color: #e2e8f0;
  }

  .action-btn.cyan {
    border-color: #00e5ff;
    color: #00e5ff;
  }

  .action-btn.gold {
    border-color: #ffd700;
    color: #ffd700;
  }

  .close-btn {
    border-color: #ff4757;
    color: #ff4757;
  }

  .score-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #080d18;
    border: 1px solid #1d2b44;
    padding: 6px 14px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
  }

  .team-red {
    color: #ff4757;
  }

  .team-blue {
    color: #00e5ff;
  }

  .time-readout {
    color: #ffd700;
  }

  .canvas-stage {
    background: #070b14;
    border: 1px solid #1e2d48;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    justify-content: center;
  }

  canvas {
    width: 100%;
    max-height: 390px;
    display: block;
  }

  .timeline-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .scrubber-wrap {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .scrubber-slider {
    width: 100%;
    accent-color: #00e5ff;
    cursor: pointer;
  }

  .goal-markers {
    position: relative;
    height: 18px;
  }

  .goal-pin {
    position: absolute;
    transform: translateX(-50%);
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 0.62rem;
    font-weight: 800;
    border: 1px solid #ffffff;
    cursor: pointer;
    padding: 0;
  }

  .goal-pin.red {
    background: #ff4757;
    color: #ffffff;
  }

  .goal-pin.blue {
    background: #00e5ff;
    color: #070b14;
  }

  .speed-group {
    display: flex;
    gap: 4px;
  }

  .spd-btn.active {
    background: #00e5ff;
    color: #070b14;
    border-color: #00e5ff;
  }

  .empty-replay {
    padding: 36px;
    text-align: center;
    color: #94a3b8;
    background: #080d18;
    border: 1px dashed #243656;
    border-radius: 6px;
  }
</style>
