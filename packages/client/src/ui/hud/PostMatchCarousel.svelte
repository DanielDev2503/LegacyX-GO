<script lang="ts">
  import { gameUI, type TeamSlot } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let currentSlide = $state<0 | 1>(0);
  let expandedPlayerId = $state<string | null>(null);

  let redPlayers = $derived(gameUI.players.filter((p) => p.team === 'red'));
  let specPlayers = $derived(gameUI.players.filter((p) => p.team === 'spectator'));
  let bluePlayers = $derived(gameUI.players.filter((p) => p.team === 'blue'));

  let isMatchStopped = $derived(gameUI.fsmPhase === 'STOPPED' || gameUI.matchPhase === 0);

  function toggleAccordion(id: string) {
    soundFX.playUIClick();
    expandedPlayerId = expandedPlayerId === id ? null : id;
  }

  function goToSlide(slide: 0 | 1) {
    soundFX.playUIClick();
    currentSlide = slide;
    gameUI.postMatchSlide = slide as any;
  }

  function handleReturnToRoom() {
    soundFX.playUIClick();
    gameUI.fsmPhase = 'STOPPED';
    gameUI.matchPhase = 0;
    goToSlide(1);
  }

  function handleStartMatch() {
    soundFX.playUIClick();
    gameUI.startMatch();
    gameUI.showPostMatchCarousel = false;
    gameUI.closeOverlay();
  }

  function handleStopMatch() {
    soundFX.playUIClick();
    gameUI.stopMatch();
  }

  function handlePauseToggle() {
    soundFX.playUIClick();
    gameUI.togglePause();
  }

  function handleLeaveRoom() {
    soundFX.playUIClick();
    gameUI.leaveRoom();
  }

  function joinTeam(team: TeamSlot) {
    soundFX.playUIClick();
    gameUI.changeTeam(gameUI.localPlayerId, team);
  }

  function movePlayer(playerId: number, team: TeamSlot) {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    gameUI.changeTeam(playerId, team);
  }

  function copyRoomLink() {
    soundFX.playUIClick();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
  }

  function openSettings() {
    soundFX.playUIClick();
    gameUI.openOverlay('SETTINGS');
  }

  function openModifiers() {
    soundFX.playUIClick();
    gameUI.openOverlay('PHYSICS_MODIFIERS');
  }

  function openStadiumSelect() {
    soundFX.playUIClick();
    gameUI.openOverlay('STADIUM_SELECT');
  }
</script>

<div class="carousel-root">
  <!-- Viewport Panorámico (100vw, Full-Viewport) -->
  <div class="carousel-viewport">
    <div
      class="carousel-track"
      id="carousel-track"
      style="transform: translateX(-{currentSlide * 100}vw);"
    >
      <!-- ======================================================== -->
      <!-- DIAPOSITIVA 0: ESTADÍSTICAS Y MVP (ANCHO COMPLETO: 100VW) -->
      <!-- ======================================================== -->
      <div class="carousel-slide-item" id="slide-stats">
        <!-- BOTÓN FLOTANTE EXTERIOR [ Menú > ] (A la derecha fuera de la tarjeta) -->
        <button
          type="button"
          id="btn-goto-menu"
          class="floating-nav-btn right-btn"
          aria-label="Ir a Menú de Sala"
          onclick={() => goToSlide(1)}
        >
          <span>Menú</span>
          <span class="nav-chevron">▶</span>
        </button>

        <!-- Tarjeta Central de Stats (Regla canónica ** Invariant) -->
        <div class="stats-card team-modal-card">
          <!-- Cabecera de Stats & Marcador Final -->
          <div class="stats-header-row">
            <!-- Marcador Simétrico -->
            <div class="match-score-block">
              <span class="team-brand red">RED</span>
              <div class="score-capsule">
                <span class="score-digit red" id="post-score-red">{gameUI.redScore}</span>
                <span class="score-dash">-</span>
                <span class="score-digit blue" id="post-score-blue">{gameUI.blueScore}</span>
              </div>
              <span class="team-brand blue">BLUE</span>
            </div>

            <!-- Badge de Victoria y Reloj -->
            <div class="match-status-meta">
              {#if gameUI.redScore > gameUI.blueScore}
                <span class="badge-victory red">VICTORIA RED</span>
              {:else if gameUI.blueScore > gameUI.redScore}
                <span class="badge-victory blue">VICTORIA BLUE</span>
              {:else}
                <span class="badge-victory draw">EMPATE</span>
              {/if}
              <span class="match-time-chip">⏱ {gameUI.matchTimeFormatted}</span>
            </div>

            <!-- Placa Dorada Destacada MVP con Glow Neón (#ffd700) -->
            <div class="mvp-golden-plaque">
              <span class="crown-icon">👑</span>
              <span class="mvp-title">MVP: {gameUI.mvp.nickname}</span>
              <span class="mvp-points-chip">({gameUI.mvp.points} pts)</span>
            </div>

            <!-- Botón CTA Volver a la Sala -->
            <button
              type="button"
              id="stats-to-menu-btn"
              class="btn-return-room"
              onclick={handleReturnToRoom}
            >
              Volver a la Sala
            </button>
          </div>

          <!-- Barra de Posesión en Vivo (4px) -->
          <div class="possession-bar-section">
            <div class="possession-legend-row">
              <span class="pos-txt red">{gameUI.redPossession}% RED</span>
              <span class="pos-title">POSESIÓN EN VIVO</span>
              <span class="pos-txt blue">{gameUI.bluePossession}% BLUE</span>
            </div>
            <div
              class="possession-track"
              title="Posesión: {gameUI.redPossession}% RED - {gameUI.bluePossession}% BLUE"
            >
              <div class="pos-segment red" style="width: {gameUI.redPossession}%;"></div>
              <div class="pos-segment blue" style="width: {gameUI.bluePossession}%;"></div>
            </div>
          </div>

          <!-- Tablas Duales Paralelas RED y BLUE -->
          <div class="tables-parallel-grid">
            <!-- TABLA RED -->
            <div class="team-table-box red-box">
              <div class="table-header red-header">
                <span class="col-player">Jugador</span>
                <span class="col-pts">Pts</span>
                <span class="col-stat">G</span>
                <span class="col-stat">A</span>
                <span class="col-stat">P</span>
                <span class="col-stat">S</span>
                <span class="col-arrow"></span>
              </div>
              <div class="table-scroll-body custom-scrollbar">
                {#each gameUI.redTeamStats as player}
                  {@const isExpanded = expandedPlayerId === player.nickname}
                  <div class="player-stat-row" class:row-expanded={isExpanded}>
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_interactive_supports_focus -->
                    <div
                      class="row-summary accordion-trigger"
                      role="button"
                      tabindex="0"
                      onclick={() => toggleAccordion(player.nickname)}
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

                    <!-- Desglose de Puntos Acumulativos (Acordeón Interactivo) -->
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
            <div class="team-table-box blue-box">
              <div class="table-header blue-header">
                <span class="col-player">Jugador</span>
                <span class="col-pts">Pts</span>
                <span class="col-stat">G</span>
                <span class="col-stat">A</span>
                <span class="col-stat">P</span>
                <span class="col-stat">S</span>
                <span class="col-arrow"></span>
              </div>
              <div class="table-scroll-body custom-scrollbar">
                {#each gameUI.blueTeamStats as player}
                  {@const isExpanded = expandedPlayerId === player.nickname}
                  <div
                    class="player-stat-row"
                    class:is-mvp={player.isMvp}
                    class:row-expanded={isExpanded}
                  >
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_interactive_supports_focus -->
                    <div
                      class="row-summary accordion-trigger"
                      role="button"
                      tabindex="0"
                      onclick={() => toggleAccordion(player.nickname)}
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

                    <!-- Desglose de Puntos Acumulativos (Acordeón Interactivo) -->
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
      <!-- DIAPOSITIVA 1: MENÚ DE SALA / ROOM LOBBY (100VW)         -->
      <!-- ======================================================== -->
      <div class="carousel-slide-item" id="slide-lobby">
        <!-- BOTÓN FLOTANTE EXTERIOR [ < STATS ] (A la izquierda fuera de la tarjeta) -->
        <button
          type="button"
          id="btn-goto-stats"
          class="floating-nav-btn left-btn"
          aria-label="Volver a Stats"
          onclick={() => goToSlide(0)}
        >
          <span class="nav-chevron">◀</span>
          <span>STATS</span>
        </button>

        <!-- Tarjeta Central del Menú de Sala (Regla canónica ** Invariant) -->
        <div class="lobby-card team-modal-card">
          <!-- Cabecera de Sala -->
          <div class="lobby-header-row">
            <div class="room-title-identity">
              <span class="pulse-live-dot"></span>
              <h2 class="room-title-text">
                [ {gameUI.activeRoomName || 'Torneo Nocturno'} - ID: <span class="text-cyan">{gameUI.matchId || 'CTNYRS'}</span> ]
              </h2>
            </div>
            <div class="header-action-group">
              <button
                type="button"
                class="btn-hdr-action"
                title="Copiar enlace de sala"
                onclick={copyRoomLink}
              >
                <span>🔗 Copiar Link</span>
              </button>
              <button
                type="button"
                class="btn-hdr-action"
                title="Ajustes Generales"
                onclick={openSettings}
              >
                <span>⚙ Ajustes</span>
              </button>
              <button
                type="button"
                class="btn-hdr-danger"
                title="Salir de la sala"
                onclick={handleLeaveRoom}
              >
                <span>✕ Salir</span>
              </button>
            </div>
          </div>

          <!-- Cuerpo Asimétrico en 2 Columnas -->
          <div class="lobby-body-cols">
            <!-- Zona Izquierda: Reglas y Operación FSM (42%) -->
            <div class="rules-fsm-col">
              <div class="rules-scroll-section custom-scrollbar">
                <!-- Cuadrícula 2x2 de Reglas -->
                <div class="rules-grid-2x2">
                  <div class="rule-select-field">
                    <label for="slide-dur-select" class="rule-lbl">DURACIÓN</label>
                    <select
                      id="slide-dur-select"
                      class="cyber-select"
                      value={gameUI.physicsModifiers.matchTimeMinutes}
                      disabled={!gameUI.isHost}
                      onchange={(e) => {
                        const val = Number((e.currentTarget as HTMLSelectElement).value);
                        gameUI.physicsModifiers.matchTimeMinutes = val;
                      }}
                    >
                      <option value={1}>⏱ 1 min</option>
                      <option value={2}>⏱ 2 min</option>
                      <option value={3}>⏱ 3 min</option>
                      <option value={5}>⏱ 5 min</option>
                      <option value={7}>⏱ 7 min</option>
                      <option value={10}>⏱ 10 min</option>
                      <option value={15}>⏱ 15 min</option>
                    </select>
                  </div>

                  <div class="rule-select-field">
                    <label for="slide-goal-select" class="rule-lbl">LÍMITE GOL</label>
                    <select
                      id="slide-goal-select"
                      class="cyber-select"
                      value={gameUI.physicsModifiers.goalLimit}
                      disabled={!gameUI.isHost}
                      onchange={(e) => {
                        const val = Number((e.currentTarget as HTMLSelectElement).value);
                        gameUI.physicsModifiers.goalLimit = val;
                      }}
                    >
                      <option value={1}>⚽ 1 gol</option>
                      <option value={2}>⚽ 2 goles</option>
                      <option value={3}>⚽ 3 goles</option>
                      <option value={5}>⚽ 5 goles</option>
                      <option value={7}>⚽ 7 goles</option>
                      <option value={10}>⚽ 10 goles</option>
                      <option value={0}>⚽ Gol de Oro</option>
                    </select>
                  </div>

                  <!-- Toggle Equipos Libres -->
                  <div class="teams-lock-toggle-box">
                    <span class="toggle-text">Equipos Libres 🔓</span>
                    <button
                      type="button"
                      class="mini-switch"
                      class:is-active={!gameUI.teamsLocked}
                      disabled={!gameUI.isHost}
                      onclick={() => gameUI.toggleTeamsLock()}
                      aria-label="Bloquear o desbloquear equipos"
                    >
                      <span class="switch-thumb"></span>
                    </button>
                  </div>

                  <!-- Botón Modificadores Físicos -->
                  <button
                    type="button"
                    class="btn-open-modifiers"
                    onclick={openModifiers}
                  >
                    <span>Modifiers (19) ⚡</span>
                  </button>
                </div>

                <!-- Selector de Estadio -->
                <button
                  type="button"
                  class="stadium-selector-banner"
                  onclick={openStadiumSelect}
                >
                  <div class="stadium-meta">
                    <span class="stadium-lbl">ESTADIO SELECCIONADO</span>
                    <span class="stadium-name">🏟 {gameUI.activeStadiumName || 'AF 3v3 Official'}</span>
                  </div>
                  <span class="stadium-chevron">▾</span>
                </button>

                <!-- Ajustes Rápidos de Sala -->
                <div class="room-quick-params-card">
                  <span class="params-title">Ajustes de Sala</span>
                  <div class="param-row">
                    <span class="param-lbl">Capacidad:</span>
                    <div class="capacity-stepper">
                      <button
                        type="button"
                        class="step-btn"
                        disabled={!gameUI.isHost || (gameUI.activeRoom?.maxPlayers ?? 12) <= 2}
                        onclick={() => {
                          if (gameUI.activeRoom) gameUI.activeRoom.maxPlayers = Math.max(2, gameUI.activeRoom.maxPlayers - 2);
                        }}
                      >[-]</button>
                      <span class="cap-val">{gameUI.activeRoom?.maxPlayers ?? 12}</span>
                      <button
                        type="button"
                        class="step-btn"
                        disabled={!gameUI.isHost || (gameUI.activeRoom?.maxPlayers ?? 12) >= 20}
                        onclick={() => {
                          if (gameUI.activeRoom) gameUI.activeRoom.maxPlayers = Math.min(20, gameUI.activeRoom.maxPlayers + 2);
                        }}
                      >[+]</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Subpanel inferior anclado FSM (Iniciar, Detener, Pausar) -->
              <div class="fsm-actions-sticky">
                <button
                  type="button"
                  id="btn-fsm-start"
                  class="btn-start-match-cta"
                  disabled={!gameUI.isHost}
                  onclick={handleStartMatch}
                >
                  <span class="play-icon">▶</span>
                  <span>INICIAR PARTIDO</span>
                </button>
                <div class="fsm-secondary-grid">
                  <button
                    type="button"
                    class="btn-fsm-stop"
                    disabled={!gameUI.isHost}
                    onclick={handleStopMatch}
                  >
                    ■ DETENER
                  </button>
                  <button
                    type="button"
                    class="btn-fsm-pause"
                    disabled={!gameUI.isHost}
                    onclick={handlePauseToggle}
                  >
                    ⏸ PAUSAR
                  </button>
                </div>
              </div>
            </div>

            <!-- Zona Derecha: Banquillos de Jugadores (3 Columnas Paralelas: 58%) -->
            <div class="roster-benches-grid">
              <!-- Columna RED -->
              <div class="bench-col red-bench">
                <div class="bench-hdr red">
                  <button
                    type="button"
                    class="join-team-hdr"
                    disabled={gameUI.teamsLocked && !gameUI.isHost}
                    onclick={() => joinTeam('red')}
                  >
                    Red ▶
                  </button>
                  <span class="count-chip red">{redPlayers.length}/3</span>
                </div>
                <div class="bench-player-list custom-scrollbar">
                  {#each redPlayers as p (p.id)}
                    <div class="bench-item red-border">
                      <div class="bench-avatar red">{p.avatar || p.number}</div>
                      <div class="bench-meta">
                        <span class="b-name">{p.name || p.nickname}</span>
                        {#if p.isAdmin}<span class="b-role red">Capitán ©</span>{:else}<span class="b-role muted">Player</span>{/if}
                      </div>
                    </div>
                  {:else}
                    <div class="empty-bench-note">Sin jugadores</div>
                  {/each}
                </div>
              </div>

              <!-- Columna SPECTATORS -->
              <div class="bench-col spec-bench">
                <div class="bench-hdr spec">
                  <button
                    type="button"
                    class="join-team-hdr spec-hdr"
                    onclick={() => joinTeam('spectator')}
                  >
                    Spec
                  </button>
                  <span class="count-chip spec">{specPlayers.length}</span>
                </div>
                <div class="bench-player-list custom-scrollbar">
                  {#each specPlayers as p (p.id)}
                    <div class="bench-item spec-border">
                      <div class="bench-avatar spec">{p.avatar || p.number}</div>
                      <div class="bench-meta">
                        <span class="b-name">{p.name || p.nickname}</span>
                        <span class="b-role muted">Viewer</span>
                      </div>
                    </div>
                  {:else}
                    <div class="empty-bench-note">Sin espectadores</div>
                  {/each}
                </div>
              </div>

              <!-- Columna BLUE -->
              <div class="bench-col blue-bench">
                <div class="bench-hdr blue">
                  <button
                    type="button"
                    class="join-team-hdr blue-hdr"
                    disabled={gameUI.teamsLocked && !gameUI.isHost}
                    onclick={() => joinTeam('blue')}
                  >
                    ◀ Blue
                  </button>
                  <span class="count-chip blue">{bluePlayers.length}/3</span>
                </div>
                <div class="bench-player-list custom-scrollbar">
                  {#each bluePlayers as p (p.id)}
                    <div class="bench-item blue-border" class:is-host-gold={p.isHost}>
                      <div class="bench-avatar" class:gold={p.isHost} class:blue={!p.isHost}>
                        {p.isHost ? '👑' : (p.avatar || p.number)}
                      </div>
                      <div class="bench-meta">
                        <span class="b-name" class:gold-text={p.isHost}>{p.name || p.nickname}</span>
                        {#if p.isHost}
                          <span class="b-role gold">Host</span>
                        {:else if p.isAdmin}
                          <span class="b-role blue">Capitán ©</span>
                        {:else}
                          <span class="b-role muted">Player</span>
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <div class="empty-bench-note">Sin jugadores</div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .carousel-root {
    position: fixed;
    inset: 0;
    z-index: 110;
    width: 100vw;
    height: 100vh;
    background: rgba(5, 8, 17, 0.88);
    pointer-events: auto;
    user-select: none;
    overflow: hidden;
  }

  /* Viewport Panorámico */
  .carousel-viewport {
    position: fixed;
    top: 52px;
    bottom: 20px;
    left: 0;
    width: 100vw;
    overflow: hidden;
    z-index: 20;
  }

  .carousel-track {
    display: flex;
    width: 200vw;
    height: 100%;
    transition: transform 0.45s cubic-bezier(0.25, 1, 0.5, 1);
    will-change: transform;
  }

  .carousel-slide-item {
    width: 100vw;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    padding: 1rem;
  }

  /* Botones Flotantes Exteriores */
  .floating-nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 30;
    height: 50px;
    padding: 0 1.25rem;
    background: rgba(10, 16, 26, 0.94);
    border: 1px solid #00e5ff;
    color: #00e5ff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.35);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    outline: none;
  }

  .floating-nav-btn:hover {
    background: #00e5ff;
    color: #00363d;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.6);
    transform: translateY(-50%) scale(1.04);
  }

  .floating-nav-btn:active {
    transform: translateY(-50%) scale(0.96);
  }

  .right-btn {
    right: 1.5rem;
  }

  .left-btn {
    left: 1.5rem;
  }

  .nav-chevron {
    font-size: 0.85rem;
  }

  /* Tarjeta Central Invariant (Regla canónica **) */
  .team-modal-card {
    width: min(94vw, 880px);
    max-height: calc(100vh - 120px);
    background: rgba(10, 16, 26, 0.96);
    border: 1px solid #00e5ff;
    border-radius: 10px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.35), inset 0 0 12px rgba(0, 229, 255, 0.15);
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    box-sizing: border-box;
    overflow: hidden;
    color: #dde2f1;
  }

  .lobby-card.team-modal-card {
    width: min(94vw, 920px);
  }

  /* CABECERA DE STATS (SLIDE 0) */
  .stats-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.25);
    padding-bottom: 0.75rem;
    flex-shrink: 0;
    gap: 0.75rem;
  }

  .match-score-block {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .team-brand {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.35rem;
    font-weight: 900;
    letter-spacing: 0.05em;
  }

  .team-brand.red { color: #ff4757; }
  .team-brand.blue { color: #00e5ff; }

  .score-capsule {
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.3);
    padding: 0.25rem 0.85rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.18);
  }

  .score-digit {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.5rem;
    font-weight: 900;
  }

  .score-digit.red { color: #ff4757; }
  .score-digit.blue { color: #00e5ff; }

  .score-dash {
    color: #849396;
    font-size: 1.15rem;
    font-weight: 700;
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

  /* Placa MVP */
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

  .btn-return-room {
    padding: 0.4rem 0.85rem;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid #00e5ff;
    color: #00e5ff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-return-room:hover {
    background: #00e5ff;
    color: #00363d;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.5);
  }

  /* Posesión */
  .possession-bar-section {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .possession-legend-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .pos-txt.red { color: #ff4757; }
  .pos-txt.blue { color: #00e5ff; }

  .pos-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: #849396;
  }

  .possession-track {
    width: 100%;
    height: 4px;
    background: #080e18;
    border-radius: 9999px;
    overflow: hidden;
    display: flex;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }

  .pos-segment.red {
    background: #ff4757;
    height: 100%;
    transition: width 0.3s ease;
  }

  .pos-segment.blue {
    background: #00e5ff;
    height: 100%;
    transition: width 0.3s ease;
  }

  /* Tablas Duales */
  .tables-parallel-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
  }

  .team-table-box {
    background: rgba(8, 14, 24, 0.85);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .team-table-box.red-box {
    border: 1px solid rgba(255, 71, 87, 0.35);
  }

  .team-table-box.blue-box {
    border: 1px solid rgba(0, 229, 255, 0.35);
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

  .table-header.red-header {
    background: rgba(255, 71, 87, 0.2);
    border-bottom: 1px solid rgba(255, 71, 87, 0.4);
    color: #ff4757;
  }

  .table-header.blue-header {
    background: rgba(0, 229, 255, 0.2);
    border-bottom: 1px solid rgba(0, 229, 255, 0.4);
    color: #00e5ff;
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
    max-height: 280px;
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

  /* Acordeón Interactivo de Desglose */
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

  /* CABECERA DE SALA (SLIDE 1) */
  .lobby-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.25);
    padding-bottom: 0.75rem;
    flex-shrink: 0;
  }

  .room-title-identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pulse-live-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
  }

  .room-title-text {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
  }

  .header-action-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-hdr-action {
    padding: 0.3rem 0.65rem;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    border-radius: 0.25rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-hdr-action:hover {
    background: rgba(0, 229, 255, 0.18);
    border-color: #00e5ff;
  }

  .btn-hdr-danger {
    padding: 0.3rem 0.65rem;
    background: rgba(255, 71, 87, 0.15);
    border: 1px solid rgba(255, 71, 87, 0.4);
    color: #ff4757;
    border-radius: 0.25rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-hdr-danger:hover {
    background: #ff4757;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(255, 71, 87, 0.4);
  }

  /* CUERPO ASIMÉTRICO DE SALA (SLIDE 1) */
  .lobby-body-cols {
    display: flex;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }

  .rules-fsm-col {
    width: 42%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }

  .rules-scroll-section {
    overflow-y: auto;
    max-height: 270px;
    padding-right: 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .rules-grid-2x2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .rule-select-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .rule-lbl {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.65rem;
    color: #849396;
    letter-spacing: 0.05em;
  }

  .cyber-select {
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    padding: 0.3rem 0.5rem;
    border-radius: 0.25rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    outline: none;
  }

  .teams-lock-toggle-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(22, 28, 38, 0.7);
    padding: 0.4rem 0.6rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .toggle-text {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .mini-switch {
    width: 2rem;
    height: 1.1rem;
    background: #242a35;
    border-radius: 9999px;
    border: none;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  }

  .mini-switch.is-active {
    background: #00e5ff;
  }

  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 0.85rem;
    height: 0.85rem;
    background: #ffffff;
    border-radius: 9999px;
    transition: transform 0.2s;
  }

  .mini-switch.is-active .switch-thumb {
    transform: translateX(0.9rem);
  }

  .btn-open-modifiers {
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.35);
    color: #00e5ff;
    border-radius: 0.25rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-open-modifiers:hover {
    background: #00e5ff;
    color: #00363d;
  }

  .stadium-selector-banner {
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.25rem;
    padding: 0.45rem 0.75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .stadium-selector-banner:hover {
    border-color: #00e5ff;
  }

  .stadium-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .stadium-lbl {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.6rem;
    color: #849396;
  }

  .stadium-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: #ffffff;
    font-weight: 700;
  }

  .stadium-chevron {
    color: #00e5ff;
    font-size: 0.8rem;
  }

  .room-quick-params-card {
    background: rgba(22, 28, 38, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.25rem;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .params-title {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.7rem;
    color: #00e5ff;
    font-weight: 700;
    text-transform: uppercase;
  }

  .param-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
  }

  .param-lbl { color: #849396; }

  .capacity-stepper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #080e18;
    padding: 0.15rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .step-btn {
    background: none;
    border: none;
    color: #00e5ff;
    font-weight: 900;
    cursor: pointer;
  }

  .step-btn:disabled {
    color: #4a5568;
    cursor: not-allowed;
  }

  .cap-val {
    color: #ffffff;
    font-weight: 800;
  }

  /* FSM Actions Sticky Bottom */
  .fsm-actions-sticky {
    padding-top: 0.5rem;
    border-top: 1px solid rgba(0, 229, 255, 0.2);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .btn-start-match-cta {
    width: 100%;
    padding: 0.6rem;
    background: #2ecc71;
    color: #05150c;
    border: none;
    border-radius: 0.375rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    cursor: pointer;
    box-shadow: 0 0 14px rgba(46, 204, 113, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition: all 0.15s;
  }

  .btn-start-match-cta:hover:not(:disabled) {
    background: #27ae60;
    box-shadow: 0 0 20px rgba(46, 204, 113, 0.6);
  }

  .btn-start-match-cta:disabled {
    background: #1a2f23;
    color: #557762;
    cursor: not-allowed;
    box-shadow: none;
  }

  .fsm-secondary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .btn-fsm-stop {
    padding: 0.35rem;
    background: rgba(255, 71, 87, 0.15);
    border: 1px solid rgba(255, 71, 87, 0.4);
    color: #ff4757;
    border-radius: 0.25rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    cursor: pointer;
  }

  .btn-fsm-stop:hover:not(:disabled) {
    background: #ff4757;
    color: #ffffff;
  }

  .btn-fsm-stop:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-fsm-pause {
    padding: 0.35rem;
    background: rgba(255, 219, 60, 0.15);
    border: 1px solid rgba(255, 219, 60, 0.4);
    color: #ffe16d;
    border-radius: 0.25rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    cursor: pointer;
  }

  .btn-fsm-pause:hover:not(:disabled) {
    background: #ffe16d;
    color: #050811;
  }

  .btn-fsm-pause:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* BANQUILLOS DE JUGADORES (58%) */
  .roster-benches-grid {
    width: 58%;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
    height: 100%;
  }

  .bench-col {
    background: rgba(8, 14, 24, 0.85);
    border-radius: 0.375rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .bench-col.red-bench { border: 1px solid rgba(255, 71, 87, 0.4); }
  .bench-col.spec-bench { border: 1px solid rgba(255, 255, 255, 0.15); }
  .bench-col.blue-bench { border: 1px solid rgba(0, 229, 255, 0.4); }

  .bench-hdr {
    padding: 0.35rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .bench-hdr.red { background: rgba(255, 71, 87, 0.2); border-bottom: 1px solid rgba(255, 71, 87, 0.4); }
  .bench-hdr.spec { background: rgba(255, 255, 255, 0.08); border-bottom: 1px solid rgba(255, 255, 255, 0.15); }
  .bench-hdr.blue { background: rgba(0, 229, 255, 0.2); border-bottom: 1px solid rgba(0, 229, 255, 0.4); }

  .join-team-hdr {
    background: none;
    border: none;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
  }

  .bench-hdr.red .join-team-hdr { color: #ff4757; }
  .bench-hdr.blue .join-team-hdr { color: #00e5ff; }
  .bench-hdr.spec .join-team-hdr { color: #849396; }

  .count-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 0.2rem;
  }

  .count-chip.red { background: rgba(255, 71, 87, 0.25); color: #ff4757; }
  .count-chip.blue { background: rgba(0, 229, 255, 0.25); color: #00e5ff; }
  .count-chip.spec { background: rgba(255, 255, 255, 0.1); color: #849396; }

  .bench-player-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 290px;
  }

  .bench-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(22, 28, 38, 0.7);
    padding: 0.35rem;
    border-radius: 0.25rem;
    border-left: 2px solid transparent;
  }

  .bench-item.red-border { border-left-color: #ff4757; }
  .bench-item.blue-border { border-left-color: #00e5ff; }
  .bench-item.spec-border { border-left-color: #849396; }
  .bench-item.is-host-gold {
    background: rgba(255, 219, 60, 0.1);
    border-left-color: #ffe16d;
    box-shadow: 0 0 6px rgba(255, 219, 60, 0.2);
  }

  .bench-avatar {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .bench-avatar.red { background: #ff4757; color: #ffffff; }
  .bench-avatar.blue { background: #00e5ff; color: #00363d; }
  .bench-avatar.spec { background: #3b494c; color: #ffffff; }
  .bench-avatar.gold { background: #ffe16d; color: #050811; }

  .bench-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .b-name {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .b-name.gold-text { color: #ffe16d; }

  .b-role {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
  }

  .b-role.red { color: #ff4757; font-weight: 700; }
  .b-role.blue { color: #00e5ff; font-weight: 700; }
  .b-role.gold { color: #ffe16d; font-weight: 700; }
  .b-role.muted { color: #849396; }

  .empty-bench-note {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.7rem;
    color: #849396;
    text-align: center;
    padding: 1rem 0;
    font-style: italic;
  }

  /* Scrollbar */
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
</style>
