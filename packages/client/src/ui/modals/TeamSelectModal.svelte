<script lang="ts">
  import { gameUI, type TeamSlot } from '../state/gameUI.svelte';

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

  let redPlayers = $derived(gameUI.players.filter((p) => p.team === 'red'));
  let specPlayers = $derived(gameUI.players.filter((p) => p.team === 'spectator'));
  let bluePlayers = $derived(gameUI.players.filter((p) => p.team === 'blue'));

  let isMatchStopped = $derived(gameUI.matchState === 'STOPPED' || gameUI.matchState === 'STATS');
  let canClose = $derived(!gameUI.isTeamSelectForcedOpen);

  function joinTeam(team: TeamSlot) {
    if (gameUI.changeTeam(gameUI.localPlayerId, team)) {
      onTeamChange(gameUI.localPlayerId, team);
    }
  }

  function movePlayer(playerId: number, team: TeamSlot) {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    if (gameUI.changeTeam(playerId, team)) {
      onTeamChange(playerId, team);
    }
  }

  function handleMatchToggle() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    if (isMatchStopped) {
      gameUI.startMatch();
      onStartMatch();
    } else {
      gameUI.stopMatch();
      onStopMatch();
    }
  }

  function handlePauseToggle() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    gameUI.togglePause();
    onTogglePause();
  }

  function handleClose() {
    if (!canClose) return;
    gameUI.closeModal();
  }

  function handleLeave() {
    gameUI.leaveRoom();
    onLeaveRoom();
  }
</script>

<div
  id="ingame-menu"
  class="modal-backdrop"
  class:is-forced-open={gameUI.isTeamSelectForcedOpen}
  role="dialog"
  aria-modal="true"
>
  <div class="team-modal-card">
    <header class="modal-header">
      <div class="room-identity">
        <span class="badge-live">SALA ACTIVA</span>
        <h2>{gameUI.activeRoomName || 'LegacyX-GO Arena'}</h2>
      </div>
      <div class="header-actions">
        {#if gameUI.lastMatchStats && gameUI.lastMatchStats.length > 0 && isMatchStopped}
          <button
            id="lobby-to-stats-btn"
            class="btn-secondary"
            onclick={() => {
              gameUI.showPostMatchCarousel = true;
              gameUI.closeModal();
            }}
          >
            📊 Estadísticas
          </button>
        {/if}
        <button class="btn-secondary" onclick={() => gameUI.openModal('settings')}>
          ⚙️ Ajustes
        </button>
        <button class="btn-danger-outline" onclick={handleLeave}>
          Salir
        </button>
        {#if canClose}
          <button id="menu-close-btn" class="close-btn" onclick={handleClose} aria-label="Cerrar menú">
            ✕
          </button>
        {/if}
      </div>
    </header>

    <div class="rules-toolbar">
      <div class="rule-item">
        <label for="select-time-limit">⏱️ Tiempo</label>
        <select
          id="select-time-limit"
          value={gameUI.timeLimitMinutes}
          disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
          onchange={(e) => {
            const val = Number((e.currentTarget as HTMLSelectElement).value);
            gameUI.timeLimitMinutes = val;
            gameUI.physicsModifiers.timeLimit = val;
          }}
        >
          {#each [1, 2, 3, 5, 7, 10, 15] as min}
            <option value={min}>{min} min</option>
          {/each}
        </select>
      </div>

      <div class="rule-item">
        <label for="select-goal-limit">⚽ Goles</label>
        <select
          id="select-goal-limit"
          value={gameUI.scoreLimitGoals}
          disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
          onchange={(e) => {
            const val = Number((e.currentTarget as HTMLSelectElement).value);
            gameUI.scoreLimitGoals = val;
            gameUI.physicsModifiers.scoreLimit = val;
          }}
        >
          {#each [1, 2, 3, 5, 7, 10, 15] as g}
            <option value={g}>{g} goles</option>
          {/each}
        </select>
      </div>

      <button
        id="btn-pick-stadium"
        class="tool-btn"
        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
        onclick={() => gameUI.openModal('stadiumSelect')}
      >
        🏟️ Estadio: <strong>{gameUI.selectedStadium}</strong>
      </button>

      <button
        id="btn-open-physics-modifiers"
        class="tool-btn"
        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
        onclick={() => gameUI.openModal('physics')}
      >
        ⚡ Física (19)
      </button>

      {#if gameUI.isAdmin || gameUI.isHost}
        <button
          id="btn-lock-teams"
          class="tool-btn"
          class:locked={gameUI.teamsLocked}
          onclick={() => gameUI.toggleTeamsLock()}
        >
          {gameUI.teamsLocked ? '🔒 Bloqueados' : '🔓 Libres'}
        </button>
        <button class="tool-btn" onclick={() => gameUI.autoBalanceTeams()} title="Auto-balancear">
          ⚖️ Auto
        </button>
        <button class="tool-btn" onclick={() => gameUI.randomizeTeams()} title="Mezclar equipos">
          🎲 Random
        </button>
      {/if}
    </div>

    <div class="benches-grid">
      <!-- RED TEAM -->
      <section class="bench-col red-col">
        <div class="bench-header">
          <div class="team-title">
            <span class="dot red"></span>
            <h3>EQUIPO ROJO</h3>
            <span id="redCount" class="count-pill">{redPlayers.length}</span>
          </div>
          <button
            id="joinRedBtn"
            class="join-btn red"
            disabled={gameUI.teamsLocked && !gameUI.isAdmin && !gameUI.isHost}
            onclick={() => joinTeam('red')}
          >
            Unirse
          </button>
        </div>
        <div id="redPlayersList" class="player-list">
          {#each redPlayers as p (p.id)}
            <div class="player-row">
              <div class="player-meta">
                <span class="player-avatar-circle red">{p.avatar || p.number}</span>
                <span class="player-name">{p.name}</span>
                {#if p.isHost}<span class="badge-crown" title="Anfitrión">👑</span>{/if}
                {#if p.isAdmin}<span class="badge-admin" title="Capitán / Admin">©</span>{/if}
              </div>
              {#if (gameUI.isAdmin || gameUI.isHost) && p.id !== gameUI.localPlayerId}
                <div class="admin-row-actions">
                  <button onclick={() => movePlayer(p.id, 'spectator')} title="Mover a Espectadores">▶</button>
                  {#if !p.isHost}
                    <button class="kick-btn" onclick={() => gameUI.kickPlayer(p.id)} title="Expulsar">✕</button>
                    <button class="ban-btn" onclick={() => gameUI.banPlayer(p.id)} title="Banear">🚫</button>
                  {/if}
                </div>
              {:else if gameUI.isAdmin || gameUI.isHost}
                <div class="admin-row-actions">
                  <button onclick={() => movePlayer(p.id, 'spectator')} title="Mover a Espectadores">▶</button>
                </div>
              {/if}
            </div>
          {:else}
            <div class="empty-bench">Sin jugadores</div>
          {/each}
        </div>
      </section>

      <!-- SPECTATORS -->
      <section class="bench-col spec-col">
        <div class="bench-header">
          <div class="team-title">
            <span class="dot spec"></span>
            <h3>ESPECTADORES</h3>
            <span id="specCount" class="count-pill">{specPlayers.length}</span>
          </div>
          <button
            id="joinSpecBtn"
            class="join-btn spec"
            disabled={gameUI.teamsLocked && !gameUI.isAdmin && !gameUI.isHost}
            onclick={() => joinTeam('spectator')}
          >
            Espectar
          </button>
        </div>
        <div id="specPlayersList" class="player-list">
          {#each specPlayers as p (p.id)}
            <div class="player-row">
              {#if gameUI.isAdmin || gameUI.isHost}
                <button class="move-arrow" onclick={() => movePlayer(p.id, 'red')} title="Mover a Rojo">◀</button>
              {/if}
              <div class="player-meta">
                <span class="player-avatar-circle spec">{p.avatar || p.number}</span>
                <span class="player-name">{p.name}</span>
                {#if p.isHost}<span class="badge-crown" title="Anfitrión">👑</span>{/if}
                {#if p.isAdmin}<span class="badge-admin" title="Capitán / Admin">©</span>{/if}
              </div>
              <div class="admin-row-actions">
                {#if gameUI.isAdmin || gameUI.isHost}
                  <button class="move-arrow" onclick={() => movePlayer(p.id, 'blue')} title="Mover a Azul">▶</button>
                  {#if !p.isHost && p.id !== gameUI.localPlayerId}
                    <button class="kick-btn" onclick={() => gameUI.kickPlayer(p.id)} title="Expulsar">✕</button>
                    <button class="ban-btn" onclick={() => gameUI.banPlayer(p.id)} title="Banear">🚫</button>
                  {/if}
                {/if}
              </div>
            </div>
          {:else}
            <div class="empty-bench">Sin espectadores</div>
          {/each}
        </div>
      </section>

      <!-- BLUE TEAM -->
      <section class="bench-col blue-col">
        <div class="bench-header">
          <div class="team-title">
            <span class="dot blue"></span>
            <h3>EQUIPO AZUL</h3>
            <span id="blueCount" class="count-pill">{bluePlayers.length}</span>
          </div>
          <button
            id="joinBlueBtn"
            class="join-btn blue"
            disabled={gameUI.teamsLocked && !gameUI.isAdmin && !gameUI.isHost}
            onclick={() => joinTeam('blue')}
          >
            Unirse
          </button>
        </div>
        <div id="bluePlayersList" class="player-list">
          {#each bluePlayers as p (p.id)}
            <div class="player-row">
              {#if gameUI.isAdmin || gameUI.isHost}
                <div class="admin-row-actions">
                  <button onclick={() => movePlayer(p.id, 'spectator')} title="Mover a Espectadores">◀</button>
                </div>
              {/if}
              <div class="player-meta">
                <span class="player-avatar-circle blue">{p.avatar || p.number}</span>
                <span class="player-name">{p.name}</span>
                {#if p.isHost}<span class="badge-crown" title="Anfitrión">👑</span>{/if}
                {#if p.isAdmin}<span class="badge-admin" title="Capitán / Admin">©</span>{/if}
              </div>
              {#if (gameUI.isAdmin || gameUI.isHost) && !p.isHost && p.id !== gameUI.localPlayerId}
                <div class="admin-row-actions">
                  <button class="kick-btn" onclick={() => gameUI.kickPlayer(p.id)} title="Expulsar">✕</button>
                  <button class="ban-btn" onclick={() => gameUI.banPlayer(p.id)} title="Banear">🚫</button>
                </div>
              {/if}
            </div>
          {:else}
            <div class="empty-bench">Sin jugadores</div>
          {/each}
        </div>
      </section>
    </div>

    <footer class="modal-footer">
      <button
        id="btn-match-toggle"
        class={isMatchStopped ? 'btn btn-success btn-match-toggle' : 'btn btn-danger btn-match-toggle'}
        disabled={!gameUI.isAdmin && !gameUI.isHost}
        onclick={handleMatchToggle}
      >
        {isMatchStopped ? '▶ Iniciar Partido' : '■ Detener Partido'}
      </button>

      {#if !isMatchStopped}
        <button
          id="btn-pause-resume"
          class="btn btn-warning"
          disabled={!gameUI.isAdmin && !gameUI.isHost}
          onclick={handlePauseToggle}
        >
          {gameUI.matchState === 'PAUSED' ? '▶ Reanudar (P)' : '⏸ Pausar (P)'}
        </button>

        <button id="btn-return-game" class="btn btn-return" onclick={handleClose}>
          Volver al Campo (Esc)
        </button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 17, 0.72);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    padding: 1rem;
  }

  .team-modal-card {
    width: min(920px, 96vw);
    max-height: calc(100vh - 190px);
    background: rgba(10, 16, 26, 0.96);
    border: 1px solid rgba(0, 229, 255, 0.28);
    border-radius: 18px;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: #f0f8ff;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .room-identity {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .badge-live {
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    padding: 0.25rem 0.55rem;
    border-radius: 6px;
    background: rgba(0, 229, 255, 0.14);
    color: #00e5ff;
    border: 1px solid rgba(0, 229, 255, 0.35);
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-secondary,
  .btn-danger-outline,
  .close-btn {
    padding: 0.45rem 0.85rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(30, 41, 59, 0.75);
    color: #e2e8f0;
  }

  .btn-danger-outline {
    border-color: rgba(255, 71, 87, 0.4);
    color: #ff6b81;
  }

  .rules-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    background: rgba(15, 23, 42, 0.75);
    padding: 0.6rem 0.8rem;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.14);
  }

  .rule-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .rule-item select {
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    padding: 0.28rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .tool-btn {
    background: rgba(30, 41, 59, 0.85);
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 8px;
    padding: 0.35rem 0.7rem;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tool-btn:disabled,
  .rule-item select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tool-btn.locked {
    border-color: rgba(245, 158, 11, 0.5);
    color: #fbbf24;
  }

  .benches-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.9rem;
    min-height: 220px;
    max-height: 300px;
  }

  .bench-col {
    background: rgba(15, 23, 42, 0.85);
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .red-col {
    border-top: 3px solid #ff0055;
  }

  .spec-col {
    border-top: 3px solid #94a3b8;
  }

  .blue-col {
    border-top: 3px solid #00e5ff;
  }

  .bench-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.8rem;
    background: rgba(2, 6, 23, 0.5);
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .team-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .team-title h3 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot.red {
    background: #ff0055;
  }

  .dot.spec {
    background: #94a3b8;
  }

  .dot.blue {
    background: #00e5ff;
  }

  .count-pill {
    font-size: 0.7rem;
    background: rgba(148, 163, 184, 0.16);
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font-weight: 700;
  }

  .join-btn {
    padding: 0.3rem 0.7rem;
    border-radius: 6px;
    border: none;
    font-size: 0.74rem;
    font-weight: 800;
    cursor: pointer;
    color: #fff;
  }

  .join-btn.red {
    background: #ff0055;
  }

  .join-btn.spec {
    background: #475569;
  }

  .join-btn.blue {
    background: #0284c7;
  }

  .join-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .player-list {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow-y: auto;
    flex: 1;
  }

  .player-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.38rem 0.55rem;
    border-radius: 8px;
    background: rgba(30, 41, 59, 0.65);
    font-size: 0.82rem;
  }

  .player-meta {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    overflow: hidden;
  }

  .player-avatar-circle {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    font-weight: 800;
    color: #fff;
    flex-shrink: 0;
  }

  .player-avatar-circle.red {
    background: #ff0055;
  }

  .player-avatar-circle.spec {
    background: #475569;
  }

  .player-avatar-circle.blue {
    background: #00b4d8;
  }

  .player-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge-crown,
  .badge-admin {
    font-size: 0.75rem;
  }

  .admin-row-actions {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .admin-row-actions button,
  .move-arrow {
    background: rgba(15, 23, 42, 0.8);
    color: #cbd5e1;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.68rem;
    cursor: pointer;
  }

  .kick-btn {
    color: #f87171 !important;
  }

  .empty-bench {
    color: #64748b;
    font-size: 0.78rem;
    text-align: center;
    margin: auto 0;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    padding-top: 0.5rem;
  }

  .btn {
    padding: 0.7rem 1.4rem;
    border-radius: 10px;
    border: none;
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-success {
    background: linear-gradient(135deg, #10b981, #059669);
    color: #042f2e;
    flex: 1;
  }

  .btn-danger {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #fff;
  }

  .btn-warning {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #1e293b;
  }

  .btn-return {
    background: rgba(30, 41, 59, 0.9);
    color: #e2e8f0;
    border: 1px solid rgba(0, 229, 255, 0.3);
  }
</style>
