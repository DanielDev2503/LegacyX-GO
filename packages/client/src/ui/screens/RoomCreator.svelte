<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let roomName = $state('Torneo Pro 3v3');
  let playerCount = $state(6);
  let isPasswordProtected = $state(false);
  let roomPassword = $state('');
  let isPublic = $state(true);
  let selectedTimeMinutes = $state(3);
  let selectedGoalsLimit = $state(3);
  let selectedStadiumIndex = $state(0);

  const stadiums = [
    { name: 'AF 3v3 Official', dims: '60x35m', desc: 'Canónico Haxball 3v3' },
    { name: 'Classic Pitch', dims: '55x30m', desc: 'Campo Clásico Estándar' },
    { name: 'Big Pitch', dims: '80x45m', desc: 'Gran Estadio 4v4 / 5v5' },
    { name: 'Small Field', dims: '40x22m', desc: 'Cancha Reducida 1v1 / 2v2' }
  ];

  function decreasePlayers() {
    soundFX.playUIClick();
    if (playerCount > 2) playerCount -= 2;
  }

  function increasePlayers() {
    soundFX.playUIClick();
    if (playerCount < 12) playerCount += 2;
  }

  function cycleTimeLimit() {
    soundFX.playUIClick();
    const times = [1, 3, 5, 7, 10];
    const idx = times.indexOf(selectedTimeMinutes);
    selectedTimeMinutes = times[(idx + 1) % times.length];
  }

  function cycleGoalsLimit() {
    soundFX.playUIClick();
    const goals = [1, 3, 5, 7, 10];
    const idx = goals.indexOf(selectedGoalsLimit);
    selectedGoalsLimit = goals[(idx + 1) % goals.length];
  }

  function cycleStadium() {
    soundFX.playUIClick();
    selectedStadiumIndex = (selectedStadiumIndex + 1) % stadiums.length;
  }

  function handleCreateRoom() {
    soundFX.playUIClick();
    const activeStadium = stadiums[selectedStadiumIndex].name;
    gameUI.createRoomAndLaunch(roomName, activeStadium, playerCount, isPasswordProtected);
  }
</script>

<div class="creator-root">
  <!-- Top Navigation Header -->
  <header class="top-header">
    <button
      type="button"
      class="nav-pill-btn"
      onmouseenter={() => soundFX.playUIHover()}
      onclick={() => gameUI.navigateTo('LOBBY')}
    >
      <span class="icon">arrow_back</span>
      <span>LOBBY</span>
    </button>

    <div class="header-branding">
      <span class="brand-title">LEGACY<span class="cyan">X</span>-GO</span>
      <span class="brand-badge">HOST SALA</span>
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
    </div>
  </header>

  <!-- Main Card -->
  <main class="creator-card">
    <div class="card-header">
      <div class="title-with-bar">
        <div class="accent-bar"></div>
        <div>
          <h1 class="card-title">CONFIGURAR SALA DE JUEGO</h1>
          <p class="card-subtitle">Define los accesos, la normativa de partido y el terreno de juego</p>
        </div>
      </div>
    </div>

    <!-- Room Name Input -->
    <div class="input-block">
      <div class="block-header">
        <label class="block-label" for="room-name">NOMBRE DE LA SALA</label>
        <span class="block-hint">MAX 32 CHARS</span>
      </div>
      <input
        id="room-name"
        type="text"
        class="styled-input"
        maxlength="32"
        placeholder="Ej: Torneo Nocturno 3v3..."
        bind:value={roomName}
      />
    </div>

    <!-- Dual Column Grid -->
    <div class="columns-grid">
      <!-- LEFT COLUMN: Access, Capacity & Privacy -->
      <div class="config-column">
        <!-- Player Limit Stepper -->
        <div class="param-row">
          <div class="param-label-row">
            <span class="param-name">LÍMITE DE JUGADORES</span>
            <span class="param-badge">SLOTS RED/BLUE</span>
          </div>
          <div class="stepper-box">
            <button type="button" class="stepper-btn" onclick={decreasePlayers}>−</button>
            <div class="stepper-display">
              <span class="stepper-num">{playerCount}</span>
              <span class="stepper-sub">{playerCount / 2} vs {playerCount / 2} PITCH</span>
            </div>
            <button type="button" class="stepper-btn" onclick={increasePlayers}>+</button>
          </div>
        </div>

        <!-- Password Switch & Input -->
        <div class="param-row">
          <div class="toggle-row">
            <span class="toggle-label">🔒 Proteger con contraseña</span>
            <label class="switch">
              <input
                type="checkbox"
                bind:checked={isPasswordProtected}
                onchange={() => soundFX.playUIClick()}
              />
              <span class="slider"></span>
            </label>
          </div>

          {#if isPasswordProtected}
            <input
              type="password"
              class="styled-sub-input"
              placeholder="Ingresa la clave de acceso..."
              bind:value={roomPassword}
            />
          {/if}
        </div>

        <!-- Public Visibility Switch -->
        <div class="param-row">
          <div class="toggle-row">
            <span class="toggle-label">🌐 Mostrar en lista pública</span>
            <label class="switch">
              <input
                type="checkbox"
                bind:checked={isPublic}
                onchange={() => soundFX.playUIClick()}
              />
              <span class="slider"></span>
            </label>
          </div>
          <p class="param-note">
            Si se desactiva, solo se podrá ingresar mediante enlace P2P directo.
          </p>
        </div>
      </div>

      <!-- RIGHT COLUMN: Match Rules & Stadium Preview -->
      <div class="config-column">
        <!-- Rules Buttons -->
        <div class="param-row">
          <div class="param-label-row">
            <span class="param-name">REGLAS DE PARTIDO</span>
            <span class="param-badge">PARÁMETROS</span>
          </div>
          <div class="rules-grid">
            <button type="button" class="rule-btn" onclick={cycleTimeLimit}>
              <span>⏱ {selectedTimeMinutes} min</span>
              <span class="rule-cycle">▾</span>
            </button>

            <button type="button" class="rule-btn" onclick={cycleGoalsLimit}>
              <span>⚽ {selectedGoalsLimit} goles</span>
              <span class="rule-cycle">▾</span>
            </button>

            <button
              type="button"
              class="rule-btn highlight"
              onclick={() => gameUI.openModal('PHYSICS_MODIFIERS')}
            >
              <span>⚡ Modifiers</span>
              <span class="mod-badge">PHYS_STD</span>
            </button>
          </div>
        </div>

        <!-- Interactive Stadium Selector / Preview -->
        <div
          class="stadium-preview-box"
          tabindex="0"
          role="button"
          onmouseenter={() => soundFX.playUIHover()}
          onclick={cycleStadium}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              cycleStadium();
            }
          }}
          title="Click para cambiar estadio"
        >
          <!-- Tactical Pitch SVG -->
          <svg class="stadium-svg" viewBox="0 0 300 120" preserveAspectRatio="none">
            <rect x="6" y="6" width="288" height="108" fill="none" stroke="#00e5ff" stroke-opacity="0.4" stroke-width="1.5" />
            <line x1="150" y1="6" x2="150" y2="114" stroke="#00e5ff" stroke-opacity="0.4" stroke-width="1.5" />
            <circle cx="150" cy="60" r="28" fill="none" stroke="#00e5ff" stroke-opacity="0.4" stroke-width="1.5" />
            <circle cx="150" cy="60" r="3" fill="#00e5ff" />
            <rect x="6" y="32" width="26" height="56" fill="none" stroke="#00e5ff" stroke-opacity="0.3" stroke-width="1.2" />
            <rect x="268" y="32" width="26" height="56" fill="none" stroke="#00e5ff" stroke-opacity="0.3" stroke-width="1.2" />
          </svg>

          <div class="stadium-top-badge">
            <span>🖱 Click para cambiar mapa ([Ma])</span>
            <span class="mode-tag">2D CYBER PITCH</span>
          </div>

          <div class="stadium-bottom-bar">
            <span class="stadium-name">{stadiums[selectedStadiumIndex].name} ▾</span>
            <div class="stadium-dims-group">
              <span class="stadium-dims">{stadiums[selectedStadiumIndex].dims}</span>
              <span class="status-indicator-green"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Launch CTA -->
    <div class="footer-cta">
      <button
        type="button"
        class="launch-btn"
        onmouseenter={() => soundFX.playUIHover()}
        onclick={handleCreateRoom}
      >
        <span>CREAR SALA Y ENTRAR AL JUEGO</span>
      </button>
    </div>
  </main>
</div>

<style>
  .creator-root {
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

  .creator-card {
    width: min(92vw, 760px);
    background: rgba(10, 16, 26, 0.96);
    border: 1px solid #00e5ff;
    border-radius: 12px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.25);
    padding: 24px;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    pointer-events: auto;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    padding-bottom: 12px;
  }

  .title-with-bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .accent-bar {
    width: 5px;
    height: 32px;
    background: #00e5ff;
    border-radius: 2px;
    box-shadow: 0 0 10px #00e5ff;
  }

  .card-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 19px;
    font-weight: 800;
    color: #c3f5ff;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .card-subtitle {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    color: #8fa0b5;
    margin: 2px 0 0 0;
  }

  .input-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .block-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 0.06em;
  }

  .block-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #8fa0b5;
  }

  .styled-input {
    width: 100%;
    height: 42px;
    padding: 0 14px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    color: #00e5ff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 15px;
    font-weight: 700;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .styled-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.35);
  }

  .columns-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .config-column {
    background: rgba(18, 26, 41, 0.75);
    border: 1px solid rgba(0, 229, 255, 0.18);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
  }

  .param-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .param-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .param-name {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #ffffff;
  }

  .param-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #00e5ff;
  }

  .stepper-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
    padding: 4px 8px;
  }

  .stepper-btn {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    background: #1a202a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .stepper-btn:hover {
    background: #00e5ff;
    color: #080e18;
  }

  .stepper-display {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stepper-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    font-weight: 800;
    color: #00e5ff;
    line-height: 1;
  }

  .stepper-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #8fa0b5;
    margin-top: 2px;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #dde2f1;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 38px;
    height: 20px;
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
    border-radius: 20px;
    transition: 0.2s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 14px;
    width: 14px;
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

  .styled-sub-input {
    width: 100%;
    height: 36px;
    padding: 0 12px;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 6px;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    margin-top: 4px;
  }

  .param-note {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #8fa0b5;
    margin: 2px 0 0 0;
    line-height: 1.3;
  }

  .rules-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .rule-btn {
    height: 36px;
    padding: 0 10px;
    border-radius: 5px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    color: #c3f5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: border-color 0.15s, background 0.15s;
  }

  .rule-btn:hover {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
  }

  .rule-cycle {
    color: #8fa0b5;
    font-size: 12px;
  }

  .rule-btn.highlight {
    grid-column: span 2;
    border-color: rgba(255, 219, 60, 0.4);
    color: #ffe16d;
  }

  .rule-btn.highlight:hover {
    background: rgba(255, 219, 60, 0.15);
    border-color: #ffdb3c;
  }

  .mod-badge {
    font-size: 9px;
    background: #2f3540;
    color: #ffe16d;
    padding: 2px 5px;
    border-radius: 3px;
  }

  .stadium-preview-box {
    position: relative;
    height: 110px;
    border-radius: 8px;
    overflow: hidden;
    background: #092215;
    border: 1px solid rgba(0, 229, 255, 0.3);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 8px 10px;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .stadium-preview-box:hover {
    border-color: #00e5ff;
    box-shadow: 0 0 14px rgba(0, 229, 255, 0.4);
  }

  .stadium-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .stadium-top-badge {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    background: rgba(10, 16, 26, 0.85);
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(0, 229, 255, 0.3);
  }

  .mode-tag {
    color: #8fa0b5;
    font-size: 9px;
  }

  .stadium-bottom-bar {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(10, 16, 26, 0.92);
    border: 1px solid rgba(0, 229, 255, 0.25);
    padding: 4px 8px;
    border-radius: 4px;
  }

  .stadium-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
  }

  .stadium-dims-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stadium-dims {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    background: #1a202a;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .status-indicator-green {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #2ecc71;
  }

  .footer-cta {
    margin-top: 4px;
  }

  .launch-btn {
    width: 100%;
    height: 48px;
    border-radius: 8px;
    background: #2ecc71;
    border: none;
    color: #05150c;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 800;
    font-size: 14px;
    letter-spacing: 0.08em;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(46, 204, 113, 0.45);
    transition: transform 0.1s, box-shadow 0.15s, background 0.15s;
  }

  .launch-btn:hover {
    background: #27ae60;
    box-shadow: 0 0 22px rgba(46, 204, 113, 0.7);
    transform: translateY(-1px);
  }

  .launch-btn:active {
    transform: translateY(0);
  }
</style>
