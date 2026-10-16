<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let showEmojiPicker = $state(false);

  const emojiList = ['⚽', '🔥', '⚡', '👑', '💀', '🎯', '🤖', '😎'];

  function handleNicknameChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    gameUI.nickname = val.slice(0, 15);
  }

  function handleAvatarTextChange(e: Event) {
    const val = (e.target as HTMLInputElement).value.toUpperCase().slice(0, 2);
    gameUI.avatarValue = val;
  }

  function selectEmoji(emoji: string) {
    soundFX.playUIClick();
    gameUI.avatarValue = emoji;
    showEmojiPicker = false;
  }

  function toggleMode(isEmoji: boolean) {
    soundFX.playUIClick();
    gameUI.avatarMode = isEmoji ? 'emoji' : 'letters';
    if (isEmoji && gameUI.avatarValue.length > 1 && !emojiList.includes(gameUI.avatarValue)) {
      gameUI.avatarValue = '⚽';
    } else if (!isEmoji && emojiList.includes(gameUI.avatarValue)) {
      gameUI.avatarValue = 'YA';
    }
  }

  function handlePlayClick() {
    soundFX.ensureContext();
    soundFX.playUIClick();
    if (!gameUI.nickname.trim()) {
      gameUI.nickname = 'Player';
    }
    gameUI.navigateTo('LOBBY');
  }
</script>

<div class="gatekeeper-root">
  <!-- Tarjeta Central Flotante -->
  <main class="main-card">
    <!-- Logotipo Oficial Sobresaliendo en el Borde Superior -->
    <div class="logo-wrapper">
      <div class="logo-badge">
        <span class="logo-symbol">⚽</span>
      </div>
    </div>

    <!-- Nombre y Descripción del Juego -->
    <div class="header-text">
      <h1 class="game-title">
        <span>LEGACY</span><span class="cyan-accent">X</span><span>-GO</span>
      </h1>
      <p class="game-subtitle">Clon multijugador 2D P2P en tiempo real</p>
    </div>

    <!-- Formulario / Controles -->
    <div class="form-container">
      <!-- Selector de Nombre -->
      <div class="input-group">
        <label class="group-label" for="nickname-input">NOMBRE DE JUGADOR</label>
        <div class="relative-input">
          <input
            id="nickname-input"
            class="styled-input"
            type="text"
            maxlength="15"
            placeholder="Ingresa tu nickname..."
            value={gameUI.nickname}
            oninput={handleNicknameChange}
          />
          <span class="char-count">{gameUI.nickname.length}/15</span>
        </div>
      </div>

      <!-- Selector de Avatar en Cancha -->
      <div class="input-group">
        <div class="avatar-header">
          <label class="group-label" for="avatar-input">AVATAR EN CANCHA</label>
          <div class="mode-toggle-pill">
            <span class="mode-text">MODO: <strong>{gameUI.avatarMode === 'emoji' ? 'EMOJI' : 'LETRAS'}</strong></span>
            <label class="switch">
              <input
                type="checkbox"
                checked={gameUI.avatarMode === 'emoji'}
                onchange={(e) => toggleMode((e.target as HTMLInputElement).checked)}
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="avatar-controls-row">
          <!-- Preview del Disco -->
          <div class="avatar-disc-preview" title="Renderizado en cancha">
            <span class="avatar-disc-text">{gameUI.avatarValue || 'YA'}</span>
            <div class="status-dot-active" title="Jugador activo"></div>
          </div>

          <!-- Input o Botón de Selección -->
          {#if gameUI.avatarMode === 'letters'}
            <input
              id="avatar-input"
              class="avatar-text-input"
              type="text"
              maxlength="2"
              placeholder="YA"
              value={gameUI.avatarValue}
              oninput={handleAvatarTextChange}
            />
          {:else}
            <div class="emoji-picker-container">
              <button
                type="button"
                class="emoji-active-btn"
                onclick={() => { soundFX.playUIClick(); showEmojiPicker = !showEmojiPicker; }}
                title="Cambiar emoji"
              >
                {gameUI.avatarValue}
              </button>

              {#if showEmojiPicker}
                <div class="emoji-dropdown">
                  {#each emojiList as emoji}
                    <button
                      type="button"
                      class="emoji-choice-btn"
                      onclick={() => selectEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Fila de Telemetría Pre-Partida -->
      <div class="telemetry-row">
        <div class="region-badge">
          <span class="green-dot"></span>
          <span>Región: <strong>{gameUI.selectedRegion}</strong></span>
        </div>
        <div class="ping-badge">
          Ping: {gameUI.pingMs} ms
        </div>
      </div>

      <!-- Botón Principal "JUGAR" -->
      <button
        type="button"
        class="play-btn"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={handlePlayClick}
      >
        <span>JUGAR</span>
        <svg class="play-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </main>
</div>

<style>
  .gatekeeper-root {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    user-select: none;
  }

  .main-card {
    position: relative;
    z-index: 20;
    width: min(92vw, 440px);
    background: rgba(10, 16, 26, 0.96);
    border: 1px solid #00e5ff;
    border-radius: 14px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.25);
    padding: 24px;
    padding-top: 0;
    pointer-events: auto;
  }

  .logo-wrapper {
    display: flex;
    justify-content: center;
    margin-top: -46px;
    margin-bottom: 8px;
    pointer-events: none;
  }

  .logo-badge {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    border: 2px solid #00e5ff;
    background: #0a101a;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.55);
  }

  .logo-symbol {
    font-size: 42px;
    filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.7));
  }

  .header-text {
    text-align: center;
    margin-bottom: 20px;
  }

  .game-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #ffffff;
    margin: 0;
  }

  .cyan-accent {
    color: #00e5ff;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.6);
  }

  .game-subtitle {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    color: #8fa0b5;
    margin-top: 4px;
  }

  .form-container {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .group-label {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(0, 229, 255, 0.85);
    margin-bottom: 6px;
  }

  .relative-input {
    position: relative;
    width: 100%;
  }

  .styled-input {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 8px;
    color: #ffffff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .styled-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .char-count {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: rgba(0, 229, 255, 0.5);
  }

  .avatar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .avatar-header .group-label {
    margin-bottom: 0;
  }

  .mode-toggle-pill {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #8fa0b5;
  }

  .mode-text strong {
    color: #00e5ff;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 34px;
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
    background-color: #0e1726;
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 20px;
    transition: 0.2s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 12px;
    width: 12px;
    left: 2px;
    bottom: 2px;
    background-color: #00e5ff;
    border-radius: 50%;
    transition: 0.2s;
  }

  input:checked + .slider {
    background-color: rgba(0, 229, 255, 0.25);
    border-color: #00e5ff;
  }

  input:checked + .slider:before {
    transform: translateX(16px);
    box-shadow: 0 0 8px #00e5ff;
  }

  .avatar-controls-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .avatar-disc-preview {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #1b2234;
    border: 2px solid #00e5ff;
    color: #00e5ff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.45);
    flex-shrink: 0;
  }

  .status-dot-active {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2ecc71;
    border: 2px solid #080d16;
  }

  .avatar-text-input {
    flex: 1;
    height: 44px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 8px;
    color: #ffffff;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.15em;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .avatar-text-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .emoji-picker-container {
    position: relative;
    flex: 1;
  }

  .emoji-active-btn {
    width: 100%;
    height: 44px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 8px;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, background-color 0.15s;
  }

  .emoji-active-btn:hover {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.08);
  }

  .emoji-dropdown {
    position: absolute;
    bottom: 52px;
    left: 0;
    right: 0;
    background: #0a101a;
    border: 1px solid #00e5ff;
    border-radius: 8px;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.3);
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    z-index: 50;
  }

  .emoji-choice-btn {
    background: #0e1726;
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 6px;
    font-size: 20px;
    padding: 6px;
    cursor: pointer;
    transition: transform 0.1s, background-color 0.15s;
  }

  .emoji-choice-btn:hover {
    background: rgba(0, 229, 255, 0.25);
    transform: scale(1.1);
  }

  .telemetry-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 0 4px;
  }

  .region-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #8fa0b5;
  }

  .region-badge strong {
    color: #ffffff;
  }

  .green-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #2ecc71;
    box-shadow: 0 0 6px #2ecc71;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.9); }
  }

  .ping-badge {
    color: #00e5ff;
    font-weight: 600;
  }

  .play-btn {
    width: 100%;
    height: 48px;
    background: #2ecc71;
    border: none;
    border-radius: 8px;
    color: #07170e;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.08em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 0 16px rgba(46, 204, 113, 0.45);
    transition: transform 0.1s, box-shadow 0.15s, background-color 0.15s;
  }

  .play-btn:hover {
    background: #27ae60;
    box-shadow: 0 0 22px rgba(46, 204, 113, 0.7);
    transform: translateY(-1px);
  }

  .play-btn:active {
    transform: translateY(0);
  }

  .play-icon {
    width: 18px;
    height: 18px;
  }
</style>
