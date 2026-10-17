<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let showEmojiPicker = $state(false);
  let emojiInputRef = $state<HTMLInputElement | null>(null);

  const emojiList = ['⚽', '🔥', '⚡', '👑', '💀', '🎯', '🤖', '😎'];

  function handleNicknameChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    gameUI.nickname = val.slice(0, 25);
  }

  function handleAvatarTextChange(e: Event) {
    const val = (e.target as HTMLInputElement).value.toUpperCase().slice(0, 2);
    gameUI.avatarValue = val;
  }

  function handleEmojiInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    if (!val) return;
    let char = '';
    if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
      const segmenter = new (Intl as any).Segmenter('es', { granularity: 'grapheme' });
      const iterator = segmenter.segment(val)[Symbol.iterator]();
      char = iterator.next().value?.segment || val.slice(0, 2);
    } else {
      char = Array.from(val)[0] || val.slice(0, 2);
    }
    gameUI.avatarValue = char;
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

  function handleModeToggle(e: Event) {
    const input = e.target as HTMLInputElement | null;
    if (input) {
      toggleMode(input.checked);
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
    <!-- Logotipo Oficial Circular -->
    <div class="logo-wrapper">
      <div class="logo-badge">
        <img
          src="/Logo LegacyX-GO.webp"
          alt="LegacyX-GO"
          class="logo-image"
        />
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
            maxlength="25"
            placeholder="Ingresa tu nickname..."
            value={gameUI.nickname}
            oninput={handleNicknameChange}
          />
          <span class="char-count">{gameUI.nickname.length}/25</span>
        </div>
      </div>

      <!-- Selector de Avatar en Cancha (Estilo Stitch) -->
      <div class="input-group">
        <div class="avatar-header">
          <label class="group-label" for="avatar-input">AVATAR EN CANCHA</label>
          <div class="mode-toggle-pill">
            <span class="mode-text">MODO: <strong>{gameUI.avatarMode === 'emoji' ? 'EMOJI' : 'LETRAS'}</strong></span>
            <label class="switch">
              <input
                type="checkbox"
                checked={gameUI.avatarMode === 'emoji'}
                onchange={handleModeToggle}
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

          <!-- Modo Letras vs Emoji con soporte nativo de sistema -->
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
              <div class="emoji-input-wrapper">
                <input
                  id="avatar-input"
                  bind:this={emojiInputRef}
                  class="avatar-emoji-input"
                  type="text"
                  placeholder="😀"
                  value={gameUI.avatarValue}
                  oninput={handleEmojiInput}
                  title="Escribe cualquier emoji o presiona Win + . para el selector del sistema"
                />
                <button
                  type="button"
                  class="emoji-toggle-dropdown-btn"
                  onclick={() => { soundFX.playUIClick(); showEmojiPicker = !showEmojiPicker; }}
                  title="Ver sugerencias rápidas de emojis"
                >
                  ▾
                </button>
              </div>

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

      <!-- Fila de Telemetría Pre-Partida (Región y Ping reales) -->
      <div class="telemetry-row">
        <div class="region-badge">
          <span class="green-dot"></span>
          <span>Región: <strong>{gameUI.realRegion}</strong></span>
        </div>
        <div class="ping-badge">
          Ping: {gameUI.realPing !== null ? `${gameUI.realPing} ms` : 'Calculando...'}
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
    position: fixed;
    inset: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background-color: #0b111e;
    background: radial-gradient(circle at 50% 30%, #111a2e 0%, #070b14 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
    pointer-events: auto;
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
    box-sizing: border-box;
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
    overflow: hidden;
    aspect-ratio: 1;
    flex-shrink: 0;
  }

  .logo-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    display: block;
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
    padding-right: 50px;
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

  .emoji-input-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    height: 44px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 8px;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .emoji-input-wrapper:focus-within {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .avatar-emoji-input {
    flex: 1;
    height: 100%;
    background: transparent;
    border: none;
    color: #ffffff;
    text-align: center;
    font-size: 20px;
    outline: none;
    padding: 0 8px;
    box-sizing: border-box;
  }

  .emoji-toggle-dropdown-btn {
    width: 32px;
    height: 100%;
    background: transparent;
    border: none;
    border-left: 1px solid rgba(0, 229, 255, 0.2);
    color: #8fa0b5;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background-color 0.15s;
  }

  .emoji-toggle-dropdown-btn:hover {
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
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
