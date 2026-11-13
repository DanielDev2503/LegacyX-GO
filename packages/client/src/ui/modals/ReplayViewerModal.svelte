<script lang="ts">
  import { untrack } from 'svelte';
  import { createStadium, type GameStateSnapshot, type StadiumId } from '@legacyx/core';
  import { GameRenderer } from '../../renderer/GameRenderer.js';
  import { gameUI } from '../state/gameUI.svelte.js';
  import { userProfile, type UserReplayRow } from '../state/userProfile.svelte.js';
  import {
    matchRecorder,
    type LxrBannerEvent,
    type LxrChatEntry,
    type LxrReplayFile,
    type LxrReplayV2
  } from '../../recorder/MatchRecorder.svelte.js';
  import {
    buildReplayPlayerInfos,
    computeReplayEffectiveZoom,
    exportReplayToWebm,
    getActiveReplayBanner,
    getVisibleReplayChat,
    isReplayTimerWarning,
    REPLAY_STAGE_HEIGHT,
    REPLAY_STAGE_WIDTH,
    sampleReplayFrame,
    triggerWebmDownload
  } from '../../recorder/ReplayHudCompositor.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let viewMode = $state<'list' | 'player'>('list');
  let stageWrapEl = $state<HTMLDivElement | null>(null);
  let replayCanvas = $state<HTMLCanvasElement | null>(null);

  let isPlaying = $state(true);
  let playbackSpeed = $state<0.5 | 1 | 2>(1);
  let currentTimeSec = $state(0);
  let followRecorder = $state(true);
  let stageWidth = $state(960);
  let stageHeight = $state(540);

  let loadError = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let isActionLoading = $state(false);
  let exportingReplayId = $state<string | null>(null);
  let exportProgress = $state<number>(0);

  // Renombrado y confirmación de borrado inline (sin window.confirm)
  let renamingReplayId = $state<string | null>(null);
  let renamingNameValue = $state('');
  let confirmDeleteId = $state<string | null>(null);

  const activeReplay = $derived<LxrReplayFile | null>(matchRecorder.lastReplayData);
  const activeReplayV2 = $derived<LxrReplayV2 | null>(
    activeReplay && activeReplay.magic === 'LXR2' ? (activeReplay as LxrReplayV2) : null
  );
  const canFollowRecorder = $derived(activeReplayV2?.recordingPlayerId != null);

  const totalDuration = $derived(
    activeReplay && activeReplay.durationSeconds > 0
      ? activeReplay.durationSeconds
      : activeReplay && activeReplay.frames.length > 0
        ? Math.max(0.5, activeReplay.frames[activeReplay.frames.length - 1]!.t)
        : 0
  );

  let currentFrameSnapshot = $state<GameStateSnapshot | null>(null);

  const hudScale = $derived(Math.max(0.25, stageWidth / REPLAY_STAGE_WIDTH));

  const redAcronym = $derived(
    String((activeReplay?.redKit as Record<string, unknown> | undefined)?.tag || 'RED').slice(0, 6)
  );
  const blueAcronym = $derived(
    String((activeReplay?.blueKit as Record<string, unknown> | undefined)?.tag || 'BLUE').slice(0, 6)
  );
  const redColor = $derived(
    String((activeReplay?.redKit as Record<string, unknown> | undefined)?.primaryColor || '#ef4444')
  );
  const blueColor = $derived(
    String((activeReplay?.blueKit as Record<string, unknown> | undefined)?.primaryColor || '#3b82f6')
  );

  const hudMatchTimer = $derived(currentFrameSnapshot?.matchTimer ?? activeReplayV2?.timeLimitSeconds ?? 0);
  const hudPhase = $derived(currentFrameSnapshot?.phase ?? 2);
  const hudIsGoldenGoal = $derived(Boolean(currentFrameSnapshot?.isGoldenGoal));
  const hudIsWarning = $derived(isReplayTimerWarning(hudMatchTimer, hudPhase, hudIsGoldenGoal));
  const hudRedScore = $derived(currentFrameSnapshot?.redScore ?? activeReplay?.redScore ?? 0);
  const hudBlueScore = $derived(currentFrameSnapshot?.blueScore ?? activeReplay?.blueScore ?? 0);

  const visibleChat = $derived<LxrChatEntry[]>(
    getVisibleReplayChat(activeReplayV2?.chatMessages, currentTimeSec)
  );
  const activeBanner = $derived(getActiveReplayBanner(activeReplayV2?.banners, currentTimeSec));

  // Cargar lista de repeticiones en la nube al montar o al cambiar autenticación
  $effect(() => {
    if (userProfile.isAuthenticated) {
      untrack(() => {
        void userProfile.fetchUserReplays();
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

  function formatHudClock(sec: number): string {
    const clamped = Math.max(0, Math.ceil(sec));
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

  function goToGatekeeper(): void {
    soundFX.playUIClick();
    closeModal();
    gameUI.navigateTo('GATEKEEPER');
  }

  function handleBackToList(): void {
    soundFX.playUIClick();
    isPlaying = false;
    viewMode = 'list';
    loadError = null;
    if (userProfile.isAuthenticated) {
      void userProfile.fetchUserReplays();
    }
  }

  function handleWindowKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (confirmDeleteId) {
        confirmDeleteId = null;
      } else if (renamingReplayId) {
        renamingReplayId = null;
      } else if (viewMode === 'player') {
        handleBackToList();
      } else {
        closeModal();
      }
    } else if (e.code === 'Space' && viewMode === 'player') {
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

  async function handleWatchCloudReplay(item: UserReplayRow): Promise<void> {
    if (isActionLoading || exportingReplayId) return;
    soundFX.playUIClick();
    isActionLoading = true;
    loadError = null;
    confirmDeleteId = null;
    statusMessage = `Cargando "${item.name}"...`;
    try {
      const replay = await userProfile.downloadUserReplay(item.storage_path);
      matchRecorder.loadReplayData(replay);
      currentTimeSec = 0;
      currentFrameSnapshot = replay.frames[0]?.snapshot ?? null;
      followRecorder = replay.magic === 'LXR2' && (replay as LxrReplayV2).recordingPlayerId != null;
      isPlaying = true;
      statusMessage = null;
      viewMode = 'player';
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'No se pudo cargar la repetición.';
      statusMessage = null;
    } finally {
      isActionLoading = false;
    }
  }

  async function runWebmExport(replay: LxrReplayFile, rowId: string): Promise<void> {
    exportingReplayId = rowId;
    exportProgress = 0;
    loadError = null;
    statusMessage = 'Renderizando video WebM con HUD 16:9...';
    try {
      const result = await exportReplayToWebm(
        replay,
        (pct) => {
          exportProgress = pct;
        },
        { followRecorder: true }
      );
      triggerWebmDownload(result);
      statusMessage = `Video listo: ${result.filename}`;
      setTimeout(() => {
        if (statusMessage?.startsWith('Video listo:')) {
          statusMessage = null;
        }
      }, 4000);
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'No se pudo exportar el video WebM.';
      statusMessage = null;
    } finally {
      exportingReplayId = null;
      exportProgress = 0;
    }
  }

  async function handleExportCloudVideo(item: UserReplayRow): Promise<void> {
    if (isActionLoading || exportingReplayId) return;
    soundFX.playUIClick();
    exportingReplayId = item.id;
    exportProgress = 0;
    loadError = null;
    statusMessage = `Descargando "${item.name}" para exportar a video...`;
    try {
      const replay = await userProfile.downloadUserReplay(item.storage_path);
      await runWebmExport(replay, item.id);
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error preparando exportación a video.';
      statusMessage = null;
      exportingReplayId = null;
      exportProgress = 0;
    }
  }

  function startRenaming(item: UserReplayRow): void {
    soundFX.playUIClick();
    confirmDeleteId = null;
    renamingReplayId = item.id;
    renamingNameValue = item.name;
  }

  async function confirmRename(id: string): Promise<void> {
    soundFX.playUIClick();
    const clean = renamingNameValue.trim();
    if (!clean) return;
    isActionLoading = true;
    loadError = null;
    try {
      await userProfile.renameUserReplay(id, clean);
      renamingReplayId = null;
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error al renombrar la repetición.';
    } finally {
      isActionLoading = false;
    }
  }

  function cancelRename(): void {
    renamingReplayId = null;
  }

  function requestDelete(id: string): void {
    soundFX.playUIClick();
    renamingReplayId = null;
    confirmDeleteId = id;
  }

  async function confirmDelete(item: UserReplayRow): Promise<void> {
    soundFX.playUIClick();
    isActionLoading = true;
    loadError = null;
    try {
      await userProfile.deleteUserReplay(item.id, item.storage_path);
      confirmDeleteId = null;
    } catch (err: unknown) {
      loadError = err instanceof Error ? err.message : 'Error al eliminar la repetición.';
    } finally {
      isActionLoading = false;
    }
  }

  $effect(() => {
    const canvas = replayCanvas;
    const stageEl = stageWrapEl;
    const replay = activeReplay;
    if (viewMode !== 'player' || !canvas || !stageEl || !replay || replay.frames.length === 0) return;

    return untrack(() => {
      const stadium = createStadium((replay.stadiumId || 'mediano') as StadiumId);
      const playerInfos = buildReplayPlayerInfos(replay);
      const renderer = new GameRenderer(canvas, { stadium, playerInfos });
      renderer.safeAreaBottom = 0;
      renderer.chatHeight = 0;
      renderer.minimapEnabled = true;

      if (replay.redKit || replay.blueKit) {
        renderer.setTeamKits(
          (replay.redKit ?? null) as unknown as Parameters<GameRenderer['setTeamKits']>[0],
          (replay.blueKit ?? null) as unknown as Parameters<GameRenderer['setTeamKits']>[1]
        );
      }

      const v2 = replay.magic === 'LXR2' ? (replay as LxrReplayV2) : null;
      const recordedZoom = v2?.cameraZoom ?? 1;
      const recordedW = v2?.viewportWidth ?? REPLAY_STAGE_WIDTH;
      const recordedH = v2?.viewportHeight ?? REPLAY_STAGE_HEIGHT;
      const followId = v2?.recordingPlayerId ?? null;

      let effectiveZoom = computeReplayEffectiveZoom(recordedZoom, recordedW, recordedH, stageWidth, stageHeight);

      const syncSize = () => {
        const rect = stageEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          stageWidth = Math.round(rect.width);
          stageHeight = Math.round(rect.height);
          renderer.resize(stageWidth, stageHeight);
          effectiveZoom = computeReplayEffectiveZoom(
            recordedZoom,
            recordedW,
            recordedH,
            stageWidth,
            stageHeight
          );
        }
      };

      syncSize();
      window.addEventListener('resize', syncSize);
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null;
      observer?.observe(stageEl);

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

        const { f0, f1, alpha } = sampleReplayFrame(replay.frames, currentTimeSec);
        currentFrameSnapshot = f0.snapshot;

        const useRecorderCam = followRecorder && followId != null;
        renderer.focusBallOnly = !useRecorderCam;
        renderer.camera.setZoom(effectiveZoom);
        renderer.scale = effectiveZoom;
        renderer.render(f0.snapshot, f1.snapshot, alpha, useRecorderCam ? followId! : undefined);

        rafId = requestAnimationFrame(tickLoop);
      };

      rafId = requestAnimationFrame(tickLoop);

      return () => {
        cancelAnimationFrame(rafId);
        observer?.disconnect();
        window.removeEventListener('resize', syncSize);
        renderer.destroy();
      };
    });
  });
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Visor de Repeticiones en la Nube">
  <div class="replay-shell">
    <header class="replay-header">
      <div class="header-left">
        {#if viewMode === 'player'}
          <button type="button" class="cyber-btn ghost" onclick={handleBackToList}>
            <span>← Volver</span>
          </button>
        {/if}
        <div class="header-title">
          <svg class="icon-cyan" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <div>
            <h2>{viewMode === 'list' ? 'MIS REPETICIONES EN LA NUBE' : activeReplay?.roomName || 'REPRODUCTOR 16:9'}</h2>
            <p class="subtitle">
              {#if viewMode === 'list'}
                Grabaciones guardadas automáticamente en tu cuenta (GZIP Lossless)
              {:else if activeReplay}
                Estadio {activeReplay.stadiumId.toUpperCase()} · {activeReplay.redScore} - {activeReplay.blueScore}
                {#if activeReplayV2?.recordingPlayerName}
                  · Cámara: {activeReplayV2.recordingPlayerName}
                {/if}
              {/if}
            </p>
          </div>
        </div>
      </div>

      <div class="header-actions">
        {#if viewMode === 'player' && activeReplay}
          {#if canFollowRecorder}
            <button
              type="button"
              class="cyber-btn"
              class:active-cam={followRecorder}
              onclick={() => {
                soundFX.playUIClick();
                followRecorder = !followRecorder;
              }}
            >
              <span>{followRecorder ? `Siguiendo: ${activeReplayV2?.recordingPlayerName || 'Jugador'}` : 'Siguiendo: Balón'}</span>
            </button>
          {/if}

          <button
            type="button"
            class="cyber-btn accent"
            disabled={Boolean(exportingReplayId)}
            onclick={() => runWebmExport(activeReplay, 'player-export')}
          >
            <span>
              {exportingReplayId === 'player-export'
                ? `Exportando ${exportProgress}%`
                : 'Descargar Video (.webm)'}
            </span>
          </button>
        {:else if viewMode === 'list' && userProfile.isAuthenticated}
          <button
            type="button"
            class="cyber-btn ghost"
            disabled={userProfile.isLoadingReplays}
            onclick={() => {
              soundFX.playUIClick();
              void userProfile.fetchUserReplays();
            }}
          >
            <span>{userProfile.isLoadingReplays ? 'Actualizando...' : 'Actualizar'}</span>
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
      <div class="banner error-banner">{loadError}</div>
    {/if}
    {#if userProfile.authError}
      <div class="banner error-banner">{userProfile.authError}</div>
    {/if}
    {#if statusMessage}
      <div class="banner info-banner">
        <span>{statusMessage}</span>
        {#if exportingReplayId}
          <div class="export-progress-track">
            <div class="export-progress-fill" style:width="{exportProgress}%"></div>
          </div>
        {/if}
      </div>
    {/if}

    {#if viewMode === 'list'}
      <div class="cloud-replays-container">
        {#if !userProfile.isAuthenticated}
          <div class="auth-gate-box">
            <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="#fbbf24" stroke-width="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h3>CUENTA REQUERIDA PARA REPETICIONES</h3>
            <p>
              Crea una cuenta o inicia sesión para guardar automáticamente tus grabaciones en la nube, verlas en cámara 16:9 y exportarlas a video WebM con HUD.
            </p>
            <button type="button" class="cyber-btn accent" onclick={goToGatekeeper}>
              INICIAR SESIÓN / CREAR CUENTA
            </button>
          </div>
        {:else}
          <div class="quota-bar" class:quota-alert={userProfile.userReplays.length >= 9}>
            <div class="quota-info">
              <span class="quota-label">CUOTA EN LA NUBE:</span>
              <span class="quota-num">{userProfile.userReplays.length} / 10</span>
              <span class="quota-type">LXR2 · GZIP</span>
            </div>
            {#if userProfile.userReplays.length >= 9}
              <div class="quota-warn-text">
                Casi lleno ({userProfile.userReplays.length}/10): al grabar otra partida se rotará la más antigua.
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
              <h4>Aún no tienes grabaciones guardadas</h4>
              <p>Pulsa <strong>Grabar</strong> durante cualquier partido; al detenerlo se guardará automáticamente aquí.</p>
            </div>
          {:else}
            <div class="replays-table-wrap custom-scrollbar">
              <table class="replays-table">
                <thead>
                  <tr>
                    <th>NOMBRE</th>
                    <th>MARCADOR</th>
                    <th>ESTADIO</th>
                    <th>DURACIÓN</th>
                    <th>PESO</th>
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
                              onkeydown={(e) => {
                                if (e.key === 'Enter') void confirmRename(replay.id);
                                if (e.key === 'Escape') cancelRename();
                              }}
                            />
                            <button
                              type="button"
                              class="btn-sm accent"
                              disabled={isActionLoading}
                              onclick={() => confirmRename(replay.id)}
                            >
                              Guardar
                            </button>
                            <button type="button" class="btn-sm ghost" onclick={cancelRename}>
                              Cancelar
                            </button>
                          </div>
                        {:else}
                          <div class="name-display">
                            <span class="bold text-light">{replay.name}</span>
                            <button
                              type="button"
                              class="btn-rename-icon"
                              title="Renombrar"
                              disabled={isActionLoading || Boolean(exportingReplayId)}
                              onclick={() => startRenaming(replay)}
                            >
                              Renombrar
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
                        {#if confirmDeleteId === replay.id}
                          <div class="delete-confirm-inline">
                            <span class="confirm-label">¿Eliminar?</span>
                            <button
                              type="button"
                              class="btn-sm danger"
                              disabled={isActionLoading}
                              onclick={() => confirmDelete(replay)}
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              class="btn-sm ghost"
                              disabled={isActionLoading}
                              onclick={() => {
                                confirmDeleteId = null;
                              }}
                            >
                              No
                            </button>
                          </div>
                        {:else}
                          <button
                            type="button"
                            class="action-pill play"
                            disabled={isActionLoading || Boolean(exportingReplayId)}
                            onclick={() => handleWatchCloudReplay(replay)}
                          >
                            Ver
                          </button>
                          <button
                            type="button"
                            class="action-pill video"
                            disabled={isActionLoading || Boolean(exportingReplayId)}
                            onclick={() => handleExportCloudVideo(replay)}
                          >
                            {exportingReplayId === replay.id
                              ? `${exportProgress}%`
                              : 'Video .webm'}
                          </button>
                          <button
                            type="button"
                            class="action-pill danger"
                            disabled={isActionLoading || Boolean(exportingReplayId)}
                            onclick={() => requestDelete(replay.id)}
                          >
                            Eliminar
                          </button>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}
      </div>
    {:else}
      <!-- REPRODUCTOR 16:9 CON HUD PROPORCIONAL -->
      <div class="player-viewport">
        {#if activeReplay && activeReplay.frames.length > 0}
          <div class="stage-16-9" bind:this={stageWrapEl}>
            <canvas bind:this={replayCanvas} class="replay-canvas"></canvas>

            <!-- Capa HUD proporcional 1280x720 escalada -->
            <div class="hud-logical-layer" style:transform="scale({hudScale})">
              <!-- Room Card Top-Left -->
              <div class="hud-room-card">
                <span class="room-dot"></span>
                <span class="room-label">{activeReplay.roomName}</span>
              </div>

              <!-- Scoreboard Top-Center + Warning 30s + Golden Goal -->
              <div class="hud-scoreboard-wrap">
                <div class="hud-scoreboard" class:warning-pulse={hudIsWarning}>
                  <div class="team-pill" style:background={redColor}>
                    <span class="team-acr">{redAcronym}</span>
                    <span class="team-pts">{hudRedScore}</span>
                  </div>
                  <div class="match-clock" class:golden={hudIsGoldenGoal} class:warning={hudIsWarning}>
                    {formatHudClock(hudMatchTimer)}
                  </div>
                  <div class="team-pill blue" style:background={blueColor}>
                    <span class="team-pts">{hudBlueScore}</span>
                    <span class="team-acr">{blueAcronym}</span>
                  </div>
                </div>

                {#if hudIsGoldenGoal}
                  <div class="golden-goal-badge">
                    <span class="gold-ball"></span>
                    <span>GOL DE ORO</span>
                  </div>
                {/if}
              </div>

              <!-- Center Banners -->
              {#if activeBanner && activeBanner.kind !== 'NONE'}
                <div class="hud-center-banner kind-{activeBanner.kind.toLowerCase()}">
                  {#if activeBanner.kind === 'COUNTDOWN'}
                    <div class="banner-card countdown">
                      <span class="countdown-num">
                        {activeBanner.count && activeBanner.count > 0
                          ? activeBanner.count
                          : activeBanner.label || '¡YA!'}
                      </span>
                    </div>
                  {:else if activeBanner.kind === 'PAUSED'}
                    <div class="banner-card paused">
                      <span>{activeBanner.isResume ? 'REANUDANDO' : activeBanner.label || 'PARTIDO EN PAUSA'}</span>
                    </div>
                  {:else if activeBanner.kind === 'VS'}
                    <div class="banner-card vs">
                      <span>{activeBanner.label || `${redAcronym} VS ${blueAcronym}`}</span>
                    </div>
                  {:else if activeBanner.kind === 'GOAL'}
                    <div
                      class="banner-card goal"
                      class:red={activeBanner.scoringTeam === 'red'}
                      class:blue={activeBanner.scoringTeam === 'blue'}
                    >
                      <div class="goal-heading">{activeBanner.isOwnGoal ? '¡AUTOGOL!' : '¡GOOOL!'}</div>
                      <div class="goal-scorer">
                        {activeBanner.scorerName || 'Jugador'}
                        {#if activeBanner.assisterName}
                          <span class="goal-assist">(Asist: {activeBanner.assisterName})</span>
                        {/if}
                      </div>
                      {#if typeof activeBanner.speedKmh === 'number' || activeBanner.isPower || activeBanner.isCurve}
                        <div class="goal-telemetry">
                          {#if typeof activeBanner.speedKmh === 'number' && activeBanner.speedKmh > 0}
                            <span class="tele-chip speed">{Math.round(activeBanner.speedKmh)} km/h</span>
                          {/if}
                          {#if activeBanner.isPower}
                            <span class="tele-chip power">POTENTE</span>
                          {/if}
                          {#if activeBanner.isCurve}
                            <span class="tele-chip curve">EFECTO</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {:else if activeBanner.kind === 'VICTORY'}
                    <div class="banner-card victory">
                      <div class="victory-title">
                        {activeBanner.winner === 'draw'
                          ? 'EMPATE FINAL'
                          : activeBanner.winner === 'red'
                            ? `VICTORIA ${redAcronym}`
                            : `VICTORIA ${blueAcronym}`}
                      </div>
                      <div class="victory-score">
                        {activeBanner.redScore ?? hudRedScore} - {activeBanner.blueScore ?? hudBlueScore}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Chat Bottom-Left -->
              {#if visibleChat.length > 0}
                <div class="hud-chat-overlay">
                  {#each visibleChat as msg, i (`${msg.t}-${i}-${msg.text}`)}
                    <div class="hud-chat-line kind-{msg.kind}">
                      {#if msg.sender}
                        <span
                          class="chat-sender"
                          class:red={msg.senderTeam === 'RED'}
                          class:blue={msg.senderTeam === 'BLUE'}
                        >
                          {msg.sender}:
                        </span>
                      {/if}
                      <span class="chat-body">{msg.text}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

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
              {#each activeReplay.goals as goal, gIdx (`${goal.t}-${gIdx}`)}
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
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 900;
    background: rgba(5, 8, 15, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .replay-shell {
    width: min(1240px, 100%);
    height: min(860px, 94vh);
    background: linear-gradient(160deg, #0b111e 0%, #070b14 100%);
    border: 1px solid rgba(56, 189, 248, 0.28);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
  }

  .replay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    background: rgba(15, 23, 42, 0.85);
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .header-title h2 {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .subtitle {
    margin: 2px 0 0;
    font-size: 0.76rem;
    color: #94a3b8;
  }

  .icon-cyan {
    color: #38bdf8;
    flex-shrink: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .cyber-btn {
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.9);
    color: #e2e8f0;
    font-size: 0.78rem;
    font-weight: 700;
    padding: 8px 12px;
    border-radius: 9px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .cyber-btn:hover:not(:disabled) {
    border-color: rgba(56, 189, 248, 0.65);
    background: rgba(30, 41, 59, 0.95);
  }

  .cyber-btn.accent {
    background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .cyber-btn.active-cam {
    border-color: #22d3ee;
    color: #67e8f9;
    background: rgba(8, 51, 68, 0.75);
  }

  .cyber-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .close-btn {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.8);
    color: #cbd5e1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    border-color: #ef4444;
    color: #fca5a5;
  }

  .banner {
    padding: 9px 18px;
    font-size: 0.8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .error-banner {
    background: rgba(127, 29, 29, 0.45);
    color: #fecaca;
    border-bottom: 1px solid rgba(248, 113, 113, 0.4);
  }

  .info-banner {
    background: rgba(12, 74, 110, 0.45);
    color: #bae6fd;
    border-bottom: 1px solid rgba(56, 189, 248, 0.35);
  }

  .export-progress-track {
    width: 180px;
    height: 6px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
    overflow: hidden;
  }

  .export-progress-fill {
    height: 100%;
    background: #38bdf8;
    transition: width 0.1s linear;
  }

  .cloud-replays-container {
    flex: 1;
    min-height: 0;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .auth-gate-box,
  .empty-cloud,
  .cloud-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 12px;
    padding: 32px;
    border: 1px dashed rgba(148, 163, 184, 0.24);
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.45);
  }

  .auth-gate-box h3,
  .empty-cloud h4 {
    margin: 0;
    color: #f8fafc;
    font-size: 1.05rem;
  }

  .auth-gate-box p,
  .empty-cloud p {
    margin: 0;
    max-width: 480px;
    font-size: 0.86rem;
    color: #94a3b8;
    line-height: 1.45;
  }

  .quota-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.18);
    font-size: 0.8rem;
  }

  .quota-bar.quota-alert {
    border-color: rgba(245, 158, 11, 0.55);
    background: rgba(69, 26, 3, 0.45);
  }

  .quota-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .quota-label {
    color: #94a3b8;
    font-weight: 700;
  }

  .quota-num {
    color: #38bdf8;
    font-weight: 800;
  }

  .quota-type {
    color: #64748b;
    font-size: 0.72rem;
  }

  .quota-warn-text {
    color: #fcd34d;
    font-weight: 600;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(56, 189, 248, 0.2);
    border-top-color: #38bdf8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .replays-table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    background: rgba(10, 15, 28, 0.75);
  }

  .replays-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .replays-table th {
    position: sticky;
    top: 0;
    background: #0f172a;
    color: #94a3b8;
    font-size: 0.71rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-align: left;
    padding: 11px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }

  .replays-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    vertical-align: middle;
  }

  .replays-table tbody tr:hover {
    background: rgba(30, 41, 59, 0.35);
  }

  .th-actions,
  .td-actions {
    text-align: right;
    white-space: nowrap;
  }

  .name-display,
  .rename-inline,
  .delete-confirm-inline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .bold {
    font-weight: 700;
  }

  .text-light {
    color: #f8fafc;
  }

  .rename-input {
    background: #0f172a;
    border: 1px solid #38bdf8;
    color: #f8fafc;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.8rem;
    width: 180px;
  }

  .btn-rename-icon {
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.8);
    color: #94a3b8;
    border-radius: 6px;
    padding: 2px 7px;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .btn-rename-icon:hover:not(:disabled) {
    color: #e2e8f0;
    border-color: #38bdf8;
  }

  .tag-red-mini,
  .tag-blue-mini {
    display: inline-block;
    font-size: 0.68rem;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .tag-red-mini {
    background: rgba(239, 68, 68, 0.22);
    color: #fca5a5;
  }

  .tag-blue-mini {
    background: rgba(59, 130, 246, 0.22);
    color: #93c5fd;
  }

  .score-num {
    font-weight: 800;
    margin: 0 3px;
    color: #f8fafc;
  }

  .score-sep {
    color: #64748b;
  }

  .action-pill,
  .btn-sm {
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.9);
    color: #e2e8f0;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 7px;
    cursor: pointer;
    margin-left: 4px;
  }

  .action-pill.play,
  .btn-sm.accent {
    background: rgba(14, 165, 233, 0.22);
    border-color: rgba(56, 189, 248, 0.65);
    color: #7dd3fc;
  }

  .action-pill.video {
    background: rgba(16, 185, 129, 0.18);
    border-color: rgba(52, 211, 153, 0.55);
    color: #6ee7b7;
  }

  .action-pill.danger,
  .btn-sm.danger {
    background: rgba(239, 68, 68, 0.18);
    border-color: rgba(248, 113, 113, 0.55);
    color: #fca5a5;
  }

  .confirm-label {
    font-size: 0.74rem;
    color: #fca5a5;
    font-weight: 700;
  }

  .action-pill:disabled,
  .btn-sm:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* REPRODUCTOR 16:9 PROPORCIONAL */
  .player-viewport {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 12px 16px 14px;
    gap: 10px;
    background: #04070d;
  }

  .stage-16-9 {
    position: relative;
    margin: auto;
    width: 100%;
    max-height: 100%;
    aspect-ratio: 16 / 9;
    max-width: calc((100vh - 190px) * 16 / 9);
    background: #090d16;
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 10px;
    overflow: hidden;
  }

  .replay-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .hud-logical-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 1280px;
    height: 720px;
    transform-origin: top left;
    pointer-events: none;
    user-select: none;
  }

  .hud-room-card {
    position: absolute;
    top: 10px;
    left: 16px;
    height: 40px;
    padding: 0 14px;
    border-radius: 12px;
    background: rgba(11, 15, 25, 0.86);
    border: 1px solid rgba(148, 163, 184, 0.25);
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }

  .room-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf8;
  }

  .room-label {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hud-scoreboard-wrap {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .hud-scoreboard {
    width: 336px;
    height: 44px;
    padding: 0 8px;
    border-radius: 12px;
    background: rgba(11, 15, 25, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.28);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hud-scoreboard.warning-pulse {
    background: rgba(38, 12, 18, 0.92);
    border-color: #f87171;
    box-shadow: 0 0 18px rgba(239, 68, 68, 0.65);
    animation: warnPulse 0.9s ease-in-out infinite alternate;
  }

  @keyframes warnPulse {
    from {
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.35);
    }
    to {
      box-shadow: 0 0 22px rgba(239, 68, 68, 0.85);
    }
  }

  .team-pill {
    width: 108px;
    height: 30px;
    border-radius: 8px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #ffffff;
  }

  .team-acr {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .team-pts {
    font-size: 18px;
    font-weight: 900;
  }

  .match-clock {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    font-weight: 800;
    color: #f8fafc;
  }

  .match-clock.warning {
    color: #fca5a5;
  }

  .match-clock.golden {
    color: #fbbf24;
  }

  .golden-goal-badge {
    height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    background: rgba(42, 29, 7, 0.94);
    border: 1.5px solid rgba(251, 191, 36, 0.85);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #fde68a;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  .gold-ball {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #fbbf24;
    box-shadow: 0 0 10px #fbbf24;
  }

  .hud-center-banner {
    position: absolute;
    top: 175px;
    left: 50%;
    transform: translateX(-50%);
  }

  .banner-card {
    padding: 14px 28px;
    border-radius: 16px;
    background: rgba(11, 15, 25, 0.92);
    border: 1.6px solid rgba(56, 189, 248, 0.65);
    text-align: center;
    min-width: 240px;
  }

  .banner-card.countdown .countdown-num {
    font-size: 42px;
    font-weight: 900;
    color: #38bdf8;
  }

  .banner-card.paused {
    border-color: #f59e0b;
    background: rgba(28, 22, 8, 0.92);
    color: #fde68a;
    font-size: 20px;
    font-weight: 800;
  }

  .banner-card.vs {
    color: #f8fafc;
    font-size: 22px;
    font-weight: 900;
  }

  .banner-card.goal.red {
    border-color: #ef4444;
  }

  .banner-card.goal.blue {
    border-color: #3b82f6;
  }

  .goal-heading {
    font-size: 28px;
    font-weight: 900;
    color: #f8fafc;
  }

  .banner-card.goal.red .goal-heading {
    color: #f87171;
  }

  .banner-card.goal.blue .goal-heading {
    color: #60a5fa;
  }

  .goal-scorer {
    font-size: 16px;
    font-weight: 700;
    color: #f8fafc;
    margin-top: 4px;
  }

  .goal-assist {
    font-size: 13px;
    color: #94a3b8;
    margin-left: 4px;
  }

  .goal-telemetry {
    margin-top: 10px;
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .tele-chip {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.95);
    color: #e2e8f0;
  }

  .tele-chip.power {
    border-color: #f97316;
    background: rgba(124, 45, 18, 0.9);
    color: #fed7aa;
  }

  .tele-chip.curve {
    border-color: #22d3ee;
    background: rgba(8, 51, 68, 0.9);
    color: #a5f3fc;
  }

  .banner-card.victory {
    border-color: #fbbf24;
  }

  .victory-title {
    font-size: 24px;
    font-weight: 900;
    color: #fbbf24;
  }

  .victory-score {
    font-size: 18px;
    font-weight: 800;
    color: #f8fafc;
    margin-top: 4px;
  }

  .hud-chat-overlay {
    position: absolute;
    left: 16px;
    bottom: 16px;
    width: 390px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(9, 13, 22, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .hud-chat-line {
    font-size: 12px;
    line-height: 1.35;
    color: #f1f5f9;
  }

  .hud-chat-line.kind-goal {
    color: #fef08a;
    font-weight: 600;
  }

  .chat-sender {
    font-weight: 700;
    color: #cbd5e1;
    margin-right: 4px;
  }

  .chat-sender.red {
    color: #f87171;
  }

  .chat-sender.blue {
    color: #60a5fa;
  }

  /* Controles inferiores del reproductor */
  .controls-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.16);
    flex-shrink: 0;
  }

  .play-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid #38bdf8;
    background: rgba(14, 165, 233, 0.2);
    color: #7dd3fc;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .time-readout {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    color: #cbd5e1;
    min-width: 96px;
  }

  .timeline-wrap {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .timeline-slider {
    width: 100%;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .goal-marker {
    position: absolute;
    top: -4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid #ffffff;
    transform: translateX(-50%);
    cursor: pointer;
    padding: 0;
  }

  .goal-marker.red {
    background: #ef4444;
  }

  .goal-marker.blue {
    background: #3b82f6;
  }

  .speed-group {
    display: inline-flex;
    gap: 4px;
  }

  .speed-chip {
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.85);
    color: #94a3b8;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .speed-chip.active {
    border-color: #38bdf8;
    background: rgba(14, 165, 233, 0.24);
    color: #e0f2fe;
  }
</style>
