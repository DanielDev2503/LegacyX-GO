<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let roomName = $state('Torneo Pro 3v3');
  let playerCount = $state(6);
  let isPasswordProtected = $state(false);
  let roomPassword = $state('');
  let isPublic = $state(true);
  let teamsLocked = $state(false);
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
    if (playerCount > 2) playerCount -= 1;
  }

  function increasePlayers() {
    soundFX.playUIClick();
    if (playerCount < 20) playerCount += 1;
  }

  function cycleStadium() {
    soundFX.playUIClick();
    selectedStadiumIndex = (selectedStadiumIndex + 1) % stadiums.length;
  }

  function formatTimeLimit(val: number): string {
    return val === 0 ? '0 (Indefinido)' : `${val} min`;
  }

  function formatGoalsLimit(val: number): string {
    return val === 0 ? '0 (Sin límite)' : `${val} ${val === 1 ? 'gol' : 'goles'}`;
  }

  function handleCreateRoom() {
    soundFX.playUIClick();
    const activeStadium = stadiums[selectedStadiumIndex].name;
    gameUI.createRoomAndLaunch(
      roomName,
      activeStadium,
      playerCount,
      isPasswordProtected,
      teamsLocked,
      roomPassword,
      selectedTimeMinutes,
      selectedGoalsLimit
    );
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
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      <span>Lobby</span>
    </button>
  </header>

  <!-- Main Card -->
  <main class="creator-card">
    <div class="card-header">
      <div class="title-with-bar">
        <div class="accent-bar"></div>
        <div>
          <h1 class="card-title">Ajustes de la sala</h1>
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
            <span class="param-badge">Límite de jugadores</span>
          </div>
          <div class="stepper-box">
            <button type="button" class="stepper-btn" onclick={decreasePlayers}>−</button>
            <div class="stepper-display">
              <span class="stepper-num">{playerCount}</span>
              <span class="stepper-sub">Máximo 20 jugadores</span>
            </div>
            <button type="button" class="stepper-btn" onclick={increasePlayers}>+</button>
          </div>
        </div>

        <!-- Password Switch & Input (Unmasked type="text") -->
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
              type="text"
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
        <!-- Rules Grid -->
        <div class="param-row">
          <div class="param-label-row">
            <span class="param-name">REGLAS DE PARTIDO</span>
            <span class="param-badge">PARÁMETROS</span>
          </div>
          <div class="rules-grid">
            <!-- Time Selector (0 to 15) -->
            <div class="rule-select-box" title="Tiempo de partido">
              <span class="rule-icon">⏱</span>
              <select
                class="rule-select"
                bind:value={selectedTimeMinutes}
                onchange={() => soundFX.playUIClick()}
              >
                {#each Array.from({ length: 16 }, (_, i) => i) as t}
                  <option value={t}>{formatTimeLimit(t)}</option>
                {/each}
              </select>
              <span class="rule-arrow">▾</span>
            </div>

            <!-- Goals Selector (0 to 15) -->
            <div class="rule-select-box" title="Límite de goles">
              <span class="rule-icon">⚽</span>
              <select
                class="rule-select"
                bind:value={selectedGoalsLimit}
                onchange={() => soundFX.playUIClick()}
              >
                {#each Array.from({ length: 16 }, (_, i) => i) as g}
                  <option value={g}>{formatGoalsLimit(g)}</option>
                {/each}
              </select>
              <span class="rule-arrow">▾</span>
            </div>

            <!-- Bloquear Equipos Toggle (A la izquierda de Modificadores) -->
            <button
              type="button"
              class="rule-btn lock-teams-btn"
              class:active-locked={teamsLocked}
              title="Bloquear equipos para que solo el host pueda mover jugadores"
              onclick={() => { soundFX.playUIClick(); teamsLocked = !teamsLocked; }}
            >
              <span class="lock-label">{teamsLocked ? '🔒 Bloqueados' : '🔓 Libres'}</span>
              <span class="lock-tag">{teamsLocked ? 'SOLO HOST' : 'TODOS'}</span>
            </button>

            <!-- Modifiers Button -->
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
          title="Click para cambiar mapa"
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
            <span>🖱 Click para cambiar mapa</span>
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

  .creator-card {
    width: min(94vw, 740px);
    background: rgba(10, 16, 26, 0.96);
    border: 1px solid #00e5ff;
    border-radius: 12px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.25);
    padding: 22px;
    margin: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    padding-bottom: 10px;
  }

  .title-with-bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .accent-bar {
    width: 4px;
    height: 30px;
    background: #00e5ff;
    border-radius: 2px;
    box-shadow: 0 0 10px #00e5ff;
  }

  .card-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 800;
    color: #c3f5ff;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .card-subtitle {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
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
    height: 40px;
    padding: 0 14px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    color: #00e5ff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
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
    gap: 14px;
  }

  .config-column {
    background: rgba(18, 26, 41, 0.75);
    border: 1px solid rgba(0, 229, 255, 0.18);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
    box-sizing: border-box;
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
    transition: background 0.15s, color 0.15s;
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
    font-size: 12px;
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

  .styled-sub-input:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
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

  .rule-select-box {
    position: relative;
    height: 36px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 5px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    box-sizing: border-box;
    transition: border-color 0.15s, background-color 0.15s;
  }

  .rule-select-box:hover {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.08);
  }

  .rule-icon {
    font-size: 13px;
    margin-right: 6px;
  }

  .rule-select {
    flex: 1;
    height: 100%;
    background: transparent;
    border: none;
    color: #c3f5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    outline: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  .rule-select option {
    background: #0a101a;
    color: #ffffff;
  }

  .rule-arrow {
    color: #8fa0b5;
    font-size: 11px;
    pointer-events: none;
    margin-left: 4px;
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
    box-sizing: border-box;
  }

  .rule-btn:hover {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
  }

  .lock-teams-btn.active-locked {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
    color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
  }

  .lock-tag {
    font-size: 9px;
    background: #0e1726;
    color: #00e5ff;
    padding: 2px 5px;
    border-radius: 3px;
  }

  .rule-btn.highlight {
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
    height: 104px;
    border-radius: 8px;
    overflow: hidden;
    background: #092215;
    border: 1px solid rgba(0, 229, 255, 0.3);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 8px 10px;
    box-sizing: border-box;
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
    margin-top: 2px;
  }

  .launch-btn {
    width: 100%;
    height: 46px;
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
    box-shadow: 0 0 22px rgba(46, 204, 113, 0.65);
    transform: translateY(-1px);
  }

  .launch-btn:active {
    transform: translateY(0);
  }
</style>
