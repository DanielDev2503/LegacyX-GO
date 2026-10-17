<script lang="ts">
  import { gameUI, type PhysicsModifiers } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  function handleTabClick(tab: 'player' | 'ball' | 'mechanics') {
    soundFX.playUIClick();
    gameUI.activeModifiersTab = tab;
  }

  function handleSliderChange(key: keyof PhysicsModifiers, e: Event) {
    if (!gameUI.isHost && !gameUI.isAdmin) return;
    const target = e.target as HTMLInputElement;
    const val = target.type === 'checkbox' ? target.checked : parseFloat(target.value);
    gameUI.updateModifier(key, val as any);
  }

  function handleClose() {
    soundFX.playUIClick();
    gameUI.closeOverlay();
  }

  function handleReset() {
    if (!gameUI.isHost && !gameUI.isAdmin) return;
    soundFX.playUIClick();
    gameUI.resetModifiersToDefault();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
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
    <!-- Close Button -->
    <button
      type="button"
      class="close-x-btn"
      onclick={handleClose}
      aria-label="Cerrar modal"
      title="Cerrar [Esc]"
    >
      ✕
    </button>

    <!-- LEFT SIDEBAR (230px) -->
    <aside class="sidebar">
      <div>
        <!-- Sidebar Header -->
        <div class="sidebar-header">
          <span class="lightning-box">⚡</span>
          <div>
            <span class="sub-header">MOTOR FÍSICO</span>
            <h2 id="modifiers-dialog-title" class="main-header">MODIFICADORES [#]</h2>
          </div>
        </div>

        <!-- Host Authority Status Indicator -->
        <div class="authority-badge" class:is-guest={!gameUI.isHost && !gameUI.isAdmin}>
          <span class="status-dot"></span>
          <span>{gameUI.isHost || gameUI.isAdmin ? 'HOST CON AUTORIDAD' : 'MODO INVITADO (READ-ONLY)'}</span>
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
            <span>Físicas de Jugador</span>
          </button>

          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'ball'}
            onclick={() => handleTabClick('ball')}
          >
            <span class="tab-icon">⚽</span>
            <span>Físicas de Balón</span>
          </button>

          <button
            type="button"
            class="tab-btn"
            class:active={gameUI.activeModifiersTab === 'mechanics'}
            onclick={() => handleTabClick('mechanics')}
          >
            <span class="tab-icon">⚡</span>
            <span>Mecánicas y Reglas</span>
          </button>
        </nav>
      </div>

      <!-- Sidebar Footer: Reset Default -->
      <div class="sidebar-footer">
        <button
          type="button"
          class="reset-btn"
          disabled={!gameUI.isHost && !gameUI.isAdmin}
          onclick={handleReset}
          title={gameUI.isHost || gameUI.isAdmin ? 'Restablecer constantes de fábrica' : 'Solo anfitriones pueden reiniciar modificadores'}
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
                FÍSICAS DEL JUGADOR (DISCO)
              {:else if gameUI.activeModifiersTab === 'ball'}
                FÍSICAS DEL BALÓN Y ENTORNO
              {:else}
                MECÁNICAS DEL MUNDO Y REGLAS DE PARTIDO
              {/if}
            </h3>
          </div>
          <span class="active-badge">19 PARÁMETROS CANÓNICOS</span>
        </div>
        <p class="panel-desc">
          {#if gameUI.activeModifiersTab === 'player'}
            Calibra inercia, dimensiones, fuerza de disparo y dinámica de dash del jugador.
          {:else if gameUI.activeModifiersTab === 'ball'}
            Ajusta rozamiento del césped, coeficiente Magnus y rebote esférico.
          {:else}
            Controla gravedad, elasticidad de redes, postes, gol de oro y duración reglamentaria.
          {/if}
        </p>

        {#if !gameUI.isHost && !gameUI.isAdmin}
          <div class="guest-warning-banner">
            ⚠️ Modo invitado: Solo el anfitrión de la sala puede alterar las variables físicas de la simulación.
          </div>
        {/if}
      </div>

      <!-- Scrollable Modifiers List -->
      <div class="sliders-container">
        <!-- TAB 1: PLAYER MODIFIERS -->
        {#if gameUI.activeModifiersTab === 'player'}
          <div class="grid-2col">
            <!-- 1. Masa de Jugadores -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">01 // MASA DE JUGADORES</span>
                <span class="control-val">{gameUI.modifiers.playerMass.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.05"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.playerMass}
                oninput={(e) => handleSliderChange('playerMass', e)}
              />
              <span class="control-range">Rango: 0.50 .. 3.00 (Inercia choque)</span>
            </div>

            <!-- 2. Radio de Jugadores -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">02 // RADIO DE JUGADORES</span>
                <span class="control-val">{gameUI.modifiers.playerRadius.toFixed(1)} px</span>
              </div>
              <input
                type="range"
                min="10.0"
                max="25.0"
                step="0.5"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.playerRadius}
                oninput={(e) => handleSliderChange('playerRadius', e)}
              />
              <span class="control-range">Rango: 10.0 .. 25.0 px</span>
            </div>

            <!-- 3. Fuerza de Patada Base -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">03 // FUERZA DE PATADA BASE</span>
                <span class="control-val">{gameUI.modifiers.baseKickStrength.toFixed(0)} px/s</span>
              </div>
              <input
                type="range"
                min="200"
                max="900"
                step="10"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.baseKickStrength}
                oninput={(e) => handleSliderChange('baseKickStrength', e)}
              />
              <span class="control-range">Rango: 200 .. 900 px/s</span>
            </div>

            <!-- 4. Potencia de Dash -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">04 // POTENCIA DE DASH / SPRINT</span>
                <span class="control-val">{gameUI.modifiers.dashPower.toFixed(0)} px/s</span>
              </div>
              <input
                type="range"
                min="100"
                max="600"
                step="10"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.dashPower}
                oninput={(e) => handleSliderChange('dashPower', e)}
              />
              <span class="control-range">Rango: 100 .. 600 px/s</span>
            </div>

            <!-- 5. Cooldown de Dash -->
            <div class="control-card span-2">
              <div class="control-header">
                <span class="control-label">05 // COOLDOWN DE DASH</span>
                <span class="control-val">{gameUI.modifiers.dashCooldown.toFixed(2)} s</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="5.0"
                step="0.1"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.dashCooldown}
                oninput={(e) => handleSliderChange('dashCooldown', e)}
              />
              <span class="control-range">Rango: 0.20 .. 5.00 segundos</span>
            </div>
          </div>
        {/if}

        <!-- TAB 2: BALL & ENVIRONMENT MODIFIERS -->
        {#if gameUI.activeModifiersTab === 'ball'}
          <div class="grid-2col">
            <!-- 6. Radio del Balón -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">06 // RADIO DEL BALÓN</span>
                <span class="control-val">{gameUI.modifiers.ballRadius.toFixed(1)} px</span>
              </div>
              <input
                type="range"
                min="6.0"
                max="20.0"
                step="0.5"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.ballRadius}
                oninput={(e) => handleSliderChange('ballRadius', e)}
              />
              <span class="control-range">Rango: 6.0 .. 20.0 px (Estándar: 5.8)</span>
            </div>

            <!-- 7. Masa del Balón -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">07 // MASA DEL BALÓN</span>
                <span class="control-val">{gameUI.modifiers.ballMass.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1.00"
                step="0.01"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.ballMass}
                oninput={(e) => handleSliderChange('ballMass', e)}
              />
              <span class="control-range">Rango: 0.05 .. 1.00</span>
            </div>

            <!-- 8. Fricción del Campo -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">08 // FRICCIÓN DEL CAMPO</span>
                <span class="control-val">{gameUI.modifiers.pitchFriction.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0.900"
                max="0.999"
                step="0.001"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.pitchFriction}
                oninput={(e) => handleSliderChange('pitchFriction', e)}
              />
              <span class="control-range">Rango: 0.900 .. 0.999 (Factor por tick)</span>
            </div>

            <!-- 9. Densidad del Aire -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">09 // DENSIDAD DEL AIRE</span>
                <span class="control-val">{gameUI.modifiers.airDensity.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.airDensity}
                oninput={(e) => handleSliderChange('airDensity', e)}
              />
              <span class="control-range">Rango: 0.0 .. 3.0 (Fricción aerodinámica)</span>
            </div>

            <!-- 10. Coeficiente Magnus -->
            <div class="control-card span-2">
              <div class="control-header">
                <span class="control-label">10 // COEFICIENTE MAGNUS (CURVA)</span>
                <span class="control-val">{gameUI.modifiers.magnusCoefficient.toFixed(4)}</span>
              </div>
              <input
                type="range"
                min="0.0000"
                max="0.0100"
                step="0.0005"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.magnusCoefficient}
                oninput={(e) => handleSliderChange('magnusCoefficient', e)}
              />
              <span class="control-range">Rango: 0.0000 .. 0.0100 (Magnitud de efecto de comba)</span>
            </div>
          </div>
        {/if}

        <!-- TAB 3: MECHANICS & RULES MODIFIERS -->
        {#if gameUI.activeModifiersTab === 'mechanics'}
          <div class="grid-2col">
            <!-- 11. Gravedad / Inclinación -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">11 // GRAVEDAD / INCLINACIÓN</span>
                <span class="control-val">{gameUI.modifiers.gravity.toFixed(1)} px/s²</span>
              </div>
              <input
                type="range"
                min="-50.0"
                max="50.0"
                step="1.0"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.gravity}
                oninput={(e) => handleSliderChange('gravity', e)}
              />
              <span class="control-range">Rango: -50.0 .. +50.0 px/s²</span>
            </div>

            <!-- 12. Rebote de Vallas -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">12 // REBOTE DE VALLAS</span>
                <span class="control-val">{gameUI.modifiers.wallBounciness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="1.20"
                step="0.05"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.wallBounciness}
                oninput={(e) => handleSliderChange('wallBounciness', e)}
              />
              <span class="control-range">Rango: 0.10 .. 1.20 (Restitución)</span>
            </div>

            <!-- 13. Rebote de Postes -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">13 // REBOTE DE POSTES</span>
                <span class="control-val">{gameUI.modifiers.postBounciness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.20"
                max="1.30"
                step="0.05"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.postBounciness}
                oninput={(e) => handleSliderChange('postBounciness', e)}
              />
              <span class="control-range">Rango: 0.20 .. 1.30</span>
            </div>

            <!-- 14. Elasticidad de Redes -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">14 // ELASTICIDAD DE REDES</span>
                <span class="control-val">{gameUI.modifiers.netElasticity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.90"
                step="0.05"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.netElasticity}
                oninput={(e) => handleSliderChange('netElasticity', e)}
              />
              <span class="control-range">Rango: 0.10 .. 0.90 (Constante k)</span>
            </div>

            <!-- 15. Amortiguamiento de Redes -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">15 // AMORTIGUAMIENTO DE REDES</span>
                <span class="control-val">{gameUI.modifiers.netDamping.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.02"
                max="0.50"
                step="0.02"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.netDamping}
                oninput={(e) => handleSliderChange('netDamping', e)}
              />
              <span class="control-range">Rango: 0.02 .. 0.50 (Factor c)</span>
            </div>

            <!-- 16. Duración Celebración -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">16 // CELEBRACIÓN DE GOL</span>
                <span class="control-val">{gameUI.modifiers.goalCelebrationDuration.toFixed(1)} s</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="6.0"
                step="0.5"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.goalCelebrationDuration}
                oninput={(e) => handleSliderChange('goalCelebrationDuration', e)}
              />
              <span class="control-range">Rango: 1.0 .. 6.0 segundos</span>
            </div>

            <!-- 17. Límite de Goles -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">17 // LÍMITE DE GOLES</span>
                <span class="control-val">{gameUI.modifiers.goalLimit} goles</span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                step="1"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.goalLimit}
                oninput={(e) => handleSliderChange('goalLimit', e)}
              />
              <span class="control-range">Rango: 1 .. 15 goles</span>
            </div>

            <!-- 18. Tiempo Reglamentario -->
            <div class="control-card">
              <div class="control-header">
                <span class="control-label">18 // TIEMPO REGLAMENTARIO</span>
                <span class="control-val">{gameUI.modifiers.matchTimeMinutes.toFixed(0)} min</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="15.0"
                step="1.0"
                disabled={!gameUI.isHost && !gameUI.isAdmin}
                value={gameUI.modifiers.matchTimeMinutes}
                oninput={(e) => handleSliderChange('matchTimeMinutes', e)}
              />
              <span class="control-range">Rango: 1.0 .. 15.0 minutos</span>
            </div>

            <!-- 19. Gol de Oro / Overtime -->
            <div class="control-card span-2 toggle-card">
              <div class="toggle-flex">
                <div>
                  <span class="control-label">19 // GOL DE ORO / OVERTIME</span>
                  <p class="toggle-desc">Desempate inmediato a primer gol tras agotarse el tiempo reglamentario.</p>
                </div>
                <label class="switch">
                  <input
                    type="checkbox"
                    disabled={!gameUI.isHost && !gameUI.isAdmin}
                    checked={gameUI.modifiers.goldenGoalOvertime}
                    onchange={(e) => handleSliderChange('goldenGoalOvertime', e)}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(12px);
    pointer-events: auto;
    user-select: none;
    padding: 1rem;
    box-sizing: border-box;
  }

  .modal-card {
    position: relative;
    width: min(94vw, 940px);
    height: 620px;
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 12px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.85), 0 0 28px rgba(0, 229, 255, 0.25);
    display: flex;
    overflow: hidden;
    color: #dde2f1;
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  .close-x-btn {
    position: absolute;
    top: 14px;
    right: 16px;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    transition: background 0.15s, color 0.15s;
  }

  .close-x-btn:hover {
    background: rgba(255, 71, 87, 0.25);
    border-color: #ff4757;
    color: #ff4757;
  }

  .sidebar {
    width: 230px;
    background: #080c14;
    border-right: 1px solid rgba(0, 229, 255, 0.2);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 18px 14px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(0, 229, 255, 0.2);
    margin-bottom: 10px;
  }

  .lightning-box {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .sub-header {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    letter-spacing: 0.08em;
    display: block;
  }

  .main-header {
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
    letter-spacing: 0.04em;
  }

  .authority-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(46, 204, 113, 0.12);
    border: 1px solid rgba(46, 204, 113, 0.35);
    color: #2ecc71;
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 4px;
    margin-bottom: 12px;
    letter-spacing: 0.04em;
  }

  .authority-badge.is-guest {
    background: rgba(241, 196, 15, 0.12);
    border-color: rgba(241, 196, 15, 0.35);
    color: #f1c40f;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }

  .nav-tabs {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tab-btn {
    width: 100%;
    height: 42px;
    padding: 0 12px;
    border-radius: 6px;
    background: transparent;
    border: none;
    border-left: 3px solid transparent;
    color: #8fa0b5;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    transition: background 0.15s, color 0.15s;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .tab-btn.active {
    background: rgba(0, 229, 255, 0.14);
    border-left-color: #00e5ff;
    color: #00e5ff;
    font-weight: 700;
  }

  .tab-icon {
    font-size: 15px;
  }

  .sidebar-footer {
    padding-top: 14px;
    border-top: 1px solid rgba(0, 229, 255, 0.15);
  }

  .reset-btn {
    width: 100%;
    padding: 10px 8px;
    border-radius: 6px;
    background: #121a29;
    border: 1px solid rgba(241, 196, 15, 0.5);
    color: #f1c40f;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.15s, border-color 0.15s;
  }

  .reset-btn:hover:not(:disabled) {
    background: rgba(241, 196, 15, 0.15);
    border-color: #f1c40f;
  }

  .reset-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .content-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px 24px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .panel-header {
    border-bottom: 1px solid rgba(0, 229, 255, 0.18);
    padding-bottom: 12px;
    margin-bottom: 14px;
  }

  .panel-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cyan-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
  }

  .panel-title {
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
    letter-spacing: 0.05em;
  }

  .active-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.3);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .panel-desc {
    font-size: 11px;
    color: #8fa0b5;
    margin: 4px 0 0 0;
  }

  .guest-warning-banner {
    margin-top: 8px;
    padding: 6px 10px;
    background: rgba(241, 196, 15, 0.12);
    border: 1px solid rgba(241, 196, 15, 0.3);
    border-radius: 6px;
    color: #f1c40f;
    font-size: 11px;
    font-weight: 600;
  }

  .sliders-container {
    flex: 1;
    overflow-y: auto;
    padding-right: 6px;
  }

  .sliders-container::-webkit-scrollbar {
    width: 4px;
  }

  .sliders-container::-webkit-scrollbar-thumb {
    background: #00e5ff;
    border-radius: 2px;
  }

  .grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .control-card {
    background: rgba(18, 26, 41, 0.7);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color 0.15s;
  }

  .control-card:hover {
    border-color: rgba(0, 229, 255, 0.45);
  }

  .control-card.span-2 {
    grid-column: span 2;
  }

  .control-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .control-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.04em;
  }

  .control-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 800;
    color: #00e5ff;
  }

  .control-range {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #8fa0b5;
  }

  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    background: #080e18;
    height: 6px;
    border-radius: 3px;
    outline: none;
    border: 1px solid rgba(0, 229, 255, 0.2);
  }

  input[type=range]:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
    cursor: pointer;
  }

  .toggle-card {
    padding: 14px;
  }

  .toggle-flex {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-desc {
    font-size: 11px;
    color: #8fa0b5;
    margin: 2px 0 0 0;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
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
    height: 16px;
    width: 16px;
    left: 2px;
    bottom: 2px;
    background-color: #ffffff;
    border-radius: 50%;
    transition: 0.2s;
  }

  input:checked + .slider {
    background-color: rgba(0, 229, 255, 0.35);
    border-color: #00e5ff;
  }

  input:checked + .slider:before {
    transform: translateX(18px);
    background-color: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
  }
</style>
