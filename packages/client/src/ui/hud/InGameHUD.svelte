<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { userProfile } from '../state/userProfile.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { matchRecorder } from '../../recorder/MatchRecorder.svelte.js';
  import MatchScoreboard, { type ScoreboardDesign } from '../components/MatchScoreboard.svelte';
  import KitPatternBadge from '../components/KitPatternBadge.svelte';
  import { getKitPatternCss } from '../utils/kitPatterns.js';
  import {
    applyMentionCandidate,
    findActiveMentionToken,
    getMentionCandidates,
    segmentChatMentions
  } from '../utils/chatMentions.js';

  let recAuthWarning = $state<string | null>(null);
  let recAuthWarningTimer: ReturnType<typeof setTimeout> | null = null;

  const remainingSeconds = $derived.by(() => {
    if (gameUI.timeLimit <= 0) return 999;
    return Math.max(0, gameUI.timeLimit * 60 - gameUI.matchTimerSeconds);
  });

  const isWarning30s = $derived(
    (gameUI.matchPhase === 1 || gameUI.matchPhase === 2) &&
    gameUI.timeLimit > 0 &&
    !gameUI.isGoldenGoal &&
    remainingSeconds <= 30 &&
    remainingSeconds > 0
  );

  const normalizedChatOpacity = $derived.by(() => {
    const raw = Number(gameUI.settings.chatOpacity ?? 0.95);
    const normalized = raw > 1 ? raw / 100 : raw;
    if (!Number.isFinite(normalized)) return 0.95;
    return Math.max(0.05, Math.min(1, normalized));
  });

  const slidingEvents = $derived(
    (gameUI as any).slidingEventQueue ??
      (gameUI.currentSlidingEvent ? [gameUI.currentSlidingEvent] : [])
  );

  let chatMessage = $state('');
  let chatCursor = $state(0);
  let mentionIndex = $state(0);
  let isChatInputActive = $state(false);
  let chatInputEl = $state<HTMLInputElement | null>(null);
  let chatScrollEl = $state<HTMLDivElement | null>(null);
  let telemetryEl = $state<HTMLElement | null>(null);
  let telemetryWidth = $state(140);
  let isResizingChat = $state(false);

  let pingColorClass = $derived(
    gameUI.pingMs < 60 ? 'text-emerald' : gameUI.pingMs <= 120 ? 'text-amber' : 'text-crimson'
  );

  // Equipación activa del capitán (RED → kit Local, BLUE → kit Visitante)
  let redActiveKit = $derived(gameUI.redCaptainKit);
  let blueActiveKit = $derived(gameUI.blueCaptainKit);

  let redKitPrimary = $derived(
    redActiveKit?.primaryColor || gameUI.redTeamKit?.primaryColor || '#e74c3c'
  );
  let redKitSecondary = $derived(
    redActiveKit?.secondaryColor || gameUI.redTeamKit?.secondaryColor || '#ffffff'
  );
  let redKitTertiary = $derived(
    redActiveKit?.tertiaryColor || gameUI.redTeamKit?.tertiaryColor || '#ffffff'
  );
  let redHasOutline = $derived(
    Boolean(redActiveKit?.outline === true || redActiveKit?.hasOutline === true)
  );

  let blueKitPrimary = $derived(
    blueActiveKit?.primaryColor || gameUI.blueTeamKit?.primaryColor || '#00e5ff'
  );
  let blueKitSecondary = $derived(
    blueActiveKit?.secondaryColor || gameUI.blueTeamKit?.secondaryColor || '#ffffff'
  );
  let blueKitTertiary = $derived(
    blueActiveKit?.tertiaryColor || gameUI.blueTeamKit?.tertiaryColor || '#ffffff'
  );
  let blueHasOutline = $derived(
    Boolean(blueActiveKit?.outline === true || blueActiveKit?.hasOutline === true)
  );

  let redTeamName = $derived(redActiveKit?.name || gameUI.redTeamKit?.name || 'ROJO');
  let blueTeamName = $derived(blueActiveKit?.name || gameUI.blueTeamKit?.name || 'AZUL');
  let redTeamTag = $derived(redActiveKit?.tag || gameUI.redTeamKit?.tag || 'RED');
  let blueTeamTag = $derived(blueActiveKit?.tag || gameUI.blueTeamKit?.tag || 'BLUE');

  let redResolvedKit = $derived(redActiveKit ?? gameUI.redTeamKit);
  let blueResolvedKit = $derived(blueActiveKit ?? gameUI.blueTeamKit);
  let redKitBg = $derived(getKitPatternCss(redResolvedKit, redKitPrimary));
  let blueKitBg = $derived(getKitPatternCss(blueResolvedKit, blueKitPrimary));

  let isRankedRoom = $derived(gameUI.roomType === 'ranked' && !gameUI.isPracticeMode);
  let scoreboardDesign = $derived(
    ((gameUI as any).effectiveScoreboardDesign ??
      (gameUI.settings as any).scoreboardDesign ??
      'original') as ScoreboardDesign
  );
  let isGoalReplay = $derived(gameUI.matchPhase === 3.5);
  let activeGoalScorerId = $derived((gameUI as any).activeGoalScorerId ?? null);
  let canSkipGoalReplay = $derived(
    isGoalReplay &&
      gameUI.localPlayerId !== null &&
      activeGoalScorerId !== null &&
      gameUI.localPlayerId === activeGoalScorerId
  );

  let activeBanner = $derived(gameUI.activeBanner);
  let showPauseBanner = $derived(
    (activeBanner.kind === 'PAUSED' || gameUI.matchPhase === 2.1 || gameUI.fsmPhase === 'PAUSED') &&
      activeBanner.kind !== 'COUNTDOWN'
  );
  let goalTeamName = $derived(
    activeBanner.scoringTeam === 'blue' ? blueTeamName : redTeamName
  );
  let goalPrimaryColor = $derived(
    activeBanner.scoringTeam === 'blue' ? blueKitPrimary : redKitPrimary
  );
  let goalSecondaryColor = $derived(
    activeBanner.scoringTeam === 'blue' ? blueKitSecondary : redKitSecondary
  );
  let goalTertiaryColor = $derived(
    activeBanner.scoringTeam === 'blue' ? blueKitTertiary : redKitTertiary
  );
  let goalResolvedKit = $derived(
    activeBanner.scoringTeam === 'blue' ? blueResolvedKit : redResolvedKit
  );
  let goalStripBg = $derived(getKitPatternCss(goalResolvedKit, goalPrimaryColor));
  let victoryWinnerName = $derived(
    activeBanner.winner === 'red'
      ? redTeamName
      : activeBanner.winner === 'blue'
        ? blueTeamName
        : 'EMPATE'
  );
  let victoryPrimaryColor = $derived(
    activeBanner.winner === 'blue'
      ? blueKitPrimary
      : activeBanner.winner === 'red'
        ? redKitPrimary
        : '#00e5ff'
  );
  let victorySecondaryColor = $derived(
    activeBanner.winner === 'blue'
      ? blueKitSecondary
      : activeBanner.winner === 'red'
        ? redKitSecondary
        : '#1e293b'
  );

  let knownRosterNames = $derived(gameUI.rosterPlayers.map((p) => p.name ?? p.nickname));

  let activeMentionToken = $derived(
    isChatInputActive ? findActiveMentionToken(chatMessage, chatCursor) : null
  );

  let mentionCandidates = $derived(
    activeMentionToken
      ? getMentionCandidates(activeMentionToken.query, gameUI.rosterPlayers, gameUI.nickname)
      : []
  );

  let isMentionMenuOpen = $derived(
    Boolean(isChatInputActive && activeMentionToken && mentionCandidates.length > 0)
  );

  $effect(() => {
    const total = mentionCandidates.length;
    if (total === 0) {
      mentionIndex = 0;
    } else if (mentionIndex >= total) {
      mentionIndex = 0;
    }
  });

  // Ancho dinámico del minimapa (0px si está desactivado)
  let minimapWidth = $derived.by(() => {
    if (!gameUI.settings.minimapEnabled) return 0;
    const sz = gameUI.settings.minimapSize;
    const base = sz === 'small' || sz === 160 ? 160 : (sz === 'large' || sz === 280 || sz === 240 ? 280 : 220);
    return base + 16;
  });

  // Medición reactiva del ancho de la tarjeta de telemetría
  $effect(() => {
    if (!telemetryEl) return;
    const updateWidth = () => {
      if (telemetryEl) {
        telemetryWidth = Math.round(telemetryEl.offsetWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(telemetryEl);
      return () => observer.disconnect();
    }
  });

  // Sincronización de variables CSS en el root
  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--chat-height', `${gameUI.chatHeight}px`);
      document.documentElement.style.setProperty('--top-banner-height', '48px');
      document.documentElement.style.setProperty('--telemetry-width', `${telemetryWidth}px`);
      document.documentElement.style.setProperty('--minimap-width', `${minimapWidth}px`);
    }
  });

  // Auto-scroll del chat con nuevos mensajes
  $effect(() => {
    const len = gameUI.chatMessages.length;
    if (len >= 0 && chatScrollEl) {
      chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
    }
  });

  function syncChatCursor() {
    chatCursor = chatInputEl?.selectionStart ?? chatMessage.length;
  }

  function selectMentionCandidate(index: number) {
    const candidate = mentionCandidates[index];
    if (!candidate || !activeMentionToken) return;
    soundFX.playUIClick();
    const { nextText, nextCursor } = applyMentionCandidate(
      chatMessage,
      activeMentionToken,
      candidate.handle
    );
    chatMessage = nextText;
    chatCursor = nextCursor;
    mentionIndex = 0;
    queueMicrotask(() => {
      if (chatInputEl) {
        chatInputEl.focus();
        chatInputEl.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  function handleSendChat() {
    const text = chatMessage.trim();
    if (text) {
      soundFX.playUIClick();
      if (gameUI.handleChatCommand(text)) {
        chatMessage = '';
        chatCursor = 0;
        isChatInputActive = false;
        gameUI.isChatFocused = false;
        chatInputEl?.blur();
        return;
      }
      if (gameUI.onChatSent) {
        gameUI.onChatSent(text);
      }
    }
    chatMessage = '';
    chatCursor = 0;
    isChatInputActive = false;
    gameUI.isChatFocused = false;
    chatInputEl?.blur();
  }

  function handleChatKeyDown(e: KeyboardEvent) {
    if (isMentionMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        mentionIndex = (mentionIndex + 1) % mentionCandidates.length;
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        mentionIndex = (mentionIndex - 1 + mentionCandidates.length) % mentionCandidates.length;
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        selectMentionCandidate(mentionIndex);
        return;
      }
    }

    if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();
      handleSendChat();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      chatMessage = '';
      chatCursor = 0;
      isChatInputActive = false;
      gameUI.isChatFocused = false;
      chatInputEl?.blur();
    }
  }

  function focusChat() {
    isChatInputActive = true;
    gameUI.isChatFocused = true;
    chatInputEl?.focus();
    syncChatCursor();
  }

  $effect(() => {
    const handleGlobalCaptureKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        const activeEl = document.activeElement;
        if (activeEl === chatInputEl) {
          return;
        }
        const isOtherInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (isOtherInput) {
          return;
        }
        if (
          activeEl &&
          (activeEl.tagName === 'BUTTON' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.getAttribute('role') === 'button')
        ) {
          (activeEl as HTMLElement).blur();
        }

        const modal = gameUI.activeModal;
        if (canSkipGoalReplay && modal === 'NONE') {
          return;
        }
        const isAllowedModal =
          modal === 'NONE' ||
          modal === 'TEAM_MANAGEMENT' ||
          modal === 'TEAM_SELECT' ||
          modal === 'teamSelect' ||
          modal === 'STATS' ||
          modal === 'stats';
        const isAllowedSlide = gameUI.activeSlide === 'STATS' || gameUI.activeSlide === 'MENU';

        if (isAllowedModal || isAllowedSlide) {
          e.preventDefault();
          e.stopPropagation();
          focusChat();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalCaptureKeydown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalCaptureKeydown, true);
    };
  });

  function toggleAudio() {
    soundFX.playUIClick();
    gameUI.toggleMute();
  }

  function toggleRoomMenu() {
    soundFX.playUIClick();
    gameUI.toggleRoomMenu();
  }

  function openSettings() {
    soundFX.playUIClick();
    gameUI.openOverlay('SETTINGS');
  }

  function showRecAuthWarning() {
    recAuthWarning = 'Solo cuentas registradas pueden ver o grabar repeticiones.';
    if (recAuthWarningTimer) clearTimeout(recAuthWarningTimer);
    recAuthWarningTimer = setTimeout(() => {
      recAuthWarning = null;
      recAuthWarningTimer = null;
    }, 3800);
  }

  function openReplayViewer() {
    soundFX.playUIClick();
    if (userProfile.isGuest || !userProfile.isAuthenticated) {
      showRecAuthWarning();
      return;
    }
    gameUI.openOverlay('REPLAY_VIEWER');
  }

  function toggleMatchRecording() {
    soundFX.playUIClick();
    if (!matchRecorder.isRecording && (userProfile.isGuest || !userProfile.isAuthenticated)) {
      showRecAuthWarning();
      return;
    }
    const canvas =
      typeof document !== 'undefined'
        ? (document.querySelector('.canvas-layer canvas') as HTMLCanvasElement | null)
        : null;
    matchRecorder.toggle(canvas, {
      roomName: gameUI.activeRoomName || 'Partida LegacyX-GO',
      stadiumId: gameUI.selectedStadiumId || 'mediano',
      redKit: (redActiveKit ?? gameUI.redTeamKit) as any,
      blueKit: (blueActiveKit ?? gameUI.blueTeamKit) as any,
      players: gameUI.rosterPlayers.map((p, idx) => ({
        id: Number(p.id) || idx + 1,
        nickname: p.name ?? p.nickname ?? 'Jugador',
        avatar: p.avatar ?? undefined,
        team: p.team === 'red' || p.team === 'blue' ? p.team : 'spectator'
      }))
    });
  }

  function handleResizePointerDown(e: PointerEvent) {
    e.preventDefault();
    isResizingChat = true;
    const startY = e.clientY;
    const startH = gameUI.chatHeight;

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!isResizingChat) return;
      const deltaY = startY - moveEv.clientY;
      const nextH = Math.max(100, Math.min(450, startH + deltaY));
      gameUI.chatHeight = nextH;
    };

    const onPointerUp = () => {
      isResizingChat = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }
</script>

<div class="hud-root">
  <!-- ========================================== -->
  <!-- 1. TOP BAR: 3 CÁPSULAS FLOTANTES           -->
  <!-- ========================================== -->
  <div class="top-bar-container">
    <!-- A) Cartucho Izquierdo: Nombre de Sala -->
    <div class="top-card top-card-left" class:is-ranked={isRankedRoom}>
      <div class="room-title-block">
        {#if isRankedRoom}
          <span class="room-ranked-tag">RANKED</span>
        {/if}
        <h1 class="room-title">
          {gameUI.activeRoomName || 'TORNEO NOCTURNO #12'}
        </h1>
      </div>
    </div>

    <!-- B) Cartucho Central: Marcador y Reloj -->
    <div class="top-card-center top-card-center-slot" class:is-warning-30s={isWarning30s}>
      <MatchScoreboard
        design={scoreboardDesign}
        redScore={gameUI.redScore}
        blueScore={gameUI.blueScore}
        clockText={gameUI.matchPhase === 0 ? '00:00' : gameUI.matchTimeFormatted}
        redKit={redResolvedKit}
        blueKit={blueResolvedKit}
        {isWarning30s}
        isGoldenGoal={gameUI.isGoldenGoal}
      />
    </div>

    {#if isGoalReplay}
      <div class="goal-replay-pill-bar" id="hud-goal-replay-indicator" role="status" aria-live="polite">
        <span class="goal-replay-pill">
          <span class="goal-replay-dot" aria-hidden="true"></span>
          <span>REPETICIÓN DEL GOL</span>
        </span>
        {#if canSkipGoalReplay}
          <span class="goal-replay-skip-hint">Pulsa ENTER para saltar</span>
        {/if}
      </div>
    {/if}

    <!-- TARJETA DESLIZANTE DE EVENTOS BAJO EL MARCADOR -->
    {#if slidingEvents.length > 0}
      <div class="hud-sliding-event-container" role="status" aria-live="polite">
        {#each slidingEvents as ev (ev.id)}
          <div
            class="hud-sliding-event-card team-{ev.team}"
            style="--event-color: {ev.color};"
          >
            <span class="event-badge">{ev.eventType}</span>
            <span class="event-points">{ev.pointsText}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- C) Cartucho Derecho: Ver Repeticiones + Grabadora + 3 Botones de Acción Cyber-Pitch -->
    <div class="top-card top-card-right">
      <button
        type="button"
        id="btn-hud-replays"
        class="hud-replay-btn"
        title="Ver Repeticiones guardadas"
        aria-label="Ver Repeticiones"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={openReplayViewer}
      >
        <svg class="replay-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </button>

      <!-- 0. Grabadora en Vivo -->
      <button
        type="button"
        id="btn-hud-record"
        class="hud-rec-btn"
        class:is-recording={matchRecorder.isRecording}
        title={matchRecorder.isRecording ? 'Detener grabación' : 'Grabar partida en vivo'}
        aria-label={matchRecorder.isRecording ? 'Detener grabación' : 'Iniciar grabación'}
        onmouseenter={() => soundFX.playUIHover()}
        onclick={toggleMatchRecording}
      >
        {#if matchRecorder.isRecording}
          <span class="rec-stop-square" aria-hidden="true"></span>
          <span class="rec-label">GRABANDO {matchRecorder.formattedElapsed}</span>
        {:else}
          <span class="rec-dot" aria-hidden="true"></span>
          <span class="rec-label">REC</span>
        {/if}
      </button>

      {#if recAuthWarning}
        <div class="rec-auth-warning-toast" role="alert">
          <span>🔒 {recAuthWarning}</span>
        </div>
      {/if}

      <!-- 1. Silenciar / Audio Toggle -->
      <button
        type="button"
        id="btn-audio-toggle"
        class="hud-action-btn"
        class:is-muted={gameUI.isAudioMuted}
        title={gameUI.isAudioMuted ? 'Activar Sonido' : 'Silenciar Todo'}
        aria-label="Audio / Silenciar"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={toggleAudio}
      >
        {#if gameUI.isAudioMuted}
          <svg class="hud-btn-svg text-crimson" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
        {:else}
          <svg class="hud-btn-svg text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        {/if}
      </button>

      <!-- 2. Menú de Sala Toggle [Esc] -->
      <button
        type="button"
        id="btn-menu-toggle"
        class="hud-action-btn menu-toggle-btn"
        title="Menú de Sala [Esc]"
        aria-label="Menú de Sala"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={toggleRoomMenu}
      >
        <svg class="hud-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      <!-- 3. Ajustes Generales -->
      <button
        type="button"
        class="hud-action-btn"
        title="Ajustes Generales"
        aria-label="Ajustes"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={openSettings}
      >
        <svg class="hud-btn-svg text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
    </div>

    {#if matchRecorder.showPostRecordPrompt && matchRecorder.hasRecordedClip && !matchRecorder.isRecording}
      <div class="rec-export-toast" role="status" aria-live="polite" aria-label="Grabación guardada">
        <div class="rec-export-head">
          <span class="rec-export-title">GRABACIÓN GUARDADA</span>
          <button
            type="button"
            class="rec-export-close"
            aria-label="Cerrar aviso de grabación"
            onclick={() => matchRecorder.dismissPrompt()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <p class="rec-saved-notice">
          Grabación guardada en tu cuenta. Ve al Visor de Repeticiones en el Lobby o HUD para verla o descargar el video.
        </p>
      </div>
    {/if}
  </div>

  <!-- ========================================== -->
  <!-- 1.5 BANNERS DE PARTIDO CYBER-PITCH HUD     -->
  <!-- ========================================== -->
  {#if showPauseBanner}
    <div class="cyber-banner-pause" id="hud-banner-pause" role="status" aria-live="polite">
      <div class="pause-icon-badge" aria-hidden="true">
        <svg class="pause-svg" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"></rect>
          <rect x="14" y="4" width="4" height="16" rx="1"></rect>
        </svg>
      </div>
      <div class="pause-copy-col">
        <span class="pause-banner-title">PARTIDO EN PAUSA</span>
        <span class="pause-banner-subtitle">Esperando reanudación del administrador...</span>
      </div>
    </div>
  {/if}

  {#if activeBanner.kind === 'VS'}
    <div class="cyber-banner-center" id="hud-banner-vs" role="status" aria-live="polite">
      <div class="vs-card">
        <div
          class="vs-team-half vs-local"
          style="
            opacity: 1;
            border: 2px solid {redKitPrimary};
            border-left: 6px solid {redKitPrimary};
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.85);
          "
        >
          <span
            class="vs-team-tag"
            style="
              background: {redKitBg};
              color: {redKitTertiary};
              border-color: {redHasOutline ? '#000000' : redKitTertiary};
              {redHasOutline ? '-webkit-text-stroke: 2.5px #000000; paint-order: stroke fill; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);' : '-webkit-text-stroke: 0px transparent; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);'}
            "
          >{redTeamTag}</span>
          <span class="vs-team-name">{redTeamName}</span>
        </div>

        <div class="vs-bolt-badge">
          <span class="vs-text">VS</span>
        </div>

        <div
          class="vs-team-half vs-visitor"
          style="
            opacity: 1;
            border: 2px solid {blueKitPrimary};
            border-right: 6px solid {blueKitPrimary};
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.85);
          "
        >
          <span class="vs-team-name">{blueTeamName}</span>
          <span
            class="vs-team-tag"
            style="
              background: {blueKitBg};
              color: {blueKitTertiary};
              border-color: {blueHasOutline ? '#000000' : blueKitTertiary};
              {blueHasOutline ? '-webkit-text-stroke: 2.5px #000000; paint-order: stroke fill; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);' : '-webkit-text-stroke: 0px transparent; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);'}
            "
          >{blueTeamTag}</span>
        </div>
      </div>
    </div>
  {:else if activeBanner.kind === 'COUNTDOWN'}
    <div class="cyber-banner-center" id="hud-banner-countdown" role="status" aria-live="assertive">
      <div class="countdown-card" class:is-go={activeBanner.count === 0}>
        <span class="countdown-kicker">
          {activeBanner.isResume ? 'REANUDANDO PARTIDO' : 'SAQUE INICIAL'}
        </span>
        {#key activeBanner.label}
          <span class="countdown-value">{activeBanner.label || activeBanner.count}</span>
        {/key}
      </div>
    </div>
  {:else if activeBanner.kind === 'GOAL'}
    <div class="cyber-banner-center" id="hud-banner-goal" role="status" aria-live="polite">
      <div
        class="goal-banner-card"
        style="--goal-c1: {goalPrimaryColor}; --goal-c2: {goalSecondaryColor}; --goal-c3: {goalTertiaryColor};"
      >
        <div class="goal-accent-strip" style="background: {goalStripBg};"></div>
        <h2 class="goal-banner-title">
          <KitPatternBadge
            kit={goalResolvedKit}
            label={activeBanner.scoringTeam === 'blue' ? blueTeamTag : redTeamTag}
            compact
            fallbackColor={goalPrimaryColor}
          />
          <span>¡GOOOOL DE {goalTeamName.toUpperCase()}!</span>
        </h2>
        <div class="goal-credits-row">
          <span class="goal-scorer-pill" class:own-goal={activeBanner.isOwnGoal}>
            {activeBanner.isOwnGoal ? 'Autogol de:' : 'Gol de:'}
            <strong>{activeBanner.scorerName || goalTeamName}</strong>
          </span>
          {#if activeBanner.speedKmh}
            <span class="goal-speed-pill">
              <svg class="credit-inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
              </svg>
              {activeBanner.speedKmh} km/h
            </span>
          {/if}
          {#if activeBanner.assisterName && !activeBanner.isOwnGoal}
            <span class="goal-assist-pill">
              <svg class="credit-inline-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 12h14"></path>
                <path d="M13 6l6 6-6 6"></path>
              </svg>
              Asistencia: <strong>{activeBanner.assisterName}</strong>
            </span>
          {/if}
        </div>
      </div>
    </div>
  {:else if activeBanner.kind === 'VICTORY'}
    <div class="cyber-banner-center" id="hud-banner-victory" role="status" aria-live="polite">
      <div
        class="victory-banner-card"
        style="--win-c1: {victoryPrimaryColor}; --win-c2: {victorySecondaryColor};"
      >
        <div class="victory-gold-crown">FINAL DEL ENCUENTRO</div>
        <h2 class="victory-banner-title">
          <svg class="banner-inline-svg text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
          </svg>
          {#if activeBanner.winner === 'draw'}
            <span>¡EMPATE FINAL!</span>
          {:else}
            <span>¡VICTORIA DE {victoryWinnerName.toUpperCase()}!</span>
          {/if}
        </h2>
        <div class="victory-score-strip">
          <KitPatternBadge
            kit={redResolvedKit}
            label={redTeamTag}
            compact
            fallbackColor={redKitPrimary}
          />
          <span class="victory-digits">
            {activeBanner.redScore ?? gameUI.redScore} - {activeBanner.blueScore ?? gameUI.blueScore}
          </span>
          <KitPatternBadge
            kit={blueResolvedKit}
            label={blueTeamTag}
            compact
            fallbackColor={blueKitPrimary}
          />
        </div>
        {#if activeBanner.scorerName}
          <div class="victory-last-goal">
            {activeBanner.isOwnGoal ? 'Autogol decisivo:' : 'Gol decisivo:'}
            <strong>{activeBanner.scorerName}</strong>
            {#if activeBanner.assisterName && !activeBanner.isOwnGoal}
              <span class="victory-assist-sep">·</span>
              <span>Asist: {activeBanner.assisterName}</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ========================================== -->
  <!-- 2. TELEMETRÍA EN VIVO (ESQUINA INFERIOR IZQ)-->
  <!-- ========================================== -->
  <div class="hud-telemetry-corner" bind:this={telemetryEl}>
    <span class="tel-pulse-dot"></span>
    <span class="tel-label">Ping:</span>
    <span class="tel-val {pingColorClass}">{gameUI.pingMs} ms</span>
    <span class="tel-sep">|</span>
    <span class="tel-label">FPS:</span>
    <span class="tel-val text-cyan">{gameUI.fps}</span>
  </div>

  <!-- ========================================== -->
  <!-- 3. CHAT TÁCTICO FLOTANTE (ADAPTATIVO)      -->
  <!-- ========================================== -->
  <div
    class="hud-chat-container"
    style="--chat-opacity: {normalizedChatOpacity};"
  >
    <!-- Tirador superior de redimensionamiento vertical -->
    <div
      class="chat-resize-handle"
      role="slider"
      aria-label="Ajustar altura del chat"
      aria-valuenow={gameUI.chatHeight}
      aria-valuemin={100}
      aria-valuemax={450}
      aria-orientation="vertical"
      tabindex="0"
      onpointerdown={handleResizePointerDown}
      onkeydown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          gameUI.chatHeight = Math.min(450, gameUI.chatHeight + 10);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          gameUI.chatHeight = Math.max(100, gameUI.chatHeight - 10);
        }
      }}
      title="Arrastra para ajustar la altura del chat"
    >
      <span class="resize-handle-bar"></span>
    </div>

    <div class="chat-messages-scroll custom-scrollbar" bind:this={chatScrollEl}>
      {#if gameUI.chatMessages.length === 0}
        <div class="chat-empty-state">
          <span class="chat-empty-hint">Sala iniciada. Presiona Enter para escribir (@all / @usuario)...</span>
        </div>
      {:else}
        {#each gameUI.chatMessages as msg (msg.id)}
          {#if msg.isSystem || msg.team === 'SYSTEM' || msg.senderTeam === 'system'}
            <div class="chat-line chat-line-system">
              <span class="chat-system-notice">
                {msg.text}
              </span>
            </div>
          {:else}
            <div class="chat-line">
              <span class="chat-sender {msg.team.toLowerCase()} font-bold">
                {msg.sender}:
              </span>
              <span class="chat-text">
                {#each segmentChatMentions(msg.text, gameUI.nickname, knownRosterNames, msg.sender) as seg}
                  {#if seg.kind === 'mention'}
                    <span class="chat-mention-pill" class:is-self={seg.isSelf} class:is-all={seg.isAll}>{seg.value}</span>
                  {:else}
                    {seg.value}
                  {/if}
                {/each}
              </span>
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    {#if isMentionMenuOpen}
      <div class="mention-popup" role="listbox" aria-label="Autocompletar mención">
        {#each mentionCandidates as candidate, idx (candidate.handle)}
          <button
            type="button"
            role="option"
            aria-selected={idx === mentionIndex}
            class="mention-option"
            class:is-active={idx === mentionIndex}
            onmousedown={(e) => {
              e.preventDefault();
              selectMentionCandidate(idx);
            }}
          >
            <span class="mention-handle">@{candidate.handle}</span>
            <span class="mention-meta">{candidate.handle === 'all' ? 'Todos' : candidate.team.toUpperCase()}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="chat-input-bar">
      <input
        bind:this={chatInputEl}
        type="text"
        class="chat-text-input"
        placeholder="Presiona Enter para escribir (@usuario, @all, /extrapolation)..."
        bind:value={chatMessage}
        oninput={syncChatCursor}
        onclick={syncChatCursor}
        onkeyup={syncChatCursor}
        onkeydown={handleChatKeyDown}
        onfocus={() => {
          isChatInputActive = true;
          gameUI.isChatFocused = true;
          syncChatCursor();
        }}
        onblur={() => {
          isChatInputActive = false;
          gameUI.isChatFocused = false;
        }}
      />
      <button
        type="button"
        class="chat-send-trigger"
        aria-label="Enviar Mensaje"
        onclick={handleSendChat}
      >
        <span>ENVIAR</span>
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  :root {
    --chat-height: 160px;
    --top-banner-height: 48px;
    --telemetry-width: 140px;
    --minimap-width: 220px;
  }

  .hud-root {
    position: fixed;
    inset: 0;
    z-index: 40;
    width: 100%;
    height: 100%;
    pointer-events: none;
    user-select: none;
    overflow: hidden;
  }

  .top-bar-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 40;
  }

  .top-card {
    pointer-events: auto;
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-top: none;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65);
    box-sizing: border-box;
  }

  .top-card-left {
    position: fixed;
    top: 0;
    left: 16px;
    z-index: 40;
    height: 44px;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-top: 0;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  .top-card-left.is-ranked {
    background: #422006;
    background-image: linear-gradient(180deg, rgba(234, 179, 8, 0.16) 0%, rgba(161, 98, 7, 0.22) 100%);
    border-color: #ffd700;
    box-shadow: 0 0 16px rgba(255, 215, 0, 0.28), 0 4px 20px rgba(0, 0, 0, 0.65);
  }

  .top-card-left.is-ranked .room-title {
    color: #fde047;
    text-shadow: 0 0 8px rgba(250, 204, 21, 0.45);
  }

  .room-ranked-tag {
    display: inline-flex;
    align-items: center;
    padding: 0.12rem 0.42rem;
    border-radius: 0.25rem;
    background: rgba(250, 204, 21, 0.18);
    border: 1px solid #facc15;
    color: #fef08a;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    line-height: 1;
    flex-shrink: 0;
  }

  .room-title-block {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .room-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #ffffff;
    text-transform: uppercase;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .tel-label {
    color: #bac9cc;
    font-weight: 500;
  }

  .tel-val {
    font-weight: 700;
  }

  .text-emerald { color: #2ecc71; }
  .text-amber { color: #ffdb3c; }
  .text-crimson { color: #ff3366; }
  .text-cyan { color: #00e5ff; }
  .text-gold { color: #ffd700; }

  .top-card-center {
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    height: 44px;
    padding: 0.35rem 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 290px;
    border-top: 0;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    overflow: visible;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.18), 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .top-card-center.top-card-center-slot {
    height: auto;
    min-width: 0;
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .top-card-center.is-warning-30s {
    border-color: #ef4444;
    animation: warningPulse30s 1s ease-in-out infinite alternate;
  }

  .top-card-center-slot.is-warning-30s {
    animation: none;
    background: transparent;
  }

  .goal-replay-pill-bar {
    position: fixed;
    top: 66px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 39;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    pointer-events: none;
    user-select: none;
  }

  .goal-replay-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    padding: 0.28rem 0.78rem;
    border-radius: 999px;
    background: #0d1626;
    border: 1px solid rgba(250, 204, 21, 0.72);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.65);
    color: #fef08a;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .goal-replay-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #ef4444;
    box-shadow: 0 0 8px #ef4444;
  }

  .goal-replay-skip-hint {
    padding: 0.24rem 0.65rem;
    border-radius: 999px;
    background: #0b1320;
    border: 1px solid rgba(0, 229, 255, 0.5);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  @keyframes warningPulse30s {
    0% {
      box-shadow: 0 0 16px rgba(239, 68, 68, 0.4), 0 4px 20px rgba(0, 0, 0, 0.6);
      background-color: rgba(30, 10, 15, 0.95);
    }
    100% {
      box-shadow: 0 0 28px rgba(245, 158, 11, 0.8), 0 4px 25px rgba(239, 68, 68, 0.5);
      background-color: rgba(45, 15, 20, 0.98);
    }
  }

  .glowing-ball-svg {
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    overflow: visible;
    filter: drop-shadow(0 0 8px rgba(250, 204, 21, 0.85)) drop-shadow(0 0 16px rgba(202, 138, 4, 0.5));
    animation: goldenGoalGlow 1.5s ease-in-out infinite alternate;
  }

  @keyframes goldenGoalGlow {
    0% {
      filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.6)) drop-shadow(0 0 12px rgba(202, 138, 4, 0.35));
    }
    100% {
      filter: drop-shadow(0 0 12px rgba(254, 249, 195, 0.95)) drop-shadow(0 0 22px rgba(250, 204, 21, 0.8));
    }
  }

  /* HUD Sliding Event Card below scoreboard */
  .hud-sliding-event-container {
    position: fixed;
    top: 52px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 39;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    animation: slideEventDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .hud-sliding-event-card {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.85rem;
    background: #090e17;
    border: 1px solid var(--event-color, #00e5ff);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.85), 0 0 16px var(--event-color, #00e5ff);
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  .hud-sliding-event-card .event-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    font-weight: 900;
    color: var(--event-color, #00e5ff);
    letter-spacing: 0.06em;
  }

  .hud-sliding-event-card .event-points {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 800;
    color: #22c55e;
  }

  @keyframes slideEventDown {
    0% {
      opacity: 0;
      transform: translate(-50%, -12px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  .rec-auth-warning-toast {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: #181216;
    border: 1px solid #ef4444;
    color: #fca5a5;
    padding: 0.45rem 0.8rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-family: 'Space Grotesk', sans-serif;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.75);
    z-index: 50;
    animation: toastFadeIn 0.25s ease-out;
  }

  @keyframes toastFadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .goal-speed-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.6rem;
    background: rgba(14, 165, 233, 0.15);
    border: 1px solid rgba(14, 165, 233, 0.45);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.82rem;
    font-weight: 700;
    color: #38bdf8;
  }


  .scoreboard-main-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    width: 100%;
  }

  .team-acronym-card {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    min-width: 68px;
    height: 36px;
    border-radius: 0.375rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    user-select: none;
    line-height: 1;
    paint-order: stroke fill;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .team-score-number {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.35rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    min-width: 24px;
    text-align: center;
    color: #ffffff !important;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
  }

  .timer-center-block {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: #080e18;
    border: 1px solid rgba(59, 73, 76, 0.6);
    padding: 0.25rem 0.65rem;
    border-radius: 0.375rem;
  }

  .timer-svg {
    width: 0.9rem;
    height: 0.9rem;
    color: #ffb703;
    flex-shrink: 0;
  }

  .timer-clock {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    font-weight: 800;
    color: #ffb703;
    letter-spacing: 0.08em;
  }

  .top-card-right {
    position: fixed;
    top: 0;
    right: 16px;
    z-index: 40;
    height: 44px;
    padding: 0 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border-top: 0;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  .hud-replay-btn {
    width: 2.15rem;
    height: 2.15rem;
    padding: 0;
    border-radius: 0.45rem;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.35);
    color: #00e5ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    transition: all 0.15s ease;
  }

  .hud-replay-btn:hover {
    background: #1b283b;
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.3);
  }

  .replay-btn-svg {
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
  }

  .hud-rec-btn {
    height: 2.15rem;
    padding: 0 0.65rem;
    border-radius: 0.45rem;
    background: #161c26;
    border: 1px solid rgba(255, 51, 102, 0.45);
    color: #f8fafc;
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .hud-rec-btn:hover {
    background: #221a24;
    border-color: #ff3366;
    box-shadow: 0 0 12px rgba(255, 51, 102, 0.35);
  }

  .hud-rec-btn.is-recording {
    background: #2a1019;
    border-color: #ff3366;
    color: #ffccd7;
    box-shadow: 0 0 14px rgba(255, 51, 102, 0.45);
  }

  .rec-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 9999px;
    background: #ff3366;
    box-shadow: 0 0 6px #ff3366;
  }

  .rec-stop-square {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 2px;
    background: #ff3366;
    box-shadow: 0 0 8px #ff3366;
    animation: pulseGlow 1s infinite;
  }

  .rec-label {
    white-space: nowrap;
  }

  .rec-export-toast {
    pointer-events: auto;
    position: fixed;
    top: 52px;
    right: 16px;
    z-index: 45;
    background: #0b1220;
    border: 1px solid rgba(0, 229, 255, 0.45);
    border-radius: 0.6rem;
    padding: 0.55rem 0.7rem;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    animation: chatMsgSlideIn 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .rec-export-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .rec-export-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    color: #00e5ff;
  }

  .rec-export-close {
    width: 1.35rem;
    height: 1.35rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0.3rem;
    background: #131c2b;
    color: #94a3b8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }

  .rec-export-close:hover {
    color: #ffffff;
    border-color: #ff3366;
  }

  .rec-export-close svg {
    width: 0.8rem;
    height: 0.8rem;
  }

  .rec-saved-notice {
    margin: 0;
    max-width: 270px;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    line-height: 1.4;
    color: #cbd5e1;
  }

  .hud-action-btn {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
  }

  .hud-action-btn:hover {
    background: #242a35;
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.45);
    transform: translateY(-1px);
  }

  .hud-action-btn:active {
    transform: scale(0.95);
  }

  .hud-action-btn.menu-toggle-btn {
    background: rgba(0, 229, 255, 0.18);
    border-color: rgba(0, 229, 255, 0.6);
  }

  .hud-action-btn.menu-toggle-btn:hover {
    background: #00e5ff;
    color: #050811;
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.6);
  }

  .hud-action-btn.is-muted {
    border-color: rgba(255, 71, 87, 0.5);
    background: rgba(255, 71, 87, 0.15);
    box-shadow: 0 0 10px rgba(255, 71, 87, 0.3);
  }

  .hud-btn-svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  .hud-telemetry-corner {
    pointer-events: auto;
    position: fixed;
    bottom: 12px;
    left: 16px;
    z-index: 105;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.75rem;
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    user-select: none;
    box-sizing: border-box;
    white-space: nowrap;
  }

  .tel-pulse-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 9999px;
    background: #2ecc71;
    box-shadow: 0 0 6px #2ecc71;
    animation: pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .tel-sep {
    color: #3b494c;
    font-size: 0.75rem;
    margin: 0 0.1rem;
  }

  .hud-chat-container {
    pointer-events: auto;
    position: fixed;
    bottom: 12px;
    left: calc(var(--telemetry-width, 140px) + 28px);
    right: calc(var(--minimap-width, 220px) + 16px);
    width: auto;
    height: var(--chat-height, 160px);
    z-index: 105;
    background: rgba(10, 16, 26, var(--chat-opacity, 0.95));
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.75rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: visible;
    box-sizing: border-box;
  }

  .chat-resize-handle {
    height: 8px;
    width: 100%;
    cursor: ns-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #080e18;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 0.75rem 0.75rem 0 0;
    user-select: none;
    touch-action: none;
    flex-shrink: 0;
    transition: background 0.15s ease;
    outline: none;
  }

  .chat-resize-handle:hover,
  .chat-resize-handle:active,
  .chat-resize-handle:focus {
    background: rgba(0, 229, 255, 0.15);
  }

  .resize-handle-bar {
    width: 36px;
    height: 3px;
    border-radius: 9999px;
    background: rgba(0, 229, 255, 0.4);
    transition: all 0.15s ease;
  }

  .chat-resize-handle:hover .resize-handle-bar,
  .chat-resize-handle:active .resize-handle-bar,
  .chat-resize-handle:focus .resize-handle-bar {
    background: #00e5ff;
    box-shadow: 0 0 6px #00e5ff;
    width: 48px;
  }

  .chat-messages-scroll {
    flex: 1;
    min-height: 50px;
    padding: 0.55rem 0.85rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.38rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.8rem;
    line-height: 1.35;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }

  .chat-empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #556977;
    font-size: 0.75rem;
    font-style: italic;
  }

  .chat-line {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    animation: chatMsgSlideIn 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .chat-sender {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .chat-sender.red { color: #ff3366; }
  .chat-sender.blue { color: #00e5ff; }
  .chat-sender.spec { color: #8fa0b5; }

  .chat-text {
    color: #dde2f1;
    word-break: break-word;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }

  .chat-mention-pill {
    display: inline-block;
    padding: 0.04rem 0.34rem;
    margin: 0 0.06rem;
    border-radius: 0.28rem;
    background: rgba(0, 229, 255, 0.14);
    border: 1px solid rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.73rem;
    font-weight: 700;
  }

  .chat-mention-pill.is-self {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
    color: #ffd700;
  }

  .chat-line-system {
    padding: 0.1rem 0;
  }

  .chat-system-notice {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    user-select: text;
    -webkit-user-select: text;
  }

  .mention-popup {
    position: absolute;
    left: 0.65rem;
    right: 0.65rem;
    bottom: 2.55rem;
    z-index: 130;
    max-height: 170px;
    overflow-y: auto;
    background: #0b1322;
    border: 1px solid rgba(0, 229, 255, 0.5);
    border-radius: 0.5rem;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.85);
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .mention-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.35rem 0.55rem;
    border-radius: 0.35rem;
    border: none;
    background: transparent;
    color: #cbd5e1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.74rem;
    cursor: pointer;
    text-align: left;
  }

  .mention-option:hover,
  .mention-option.is-active {
    background: rgba(0, 229, 255, 0.18);
    color: #ffffff;
  }

  .mention-handle {
    font-weight: 800;
    color: #00e5ff;
  }

  .mention-meta {
    font-size: 0.65rem;
    color: #94a3b8;
  }

  /* ========================================== */
  /* BANNERS CYBER-PITCH HUD (CERO BLUR)        */
  /* ========================================== */
  .cyber-banner-pause {
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 95;
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.65rem 1.35rem;
    background: #0a101a;
    border: 1.5px solid #00e5ff;
    border-radius: 0.65rem;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.28), 0 8px 28px rgba(0, 0, 0, 0.75);
    animation: bannerElasticIn 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .pause-icon-badge {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 0.45rem;
    background: rgba(0, 229, 255, 0.16);
    border: 1px solid rgba(0, 229, 255, 0.6);
    color: #00e5ff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pause-svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  .pause-copy-col {
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
  }

  .pause-banner-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 900;
    letter-spacing: 0.09em;
    color: #00e5ff;
    text-transform: uppercase;
  }

  .pause-banner-subtitle {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.76rem;
    color: #cbd5e1;
  }

  .cyber-banner-center {
    position: fixed;
    top: 22%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 96;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* 1. Banner VS Sólido (Cero Transparencia) */
  .vs-card {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    opacity: 1;
    background: #080e18;
    padding: 0.35rem;
    border: 1.5px solid rgba(0, 229, 255, 0.38);
    border-radius: 0.75rem;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
    animation: bannerElasticIn 0.34s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .vs-team-half {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.85rem 1.4rem;
    min-width: 195px;
    border-radius: 0.5rem;
    background: #0c1424;
    color: #f8fafc;
    opacity: 1;
    box-sizing: border-box;
  }

  .vs-team-half.vs-visitor {
    justify-content: flex-end;
  }

  .vs-team-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.82rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    padding: 0.25rem 0.6rem;
    border-radius: 0.32rem;
    background: #080e18;
    border: 1.5px solid currentColor;
  }

  .vs-team-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.15rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    color: #f8fafc;
    text-transform: uppercase;
  }

  .vs-bolt-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0 1rem;
    background: #0d1524;
    border: 1.5px solid rgba(0, 229, 255, 0.55);
    border-radius: 0.5rem;
  }

  .vs-bolt-svg {
    width: 0.95rem;
    height: 0.95rem;
    color: #ffd700;
  }

  .vs-text {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #00e5ff;
  }

  /* 2. Banner de Cuenta Regresiva */
  .countdown-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.7rem 1.8rem 0.85rem;
    background: #0a101a;
    border: 1.5px solid #00e5ff;
    border-radius: 0.75rem;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.78), 0 0 26px rgba(0, 229, 255, 0.28);
  }

  .countdown-card.is-go {
    border-color: #2ecc71;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.78), 0 0 28px rgba(46, 204, 113, 0.42);
  }

  .countdown-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .countdown-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 2.55rem;
    font-weight: 900;
    line-height: 1.05;
    color: #00e5ff;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 18px rgba(0, 229, 255, 0.55);
    animation: countdownPopIn 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .countdown-card.is-go .countdown-value {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.85rem;
    letter-spacing: 0.08em;
    color: #2ecc71;
    text-shadow: 0 0 18px rgba(46, 204, 113, 0.55);
  }

  /* 3. Banner de Gol */
  .goal-banner-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.9rem 2rem 1rem;
    min-width: 340px;
    background: #0a101a;
    border: 2px solid var(--goal-c1);
    border-radius: 0.8rem;
    overflow: hidden;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.82), 0 0 30px rgba(0, 229, 255, 0.2);
    animation: bannerElasticIn 0.36s cubic-bezier(0.2, 1.15, 0.35, 1);
  }

  .goal-accent-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    background: linear-gradient(90deg, var(--goal-c1) 0%, var(--goal-c2) 100%);
  }

  .goal-banner-title {
    margin: 0.15rem 0 0;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.45rem;
    font-weight: 900;
    letter-spacing: 0.07em;
    color: #ffffff;
    text-transform: uppercase;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
  }

  .banner-inline-svg {
    width: 1.35rem;
    height: 1.35rem;
    flex-shrink: 0;
  }

  .credit-inline-svg {
    width: 0.85rem;
    height: 0.85rem;
    color: #ffd700;
    vertical-align: -2px;
    margin-right: 0.2rem;
  }

  .goal-credits-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.84rem;
  }

  .goal-scorer-pill,
  .goal-assist-pill {
    padding: 0.24rem 0.7rem;
    border-radius: 0.4rem;
    background: #080e18;
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e2e8f0;
  }

  .goal-scorer-pill strong {
    color: #00e5ff;
    margin-left: 0.25rem;
  }

  .goal-scorer-pill.own-goal {
    border-color: rgba(255, 71, 87, 0.5);
  }

  .goal-scorer-pill.own-goal strong {
    color: #ff6b81;
  }

  .goal-assist-pill {
    border-color: rgba(255, 215, 0, 0.38);
  }

  .goal-assist-pill strong {
    color: #ffd700;
    margin-left: 0.2rem;
  }

  /* 4. Banner de Victoria */
  .victory-banner-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.48rem;
    padding: 0.95rem 2.2rem 1.05rem;
    min-width: 370px;
    background: linear-gradient(180deg, #101726 0%, #080d17 100%);
    border: 2px solid #ffd700;
    border-radius: 0.85rem;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.85), 0 0 32px rgba(255, 215, 0, 0.28);
    animation: bannerElasticIn 0.4s cubic-bezier(0.2, 1.12, 0.35, 1);
  }

  .victory-gold-crown {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    color: #ffd700;
    padding: 0.15rem 0.6rem;
    border-radius: 0.3rem;
    background: rgba(255, 215, 0, 0.12);
    border: 1px solid rgba(255, 215, 0, 0.45);
  }

  .victory-banner-title {
    margin: 0.1rem 0 0;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: 0.07em;
    color: #ffffff;
    text-transform: uppercase;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85);
  }

  .victory-score-strip {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.32rem 1.05rem;
    background: #080e18;
    border: 1px solid rgba(255, 215, 0, 0.35);
    border-radius: 0.5rem;
    font-family: 'JetBrains Mono', monospace;
  }

  .victory-tag {
    font-size: 0.95rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  .victory-digits {
    font-size: 1.35rem;
    font-weight: 900;
    color: #ffd700;
    font-variant-numeric: tabular-nums;
  }

  .victory-last-goal {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.78rem;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .victory-last-goal strong {
    color: #00e5ff;
  }

  .victory-assist-sep {
    color: #64748b;
  }

  @keyframes chatMsgSlideIn {
    0% {
      opacity: 0;
      transform: translateY(6px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulseGlow {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }

  @keyframes bannerElasticIn {
    0% {
      opacity: 0;
      transform: scale(0.86) translateY(-10px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes countdownPopIn {
    0% {
      opacity: 0.25;
      transform: scale(1.32);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .chat-input-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.65rem;
    background: #080e18;
    border-top: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0 0 0.75rem 0.75rem;
    flex-shrink: 0;
  }

  .chat-text-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    color: #ffffff;
  }

  .chat-text-input::placeholder {
    color: #849396;
  }

  .chat-send-trigger {
    padding: 0.25rem 0.65rem;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.25rem;
    color: #00e5ff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chat-send-trigger:hover {
    background: #00e5ff;
    color: #00363d;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(8, 14, 24, 0.6);
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.4);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #00e5ff;
  }
</style>
