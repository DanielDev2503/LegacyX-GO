<script lang="ts">
  import { gameUI, type RoomInfo } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let passwordInput = $state('');
  let passwordError = $state('');
  let isRefreshing = $state(false);

  function handleSearchInput(e: Event) {
    gameUI.roomFilterQuery = (e.target as HTMLInputElement).value;
  }

  function handleRefreshRooms() {
    soundFX.playUIClick();
    isRefreshing = true;
    gameUI.refreshRooms();
    setTimeout(() => {
      isRefreshing = false;
    }, 600);
  }

  $effect(() => {
    gameUI.refreshRooms();
  });

  function handleJoinRoom(room: RoomInfo) {
    if (room.isPrivate) {
      gameUI.pendingPasswordRoom = room;
      passwordInput = '';
      passwordError = '';
      gameUI.openModal('PASSWORD_PROMPT');
    } else {
      gameUI.joinRoomDirectly(room);
    }
  }

  function handleConfirmPassword() {
    if (!passwordInput.trim()) {
      passwordError = 'Ingresa una contraseña válida';
      return;
    }
    soundFX.playUIClick();
    if (gameUI.pendingPasswordRoom) {
      gameUI.joinRoomDirectly(gameUI.pendingPasswordRoom);
      gameUI.closeModal();
    }
  }
</script>

<div class="lobby-root">
  <!-- Top Navigation Header -->
  <header class="top-header">
    <button
      type="button"
      class="nav-pill-btn"
      onmouseenter={() => soundFX.playUIHover()}
      onclick={() => gameUI.navigateTo('GATEKEEPER')}
    >
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      <span>Inicio</span>
    </button>
  </header>

  <!-- Main Dual Card Layout -->
  <div class="content-container">
    <!-- LEFT CARD: Room Browser -->
    <section class="rooms-card">
      <div class="card-header">
        <div class="title-with-bar">
          <div class="accent-bar"></div>
          <h2 class="card-title">SALAS PÚBLICAS</h2>
        </div>
        <div class="online-pill">
          <span class="pulse-dot"></span>
          <span class="online-text">
            {gameUI.onlineUsersCount} {gameUI.onlineUsersCount === 1 ? 'jugador en línea' : 'jugadores en línea'}
          </span>
        </div>
      </div>

      <!-- Filter / Search Row -->
      <div class="filter-row">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input
            type="text"
            class="search-input"
            placeholder="Buscar sala por nombre o ID..."
            value={gameUI.roomFilterQuery}
            oninput={handleSearchInput}
          />
        </div>
        <button
          type="button"
          class="refresh-btn"
          class:spinning={isRefreshing}
          title="Actualizar lista de salas"
          onclick={handleRefreshRooms}
        >
          <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
        </button>
      </div>

      <!-- Scrollable Room List -->
      <div class="room-list">
        {#each gameUI.filteredRooms as room (room.id)}
          <div class="room-row">
            <div class="room-info">
              {#if room.isPrivate}
                <span class="lock-indicator" title="Sala con contraseña">🔒</span>
              {/if}
              <span class="room-name">{room.name}</span>
            </div>

            <div class="room-meta">
              <span class="capacity-badge">{room.playersCount} / {room.maxPlayers}</span>
              <button
                type="button"
                class="join-room-btn"
                class:private={room.isPrivate}
                onmouseenter={() => soundFX.playUIHover()}
                onclick={() => handleJoinRoom(room)}
              >
                {#if room.isPrivate}
                  <span class="btn-lock">🔒</span>
                {/if}
                <span>ENTRAR</span>
              </button>
            </div>
          </div>
        {:else}
          <div class="empty-rooms">
            <div class="empty-icon">🏟️</div>
            <p class="empty-title">No hay salas disponibles en este momento</p>
            <p class="empty-subtitle">¡Sé el primero en crear una sala y desafiar a otros jugadores!</p>
          </div>
        {/each}
      </div>

      <!-- Bottom Actions -->
      <div class="card-footer">
        <button
          type="button"
          class="btn-create-room"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.navigateTo('ROOM_CREATOR')}
        >
          <span class="btn-icon">➕</span>
          <span>CREAR SALA</span>
        </button>

        <button
          type="button"
          class="btn-settings"
          title="Configuración general"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.openModal('SETTINGS')}
        >
          <svg class="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>AJUSTES</span>
        </button>
      </div>
    </section>

    <!-- RIGHT MODULE: Player info & Practice Mode -->
    <div class="sidebar-module">
      <!-- Player Mini Card -->
      <div class="player-card">
        <div class="player-avatar">
          <span>{gameUI.avatarValue}</span>
          <span class="avatar-status-dot"></span>
        </div>
        <div class="player-details">
          <span class="player-nick">{gameUI.nickname}</span>
        </div>
      </div>

      <!-- Practice Mode Card -->
      <aside class="practice-card">
        <div class="practice-header">
          <div class="practice-icon-box">⚽</div>
          <span class="solo-badge">OFFLINE / SOLO</span>
        </div>
        <h3 class="practice-title">MODO PRÁCTICA</h3>
        <p class="practice-desc">
          Entra a la cancha en solitario para calibrar tus físicas personales, ensayar la curva del efecto Magnus y practicar remates a 60 Hz sin latencia.
        </p>

        <ul class="practice-features">
          <li><span class="cyan-bullet"></span> Físicas y respuesta sin latencia</li>
          <li><span class="cyan-bullet"></span> Balón con efecto Magnus dinámico</li>
          <li><span class="cyan-bullet"></span> Telemetría y cronómetro sincronizado</li>
        </ul>

        <button
          type="button"
          class="btn-train"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.enterPracticeMode()}
        >
          <span>▶</span>
          <span>ENTRENAR AHORA</span>
        </button>
      </aside>
    </div>
  </div>

  <!-- PASSWORD PROMPT MODAL -->
  {#if gameUI.activeModal === 'PASSWORD_PROMPT' && gameUI.pendingPasswordRoom}
    <div class="modal-backdrop" role="presentation">
      <div class="password-modal-card">
        <h3 class="modal-title">SALA PRIVADA</h3>
        <p class="modal-sub">
          Introduce la clave de acceso para <strong>{gameUI.pendingPasswordRoom.name}</strong>:
        </p>

        <input
          type="password"
          class="modal-password-input"
          placeholder="Contraseña de la sala..."
          bind:value={passwordInput}
          onkeydown={(e) => e.key === 'Enter' && handleConfirmPassword()}
        />

        {#if passwordError}
          <p class="error-msg">{passwordError}</p>
        {/if}

        <div class="modal-actions">
          <button
            type="button"
            class="modal-cancel-btn"
            onclick={() => gameUI.closeModal()}
          >
            CANCELAR
          </button>
          <button
            type="button"
            class="modal-submit-btn"
            onclick={handleConfirmPassword}
          >
            ENTRAR
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .lobby-root {
    position: fixed;
    inset: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background-color: #0b111e;
    background: radial-gradient(circle at 50% 20%, #111a2e 0%, #070b14 100%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px 28px;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
  }

  .top-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    z-index: 30;
  }

  .nav-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 16px;
    border-radius: 9999px;
    background: rgba(26, 32, 42, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.2);
    transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
  }

  .nav-pill-btn:hover {
    background: rgba(0, 229, 255, 0.2);
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.45);
    transform: translateY(-1px);
  }

  .nav-icon {
    width: 16px;
    height: 16px;
  }

  .content-container {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 24px;
    max-width: 1040px;
    width: 100%;
    margin: auto;
    padding: 12px 0;
  }

  .rooms-card {
    flex: 1;
    max-width: 680px;
    background: rgba(8, 14, 24, 0.96);
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 12px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.18);
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title-with-bar {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .accent-bar {
    width: 4px;
    height: 22px;
    background: #00e5ff;
    border-radius: 2px;
    box-shadow: 0 0 8px #00e5ff;
  }

  .card-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
    letter-spacing: 0.05em;
  }

  .online-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: #161c26;
    border: 1px solid rgba(46, 204, 113, 0.25);
    border-radius: 9999px;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2ecc71;
    box-shadow: 0 0 8px #2ecc71;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.9); }
  }

  .online-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #c3f5ff;
    font-weight: 600;
  }

  .filter-row {
    display: flex;
    gap: 10px;
  }

  .search-input-wrapper {
    position: relative;
    flex: 1;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 13px;
    opacity: 0.6;
  }

  .search-input {
    width: 100%;
    height: 40px;
    padding-left: 36px;
    padding-right: 14px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    color: #ffffff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .search-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
  }

  .refresh-btn {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #00e5ff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    flex-shrink: 0;
  }

  .refresh-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
  }

  .refresh-icon {
    width: 18px;
    height: 18px;
    transition: transform 0.4s ease;
  }

  .refresh-btn.spinning .refresh-icon {
    transform: rotate(360deg);
  }

  .room-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 220px;
    max-height: 320px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .room-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 14px;
    background: rgba(22, 28, 38, 0.8);
    border: 1px solid rgba(0, 229, 255, 0.12);
    border-radius: 6px;
    transition: background 0.15s, border-color 0.15s;
  }

  .room-row:hover {
    background: rgba(0, 229, 255, 0.08);
    border-color: rgba(0, 229, 255, 0.35);
  }

  .room-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .lock-indicator {
    font-size: 14px;
  }

  .room-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: #dde2f1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }

  .room-meta {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }

  .capacity-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #dfeeff;
    background: #1a202a;
    padding: 3px 8px;
    border-radius: 4px;
  }

  .btn-lock {
    font-size: 11px;
    margin-right: 4px;
  }

  .join-room-btn {
    padding: 6px 14px;
    border-radius: 5px;
    background: #2ecc71;
    border: none;
    color: #05150c;
    font-family: 'Chivo', system-ui, sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.08em;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(46, 204, 113, 0.3);
    transition: background 0.15s, box-shadow 0.15s;
  }

  .join-room-btn:hover {
    background: #27ae60;
    box-shadow: 0 0 14px rgba(46, 204, 113, 0.55);
  }

  .join-room-btn.private {
    background: rgba(0, 229, 255, 0.18);
    border: 1px solid #00e5ff;
    color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
  }

  .join-room-btn.private:hover {
    background: #00e5ff;
    color: #080e18;
  }

  .empty-rooms {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 44px 20px;
    background: rgba(14, 20, 32, 0.5);
    border: 1px dashed rgba(0, 229, 255, 0.25);
    border-radius: 8px;
    text-align: center;
    margin: auto 0;
  }

  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .empty-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 4px 0;
  }

  .empty-subtitle {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    color: #8fa0b5;
    margin: 0;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid rgba(0, 229, 255, 0.15);
  }

  .btn-create-room {
    height: 42px;
    padding: 0 20px;
    border-radius: 6px;
    background: #00e5ff;
    border: none;
    color: #080e18;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.5);
    transition: filter 0.15s, box-shadow 0.15s;
  }

  .btn-create-room:hover {
    filter: brightness(1.15);
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.75);
  }

  .btn-settings {
    height: 42px;
    padding: 0 16px;
    border-radius: 6px;
    background: rgba(26, 32, 42, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.15s, box-shadow 0.15s, border-color 0.15s;
  }

  .btn-settings:hover {
    background: rgba(0, 229, 255, 0.18);
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.3);
  }

  .settings-icon {
    width: 16px;
    height: 16px;
  }

  .sidebar-module {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 290px;
  }

  .player-card {
    background: rgba(8, 14, 24, 0.96);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 10px;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.15);
  }

  .player-avatar {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #161c26;
    border: 2px solid #00e5ff;
    color: #00e5ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 15px;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.45);
    flex-shrink: 0;
  }

  .avatar-status-dot {
    position: absolute;
    top: -1px;
    right: -1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #2ecc71;
    border: 2px solid #080e18;
  }

  .player-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .player-nick {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .practice-card {
    background: rgba(8, 14, 24, 0.96);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 10px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.15);
  }

  .practice-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .practice-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .solo-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    background: #161c26;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .practice-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: #fff9ef;
    margin: 0;
    letter-spacing: 0.05em;
  }

  .practice-desc {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    line-height: 1.5;
    color: #8fa0b5;
    margin: 0;
  }

  .practice-features {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    color: #dde2f1;
  }

  .practice-features li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cyan-bullet {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #00e5ff;
    flex-shrink: 0;
  }

  .btn-train {
    width: 100%;
    height: 42px;
    margin-top: 4px;
    border-radius: 6px;
    background: #2ecc71;
    border: none;
    color: #05150c;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 0 16px rgba(46, 204, 113, 0.45);
    transition: transform 0.1s, box-shadow 0.15s, background 0.15s;
  }

  .btn-train:hover {
    background: #27ae60;
    box-shadow: 0 0 22px rgba(46, 204, 113, 0.65);
    transform: translateY(-1px);
  }

  .btn-train:active {
    transform: translateY(0);
  }

  /* Password Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 14, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    pointer-events: auto;
  }

  .password-modal-card {
    width: min(90vw, 400px);
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid #00e5ff;
    border-radius: 0.5rem;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.35), inset 0 0 12px rgba(0, 229, 255, 0.15);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    margin: 0;
  }

  .modal-sub {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 13px;
    color: #8fa0b5;
    margin: 0;
  }

  .modal-sub strong {
    color: #00e5ff;
  }

  .modal-password-input {
    width: 100%;
    height: 42px;
    padding: 0 14px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 6px;
    color: #ffffff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .modal-password-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .error-msg {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #ff4757;
    margin: 0;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 6px;
  }

  .modal-cancel-btn {
    padding: 8px 16px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid rgba(143, 160, 181, 0.4);
    color: #8fa0b5;
    font-family: 'Chivo', system-ui, sans-serif;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
  }

  .modal-submit-btn {
    padding: 8px 18px;
    border-radius: 6px;
    background: #00e5ff;
    border: none;
    color: #080e18;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.4);
  }
</style>
