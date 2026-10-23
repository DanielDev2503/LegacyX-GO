<script lang="ts">
  import { gameUI, type TeamSlot, type RosterPlayer } from '../state/gameUI.svelte';
  import { soundFX } from '../../audio/SoundFX';
  import { gameApp } from '../../net/GameApp';

  let {
    onStartMatch = () => {},
    onStopMatch = () => {},
    onTogglePause = () => {},
    onLeaveRoom = () => {},
    onTeamChange = (_playerId: number, _team: TeamSlot) => {}
  }: {
    onStartMatch?: () => void;
    onStopMatch?: () => void;
    onTogglePause?: () => void;
    onLeaveRoom?: () => void;
    onTeamChange?: (playerId: number, team: TeamSlot) => void;
  } = $props();

  // Diapositiva del corredor deslizante: 0 = STATS, 1 = LOBBY / MENÚ DE SALA
  let currentSlide = $derived<0 | 1>(
    gameUI.activeSlide === 'STATS' && gameUI.hasCompletedMatch ? 0 : 1
  );

  function goToSlide(slide: 0 | 1) {
    if (slide === 0 && !gameUI.hasCompletedMatch) return;
    soundFX.playUIClick();
    gameUI.activeSlide = slide === 0 ? 'STATS' : 'MENU';
    if (slide === 0) {
      gameUI.activeModal = 'STATS';
    } else {
      gameUI.activeModal = 'TEAM_SELECT';
    }
  }

  let expandedPlayerId = $state<string | null>(null);

  function toggleAccordion(id: string) {
    soundFX.playUIClick();
    expandedPlayerId = expandedPlayerId === id ? null : id;
  }

  let copyStatus = $state<'idle' | 'copied'>('idle');

  let redPlayers = $derived(gameUI.players.filter((p) => p.team === 'red'));
  let specPlayers = $derived(gameUI.players.filter((p) => p.team === 'spectator'));
  let bluePlayers = $derived(gameUI.players.filter((p) => p.team === 'blue'));

  let redCaptain = $derived(redPlayers[0]);
  let blueCaptain = $derived(bluePlayers[0]);
  let redActiveKit = $derived(gameUI.redCaptainKit);
  let blueActiveKit = $derived(gameUI.blueCaptainKit);

  let redTeamName = $derived(redPlayers.length > 0 ? (redActiveKit?.name || 'ROJO') : 'ROJO');
  let redTeamTag = $derived(redPlayers.length > 0 ? (redActiveKit?.tag || 'RED') : 'RED');
  let redPrimaryColor = $derived(redActiveKit?.primaryColor || gameUI.redTeamKit?.primaryColor || '#e74c3c');
  let redSecondaryColor = $derived(redActiveKit?.secondaryColor || gameUI.redTeamKit?.secondaryColor || '#b02a1c');
  let redKitTertiary = $derived(redActiveKit?.tertiaryColor || gameUI.redTeamKit?.tertiaryColor || '#ffffff');
  let redOutlineColor = $derived(redActiveKit?.outlineColor || gameUI.redTeamKit?.outlineColor || '#000000');
  let redHasOutline = $derived(redOutlineColor !== 'none' && redOutlineColor !== 'transparent' && redOutlineColor !== '');

  let blueTeamName = $derived(bluePlayers.length > 0 ? (blueActiveKit?.name || 'AZUL') : 'AZUL');
  let blueTeamTag = $derived(bluePlayers.length > 0 ? (blueActiveKit?.tag || 'BLU') : 'BLU');
  let bluePrimaryColor = $derived(blueActiveKit?.primaryColor || gameUI.blueTeamKit?.primaryColor || '#3498db');
  let blueSecondaryColor = $derived(blueActiveKit?.secondaryColor || gameUI.blueTeamKit?.secondaryColor || '#217dbb');
  let blueKitTertiary = $derived(blueActiveKit?.tertiaryColor || gameUI.blueTeamKit?.tertiaryColor || '#ffffff');
  let blueOutlineColor = $derived(blueActiveKit?.outlineColor || gameUI.blueTeamKit?.outlineColor || '#000000');
  let blueHasOutline = $derived(blueOutlineColor !== 'none' && blueOutlineColor !== 'transparent' && blueOutlineColor !== '');

  let isRedCaptainOrAdmin = $derived(
    gameUI.isHost || gameUI.isAdmin || (gameUI.allowCaptainKitSwitch && redCaptain && redCaptain.id === gameUI.localPlayerId)
  );
  let isBlueCaptainOrAdmin = $derived(
    gameUI.isHost || gameUI.isAdmin || (gameUI.allowCaptainKitSwitch && blueCaptain && blueCaptain.id === gameUI.localPlayerId)
  );

  function handleSetRedKitVariant(variant: 'home' | 'away') {
    if (!isRedCaptainOrAdmin) return;
    soundFX.playUIClick();
    gameUI.setRedKitVariant(variant);
    gameApp.setKitVariant('red', variant);
  }

  function handleSetBlueKitVariant(variant: 'home' | 'away') {
    if (!isBlueCaptainOrAdmin) return;
    soundFX.playUIClick();
    gameUI.setBlueKitVariant(variant);
    gameApp.setKitVariant('blue', variant);
  }

  let isMatchStopped = $derived(
    gameUI.fsmPhase === 'STOPPED' ||
    gameUI.matchPhase === 0 ||
    gameUI.matchState === 'STOPPED' ||
    gameUI.matchState === 'STATS'
  );
  let isMatchPaused = $derived(gameUI.fsmPhase === 'PAUSED' || gameUI.matchPhase === 2.1);
  let canClose = $derived(!gameUI.isTeamSelectForcedOpen && gameUI.matchPhase !== 0);

  let isRoomPublic = $state(gameUI.activeRoom ? !gameUI.activeRoom.isPrivate : true);
  let roomPassword = $state(gameUI.activeRoom?.password || '');

  // ==========================================
  // DRAG & DROP Y MENÚ CONTEXTUAL DE ADMIN
  // ==========================================
  let draggedPlayerId = $state<number | null>(null);
  let dragOverTeam = $state<TeamSlot | null>(null);
  let wasDragged = $state(false);
  let dragStartTime = 0;

  function canDragPlayer(player: RosterPlayer): boolean {
    if (gameUI.isAdmin || gameUI.isHost) return true;
    if (!gameUI.teamsLocked && player.id === gameUI.localPlayerId) return true;
    return false;
  }

  function handleDragStart(e: DragEvent, player: RosterPlayer) {
    if (!canDragPlayer(player)) {
      e.preventDefault();
      return;
    }
    draggedPlayerId = player.id;
    wasDragged = true;
    dragStartTime = Date.now();
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', String(player.id));
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragEnd() {
    draggedPlayerId = null;
    dragOverTeam = null;
    setTimeout(() => {
      wasDragged = false;
    }, 150);
  }

  function handleDragOver(e: DragEvent, team: TeamSlot) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverTeam = team;
  }

  function handleDragLeave(e: DragEvent, team: TeamSlot) {
    if (dragOverTeam === team) {
      dragOverTeam = null;
    }
  }

  function handleDrop(e: DragEvent, targetTeam: TeamSlot) {
    e.preventDefault();
    const idStr = e.dataTransfer?.getData('text/plain');
    const playerId = idStr ? Number(idStr) : draggedPlayerId;
    dragOverTeam = null;
    draggedPlayerId = null;
    if (playerId !== null && !isNaN(playerId)) {
      soundFX.playUIClick();
      if (gameUI.changeTeam(playerId, targetTeam)) {
        onTeamChange(playerId, targetTeam);
      }
    }
    setTimeout(() => {
      wasDragged = false;
    }, 150);
  }

  // Menú contextual flotante
  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    player: RosterPlayer | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    player: null
  });

  function handlePlayerCardClick(e: MouseEvent, player: RosterPlayer) {
    if (wasDragged || Date.now() - dragStartTime < 200) return;
    if (!gameUI.isAdmin && !gameUI.isHost) return;

    e.stopPropagation();
    soundFX.playUIClick();

    const menuWidth = 175;
    const menuHeight = 145;
    let x = e.clientX;
    let y = e.clientY;

    if (typeof window !== 'undefined') {
      if (x + menuWidth > window.innerWidth - 12) {
        x = window.innerWidth - menuWidth - 12;
      }
      if (y + menuHeight > window.innerHeight - 12) {
        y = window.innerHeight - menuHeight - 12;
      }
    }

    contextMenu = {
      visible: true,
      x,
      y,
      player
    };
  }

  function closeContextMenu() {
    contextMenu.visible = false;
  }

  // ==========================================
  // CONTROLES FSM Y OPERACIÓN DE SALA
  // ==========================================
  function handleStartMatch() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    gameUI.startMatch();
    gameUI.clearModalStack();
    onStartMatch();
  }

  function handleStopMatch() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    gameUI.stopMatch();
    gameUI.openOverlay('TEAM_MANAGEMENT');
    onStopMatch();
  }

  function handleMatchToggle() {
    if (isMatchStopped) {
      handleStartMatch();
    } else {
      handleStopMatch();
    }
  }

  function handlePauseToggle() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    gameUI.togglePause();
    onTogglePause();
  }

  function handleClose() {
    if (!canClose) return;
    soundFX.playUIClick();
    gameUI.closeModal();
  }

  function handleLeave() {
    soundFX.playUIClick();
    gameUI.leaveRoom();
    onLeaveRoom();
  }

  let roomCapacity = $state(gameUI.activeRoom?.maxPlayers || 12);

  function handleCopyLink() {
    soundFX.playUIClick();
    const roomCode = gameUI.matchId || gameUI.activeRoom?.id || 'CTNYRS';
    const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}/#room=${roomCode}` : roomCode;
    navigator.clipboard?.writeText(fullUrl).catch(() => {});
    copyStatus = 'copied';
    setTimeout(() => {
      copyStatus = 'idle';
    }, 2000);
  }

  function changeCapacity(delta: number) {
    if (!gameUI.isHost) return;
    soundFX.playUIClick();
    const next = Math.max(2, Math.min(20, roomCapacity + delta));
    roomCapacity = next;
    if (gameUI.activeRoom) {
      gameUI.activeRoom.maxPlayers = next;
    }
    gameUI.onRoomConfigChanged?.({ maxPlayers: next });
  }

  function formatTimeLimit(val: number): string {
    return val === 0 ? '0 (Indefinido)' : `${val} min`;
  }

  function formatGoalsLimit(val: number): string {
    return val === 0 ? '0 (Sin límite)' : `${val} ${val === 1 ? 'gol' : 'goles'}`;
  }
</script>

<div
  id="ingame-menu"
  class="modal-backdrop"
  class:is-forced-open={gameUI.isTeamSelectForcedOpen || gameUI.matchPhase === 0}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={(e) => {
    if (e.target === e.currentTarget && canClose) handleClose();
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape' && canClose) handleClose();
  }}
>
  <!-- Viewport del Corredor Deslizante -->
  <div class="corridor-viewport">
    <div class="corridor-container">
      <!-- ======================================================== -->
      <!-- DIAPOSITIVA 0: ESTADÍSTICAS Y MVP (CORREDOR DESLIZANTE)  -->
      <!-- ======================================================== -->
      <div
        class="corridor-slide slide-stats"
        class:is-active={currentSlide === 0}
        class:slide-out-left={currentSlide === 1}
        id="slide-stats"
      >
        <!-- Pestaña exterior lateral DERECHA: MENÚ > -->
        <button
          type="button"
          id="btn-goto-menu"
          class="external-nav-tab right-tab"
          aria-label="Ir a Menú de Sala"
          onclick={() => goToSlide(1)}
        >
          <span id="stats-to-menu-btn">MENÚ</span>
          <span class="nav-chevron">&gt;</span>
        </button>

        <!-- Tarjeta Central de Estadísticas -->
        <div class="team-modal-card stats-modal-card">
          <!-- Header de Estadísticas -->
          <header class="stats-header-row">
            <!-- Marcador Homologado con HUD y Colores del Capitán -->
            <div class="stats-scoreboard-banner">
              <div
                class="stats-acronym-badge red-acronym"
                style="
                  background: linear-gradient(135deg, {redPrimaryColor} 0%, {redPrimaryColor} 25%, {redSecondaryColor} 75%, {redSecondaryColor} 100%);
                  border: {redHasOutline ? '1.5px solid #000000' : `1.5px solid ${redKitTertiary}`};
                  box-shadow: {redHasOutline ? '0 0 0 1.5px #000000' : 'none'};
                  color: {redKitTertiary};
                  -webkit-text-stroke: 3px #000000;
                  paint-order: stroke fill;
                  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
                "
              >
                {redTeamTag}
              </div>
              <span class="stats-score-num" id="post-score-red">{gameUI.redScore}</span>
              <span class="stats-score-sep">-</span>
              <span class="stats-score-num" id="post-score-blue">{gameUI.blueScore}</span>
              <div
                class="stats-acronym-badge blue-acronym"
                style="
                  background: linear-gradient(135deg, {bluePrimaryColor} 0%, {bluePrimaryColor} 25%, {blueSecondaryColor} 75%, {blueSecondaryColor} 100%);
                  border: {blueHasOutline ? '1.5px solid #000000' : `1.5px solid ${blueKitTertiary}`};
                  box-shadow: {blueHasOutline ? '0 0 0 1.5px #000000' : 'none'};
                  color: {blueKitTertiary};
                  -webkit-text-stroke: 3px #000000;
                  paint-order: stroke fill;
                  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
                "
              >
                {blueTeamTag}
              </div>
            </div>

            <div class="match-status-meta">
              {#if gameUI.redScore > gameUI.blueScore}
                <span class="badge-victory red">VICTORIA {redTeamName.toUpperCase()}</span>
              {:else if gameUI.blueScore > gameUI.redScore}
                <span class="badge-victory blue">VICTORIA {blueTeamName.toUpperCase()}</span>
              {:else}
                <span class="badge-victory draw">EMPATE</span>
              {/if}
              <span class="match-time-chip">⏱ {gameUI.matchTimeFormatted}</span>
            </div>

            {#if gameUI.mvp}
              <div class="mvp-golden-plaque">
                <span class="crown-icon">👑</span>
                <span class="mvp-title">MVP: {gameUI.mvp.nickname}</span>
                <span class="mvp-points-chip">({gameUI.mvp.points} pts)</span>
              </div>
            {/if}
          </header>

          <!-- Tablas Duales Paralelas RED y BLUE con Cabeceras Bicolor Suave y Nombres de Capitán -->
          <div class="tables-parallel-grid">
            <!-- TABLA RED -->
            <div
              class="team-table-box red-box"
              style="--captain-local-primary: {redPrimaryColor}; --captain-local-glow: {redPrimaryColor}40; --captain-local-tertiary: {redKitTertiary};"
            >
              <div
                class="table-header red-header captain-bicolor-header"
                style="background: linear-gradient(90deg, {redPrimaryColor} 0%, {redPrimaryColor} 30%, {redSecondaryColor} 70%, {redSecondaryColor} 100%);"
              >
                <span
                  class="col-team-name-hdr"
                  style="color: {redKitTertiary}; text-shadow: {redHasOutline ? '-1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000' : 'none'};"
                >{redTeamName}</span>
                <div class="col-headers-right" style="color: {redKitTertiary};">
                  <span class="col-pts">Pts</span>
                  <span class="col-stat">G</span>
                  <span class="col-stat">A</span>
                  <span class="col-stat">P</span>
                  <span class="col-stat">S</span>
                  <span class="col-arrow"></span>
                </div>
              </div>

                <div class="table-scroll-body custom-scrollbar-red">
                  {#each gameUI.redTeamStats as player}
                    {@const isExpanded = expandedPlayerId === player.nickname}
                    <div class="player-stat-row" class:row-expanded={isExpanded}>
                      <div
                        class="row-summary accordion-trigger"
                        role="button"
                        tabindex="0"
                        onclick={() => toggleAccordion(player.nickname)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleAccordion(player.nickname);
                          }
                        }}
                      >
                        <span class="col-player bold">
                          {#if player.isCaptain}
                            <span class="badge-cap red">©</span>
                          {/if}
                          {player.nickname}
                        </span>
                        <span class="col-pts red-txt">{player.points}</span>
                        <span class="col-stat">{player.goals}</span>
                        <span class="col-stat">{player.assists}</span>
                        <span class="col-stat">{player.passes}</span>
                        <span class="col-stat">{player.shots}</span>
                        <span class="col-arrow chevron-icon">{isExpanded ? '▲' : '▼'}</span>
                      </div>

                      {#if isExpanded}
                        <div class="accordion-drawer">
                          <div class="drawer-grid">
                            <div class="drawer-chip">
                              <span class="chip-label">Toques</span>
                              <span class="chip-val text-cyan">+{(player.touches ?? 14) * 2}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Pases</span>
                              <span class="chip-val text-cyan">+{player.passes * 10}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Tiros</span>
                              <span class="chip-val text-cyan">+{player.shots * 20}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Goles</span>
                              <span class="chip-val text-green">+{player.goals * 100}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Autogol</span>
                              <span class="chip-val text-error">-{player.ownGoals ? player.ownGoals * 50 : 0}</span>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>

              <!-- TABLA BLUE -->
              <div
                class="team-table-box blue-box"
                style="--captain-visitor-primary: {bluePrimaryColor}; --captain-visitor-glow: {bluePrimaryColor}40; --captain-visitor-tertiary: {blueKitTertiary};"
              >
                <div
                  class="table-header blue-header captain-bicolor-header"
                  style="background: linear-gradient(90deg, {bluePrimaryColor} 0%, {bluePrimaryColor} 30%, {blueSecondaryColor} 70%, {blueSecondaryColor} 100%);"
                >
                  <span
                    class="col-team-name-hdr"
                    style="color: {blueKitTertiary}; text-shadow: {blueHasOutline ? '-1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000' : 'none'};"
                  >{blueTeamName}</span>
                  <div class="col-headers-right" style="color: {blueKitTertiary};">
                    <span class="col-pts">Pts</span>
                    <span class="col-stat">G</span>
                    <span class="col-stat">A</span>
                    <span class="col-stat">P</span>
                    <span class="col-stat">S</span>
                    <span class="col-arrow"></span>
                  </div>
                </div>

                <div class="table-scroll-body custom-scrollbar">
                  {#each gameUI.blueTeamStats as player}
                    {@const isExpanded = expandedPlayerId === player.nickname}
                    <div
                      class="player-stat-row"
                      class:is-mvp={player.isMvp}
                      class:row-expanded={isExpanded}
                    >
                      <div
                        class="row-summary accordion-trigger"
                        role="button"
                        tabindex="0"
                        onclick={() => toggleAccordion(player.nickname)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleAccordion(player.nickname);
                          }
                        }}
                      >
                        <span class="col-player bold" class:gold-player={player.isMvp}>
                          {#if player.isMvp}
                            <span class="crown-sm">👑</span>
                          {:else if player.isCaptain}
                            <span class="badge-cap blue">©</span>
                          {/if}
                          {player.nickname}
                          {#if player.isHost}
                            <span class="host-tag">(Host)</span>
                          {/if}
                        </span>
                        <span class="col-pts" class:gold-txt={player.isMvp} class:blue-txt={!player.isMvp}>
                          {player.points}
                        </span>
                        <span class="col-stat" class:gold-stat={player.isMvp}>{player.goals}</span>
                        <span class="col-stat">{player.assists}</span>
                        <span class="col-stat">{player.passes}</span>
                        <span class="col-stat">{player.shots}</span>
                        <span class="col-arrow chevron-icon">{isExpanded ? '▲' : '▼'}</span>
                      </div>

                      {#if isExpanded}
                        <div class="accordion-drawer">
                          <div class="drawer-grid">
                            <div class="drawer-chip">
                              <span class="chip-label">Toques</span>
                              <span class="chip-val text-cyan">+{(player.touches ?? 14) * 2}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Pases</span>
                              <span class="chip-val text-cyan">+{player.passes * 10}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Tiros</span>
                              <span class="chip-val text-cyan">+{player.shots * 20}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Goles</span>
                              <span class="chip-val text-gold">+{player.goals * 100}</span>
                            </div>
                            <div class="drawer-chip">
                              <span class="chip-label">Autogol</span>
                              <span class="chip-val text-muted">0</span>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>

      <!-- ======================================================== -->
      <!-- SLIDE 1: MENÚ DE SALA (CORREDOR DESLIZANTE)              -->
      <!-- ======================================================== -->
      <div
        class="corridor-slide slide-menu"
        class:is-active={currentSlide === 1}
        class:slide-out-right={currentSlide === 0}
        id="slide-lobby"
      >
        <!-- Pestaña exterior lateral IZQUIERDA: < STATS -->
        {#if gameUI.hasCompletedMatch && gameUI.lastMatchStats && gameUI.lastMatchStats.length > 0}
          <button
            type="button"
            id="btn-goto-stats"
            class="external-nav-tab left-tab"
            aria-label="Ir a Estadísticas"
            onclick={() => goToSlide(0)}
          >
            <span class="nav-chevron">&lt;</span>
            <span id="lobby-to-stats-btn">STATS</span>
          </button>
        {/if}

        <!-- Tarjeta Central del Menú de Sala -->
        <div class="team-modal-card lobby-modal-card">
            <!-- 1. Cabecera Limpia (Sin prefijos 'SALA:' ni emojis) -->
            <header class="modal-header">
              <div class="room-identity">
                <h2 class="room-title">{gameUI.activeRoomName || 'TORNEO NOCTURNO #12'}</h2>
                <span class="header-divider">|</span>
                <span class="room-id-badge">ID: {gameUI.matchId || gameUI.activeRoom?.id || 'CTNYRS'}</span>
              </div>

              <div class="header-actions">
                <button
                  type="button"
                  id="btn-header-copy-link"
                  class="btn-copy-link"
                  onclick={handleCopyLink}
                  title="Copiar enlace directo a la sala"
                >
                  <svg class="header-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                  </svg>
                  <span>{copyStatus === 'copied' ? '¡COPIADO!' : 'COPIAR LINK'}</span>
                </button>

                <!-- Botón Abandonar -->
                <button
                  type="button"
                  id="btn-quick-close"
                  class="btn-leave"
                  onclick={handleLeave}
                  title="Abandonar la sala"
                >
                  <svg class="header-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>ABANDONAR</span>
                </button>

                {#if canClose}
                  <button
                    type="button"
                    id="menu-close-btn"
                    class="btn-close-x"
                    onclick={handleClose}
                    aria-label="Cerrar menú"
                  >
                    ✕
                  </button>
                {/if}
              </div>
            </header>

            <!-- 2. Cuerpo en 4 Columnas: Panel Izquierdo (Reglas/Ajustes/FSM) + 3 Banquillos -->
            <div class="modal-body-layout">
              <!-- ======================================== -->
              <!-- COLUMNA 1 (1/3: AJUSTES, REGLAS Y FSM)   -->
              <!-- ======================================== -->
              <aside class="col-settings-panel">
                <div class="col-settings-scroll custom-scrollbar">
                  <!-- Reglas 2x2 Grid con altura 40px y 100% Hitbox -->
                  <div class="rules-4btn-grid">
                    <!-- Tiempo -->
                    <div class="rule-cartouche" title="Tiempo de partido">
                      <span class="rule-cartouche-content">
                        <span class="rule-icon">⏱</span>
                        <span class="rule-value">{formatTimeLimit(gameUI.timeLimitMinutes)}</span>
                      </span>
                      <span class="rule-arrow">▾</span>
                      <select
                        id="select-time-limit"
                        class="rule-select-overlay"
                        value={gameUI.timeLimitMinutes}
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                        onchange={(e) => {
                          const val = Number((e.currentTarget as HTMLSelectElement).value);
                          soundFX.playUIClick();
                          gameUI.timeLimitMinutes = val;
                          gameUI.physicsModifiers.timeLimit = val;
                          if (gameUI.activeRoom) gameUI.activeRoom.timeLimit = val;
                          gameUI.onRoomConfigChanged?.({ timeLimit: val });
                        }}
                      >
                        {#each Array.from({ length: 16 }, (_, i) => i) as t}
                          <option value={t}>{formatTimeLimit(t)}</option>
                        {/each}
                      </select>
                    </div>

                    <!-- Goles -->
                    <div class="rule-cartouche" title="Límite de goles">
                      <span class="rule-cartouche-content">
                        <span class="rule-icon">⚽</span>
                        <span class="rule-value">{formatGoalsLimit(gameUI.scoreLimitGoals)}</span>
                      </span>
                      <span class="rule-arrow">▾</span>
                      <select
                        id="select-goal-limit"
                        class="rule-select-overlay"
                        value={gameUI.scoreLimitGoals}
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                        onchange={(e) => {
                          const val = Number((e.currentTarget as HTMLSelectElement).value);
                          soundFX.playUIClick();
                          gameUI.scoreLimitGoals = val;
                          gameUI.physicsModifiers.scoreLimit = val;
                          if (gameUI.activeRoom) gameUI.activeRoom.scoreLimit = val;
                          gameUI.onRoomConfigChanged?.({ scoreLimit: val });
                        }}
                      >
                        {#each Array.from({ length: 16 }, (_, i) => i) as g}
                          <option value={g}>{formatGoalsLimit(g)}</option>
                        {/each}
                      </select>
                    </div>

                    <!-- Bloqueo de Equipos -->
                    <button
                      type="button"
                      id="btn-lock-teams"
                      class="rule-cartouche-btn lock-teams-btn"
                      class:active-locked={gameUI.teamsLocked}
                      disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                      title="Bloquear equipos para que solo los administradores puedan mover jugadores"
                      onclick={() => {
                        soundFX.playUIClick();
                        gameUI.toggleTeamsLock();
                        gameUI.onRoomConfigChanged?.({ teamsLocked: gameUI.teamsLocked });
                      }}
                    >
                      <span class="lock-label">{gameUI.teamsLocked ? '🔒 Bloqueados' : '🔓 Libres'}</span>
                      <span class="lock-tag">{gameUI.teamsLocked ? 'SOLO ADMINS' : 'TODOS'}</span>
                    </button>

                    <!-- Bloqueo de Equipaciones por Capitanes -->
                    <button
                      type="button"
                      id="btn-lock-captain-kits"
                      class="rule-cartouche-btn lock-teams-btn"
                      class:active-locked={!gameUI.allowCaptainKitSwitch}
                      disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                      title="Permitir o bloquear el cambio de camisetas para capitanes"
                      onclick={() => {
                        soundFX.playUIClick();
                        gameUI.allowCaptainKitSwitch = !gameUI.allowCaptainKitSwitch;
                        if (gameUI.isHost) {
                          gameApp.updateRoomConfig({ allowCaptainKitSwitch: gameUI.allowCaptainKitSwitch });
                        } else {
                          gameApp.dispatchAdminAction('TOGGLE_CAPTAIN_KIT_SWITCH', { allowCaptainKitSwitch: gameUI.allowCaptainKitSwitch });
                        }
                      }}
                    >
                      <span class="lock-label">{gameUI.allowCaptainKitSwitch ? '👕 Camisetas Libres' : '🔒 Camisetas Fijas'}</span>
                      <span class="lock-tag">{gameUI.allowCaptainKitSwitch ? 'CAPITANES' : 'BLOQUEADO'}</span>
                    </button>

                    <!-- Balanceo Automático de Espectadores -->
                    <button
                      type="button"
                      id="btn-auto-balance"
                      class="rule-cartouche-btn btn-auto-balance"
                      disabled={(!gameUI.isAdmin && !gameUI.isHost) || specPlayers.length === 0 || gameUI.isMatchActive}
                      title="Balancear automáticamente espectadores a Rojo y Azul (1 a cada equipo por clic)"
                      onclick={() => {
                        gameUI.autoBalanceSpectators();
                      }}
                    >
                      <span class="lock-label">⚖️ Auto</span>
                      <span class="lock-tag">({specPlayers.length})</span>
                    </button>

                    <!-- Modifiers (Exclusivo Host) -->
                    <button
                      type="button"
                      id="btn-open-physics-modifiers"
                      class="rule-cartouche-btn btn-modifiers"
                      disabled={!gameUI.isHost || gameUI.isMatchActive}
                      onclick={() => {
                        if (!gameUI.isHost) return;
                        gameUI.openOverlay('MODIFIERS');
                      }}
                      title="Abrir panel de modificadores de física (Solo Host)"
                    >
                      <span>⚡ Modifiers</span>
                    </button>
                  </div>

                  <!-- Escoger estadio -->
                  <div class="stadium-section w-full">
                    <div class="param-label-row">
                      <span class="param-name">Escoger estadio</span>
                    </div>

                    <div
                      class="stadium-preview-box"
                      tabindex="0"
                      role="button"
                      onmouseenter={() => soundFX.playUIHover()}
                      onclick={() => {
                        if ((gameUI.isAdmin || gameUI.isHost) && !gameUI.isMatchActive) {
                          soundFX.playUIClick();
                          gameUI.openOverlay('STADIUM_SELECT');
                        }
                      }}
                      onkeydown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && (gameUI.isAdmin || gameUI.isHost) && !gameUI.isMatchActive) {
                          e.preventDefault();
                          soundFX.playUIClick();
                          gameUI.openOverlay('STADIUM_SELECT');
                        }
                      }}
                      title="Dar click para cambiar de estadio"
                    >
                      <svg class="stadium-svg" viewBox="0 0 300 150" preserveAspectRatio="none">
                        <rect x="4" y="4" width="292" height="142" rx="4" fill="#092215" stroke="#00e5ff" stroke-opacity="0.45" stroke-width="1.5" />
                        <line x1="150" y1="4" x2="150" y2="146" stroke="#00e5ff" stroke-opacity="0.4" stroke-width="1.5" />
                        <circle cx="150" cy="75" r="32" fill="none" stroke="#00e5ff" stroke-opacity="0.4" stroke-width="1.5" />
                        <circle cx="150" cy="75" r="3" fill="#00e5ff" />
                        <rect x="4" y="40" width="36" height="70" fill="none" stroke="#00e5ff" stroke-opacity="0.35" stroke-width="1.2" />
                        <rect x="1" y="58" width="5" height="34" fill="rgba(0, 229, 255, 0.35)" stroke="#00e5ff" stroke-width="1" />
                        <rect x="260" y="40" width="36" height="70" fill="none" stroke="#00e5ff" stroke-opacity="0.35" stroke-width="1.2" />
                        <rect x="294" y="58" width="5" height="34" fill="rgba(0, 229, 255, 0.35)" stroke="#00e5ff" stroke-width="1" />
                      </svg>

                      <div class="stadium-overlay">
                        <span class="stadium-name">{gameUI.activeStadiumName || 'Mediano'}</span>
                        <span class="stadium-action-text">Dar click para cambiar de estadio</span>
                      </div>
                    </div>
                  </div>

                  <!-- Ajustes Avanzados de Sala con Toggle Pública/Privada y Contraseña Condicional (Exclusivo Host) -->
                  <div class="advanced-settings-card w-full">
                    <span class="card-micro-title">⚙️ AJUSTES DE SALA {#if !gameUI.isHost}<span class="text-xs text-muted">(Solo Host)</span>{/if}</span>

                    <div class="adv-row">
                      <label for="room-name-input">Nombre de Sala</label>
                      <input
                        id="room-name-input"
                        type="text"
                        maxlength="50"
                        class="styled-adv-input"
                        bind:value={gameUI.activeRoomName}
                        disabled={!gameUI.isHost || gameUI.isMatchActive}
                        oninput={() => gameUI.onRoomConfigChanged?.({ name: gameUI.activeRoomName })}
                      />
                    </div>

                    <div class="adv-capacity-row">
                      <span class="adv-label">Capacidad Jugadores:</span>
                      <div class="cap-stepper">
                        <button
                          type="button"
                          id="btn-cap-minus"
                          class="cap-step-btn"
                          disabled={!gameUI.isHost || gameUI.isMatchActive}
                          onclick={() => changeCapacity(-1)}
                        >
                          -
                        </button>
                        <span id="capacity-value" class="cap-num-val">{roomCapacity}</span>
                        <button
                          type="button"
                          id="btn-cap-plus"
                          class="cap-step-btn"
                          disabled={!gameUI.isHost || gameUI.isMatchActive}
                          onclick={() => changeCapacity(1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div class="toggle-row">
                      <span class="toggle-label">{isRoomPublic ? '🌐 Sala pública' : '🔒 Sala privada'}</span>
                      <label class="switch">
                        <input
                          type="checkbox"
                          bind:checked={isRoomPublic}
                          disabled={!gameUI.isHost || gameUI.isMatchActive}
                          onchange={() => {
                            soundFX.playUIClick();
                            if (isRoomPublic) {
                              roomPassword = '';
                              if (gameUI.activeRoom) {
                                gameUI.activeRoom.isPrivate = false;
                                gameUI.activeRoom.password = '';
                              }
                            } else {
                              if (gameUI.activeRoom) {
                                gameUI.activeRoom.isPrivate = true;
                              }
                            }
                            gameUI.onRoomConfigChanged?.({
                              isPrivate: !isRoomPublic,
                              password: roomPassword
                            });
                          }}
                        />
                        <span class="slider"></span>
                      </label>
                    </div>

                    {#if !isRoomPublic}
                      <div class="adv-row password-row">
                        <label for="room-password-input">Contraseña de Sala</label>
                        <input
                          id="room-password-input"
                          type="text"
                          maxlength="30"
                          placeholder="Escribe la clave de acceso..."
                          class="styled-adv-input"
                          bind:value={roomPassword}
                          disabled={!gameUI.isHost || gameUI.isMatchActive}
                          oninput={(e) => {
                            const val = (e.currentTarget as HTMLInputElement).value;
                            roomPassword = val;
                            if (gameUI.activeRoom) gameUI.activeRoom.password = val;
                            gameUI.onRoomConfigChanged?.({
                              isPrivate: true,
                              password: val
                            });
                          }}
                        />
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Footer FSM -->
                <div class="fsm-footer-controls">
                  {#if isMatchStopped}
                    <button
                      type="button"
                      id="btn-match-toggle"
                      class="btn-start-match btn btn-success btn-match-toggle"
                      disabled={!gameUI.isAdmin && !gameUI.isHost}
                      onclick={handleStartMatch}
                    >
                      <span>▶ INICIAR PARTIDO</span>
                    </button>
                  {:else}
                    <div class="fsm-running-grid">
                      <button
                        type="button"
                        id="btn-match-toggle"
                        class="btn-stop-match btn btn-danger btn-match-toggle"
                        disabled={!gameUI.isAdmin && !gameUI.isHost}
                        onclick={handleStopMatch}
                      >
                        <span>■ DETENER PARTIDO</span>
                      </button>

                      <button
                        type="button"
                        id="btn-fsm-pause"
                        class="btn-pause-match btn btn-warning"
                        class:is-resuming={isMatchPaused}
                        disabled={!gameUI.isAdmin && !gameUI.isHost}
                        onclick={handlePauseToggle}
                      >
                        <span>{isMatchPaused ? '▶ REANUDAR' : '⏸ PAUSAR'}</span>
                      </button>
                    </div>
                  {/if}
                </div>
              </aside>

              <!-- ======================================== -->
              <!-- COLUMNAS 2, 3, 4 (2/3: BANQUILLOS)       -->
              <!-- ======================================== -->
              <main class="col-benches-grid">
                <!-- 1. EQUIPO ROJO (LOCAL) -->
                <div
                  class="bench-card red-bench"
                  role="region"
                  aria-label="Banquillo Equipo Rojo"
                  style="--captain-local-primary: {redPrimaryColor}; --captain-local-glow: {redPrimaryColor}40; --bench-team-primary: {redPrimaryColor}; --captain-local-tertiary: {redKitTertiary};"
                  class:is-drag-over={dragOverTeam === 'red'}
                  ondragover={(e) => handleDragOver(e, 'red')}
                  ondragleave={(e) => handleDragLeave(e, 'red')}
                  ondrop={(e) => handleDrop(e, 'red')}
                >
                  <div
                    class="bench-card-header red-header captain-bicolor-header"
                    style="background: linear-gradient(90deg, {redPrimaryColor} 0%, {redPrimaryColor} 30%, {redSecondaryColor} 70%, {redSecondaryColor} 100%);"
                  >
                    <span
                      class="team-name"
                      style="color: {redKitTertiary}; text-shadow: {redHasOutline ? '-1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000' : 'none'};"
                    >{redTeamName}</span>
                    <div class="kit-variant-toggles" role="group" aria-label="Equipación del equipo rojo">
                      <button
                        type="button"
                        class="kit-variant-btn"
                        class:active={gameUI.redKitVariant === 'home'}
                        disabled={!isRedCaptainOrAdmin}
                        title={isRedCaptainOrAdmin ? 'Equipación Local' : 'Solo capitán o admin'}
                        onclick={() => handleSetRedKitVariant('home')}
                      >
                        Local
                      </button>
                      <button
                        type="button"
                        class="kit-variant-btn"
                        class:active={gameUI.redKitVariant === 'away'}
                        disabled={!isRedCaptainOrAdmin}
                        title={isRedCaptainOrAdmin ? 'Equipación Visitante' : 'Solo capitán o admin'}
                        onclick={() => handleSetRedKitVariant('away')}
                      >
                        Visitante
                      </button>
                    </div>
                  </div>

                  <div id="redPlayersList" class="bench-players-list custom-scrollbar-red">
                    {#each redPlayers as p (p.id)}
                      {@const isCaptain = p.id === redCaptain?.id}
                      {@const isDraggable = canDragPlayer(p)}
                      <div
                        class="player-slot-card red-slot"
                        role="button"
                        tabindex="0"
                        class:cursor-grab={isDraggable}
                        class:cursor-not-allowed={!isDraggable}
                        class:is-dragging={draggedPlayerId === p.id}
                        draggable={isDraggable}
                        ondragstart={(e) => handleDragStart(e, p)}
                        ondragend={handleDragEnd}
                        onclick={(e) => handlePlayerCardClick(e, p)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handlePlayerCardClick(e as unknown as MouseEvent, p);
                          }
                        }}
                      >
                        <!-- 1. Avatar Circular de 32px -->
                        <div class="slot-avatar red" style="color: {redKitTertiary};">{p.avatar || p.number || '1'}</div>
                        <!-- 2. Nombre del Jugador en Chivo -->
                        <span class="slot-nickname">{p.name || p.nickname}</span>
                        <!-- 3. Insignias: Corona Admin y Cintilla de Capitán -->
                        {#if p.isAdmin || p.isHost || isCaptain}
                          <div class="card-badges-cluster">
                            {#if p.isAdmin || p.isHost}
                              <span class="admin-crown-badge" title={p.isHost ? 'Anfitrión de la sala' : 'Administrador'}>👑</span>
                            {/if}
                            {#if isCaptain}
                              <span
                                class="captain-ribbon"
                                style="background-color: {redPrimaryColor}; color: {redKitTertiary}; font-weight: 800;"
                                title="Capitán del equipo"
                              >
                                C
                              </span>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- 2. ESPECTADORES (SPEC) -->
                <div
                  class="bench-card spec-bench"
                  role="region"
                  aria-label="Banquillo Espectadores"
                  class:is-drag-over={dragOverTeam === 'spectator'}
                  ondragover={(e) => handleDragOver(e, 'spectator')}
                  ondragleave={(e) => handleDragLeave(e, 'spectator')}
                  ondrop={(e) => handleDrop(e, 'spectator')}
                >
                  <div class="bench-card-header spec-header">
                    <span class="team-name">Espectadores</span>
                  </div>

                  <div id="specPlayersList" class="bench-players-list custom-scrollbar">
                    {#each specPlayers as p (p.id)}
                      {@const isDraggable = canDragPlayer(p)}
                      <div
                        class="player-slot-card spec-slot"
                        role="button"
                        tabindex="0"
                        class:cursor-grab={isDraggable}
                        class:cursor-not-allowed={!isDraggable}
                        class:is-dragging={draggedPlayerId === p.id}
                        draggable={isDraggable}
                        ondragstart={(e) => handleDragStart(e, p)}
                        ondragend={handleDragEnd}
                        onclick={(e) => handlePlayerCardClick(e, p)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handlePlayerCardClick(e as unknown as MouseEvent, p);
                          }
                        }}
                      >
                        <div class="slot-avatar spec">{p.avatar || p.number || '👁'}</div>
                        <span class="slot-nickname">{p.name || p.nickname}</span>
                        {#if p.isAdmin || p.isHost}
                          <div class="card-badges-cluster">
                            <span class="admin-crown-badge" title={p.isHost ? 'Anfitrión de la sala' : 'Administrador'}>👑</span>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- 3. EQUIPO AZUL (VISITANTE) -->
                <div
                  class="bench-card blue-bench"
                  role="region"
                  aria-label="Banquillo Equipo Azul"
                  style="--captain-visitor-primary: {bluePrimaryColor}; --captain-visitor-glow: {bluePrimaryColor}40; --bench-team-primary: {bluePrimaryColor}; --captain-visitor-tertiary: {blueKitTertiary};"
                  class:is-drag-over={dragOverTeam === 'blue'}
                  ondragover={(e) => handleDragOver(e, 'blue')}
                  ondragleave={(e) => handleDragLeave(e, 'blue')}
                  ondrop={(e) => handleDrop(e, 'blue')}
                >
                  <div
                    class="bench-card-header blue-header captain-bicolor-header"
                    style="background: linear-gradient(90deg, {bluePrimaryColor} 0%, {bluePrimaryColor} 30%, {blueSecondaryColor} 70%, {blueSecondaryColor} 100%);"
                  >
                    <span
                      class="team-name"
                      style="color: {blueKitTertiary}; text-shadow: {blueHasOutline ? '-1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000' : 'none'};"
                    >{blueTeamName}</span>
                    <div class="kit-variant-toggles" role="group" aria-label="Equipación del equipo azul">
                      <button
                        type="button"
                        class="kit-variant-btn"
                        class:active={gameUI.blueKitVariant === 'home'}
                        disabled={!isBlueCaptainOrAdmin}
                        title={isBlueCaptainOrAdmin ? 'Equipación Local' : 'Solo capitán o admin'}
                        onclick={() => handleSetBlueKitVariant('home')}
                      >
                        Local
                      </button>
                      <button
                        type="button"
                        class="kit-variant-btn"
                        class:active={gameUI.blueKitVariant === 'away'}
                        disabled={!isBlueCaptainOrAdmin}
                        title={isBlueCaptainOrAdmin ? 'Equipación Visitante' : 'Solo capitán o admin'}
                        onclick={() => handleSetBlueKitVariant('away')}
                      >
                        Visitante
                      </button>
                    </div>
                  </div>

                  <div id="bluePlayersList" class="bench-players-list custom-scrollbar">
                    {#each bluePlayers as p (p.id)}
                      {@const isCaptain = p.id === blueCaptain?.id}
                      {@const isDraggable = canDragPlayer(p)}
                      <div
                        class="player-slot-card blue-slot"
                        role="button"
                        tabindex="0"
                        class:cursor-grab={isDraggable}
                        class:cursor-not-allowed={!isDraggable}
                        class:is-dragging={draggedPlayerId === p.id}
                        draggable={isDraggable}
                        ondragstart={(e) => handleDragStart(e, p)}
                        ondragend={handleDragEnd}
                        onclick={(e) => handlePlayerCardClick(e, p)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handlePlayerCardClick(e as unknown as MouseEvent, p);
                          }
                        }}
                      >
                        <div class="slot-avatar blue" style="color: {blueKitTertiary};">{p.avatar || p.number || '2'}</div>
                        <span class="slot-nickname">{p.name || p.nickname}</span>
                        {#if p.isAdmin || p.isHost || isCaptain}
                          <div class="card-badges-cluster">
                            {#if p.isAdmin || p.isHost}
                              <span class="admin-crown-badge" title={p.isHost ? 'Anfitrión de la sala' : 'Administrador'}>👑</span>
                            {/if}
                            {#if isCaptain}
                              <span
                                class="captain-ribbon"
                                style="background-color: {bluePrimaryColor}; color: {blueKitTertiary}; font-weight: 800;"
                                title="Capitán del equipo"
                              >
                                C
                              </span>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>

  <!-- Menú Contextual de Administrador (Clic Directo con Disociación de Drag) -->
  {#if contextMenu.visible && contextMenu.player}
    <div
      class="context-menu-backdrop"
      role="button"
      tabindex="-1"
      aria-label="Cerrar menú contextual"
      onclick={closeContextMenu}
      onkeydown={(e) => { if (e.key === 'Escape') closeContextMenu(); }}
      oncontextmenu={(e) => { e.preventDefault(); closeContextMenu(); }}
    ></div>
    <div
      class="admin-context-menu"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
    >
      <div class="menu-target-header">
        <span class="target-name">{contextMenu.player.name || contextMenu.player.nickname}</span>
      </div>
      {#if !contextMenu.player.isHost}
        <button
          type="button"
          class="context-menu-item"
          onclick={() => {
            soundFX.playUIClick();
            gameUI.togglePlayerAdmin(contextMenu.player!.id);
            closeContextMenu();
          }}
        >
          <span>{contextMenu.player.isAdmin ? '✕ Quitar Admin' : '★ Dar Admin'}</span>
        </button>
        {#if contextMenu.player.id !== gameUI.localPlayerId}
          <button
            type="button"
            class="context-menu-item item-danger"
            onclick={() => {
              soundFX.playUIClick();
              gameUI.kickPlayer(contextMenu.player!.id);
              closeContextMenu();
            }}
          >
            <span>Expulsar (Kick)</span>
          </button>
          <button
            type="button"
            class="context-menu-item item-danger"
            onclick={() => {
              soundFX.playUIClick();
              gameUI.banPlayer(contextMenu.player!.id);
              closeContextMenu();
            }}
          >
            <span>Banear (Ban)</span>
          </button>
        {/if}
      {:else}
        <div class="context-menu-item disabled">
          <span>👑 Anfitrión (Inmutable)</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30;
    padding: 0;
    pointer-events: none;
    user-select: none;
  }

  /* Viewport y Contenedor Centralizado del Corredor */
  .corridor-viewport {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 30;
    overflow: hidden;
  }

  .corridor-container {
    position: fixed;
    top: 50px;
    bottom: calc(var(--chat-height, 160px) + 16px);
    left: 50%;
    transform: translateX(-50%);
    width: min(96vw, 1140px);
    max-height: calc(100vh - var(--chat-height, 160px) - 72px);
    pointer-events: none;
  }

  .corridor-slide {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
  }

  /* Diapositiva Activa MENU */
  .slide-menu.is-active {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
    z-index: 30;
  }
  .slide-stats.slide-out-left {
    transform: translateX(-115%);
    opacity: 0;
    pointer-events: none;
    z-index: 20;
  }

  /* Diapositiva Activa STATS */
  .slide-stats.is-active {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
    z-index: 30;
  }
  .slide-menu.slide-out-right {
    transform: translateX(115%);
    opacity: 0;
    pointer-events: none;
    z-index: 20;
  }

  /* Tarjeta Central Ampliada a min(96vw, 1140px) */
  .team-modal-card {
    width: 100%;
    height: 100%;
    max-height: 100%;
    background: rgba(10, 16, 26, 0.96);
    border: 1px solid rgba(0, 229, 255, 0.45);
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    color: #dde2f1;
    box-shadow: 0 0 35px rgba(0, 229, 255, 0.22), 0 10px 30px rgba(0, 0, 0, 0.8);
    font-family: 'Chivo', system-ui, sans-serif;
    pointer-events: auto;
  }

  /* Pestañas Flotantes Exteriores Sólidas Desacopladas */
  .external-nav-tab {
    border-radius: 8px;
    padding: 14px 14px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.05em;
    transition: all 0.2s ease;
    cursor: pointer;
    pointer-events: auto;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    z-index: 40;
    outline: none;
  }

  .external-nav-tab:active {
    transform: translateY(-50%) scale(0.96);
  }

  .right-tab {
    position: absolute;
    right: -85px;
    top: 50%;
    transform: translateY(-50%);
    background: #00e5ff;
    color: #0a101a;
    border: 2px solid #a5f3fc;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.65), 0 0 40px rgba(0, 229, 255, 0.35);
  }

  .right-tab:hover {
    background: #38bdf8;
    box-shadow: 0 0 25px rgba(0, 229, 255, 0.85), 0 0 50px rgba(0, 229, 255, 0.5);
    transform: translateY(-50%) scale(1.05);
  }

  .left-tab {
    position: absolute;
    left: -85px;
    top: 50%;
    transform: translateY(-50%);
    background: #ffd700;
    color: #0a101a;
    border: 2px solid #fff275;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.65), 0 0 40px rgba(255, 215, 0, 0.35);
  }

  .left-tab:hover {
    background: #ffe033;
    box-shadow: 0 0 25px rgba(255, 215, 0, 0.85), 0 0 50px rgba(255, 215, 0, 0.5);
    transform: translateY(-50%) scale(1.05);
  }

  .nav-chevron {
    font-size: 0.85rem;
    font-weight: 800;
  }

  /* HEADER GENERAL DE SALA */
  .modal-header {
    height: 52px;
    padding: 0 1.25rem;
    background: rgba(8, 14, 24, 0.85);
    border-bottom: 1px solid rgba(0, 229, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .room-identity {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .room-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #ffffff;
    text-transform: uppercase;
    margin: 0;
    max-width: 480px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-divider {
    color: #3b494c;
    font-size: 0.85rem;
  }

  .room-id-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    padding: 0.2rem 0.55rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(0, 229, 255, 0.35);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-copy-link,
  .btn-leave,
  .btn-close-x {
    padding: 0.35rem 0.75rem;
    border-radius: 0.375rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: all 0.15s ease;
    outline: none;
  }

  .header-btn-svg {
    width: 0.85rem;
    height: 0.85rem;
  }

  .btn-copy-link {
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
  }

  .btn-copy-link:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
  }

  .btn-leave {
    background: rgba(255, 51, 102, 0.12);
    border: 1px solid rgba(255, 51, 102, 0.4);
    color: #ff3366;
  }

  .btn-leave:hover {
    background: #ff3366;
    color: #ffffff;
    box-shadow: 0 0 12px rgba(255, 51, 102, 0.4);
  }

  .btn-close-x {
    background: transparent;
    border: 1px solid rgba(132, 147, 150, 0.3);
    color: #bac9cc;
    padding: 0.35rem 0.55rem;
  }

  .btn-close-x:hover {
    background: #242a35;
    color: #ffffff;
    border-color: #ffffff;
  }

  /* BODY LAYOUT (4 Columnas Holgadas) */
  .modal-body-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* COLUMNA 1 (REGLAS Y AJUSTES) */
  .col-settings-panel {
    width: 330px;
    min-width: 320px;
    max-width: 350px;
    height: 100%;
    background: rgba(8, 14, 24, 0.55);
    border-right: 1px solid rgba(0, 229, 255, 0.2);
    display: flex;
    flex-direction: column;
    padding: 0.85rem;
    box-sizing: border-box;
    overflow-x: hidden;
    flex-shrink: 0;
  }

  .col-settings-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    width: 100%;
    box-sizing: border-box;
    padding-right: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  /* 2x2 GRID CON ALTURA FIJA 40px Y 100% HITBOX */
  .rules-4btn-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  .rule-cartouche,
  .rule-cartouche-btn {
    position: relative;
    height: 40px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.6rem;
    background: rgba(16, 24, 38, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.5rem;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .rule-cartouche:hover,
  .rule-cartouche-btn:hover:not(:disabled) {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
  }

  .rule-cartouche-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .rule-cartouche-content {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    pointer-events: none;
    min-width: 0;
  }

  .rule-icon {
    font-size: 13px;
    line-height: 1;
  }

  .rule-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rule-arrow {
    font-size: 10px;
    color: #00e5ff;
    pointer-events: none;
  }

  .rule-select-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 10;
    background: transparent;
    border: none;
    color: transparent;
  }

  .rule-select-overlay option {
    background: #080e18;
    color: #dde2f1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }

  .lock-teams-btn {
    color: #dde2f1;
  }

  .lock-teams-btn.active-locked {
    border-color: rgba(251, 191, 36, 0.6);
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
    box-shadow: 0 0 10px rgba(251, 191, 36, 0.2);
  }

  .lock-label {
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lock-tag {
    font-size: 9px;
    background: #0e1726;
    color: #00e5ff;
    padding: 2px 5px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 800;
  }

  .lock-teams-btn.active-locked .lock-tag {
    background: rgba(251, 191, 36, 0.2);
    color: #fbbf24;
  }

  .btn-modifiers {
    background: rgba(251, 191, 36, 0.1);
    border-color: rgba(251, 191, 36, 0.4);
    color: #fcd34d;
    box-shadow: 0 0 12px rgba(251, 191, 36, 0.15);
    justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
  }

  .btn-modifiers:hover:not(:disabled) {
    background: rgba(251, 191, 36, 0.2);
    border-color: #fbbf24;
    color: #ffffff;
    box-shadow: 0 0 16px rgba(251, 191, 36, 0.3);
  }

  /* ESTADIO (2:1 Proporción) */
  .stadium-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
  }

  .param-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .param-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #849396;
    letter-spacing: 0.05em;
  }

  .stadium-preview-box {
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 1;
    min-height: 110px;
    max-height: 140px;
    border-radius: 0.5rem;
    overflow: hidden;
    background: #07170e;
    border: 1px solid rgba(0, 229, 255, 0.35);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  }

  .stadium-preview-box:hover {
    border-color: #00e5ff;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.45);
  }

  .stadium-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .stadium-overlay {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.4);
    padding: 6px 14px;
    border-radius: 0.5rem;
    pointer-events: none;
    box-shadow: 0 0 14px rgba(0, 0, 0, 0.6);
  }

  .stadium-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.04em;
    text-shadow: 0 0 8px rgba(0, 229, 255, 0.6);
  }

  .stadium-action-text {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.15);
    border: 1px solid rgba(0, 229, 255, 0.35);
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  /* TOGGLE SWITCH SALA PÚBLICA / PRIVADA */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.2rem;
  }

  .toggle-label {
    font-size: 11px;
    font-weight: 600;
    color: #dde2f1;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 18px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: #1a202a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 18px;
    transition: 0.2s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 12px;
    width: 12px;
    left: 2px;
    bottom: 2px;
    background-color: #ffffff;
    border-radius: 50%;
    transition: 0.2s;
  }

  input:checked + .slider {
    background-color: rgba(0, 229, 255, 0.4);
    border-color: #00e5ff;
  }

  input:checked + .slider:before {
    transform: translateX(18px);
    background-color: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
  }

  /* AJUSTES AVANZADOS */
  .advanced-settings-card {
    background: rgba(22, 28, 38, 0.65);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0.5rem;
    padding: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card-micro-title {
    font-size: 0.65rem;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.05em;
  }

  .adv-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .adv-row label {
    font-size: 0.62rem;
    color: #849396;
    text-transform: uppercase;
  }

  .styled-adv-input {
    background: #080e18;
    border: 1px solid rgba(59, 73, 76, 0.6);
    border-radius: 0.25rem;
    padding: 0.3rem 0.5rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    color: #ffffff;
    outline: none;
  }

  .styled-adv-input:focus {
    border-color: #00e5ff;
  }

  .adv-capacity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
  }

  .adv-label {
    color: #849396;
    font-size: 0.65rem;
  }

  .cap-stepper {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #080e18;
    border: 1px solid rgba(59, 73, 76, 0.5);
    border-radius: 0.25rem;
    padding: 0.15rem 0.35rem;
  }

  .cap-step-btn {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.25rem;
    background: #1a202a;
    border: none;
    color: #00e5ff;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .cap-step-btn:hover:not(:disabled) {
    background: #00e5ff;
    color: #050811;
  }

  .cap-num-val {
    min-width: 1.2rem;
    text-align: center;
    font-weight: 700;
    color: #ffffff;
  }

  /* FOOTER FSM */
  .fsm-footer-controls {
    padding-top: 0.65rem;
    border-top: 1px solid rgba(0, 229, 255, 0.25);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .btn-start-match {
    width: 100%;
    padding: 0.65rem;
    background: #2ecc71;
    border: none;
    border-radius: 0.5rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 900;
    color: #050811;
    letter-spacing: 0.08em;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(46, 204, 113, 0.4);
    transition: all 0.15s ease;
  }

  .btn-start-match:hover:not(:disabled) {
    background: #27ae60;
    transform: translateY(-1px);
    box-shadow: 0 0 20px rgba(46, 204, 113, 0.6);
  }

  .btn-start-match:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }

  .fsm-running-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .btn-stop-match {
    padding: 0.6rem;
    background: #ff3366;
    border: none;
    border-radius: 0.5rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: 0.05em;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(255, 51, 102, 0.4);
    transition: all 0.15s ease;
  }

  .btn-stop-match:hover:not(:disabled) {
    background: #e02657;
  }

  .btn-pause-match {
    padding: 0.6rem;
    border: 1.5px solid #38bdf8;
    background: #0284c7;
    color: #ffffff;
    border-radius: 0.5rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: bold;
    letter-spacing: 0.05em;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(14, 165, 233, 0.45);
    transition: all 0.15s ease;
  }

  .btn-pause-match:hover:not(:disabled) {
    background: #0369a1;
    border-color: #7dd3fc;
    box-shadow: 0 0 20px rgba(14, 165, 233, 0.65);
    color: #ffffff;
  }

  .btn-pause-match.is-resuming {
    background: #0284c7;
    border-color: #38bdf8;
    box-shadow: 0 0 16px rgba(14, 165, 233, 0.45);
    color: #ffffff;
  }

  /* COLUMNAS 2, 3, 4: BANQUILLOS HOLGADOS */
  .col-benches-grid {
    flex: 1;
    height: 100%;
    padding: 0.85rem;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    min-height: 0;
    background: rgba(10, 16, 26, 0.7);
  }

  .bench-card {
    height: 100%;
    background: rgba(8, 14, 24, 0.9);
    border-radius: 0.75rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }

  .red-bench {
    border: 1px solid var(--captain-local-primary, #e74c3c);
    box-shadow: 0 0 16px var(--captain-local-glow, rgba(231, 76, 60, 0.25));
  }

  .spec-bench {
    border: 1px solid rgba(132, 147, 150, 0.4);
    box-shadow: 0 0 14px rgba(0, 0, 0, 0.3);
  }

  .blue-bench {
    border: 1px solid var(--captain-visitor-primary, #3498db);
    box-shadow: 0 0 16px var(--captain-visitor-glow, rgba(52, 152, 219, 0.25));
  }

  .bench-card.is-drag-over {
    border-color: #00e5ff !important;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.4) !important;
    background: rgba(0, 229, 255, 0.08) !important;
  }

  /* Bench Headers */
  .bench-card-header {
    height: 40px;
    padding: 0 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .captain-bicolor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0.6rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.8);
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  }

  .kit-variant-toggles {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 1px;
    flex-shrink: 0;
  }

  .kit-variant-btn {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 5px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .kit-variant-btn:hover:not(:disabled) {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.2);
  }

  .kit-variant-btn.active {
    background: #ffffff;
    color: #000000;
    font-weight: 800;
  }

  .kit-variant-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .spec-header {
    background: rgba(30, 38, 50, 0.85);
    border-bottom: 1px solid rgba(132, 147, 150, 0.4);
  }

  .team-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  /* Lista de Jugadores */
  .bench-players-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-height: 0;
  }

  /* TARJETA DE JUGADOR (3 ELEMENTOS: AVATAR, NOMBRE, CINTILLA C) */
  .player-slot-card {
    background: rgba(19, 27, 40, 0.85);
    border-radius: 0.5rem;
    padding: 0.45rem 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    transition: all 0.15s ease;
    user-select: none;
    border: 1px solid transparent;
  }

  .player-slot-card.cursor-grab {
    cursor: grab;
  }

  .player-slot-card.cursor-grab:active {
    cursor: grabbing;
  }

  .player-slot-card.cursor-not-allowed {
    cursor: not-allowed;
  }

  .player-slot-card.is-dragging {
    opacity: 0.4;
    transform: scale(0.98);
  }

  .player-slot-card.red-slot {
    border-left: 3.5px solid var(--bench-team-primary, #e74c3c);
  }

  .player-slot-card.spec-slot {
    border-left: 3px solid #849396;
  }

  .player-slot-card.blue-slot {
    border-left: 3.5px solid var(--bench-team-primary, #00e5ff);
  }

  .player-slot-card:hover {
    background: rgba(30, 42, 60, 0.9);
    border-color: rgba(0, 229, 255, 0.3);
  }

  /* 1. Avatar Circular de 32px */
  .slot-avatar {
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .slot-avatar.red {
    background: var(--bench-team-primary, #e74c3c);
    color: var(--captain-local-tertiary, #ffffff);
    box-shadow: 0 0 8px var(--bench-team-primary, rgba(231, 76, 60, 0.5));
  }

  .slot-avatar.spec {
    background: #2f3540;
    color: #dde2f1;
  }

  .slot-avatar.blue {
    background: var(--bench-team-primary, #00e5ff);
    color: var(--captain-visitor-tertiary, #ffffff);
    box-shadow: 0 0 8px var(--bench-team-primary, rgba(0, 229, 255, 0.5));
  }

  /* 2. Nombre del Jugador en Chivo */
  .slot-nickname {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 500;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  /* 3. Insignias: Corona Admin y Cintilla de Capitán */
  .card-badges-cluster {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-left: auto;
    flex-shrink: 0;
  }

  .admin-crown-badge {
    font-size: 0.85rem;
    line-height: 1;
    filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.6));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    user-select: none;
  }

  .captain-ribbon {
    padding: 0.15rem 0.5rem;
    border-radius: 0.25rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
    flex-shrink: 0;
    line-height: 1;
  }

  /* ======================================================== */
  /* MENÚ CONTEXTUAL DE ADMINISTRADOR (CLIC DIRECTO)          */
  /* ======================================================== */
  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: transparent;
    pointer-events: auto;
  }

  .admin-context-menu {
    position: fixed;
    z-index: 9999;
    background: rgba(10, 16, 26, 0.98);
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8), 0 0 16px rgba(0, 229, 255, 0.25);
    min-width: 170px;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-family: 'Chivo', system-ui, sans-serif;
    pointer-events: auto;
  }

  .menu-target-header {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.65rem;
    border-radius: 0.35rem;
    background: transparent;
    border: none;
    color: #dde2f1;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease;
  }

  .context-menu-item:hover:not(.disabled) {
    background: rgba(0, 229, 255, 0.15);
    color: #00e5ff;
  }

  .context-menu-item.item-danger {
    color: #ff4757;
  }

  .context-menu-item.item-danger:hover {
    background: rgba(255, 71, 87, 0.18);
    color: #ff6b81;
  }

  .context-menu-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ======================================================== */
  /* VISTA DE ESTADÍSTICAS POST-PARTIDO                       */
  /* ======================================================== */
  .stats-header-row {
    padding: 0.85rem 1.25rem;
    background: rgba(8, 14, 24, 0.85);
    border-bottom: 1px solid rgba(0, 229, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  /* Banner Homologado de Marcador de Estadísticas */
  .stats-scoreboard-banner {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    background: rgba(10, 16, 26, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.5rem;
    padding: 0.25rem 0.65rem;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.15);
  }

  .stats-acronym-badge {
    min-width: 68px;
    height: 36px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    user-select: none;
    line-height: 1;
    paint-order: stroke fill;
    -webkit-text-stroke: 3px #000000;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
    box-sizing: border-box;
  }

  .btn-auto-balance {
    background: rgba(0, 229, 255, 0.1);
    border-color: rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.15);
  }

  .btn-auto-balance:hover:not(:disabled) {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
  }

  .stats-score-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.35rem;
    font-weight: 800;
    color: #ffffff;
    min-width: 1.2rem;
    text-align: center;
    line-height: 1;
  }

  .stats-score-sep {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1rem;
    font-weight: 700;
    color: #849396;
    line-height: 1;
  }

  .match-status-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge-victory {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
  }

  .badge-victory.red {
    background: rgba(255, 71, 87, 0.15);
    border: 1px solid rgba(255, 71, 87, 0.5);
    color: #ff4757;
  }

  .badge-victory.blue {
    background: rgba(0, 229, 255, 0.15);
    border: 1px solid rgba(0, 229, 255, 0.5);
    color: #00e5ff;
  }

  .badge-victory.draw {
    background: rgba(255, 219, 60, 0.15);
    border: 1px solid rgba(255, 219, 60, 0.5);
    color: #ffe16d;
  }

  .match-time-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: #ffe16d;
    background: #080e18;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 219, 60, 0.3);
  }

  .mvp-golden-plaque {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(255, 219, 60, 0.12);
    border: 1px solid #ffe16d;
    padding: 0.3rem 0.75rem;
    border-radius: 0.375rem;
    box-shadow: 0 0 16px rgba(255, 215, 0, 0.4);
  }

  .crown-icon {
    font-size: 1.1rem;
  }

  .mvp-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 800;
    color: #ffe16d;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .mvp-points-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
    color: #ffe16d;
    background: rgba(255, 219, 60, 0.2);
    padding: 0.1rem 0.35rem;
    border-radius: 0.2rem;
  }

  /* Tablas Duales */
  .tables-parallel-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
    padding: 0.75rem 1.25rem 1.25rem 1.25rem;
    box-sizing: border-box;
  }

  .team-table-box {
    background: rgba(8, 14, 24, 0.85);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .team-table-box.red-box {
    border: 1px solid var(--captain-local-primary, #e74c3c);
    box-shadow: 0 0 16px var(--captain-local-glow, rgba(231, 76, 60, 0.25));
  }

  .team-table-box.blue-box {
    border: 1px solid var(--captain-visitor-primary, #3498db);
    box-shadow: 0 0 16px var(--captain-visitor-glow, rgba(52, 152, 219, 0.25));
  }

  .table-header {
    display: flex;
    align-items: center;
    padding: 0.45rem 0.65rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .col-team-name-hdr {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .col-headers-right {
    display: flex;
    align-items: center;
  }

  .red-header .col-headers-right {
    color: var(--captain-local-tertiary, #ffffff);
  }

  .blue-header .col-headers-right {
    color: var(--captain-visitor-tertiary, #ffffff);
  }

  .col-player { flex: 1; text-align: left; }
  .col-pts { width: 44px; text-align: right; }
  .col-stat { width: 30px; text-align: center; }
  .col-arrow { width: 22px; text-align: center; }

  .table-scroll-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .player-stat-row {
    background: rgba(22, 28, 38, 0.7);
    border-radius: 0.375rem;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    overflow: hidden;
  }

  .player-stat-row:hover {
    border-color: rgba(0, 229, 255, 0.3);
    background: rgba(30, 38, 50, 0.8);
  }

  .player-stat-row.is-mvp {
    border-color: rgba(255, 219, 60, 0.5);
    background: rgba(255, 219, 60, 0.08);
    box-shadow: 0 0 10px rgba(255, 219, 60, 0.15);
  }

  .row-summary {
    display: flex;
    align-items: center;
    padding: 0.45rem 0.65rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .col-player.bold {
    font-weight: 700;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .col-player.gold-player {
    color: #ffe16d;
    font-weight: 800;
  }

  .badge-cap {
    font-weight: 900;
    font-size: 0.7rem;
  }

  .badge-cap.red { color: #ff4757; }
  .badge-cap.blue { color: #00e5ff; }

  .crown-sm { font-size: 0.85rem; }
  .host-tag { font-size: 0.65rem; color: #849396; font-weight: normal; }

  .col-pts.red-txt { color: #ff4757; font-weight: 800; }
  .col-pts.blue-txt { color: #00e5ff; font-weight: 800; }
  .col-pts.gold-txt { color: #ffe16d; font-weight: 900; }

  .gold-stat { color: #ffe16d; font-weight: 800; }

  .chevron-icon {
    font-size: 0.65rem;
    color: #849396;
  }

  .accordion-drawer {
    padding: 0.45rem 0.65rem;
    background: rgba(8, 14, 24, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .drawer-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.35rem;
    text-align: center;
  }

  .drawer-chip {
    background: #161c26;
    padding: 0.25rem 0.2rem;
    border-radius: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .chip-label {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.65rem;
    color: #849396;
  }

  .chip-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    font-weight: 800;
  }

  .text-cyan { color: #00e5ff; }
  .text-green { color: #2ecc71; }
  .text-gold { color: #ffe16d; }
  .text-error { color: #ff4757; }
  .text-muted { color: #849396; }

  /* SCROLLBARS */
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(8, 14, 24, 0.6);
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.3);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #00e5ff;
  }

  .custom-scrollbar-red::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar-red::-webkit-scrollbar-track {
    background: rgba(8, 14, 24, 0.6);
  }
  .custom-scrollbar-red::-webkit-scrollbar-thumb {
    background: rgba(255, 51, 102, 0.3);
    border-radius: 4px;
  }
  .custom-scrollbar-red::-webkit-scrollbar-thumb:hover {
    background: #ff3366;
  }
</style>
