<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { tooltip } from '../actions/tooltip.js';
  import {
    DEFAULT_GAMEPLAY_CONFIG,
    GAMEPLAY_CONFIG_LIMITS,
    GAMEPLAY_PRESETS,
    type GameplayConfig,
    type GameplayPreset,
    type GameplayPresetId
  } from '@legacyx/core';

  interface ControlDef {
    key: keyof GameplayConfig;
    label: string;
    sublabel: string;
    min: number;
    max: number;
    step: number;
    defaultVal: number;
    unit?: string;
    parentToggle?: 'turboEnabled' | 'dashEnabled' | 'magnusEnabled' | 'staminaRegenMoving';
  }

  const PLAYER_CONTROLS: ControlDef[] = [
    {
      key: 'playerMaxSpeed',
      label: 'Velocidad máxima',
      sublabel: 'Velocidad motriz límite del jugador',
      min: 0.7,
      max: 11.2,
      step: 0.1,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.playerMaxSpeed,
      unit: 'px/tick'
    },
    {
      key: 'playerAcceleration',
      label: 'Aceleración',
      sublabel: 'Sensibilidad de arranque e inercia',
      min: 0.03,
      max: 0.55,
      step: 0.01,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.playerAcceleration
    },
    {
      key: 'kickStrength',
      label: 'Fuerza de la patada',
      sublabel: 'Impulso balístico transmitido al balón al chutar',
      min: 0.9,
      max: 18.2,
      step: 0.05,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.kickStrength
    },
    {
      key: 'kickMargin',
      label: 'Distancia de la patada',
      sublabel: 'Radio de proximidad requerido respecto al balón',
      min: 0.0,
      max: 15.0,
      step: 0.5,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.kickMargin,
      unit: 'px'
    },
    {
      key: 'playerRadius',
      label: 'Radio / Tamaño del jugador',
      sublabel: 'Dimensión física del disco del jugador',
      min: 8.0,
      max: 30.0,
      step: 0.5,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.playerRadius,
      unit: 'px'
    },
    {
      key: 'playerMass',
      label: 'Masa inercial para colisiones',
      sublabel: 'Peso inercial en choques cuerpo a cuerpo',
      min: 0.1,
      max: 10.0,
      step: 0.1,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.playerMass
    },
    {
      key: 'playerFriction',
      label: 'Fricción del jugador',
      sublabel: 'Desaceleración al soltar teclas de movimiento',
      min: 0.80,
      max: 0.999,
      step: 0.005,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.playerFriction
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
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.ballRadius,
      unit: 'px'
    },
    {
      key: 'ballRestitution',
      label: 'Rebote del balón (Restitución)',
      sublabel: 'Coeficiente elástico en impactos contra paredes y postes',
      min: 0.0,
      max: 1.8,
      step: 0.01,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.ballRestitution
    },
    {
      key: 'ballMass',
      label: 'Masa inercial del balón',
      sublabel: 'Masa para transferencia de momento y absorción',
      min: 0.1,
      max: 10.0,
      step: 0.1,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.ballMass
    },
    {
      key: 'ballFriction',
      label: 'Fricción del balón',
      sublabel: 'Amortiguamiento y rodadura sobre el césped',
      min: 0.80,
      max: 0.999,
      step: 0.005,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.ballFriction
    }
  ];

  const MECHANICS_CONTROLS: ControlDef[] = [
    {
      key: 'boostMultiplier',
      label: 'Multiplicador de velocidad de turbo',
      sublabel: 'Factor de sprint continuo sobre velocidad base',
      min: GAMEPLAY_CONFIG_LIMITS.boostMultiplier.min,
      max: GAMEPLAY_CONFIG_LIMITS.boostMultiplier.max,
      step: GAMEPLAY_CONFIG_LIMITS.boostMultiplier.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.boostMultiplier,
      parentToggle: 'turboEnabled'
    },
    {
      key: 'turboStaminaDrain',
      label: 'Consumo de estamina del turbo',
      sublabel: 'Porcentaje de estamina que drena el Turbo por segundo al esprintar',
      min: GAMEPLAY_CONFIG_LIMITS.turboStaminaDrain.min,
      max: GAMEPLAY_CONFIG_LIMITS.turboStaminaDrain.max,
      step: GAMEPLAY_CONFIG_LIMITS.turboStaminaDrain.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.turboStaminaDrain,
      unit: '%/s',
      parentToggle: 'turboEnabled'
    },
    {
      key: 'dashDistance',
      label: 'Distancia del dash',
      sublabel: 'Distancia cinemática recorrida en impulso rápido (7 ticks con Estela)',
      min: GAMEPLAY_CONFIG_LIMITS.dashDistance.min,
      max: GAMEPLAY_CONFIG_LIMITS.dashDistance.max,
      step: GAMEPLAY_CONFIG_LIMITS.dashDistance.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.dashDistance,
      unit: 'px',
      parentToggle: 'dashEnabled'
    },
    {
      key: 'dashCooldown',
      label: 'Enfriamiento de Dash (Cooldown)',
      sublabel: 'Tiempo mínimo de espera entre impulsos Dash',
      min: GAMEPLAY_CONFIG_LIMITS.dashCooldown.min,
      max: GAMEPLAY_CONFIG_LIMITS.dashCooldown.max,
      step: GAMEPLAY_CONFIG_LIMITS.dashCooldown.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.dashCooldown,
      unit: 's',
      parentToggle: 'dashEnabled'
    },
    {
      key: 'dashStaminaCost',
      label: 'Porcentaje de estamina que consume el dash',
      sublabel: 'Porcentaje de la barra de estamina consumido al ejecutar un Dash',
      min: GAMEPLAY_CONFIG_LIMITS.dashStaminaCost.min,
      max: GAMEPLAY_CONFIG_LIMITS.dashStaminaCost.max,
      step: GAMEPLAY_CONFIG_LIMITS.dashStaminaCost.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.dashStaminaCost,
      unit: '%',
      parentToggle: 'dashEnabled'
    },
    {
      key: 'staminaRechargeDelay',
      label: 'Espera inmóvil para recarga',
      sublabel: 'Segundos sin movimiento, Turbo ni Dash antes de empezar a recargar estamina (patear no reinicia esta espera)',
      min: GAMEPLAY_CONFIG_LIMITS.staminaRechargeDelay.min,
      max: GAMEPLAY_CONFIG_LIMITS.staminaRechargeDelay.max,
      step: GAMEPLAY_CONFIG_LIMITS.staminaRechargeDelay.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.staminaRechargeDelay,
      unit: 's'
    },
    {
      key: 'staminaRechargeRate',
      label: 'Tasa de recarga de estamina',
      sublabel: 'Porcentaje base regenerado por segundo',
      min: GAMEPLAY_CONFIG_LIMITS.staminaRechargeRate.min,
      max: GAMEPLAY_CONFIG_LIMITS.staminaRechargeRate.max,
      step: GAMEPLAY_CONFIG_LIMITS.staminaRechargeRate.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.staminaRechargeRate,
      unit: '%/s'
    },
    {
      key: 'staminaRegenMovingRate',
      label: 'Velocidad de recarga en movimiento',
      sublabel: 'Porcentaje relativo de recarga al desplazarse sin usar Turbo (0% - 200%, defecto 25%)',
      min: GAMEPLAY_CONFIG_LIMITS.staminaRegenMovingRate.min,
      max: GAMEPLAY_CONFIG_LIMITS.staminaRegenMovingRate.max,
      step: GAMEPLAY_CONFIG_LIMITS.staminaRegenMovingRate.step,
      defaultVal: 25,
      unit: '%',
      parentToggle: 'staminaRegenMoving'
    },
    {
      key: 'magnusCurveStrength',
      label: 'Fuerza de curva Magnus',
      sublabel: 'Coeficiente de aceleración centrípeta lateral',
      min: GAMEPLAY_CONFIG_LIMITS.magnusCurveStrength.min,
      max: GAMEPLAY_CONFIG_LIMITS.magnusCurveStrength.max,
      step: GAMEPLAY_CONFIG_LIMITS.magnusCurveStrength.step,
      defaultVal: DEFAULT_GAMEPLAY_CONFIG.magnusCurveStrength,
      parentToggle: 'magnusEnabled'
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

  function isPresetActive(preset: GameplayPreset): boolean {
    const cfg = gameUI.gameplayConfig;
    return (Object.keys(preset.config) as Array<keyof GameplayConfig>).every((k) => {
      const a = cfg[k];
      const b = preset.config[k];
      if (typeof a === 'number' && typeof b === 'number') {
        return Math.abs(a - b) < 1e-4;
      }
      return a === b;
    });
  }

  const PRESET_LIST: readonly GameplayPreset[] = Object.values(GAMEPLAY_PRESETS);

  let activePresetId = $derived<GameplayPresetId | 'custom'>(
    PRESET_LIST.find((p) => isPresetActive(p))?.id ?? 'custom'
  );

  function handleApplyPreset(presetId: GameplayPresetId) {
    if (!gameUI.isHost) return;
    gameUI.applyGameplayPreset(presetId);
  }

  function handleTabClick(tab: 'presets' | 'player' | 'ball' | 'mechanics') {
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

  function handleToggle(
    key: 'turboEnabled' | 'dashEnabled' | 'magnusEnabled' | 'staminaRegenMoving',
    e: Event
  ) {
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
    gameUI.updateGameplayConfig('staminaRegenMoving', false);
    gameUI.updateGameplayConfig('staminaRegenMovingRate', 25);
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

<!-- OVERLAY BACKDROP (Condición #) -->
<div
  class="modal-backdrop"
  role="presentation"
  onclick={handleBackdropClick}
>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modifiers-dialog-title">
    <!-- LEFT SIDEBAR -->
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="sidebar-back-row">
          <button
            type="button"
            class="header-back-btn"
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
        </div>
        <!-- Sidebar Header -->
        <div class="sidebar-header">
          <span class="lightning-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#00e5ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </span>
          <div>
            <h2 id="modifiers-dialog-title" class="main-header">Modificadores de partida</h2>
            <span class="sub-header">Física y Mecánicas</span>
          </div>
        </div>

        <!-- 4 Vertical Navigation Tabs -->
        <nav class="nav-tabs" aria-label="Categorías de modificadores">
          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'presets'}
            onclick={() => handleTabClick('presets')}
          >
            <span class="tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </span>
            <span>Presets de Física</span>
          </button>

          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'player'}
            onclick={() => handleTabClick('player')}
          >
            <span class="tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </span>
            <span>Variables del Jugador</span>
          </button>

          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'ball'}
            onclick={() => handleTabClick('ball')}
          >
            <span class="tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <polygon points="12 8 15 10.5 14 14 10 14 9 10.5" />
              </svg>
            </span>
            <span>Variables del Balón</span>
          </button>

          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'mechanics'}
            onclick={() => handleTabClick('mechanics')}
          >
            <span class="tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
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
              {#if gameUI.activeModifiersTab === 'presets'}
                PRESETS DE JUGABILIDAD
              {:else if gameUI.activeModifiersTab === 'player'}
                VARIABLES DEL JUGADOR
              {:else if gameUI.activeModifiersTab === 'ball'}
                VARIABLES DEL BALÓN
              {:else}
                VARIABLES DE MECÁNICAS Y HABILIDADES
              {/if}
            </h3>
          </div>
          {#if activePresetId === 'custom'}
            <span class="preset-status-chip is-custom">Configuración Personalizada</span>
          {/if}
        </div>

        {#if !gameUI.isHost}
          <div class="guest-warning-banner">
            Modo lectura: Solo el anfitrión de la sala puede alterar las variables físicas de la simulación.
          </div>
        {/if}
      </div>

      <!-- Scrollable Modifiers List -->
      <div class="sliders-container">
        {#if gameUI.activeModifiersTab === 'presets'}
          <div class="presets-grid">
            {#each PRESET_LIST as preset (preset.id)}
              {@const selected = activePresetId === preset.id}
              <button
                type="button"
                class="preset-card"
                class:is-selected={selected}
                disabled={!gameUI.isHost}
                onclick={() => handleApplyPreset(preset.id)}
              >
                <div class="preset-card-top">
                  <div class="preset-title-wrap">
                    <strong class="preset-title">{preset.name}</strong>
                    <span class="preset-badge">{preset.badge}</span>
                  </div>
                  {#if selected}
                    <span class="preset-active-pill">ACTIVO</span>
                  {/if}
                </div>
                <p class="preset-desc">{preset.description}</p>
                <div class="preset-metrics">
                  <span>Vel: {preset.config.playerMaxSpeed}</span>
                  <span>Patada: {preset.config.kickStrength}</span>
                  <span>Balón: {preset.config.ballRadius}px</span>
                  <span>Dash: {preset.config.dashDistance}px</span>
                  <span>Espera estamina: {preset.config.staminaRechargeDelay}s</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}

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
                <div class="slider-stepper-row">
                  <button
                    type="button"
                    class="touch-step-btn"
                    disabled={!gameUI.isHost || currentVal <= ctrl.min}
                    onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, -1)}
                    aria-label="Reducir {ctrl.label}"
                  >-</button>

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

                  <button
                    type="button"
                    class="touch-step-btn"
                    disabled={!gameUI.isHost || currentVal >= ctrl.max}
                    onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, 1)}
                    aria-label="Aumentar {ctrl.label}"
                  >+</button>
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

                <div class="slider-stepper-row">
                  <button
                    type="button"
                    class="touch-step-btn"
                    disabled={!gameUI.isHost || currentVal <= ctrl.min}
                    onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, -1)}
                    aria-label="Reducir {ctrl.label}"
                  >-</button>

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

                  <button
                    type="button"
                    class="touch-step-btn"
                    disabled={!gameUI.isHost || currentVal >= ctrl.max}
                    onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, 1)}
                    aria-label="Aumentar {ctrl.label}"
                  >+</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- CATEGORY 3: MECHANICS & SKILLS -->
        {#if gameUI.activeModifiersTab === 'mechanics'}
          <div class="grid-controls-2col">
            <!-- Togglers de Habilidades (Rejilla de 4 switches) -->
            <div class="toggles-panel-card">
              <div class="toggles-row">
                <!-- Toggle 1: Turbo -->
                <label class="toggle-item" class:disabled={!gameUI.isHost}>
                  <div class="toggle-text">
                    <span class="toggle-name">Turbo</span>
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
                    <span class="toggle-name">Dash (Estela)</span>
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
                    <span class="toggle-name">Magnus</span>
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

                <!-- Toggle 4: Recarga de Estamina en Movimiento -->
                <label class="toggle-item" class:disabled={!gameUI.isHost}>
                  <div class="toggle-text">
                    <span class="toggle-name">Estamina en Movimiento</span>
                    <span class="toggle-sub">Recargar al desplazarse</span>
                  </div>
                  <input
                    type="checkbox"
                    class="sr-only"
                    checked={gameUI.gameplayConfig.staminaRegenMoving}
                    disabled={!gameUI.isHost}
                    onchange={(e) => handleToggle('staminaRegenMoving', e)}
                  />
                  <span class="switch-capsule" class:active={gameUI.gameplayConfig.staminaRegenMoving}>
                    <span class="switch-thumb"></span>
                  </span>
                </label>
              </div>
            </div>

            <!-- Sliders de Mecánicas -->
            {#each MECHANICS_CONTROLS as ctrl (ctrl.key)}
              {@const currentVal = Number(gameUI.gameplayConfig[ctrl.key])}
              {@const isParentDisabled = ctrl.parentToggle ? !gameUI.gameplayConfig[ctrl.parentToggle] : false}
              <div class="control-item" class:slider-disabled={isParentDisabled}>
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
                      disabled={!gameUI.isHost || isParentDisabled}
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
                        disabled={!gameUI.isHost || isParentDisabled || currentVal >= ctrl.max}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, 1)}
                        aria-label="Incrementar {ctrl.label}"
                      >▲</button>
                      <button
                        type="button"
                        class="micro-step-btn"
                        disabled={!gameUI.isHost || isParentDisabled || currentVal <= ctrl.min}
                        onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, -1)}
                        aria-label="Decrementar {ctrl.label}"
                      >▼</button>
                    </div>
                  </div>
                </div>

                <div class="slider-stepper-row">
                  <button
                    type="button"
                    class="touch-step-btn"
                    disabled={!gameUI.isHost || isParentDisabled || currentVal <= ctrl.min}
                    onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, -1)}
                    aria-label="Reducir {ctrl.label}"
                  >-</button>

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
                      disabled={!gameUI.isHost || isParentDisabled}
                      oninput={(e) => handleSlider(ctrl.key, e, ctrl.min, ctrl.max)}
                    />
                  </div>

                  <button
                    type="button"
                    class="touch-step-btn"
                    disabled={!gameUI.isHost || isParentDisabled || currentVal >= ctrl.max}
                    onclick={() => stepValue(ctrl.key, ctrl.step, ctrl.min, ctrl.max, 1)}
                    aria-label="Aumentar {ctrl.label}"
                  >+</button>
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
  /* Integrated Back Button (Zero overlap on PC & Mobile) */
  .sidebar-top {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .sidebar-back-row {
    display: flex;
    align-items: center;
    margin-bottom: 0.65rem;
  }

  .header-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.42rem 0.85rem;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 9999px;
    color: #67e8f9;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    flex-shrink: 0;
  }

  .header-back-btn:hover {
    background: rgba(0, 229, 255, 0.16);
    border-color: #00e5ff;
    color: #ffffff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.35);
  }

  .header-back-btn:active {
    transform: scale(0.95);
  }

  .back-arrow-svg {
    width: 1rem;
    height: 1rem;
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
    padding: 0.75rem;
    box-sizing: border-box;
    pointer-events: auto;
    user-select: none;
    font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
  }

  /* Main Modal Card */
  .modal-card {
    position: relative;
    width: 100%;
    max-width: 980px;
    height: min(680px, calc(100dvh - 1.5rem));
    max-height: calc(100dvh - 1.5rem);
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
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
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
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
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

  .control-item.slider-disabled {
    opacity: 0.38;
    pointer-events: none;
    filter: grayscale(0.85);
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

  /* Slider Row with Touch-Friendly -/+ Steppers */
  .slider-stepper-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
  }

  .touch-step-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 0.35rem;
    border: 1px solid rgba(0, 229, 255, 0.28);
    background: rgba(11, 17, 30, 0.85);
    color: #7dd3fc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .touch-step-btn:hover:not(:disabled) {
    background: rgba(0, 229, 255, 0.18);
    border-color: #00e5ff;
    color: #ffffff;
  }

  .touch-step-btn:active:not(:disabled) {
    transform: scale(0.94);
  }

  .touch-step-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Slider Track with Delta Range & Discrete Default Dot */
  .slider-track-wrap {
    position: relative;
    flex: 1;
    width: 100%;
    height: 24px;
    display: flex;
    align-items: center;
    touch-action: pan-x;
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
    touch-action: pan-x;
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
    grid-template-columns: repeat(2, 1fr);
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

  /* Responsive Adjustments — Mobile Landscape & Compact Touch Viewports */
  @media (max-height: 520px), (max-width: 960px) {
    .sidebar-back-row {
      margin-bottom: 0.35rem;
    }

    .header-back-btn {
      padding: 0.3rem 0.65rem;
      font-size: 0.72rem;
    }

    .modal-backdrop {
      padding: 0.3rem 0.45rem;
    }

    .modal-card {
      height: calc(100dvh - 0.6rem);
      max-height: calc(100dvh - 0.6rem);
      max-width: 100%;
    }

    .sidebar {
      width: 185px;
      padding: 0.6rem 0.55rem;
      overflow-y: auto;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }

    .sidebar-header {
      margin-bottom: 0.65rem;
      padding: 0.15rem 0.3rem;
      gap: 0.5rem;
    }

    .lightning-box {
      width: 1.85rem;
      height: 1.85rem;
    }

    .main-header {
      font-size: 0.82rem;
    }

    .sub-header {
      font-size: 0.62rem;
    }

    .tab-btn {
      padding: 0.5rem 0.65rem;
      font-size: 0.76rem;
      gap: 0.45rem;
    }

    .sidebar-footer {
      padding-top: 0.55rem;
    }

    .reset-btn {
      padding: 0.5rem 0.6rem;
      min-height: 36px;
      font-size: 0.72rem;
    }

    .content-panel,
    .sliders-container {
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }

    .panel-header {
      padding: 0.65rem 1rem 0.55rem 1rem;
    }

    .panel-title {
      font-size: 0.9rem;
    }

    .sliders-container {
      padding: 0.75rem 1rem;
      gap: 0.65rem;
    }

    .control-item {
      padding: 0.55rem 0.75rem;
    }

    .touch-step-btn {
      width: 30px;
      height: 30px;
      font-size: 0.95rem;
    }

    .micro-step-btn {
      padding: 3px 6px;
      font-size: 0.62rem;
    }

    .range-slider {
      touch-action: pan-x;
    }
  }

  .preset-status-chip {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.22rem 0.6rem;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.16);
    color: #fbbf24;
    border: 1px solid rgba(251, 191, 36, 0.35);
    white-space: nowrap;
  }

  .presets-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .preset-card {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.9rem 1rem;
    border-radius: 0.6rem;
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .preset-card:hover:not(:disabled) {
    border-color: rgba(0, 229, 255, 0.55);
    background: rgba(15, 23, 42, 0.95);
    transform: translateY(-1px);
  }

  .preset-card.is-selected {
    border-color: #00e5ff;
    background: linear-gradient(135deg, rgba(0, 229, 255, 0.14), rgba(15, 23, 42, 0.96));
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.22);
  }

  .preset-card:disabled {
    opacity: 0.75;
    cursor: not-allowed;
  }

  .preset-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .preset-title-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .preset-title {
    font-size: 0.95rem;
    font-weight: 800;
    color: #ffffff;
  }

  .preset-badge {
    font-size: 0.64rem;
    font-weight: 700;
    padding: 0.14rem 0.45rem;
    border-radius: 999px;
    background: rgba(0, 229, 255, 0.14);
    color: #67e8f9;
    border: 1px solid rgba(0, 229, 255, 0.3);
  }

  .preset-active-pill {
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 0.18rem 0.52rem;
    border-radius: 6px;
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.45);
  }

  .preset-desc {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: #94a3b8;
  }

  .preset-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.7rem;
    color: #cbd5e1;
  }

  .preset-metrics span {
    padding: 0.16rem 0.45rem;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 720px) {
    .grid-controls-2col {
      grid-template-columns: 1fr;
    }
    .toggles-panel-card {
      grid-column: span 1;
    }
    .toggles-row {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 680px) and (min-height: 521px) {
    .modal-card {
      flex-direction: column;
    }
    .sidebar {
      width: 100%;
      height: auto;
      border-right: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.55rem 0.65rem;
    }
    .nav-tabs {
      flex-direction: row;
      overflow-x: auto;
      margin-top: 0.45rem;
    }
    .tab-btn {
      white-space: nowrap;
      flex-shrink: 0;
    }
    .toggles-row {
      grid-template-columns: 1fr;
    }
  }
</style>
