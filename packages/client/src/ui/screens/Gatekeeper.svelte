<script lang="ts">
  import { gameUI } from "../state/gameUI.svelte.js";
  import { soundFX } from "../../audio/SoundFX.js";
  import { EMOJI_CATALOG } from "../utils/constants.js";

  const emojiList: readonly string[] = EMOJI_CATALOG;

  let isNameValid = $derived(gameUI.nickname.trim().length > 0);
  let hasUserManuallyEditedAvatar = $state(
    Boolean(
      gameUI.avatarMode === "emoji" ||
        (gameUI.avatarValue &&
          gameUI.avatarValue !== gameUI.nickname.trim().slice(0, 2).toUpperCase())
    )
  );

  let effectiveAvatar = $derived(
    gameUI.avatarValue ||
      (!hasUserManuallyEditedAvatar && gameUI.avatarMode === "letters"
        ? gameUI.nickname.trim().slice(0, 2).toUpperCase()
        : "")
  );

  function handleNicknameChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    gameUI.setPlayerNickname(val.slice(0, 25));
    if (!val.trim()) {
      hasUserManuallyEditedAvatar = false;
    }
    if (!hasUserManuallyEditedAvatar && gameUI.avatarMode === "letters") {
      const autoInitials = val.trim().slice(0, 2).toUpperCase();
      gameUI.setPlayerAvatar(autoInitials, "text");
    }
  }

  function handleAvatarTextChange(e: Event) {
    const val = (e.target as HTMLInputElement).value.toUpperCase().slice(0, 2);
    hasUserManuallyEditedAvatar = true;
    gameUI.setPlayerAvatar(val, "text");
  }

  function selectEmoji(emoji: string) {
    soundFX.playUIClick();
    hasUserManuallyEditedAvatar = true;
    gameUI.setPlayerAvatar(emoji, "emoji");
  }

  function toggleMode(isEmoji: boolean) {
    soundFX.playUIClick();
    gameUI.avatarMode = isEmoji ? "emoji" : "letters";
    if (isEmoji) {
      if (!gameUI.avatarValue || !emojiList.includes(gameUI.avatarValue)) {
        hasUserManuallyEditedAvatar = true;
        gameUI.setPlayerAvatar(emojiList[0] || "⚽", "emoji");
      }
    } else {
      if (emojiList.includes(gameUI.avatarValue)) {
        hasUserManuallyEditedAvatar = false;
        const autoInitials = gameUI.nickname.trim().slice(0, 2).toUpperCase();
        gameUI.setPlayerAvatar(autoInitials, "text");
      }
    }
  }

  function handlePlayClick() {
    if (!isNameValid) return;
    soundFX.ensureContext();
    soundFX.playUIClick();
    if (!hasUserManuallyEditedAvatar && !gameUI.avatarValue && gameUI.avatarMode === "letters") {
      gameUI.setPlayerAvatar(gameUI.nickname.trim().slice(0, 2).toUpperCase(), "text");
    }
    gameUI.navigateTo("LOBBY");
  }
</script>

<div class="gatekeeper-root">
  <!-- Tarjeta Central Flotante -->
  <main class="main-card">
    <!-- Logotipo Oficial Circular -->
    <div class="logo-wrapper">
      <div class="logo-badge">
        <img src="/Logo LegacyX-GO.webp" alt="LegacyX-GO" class="logo-image" />
      </div>
    </div>

    <!-- Nombre y Descripción del Juego -->
    <div class="header-text">
      <h1 class="game-title">
        <span>LEGACY</span><span class="cyan-accent">X</span><span>-GO</span>
      </h1>
      <p class="game-subtitle">fútbol multijugador 2D en tiempo real</p>
    </div>

    <!-- Formulario / Controles -->
    <div class="form-container">
      <!-- Selector de Nombre -->
      <div class="input-group">
        <label class="group-label" for="nickname-input">NOMBRE DE JUGADOR</label
        >
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
          <span class="char-count">({gameUI.nickname.length}/25)</span>
        </div>
      </div>

      <!-- Selector de Avatar en Cancha (Estilo Stitch) -->
      <div class="input-group">
        <div class="avatar-header">
          <label class="group-label" for="avatar-input">AVATAR EN CANCHA</label>
          <div
            class="avatar-mode-tabs"
            role="tablist"
            aria-label="Modo de avatar"
          >
            <button
              type="button"
              role="tab"
              aria-selected={gameUI.avatarMode === "letters"}
              class="mode-tab-btn"
              class:active={gameUI.avatarMode === "letters"}
              onclick={() => toggleMode(false)}
            >
              Letras / Números
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={gameUI.avatarMode === "emoji"}
              class="mode-tab-btn"
              class:active={gameUI.avatarMode === "emoji"}
              onclick={() => toggleMode(true)}
            >
              Emojis
            </button>
          </div>
        </div>

        {#if gameUI.avatarMode === "letters"}
          <div class="avatar-controls-row">
            <!-- Preview del Disco -->
            <div class="avatar-disc-preview" title="Renderizado en cancha">
              <span class="avatar-disc-text">{effectiveAvatar}</span>
              <div class="status-dot-active" title="Jugador activo"></div>
            </div>

            <input
              id="avatar-input"
              class="avatar-text-input"
              type="text"
              maxlength="2"
              placeholder={!hasUserManuallyEditedAvatar && gameUI.nickname.trim() ? gameUI.nickname.trim().slice(0, 2).toUpperCase() : "Ej: 10"}
              value={gameUI.avatarValue}
              oninput={handleAvatarTextChange}
            />
          </div>
        {:else}
          <div class="avatar-emoji-block">
            <!-- Preview del Disco -->
            <div class="avatar-disc-preview" title="Renderizado en cancha">
              <span class="avatar-disc-text">{effectiveAvatar}</span>
              <div class="status-dot-active" title="Jugador activo"></div>
            </div>

            <!-- Catálogo cerrado de 10 emojis predeterminados (2x5) -->
            <div class="emoji-grid-catalog">
              {#each emojiList as emoji}
                <button
                  type="button"
                  class="emoji-choice-btn"
                  class:selected={gameUI.avatarValue === emoji}
                  onclick={() => selectEmoji(emoji)}
                >
                  {emoji}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Botón Principal "ENTRAR AL LOBBY" -->
      <button
        type="button"
        class="play-btn"
        disabled={!isNameValid}
        onmouseenter={() => isNameValid && soundFX.playUIHover()}
        onclick={handlePlayClick}
      >
        <span>ENTRAR AL LOBBY</span>
        <svg class="play-icon" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
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
    background-color: #0e141e;
    background: radial-gradient(circle at 50% 30%, #161c26 0%, #0e141e 100%);
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
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid #00e5ff;
    border-radius: 0.5rem;
    box-shadow:
      0 0 24px rgba(0, 229, 255, 0.35),
      inset 0 0 12px rgba(0, 229, 255, 0.15);
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
    border: 1.5px solid rgba(0, 229, 255, 0.45);
    background: #0a101a;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.2);
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
    font-family: "Space Grotesk", system-ui, sans-serif;
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
    font-family: "Chivo", system-ui, sans-serif;
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
    font-family: "JetBrains Mono", monospace;
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
    padding-right: 60px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.5rem;
    color: #ffffff;
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    outline: none;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
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
    font-family: "JetBrains Mono", monospace;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: rgba(0, 229, 255, 0.65);
  }

  .avatar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    gap: 8px;
  }

  .avatar-header .group-label {
    margin-bottom: 0;
  }

  .avatar-mode-tabs {
    display: inline-flex;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.5rem;
    padding: 2px;
    gap: 2px;
  }

  .mode-tab-btn {
    padding: 4px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    font-family: "Chivo", system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #8fa0b5;
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .mode-tab-btn:hover {
    color: #dde2f1;
  }

  .mode-tab-btn.active {
    background: rgba(0, 229, 255, 0.2);
    color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
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
    font-family: "Space Grotesk", system-ui, sans-serif;
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
    border-radius: 0.5rem;
    color: #ffffff;
    text-align: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.15em;
    outline: none;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .avatar-text-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .avatar-emoji-block {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .emoji-grid-catalog {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    flex: 1;
  }

  .emoji-choice-btn {
    height: 38px;
    background: #080d16;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.5rem;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      transform 0.1s,
      border-color 0.15s,
      background-color 0.15s,
      box-shadow 0.15s;
    user-select: none;
  }

  .emoji-choice-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
    transform: scale(1.06);
  }

  .emoji-choice-btn.selected {
    background: rgba(0, 229, 255, 0.25);
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.5);
    transform: scale(1.06);
  }

  .play-btn {
    width: 100%;
    height: 48px;
    background: #00e5ff;
    border: none;
    border-radius: 0.5rem;
    color: #0a101a;
    font-family: "Space Grotesk", system-ui, sans-serif;
    font-weight: 800;
    font-size: 15px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.45);
    transition:
      transform 0.1s,
      box-shadow 0.15s,
      filter 0.15s;
  }

  .play-btn:hover {
    filter: brightness(1.12);
    box-shadow: 0 0 26px rgba(0, 229, 255, 0.75);
    transform: translateY(-1px);
  }

  .play-btn:active {
    transform: scale(0.98);
  }

  .play-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    filter: grayscale(0.8);
    box-shadow: none;
    transform: none;
    pointer-events: none;
  }

  .play-icon {
    width: 18px;
    height: 18px;
  }
</style>
