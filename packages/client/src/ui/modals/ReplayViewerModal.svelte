<script lang="ts">
  import { untrack } from 'svelte';
  import { createStadium } from '@legacyx/core';
  import { GameRenderer } from '../../renderer/GameRenderer.js';
  import type { PlayerVisualInfo } from '../../renderer/DiscRenderer.js';
  import { gameUI } from '../state/gameUI.svelte.js';
  import { matchRecorder, type LxrReplayFile } from '../../recorder/MatchRecorder.svelte.js';

  let replayCanvas = $state<HTMLCanvasElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  let isPlaying = $state(true);
  let playbackSpeed = $state<0.5 | 1 | 2>(1);
  let currentTimeSec = $state(0);
  let loadError = $state<string | null>(null);

  const activeReplay = $derived<LxrReplayFile | null>(matchRecorder.lastReplayData);
  const totalDuration = $derived(
    activeReplay && activeReplay.durationSeconds > 0
      ? activeReplay.durationSeconds
      : activeReplay && activeReplay.frames.length > 0
        ? Math.max(0.5, activeReplay.frames[activeReplay.frames.length - 1]!.t)
        : 0
  );

  function formatSec(sec: number): string {
    const clamped = Math.max(0, Math.floor(sec));
    const mins = Math.floor(clamped / 60)
      .toString()
      .padStart(2, '0');
    const secs = (clamped % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function closeModal(): void {
    isPlaying = false;
    gameUI.closeOverlay();
  }

  function handleWindowKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (e.code === 'Space') {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag !== 'INPUT' && tag !== 'BUTTON') {
        e.preventDefault();
        togglePlay();
      }
    }
  }

  function togglePlay(): void {
    if (!activeReplay || activeReplay.frames.length === 0) return;
    if (currentTimeSec >= totalDuration) {
      currentTimeSec = 0;
    }
    isPlaying = !isPlaying;
  }

  function seekTo(sec: number): void {
    currentTimeSec = Math.max(0, Math.min(totalDuration, sec));
  }

  async function onFileSelected(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    loadError = null;
    try {
      await matchRecorder.loadReplayFile(file);
      currentTimeSec = 0;
      isPlaying = true;
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'No se pudo cargar el archivo .lxr.';
    } finally {
      input.value = '';
    }
  }

  $effect(() => {
    const canvas = replayCanvas;
    const replay = activeReplay;
    if (!canvas || !replay || replay.frames.length === 0) return;

    return untrack(() => {
      const stadium = createStadium(replay.stadiumId || 'mediano');
      const playerInfos = new Map<number, PlayerVisualInfo>();
      for (const p of replay.players || []) {
        const kit = p.team === 'red' ? replay.redKit : replay.blueKit;
        playerInfos.set(p.id, {
          nickname: p.nickname,
          number: p.number ?? p.id,
          avatar: p.avatar || String(p.id),
          avatarType: (p.avatarType as 'emoji' | 'text' | 'letters') || 'letters',
          hasOutline: true,
          tertiaryColor: String((kit as Record<string, unknown> | undefined)?.tertiaryColor || '#ffffff'),
          kit
        });
      }

      const renderer = new GameRenderer(canvas, { stadium, playerInfos });
      renderer.safeAreaBottom = 0;
      renderer.chatHeight = 0;
      renderer.minimapEnabled = false;
      renderer.focusBallOnly = true;
      if (replay.redKit) renderer.discRenderer.redKit = replay.redKit;
      if (replay.blueKit) renderer.discRenderer.blueKit = replay.blueKit;

      const syncSize = () => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          renderer.resize(Math.round(rect.width), Math.round(rect.height));
        }
      };
      syncSize();
      window.addEventListener('resize', syncSize);

      let lastFrameTime = performance.now();
      let rafId = 0;

      const tickLoop = (now: number) => {
        const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
        lastFrameTime = now;

        if (isPlaying && totalDuration > 0) {
          const nextT = currentTimeSec + dt * playbackSpeed;
          if (nextT >= totalDuration) {
            currentTimeSec = totalDuration;
            isPlaying = false;
          } else {
            currentTimeSec = nextT;
          }
        }

        const frames = replay.frames;
        let idx = 0;
        let lo = 0;
        let hi = frames.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (frames[mid]!.t <= currentTimeSec) {
            idx = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        const f0 = frames[idx]!;
        const f1 = frames[Math.min(frames.length - 1, idx + 1)]!;
        const span = f1.t - f0.t;
        const alpha = span > 0.0001 ? Math.max(0, Math.min(1, (currentTimeSec - f0.t) / span)) : 1.0;

        renderer.render(f0.snapshot, f1.snapshot, alpha);
        rafId = requestAnimationFrame(tickLoop);
      };

      rafId = requestAnimationFrame(tickLoop);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', syncSize);
        renderer.destroy();
      };
    });
  });
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Reproductor de Repeticiones">
  <div class="replay-shell">
    <header class="replay-header">
      <div class="header-title">
        <svg class="icon-cyan" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <div>
          <h2>VISOR DE REPETICIÓN (.LXR)</h2>
          <p class="subtitle">
            {#if activeReplay}
              {activeReplay.roomName} · Estadio {activeReplay.stadiumId.toUpperCase()} · Marcador {activeReplay.redScore} - {activeReplay.blueScore}
            {:else}
              Carga un archivo .lxr o graba un partido en vivo con el botón REC
            {/if}
          </p>
        </div>
      </div>

      <div class="header-actions">
        <input
          bind:this={fileInputEl}
          type="file"
          accept=".lxr,application/json"
          class="sr-only"
          onchange={onFileSelected}
        />
        <button type="button" class="cyber-btn ghost" onclick={() => fileInputEl?.click()}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <span>CARGAR .LXR</span>
        </button>

        {#if matchRecorder.lastVideoUrl}
          <button type="button" class="cyber-btn accent" onclick={() => matchRecorder.downloadVideo()}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>VIDEO .{matchRecorder.lastVideoExt.toUpperCase()}</span>
          </button>
        {/if}

        {#if activeReplay}
          <button type="button" class="cyber-btn ghost" onclick={() => matchRecorder.downloadReplay()}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span>DESCARGAR .LXR</span>
          </button>
        {/if}

        <button type="button" class="close-btn" onclick={closeModal} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </header>

    {#if loadError}
      <div class="error-banner">{loadError}</div>
    {/if}

    <div class="viewport-box">
      {#if activeReplay && activeReplay.frames.length > 0}
        <canvas bind:this={replayCanvas} class="replay-canvas"></canvas>
      {:else}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#00e5ff" stroke-width="1.6">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="10 8 16 12 10 16 10 8"></polygon>
          </svg>
          <h3>Sin repetición cargada</h3>
          <p>Usa el botón <strong>REC</strong> dentro de un partido o abre un archivo <code>.lxr</code> guardado.</p>
          <button type="button" class="cyber-btn accent" onclick={() => fileInputEl?.click()}>
            SELECCIONAR ARCHIVO .LXR
          </button>
        </div>
      {/if}
    </div>

    {#if activeReplay && activeReplay.frames.length > 0}
      <footer class="controls-bar">
        <button type="button" class="play-btn" onclick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
          {#if isPlaying}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          {/if}
        </button>

        <span class="time-readout">{formatSec(currentTimeSec)} / {formatSec(totalDuration)}</span>

        <div class="timeline-wrap">
          <input
            type="range"
            min="0"
            max={totalDuration || 1}
            step="0.02"
            value={currentTimeSec}
            oninput={(e) => seekTo(Number((e.currentTarget as HTMLInputElement).value))}
            class="timeline-slider"
          />
          {#each activeReplay.goals as goal}
            {@const pct = totalDuration > 0 ? Math.min(99.5, Math.max(0.5, (goal.t / totalDuration) * 100)) : 0}
            <button
              type="button"
              class="goal-marker"
              class:red={goal.scoringTeam === 'red'}
              class:blue={goal.scoringTeam === 'blue'}
              style:left="{pct}%"
              title={`Gol ${goal.scorerName} (${formatSec(goal.t)}) — ${goal.redScore}-${goal.blueScore}`}
              onclick={() => seekTo(Math.max(0, goal.t - 1.5))}
            ></button>
          {/each}
        </div>

        <div class="speed-group" role="group" aria-label="Velocidad de reproducción">
          {#each [0.5, 1, 2] as spd}
            <button
              type="button"
              class="speed-chip"
              class:active={playbackSpeed === spd}
              onclick={() => (playbackSpeed = spd as 0.5 | 1 | 2)}
            >
              {spd}x
            </button>
          {/each}
        </div>
      </footer>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 95;
    background: rgba(5, 8, 17, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    pointer-events: auto;
  }

  .replay-shell {
    width: min(1100px, 96vw);
    height: min(720px, 90vh);
    background: #0b1019;
    border: 1px solid #1e2d42;
    border-top: 2px solid #00e5ff;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.78);
  }

  .replay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: #0e141e;
    border-bottom: 1px solid #1b2638;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .icon-cyan {
    color: #00e5ff;
    flex-shrink: 0;
  }

  .header-title h2 {
    margin: 0;
    font-family: 'Chivo', 'Space Grotesk', sans-serif;
    font-size: 0.98rem;
    letter-spacing: 0.06em;
    color: #f1f5f9;
  }

  .subtitle {
    margin: 0.1rem 0 0;
    font-size: 0.76rem;
    color: #8fa3bf;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .sr-only {
    display: none;
  }

  .cyber-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.42rem 0.75rem;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 5px;
    cursor: pointer;
    border: 1px solid #25364d;
    background: #131c2b;
    color: #dbe7f5;
    transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
  }

  .cyber-btn:hover {
    border-color: #00e5ff;
    color: #ffffff;
  }

  .cyber-btn.accent {
    background: #00e5ff;
    border-color: #00e5ff;
    color: #050811;
  }

  .cyber-btn.accent:hover {
    background: #3bf0ff;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    border: 1px solid #26354a;
    background: #121a27;
    color: #9fb2cc;
    cursor: pointer;
  }

  .close-btn:hover {
    border-color: #ff4757;
    color: #ff4757;
  }

  .error-banner {
    padding: 0.5rem 1rem;
    background: #2b1118;
    border-bottom: 1px solid #ff4757;
    color: #ff8a95;
    font-size: 0.8rem;
  }

  .viewport-box {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #050811;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .replay-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
    text-align: center;
    padding: 2rem;
    color: #9cb0ca;
  }

  .empty-state h3 {
    margin: 0;
    color: #f1f5f9;
    font-size: 1.05rem;
  }

  .empty-state p {
    margin: 0 0 0.4rem;
    font-size: 0.84rem;
    max-width: 380px;
  }

  .empty-state code {
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
  }

  .controls-bar {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.7rem 1rem;
    background: #0e141e;
    border-top: 1px solid #1b2638;
  }

  .play-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 1px solid #00e5ff;
    background: #09222d;
    color: #00e5ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .play-btn:hover {
    background: #00e5ff;
    color: #050811;
  }

  .time-readout {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: #d6e3f5;
    min-width: 96px;
    text-align: center;
  }

  .timeline-wrap {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    height: 28px;
  }

  .timeline-slider {
    width: 100%;
    accent-color: #00e5ff;
    cursor: pointer;
  }

  .goal-marker {
    position: absolute;
    top: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transform: translateX(-50%);
    border: 1.5px solid #ffffff;
    background: #ffd700;
    cursor: pointer;
    padding: 0;
  }

  .goal-marker.red {
    background: #ff4757;
  }

  .goal-marker.blue {
    background: #00e5ff;
  }

  .speed-group {
    display: flex;
    gap: 0.25rem;
    background: #080d15;
    padding: 3px;
    border-radius: 5px;
    border: 1px solid #1b2638;
  }

  .speed-chip {
    border: none;
    background: transparent;
    color: #8ea3bf;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 0.28rem 0.52rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .speed-chip.active {
    background: #00e5ff;
    color: #050811;
  }
</style>
