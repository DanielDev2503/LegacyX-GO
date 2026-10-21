<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { tooltip } from '../actions/tooltip.js';
  import type { GameplayConfig } from '@legacyx/core';

  interface ControlDef {
    key: keyof GameplayConfig;
    label: string;
    sublabel: string;
    min: number;
    max: number;
    step: number;
    defaultVal: number;
    unit?: string;
  }

  const PLAYER_CONTROLS: ControlDef[] = [
    {
      key: 'playerMaxSpeed',
      label: 'Velocidad máxima',
      sublabel: 'Velocidad motriz límite del jugador',
      min: 0.7,
      max: 11.2,
      step: 0.1,
      defaultVal: 2.8,
      unit: 'px/tick'
    },
    {
      key: 'playerAcceleration',
      label: 'Aceleración',
      sublabel: 'Sensibilidad de arranque e inercia',
      min: 0.03,
      max: 0.55,
      step: 0.01,
      defaultVal: 0.11
    },
    {
      key: 'kickStrength',
      label: 'Fuerza de la patada',
      sublabel: 'Impulso balístico transmitido al balón al chutar',
      min: 0.9,
      max: 18.2,
      step: 0.05,
      defaultVal: 4.545
    },
    {
      key: 'kickMargin',
      label: 'Distancia de la patada',
      sublabel: 'Radio de proximidad requerido respecto al balón',
      min: 0.0,
      max: 15.0,
      step: 0.5,
      defaultVal: 4.0,
      unit: 'px'
    },
    {
      key: 'playerRadius',
      label: 'Radio / Tamaño del jugador',
      sublabel: 'Dimensión física del disco del jugador',
      min: 8.0,
      max: 30.0,
      step: 0.5,
      defaultVal: 15.0,
      unit: 'px'
    },
    {
      key: 'playerMass',
      label: 'Masa inercial para colisiones',
      sublabel: 'Peso inercial en choques cuerpo a cuerpo',
      min: 0.1,
      max: 10.0,
      step: 0.1,
      defaultVal: 2.0
    },
    {
      key: 'playerFriction',
      label: 'Fricción del jugador',
      sublabel: 'Desaceleración al soltar teclas de movimiento',
      min: 0.80,
      max: 0.999,
      step: 0.005,
      defaultVal: 0.96
    }
  ];

  const BALL_CONTROLS: ControlDef[] = [
    {
      key: 'ballRadius',
      label: 'Radio / Tamaño del balón',
      sublabel: 'Dimensión física del disco del balón',
      min: 3.0,
      max: 16.0,
      step: 0.2,
      defaultVal: 5.8,
      unit: 'px'
    },
    {
      key: 'ballRestitution',
      label: 'Rebote del balón (Restitución)',
      sublabel: 'Coeficiente elástico en impactos contra paredes y postes',
      min: 0.0,
      max: 1.8,
      step: 0.01,
      defaultVal: 0.50
    },
    {
      key: 'ballMass',
      label: 'Masa inercial del balón',
      sublabel: 'Masa para transferencia de momento y absorción',
      min: 0.1,
      max: 10.0,
      step: 0.1,
      defaultVal: 1.0
    },
    {
      key: 'ballFriction',
      label: 'Fricción del balón',
      sublabel: 'Amortiguamiento y rodadura sobre el césped',
      min: 0.80,
      max: 0.999,
      step: 0.005,
      defaultVal: 0.99
    }
  ];

  const MECHANICS_CONTROLS: ControlDef[] = [
    {
      key: 'boostMultiplier',
      label: 'Multiplicador de velocidad de turbo',
      sublabel: 'Factor de sprint continuo sobre velocidad base',
      min: 1.1,
      max: 4.0,
      step: 0.05,
      defaultVal: 2.0
    },
    {
      key: 'dashDistance',
      label: 'Distancia del dash',
      sublabel: 'Distancia cinemática recorrida en impulso rápido',
      min: 3.75,
      max: 112.5,
      step: 0.25,
      defaultVal: 37.5,
      unit: 'px'
    },
    {
      key: 'staminaRechargeRate',
      label: 'Tasa de recarga de estamina',
      sublabel: 'Porcentaje regenerado por segundo en reposo',
      min: 5.0,
      max: 100.0,
      step: 1.0,
      defaultVal: 25.0,
      unit: '%/s'
    },
    {
      key: 'magnusCurveStrength',
      label: 'Fuerza de curva Magnus',
      sublabel: 'Coeficiente de aceleración centrípeta lateral',
      min: 0.0,
      max: 5.0,
      step: 0.05,
      defaultVal: 1.05
    },
    {
      key: 'dashesPerFullBar',
      label: 'Cantidad de dashes por barra llena',
      sublabel: 'Consumo de estamina por dash (por defecto 2 dashes = 50% por uso)',
      min: 1,
      max: 6,
      step: 1,
      defaultVal: 2,
      unit: 'dashes'
    }
  ];

  function calcPercent(val: number, min: number, max: number): number {
    if (max === min) return 0;
    return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  }

  function getDeltaLeft(val: number, defVal: number, min: number, max: number): number {
    const pVal = calcPercent(val, min, max);
    const pDef = calcPercent(defVal, min, max);
    return Math.min(pVal, pDef);
  }

  function getDeltaWidth(val: number, defVal: number, min: number, max: number): number {
    const pVal = calcPercent(val, min, max);
    const pDef = calcPercent(defVal, min, max);
    return Math.max(0.8, Math.abs(pVal - pDef));
  }

  function handleTabClick(tab: 'player' | 'ball' | 'mechanics') {
    soundFX.playUIClick();
    gameUI.activeModifiersTab = tab;
  }

  function handleSlider(key: keyof GameplayConfig, e: Event, min: number, max: number) {
    if (!gameUI.isHost) return;
    const target = e.target as HTMLInputElement;
    const val = parseFloat(target.value);
    if (!isNaN(val)) {
      const clamped = Math.max(min, Math.min(max, val));
      gameUI.updateGameplayConfig(key, clamped as any);
    }
  }

  function handleNumberInput(key: keyof GameplayConfig, e: Event, min: number, max: number) {
    if (!gameUI.isHost) return;
    const target = e.target as HTMLInputElement;
    if (target.value === '' || target.value === '-') return;
    const val = parseFloat(target.value);
    if (!isNaN(val)) {
      const clamped = Math.max(min, Math.min(max, val));
      gameUI.updateGameplayConfig(key, clamped as any);
    }
  }

  function handleNumberChange(key: keyof GameplayConfig, e: Event, min: number, max: number) {
    if (!gameUI.isHost) return;
    const target = e.target as HTMLInputElement;
    const val = parseFloat(target.value);
    const clamped = isNaN(val) ? min : Math.max(min, Math.min(max, val));
    target.value = String(clamped);
    gameUI.updateGameplayConfig(key, clamped as any);
  }

  function handleToggle(key: 'turboEnabled' | 'dashEnabled' | 'magnusEnabled', e: Event) {
    if (!gameUI.isHost) return;
    const target = e.target as HTMLInputElement;
    soundFX.playUIClick();
    gameUI.updateGameplayConfig(key, target.checked);
  }

  function stepValue(key: keyof GameplayConfig, step: number, min: number, max: number, direction: 1 | -1) {
    if (!gameUI.isHost) return;
    soundFX.playUIClick();
    const current = Number(gameUI.gameplayConfig[key]);
    const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : 1;
    const next = parseFloat((current + direction * step).toFixed(decimals));
    const clamped = Math.max(min, Math.min(max, next));
    gameUI.updateGameplayConfig(key, clamped as any);
  }

  function handleClose() {
    soundFX.playUIClick();
    gameUI.closeOverlay();
  }

  function handleReset() {
    if (!gameUI.isHost) return;
    gameUI.resetGameplayConfigToDefault();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();      handleClose();
      e.stopPropagation();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- Botón flotante exterior minimalista (Top-Left) -->
<button
  type="button"
  class="floating-back-btn"
  onclick={handleClose}
  aria-label="Volver a la pantalla anterior"
  title="Volver [Esc]"
>
  <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
  <span>Volver</span>
</button>

<!-- OVERLAY BACKDROP (Condición #) -->
<div
  class="modal-backdrop"
  role="presentation"
  onclick={handleBackdropClick}
>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modifiers-dialog-title">
    <!-- LEFT SIDEBAR (230px) -->
    <aside class="sidebar">
      <div>
        <!-- Sidebar Header -->
        <div class="sidebar-header">
          <span class="lightning-box">⚡</span>
          <div>
            <h2 id="modifiers-dialog-title" class="main-header">Modificadores de partida</h2>
            <span class="sub-header">Física y Mecánicas</span>
          </div>
        </div>

        <!-- 3 Vertical Navigation Tabs -->
        <nav class="nav-tabs" aria-label="Categorías de modificadores">
          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'player'}
            onclick={() => handleTabClick('player')}
          >
            <span class="tab-icon">🏃</span>
            <span>Variables del Jugador</span>
          </button>

          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'ball'}
            onclick={() => handleTabClick('ball')}
          >
            <span class="tab-icon">⚽</span>
            <span>Variables del Balón</span>
          </button>

          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'mechanics'}
            onclick={() => handleTabClick('mechanics')}
          >
            <span class="tab-icon">⚡</span>
            <span>Variables de Mecánicas</span>
          </button>
        </nav>
      </div>

      <!-- Sidebar Footer: Reset Default -->
      <div class="sidebar-footer">
        <button
          type="button"
          class="reset-btn"
          disabled={!gameUI.isHost}
          onclick={handleReset}
          title={gameUI.isHost ? 'Restablecer constantes de fábrica' : 'Solo anfitriones pueden reiniciar modificadores'}
        >
          <span>↺</span>
          <span>Restablecer por Defecto</span>
        </button>
      </div>
    </aside>

    <!-- RIGHT CONTENT PANEL -->
    <section class="content-panel">
      <!-- Header of current tab -->
      <div class="panel-header">
        <div class="panel-title-row">
          <div class="panel-title-group">
            <span class="cyan-dot"></span>
            <h3 class="panel-title">
              {#if gameUI.activeModifiersTab === 'player'}
                VARIABLES DEL JUGADOR
              {:else if gameUI.activeModifiersTab === 'ball'}
                VARIABLES DEL BALÓN
              {:else}
                VARIABLES DE MECÁNICAS Y HABILIDADES
              {/if}
            </h3>
          </div>
        </div>

        {#if !gameUI.isHost}
          <div class="guest-warning-banner">
            ⚠️ Modo invitado: Solo el anfitrión de la sala puede alterar las variables físicas de la simulación.
          </div>
        {/if}
      </div>

      <!-- Scrollable Modifiers List -->
      <div class="sliders-container">
        <!-- CATEGORY 1: PLAYER -->
        {#if gameUI.activeModifiersTab === 'player'}
          <div class="grid-controls-2col">
            {#each PLAYER_CONTROLS as ctrl (ctrl.key)}
              {@const currentVal = Number(gameUI.gameplayConfig[ctrl.key])}
              <div class="control-item">
                <div class="control-header">
                  <div class="label-with-tooltip">
                    <span class="control-label">{ctrl.label}</span>
                    <div
                      class="info-tooltip-wrapper"
                      tabindex="0"
                      role="button"
                      aria-label="Información sobre {ctrl.label}"
                      use:tooltip={ctrl.sublabel}
                    >
                      <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </div>
                  </div>

                  <div class="number-input-wrap">
                    <input
                      type="number"
                      class="num-input"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={currentVal}
                      disabled={!gameUI.isHost}
                      oninput={(e) => handleNumberInput(ctrl.key, e, ctrl.min, ctrl.max)}
                      onchange={(e) => handleNumberChange(ctrl.key, e, ctrl.min, ctrl.max)}
                    />
                    {#if ctrl.unit}
                      <span class="unit-tag">{ctrl.unit}</span>
                    {/if}
                    <div class="micro-stepper-col">
                      <button
                        type="button"
                        class="micro-step-btn"
                        disabled={!gameUI.isHost || currentVal >= ctrl.max}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, 1)}
                        aria-label="Incrementar {ctrl.label}"
                      >▲</button>
                      <button
                        type="button"
                        class="micro-step-btn"
                        disabled={!gameUI.isHost || currentVal <= ctrl.min}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, -1)}
                        aria-label="Decrementar {ctrl.label}"
                      >▼</button>
                    </div>
                  </div>
                </div>

                <!-- Slider Track con Indicador Rastro / Delta y Marca Por Defecto -->
                <div class="slider-track-wrap">
                  <div class="track-bg"></div>

                  <!-- Marca discreta del valor por defecto (hover/focus) -->
                  <div
                    class="default-dot"
                    style="left: {calcPercent(ctrl.defaultVal, ctrl.min, ctrl.max)}%;"
                    title="Valor por defecto: {ctrl.defaultVal}"
                  ></div>

                  <!-- Rastro / Barra Delta respecto al valor original -->
                  <div
                    class="delta-track-fill"
                    class:positive={currentVal >= ctrl.defaultVal}
                    class:negative={currentVal < ctrl.defaultVal}
                    style="left: {getDeltaLeft(currentVal, ctrl.defaultVal, ctrl.min, ctrl.max)}%; width: {getDeltaWidth(currentVal, ctrl.defaultVal, ctrl.min, ctrl.max)}%;"
                  ></div>

                  <input
                    type="range"
                    class="range-slider"
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={currentVal}
                    disabled={!gameUI.isHost}
                    oninput={(e) => handleSlider(ctrl.key, e, ctrl.min, ctrl.max)}
                  />
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- CATEGORY 2: BALL -->
        {#if gameUI.activeModifiersTab === 'ball'}
          <div class="grid-controls-2col">
            {#each BALL_CONTROLS as ctrl (ctrl.key)}
              {@const currentVal = Number(gameUI.gameplayConfig[ctrl.key])}
              <div class="control-item">
                <div class="control-header">
                  <div class="label-with-tooltip">
                    <span class="control-label">{ctrl.label}</span>
                    <div
                      class="info-tooltip-wrapper"
                      tabindex="0"
                      role="button"
                      aria-label="Información sobre {ctrl.label}"
                      use:tooltip={ctrl.sublabel}
                    >
                      <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </div>
                  </div>

                  <div class="number-input-wrap">
                    <input
                      type="number"
                      class="num-input"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={currentVal}
                      disabled={!gameUI.isHost}
                      oninput={(e) => handleNumberInput(ctrl.key, e, ctrl.min, ctrl.max)}
                      onchange={(e) => handleNumberChange(ctrl.key, e, ctrl.min, ctrl.max)}
                    />
                    {#if ctrl.unit}
                      <span class="unit-tag">{ctrl.unit}</span>
                    {/if}
                    <div class="micro-stepper-col">
                      <button
                        type="button"
                        class="micro-step-btn"
                        disabled={!gameUI.isHost || currentVal >= ctrl.max}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, 1)}
                        aria-label="Incrementar {ctrl.label}"
                      >▲</button>
                      <button
                        type="button"
                        class="micro-step-btn"
                        disabled={!gameUI.isHost || currentVal <= ctrl.min}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, -1)}
                        aria-label="Decrementar {ctrl.label}"
                      >▼</button>
                    </div>
                  </div>
                </div>

                <div class="slider-track-wrap">
                  <div class="track-bg"></div>

                  <div
                    class="default-dot"
                    style="left: {calcPercent(ctrl.defaultVal, ctrl.min, ctrl.max)}%;"
                    title="Valor por defecto: {ctrl.defaultVal}"
                  ></div>

                  <div
                    class="delta-track-fill"
                    class:positive={currentVal >= ctrl.defaultVal}
                    class:negative={currentVal < ctrl.defaultVal}
                    style="left: {getDeltaLeft(currentVal, ctrl.defaultVal, ctrl.min, ctrl.max)}%; width: {getDeltaWidth(currentVal, ctrl.defaultVal, ctrl.min, ctrl.max)}%;"
                  ></div>

                  <input
                    type="range"
                    class="range-slider"
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={currentVal}
                    disabled={!gameUI.isHost}
                    oninput={(e) => handleSlider(ctrl.key, e, ctrl.min, ctrl.max)}
                  />
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- CATEGORY 3: MECHANICS & SKILLS -->
        {#if gameUI.activeModifiersTab === 'mechanics'}
          <div class="grid-controls-2col">
            <!-- Togglers de Habilidades (Fila de 3 switches) -->
            <div class="toggles-panel-card">
              <div class="toggles-row">
                <!-- Toggle 1: Turbo -->
                <label class="toggle-item" class:disabled={!gameUI.isHost}>
                  <div class="toggle-text">
                    <span class="toggle-name">🔥 Turbo</span>
                    <span class="toggle-sub">Sprint con estamina</span>
                  </div>
                  <input
                    type="checkbox"
                    class="sr-only"
                    checked={gameUI.gameplayConfig.turboEnabled}
                    disabled={!gameUI.isHost}
                    onchange={(e) => handleToggle('turboEnabled', e)}
                  />
                  <span class="switch-capsule" class:active={gameUI.gameplayConfig.turboEnabled}>
                    <span class="switch-thumb"></span>
                  </span>
                </label>

                <!-- Toggle 2: Dash -->
                <label class="toggle-item" class:disabled={!gameUI.isHost}>
                  <div class="toggle-text">
                    <span class="toggle-name">⚡ Dash</span>
                    <span class="toggle-sub">Impulso direccional</span>
                  </div>
                  <input
                    type="checkbox"
                    class="sr-only"
                    checked={gameUI.gameplayConfig.dashEnabled}
                    disabled={!gameUI.isHost}
                    onchange={(e) => handleToggle('dashEnabled', e)}
                  />
                  <span class="switch-capsule" class:active={gameUI.gameplayConfig.dashEnabled}>
                    <span class="switch-thumb"></span>
                  </span>
                </label>

                <!-- Toggle 3: Magnus -->
                <label class="toggle-item" class:disabled={!gameUI.isHost}>
                  <div class="toggle-text">
                    <span class="toggle-name">🌀 Magnus</span>
                    <span class="toggle-sub">Curvatura balística</span>
                  </div>
                  <input
                    type="checkbox"
                    class="sr-only"
                    checked={gameUI.gameplayConfig.magnusEnabled}
                    disabled={!gameUI.isHost}
                    onchange={(e) => handleToggle('magnusEnabled', e)}
                  />
                  <span class="switch-capsule" class:active={gameUI.gameplayConfig.magnusEnabled}>
                    <span class="switch-thumb"></span>
                  </span>
                </label>
              </div>
            </div>

            <!-- Sliders de Mecánicas -->
            {#each MECHANICS_CONTROLS as ctrl (ctrl.key)}
              {@const currentVal = Number(gameUI.gameplayConfig[ctrl.key])}
              <div class="control-item">
                <div class="control-header">
                  <div class="label-with-tooltip">
                    <span class="control-label">{ctrl.label}</span>
                    <div
                      class="info-tooltip-wrapper"
                      tabindex="0"
                      role="button"
                      aria-label="Información sobre {ctrl.label}"
                      use:tooltip={ctrl.sublabel}
                    >
                      <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </div>
                  </div>

                  <div class="number-input-wrap">
                    <input
                      type="number"
                      class="num-input"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={currentVal}
                      disabled={!gameUI.isHost}
                      oninput={(e) => handleNumberInput(ctrl.key, e, ctrl.min, ctrl.max)}
                      onchange={(e) => handleNumberChange(ctrl.key, e, ctrl.min, ctrl.max)}
                    />
                    {#if ctrl.unit}
                      <span class="unit-tag">{ctrl.unit}</span>
                    {/if}
                    <div class="micro-stepper-col">
                      <button
                        type="button"
                        class="micro-step-btn"
                        disabled={!gameUI.isHost || currentVal >= ctrl.max}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, 1)}
                        aria-label="Incrementar {ctrl.label}"
                      >▲</button>
                      <button
                        type="button"
                        class="micro-step-btn"
                        disabled={!gameUI.isHost || currentVal <= ctrl.min}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, -1)}
                        aria-label="Decrementar {ctrl.label}"
                      >▼</button>
                    </div>
                  </div>
                </div>

                <div class="slider-track-wrap">
                  <div class="track-bg"></div>

                  <div
                    class="default-dot"
                    style="left: {calcPercent(ctrl.defaultVal, ctrl.min, ctrl.max)}%;"
                    title="Valor por defecto: {ctrl.defaultVal}"
                  ></div>

                  <div
                    class="delta-track-fill"
                    class:positive={currentVal >= ctrl.defaultVal}
                    class:negative={currentVal < ctrl.defaultVal}
                    style="left: {getDeltaLeft(currentVal, ctrl.defaultVal, ctrl.min, ctrl.max)}%; width: {getDeltaWidth(currentVal, ctrl.defaultVal, ctrl.min, ctrl.max)}%;"
                  ></div>

                  <input
                    type="range"
                    class="range-slider"
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={currentVal}
                    disabled={!gameUI.isHost}
                    oninput={(e) => handleSlider(ctrl.key, e, ctrl.min, ctrl.max)}
                  />
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  /* Floating back button outside modal card (top-left) */
  .floating-back-btn {
    position: fixed;
    top: 1.5rem;
    left: 1.5rem;
    z-index: 60;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.15rem;
    background: rgba(10, 16, 26, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 9999px;
    color: #67e8f9;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 12px rgba(0, 229, 255, 0.15);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    pointer-events: auto;
  }

  .floating-back-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    color: #ffffff;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.45), 0 6px 24px rgba(0, 0, 0, 0.6);
    transform: translateY(-1px);
  }

  .floating-back-btn:active {
    transform: scale(0.95);
  }

  .back-arrow-svg {
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
  }

  /* Backdrop Overlay */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 8, 14, 0.85);
    padding: 1.5rem;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
    font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
  }

  /* Main Modal Card */
  .modal-card {
    position: relative;
    width: 100%;
    max-width: 960px;
    height: 680px;
    max-height: 85vh;
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.6);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.35), inset 0 0 12px rgba(0, 229, 255, 0.15);
    pointer-events: auto;
  }

  /* Left Sidebar */
  .sidebar {
    width: 240px;
    height: 100%;
    background: rgba(11, 17, 30, 0.85);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 1.25rem 0.85rem;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    padding: 0.25rem 0.5rem;
  }

  .lightning-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.5rem;
    font-size: 1.15rem;
    color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.2);
  }

  .main-header {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: -0.01em;
  }

  .sub-header {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: #00e5ff;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .nav-tabs {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.75rem 0.9rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    color: #94a3b8;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.825rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #f1f5f9;
  }

  .tab-btn.active {
    background: rgba(0, 229, 255, 0.12);
    border-color: rgba(0, 229, 255, 0.35);
    border-left: 3px solid #00e5ff;
    color: #00e5ff;
    box-shadow: 0 0 15px rgba(0, 229, 255, 0.1);
  }

  .tab-icon {
    font-size: 1.05rem;
  }

  .sidebar-footer {
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.65rem 0.85rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.5rem;
    color: #f87171;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reset-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
    color: #ffffff;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.2);
  }

  .reset-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Right Content Panel */
  .content-panel {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: #0d1526;
    box-sizing: border-box;
    pointer-events: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 229, 255, 0.35) rgba(8, 14, 24, 0.6);
  }

  .content-panel::-webkit-scrollbar,
  .sliders-container::-webkit-scrollbar {
    width: 4px;
  }

  .content-panel::-webkit-scrollbar-track,
  .sliders-container::-webkit-scrollbar-track {
    background: rgba(8, 14, 24, 0.6);
    border-radius: 4px;
  }

  .content-panel::-webkit-scrollbar-thumb,
  .sliders-container::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.35);
    border-radius: 4px;
  }

  .panel-header {
    padding: 1.25rem 1.5rem 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(13, 21, 38, 0.95);
  }

  .panel-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .panel-title-group {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .cyan-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
  }

  .panel-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: -0.01em;
  }


  .guest-warning-banner {
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 0.4rem;
    color: #fbbf24;
    font-size: 0.75rem;
  }

  .sliders-container {
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 229, 255, 0.35) rgba(8, 14, 24, 0.6);
  }

  .grid-controls-2col {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem 1.25rem;
  }

  @media (max-width: 900px) {
    .grid-controls-2col {
      grid-template-columns: 1fr;
    }
  }

  /* Control Item "al aire" */
  .control-item {
    background: rgba(18, 28, 48, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    padding: 0.75rem 0.95rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .control-item:hover,
  .control-item:focus-within {
    border-color: rgba(0, 229, 255, 0.25);
    background: rgba(18, 28, 48, 0.85);
  }

  .control-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    gap: 0.75rem;
  }

  .label-with-tooltip {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .control-label {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.825rem;
    font-weight: 700;
    color: #f1f5f9;
  }

  /* Info Tooltip */
  .info-tooltip-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: help;
    outline: none;
  }

  .info-help-icon {
    width: 0.825rem;
    height: 0.825rem;
    color: #64748b;
    transition: color 0.15s ease, filter 0.15s ease;
  }

  .info-tooltip-wrapper:hover .info-help-icon,
  .info-tooltip-wrapper:focus .info-help-icon {
    color: #00e5ff;
    filter: drop-shadow(0 0 4px rgba(0, 229, 255, 0.5));
  }


  /* Number Input with Cross-Browser Hidden Spinners */
  .number-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(11, 17, 30, 0.85);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.4rem;
    padding: 0.15rem 0.35rem 0.15rem 0.5rem;
  }

  .num-input {
    width: 54px;
    background: transparent;
    border: none;
    color: #00e5ff;
    font-size: 0.825rem;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
    outline: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .num-input::-webkit-inner-spin-button,
  .num-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .num-input:focus {
    color: #ffffff;
  }

  .num-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .unit-tag {
    font-size: 0.65rem;
    color: #64748b;
    font-weight: 600;
    margin-right: 0.15rem;
  }

  /* Micro Steppers */
  .micro-stepper-col {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    margin-left: 0.15rem;
  }

  .micro-step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 0.52rem;
    line-height: 1;
    padding: 1px 2px;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.1s ease;
  }

  .micro-step-btn:hover:not(:disabled) {
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.18);
  }

  .micro-step-btn:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }

  /* Slider Track with Delta Range & Discrete Default Dot */
  .slider-track-wrap {
    position: relative;
    width: 100%;
    height: 24px;
    display: flex;
    align-items: center;
  }

  .track-bg {
    position: absolute;
    left: 0;
    right: 0;
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
  }

  .default-dot {
    position: absolute;
    top: 50%;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 5px #ffffff;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .control-item:hover .default-dot,
  .control-item:focus-within .default-dot,
  .slider-track-wrap:hover .default-dot {
    opacity: 1;
  }

  .delta-track-fill {
    position: absolute;
    height: 5px;
    border-radius: 3px;
    z-index: 1;
    pointer-events: none;
    transition: all 0.05s ease;
  }

  .delta-track-fill.positive {
    background: linear-gradient(90deg, rgba(0, 229, 255, 0.4), #00e5ff);
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
  }

  .delta-track-fill.negative {
    background: linear-gradient(90deg, #f59e0b, rgba(245, 158, 11, 0.4));
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
  }

  .range-slider {
    position: relative;
    width: 100%;
    height: 24px;
    background: transparent;
    appearance: none;
    cursor: pointer;
    z-index: 3;
    outline: none;
    margin: 0;
  }

  .range-slider::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #00e5ff;
    border: 2px solid #0d1526;
    box-shadow: 0 0 8px #00e5ff;
    cursor: pointer;
    transition: transform 0.1s ease, box-shadow 0.1s ease;
  }

  .range-slider::-webkit-slider-thumb:hover {
    transform: scale(1.25);
    box-shadow: 0 0 14px #00e5ff;
  }

  .range-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #00e5ff;
    border: 2px solid #0d1526;
    box-shadow: 0 0 8px #00e5ff;
    cursor: pointer;
  }

  .range-slider:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Toggles Card (Spans full width in 2-col grid) */
  .toggles-panel-card {
    grid-column: 1 / -1;
    background: rgba(18, 28, 48, 0.45);
    border: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 0.5rem;
    padding: 0.85rem 1rem;
    margin-bottom: 0.25rem;
  }

  .toggles-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    background: rgba(11, 17, 30, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 0.5rem;
    padding: 0.75rem 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toggle-item:hover:not(.disabled) {
    background: rgba(0, 229, 255, 0.05);
    border-color: rgba(0, 229, 255, 0.3);
  }

  .toggle-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .toggle-name {
    font-size: 0.82rem;
    font-weight: 700;
    color: #f1f5f9;
  }

  .toggle-sub {
    font-size: 0.68rem;
    color: #64748b;
  }

  .switch-capsule {
    position: relative;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
    transition: background 0.2s ease;
  }

  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .switch-capsule.active {
    background: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .switch-capsule.active .switch-thumb {
    transform: translateX(18px);
    background: #0d1526;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  /* Responsive Adjustments */
  @media (max-width: 768px) {
    .modal-card {
      flex-direction: column;
    }
    .sidebar {
      width: 100%;
      height: auto;
      border-right: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .toggles-row {
      grid-template-columns: 1fr;
    }
  }
</style>
