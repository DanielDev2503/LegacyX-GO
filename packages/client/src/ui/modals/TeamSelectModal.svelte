<script lang="ts">
  import { gameUI, type TeamSlot } from '../state/gameUI.svelte';
  import { soundFX } from '../../audio/SoundFX';

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

  let copyStatus = $state<'idle' | 'copied'>('idle');

  let redPlayers = $derived(gameUI.players.filter((p) => p.team === 'red'));
  let specPlayers = $derived(gameUI.players.filter((p) => p.team === 'spectator'));
  let bluePlayers = $derived(gameUI.players.filter((p) => p.team === 'blue'));

  let isMatchStopped = $derived(
    gameUI.fsmPhase === 'STOPPED' ||
    gameUI.matchPhase === 0 ||
    gameUI.matchState === 'STOPPED' ||
    gameUI.matchState === 'STATS'
  );
  let isMatchPaused = $derived(gameUI.fsmPhase === 'PAUSED' || gameUI.matchPhase === 2.1);
  let canClose = $derived(!gameUI.isTeamSelectForcedOpen);
  let isRoomPublic = $state(gameUI.activeRoom ? !gameUI.activeRoom.isPrivate : true);

  function joinTeam(team: TeamSlot) {
    soundFX.playUIClick();
    if (gameUI.changeTeam(gameUI.localPlayerId, team)) {
      onTeamChange(gameUI.localPlayerId, team);
    }
  }

  function movePlayer(playerId: number, team: TeamSlot) {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    if (gameUI.changeTeam(playerId, team)) {
      onTeamChange(playerId, team);
    }
  }

  function handleStartMatch() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    gameUI.startMatch();
    onStartMatch();
  }

  function handleStopMatch() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    gameUI.stopMatch();
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
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    const next = Math.max(2, Math.min(20, roomCapacity + delta));
    roomCapacity = next;
    if (gameUI.activeRoom) {
      gameUI.activeRoom.maxPlayers = next;
    }
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
  class:is-forced-open={gameUI.isTeamSelectForcedOpen}
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
  <!-- Contenedor Principal del Menú de Sala (Exacto Stitch) -->
  <div class="team-modal-card">
    <!-- Header Sutil de Sala -->
    <header class="modal-header">
      <div class="room-identity">
        <span class="room-icon">⚽</span>
        <h2 class="room-title">SALA: {gameUI.activeRoomName || 'TORNEO NOCTURNO #12'}</h2>
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

        {#if gameUI.lastMatchStats && gameUI.lastMatchStats.length > 0 && isMatchStopped}
          <button
            type="button"
            id="lobby-to-stats-btn"
            class="btn-stats-link"
            onclick={() => {
              gameUI.showPostMatchCarousel = true;
              gameUI.closeModal();
            }}
          >
            📊 STATS
          </button>
        {/if}

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

    <!-- CUERPO EN PROPORCIÓN 1/3 (Izquierda) y 2/3 (Derecha) = 4 Columnas -->
    <div class="modal-body-layout">
      <!-- ======================================== -->
      <!-- COLUMNA 1 (1/3: AJUSTES, REGLAS Y FSM)   -->
      <!-- ======================================== -->
      <aside class="col-settings-panel">
        <div class="col-settings-scroll custom-scrollbar">
          <!-- 1. Selectores de Configuración de Partida (0 a 15) en fila compacta -->
          <div class="rules-row flex gap-2 w-full">
            <div class="rule-select-box flex-1 min-w-0" title="Tiempo de partido">
              <span class="rule-icon">⏱</span>
              <select
                id="select-time-limit"
                class="rule-select"
                value={gameUI.timeLimitMinutes}
                disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                onchange={(e) => {
                  const val = Number((e.currentTarget as HTMLSelectElement).value);
                  soundFX.playUIClick();
                  gameUI.timeLimitMinutes = val;
                  gameUI.physicsModifiers.timeLimit = val;
                  if (gameUI.activeRoom) gameUI.activeRoom.timeLimit = val;
                }}
              >
                {#each Array.from({ length: 16 }, (_, i) => i) as t}
                  <option value={t}>{formatTimeLimit(t)}</option>
                {/each}
              </select>
              <span class="rule-arrow">▾</span>
            </div>

            <div class="rule-select-box flex-1 min-w-0" title="Límite de goles">
              <span class="rule-icon">⚽</span>
              <select
                id="select-goal-limit"
                class="rule-select"
                value={gameUI.scoreLimitGoals}
                disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                onchange={(e) => {
                  const val = Number((e.currentTarget as HTMLSelectElement).value);
                  soundFX.playUIClick();
                  gameUI.scoreLimitGoals = val;
                  gameUI.physicsModifiers.scoreLimit = val;
                  if (gameUI.activeRoom) gameUI.activeRoom.scoreLimit = val;
                }}
              >
                {#each Array.from({ length: 16 }, (_, i) => i) as g}
                  <option value={g}>{formatGoalsLimit(g)}</option>
                {/each}
              </select>
              <span class="rule-arrow">▾</span>
            </div>
          </div>

          <!-- 2. Bloquear Equipos y Modifiers en fila -->
          <div class="rules-row flex gap-2 w-full">
            <button
              type="button"
              id="btn-lock-teams"
              class="rule-btn lock-teams-btn flex-1 min-w-0"
              class:active-locked={gameUI.teamsLocked}
              disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
              title="Bloquear equipos para que solo los administradores puedan mover jugadores"
              onclick={() => {
                soundFX.playUIClick();
                gameUI.toggleTeamsLock();
              }}
            >
              <span class="lock-label">{gameUI.teamsLocked ? '🔒 Bloqueados' : '🔓 Libres'}</span>
              <span class="lock-tag">{gameUI.teamsLocked ? 'SOLO ADMINS' : 'TODOS'}</span>
            </button>

            <button
              type="button"
              id="btn-open-physics-modifiers"
              class="rule-btn highlight flex-1 min-w-0"
              disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
              onclick={() => gameUI.openOverlay('MODIFIERS')}
              title="Abrir panel de modificadores de física"
            >
              <span>⚡ Modifiers</span>
            </button>
          </div>

          <!-- 3. Escoger estadio con previsualización vectorial 2:1 (Paridad RoomCreator) -->
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
              <!-- Tactical Pitch SVG in 2:1 ratio -->
              <svg class="stadium-svg" viewBox="0 0 300 150" preserveAspectRatio="none">
                <rect x="4" y="4" width="292" height="142" rx="4" fill="#092215" stroke="#00e5ff" stroke-opacity="0.45" stroke-width="1.5" />
                <line x1="150" y1="4" x2="150" y2="146" stroke="#00e5ff" stroke-opacity="0.4" stroke-width="1.5" />
                <circle cx="150" cy="75" r="32" fill="none" stroke="#00e5ff" stroke-opacity="0.4" stroke-width="1.5" />
                <circle cx="150" cy="75" r="3" fill="#00e5ff" />
                <!-- Left penalty & goal area -->
                <rect x="4" y="40" width="36" height="70" fill="none" stroke="#00e5ff" stroke-opacity="0.35" stroke-width="1.2" />
                <rect x="1" y="58" width="5" height="34" fill="rgba(0, 229, 255, 0.35)" stroke="#00e5ff" stroke-width="1" />
                <!-- Right penalty & goal area -->
                <rect x="260" y="40" width="36" height="70" fill="none" stroke="#00e5ff" stroke-opacity="0.35" stroke-width="1.2" />
                <rect x="294" y="58" width="5" height="34" fill="rgba(0, 229, 255, 0.35)" stroke="#00e5ff" stroke-width="1" />
              </svg>

              <!-- Superimposed overlay info -->
              <div class="stadium-overlay">
                <span class="stadium-name">{gameUI.activeStadiumName || 'Mediano'}</span>
                <span class="stadium-action-text">Dar click para cambiar de estadio</span>
              </div>
            </div>
          </div>

          <!-- 4. Ajustes Avanzados de Sala con Toggle Pública/Privada -->
          <div class="advanced-settings-card w-full">
            <span class="card-micro-title">⚙️ AJUSTES DE SALA</span>

            <div class="adv-row">
              <label for="room-name-input">Nombre de Sala</label>
              <input
                id="room-name-input"
                type="text"
                maxlength="50"
                class="styled-adv-input"
                bind:value={gameUI.activeRoomName}
                disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
              />
            </div>

            <!-- Selector de Capacidad de Jugadores -->
            <div class="adv-capacity-row">
              <span class="adv-label">Capacidad Jugadores:</span>
              <div class="cap-stepper">
                <button
                  type="button"
                  id="btn-cap-minus"
                  class="cap-step-btn"
                  disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                  onclick={() => changeCapacity(-1)}
                >
                  -
                </button>
                <span id="capacity-value" class="cap-num-val">{roomCapacity}</span>
                <button
                  type="button"
                  id="btn-cap-plus"
                  class="cap-step-btn"
                  disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                  onclick={() => changeCapacity(1)}
                >
                  +
                </button>
              </div>
            </div>

            <!-- Toggle Sala Pública / Privada -->
            <div class="toggle-row">
              <span class="toggle-label">{isRoomPublic ? '🌐 Sala pública' : '🔒 Sala privada'}</span>
              <label class="switch">
                <input
                  type="checkbox"
                  bind:checked={isRoomPublic}
                  disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                  onchange={() => {
                    soundFX.playUIClick();
                    if (gameUI.activeRoom) {
                      gameUI.activeRoom.isPrivate = !isRoomPublic;
                    }
                  }}
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- PARTE INFERIOR FIJA: MÁQUINA DE ESTADOS FSM -->
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
        <!-- 1. EQUIPO ROJO (RED) -->
        <section class="bench-card red-bench">
          <div class="bench-card-header red-header">
            <div class="team-meta">
              <span class="team-dot red"></span>
              <span class="team-name">EQUIPO ROJO</span>
              <span id="redCount" class="count-pill">{redPlayers.length}</span>
            </div>
            <button
              type="button"
              id="joinRedBtn"
              class="btn-join-team red"
              disabled={gameUI.teamsLocked && !gameUI.isAdmin && !gameUI.isHost}
              onclick={() => joinTeam('red')}
            >
              UNIRSE
            </button>
          </div>

          <div id="redPlayersList" class="bench-players-list custom-scrollbar-red">
            {#each redPlayers as p (p.id)}
              <div class="player-slot-card red-slot">
                <div class="slot-main-info">
                  <div class="slot-avatar red">{p.avatar || p.number}</div>
                  <div class="slot-text-col">
                    <span class="slot-nickname">{p.name}</span>
                    <span class="slot-role red">
                      {#if p.isHost}👑 Anfitrión
                      {:else if p.isAdmin}Capitán ©
                      {:else}Player #{p.number || 1}
                      {/if}
                    </span>
                  </div>
                </div>

                <div class="slot-actions">
                  {#if (gameUI.isAdmin || gameUI.isHost) && p.id !== gameUI.localPlayerId}
                    <button
                      type="button"
                      class="btn-slot-action"
                      title="Mover a Espectadores"
                      onclick={() => movePlayer(p.id, 'spectator')}
                    >
                      ▶
                    </button>
                    {#if !p.isHost}
                      <button
                        type="button"
                        class="btn-slot-kick"
                        title="Expulsar"
                        onclick={() => gameUI.kickPlayer(p.id)}
                      >
                        ✕
                      </button>
                    {/if}
                  {:else if gameUI.isAdmin || gameUI.isHost}
                    <button
                      type="button"
                      class="btn-slot-action"
                      title="Mover a Espectadores"
                      onclick={() => movePlayer(p.id, 'spectator')}
                    >
                      ▶
                    </button>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="empty-bench-state">Sin jugadores en Rojo</div>
            {/each}
          </div>
        </section>

        <!-- 2. ESPECTADORES (SPEC) -->
        <section class="bench-card spec-bench">
          <div class="bench-card-header spec-header">
            <div class="team-meta">
              <span class="team-dot spec"></span>
              <span class="team-name">ESPECTADORES</span>
              <span id="specCount" class="count-pill">{specPlayers.length}</span>
            </div>
            <button
              type="button"
              id="joinSpecBtn"
              class="btn-join-team spec"
              disabled={gameUI.teamsLocked && !gameUI.isAdmin && !gameUI.isHost}
              onclick={() => joinTeam('spectator')}
            >
              MIRAR
            </button>
          </div>

          <div id="specPlayersList" class="bench-players-list custom-scrollbar">
            {#each specPlayers as p (p.id)}
              <div class="player-slot-card spec-slot">
                {#if gameUI.isAdmin || gameUI.isHost}
                  <button
                    type="button"
                    class="btn-slot-arrow"
                    title="Mover a Rojo"
                    onclick={() => movePlayer(p.id, 'red')}
                  >
                    ◀
                  </button>
                {/if}

                <div class="slot-main-info">
                  <div class="slot-avatar spec">{p.avatar || p.number}</div>
                  <div class="slot-text-col">
                    <span class="slot-nickname">{p.name}</span>
                    <span class="slot-role spec">
                      {#if p.isHost}👑 Anfitrión
                      {:else}Espectador
                      {/if}
                    </span>
                  </div>
                </div>

                <div class="slot-actions">
                  {#if gameUI.isAdmin || gameUI.isHost}
                    <button
                      type="button"
                      class="btn-slot-arrow"
                      title="Mover a Azul"
                      onclick={() => movePlayer(p.id, 'blue')}
                    >
                      ▶
                    </button>
                    {#if !p.isHost && p.id !== gameUI.localPlayerId}
                      <button
                        type="button"
                        class="btn-slot-kick"
                        title="Expulsar"
                        onclick={() => gameUI.kickPlayer(p.id)}
                      >
                        ✕
                      </button>
                    {/if}
                  {/if}
                </div>
              </div>
            {:else}
              <div class="empty-bench-state">Sin espectadores</div>
            {/each}
          </div>
        </section>

        <!-- 3. EQUIPO AZUL (BLUE) -->
        <section class="bench-card blue-bench">
          <div class="bench-card-header blue-header">
            <div class="team-meta">
              <span class="team-dot blue"></span>
              <span class="team-name">EQUIPO AZUL</span>
              <span id="blueCount" class="count-pill">{bluePlayers.length}</span>
            </div>
            <button
              type="button"
              id="joinBlueBtn"
              class="btn-join-team blue"
              disabled={gameUI.teamsLocked && !gameUI.isAdmin && !gameUI.isHost}
              onclick={() => joinTeam('blue')}
            >
              UNIRSE
            </button>
          </div>

          <div id="bluePlayersList" class="bench-players-list custom-scrollbar">
            {#each bluePlayers as p (p.id)}
              <div class="player-slot-card blue-slot">
                {#if gameUI.isAdmin || gameUI.isHost}
                  <button
                    type="button"
                    class="btn-slot-action"
                    title="Mover a Espectadores"
                    onclick={() => movePlayer(p.id, 'spectator')}
                  >
                    ◀
                  </button>
                {/if}

                <div class="slot-main-info">
                  <div class="slot-avatar blue">{p.avatar || p.number}</div>
                  <div class="slot-text-col">
                    <span class="slot-nickname">{p.name}</span>
                    <span class="slot-role blue">
                      {#if p.isHost}👑 Anfitrión
                      {:else if p.isAdmin}Capitán ©
                      {:else}Player #{p.number || 1}
                      {/if}
                    </span>
                  </div>
                </div>

                <div class="slot-actions">
                  {#if (gameUI.isAdmin || gameUI.isHost) && !p.isHost && p.id !== gameUI.localPlayerId}
                    <button
                      type="button"
                      class="btn-slot-kick"
                      title="Expulsar"
                      onclick={() => gameUI.kickPlayer(p.id)}
                    >
                      ✕
                    </button>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="empty-bench-state">Sin jugadores en Azul</div>
            {/each}
          </div>
        </section>
      </main>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 95;
    padding: 0;
    pointer-events: none;
    user-select: none;
  }

  .team-modal-card {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    top: calc(var(--top-banner-height, 48px) + 16px);
    bottom: calc(var(--chat-height, 160px) + 16px);
    width: min(94vw, 1060px);
    max-height: calc(100vh - var(--chat-height, 160px) - var(--top-banner-height, 48px) - 32px);
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
    z-index: 96;
  }

  /* HEADER */
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

  .room-icon {
    font-size: 1.1rem;
  }

  .room-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #ffffff;
    text-transform: uppercase;
    margin: 0;
    max-width: 380px;
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
  .btn-stats-link,
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

  .btn-stats-link {
    background: #161c26;
    border: 1px solid rgba(255, 215, 0, 0.35);
    color: #ffd700;
  }

  .btn-stats-link:hover {
    background: rgba(255, 215, 0, 0.15);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
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

  /* BODY LAYOUT (1/3 - 2/3) */
  .modal-body-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* COLUMNA 1 (1/3: AJUSTES & FSM) */
  .col-settings-panel {
    width: 32%;
    height: 100%;
    background: rgba(8, 14, 24, 0.55);
    border-right: 1px solid rgba(0, 229, 255, 0.2);
    display: flex;
    flex-direction: column;
    padding: 0.85rem;
    box-sizing: border-box;
    overflow-x: hidden;
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

  .rules-row {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  .rule-select-box {
    position: relative;
    display: flex;
    align-items: center;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.375rem;
    padding: 0 0.5rem;
    height: 38px;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .rule-select-box:hover,
  .rule-select-box:focus-within {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
  }

  .rule-icon {
    font-size: 13px;
    margin-right: 4px;
    pointer-events: none;
  }

  .rule-select {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    padding-right: 14px;
  }

  .rule-select option {
    background: #080e18;
    color: #dde2f1;
  }

  .rule-arrow {
    position: absolute;
    right: 8px;
    font-size: 10px;
    color: #00e5ff;
    pointer-events: none;
  }

  .rule-btn {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.6rem;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.375rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .rule-btn:hover:not(:disabled) {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
  }

  .rule-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .lock-teams-btn {
    border-color: rgba(0, 229, 255, 0.35);
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

  .rule-btn.highlight {
    background: rgba(251, 191, 36, 0.1);
    border-color: rgba(251, 191, 36, 0.4);
    color: #fcd34d;
    box-shadow: 0 0 12px rgba(251, 191, 36, 0.15);
    justify-content: center;
  }

  .rule-btn.highlight:hover:not(:disabled) {
    background: rgba(251, 191, 36, 0.2);
    border-color: #fbbf24;
    color: #ffffff;
    box-shadow: 0 0 16px rgba(251, 191, 36, 0.3);
  }

  /* ESTADIO (2:1 Proporción Paridad RoomCreator) */
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
    background: #ffb703;
    border: none;
    border-radius: 0.5rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 900;
    color: #050811;
    letter-spacing: 0.05em;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(255, 183, 3, 0.4);
    transition: all 0.15s ease;
  }

  .btn-pause-match:hover:not(:disabled) {
    background: #e0a200;
  }

  .btn-pause-match.is-resuming {
    background: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.4);
  }

  /* COLUMNAS 2, 3, 4 (2/3: BANQUILLOS) */
  .col-benches-grid {
    width: 68%;
    height: 100%;
    padding: 0.85rem;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
  }

  .red-bench {
    border: 1px solid rgba(255, 51, 102, 0.4);
    box-shadow: 0 0 14px rgba(255, 51, 102, 0.12);
  }

  .spec-bench {
    border: 1px solid rgba(132, 147, 150, 0.4);
    box-shadow: 0 0 14px rgba(0, 0, 0, 0.3);
  }

  .blue-bench {
    border: 1px solid rgba(0, 229, 255, 0.4);
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.12);
  }

  /* Bench Header */
  .bench-card-header {
    height: 38px;
    padding: 0 0.65rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .red-header {
    background: rgba(255, 51, 102, 0.2);
    border-bottom: 1px solid rgba(255, 51, 102, 0.4);
  }

  .spec-header {
    background: rgba(59, 73, 76, 0.35);
    border-bottom: 1px solid rgba(132, 147, 150, 0.4);
  }

  .blue-header {
    background: rgba(0, 229, 255, 0.2);
    border-bottom: 1px solid rgba(0, 229, 255, 0.4);
  }

  .team-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .team-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 9999px;
  }

  .team-dot.red { background: #ff3366; box-shadow: 0 0 6px #ff3366; }
  .team-dot.spec { background: #849396; }
  .team-dot.blue { background: #00e5ff; box-shadow: 0 0 6px #00e5ff; }

  .team-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .red-header .team-name { color: #ff3366; }
  .spec-header .team-name { color: #bac9cc; }
  .blue-header .team-name { color: #00e5ff; }

  .count-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    border-radius: 9999px;
    background: rgba(8, 14, 24, 0.8);
  }

  .btn-join-team {
    padding: 0.2rem 0.55rem;
    border-radius: 0.25rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-join-team.red {
    background: transparent;
    border: 1px solid rgba(255, 51, 102, 0.4);
    color: #ff3366;
  }

  .btn-join-team.red:hover:not(:disabled) {
    background: rgba(255, 51, 102, 0.25);
  }

  .btn-join-team.spec {
    background: transparent;
    border: 1px solid rgba(132, 147, 150, 0.4);
    color: #bac9cc;
  }

  .btn-join-team.spec:hover:not(:disabled) {
    background: rgba(59, 73, 76, 0.4);
  }

  .btn-join-team.blue {
    background: transparent;
    border: 1px solid rgba(0, 229, 255, 0.4);
    color: #00e5ff;
  }

  .btn-join-team.blue:hover:not(:disabled) {
    background: rgba(0, 229, 255, 0.25);
  }

  .btn-join-team:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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

  .player-slot-card {
    background: rgba(19, 27, 40, 0.8);
    border-radius: 0.5rem;
    padding: 0.45rem 0.55rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    transition: all 0.15s ease;
  }

  .player-slot-card.red-slot {
    border-left: 3px solid #ff3366;
  }

  .player-slot-card.spec-slot {
    border-left: 3px solid #849396;
  }

  .player-slot-card.blue-slot {
    border-left: 3px solid #00e5ff;
  }

  .slot-main-info {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    flex: 1;
  }

  .slot-avatar {
    width: 1.65rem;
    height: 1.65rem;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .slot-avatar.red {
    background: #ff3366;
    color: #ffffff;
    box-shadow: 0 0 6px rgba(255, 51, 102, 0.5);
  }

  .slot-avatar.spec {
    background: #2f3540;
    color: #dde2f1;
  }

  .slot-avatar.blue {
    background: #00e5ff;
    color: #050811;
    box-shadow: 0 0 6px rgba(0, 229, 255, 0.5);
  }

  .slot-text-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .slot-nickname {
    font-size: 0.75rem;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .slot-role {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 600;
  }

  .slot-role.red { color: #ff3366; }
  .slot-role.spec { color: #849396; }
  .slot-role.blue { color: #00e5ff; }

  .slot-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .btn-slot-action,
  .btn-slot-arrow,
  .btn-slot-kick {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.25rem;
    background: rgba(36, 42, 53, 0.8);
    border: 1px solid rgba(132, 147, 150, 0.3);
    color: #bac9cc;
    font-size: 0.6rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-slot-action:hover,
  .btn-slot-arrow:hover {
    background: #00e5ff;
    color: #050811;
    border-color: #00e5ff;
  }

  .btn-slot-kick:hover {
    background: #ff3366;
    color: #ffffff;
    border-color: #ff3366;
  }

  .empty-bench-state {
    font-size: 0.72rem;
    color: #849396;
    text-align: center;
    padding: 1.5rem 0.5rem;
    font-style: italic;
  }

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
