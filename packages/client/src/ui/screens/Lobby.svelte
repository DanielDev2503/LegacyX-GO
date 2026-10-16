<script lang="ts">
  import { gameUI, type RoomInfo } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let passwordInput = $state('');
  let passwordError = $state('');

  function handleSearchInput(e: Event) {
    gameUI.roomFilterQuery = (e.target as HTMLInputElement).value;
  }

  function toggleLockFilter() {
    soundFX.playUIClick();
    gameUI.filterLockedOnly = !gameUI.filterLockedOnly;
  }

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
      <span class="icon">arrow_back</span>
      <span>INICIO</span>
    </button>

    <div class="header-branding">
      <span class="brand-title">LEGACY<span class="cyan">X</span>-GO</span>
      <span class="brand-badge">LOBBY P2P</span>
    </div>

    <div class="header-actions">
      <button
        type="button"
        class="icon-btn"
        title="Modificadores de Físicas (#)"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={() => gameUI.openModal('PHYSICS_MODIFIERS')}
      >
        <span class="icon">bolt</span>
      </button>

      <button
        type="button"
        class="icon-btn"
        class:muted={gameUI.isAudioMuted}
        title={gameUI.isAudioMuted ? 'Activar Sonido' : 'Silenciar'}
        onmouseenter={() => soundFX.playUIHover()}
        onclick={() => gameUI.toggleMute()}
      >
        <span class="icon">{gameUI.isAudioMuted ? 'volume_off' : 'volume_up'}</span>
      </button>
    </div>
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
          <span class="online-text">142 Jugadores en línea</span>
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
          class="lock-filter-btn"
          class:active={gameUI.filterLockedOnly}
          title="Filtrar por salas con candado"
          onclick={toggleLockFilter}
        >
          {gameUI.filterLockedOnly ? '🔒' : '🔓'}
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
              <span class="stadium-tag">{room.stadium}</span>
            </div>

            <div class="room-meta">
              <span class="capacity-badge">{room.playersCount} / {room.maxPlayers}</span>
              <div class="ping-indicator">
                <span class="ping-dot"></span>
                <span>{room.ping} ms</span>
              </div>
              <button
                type="button"
                class="join-room-btn"
                class:private={room.isPrivate}
                onmouseenter={() => soundFX.playUIHover()}
                onclick={() => handleJoinRoom(room)}
              >
                ENTRAR
              </button>
            </div>
          </div>
        {:else}
          <div class="empty-rooms">
            No se encontraron salas con el filtro seleccionado.
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
          class="btn-modifiers"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={() => gameUI.openModal('PHYSICS_MODIFIERS')}
        >
          <span class="btn-icon">⚡</span>
          <span>MODIFICADORES [#]</span>
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
          <div class="player-telemetry">
            <span class="telemetry-green-dot"></span>
            <span class="telemetry-ping">{gameUI.pingMs} ms</span>
            <span class="telemetry-sep">•</span>
            <span class="telemetry-region">{gameUI.selectedRegion}</span>
          </div>
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
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 16px 28px;
    box-sizing: border-box;
    pointer-events: none;
    user-select: none;
  }

  .top-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    z-index: 30;
    pointer-events: auto;
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
    transition: background 0.15s, box-shadow 0.15s;
  }

  .nav-pill-btn:hover {
    background: rgba(0, 229, 255, 0.2);
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.45);
  }

  .header-branding {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 20px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.05em;
  }

  .brand-title .cyan {
    color: #00e5ff;
  }

  .brand-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.3);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 700;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(26, 32, 42, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .icon-btn:hover {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
  }

  .icon-btn.muted {
    color: #8fa0b5;
    border-color: rgba(143, 160, 181, 0.3);
  }

  .content-container {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 24px;
    max-width: 1040px;
    width: 100%;
    margin: auto;
    pointer-events: auto;
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
    border-radius: 9999px;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2ecc71;
    box-shadow: 0 0 8px #2ecc71;
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

  .lock-filter-btn {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #8fa0b5;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }

  .lock-filter-btn:hover, .lock-filter-btn.active {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    color: #00e5ff;
  }

  .room-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .stadium-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #8fa0b5;
    background: #0e141e;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
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

  .ping-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #2ecc71;
    width: 60px;
  }

  .ping-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #2ecc71;
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
    text-align: center;
    padding: 40px 10px;
    color: #8fa0b5;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 13px;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
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

  .btn-modifiers {
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
    gap: 6px;
    transition: background 0.15s, box-shadow 0.15s;
  }

  .btn-modifiers:hover {
    background: rgba(0, 229, 255, 0.18);
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.3);
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

  .player-telemetry {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    margin-top: 2px;
  }

  .telemetry-green-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #2ecc71;
  }

  .telemetry-ping {
    color: #2ecc71;
    font-weight: 600;
  }

  .telemetry-sep {
    color: #8fa0b5;
  }

  .telemetry-region {
    color: #8fa0b5;
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
    background: rgba(5, 8, 17, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    pointer-events: auto;
  }

  .password-modal-card {
    width: min(90vw, 400px);
    background: rgba(10, 16, 26, 0.98);
    border: 1px solid #00e5ff;
    border-radius: 12px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.35);
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
