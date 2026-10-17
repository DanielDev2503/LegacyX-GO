<script lang="ts">
  import { gameUI, type BallSkinType } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  type SettingsTab = 'controls' | 'audio' | 'video' | 'kits' | 'club';
  let activeTab = $state<SettingsTab>(gameUI.activeSettingsTab ?? 'controls');

  // Keybinding remapping state
  let rebindingAction = $state<string | null>(null);
  let showSaveKeybindFeedback = $state(false);

  // Kits preview state
  let activeKitTeam = $state<'red' | 'blue'>('red');
  let currentKit = $derived(activeKitTeam === 'red' ? gameUI.redKit : gameUI.blueKit);
  let showSaveKitFeedback = $state(false);

  // Club & Avatar state
  let clubNameInput = $state(gameUI.clubName);
  let clubTagInput = $state(gameUI.clubTag);
  let initialsInput = $state(gameUI.avatarMode === 'letters' ? gameUI.avatarValue : 'YA');
  let selectedEmoji = $state(gameUI.avatarMode === 'emoji' ? gameUI.avatarValue : '⚽');
  let avatarType = $state<'letters' | 'emoji'>(gameUI.avatarMode);
  let showSaveProfileFeedback = $state(false);

  const EMOJI_PALETTE = ['⚽', '⚡', '👑', '🎯', '🚀', '🏆', '💎', '🦁', '🔥', '🎩', '🛡️', '🌟'];

  function switchTab(tab: SettingsTab) {
    soundFX.playUIClick();
    activeTab = tab;
    gameUI.activeSettingsTab = tab;
  }

  function handleClose() {
    soundFX.playUIClick();
    gameUI.closeOverlay();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !rebindingAction) {
      handleClose();
    }
  }

  function updateSetting<K extends keyof typeof gameUI.settings>(
    key: K,
    val: (typeof gameUI.settings)[K]
  ) {
    gameUI.updateSettings({ [key]: val });
  }

  function startRebind(action: string) {
    soundFX.playUIClick();
    rebindingAction = action;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (rebindingAction) {
      e.preventDefault();
      e.stopPropagation();
      gameUI.remapKey(rebindingAction as any, e.code);
      rebindingAction = null;
      showSaveKeybindFeedback = true;
      setTimeout(() => {
        showSaveKeybindFeedback = false;
      }, 1500);
      return;
    }

    if (e.key === 'Escape') {
      handleClose();
      e.stopPropagation();
    }
  }

  function getKeyLabel(codes: string[]): string {
    if (!codes || codes.length === 0) return 'Sin asignar';
    const code = codes[0]!;
    if (code === 'Space') return 'Espacio';
    if (code === 'ShiftLeft') return 'Shift Izq';
    if (code === 'ShiftRight') return 'Shift Der';
    if (code === 'ArrowUp') return 'Flecha Arriba';
    if (code === 'ArrowDown') return 'Flecha Abajo';
    if (code === 'ArrowLeft') return 'Flecha Izq';
    if (code === 'ArrowRight') return 'Flecha Der';
    if (code.startsWith('Key')) return code.slice(3);
    return code;
  }

  function handleResetControls() {
    soundFX.playUIClick();
    gameUI.resetKeybinds();
    showSaveKeybindFeedback = true;
    setTimeout(() => {
      showSaveKeybindFeedback = false;
    }, 1500);
  }

  function handleSaveKits() {
    soundFX.playUIClick();
    showSaveKitFeedback = true;
    setTimeout(() => {
      showSaveKitFeedback = false;
    }, 1500);
  }

  function handleSaveProfile() {
    soundFX.playUIClick();
    gameUI.clubName = clubNameInput.trim().slice(0, 20) || 'LegacyX Clan';
    gameUI.clubTag = clubTagInput.trim().toUpperCase().slice(0, 4) || 'LEG';
    gameUI.avatarMode = avatarType;
    if (avatarType === 'letters') {
      const clean = initialsInput.trim().toUpperCase().slice(0, 2) || 'YA';
      gameUI.avatarValue = clean;
      gameUI.saveProfile(gameUI.nickname, clean);
    } else {
      gameUI.avatarValue = selectedEmoji;
      gameUI.saveProfile(gameUI.nickname, selectedEmoji);
    }
    showSaveProfileFeedback = true;
    setTimeout(() => {
      showSaveProfileFeedback = false;
    }, 1500);
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="modal-backdrop"
  role="presentation"
  onclick={handleBackdropClick}
>
  <div class="settings-modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
    <!-- Header Ribbon -->
    <header class="modal-header">
      <div class="header-left">
        <div class="settings-icon-box">⚙</div>
        <div class="title-meta">
          <div class="protocol-row">
            <span class="protocol-tag">[CFG] PROTOCOLO DE AJUSTES</span>
            <span class="protocol-dot"></span>
          </div>
          <h2 id="settings-dialog-title" class="dialog-title">Ajustes del Sistema</h2>
        </div>
      </div>

      <div class="header-right">
        <button
          type="button"
          class="theme-btn modal-nav-theme-btn"
          onclick={() => gameUI.toggleTheme()}
          title="Cambiar tema Claro / Oscuro"
        >
          {gameUI.theme === 'dark' ? '☀️ Aero Light' : '🌙 Cyber Dark'}
        </button>
        <button
          type="button"
          class="back-btn modal-nav-back-btn"
          onclick={handleClose}
          title="Volver"
        >
          ← Volver
        </button>
        <button
          type="button"
          class="close-x-btn"
          onclick={handleClose}
          aria-label="Cerrar modal"
          title="Cerrar [Esc]"
        >
          ✕
        </button>
      </div>
    </header>

    <!-- Modal Body: 2 Columns (Tabs Sidebar + Active Tab Content) -->
    <div class="settings-body">
      <!-- Sidebar de 5 Pestañas -->
      <nav class="tabs-sidebar" aria-label="Pestañas de ajustes">
        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'controls'}
          onclick={() => switchTab('controls')}
        >
          <span class="tab-icon">🎮</span>
          <span>1. Controles</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'audio'}
          onclick={() => switchTab('audio')}
        >
          <span class="tab-icon">🔊</span>
          <span>2. Audio</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'video'}
          onclick={() => switchTab('video')}
        >
          <span class="tab-icon">🖥️</span>
          <span>3. Video y Gráficos</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'kits'}
          onclick={() => switchTab('kits')}
        >
          <span class="tab-icon">👕</span>
          <span>4. Equipaciones</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'club'}
          onclick={() => switchTab('club')}
        >
          <span class="tab-icon">🛡️</span>
          <span>5. Club y Avatar</span>
        </button>
      </nav>

      <!-- Panel de Contenido -->
      <main class="tab-content">
        <!-- ======================================================== -->
        <!-- TAB 1: CONTROLES                                         -->
        <!-- ======================================================== -->
        {#if activeTab === 'controls'}
          <div class="tab-pane">
            <div class="section-title-row">
              <span class="section-kicker">01 // MAPEADO DE TECLAS DETERMINISTA</span>
              {#if rebindingAction}
                <span class="pulse-rebinding">Presiona cualquier tecla para asignar...</span>
              {:else if showSaveKeybindFeedback}
                <span class="success-badge">✓ Cambios guardados</span>
              {/if}
            </div>

            <div class="controls-scroll-area">
              <!-- Desplazamiento -->
              <div class="controls-group">
                <span class="group-title">Desplazamiento y Movimiento</span>
                <div class="grid-2col">
                  <div class="bind-row">
                    <span>Arriba</span>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'up'}
                      onclick={() => startRebind('up')}
                    >
                      {rebindingAction === 'up' ? '...' : getKeyLabel(gameUI.keybinds.up)}
                    </button>
                  </div>
                  <div class="bind-row">
                    <span>Abajo</span>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'down'}
                      onclick={() => startRebind('down')}
                    >
                      {rebindingAction === 'down' ? '...' : getKeyLabel(gameUI.keybinds.down)}
                    </button>
                  </div>
                  <div class="bind-row">
                    <span>Izquierda</span>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'left'}
                      onclick={() => startRebind('left')}
                    >
                      {rebindingAction === 'left' ? '...' : getKeyLabel(gameUI.keybinds.left)}
                    </button>
                  </div>
                  <div class="bind-row">
                    <span>Derecha</span>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'right'}
                      onclick={() => startRebind('right')}
                    >
                      {rebindingAction === 'right' ? '...' : getKeyLabel(gameUI.keybinds.right)}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Acciones y Disparo -->
              <div class="controls-group">
                <span class="group-title">Acciones Principales y Disparo</span>
                <div class="grid-2col">
                  <div class="bind-row">
                    <div>
                      <span>Patear / Remate</span>
                      <small class="bind-hint">Tiro de contacto o pase</small>
                    </div>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'kick'}
                      onclick={() => startRebind('kick')}
                    >
                      {rebindingAction === 'kick' ? '...' : getKeyLabel(gameUI.keybinds.kick)}
                    </button>
                  </div>
                  <div class="bind-row">
                    <div>
                      <span>Sprint / Turbo</span>
                      <small class="bind-hint">Aceleración rápida</small>
                    </div>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'turbo'}
                      onclick={() => startRebind('turbo')}
                    >
                      {rebindingAction === 'turbo' ? '...' : getKeyLabel(gameUI.keybinds.turbo)}
                    </button>
                  </div>
                  <div class="bind-row">
                    <div>
                      <span>Dash Rápido</span>
                      <small class="bind-hint">Impulso balístico</small>
                    </div>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'dash'}
                      onclick={() => startRebind('dash')}
                    >
                      {rebindingAction === 'dash' ? '...' : getKeyLabel(gameUI.keybinds.dash)}
                    </button>
                  </div>
                  <div class="bind-row">
                    <div>
                      <span>Pausa / Menú</span>
                      <small class="bind-hint">Detener o abrir panel</small>
                    </div>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'pause'}
                      onclick={() => startRebind('pause')}
                    >
                      {rebindingAction === 'pause' ? '...' : getKeyLabel(gameUI.keybinds.pause)}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Curva Magnus -->
              <div class="controls-group">
                <span class="group-title">Mecánica de Curva (Efecto Magnus)</span>
                <div class="grid-2col">
                  <div class="bind-row">
                    <span>Curva Izquierda</span>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'curveLeft'}
                      onclick={() => startRebind('curveLeft')}
                    >
                      {rebindingAction === 'curveLeft' ? '...' : getKeyLabel(gameUI.keybinds.curveLeft)}
                    </button>
                  </div>
                  <div class="bind-row">
                    <span>Curva Derecha</span>
                    <button
                      type="button"
                      class="key-badge"
                      class:rebinding={rebindingAction === 'curveRight'}
                      onclick={() => startRebind('curveRight')}
                    >
                      {rebindingAction === 'curveRight' ? '...' : getKeyLabel(gameUI.keybinds.curveRight)}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer con botón de reset -->
            <div class="tab-footer-row">
              <button
                type="button"
                class="btn-secondary"
                onclick={handleResetControls}
              >
                ↺ Restablecer Teclas por Defecto
              </button>
            </div>
          </div>

        <!-- ======================================================== -->
        <!-- TAB 2: AUDIO                                             -->
        <!-- ======================================================== -->
        {:else if activeTab === 'audio'}
          <div class="tab-pane">
            <div class="section-title-row">
              <span class="section-kicker">02 // SÍNTESIS PROCEDURAL WEB AUDIO API</span>
              <button
                type="button"
                class="btn-test-sound"
                onclick={() => { soundFX.playKick(1.0); soundFX.playPostHit(); }}
              >
                ▶ Probar Sonido
              </button>
            </div>

            <div class="settings-scroll-area">
              <!-- Mute All -->
              <label class="toggle-card">
                <div>
                  <strong class="toggle-title">Silenciar Todo el Audio</strong>
                  <p class="toggle-desc">Desactiva completamente la salida del sintetizador de audio.</p>
                </div>
                <input
                  type="checkbox"
                  checked={gameUI.settings.isMuted}
                  onchange={(e) => updateSetting('isMuted', (e.currentTarget as HTMLInputElement).checked)}
                />
              </label>

              <!-- Sliders -->
              <div class="slider-card">
                <div class="slider-head">
                  <span>Volumen Maestro</span>
                  <strong class="val-num">{Math.round(gameUI.settings.masterVolume * 100)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={gameUI.settings.masterVolume}
                  oninput={(e) => updateSetting('masterVolume', Number((e.currentTarget as HTMLInputElement).value))}
                />
              </div>

              <div class="slider-card">
                <div class="slider-head">
                  <span>Efectos de Partido (SFX: Pateo, Poste, Silbato, Gol)</span>
                  <strong class="val-num">{Math.round(gameUI.settings.sfxVolume * 100)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={gameUI.settings.sfxVolume}
                  oninput={(e) => updateSetting('sfxVolume', Number((e.currentTarget as HTMLInputElement).value))}
                />
              </div>

              <div class="slider-card">
                <div class="slider-head">
                  <span>Multitud y Ambiente</span>
                  <strong class="val-num">{Math.round(gameUI.settings.crowdVolume * 100)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={gameUI.settings.crowdVolume}
                  oninput={(e) => updateSetting('crowdVolume', Number((e.currentTarget as HTMLInputElement).value))}
                />
              </div>

              <!-- Toggles específicos -->
              <div class="grid-2col pt-2">
                <label class="toggle-card">
                  <span>Sonido de Tiro / Pateo</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.kickSoundEnabled}
                    onchange={(e) => updateSetting('kickSoundEnabled', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>

                <label class="toggle-card">
                  <span>Impacto en Postes</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.postHitSoundEnabled}
                    onchange={(e) => updateSetting('postHitSoundEnabled', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>

                <label class="toggle-card">
                  <span>Bocina de Gol</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.goalSoundEnabled}
                    onchange={(e) => updateSetting('goalSoundEnabled', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>

                <label class="toggle-card">
                  <span>Silbato de Árbitro</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.whistleSoundEnabled}
                    onchange={(e) => updateSetting('whistleSoundEnabled', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>
              </div>
            </div>
          </div>

        <!-- ======================================================== -->
        <!-- TAB 3: VIDEO Y GRÁFICOS                                  -->
        <!-- ======================================================== -->
        {:else if activeTab === 'video'}
          <div class="tab-pane">
            <div class="section-title-row">
              <span class="section-kicker">03 // RENDERIZADO CANVAS 2D & SKINS</span>
              <span class="tech-pill">60 HZ INTERPOLADO</span>
            </div>

            <div class="settings-scroll-area">
              <!-- Ball Skins Selector -->
              <div class="ball-skin-section">
                <span class="group-title">Diseño del Balón (Rodamiento Procedural 3D)</span>
                <div class="ball-cards-grid">
                  <!-- Classic -->
                  <button
                    type="button"
                    class="ball-card"
                    class:selected={gameUI.settings.ballSkin === 'classic'}
                    onclick={() => updateSetting('ballSkin', 'classic')}
                  >
                    <div class="ball-icon-circle classic-ball">
                      <svg viewBox="0 0 100 100" class="ball-svg">
                        <polygon fill="#080e18" points="50,30 65,42 60,60 40,60 35,42" />
                        <polygon fill="#f8fafc" points="50,5 30,12 22,25 35,42 50,30" />
                        <polygon fill="#f8fafc" points="50,5 70,12 78,25 65,42 50,30" />
                        <polygon fill="#080e18" points="40,60 60,60 70,80 50,95 30,80" />
                      </svg>
                    </div>
                    <strong class="ball-name">Clásico</strong>
                    <span class="ball-desc">Hexágonos icónicos</span>
                  </button>

                  <!-- Retro -->
                  <button
                    type="button"
                    class="ball-card"
                    class:selected={gameUI.settings.ballSkin === 'retro'}
                    onclick={() => updateSetting('ballSkin', 'retro')}
                  >
                    <div class="ball-icon-circle retro-ball">
                      <svg viewBox="0 0 100 100" class="ball-svg">
                        <path d="M 50,0 Q 55,50 50,100" fill="none" stroke="#4a2508" stroke-width="3" />
                        <path d="M 25,0 Q 35,50 25,100" fill="none" stroke="#4a2508" stroke-width="2.5" />
                        <path d="M 75,0 Q 65,50 75,100" fill="none" stroke="#4a2508" stroke-width="2.5" />
                      </svg>
                    </div>
                    <strong class="ball-name">Retro Cuero</strong>
                    <span class="ball-desc">Costuras vintage</span>
                  </button>

                  <!-- Neon -->
                  <button
                    type="button"
                    class="ball-card"
                    class:selected={gameUI.settings.ballSkin === 'neon'}
                    onclick={() => updateSetting('ballSkin', 'neon')}
                  >
                    <div class="ball-icon-circle neon-ball">
                      <svg viewBox="0 0 100 100" class="ball-svg">
                        <circle cx="50" cy="50" r="46" fill="none" stroke="#ccff00" stroke-width="4" />
                        <circle cx="50" cy="50" r="4" fill="#00e5ff" />
                      </svg>
                    </div>
                    <strong class="ball-name">Neón Flúor</strong>
                    <span class="ball-desc">Alto contraste oficial</span>
                  </button>
                </div>
              </div>

              <!-- FPS Cap & Extrapolation -->
              <div class="grid-2col pt-2">
                <div class="setting-row-box">
                  <span>Límite de Cuadros (FPS Cap)</span>
                  <select
                    value={gameUI.settings.fpsCap}
                    onchange={(e) => updateSetting('fpsCap', Number((e.currentTarget as HTMLSelectElement).value) as 0 | 60 | 120 | 144)}
                  >
                    <option value={0}>Ilimitado (Nativo)</option>
                    <option value={60}>60 FPS</option>
                    <option value={120}>120 FPS</option>
                    <option value={144}>144 FPS</option>
                  </select>
                </div>

                <div class="setting-row-box">
                  <span>Extrapolación Visual: {gameUI.settings.extrapolationMs} ms</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={gameUI.settings.extrapolationMs}
                    oninput={(e) => updateSetting('extrapolationMs', Number((e.currentTarget as HTMLInputElement).value))}
                  />
                </div>
              </div>

              <!-- Toggles de Gráficos -->
              <div class="grid-2col pt-2">
                <label class="toggle-card">
                  <span>Radar / Minimapa en Pantalla</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.minimapEnabled}
                    onchange={(e) => updateSetting('minimapEnabled', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>

                <label class="toggle-card">
                  <span>Visión de Cámara (Frustum)</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.minimapCameraFrustum}
                    onchange={(e) => updateSetting('minimapCameraFrustum', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>

                <label class="toggle-card">
                  <span>Estela de Curva Magnus</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.ballTrailEnabled}
                    onchange={(e) => updateSetting('ballTrailEnabled', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>

                <label class="toggle-card">
                  <span>Indicadores Fuera de Pantalla</span>
                  <input
                    type="checkbox"
                    checked={gameUI.settings.offscreenIndicators}
                    onchange={(e) => updateSetting('offscreenIndicators', (e.currentTarget as HTMLInputElement).checked)}
                  />
                </label>
              </div>
            </div>
          </div>

        <!-- ======================================================== -->
        <!-- TAB 4: EQUIPACIONES (KITS)                               -->
        <!-- ======================================================== -->
        {:else if activeTab === 'kits'}
          <div class="tab-pane">
            <div class="section-title-row">
              <span class="section-kicker">04 // PERSONALIZACIÓN DE UNIFORMES</span>
              {#if showSaveKitFeedback}
                <span class="success-badge">✓ Equipación guardada</span>
              {/if}
            </div>

            <!-- Selector de Equipo -->
            <div class="team-tab-pills">
              <button
                type="button"
                class="team-pill red"
                class:active={activeKitTeam === 'red'}
                onclick={() => (activeKitTeam = 'red')}
              >
                🔴 Equipo Rojo
              </button>
              <button
                type="button"
                class="team-pill blue"
                class:active={activeKitTeam === 'blue'}
                onclick={() => (activeKitTeam = 'blue')}
              >
                🔵 Equipo Azul
              </button>
            </div>

            <div class="kits-layout-grid">
              <!-- Configuración de Colores y Patrón -->
              <div class="kits-controls-col">
                <div class="color-picker-row">
                  <label for="kit-primary-color">Color Primario</label>
                  <div class="color-input-group">
                    <input
                      id="kit-primary-color"
                      type="color"
                      bind:value={currentKit.primaryColor}
                    />
                    <input
                      type="text"
                      class="hex-input"
                      bind:value={currentKit.primaryColor}
                      maxlength="7"
                    />
                  </div>
                </div>

                <div class="color-picker-row">
                  <label for="kit-secondary-color">Color Secundario</label>
                  <div class="color-input-group">
                    <input
                      id="kit-secondary-color"
                      type="color"
                      bind:value={currentKit.secondaryColor}
                    />
                    <input
                      type="text"
                      class="hex-input"
                      bind:value={currentKit.secondaryColor}
                      maxlength="7"
                    />
                  </div>
                </div>

                <span class="group-title pt-2">Patrón de Camiseta</span>
                <div class="patterns-grid">
                  <button
                    type="button"
                    class="pattern-btn"
                    class:active={currentKit.pattern === 'solid'}
                    onclick={() => (currentKit.pattern = 'solid')}
                  >
                    1. Sólido
                  </button>
                  <button
                    type="button"
                    class="pattern-btn"
                    class:active={currentKit.pattern === 'vertical'}
                    onclick={() => (currentKit.pattern = 'vertical')}
                  >
                    2. Vertical
                  </button>
                  <button
                    type="button"
                    class="pattern-btn"
                    class:active={currentKit.pattern === 'hoop'}
                    onclick={() => (currentKit.pattern = 'hoop')}
                  >
                    3. Franja Aro
                  </button>
                  <button
                    type="button"
                    class="pattern-btn"
                    class:active={currentKit.pattern === 'halves'}
                    onclick={() => (currentKit.pattern = 'halves')}
                  >
                    4. Mitades
                  </button>
                </div>
              </div>

              <!-- Preview del Disco en Cancha -->
              <div class="kits-preview-col">
                <div class="pitch-box">
                  <div class="pitch-lines"></div>
                  <!-- Player Disc 64px -->
                  <div
                    class="kit-disc"
                    style="background-color: {currentKit.primaryColor}; border-color: {currentKit.secondaryColor};"
                  >
                    {#if currentKit.pattern === 'vertical'}
                      <div class="pattern-overlay vertical-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'hoop'}
                      <div class="pattern-overlay hoop-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'halves'}
                      <div class="pattern-overlay halves-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {/if}
                    <div class="captain-badge">C</div>
                    <div class="vision-pip"></div>
                  </div>
                </div>
                <div class="preview-meta">
                  <span>Radio: 32px · Escala: 1:1</span>
                  <span class="highlight">Rol: Capitán</span>
                </div>
              </div>
            </div>

            <div class="tab-footer-row">
              <button type="button" class="btn-primary" onclick={handleSaveKits}>
                ✓ Guardar Equipación
              </button>
            </div>
          </div>

        <!-- ======================================================== -->
        <!-- TAB 5: CLUB Y AVATAR                                     -->
        <!-- ======================================================== -->
        {:else if activeTab === 'club'}
          <div class="tab-pane">
            <div class="section-title-row">
              <span class="section-kicker">05 // IDENTIDAD DE CLUB & EMOTES</span>
              {#if showSaveProfileFeedback}
                <span class="success-badge">✓ Perfil guardado</span>
              {/if}
            </div>

            <div class="settings-scroll-area">
              <!-- Clan Inputs -->
              <div class="grid-2col">
                <div class="input-card">
                  <label for="club-name-id">Nombre del Club / Clan ({clubNameInput.length}/20)</label>
                  <input
                    id="club-name-id"
                    type="text"
                    bind:value={clubNameInput}
                    maxlength="20"
                    placeholder="Mi Clan"
                  />
                </div>

                <div class="input-card">
                  <label for="clan-tag-id">Sigla de Clan / Tag ({clubTagInput.length}/4)</label>
                  <div class="tag-input-row">
                    <input
                      id="clan-tag-id"
                      type="text"
                      bind:value={clubTagInput}
                      maxlength="4"
                      placeholder="LEG"
                    />
                    <span class="live-tag-badge">[{clubTagInput.toUpperCase() || 'TAG'}]</span>
                  </div>
                </div>
              </div>

              <!-- Avatar Mode Selector -->
              <div class="avatar-mode-section">
                <span class="group-title">Formato de Avatar</span>
                <div class="avatar-mode-pills">
                  <button
                    type="button"
                    class="mode-btn"
                    class:active={avatarType === 'letters'}
                    onclick={() => (avatarType = 'letters')}
                  >
                    Iniciales (2 Letras)
                  </button>
                  <button
                    type="button"
                    class="mode-btn"
                    class:active={avatarType === 'emoji'}
                    onclick={() => (avatarType = 'emoji')}
                  >
                    Emoji Deportivo
                  </button>
                </div>

                {#if avatarType === 'letters'}
                  <div class="initials-picker-row">
                    <input
                      type="text"
                      bind:value={initialsInput}
                      maxlength="2"
                      placeholder="YA"
                    />
                    <span class="avatar-preview-circle">{initialsInput.toUpperCase() || 'YA'}</span>
                  </div>
                {:else}
                  <div class="emoji-palette-grid">
                    {#each EMOJI_PALETTE as emoji}
                      <button
                        type="button"
                        class="emoji-btn"
                        class:selected={selectedEmoji === emoji}
                        onclick={() => (selectedEmoji = emoji)}
                      >
                        {emoji}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Emote Macros Info -->
              <div class="emotes-info-card">
                <span class="group-title">Comandos de Emotes Rápidos en Chat</span>
                <div class="emotes-list">
                  <div class="emote-row">
                    <code>:gol:</code>
                    <span>→ ⚽ Balón festivo (Bocina de gol)</span>
                  </div>
                  <div class="emote-row">
                    <code>:fuego:</code>
                    <span>→ 🔥 Llamarada de potencia</span>
                  </div>
                  <div class="emote-row">
                    <code>:gg:</code>
                    <span>→ 🤝 Saludo deportivo / Fairplay</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="tab-footer-row">
              <button type="button" class="btn-primary" onclick={handleSaveProfile}>
                ✓ Guardar Perfil y Emotes
              </button>
            </div>
          </div>
        {/if}
      </main>
    </div>
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

  .settings-modal-card {
    position: relative;
    width: min(94vw, 860px);
    height: 600px;
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 14px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.85), 0 0 20px rgba(0, 229, 255, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #dde2f1;
    font-family: 'Space Grotesk', system-ui, sans-serif;
  }

  .modal-header {
    background: #080e18;
    padding: 12px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    box-sizing: border-box;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .settings-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .protocol-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .protocol-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: #00e5ff;
    font-weight: 700;
  }

  .protocol-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #00e5ff;
    box-shadow: 0 0 6px #00e5ff;
  }

  .dialog-title {
    margin: 2px 0 0 0;
    font-size: 17px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-btn,
  .back-btn {
    background: #161c26;
    color: #dde2f1;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .theme-btn:hover,
  .back-btn:hover {
    background: #242a35;
    border-color: #00e5ff;
  }

  .close-x-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: #161c26;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }

  .close-x-btn:hover {
    background: rgba(255, 71, 87, 0.2);
    border-color: #ff4757;
    color: #ff4757;
  }

  .settings-body {
    flex: 1;
    display: grid;
    grid-template-columns: 200px 1fr;
    overflow: hidden;
  }

  .tabs-sidebar {
    background: #080c14;
    border-right: 1px solid rgba(0, 229, 255, 0.15);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 10px;
    box-sizing: border-box;
  }

  .tab-btn {
    width: 100%;
    padding: 10px 12px;
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

  .tab-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px 20px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .tab-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    margin-bottom: 12px;
  }

  .section-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.06em;
  }

  .pulse-rebinding {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #ffd700;
    animation: pulse 1s infinite alternate;
  }

  .success-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #2ecc71;
    font-weight: 700;
  }

  .tech-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.3);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .controls-scroll-area,
  .settings-scroll-area {
    flex: 1;
    overflow-y: auto;
    padding-right: 6px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .controls-scroll-area::-webkit-scrollbar,
  .settings-scroll-area::-webkit-scrollbar {
    width: 4px;
  }

  .controls-scroll-area::-webkit-scrollbar-thumb,
  .settings-scroll-area::-webkit-scrollbar-thumb {
    background: #00e5ff;
    border-radius: 2px;
  }

  .controls-group {
    background: rgba(18, 26, 41, 0.65);
    border: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-title {
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .bind-row {
    background: #0f1624;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }

  .bind-hint {
    display: block;
    font-size: 10px;
    color: #8fa0b5;
  }

  .key-badge {
    min-width: 70px;
    padding: 4px 10px;
    border-radius: 4px;
    background: #121a29;
    border: 1px solid #00e5ff;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
    transition: background 0.15s, transform 0.1s;
  }

  .key-badge:hover {
    background: rgba(0, 229, 255, 0.18);
  }

  .key-badge.rebinding {
    background: #00e5ff;
    color: #050811;
    animation: pulse 0.8s infinite;
  }

  .tab-footer-row {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(148, 163, 184, 0.15);
    display: flex;
    justify-content: flex-end;
  }

  .btn-secondary {
    background: #161c26;
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #242a35;
    border-color: #00e5ff;
  }

  .btn-primary {
    background: #2ecc71;
    color: #05150c;
    border: none;
    border-radius: 6px;
    padding: 8px 18px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(46, 204, 113, 0.35);
  }

  .btn-primary:hover {
    background: #34e27f;
    box-shadow: 0 0 18px rgba(46, 204, 113, 0.6);
  }

  .btn-test-sound {
    background: #161c26;
    color: #00e5ff;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-test-sound:hover {
    background: rgba(0, 229, 255, 0.15);
  }

  .toggle-card {
    background: rgba(18, 26, 41, 0.7);
    border: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    cursor: pointer;
  }

  .toggle-title {
    color: #ffffff;
    font-size: 12px;
  }

  .toggle-desc {
    margin: 2px 0 0 0;
    font-size: 10px;
    color: #8fa0b5;
  }

  .slider-card {
    background: rgba(18, 26, 41, 0.65);
    border: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }

  .slider-head {
    display: flex;
    justify-content: space-between;
  }

  .val-num {
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
  }

  input[type='range'] {
    width: 100%;
    accent-color: #00e5ff;
  }

  /* Ball skins */
  .ball-cards-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 6px;
  }

  .ball-card {
    background: #0f1624;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .ball-card:hover {
    border-color: rgba(0, 229, 255, 0.4);
  }

  .ball-card.selected {
    background: rgba(0, 229, 255, 0.12);
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.25);
  }

  .ball-icon-circle {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    overflow: hidden;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ball-svg {
    width: 100%;
    height: 100%;
  }

  .classic-ball {
    background: #f8fafc;
  }

  .retro-ball {
    background: #8c5226;
  }

  .neon-ball {
    background: #0e141e;
    box-shadow: 0 0 10px rgba(204, 255, 0, 0.5);
  }

  .ball-name {
    font-size: 12px;
    color: #ffffff;
  }

  .ball-desc {
    font-size: 10px;
    color: #8fa0b5;
  }

  .setting-row-box {
    background: #0f1624;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }

  .setting-row-box select {
    background: #161c26;
    color: #00e5ff;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
  }

  /* Kits Tab */
  .team-tab-pills {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .team-pill {
    flex: 1;
    padding: 8px;
    border-radius: 6px;
    background: #121a29;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #8fa0b5;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
  }

  .team-pill.active.red {
    background: rgba(231, 76, 60, 0.2);
    border-color: #e74c3c;
    color: #ff4d4d;
  }

  .team-pill.active.blue {
    background: rgba(52, 152, 219, 0.2);
    border-color: #3498db;
    color: #00e5ff;
  }

  .kits-layout-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .kits-controls-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .color-picker-row {
    background: #0f1624;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }

  .color-input-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color-input-group input[type='color'] {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }

  .hex-input {
    width: 65px;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 4px;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 2px 4px;
    text-align: center;
  }

  .patterns-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .pattern-btn {
    padding: 6px;
    border-radius: 4px;
    background: #121a29;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #dde2f1;
    font-size: 11px;
    cursor: pointer;
  }

  .pattern-btn.active {
    background: rgba(0, 229, 255, 0.18);
    border-color: #00e5ff;
    color: #00e5ff;
    font-weight: 700;
  }

  .kits-preview-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pitch-box {
    flex: 1;
    min-height: 140px;
    background: #0c1f14;
    border: 1px solid #1a3824;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .pitch-lines {
    position: absolute;
    inset: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    background-image: radial-gradient(circle, rgba(255, 255, 255, 0.15) 30px, transparent 31px);
    background-position: center;
    background-repeat: no-repeat;
  }

  .kit-disc {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border-width: 3px;
    border-style: solid;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 16px rgba(0, 0, 0, 0.8);
    overflow: hidden;
  }

  .pattern-overlay {
    position: absolute;
    inset: 0;
  }

  .vertical-stripes {
    background: repeating-linear-gradient(90deg, var(--c1) 0, var(--c1) 8px, var(--c2) 8px, var(--c2) 16px);
  }

  .hoop-stripes {
    background: repeating-linear-gradient(0deg, var(--c1) 0, var(--c1) 8px, var(--c2) 8px, var(--c2) 16px);
  }

  .halves-stripes {
    background: linear-gradient(90deg, var(--c1) 50%, var(--c2) 50%);
  }

  .captain-badge {
    position: relative;
    z-index: 10;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #111622;
    border: 1px solid #ffd700;
    color: #ffd700;
    font-size: 13px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .vision-pip {
    position: absolute;
    top: -2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00e5ff;
    box-shadow: 0 0 6px #00e5ff;
  }

  .preview-meta {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #8fa0b5;
  }

  .preview-meta .highlight {
    color: #00e5ff;
  }

  /* Club tab */
  .input-card {
    background: #0f1624;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
  }

  .input-card input {
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 4px;
    color: #ffffff;
    padding: 6px 8px;
    font-size: 12px;
  }

  .tag-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .live-tag-badge {
    background: rgba(0, 229, 255, 0.15);
    border: 1px solid #00e5ff;
    color: #00e5ff;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 800;
  }

  .avatar-mode-section {
    background: rgba(18, 26, 41, 0.65);
    border: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .avatar-mode-pills {
    display: flex;
    gap: 8px;
  }

  .mode-btn {
    padding: 6px 12px;
    border-radius: 4px;
    background: #121a29;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #8fa0b5;
    font-size: 11px;
    cursor: pointer;
  }

  .mode-btn.active {
    background: rgba(0, 229, 255, 0.18);
    border-color: #00e5ff;
    color: #00e5ff;
    font-weight: 700;
  }

  .initials-picker-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .initials-picker-row input {
    width: 60px;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 4px;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    font-weight: 800;
    padding: 6px;
    text-align: center;
  }

  .avatar-preview-circle {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #121a29;
    border: 1px solid #00e5ff;
    color: #00e5ff;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-palette-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }

  .emoji-btn {
    height: 36px;
    background: #121a29;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-btn.selected {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.35);
  }

  .emotes-info-card {
    background: #0f1624;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
  }

  .emotes-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .emote-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .emote-row code {
    background: #161c26;
    color: #00e5ff;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
  }

  @keyframes pulse {
    from {
      opacity: 0.6;
    }
    to {
      opacity: 1;
    }
  }
</style>
