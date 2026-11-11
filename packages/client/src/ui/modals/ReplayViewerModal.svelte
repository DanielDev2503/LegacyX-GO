<script lang="ts">
  import { untrack } from 'svelte';
  import { createStadium } from '@legacyx/core';
  import { GameRenderer } from '../../renderer/GameRenderer.js';
  import type { PlayerVisualInfo } from '../../renderer/DiscRenderer.js';
  import { gameUI } from '../state/gameUI.svelte.js';
  import { userProfile, type UserReplayRow } from '../state/userProfile.svelte.js';
  import { matchRecorder, type LxrReplayFile } from '../../recorder/MatchRecorder.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let activeTab = $state<'player' | 'cloud'>('player');
  let replayCanvas = $state<HTMLCanvasElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  let isPlaying = $state(true);
  let playbackSpeed = $state<0.5 | 1 | 2>(1);
  let currentTimeSec = $state(0);
  let loadError = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let isActionLoading = $state(false);
  let viewerWidth = $state(1100);

  // Renombrado en la nube
  let renamingReplayId = $state<string | null>(null);
  let renamingNameValue = $state('');

  const activeReplay = $derived<LxrReplayFile | null>(matchRecorder.lastReplayData);
  const totalDuration = $derived(
    activeReplay && activeReplay.durationSeconds > 0
      ? activeReplay.durationSeconds
      : activeReplay && activeReplay.frames.length > 0
        ? Math.max(0.5, activeReplay.frames[activeReplay.frames.length - 1]!.t)
        : 0
  );

  let currentFrameSnapshot = $state<any>(null);
  let aspectScale = $derived(Math.min(1.15, Math.max(0.7, viewerWidth / 1280)));

  // Cargar lista de repeticiones en la nube al montar
  $effect(() => {
    if (userProfile.isAuthenticated) {
      untrack(() => {
        userProfile.fetchUserReplays();
      });
    }
  });

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
    } else if (e.code === 'Space' && activeTab === 'player') {
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
    statusMessage = null;
    try {
      await matchRecorder.loadReplayFile(file);
      currentTimeSec = 0;
      isPlaying = true;
      activeTab = 'player';
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'No se pudo cargar el archivo .lxr.';
    } finally {
      input.value = '';
    }
  }

  async function handlePlayCloudReplay(item: UserReplayRow): Promise<void> {
    soundFX.playUIClick();
    isActionLoading = true;
    loadError = null;
    statusMessage = `Descargando y descomprimiendo "${item.name}"...`;
    try {
      const replay = await userProfile.downloadUserReplay(item.storage_path);
      matchRecorder.loadReplayData(replay);
      currentTimeSec = 0;
      isPlaying = true;
      activeTab = 'player';
      statusMessage = null;
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error al descargar la repetición.';
      statusMessage = null;
    } finally {
      isActionLoading = false;
    }
  }

  async function handleSaveActiveToCloud(): Promise<void> {
    if (!activeReplay) return;
    soundFX.playUIClick();
    if (!userProfile.isAuthenticated) {
      loadError = 'Debes iniciar sesión para subir repeticiones a la nube.';
      return;
    }
    isActionLoading = true;
    loadError = null;
    statusMessage = 'Comprimiendo con GZIP y subiendo a Supabase Storage...';
    try {
      await userProfile.uploadUserReplay(activeReplay, activeReplay.roomName);
      statusMessage = '¡Repetición guardada exitosamente en la nube!';
      setTimeout(() => {
        if (statusMessage === '¡Repetición guardada exitosamente en la nube!') {
          statusMessage = null;
        }
      }, 3500);
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error al guardar repetición en la nube.';
      statusMessage = null;
    } finally {
      isActionLoading = false;
    }
  }

  async function handleDeleteCloudReplay(item: UserReplayRow): Promise<void> {
    soundFX.playUIClick();
    if (!confirm(`¿Eliminar la repetición "${item.name}" de la nube?`)) return;
    isActionLoading = true;
    try {
      await userProfile.deleteUserReplay(item.id, item.storage_path);
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error al eliminar repetición.';
    } finally {
      isActionLoading = false;
    }
  }

  function startRenaming(item: UserReplayRow): void {
    soundFX.playUIClick();
    renamingReplayId = item.id;
    renamingNameValue = item.name;
  }

  async function confirmRename(id: string): Promise<void> {
    soundFX.playUIClick();
    const clean = renamingNameValue.trim();
    if (!clean) return;
    isActionLoading = true;
    try {
      await userProfile.renameUserReplay(id, clean);
      renamingReplayId = null;
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error al renombrar.';
    } finally {
      isActionLoading = false;
    }
  }

  function cancelRename(): void {
    renamingReplayId = null;
  }

  async function handleDownloadCloudLxr(item: UserReplayRow): Promise<void> {
    soundFX.playUIClick();
    isActionLoading = true;
    try {
      const replay = await userProfile.downloadUserReplay(item.storage_path);
      matchRecorder.downloadReplay(replay);
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error al descargar archivo .lxr.';
    } finally {
      isActionLoading = false;
    }
  }

  $effect(() => {
    const canvas = replayCanvas;
    const replay = activeReplay;
    if (activeTab !== 'player' || !canvas || !replay || replay.frames.length === 0) return;

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
          viewerWidth = rect.width;
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
        currentFrameSnapshot = f0.snapshot;
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
        <svg class="icon-cyan" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <div>
          <h2>VISOR Y GESTOR DE REPETICIONES</h2>
          <p class="subtitle">
            {#if activeTab === 'player'}
              {#if activeReplay}
                {activeReplay.roomName} · Estadio {activeReplay.stadiumId.toUpperCase()} · Marcador {activeReplay.redScore} - {activeReplay.blueScore}
              {:else}
                Carga un archivo .lxr o selecciona una repetición de la nube
              {/if}
            {:else}
              Almacenamiento Cloud Supabase (GZIP Lossless) · Máx. 10 partidas guardadas
            {/if}
          </p>
        </div>
      </div>

      <!-- Pestañas de Vista -->
      <div class="view-tabs">
        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'player'}
          onclick={() => { soundFX.playUIClick(); activeTab = 'player'; }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>REPRODUCTOR</span>
        </button>
        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'cloud'}
          onclick={() => { soundFX.playUIClick(); activeTab = 'cloud'; userProfile.fetchUserReplays(); }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
          </svg>
          <span>EN LA NUBE ({userProfile.userReplays.length}/10)</span>
        </button>
      </div>

      <div class="header-actions">
        <input
          bind:this={fileInputEl}
          type="file"
          accept=".lxr,application/json"
          class="sr-only"
          onchange={onFileSelected}
        />

        {#if activeTab === 'player'}
          <button type="button" class="cyber-btn ghost" onclick={() => fileInputEl?.click()}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>CARGAR .LXR</span>
          </button>

          {#if activeReplay && userProfile.isAuthenticated}
            <button
              type="button"
              class="cyber-btn cloud-save"
              disabled={isActionLoading}
              onclick={handleSaveActiveToCloud}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
              </svg>
              <span>GUARDAR EN NUBE</span>
            </button>
          {/if}

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
      <div class="banner error-banner">{loadError}</div>
    {/if}
    {#if statusMessage}
      <div class="banner info-banner">{statusMessage}</div>
    {/if}

    <!-- CONTENIDO PRINCIPAL POR PESTAÑAS -->
    {#if activeTab === 'player'}
      <div class="viewport-box">
        {#if activeReplay && activeReplay.frames.length > 0}
          <canvas bind:this={replayCanvas} class="replay-canvas"></canvas>

          <!-- Marcador Superior Homologado Cyber-Pitch HUD -->
          <div class="replay-floating-hud" style="transform: scale({aspectScale});">
            <div class="replay-hud-scoreboard">
              <span
                class="replay-team-tag red"
                style="background: {activeReplay.redKit?.primaryColor || '#e74c3c'};"
              >
                {activeReplay.redKit?.tag || 'RED'}
              </span>
              <span class="replay-score-val">{currentFrameSnapshot?.redScore ?? activeReplay.redScore}</span>
              <span class="replay-score-sep">-</span>
              <span class="replay-score-val">{currentFrameSnapshot?.blueScore ?? activeReplay.blueScore}</span>
              <span
                class="replay-team-tag blue"
                style="background: {activeReplay.blueKit?.primaryColor || '#3498db'};"
              >
                {activeReplay.blueKit?.tag || 'BLU'}
              </span>
            </div>
            <div class="replay-hud-time">{formatSec(currentTimeSec)}</div>
          </div>
        {:else}
          <div class="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#00e5ff" stroke-width="1.6">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="10 8 16 12 10 16 10 8"></polygon>
            </svg>
            <h3>Sin repetición activa en reproducción</h3>
            <p>Abre un archivo local <code>.lxr</code> o ve a la pestaña <strong>EN LA NUBE</strong> para cargar tus grabaciones.</p>
            <div class="empty-actions">
              <button type="button" class="cyber-btn accent" onclick={() => fileInputEl?.click()}>
                SELECCIONAR ARCHIVO .LXR
              </button>
              {#if userProfile.isAuthenticated}
                <button type="button" class="cyber-btn ghost" onclick={() => { activeTab = 'cloud'; }}>
                  VER REPETICIONES EN LA NUBE
                </button>
              {/if}
            </div>
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

    {:else}
      <!-- PESTAÑA: REPETICIONES EN LA NUBE (SUPABASE STORAGE) -->
      <div class="cloud-replays-container">
        {#if !userProfile.isAuthenticated}
          <div class="auth-gate-box">
            <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#ffd700" stroke-width="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h3>AUTENTICACIÓN REQUERIDA</h3>
            <p>Debes iniciar sesión con tu cuenta registrada para acceder a tus repeticiones en la nube (hasta 10 partidas con compresión GZIP).</p>
            <button
              type="button"
              class="cyber-btn accent"
              onclick={() => {
                closeModal();
                gameUI.openModal('SETTINGS');
              }}
            >
              INICIAR SESIÓN / REGISTRARSE
            </button>
          </div>
        {:else}
          <!-- Barra de Cuota y Avisos -->
          <div class="quota-bar" class:quota-alert={userProfile.userReplays.length >= 9}>
            <div class="quota-info">
              <span class="quota-label">ALMACENAMIENTO DE REPETICIONES:</span>
              <span class="quota-num bold">{userProfile.userReplays.length} / 10</span>
              <span class="quota-type">(Compresión GZIP automática)</span>
            </div>
            {#if userProfile.userReplays.length >= 9}
              <div class="quota-warn-text">
                ⚠️ Límite casi alcanzado ({userProfile.userReplays.length}/10). Al subir una nueva repetición, la más antigua se eliminará automáticamente.
              </div>
            {/if}
          </div>

          {#if userProfile.isLoadingReplays}
            <div class="cloud-loading">
              <span class="spinner"></span>
              <span>Cargando repeticiones guardadas...</span>
            </div>
          {:else if userProfile.userReplays.length === 0}
            <div class="empty-cloud">
              <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="#8fa3bf" stroke-width="1.6">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
              </svg>
              <h4>No tienes repeticiones guardadas en la nube</h4>
              <p>Graba cualquier partido usando el botón <strong>REC</strong> y súbelo para revivir las mejores jugadas cuando quieras.</p>
              {#if activeReplay}
                <button
                  type="button"
                  class="cyber-btn accent"
                  disabled={isActionLoading}
                  onclick={handleSaveActiveToCloud}
                >
                  SUBIR REPETICIÓN ACTIVA AHORA
                </button>
              {/if}
            </div>
          {:else}
            <!-- Tabla de Repeticiones -->
            <div class="replays-table-wrap custom-scrollbar">
              <table class="replays-table">
                <thead>
                  <tr>
                    <th>NOMBRE</th>
                    <th>MARCADOR</th>
                    <th>ESTADIO</th>
                    <th>DURACIÓN</th>
                    <th>TAMAÑO</th>
                    <th>FECHA</th>
                    <th class="th-actions">ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {#each userProfile.userReplays as replay (replay.id)}
                    <tr>
                      <td class="td-name">
                        {#if renamingReplayId === replay.id}
                          <div class="rename-inline">
                            <input
                              type="text"
                              bind:value={renamingNameValue}
                              maxlength="60"
                              class="rename-input"
                            />
                            <button
                              type="button"
                              class="btn-sm accent"
                              disabled={isActionLoading}
                              onclick={() => confirmRename(replay.id)}
                            >
                              OK
                            </button>
                            <button type="button" class="btn-sm ghost" onclick={cancelRename}>
                              ✕
                            </button>
                          </div>
                        {:else}
                          <div class="name-display">
                            <span class="bold text-light">{replay.name}</span>
                            <button
                              type="button"
                              class="btn-rename-icon"
                              title="Renombrar repetición"
                              onclick={() => startRenaming(replay)}
                            >
                              ✎
                            </button>
                          </div>
                        {/if}
                      </td>
                      <td class="td-score">
                        <span class="tag-red-mini">{replay.red_acronym}</span>
                        <span class="score-num">{replay.red_score}</span>
                        <span class="score-sep">-</span>
                        <span class="score-num">{replay.blue_score}</span>
                        <span class="tag-blue-mini">{replay.blue_acronym}</span>
                      </td>
                      <td class="td-stadium">{replay.stadium_id.toUpperCase()}</td>
                      <td class="td-duration">{formatSec(replay.duration_seconds)}</td>
                      <td class="td-size">{(replay.file_size_bytes / 1024).toFixed(1)} KB</td>
                      <td class="td-date">{new Date(replay.created_at).toLocaleDateString()}</td>
                      <td class="td-actions">
                        <button
                          type="button"
                          class="action-btn play"
                          title="Reproducir partida"
                          disabled={isActionLoading}
                          onclick={() => handlePlayCloudReplay(replay)}
                        >
                          ▶
                        </button>
                        <button
                          type="button"
                          class="action-btn download"
                          title="Descargar archivo .lxr"
                          disabled={isActionLoading}
                          onclick={() => handleDownloadCloudLxr(replay)}
                        >
                          ⬇
                        </button>
                        <button
                          type="button"
                          class="action-btn delete"
                          title="Eliminar de la nube"
                          disabled={isActionLoading}
                          onclick={() => handleDeleteCloudReplay(replay)}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 95;
    background: rgba(5, 8, 17, 0.94);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    pointer-events: auto;
  }

  .replay-shell {
    width: min(1120px, 96vw);
    height: min(740px, 92vh);
    background: #0b1019;
    border: 1px solid #1e2d42;
    border-top: 2px solid #00e5ff;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
  }

  .replay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.65rem 1rem;
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
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    color: #f1f5f9;
  }

  .subtitle {
    margin: 0.1rem 0 0;
    font-size: 0.74rem;
    color: #8fa3bf;
  }

  .view-tabs {
    display: flex;
    gap: 0.35rem;
    background: #080d15;
    padding: 3px;
    border-radius: 6px;
    border: 1px solid #1b2638;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: transparent;
    border: none;
    color: #8fa3bf;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    color: #ffffff;
  }

  .tab-btn.active {
    background: #00e5ff;
    color: #050811;
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
    padding: 0.4rem 0.7rem;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 5px;
    cursor: pointer;
    border: 1px solid #25364d;
    background: #131c2b;
    color: #dbe7f5;
    transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
  }

  .cyber-btn:hover:not(:disabled) {
    border-color: #00e5ff;
    color: #ffffff;
  }

  .cyber-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cyber-btn.accent {
    background: #00e5ff;
    border-color: #00e5ff;
    color: #050811;
  }

  .cyber-btn.accent:hover:not(:disabled) {
    background: #3bf0ff;
  }

  .cyber-btn.cloud-save {
    background: #092e3b;
    border-color: #00e5ff;
    color: #00e5ff;
  }

  .cyber-btn.cloud-save:hover:not(:disabled) {
    background: #00e5ff;
    color: #050811;
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

  .banner {
    padding: 0.45rem 1rem;
    font-size: 0.78rem;
    font-family: 'Space Grotesk', sans-serif;
  }

  .error-banner {
    background: #2b1118;
    border-bottom: 1px solid #ff4757;
    color: #ff8a95;
  }

  .info-banner {
    background: #0d2836;
    border-bottom: 1px solid #00e5ff;
    color: #7ceeff;
  }

  .viewport-box {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #050811;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .replay-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* HUD Flotante del Replay */
  .replay-floating-hud {
    position: absolute;
    top: 14px;
    left: 50%;
    transform-origin: top center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    pointer-events: none;
    z-index: 10;
  }

  .replay-hud-scoreboard {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: #0b111c;
    border: 1px solid #223247;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  }

  .replay-team-tag {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    color: #ffffff;
  }

  .replay-score-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.15rem;
    font-weight: 900;
    color: #ffffff;
    min-width: 20px;
    text-align: center;
  }

  .replay-score-sep {
    font-size: 0.9rem;
    color: #64748b;
  }

  .replay-hud-time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    font-weight: 800;
    color: #00e5ff;
    background: #091322;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid #1a293e;
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
    max-width: 420px;
  }

  .empty-state code {
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
  }

  .empty-actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  .controls-bar {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.65rem 1rem;
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

  /* PESTAÑA CLOUD */
  .cloud-replays-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    background: #070b13;
  }

  .auth-gate-box {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    text-align: center;
    max-width: 440px;
    padding: 2rem;
    background: #0c121e;
    border: 1px solid #223247;
    border-radius: 8px;
  }

  .auth-gate-box h3 {
    margin: 0;
    color: #ffd700;
    font-size: 1.05rem;
    font-family: 'Space Grotesk', sans-serif;
  }

  .auth-gate-box p {
    margin: 0;
    font-size: 0.84rem;
    color: #94a3b8;
  }

  .quota-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.9rem;
    background: #0d1522;
    border: 1px solid #1e2c40;
    border-radius: 6px;
    margin-bottom: 0.8rem;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.78rem;
  }

  .quota-bar.quota-alert {
    background: #251614;
    border-color: #ff4757;
  }

  .quota-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .quota-label {
    color: #94a3b8;
  }

  .quota-num {
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
  }

  .quota-type {
    color: #64748b;
    font-size: 0.72rem;
  }

  .quota-warn-text {
    color: #ff9ca6;
    font-weight: 700;
  }

  .cloud-loading, .empty-cloud {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
    color: #8fa3bf;
    text-align: center;
    padding: 2rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(0, 229, 255, 0.2);
    border-top-color: #00e5ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .replays-table-wrap {
    flex: 1;
    overflow-y: auto;
    border: 1px solid #1c2738;
    border-radius: 6px;
    background: #0a0f18;
  }

  .replays-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.78rem;
    text-align: left;
  }

  .replays-table th {
    padding: 0.6rem 0.8rem;
    background: #111a28;
    color: #94a3b8;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #1f2d42;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .replays-table td {
    padding: 0.55rem 0.8rem;
    border-bottom: 1px solid #151e2b;
    color: #cbd5e1;
  }

  .replays-table tr:hover td {
    background: rgba(0, 229, 255, 0.04);
  }

  .name-display {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .btn-rename-icon {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 2px;
  }

  .btn-rename-icon:hover {
    color: #00e5ff;
  }

  .rename-inline {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .rename-input {
    background: #070c14;
    border: 1px solid #00e5ff;
    color: #ffffff;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 4px;
    width: 180px;
  }

  .btn-sm {
    padding: 2px 6px;
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #1e2c40;
    background: #121a27;
    color: #dbe7f5;
  }

  .btn-sm.accent {
    background: #00e5ff;
    color: #050811;
    border-color: #00e5ff;
  }

  .td-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
  }

  .tag-red-mini {
    background: #e74c3c;
    color: #ffffff;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.65rem;
    font-weight: 800;
  }

  .tag-blue-mini {
    background: #3498db;
    color: #ffffff;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.65rem;
    font-weight: 800;
  }

  .score-num {
    font-weight: 800;
    color: #ffffff;
    margin: 0 2px;
  }

  .score-sep {
    color: #64748b;
  }

  .td-stadium, .td-duration, .td-size, .td-date {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.74rem;
    color: #94a3b8;
  }

  .th-actions, .td-actions {
    text-align: right;
  }

  .td-actions {
    white-space: nowrap;
  }

  .action-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 1px solid #202d40;
    background: #0e1622;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.72rem;
    margin-left: 3px;
    transition: all 0.14s ease;
  }

  .action-btn:hover:not(:disabled) {
    border-color: #00e5ff;
    color: #ffffff;
  }

  .action-btn.play:hover:not(:disabled) {
    background: #00e5ff;
    color: #050811;
  }

  .action-btn.delete:hover:not(:disabled) {
    border-color: #ff4757;
    color: #ff4757;
  }

  .bold { font-weight: 700; }
  .text-light { color: #f1f5f9; }
</style>
