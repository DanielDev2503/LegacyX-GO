<script lang="ts">
  import { gameUI, type BallSkinType, type PatternType } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { EMOJI_CATALOG } from '../utils/constants.js';
  import { tooltip } from '../actions/tooltip.js';

  type SettingsTab = 'controls' | 'audio' | 'video' | 'kits' | 'avatar';
  let activeTab = $state<SettingsTab>(
    gameUI.activeSettingsTab === 'club' ? 'avatar' : (gameUI.activeSettingsTab as SettingsTab) || 'controls'
  );

  // Keybinding remapping state
  let rebindingAction = $state<string | null>(null);

  // Audio accordions state
  let showChatAccordion = $state(false);
  let showSfxAccordion = $state(false);
  let showEnvAccordion = $state(false);

  // Kits preview state
  let activeKitTab = $state<'local' | 'visitor'>('local');
  let currentKit = $derived(activeKitTab === 'local' ? gameUI.settings.localKit : gameUI.settings.visitorKit);

  // Unificación de Identidad (Nombre y Siglas aplicables universalmente)
  let unifiedTeamName = $state(gameUI.settings.localKit.name || 'RED');
  let unifiedTeamTag = $state(gameUI.settings.localKit.tag || 'RED');

  function handleTeamNameChange() {
    gameUI.settings.localKit.name = unifiedTeamName;
    gameUI.settings.visitorKit.name = unifiedTeamName;
    gameUI.saveSettings();
  }

  function handleTeamTagChange(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.toUpperCase();
    unifiedTeamTag = val;
    gameUI.settings.localKit.tag = val;
    gameUI.settings.visitorKit.tag = val;
    gameUI.saveSettings();
  }

  // Contorno Negro (Checkbox: #000000 vs none)
  let hasOutline = $derived(
    currentKit.outlineColor !== 'none' && currentKit.outlineColor !== '' && currentKit.outlineColor !== undefined
  );

  function handleOutlineToggle(e: Event) {
    const target = e.target as HTMLInputElement;
    currentKit.outlineColor = target.checked ? '#000000' : 'none';
    gameUI.saveSettings();
  }

  // Avatar state
  let initialsInput = $state(gameUI.avatarMode === 'letters' ? gameUI.avatarValue : '10');
  let selectedEmoji = $state(gameUI.avatarMode === 'emoji' ? gameUI.avatarValue : '⚽');
  let avatarFormat = $state<'letters' | 'emoji'>(gameUI.avatarMode);

  // New trigger draft inputs
  let newTriggerWord = $state('');
  let newTriggerEmoji = $state<string>(EMOJI_CATALOG[0] || '⚽');

  const EMOJI_PALETTE = EMOJI_CATALOG;

  const PATTERNS_LIST = [
    { id: 'solid', name: 'Liso' },
    { id: 'vertical', name: 'Franjas verticales' },
    { id: 'hoop', name: 'Franja horizontal' },
    { id: 'vertical_stripe', name: 'Franja vertical' },
    { id: 'diagonal_right', name: 'Franja diagonal derecha' },
    { id: 'diagonal_left', name: 'Franja diagonal izquierda' },
    { id: 'halves', name: 'Mitades' },
    { id: 'checkerboard', name: 'Cuadros' }
  ] as const;

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

  function startRebind(action: string) {
    soundFX.playUIClick();
    rebindingAction = action;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (rebindingAction) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        rebindingAction = null;
        return;
      }
      gameUI.remapKey(rebindingAction as any, e.code);
      rebindingAction = null;
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();      handleClose();
      e.stopPropagation();
    }
  }

  function getKeyLabel(codes: string[] | undefined): string {
    if (!codes || codes.length === 0) return 'Sin asignar';
    const code = codes[0]!;
    if (code === 'Space') return 'Espacio';
    if (code === 'ShiftLeft') return 'Shift Izq';
    if (code === 'ShiftRight') return 'Shift Der';
    if (code === 'ArrowUp') return 'Flecha Arriba';
    if (code === 'ArrowDown') return 'Flecha Abajo';
    if (code === 'ArrowLeft') return 'Flecha Izq';
    if (code === 'ArrowRight') return 'Flecha Der';
    if (code === 'Enter') return 'Enter';
    if (code === 'Escape') return 'Esc';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }

  function handleResetControls() {
    soundFX.playUIClick();
    gameUI.resetKeybinds();
  }

  function handleResetGraphics() {
    soundFX.playUIClick();
    gameUI.resetGraphicsSettings();
  }

  // Avatar updates sync to gameUI
  function setAvatarMode(mode: 'letters' | 'emoji') {
    soundFX.playUIClick();
    avatarFormat = mode;
    gameUI.avatarMode = mode;
    if (mode === 'letters') {
      const clean = initialsInput.trim().toUpperCase().slice(0, 2) || (gameUI.nickname ? gameUI.nickname.trim().slice(0, 2).toUpperCase() : '10');
      gameUI.avatarValue = clean;
      gameUI.saveProfile(gameUI.nickname, clean);
    } else {
      gameUI.avatarValue = selectedEmoji;
      gameUI.saveProfile(gameUI.nickname, selectedEmoji);
    }
  }

  function handleInitialsChange(val: string) {
    initialsInput = val.trim().toUpperCase().slice(0, 2);
    if (avatarFormat === 'letters') {
      const clean = initialsInput || (gameUI.nickname ? gameUI.nickname.trim().slice(0, 2).toUpperCase() : '10');
      gameUI.avatarValue = clean;
      gameUI.saveProfile(gameUI.nickname, clean);
    }
  }

  function handleEmojiSelect(emoji: string) {
    soundFX.playUIClick();
    selectedEmoji = emoji;
    if (avatarFormat === 'emoji') {
      gameUI.avatarValue = emoji;
      gameUI.saveProfile(gameUI.nickname, emoji);
    }
  }

  // Emote Triggers Table Helpers
  function addEmoteTrigger() {
    const word = newTriggerWord.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const emoji = newTriggerEmoji.trim() || '⚽';
    if (!word) return;

    soundFX.playUIClick();
    const existingIndex = gameUI.settings.emoteTriggers.findIndex((t) => t.trigger === word);
    if (existingIndex >= 0) {
      gameUI.settings.emoteTriggers[existingIndex]!.emoji = emoji;
    } else {
      gameUI.settings.emoteTriggers = [...gameUI.settings.emoteTriggers, { trigger: word, emoji }];
    }
    newTriggerWord = '';
    gameUI.saveSettings();
  }

  function removeEmoteTrigger(index: number) {
    soundFX.playUIClick();
    gameUI.settings.emoteTriggers = gameUI.settings.emoteTriggers.filter((_, i) => i !== index);
    gameUI.saveSettings();
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- Botón flotante Volver en la parte superior izquierda de la pantalla -->
<button
  type="button"
  class="floating-back-btn"
  onclick={handleClose}
  title="Volver"
>
  <svg class="back-arrow-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
  <span>Volver</span>
</button>

<div
  class="modal-backdrop"
  role="presentation"
  onclick={handleBackdropClick}
>
  <div class="settings-modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
    <!-- Panel Izquierdo: Encabezado y Lista vertical continua de 5 Pestañas -->
    <aside class="tabs-sidebar">
      <div class="sidebar-header">
        <span class="settings-icon-box">⚙️</span>
        <div>
          <h2 id="settings-dialog-title" class="main-header">Ajustes generales</h2>
          <span class="sub-header">CONFIGURACIÓN</span>
        </div>
      </div>

      <nav class="nav-tabs" aria-label="Pestañas de ajustes">
        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'controls'}
          onclick={() => switchTab('controls')}
        >
          <span class="tab-icon">🎮</span>
          <span class="tab-label">Controles</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'audio'}
          onclick={() => switchTab('audio')}
        >
          <span class="tab-icon">🔊</span>
          <span class="tab-label">Sonido</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'video'}
          onclick={() => switchTab('video')}
        >
          <span class="tab-icon">🖥️</span>
          <span class="tab-label">Video y gráficos</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'kits'}
          onclick={() => switchTab('kits')}
        >
          <span class="tab-icon">👕</span>
          <span class="tab-label">Equipaciones</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={activeTab === 'avatar'}
          onclick={() => switchTab('avatar')}
        >
          <span class="tab-icon">🎭</span>
          <span class="tab-label">Avatar y emotes</span>
        </button>
      </nav>
    </aside>

    <!-- Panel Derecho: Scroll independiente para la sección activa -->
    <div class="tab-content" role="region" aria-label="Contenido de la sección seleccionada">
      <!-- ======================================================== -->
      <!-- SECCIÓN 1: CONTROLES                                     -->
      <!-- ======================================================== -->
      {#if activeTab === 'controls'}
        <div class="tab-pane">
          <div class="section-header-row">
            <h3 class="section-heading">Configuración de Controles</h3>
            {#if rebindingAction}
              <span class="pulse-rebinding">Presiona una tecla para asignar...</span>
            {/if}
          </div>

          <div class="controls-scroll-area">
            <!-- Desplazamiento y Movimiento -->
            <div class="controls-card">
              <h4 class="card-title">Desplazamiento y Movimiento</h4>
              <div class="grid-2col">
                <div class="bind-row">
                  <span class="bind-name">Arriba</span>
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
                  <span class="bind-name">Abajo</span>
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
                  <span class="bind-name">Izquierda</span>
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
                  <span class="bind-name">Derecha</span>
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

            <!-- Acciones Principales y Disparo -->
            <div class="controls-card">
              <h4 class="card-title">Acciones Principales y Disparo</h4>
              <div class="grid-2col">
                <div class="bind-row">
                  <div>
                    <span class="bind-name">Patear / Remate</span>
                    <small class="bind-hint">Contacto balístico o pase</small>
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
                    <span class="bind-name">Turbo / Sprint</span>
                    <small class="bind-hint">Velocidad extra constante</small>
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
                    <span class="bind-name">Dash (Impulso)</span>
                    <small class="bind-hint">Aceleración explosiva instantánea</small>
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
                    <span class="bind-name">Curva Magnus Izquierda</span>
                    <small class="bind-hint">Efecto con giro antihorario</small>
                  </div>
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
                  <div>
                    <span class="bind-name">Curva Magnus Derecha</span>
                    <small class="bind-hint">Efecto con giro horario</small>
                  </div>
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

            <!-- Subsección: Interacción con la interfaz -->
            <div class="controls-card">
              <h4 class="card-title">Interacción con la interfaz</h4>
              <div class="grid-2col">
                <div class="bind-row">
                  <div>
                    <span class="bind-name">Pausar partida</span>
                    <small class="bind-hint">Congelar o reanudar el juego</small>
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

                <div class="bind-row">
                  <div>
                    <span class="bind-name">Abrir menú / Cancelar</span>
                    <small class="bind-hint">Cerrar modales o pausar</small>
                  </div>
                  <button
                    type="button"
                    class="key-badge"
                    class:rebinding={rebindingAction === 'menu'}
                    onclick={() => startRebind('menu')}
                  >
                    {rebindingAction === 'menu' ? '...' : getKeyLabel(gameUI.keybinds.menu)}
                  </button>
                </div>

                <div class="bind-row">
                  <div>
                    <span class="bind-name">Interactuar con el chat</span>
                    <small class="bind-hint">Abrir o enviar mensajes</small>
                  </div>
                  <button
                    type="button"
                    class="key-badge"
                    class:rebinding={rebindingAction === 'chat'}
                    onclick={() => startRebind('chat')}
                  >
                    {rebindingAction === 'chat' ? '...' : getKeyLabel(gameUI.keybinds.chat)}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer con reset -->
          <div class="pane-footer">
            <button
              type="button"
              class="btn-reset"
              onclick={handleResetControls}
            >
              ↺ Restablecer controles por defecto
            </button>
          </div>
        </div>

      <!-- ======================================================== -->
      <!-- SECCIÓN 2: SONIDO                                        -->
      <!-- ======================================================== -->
      {:else if activeTab === 'audio'}
        <div class="tab-pane">
          <div class="section-header-row">
            <h3 class="section-heading">Audio y Efectos Sonoros</h3>
          </div>

          <div class="settings-scroll-area">
            <!-- Full-Width Master Volume Card con switch de "Silenciar todo" integrado -->
            <div class="master-volume-card">
              <div class="master-header">
                <div class="master-title-box">
                  <span class="master-icon">🔊</span>
                  <div>
                    <strong class="master-title">Audio General (Master)</strong>
                    <span class="master-desc">Control maestro de ganancia acústica</span>
                  </div>
                </div>

                <div class="mute-all-toggle-wrap">
                  <span class="mute-label" class:muted-active={gameUI.settings.isMuted}>
                    {gameUI.settings.isMuted ? 'Silenciado' : 'Silenciar todo'}
                  </span>
                  <label class="switch-toggle" aria-label="Silenciar todo el audio">
                    <input
                      type="checkbox"
                      checked={gameUI.settings.isMuted}
                      onchange={(e) => {
                        gameUI.settings.isMuted = (e.currentTarget as HTMLInputElement).checked;
                        soundFX.setMuted(gameUI.settings.isMuted);
                        gameUI.saveSettings();
                      }}
                    />
                    <span class="toggle-slider mute-slider" class:muted-active={gameUI.settings.isMuted}></span>
                  </label>
                </div>
              </div>

              <div class="master-slider-row">
                <input
                  type="range"
                  class="custom-slider master-slider"
                  min="0"
                  max="1"
                  step="0.01"
                  style="--val-percent: {Math.round(gameUI.settings.masterVolume * 100)}%;"
                  value={gameUI.settings.masterVolume}
                  oninput={(e) => {
                    gameUI.settings.masterVolume = Number((e.currentTarget as HTMLInputElement).value);
                    soundFX.setMasterVolume(gameUI.settings.masterVolume);
                    gameUI.saveSettings();
                  }}
                />
                <span class="volume-percent-large">{Math.round(gameUI.settings.masterVolume * 100)}%</span>
              </div>
            </div>

            <!-- Grupos secundarios en Rejilla de 2 Columnas (Desactivados en Mute) -->
            <div class="sound-grid-2col" class:sound-disabled={gameUI.settings.isMuted}>
              <!-- COLUMNA 1: Chat y Social -->
              <div class="channel-card">
                <div class="channel-header">
                  <div class="channel-info">
                    <span class="channel-name">Chat y Social</span>
                    <span class="channel-desc">Mensajes, menciones y emotes</span>
                  </div>
                  <div class="channel-actions">
                    <span class="channel-val">{Math.round(gameUI.settings.chatVolume * 100)}%</span>
                    <button
                      type="button"
                      class="accordion-btn"
                      onclick={() => (showChatAccordion = !showChatAccordion)}
                      title="Opciones individuales de chat"
                    >
                      {showChatAccordion ? '▲ Menos' : '▼ Opciones'}
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  class="custom-slider"
                  min="0"
                  max="1"
                  step="0.01"
                  style="--val-percent: {Math.round(gameUI.settings.chatVolume * 100)}%;"
                  value={gameUI.settings.chatVolume}
                  oninput={(e) => {
                    gameUI.settings.chatVolume = Number((e.currentTarget as HTMLInputElement).value);
                    gameUI.saveSettings();
                  }}
                />

                {#if showChatAccordion}
                  <div class="subtoggles-box">
                    <div class="subtoggle-row">
                      <span>Notificación chat</span>
                      <label class="switch-toggle mini" aria-label="Notificación chat">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.chatNormalSoundEnabled}
                          onchange={(e) => {
                            gameUI.settings.chatNormalSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>

                    <div class="subtoggle-row">
                      <span>Menciones</span>
                      <label class="switch-toggle mini" aria-label="Menciones">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.chatMentionSoundEnabled}
                          onchange={(e) => {
                            gameUI.settings.chatMentionSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>

                    <div class="subtoggle-row">
                      <span>Emotes</span>
                      <label class="switch-toggle mini" aria-label="Emotes">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.chatEmotesSoundEnabled}
                          onchange={(e) => {
                            gameUI.settings.chatEmotesSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                {/if}
              </div>

              <!-- COLUMNA 2: SFX + Entorno -->
              <div class="col-sfx-env">
                <!-- SFX Card -->
                <div class="channel-card">
                  <div class="channel-header">
                    <div class="channel-info">
                      <span class="channel-name">Efectos (SFX)</span>
                      <span class="channel-desc">Impactos mecánicos y balísticos</span>
                    </div>
                    <div class="channel-actions">
                      <span class="channel-val">{Math.round(gameUI.settings.sfxVolume * 100)}%</span>
                      <button
                        type="button"
                        class="accordion-btn"
                        onclick={() => (showSfxAccordion = !showSfxAccordion)}
                        title="Opciones individuales de SFX"
                      >
                        {showSfxAccordion ? '▲ Menos' : '▼ Opciones'}
                      </button>
                    </div>
                  </div>

                  <input
                    type="range"
                    class="custom-slider"
                    min="0"
                    max="1"
                    step="0.01"
                    style="--val-percent: {Math.round(gameUI.settings.sfxVolume * 100)}%;"
                    value={gameUI.settings.sfxVolume}
                    oninput={(e) => {
                      gameUI.settings.sfxVolume = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />

                  {#if showSfxAccordion}
                    <div class="subtoggles-box">
                      <div class="subtoggle-row">
                        <span>Disparo / Remate</span>
                        <label class="switch-toggle mini" aria-label="Disparo / Remate">
                          <input
                            type="checkbox"
                            checked={gameUI.settings.kickSoundEnabled}
                            onchange={(e) => {
                              gameUI.settings.kickSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                              gameUI.saveSettings();
                            }}
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>

                      <div class="subtoggle-row">
                        <span>Postes</span>
                        <label class="switch-toggle mini" aria-label="Postes">
                          <input
                            type="checkbox"
                            checked={gameUI.settings.postHitSoundEnabled}
                            onchange={(e) => {
                              gameUI.settings.postHitSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                              gameUI.saveSettings();
                            }}
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                  {/if}
                </div>

                <!-- Entorno Card -->
                <div class="channel-card">
                  <div class="channel-header">
                    <div class="channel-info">
                      <span class="channel-name">Entorno</span>
                      <span class="channel-desc">Silbato, ovaciones y ambiente</span>
                    </div>
                    <div class="channel-actions">
                      <span class="channel-val">{Math.round(gameUI.settings.envVolume * 100)}%</span>
                      <button
                        type="button"
                        class="accordion-btn"
                        onclick={() => (showEnvAccordion = !showEnvAccordion)}
                        title="Opciones individuales de entorno"
                      >
                        {showEnvAccordion ? '▲ Menos' : '▼ Opciones'}
                      </button>
                    </div>
                  </div>

                  <input
                    type="range"
                    class="custom-slider"
                    min="0"
                    max="1"
                    step="0.01"
                    style="--val-percent: {Math.round(gameUI.settings.envVolume * 100)}%;"
                    value={gameUI.settings.envVolume}
                    oninput={(e) => {
                      gameUI.settings.envVolume = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />

                  {#if showEnvAccordion}
                    <div class="subtoggles-box">
                      <div class="subtoggle-row">
                        <span>Silbato</span>
                        <label class="switch-toggle mini" aria-label="Silbato">
                          <input
                            type="checkbox"
                            checked={gameUI.settings.whistleSoundEnabled}
                            onchange={(e) => {
                              gameUI.settings.whistleSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                              gameUI.saveSettings();
                            }}
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>

                      <div class="subtoggle-row">
                        <span>Bocina de gol</span>
                        <label class="switch-toggle mini" aria-label="Bocina de gol">
                          <input
                            type="checkbox"
                            checked={gameUI.settings.goalSoundEnabled}
                            onchange={(e) => {
                              gameUI.settings.goalSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                              gameUI.saveSettings();
                            }}
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>

                      <div class="subtoggle-row">
                        <span>Gradas / Ovación</span>
                        <label class="switch-toggle mini" aria-label="Gradas y ovación">
                          <input
                            type="checkbox"
                            checked={gameUI.settings.crowdSoundEnabled}
                            onchange={(e) => {
                              gameUI.settings.crowdSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                              gameUI.saveSettings();
                            }}
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>

                      <div class="subtoggle-row">
                        <span>Ambiente</span>
                        <label class="switch-toggle mini" aria-label="Ambiente">
                          <input
                            type="checkbox"
                            checked={gameUI.settings.ambientSoundEnabled}
                            onchange={(e) => {
                              gameUI.settings.ambientSoundEnabled = (e.currentTarget as HTMLInputElement).checked;
                              gameUI.saveSettings();
                            }}
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>

      <!-- ======================================================== -->
      <!-- SECCIÓN 3: VIDEO Y GRÁFICOS                              -->
      <!-- ======================================================== -->
      {:else if activeTab === 'video'}
        <div class="tab-pane">
          <div class="section-header-row">
            <h3 class="section-heading">Video y Gráficos</h3>
          </div>

          <div class="settings-scroll-area">
            <div class="video-grid-2col">
              <!-- COLUMNA 1: Cámara e Interfaz -->
              <div class="graphics-card">
                <h4 class="card-title">Cámara e Interfaz</h4>

                <!-- Zoom de la cámara -->
                <div class="slider-row">
                  <div class="slider-meta">
                    <span class="param-name label-with-tooltip">
                      Zoom de la cámara
                      <span
                        class="info-tooltip-wrapper"
                        tabindex="0"
                        role="button"
                        aria-label="Info zoom"
                        use:tooltip={"Nivel de magnificación de la cámara respecto a la acción"}
                      >
                        <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                      </span>
                    </span>
                    <strong class="param-val">{gameUI.settings.cameraZoom.toFixed(2)}x</strong>
                  </div>
                  <input
                    type="range"
                    class="custom-slider"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    style="--val-percent: {((gameUI.settings.cameraZoom - 0.7) / 0.8) * 100}%;"
                    value={gameUI.settings.cameraZoom}
                    oninput={(e) => {
                      gameUI.settings.cameraZoom = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />
                </div>

                <!-- Opacidad del minimapa -->
                <div class="slider-row pt-2">
                  <div class="slider-meta">
                    <span class="param-name label-with-tooltip">
                      Opacidad del minimapa
                      <span
                        class="info-tooltip-wrapper"
                        tabindex="0"
                        role="button"
                        aria-label="Info opacidad minimapa"
                        use:tooltip={"Transparencia del radar sobre el campo de juego"}
                      >
                        <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                      </span>
                    </span>
                    <strong class="param-val">{Math.round(gameUI.settings.minimapOpacity)}%</strong>
                  </div>
                  <input
                    type="range"
                    class="custom-slider"
                    min="10"
                    max="100"
                    step="5"
                    style="--val-percent: {((gameUI.settings.minimapOpacity - 10) / 90) * 100}%;"
                    value={gameUI.settings.minimapOpacity}
                    oninput={(e) => {
                      gameUI.settings.minimapOpacity = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />
                </div>

                <!-- Opacidad del chat -->
                <div class="slider-row pt-2">
                  <div class="slider-meta">
                    <span class="param-name label-with-tooltip">
                      Opacidad del chat
                      <span
                        class="info-tooltip-wrapper"
                        tabindex="0"
                        role="button"
                        aria-label="Info opacidad chat"
                        use:tooltip={"Transparencia del cuadro de chat durante el partido"}
                      >
                        <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                      </span>
                    </span>
                    <strong class="param-val">{Math.round(gameUI.settings.chatOpacity)}%</strong>
                  </div>
                  <input
                    type="range"
                    class="custom-slider"
                    min="10"
                    max="100"
                    step="5"
                    style="--val-percent: {((gameUI.settings.chatOpacity - 10) / 90) * 100}%;"
                    value={gameUI.settings.chatOpacity}
                    oninput={(e) => {
                      gameUI.settings.chatOpacity = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />
                </div>

                <!-- Tamaño del minimapa -->
                <div class="segmented-control-row pt-3">
                  <span class="param-name">Tamaño del minimapa</span>
                  <div class="segmented-pills">
                    <button
                      type="button"
                      class="seg-pill"
                      class:active={gameUI.settings.minimapSize === 'small'}
                      onclick={() => {
                        gameUI.settings.minimapSize = 'small';
                        gameUI.saveSettings();
                      }}
                    >
                      Pequeño
                    </button>
                    <button
                      type="button"
                      class="seg-pill"
                      class:active={gameUI.settings.minimapSize === 'medium'}
                      onclick={() => {
                        gameUI.settings.minimapSize = 'medium';
                        gameUI.saveSettings();
                      }}
                    >
                      Mediano
                    </button>
                    <button
                      type="button"
                      class="seg-pill"
                      class:active={gameUI.settings.minimapSize === 'large'}
                      onclick={() => {
                        gameUI.settings.minimapSize = 'large';
                        gameUI.saveSettings();
                      }}
                    >
                      Grande
                    </button>
                  </div>
                </div>

                <!-- Toggles Interfaz -->
                <div class="toggles-column pt-3">
                  <div class="toggle-item">
                    <span class="label-with-tooltip">
                      Minimapa activo
                      <span
                        class="info-tooltip-wrapper"
                        tabindex="0"
                        role="button"
                        aria-label="Info minimapa"
                        use:tooltip={"Radar táctico de posiciones en la esquina de la pantalla"}
                      >
                        <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                      </span>
                    </span>
                    <label class="switch-toggle" aria-label="Minimapa activo">
                      <input
                        type="checkbox"
                        checked={gameUI.settings.minimapEnabled}
                        onchange={(e) => {
                          gameUI.settings.minimapEnabled = (e.currentTarget as HTMLInputElement).checked;
                          gameUI.saveSettings();
                        }}
                      />
                      <span class="toggle-slider"></span>
                    </label>
                  </div>

                  <div class="toggle-item">
                    <span class="label-with-tooltip">
                      Cono de visión en minimapa
                      <span
                        class="info-tooltip-wrapper"
                        tabindex="0"
                        role="button"
                        aria-label="Info cono de visión"
                        use:tooltip={"Área proyectada de la cámara visible en el radar"}
                      >
                        <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                      </span>
                    </span>
                    <label class="switch-toggle" aria-label="Cono de visión de cámara">
                      <input
                        type="checkbox"
                        checked={gameUI.settings.cameraFrustumOnMinimap}
                        onchange={(e) => {
                          gameUI.settings.cameraFrustumOnMinimap = (e.currentTarget as HTMLInputElement).checked;
                          gameUI.settings.minimapCameraFrustum = gameUI.settings.cameraFrustumOnMinimap;
                          gameUI.saveSettings();
                        }}
                      />
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- COLUMNA 2: Efectos de Cancha y Personalización del Balón -->
              <div class="col-visuals-ball">
                <!-- Efectos Visuales de Cancha -->
                <div class="graphics-card">
                  <h4 class="card-title">Efectos Visuales de Cancha</h4>
                  <div class="toggles-column">
                    <div class="toggle-item">
                      <span class="label-with-tooltip">
                        Sacudida de pantalla (Screen shake)
                        <span
                          class="info-tooltip-wrapper"
                          tabindex="0"
                          role="button"
                          aria-label="Info screen shake"
                          use:tooltip={"Vibración sutil al impactar postes o marcar gol"}
                        >
                          <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </span>
                      </span>
                      <label class="switch-toggle" aria-label="Screen shake">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.screenShakeEnabled}
                          onchange={(e) => {
                            gameUI.settings.screenShakeEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.settings.goalShakeEnabled = gameUI.settings.screenShakeEnabled;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>

                    <div class="toggle-item">
                      <span class="label-with-tooltip">
                        Resplandor / Aura en jugadores
                        <span
                          class="info-tooltip-wrapper"
                          tabindex="0"
                          role="button"
                          aria-label="Info aura"
                          use:tooltip={"Aura neón distintiva alrededor del disco del jugador"}
                        >
                          <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </span>
                      </span>
                      <label class="switch-toggle" aria-label="Resplandor de jugadores">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.playerGlowEnabled}
                          onchange={(e) => {
                            gameUI.settings.playerGlowEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>

                    <div class="toggle-item">
                      <span class="label-with-tooltip">
                        Estela de curva Magnus
                        <span
                          class="info-tooltip-wrapper"
                          tabindex="0"
                          role="button"
                          aria-label="Info estela"
                          use:tooltip={"Rastro visual curvado al aplicar efecto de giro al balón"}
                        >
                          <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </span>
                      </span>
                      <label class="switch-toggle" aria-label="Estela de curva Magnus">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.magnusTrailEnabled}
                          onchange={(e) => {
                            gameUI.settings.magnusTrailEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.settings.ballTrailEnabled = gameUI.settings.magnusTrailEnabled;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>

                    <div class="toggle-item">
                      <span class="label-with-tooltip">
                        Efecto de fuego en tiros (&gt;950 px/s)
                        <span
                          class="info-tooltip-wrapper"
                          tabindex="0"
                          role="button"
                          aria-label="Info fuego"
                          use:tooltip={"Llamas visuales en lanzamientos de alta potencia"}
                        >
                          <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </span>
                      </span>
                      <label class="switch-toggle" aria-label="Efecto de fuego">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.fireShotEnabled}
                          onchange={(e) => {
                            gameUI.settings.fireShotEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>

                    <div class="toggle-item">
                      <span class="label-with-tooltip">
                        Textos flotantes de puntos / eventos
                        <span
                          class="info-tooltip-wrapper"
                          tabindex="0"
                          role="button"
                          aria-label="Info textos flotantes"
                          use:tooltip={"Notificaciones dinámicas de puntos y eventos en pantalla"}
                        >
                          <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </span>
                      </span>
                      <label class="switch-toggle" aria-label="Textos flotantes">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.floatingPointsEnabled}
                          onchange={(e) => {
                            gameUI.settings.floatingPointsEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>

                    <div class="toggle-item">
                      <span class="label-with-tooltip">
                        Indicadores perimetrales
                        <span
                          class="info-tooltip-wrapper"
                          tabindex="0"
                          role="button"
                          aria-label="Info indicadores"
                          use:tooltip={"Flechas direccionales para jugadores fuera de pantalla"}
                        >
                          <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                          </svg>
                        </span>
                      </span>
                      <label class="switch-toggle" aria-label="Indicadores perimetrales">
                        <input
                          type="checkbox"
                          checked={gameUI.settings.offscreenIndicatorsEnabled}
                          onchange={(e) => {
                            gameUI.settings.offscreenIndicatorsEnabled = (e.currentTarget as HTMLInputElement).checked;
                            gameUI.settings.offscreenIndicators = gameUI.settings.offscreenIndicatorsEnabled;
                            gameUI.saveSettings();
                          }}
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>
                  </div>
                </div>

                <!-- Personalización del Balón -->
                <div class="graphics-card">
                  <div class="card-header-flex">
                    <h4 class="card-title">Personalización del Balón</h4>
                    <div class="exclusive-mode-selector">
                      <button
                        type="button"
                        class="mode-choice-btn"
                        class:active={gameUI.settings.ballMode === 'texture'}
                        onclick={() => {
                          gameUI.settings.ballMode = 'texture';
                          gameUI.saveSettings();
                        }}
                      >
                        Diseño
                      </button>
                      <button
                        type="button"
                        class="mode-choice-btn"
                        class:active={gameUI.settings.ballMode === 'color'}
                        onclick={() => {
                          gameUI.settings.ballMode = 'color';
                          gameUI.saveSettings();
                        }}
                      >
                        Color sólido
                      </button>
                    </div>
                  </div>

                  {#if gameUI.settings.ballMode === 'texture'}
                    <div class="ball-cards-grid">
                      <!-- Clásico -->
                      <button
                        type="button"
                        class="ball-card"
                        class:selected={gameUI.settings.ballSkin === 'classic'}
                        onclick={() => {
                          gameUI.settings.ballSkin = 'classic';
                          gameUI.saveSettings();
                        }}
                      >
                        <div class="ball-circle classic-ball">
                          <svg viewBox="0 0 100 100" class="ball-svg">
                            <polygon fill="#080e18" points="50,30 65,42 60,60 40,60 35,42" />
                            <polygon fill="#f8fafc" points="50,5 30,12 22,25 35,42 50,30" />
                            <polygon fill="#f8fafc" points="50,5 70,12 78,25 65,42 50,30" />
                            <polygon fill="#080e18" points="40,60 60,60 70,80 50,95 30,80" />
                          </svg>
                        </div>
                        <strong class="ball-name">Clásico</strong>
                      </button>

                      <!-- Neón -->
                      <button
                        type="button"
                        class="ball-card"
                        class:selected={gameUI.settings.ballSkin === 'neon'}
                        onclick={() => {
                          gameUI.settings.ballSkin = 'neon';
                          gameUI.saveSettings();
                        }}
                      >
                        <div class="ball-circle neon-ball">
                          <svg viewBox="0 0 100 100" class="ball-svg">
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#ccff00" stroke-width="5" />
                            <circle cx="50" cy="50" r="5" fill="#00e5ff" />
                          </svg>
                        </div>
                        <strong class="ball-name">Neón</strong>
                      </button>

                      <!-- Retro -->
                      <button
                        type="button"
                        class="ball-card"
                        class:selected={gameUI.settings.ballSkin === 'retro'}
                        onclick={() => {
                          gameUI.settings.ballSkin = 'retro';
                          gameUI.saveSettings();
                        }}
                      >
                        <div class="ball-circle retro-ball">
                          <svg viewBox="0 0 100 100" class="ball-svg">
                            <path d="M 50,0 Q 55,50 50,100" fill="none" stroke="#3a1c06" stroke-width="3" />
                            <path d="M 25,0 Q 35,50 25,100" fill="none" stroke="#3a1c06" stroke-width="2.5" />
                            <path d="M 75,0 Q 65,50 75,100" fill="none" stroke="#3a1c06" stroke-width="2.5" />
                          </svg>
                        </div>
                        <strong class="ball-name">Retro</strong>
                      </button>

                      <!-- Fútbol Sala -->
                      <button
                        type="button"
                        class="ball-card"
                        class:selected={gameUI.settings.ballSkin === 'futsal'}
                        onclick={() => {
                          gameUI.settings.ballSkin = 'futsal';
                          gameUI.saveSettings();
                        }}
                      >
                        <div class="ball-circle futsal-ball">
                          <svg viewBox="0 0 100 100" class="ball-svg">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="#ff0055" stroke-width="4" stroke-dasharray="14 10" />
                            <polygon fill="#ffcc00" points="50,25 58,42 75,42 62,54 66,72 50,60 34,72 38,54 25,42 42,42" />
                          </svg>
                        </div>
                        <strong class="ball-name">Sala</strong>
                      </button>
                    </div>
                  {:else}
                    <div class="solid-color-picker-box">
                      <div class="color-preview-disc" style="background-color: {gameUI.settings.ballCustomColor};">
                        <div class="ball-shine-overlay"></div>
                      </div>
                      <div class="color-picker-inputs">
                        <label for="ball-hex-color">Color plano del balón</label>
                        <div class="inputs-row">
                          <input
                            id="ball-hex-color"
                            type="color"
                            value={gameUI.settings.ballCustomColor}
                            oninput={(e) => {
                              gameUI.settings.ballCustomColor = (e.currentTarget as HTMLInputElement).value;
                              gameUI.saveSettings();
                            }}
                          />
                          <input
                            type="text"
                            class="hex-text-input"
                            maxlength="7"
                            value={gameUI.settings.ballCustomColor}
                            oninput={(e) => {
                              const val = (e.currentTarget as HTMLInputElement).value;
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                gameUI.settings.ballCustomColor = val;
                                if (val.length === 7) gameUI.saveSettings();
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <!-- Footer con botón de reset siempre visible -->
          <div class="pane-footer">
            <button
              type="button"
              class="btn-reset"
              onclick={handleResetGraphics}
            >
              ↺ Restablecer valores gráficos por defecto
            </button>
          </div>
        </div>

      <!-- ======================================================== -->
      <!-- SECCIÓN 4: EQUIPACIONES                                  -->
      <!-- ======================================================== -->
      {:else if activeTab === 'kits'}
        <div class="tab-pane">
          <div class="section-header-row">
            <h3 class="section-heading label-with-tooltip">
              Equipaciones de Equipo
              <span
                class="info-tooltip-wrapper"
                tabindex="0"
                role="button"
                aria-label="Info capitán"
                use:tooltip={"Las modificaciones de nombre, siglas y equipación solo se aplicarán en partido si eres el Capitán del equipo (primer jugador listado en tu bando)."}
              >
                <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </span>
            </h3>
          </div>

          <!-- Bloque Superior de Identidad (Unificado) -->
          <div class="team-identity-block">
            <div class="input-group team-name-group">
              <label for="team-name-input">Nombre del Equipo</label>
              <input
                id="team-name-input"
                type="text"
                maxlength="25"
                bind:value={unifiedTeamName}
                oninput={handleTeamNameChange}
                placeholder="RED"
              />
            </div>

            <div class="input-group team-tag-group">
              <label for="team-tag-input">Siglas</label>
              <input
                id="team-tag-input"
                type="text"
                maxlength="4"
                value={unifiedTeamTag}
                oninput={handleTeamTagChange}
                placeholder="RED"
              />
            </div>
          </div>

          <!-- Tabs Local / Visitante -->
          <div class="team-filter-tabs">
            <button
              type="button"
              class="team-tab-pill local"
              class:active={activeKitTab === 'local'}
              onclick={() => (activeKitTab = 'local')}
            >
              🏠 Local
            </button>
            <button
              type="button"
              class="team-tab-pill visitor"
              class:active={activeKitTab === 'visitor'}
              onclick={() => (activeKitTab = 'visitor')}
            >
              ✈️ Visitante
            </button>
          </div>

          <div class="kits-layout-grid">
            <!-- Columna Izquierda: Colores, Contorno y Patrones -->
            <div class="kits-controls-col">
              <!-- Fila de 3 Colores: Primario, Secundario, Terciario (Borde y Dorsal) -->
              <div class="form-row-3col">
                <div class="color-picker-box">
                  <label for="kit-color-primary">Primario</label>
                  <div class="color-control">
                    <input
                      id="kit-color-primary"
                      type="color"
                      bind:value={currentKit.primaryColor}
                      oninput={() => gameUI.saveSettings()}
                    />
                    <input
                      type="text"
                      class="hex-mini-input"
                      maxlength="7"
                      bind:value={currentKit.primaryColor}
                      oninput={() => gameUI.saveSettings()}
                    />
                  </div>
                </div>

                <div class="color-picker-box">
                  <label for="kit-color-secondary">Secundario</label>
                  <div class="color-control">
                    <input
                      id="kit-color-secondary"
                      type="color"
                      bind:value={currentKit.secondaryColor}
                      oninput={() => gameUI.saveSettings()}
                    />
                    <input
                      type="text"
                      class="hex-mini-input"
                      maxlength="7"
                      bind:value={currentKit.secondaryColor}
                      oninput={() => gameUI.saveSettings()}
                    />
                  </div>
                </div>

                <div class="color-picker-box">
                  <label for="kit-color-tertiary">Borde/Dorsal</label>
                  <div class="color-control">
                    <input
                      id="kit-color-tertiary"
                      type="color"
                      value={currentKit.tertiaryColor || '#ffffff'}
                      oninput={(e) => {
                        currentKit.tertiaryColor = (e.currentTarget as HTMLInputElement).value;
                        gameUI.saveSettings();
                      }}
                    />
                    <input
                      type="text"
                      class="hex-mini-input"
                      maxlength="7"
                      value={currentKit.tertiaryColor || '#ffffff'}
                      oninput={(e) => {
                        const val = (e.currentTarget as HTMLInputElement).value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                          currentKit.tertiaryColor = val;
                          if (val.length === 7) gameUI.saveSettings();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <!-- Casilla Checkbox: Contorno Negro en Textos y Números -->
              <div class="checkbox-option-box">
                <label class="checkbox-label" for="kit-outline-checkbox">
                  <input
                    type="checkbox"
                    id="kit-outline-checkbox"
                    checked={hasOutline}
                    onchange={handleOutlineToggle}
                  />
                  <span class="checkbox-custom"></span>
                  <span class="checkbox-text">Activar contorno negro en textos y números</span>
                </label>
              </div>

              <!-- Rejilla de 8 Patrones Visuales (sin etiquetas de texto) -->
              <span class="group-subtitle pt-1">Patrón de Camiseta</span>
              <div class="patterns-grid">
                {#each PATTERNS_LIST as pattern}
                  <button
                    type="button"
                    class="pattern-card"
                    class:active={currentKit.pattern === pattern.id}
                    onclick={() => {
                      currentKit.pattern = pattern.id as PatternType;
                      gameUI.saveSettings();
                    }}
                    title={pattern.name}
                    aria-label={pattern.name}
                  >
                    <div
                      class="pattern-sample {pattern.id}"
                      style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"
                    ></div>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Columna Derecha: Previsualización en Vivo de Cancha (Disco + Marcador) -->
            <div class="kits-preview-col">
              <span class="preview-title">Previsualización</span>
              <div class="tactical-pitch-box">
                <div class="tactical-pitch-lines"></div>

                <!-- Disco del Jugador Capitán -->
                <div class="pitch-preview-cell">
                  <span class="pitch-preview-label">Camiseta</span>
                  <div
                    class="kit-live-disc"
                    style="background-color: {currentKit.primaryColor}; border-color: {currentKit.tertiaryColor || currentKit.secondaryColor};"
                  >
                    {#if currentKit.pattern === 'vertical'}
                      <div class="live-pattern-overlay vertical-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'hoop'}
                      <div class="live-pattern-overlay hoop-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'vertical_stripe'}
                      <div class="live-pattern-overlay vertical-stripe-center" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'diagonal_right' || currentKit.pattern === 'diagonal'}
                      <div class="live-pattern-overlay diagonal-right-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'diagonal_left'}
                      <div class="live-pattern-overlay diagonal-left-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'halves'}
                      <div class="live-pattern-overlay halves-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'checkerboard' || currentKit.pattern === 'diagonal_checks'}
                      <div class="live-pattern-overlay checkerboard-pattern" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'cross'}
                      <div class="live-pattern-overlay cross-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'chevrons'}
                      <div class="live-pattern-overlay chevrons-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {/if}

                    <span
                      class="captain-badge"
                      style="
                        color: {currentKit.tertiaryColor || '#ffffff'};
                        -webkit-text-stroke: {hasOutline ? '1.5px #000000' : 'none'};
                        text-shadow: {hasOutline ? '-1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000' : 'none'};
                      "
                    >10</span>
                  </div>
                </div>

                <!-- Miniatura de Marcador -->
                <div class="pitch-preview-cell">
                  <span class="pitch-preview-label">Marcador</span>
                  <div
                    class="scoreboard-preview-badge"
                    style="
                      background: linear-gradient(90deg, {currentKit.primaryColor} 50%, {currentKit.secondaryColor} 50%);
                      border: 1.5px solid {currentKit.tertiaryColor || '#ffffff'};
                      color: {currentKit.tertiaryColor || '#ffffff'};
                      text-shadow: {hasOutline ? '-1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000' : 'none'};
                    "
                  >
                    {currentKit.tag || unifiedTeamTag || 'RED'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      <!-- ======================================================== -->
      <!-- SECCIÓN 5: AVATAR Y EMOTES                               -->
      <!-- ======================================================== -->
      {:else if activeTab === 'avatar'}
        <div class="tab-pane">
          <div class="section-header-row">
            <h3 class="section-heading">Avatar y emotes</h3>
          </div>

          <div class="settings-scroll-area">
            <!-- Editor compacto estilo Gatekeeper (disco izquierda, selector derecha) -->
            <div class="compact-avatar-editor">
              <div class="avatar-disc-side">
                <div class="hero-disc-circle">
                  {#if avatarFormat === 'letters'}
                    <span class="hero-disc-text">{initialsInput || '10'}</span>
                  {:else}
                    <span class="hero-disc-emoji">{selectedEmoji}</span>
                  {/if}
                  <div class="hero-disc-shine"></div>
                </div>
                <span class="player-nick-badge">{gameUI.nickname}</span>
              </div>

              <div class="avatar-controls-cartucho">
                <div class="avatar-mode-segmented">
                  <button
                    type="button"
                    class="mode-seg-btn"
                    class:active={avatarFormat === 'letters'}
                    onclick={() => setAvatarMode('letters')}
                  >
                    Letras / Números
                  </button>
                  <button
                    type="button"
                    class="mode-seg-btn"
                    class:active={avatarFormat === 'emoji'}
                    onclick={() => setAvatarMode('emoji')}
                  >
                    Emojis
                  </button>
                </div>

                {#if avatarFormat === 'letters'}
                  <div class="initials-compact-row">
                    <label for="initials-field">Dorsal / Iniciales (máx. 2):</label>
                    <input
                      id="initials-field"
                      type="text"
                      class="initials-input-field"
                      maxlength="2"
                      value={initialsInput}
                      oninput={(e) => handleInitialsChange((e.currentTarget as HTMLInputElement).value)}
                      placeholder="10"
                    />
                  </div>
                {:else}
                  <div class="emoji-compact-grid">
                    {#each EMOJI_PALETTE as emoji}
                      <button
                        type="button"
                        class="emoji-choice-btn-compact"
                        class:selected={selectedEmoji === emoji}
                        onclick={() => handleEmojiSelect(emoji)}
                        aria-label={`Seleccionar avatar ${emoji}`}
                      >
                        {emoji}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Toggler de Emotes en Cancha con Tooltip Explicativo -->
            <div class="emotes-toggle-card">
              <div class="toggle-card-head">
                <div class="toggle-card-info">
                  <div class="label-with-tooltip">
                    <strong class="toggle-card-title">Mostrar emotes flotantes en cancha</strong>
                    <span
                      class="info-tooltip-wrapper"
                      tabindex="0"
                      role="button"
                      aria-label="Info emotes cancha"
                      use:tooltip={"Al escribir un comando (ej. gol), verás el emote flotante sobre el disco y el texto se ocultará del feed de chat."}
                    >
                      <svg class="info-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </span>
                  </div>
                </div>
                <label class="switch-toggle" aria-label="Mostrar emotes flotantes en cancha">
                  <input
                    type="checkbox"
                    checked={gameUI.settings.showPitchEmotes}
                    onchange={(e) => {
                      gameUI.settings.showPitchEmotes = (e.currentTarget as HTMLInputElement).checked;
                      gameUI.saveSettings();
                    }}
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <!-- Editor de Disparadores de Emotes (Custom Triggers) -->
            <div class="triggers-editor-card">
              <div class="triggers-header">
                <h4 class="card-title">Disparadores de Emotes Rápidos (Triggers)</h4>
                <span class="triggers-subtitle">Comandos de texto que invocan globos animados en cancha</span>
              </div>

              <!-- Tabla Interactiva Compacta -->
              <div class="triggers-table-wrap">
                <table class="triggers-table">
                  <thead>
                    <tr>
                      <th>Comando disparador</th>
                      <th>Emoji resultante</th>
                      <th class="actions-th">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each gameUI.settings.emoteTriggers as item, index}
                      <tr>
                        <td class="trigger-code-td">
                          <div class="code-wrapper">
                            <code>:{item.trigger}:</code>
                            <input
                              type="text"
                              class="inline-trigger-edit"
                              maxlength="15"
                              value={item.trigger}
                              onchange={(e) => {
                                const clean = (e.currentTarget as HTMLInputElement).value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                                if (clean) {
                                  item.trigger = clean;
                                  gameUI.saveSettings();
                                }
                              }}
                            />
                          </div>
                        </td>
                        <td class="emoji-picker-td">
                          <select
                            class="inline-emoji-select"
                            value={item.emoji}
                            onchange={(e) => {
                              item.emoji = (e.currentTarget as HTMLSelectElement).value;
                              soundFX.playUIClick();
                              gameUI.saveSettings();
                            }}
                            aria-label="Seleccionar emoji"
                          >
                            {#each EMOJI_CATALOG as emoji}
                              <option value={emoji}>{emoji}</option>
                            {/each}
                          </select>
                        </td>
                        <td class="delete-td">
                          <button
                            type="button"
                            class="btn-delete-row"
                            onclick={() => removeEmoteTrigger(index)}
                            title="Eliminar disparador"
                            aria-label="Eliminar disparador"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <!-- Agregar Nuevo Disparador Form -->
              <div class="add-trigger-form">
                <div class="input-field">
                  <label for="new-trigger-word">Nuevo comando (sin dos puntos):</label>
                  <input
                    id="new-trigger-word"
                    type="text"
                    bind:value={newTriggerWord}
                    maxlength="15"
                    placeholder="ej. crack"
                  />
                </div>

                <div class="input-field emoji-field">
                  <label for="new-trigger-emoji">Emoji:</label>
                  <select
                    id="new-trigger-emoji"
                    class="trigger-emoji-select"
                    bind:value={newTriggerEmoji}
                    onchange={() => soundFX.playUIClick()}
                  >
                    {#each EMOJI_CATALOG as emoji}
                      <option value={emoji}>{emoji}</option>
                    {/each}
                  </select>
                </div>

                <button
                  type="button"
                  class="btn-add-trigger"
                  onclick={addEmoteTrigger}
                  disabled={!newTriggerWord.trim()}
                >
                  + Agregar nuevo disparador
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Floating back button outside the modal card (top-left) */
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

  /* Overlay Backdrop Condition # */
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
  }

  /* Modal Main Card (Starts directly in 2 columns from the top) */
  .settings-modal-card {
    position: relative;
    width: 100%;
    max-width: 980px;
    height: 680px;
    max-height: 88vh;
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
  .tabs-sidebar {
    width: 240px;
    height: 100%;
    background: rgba(11, 17, 30, 0.9);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    padding: 1.25rem 0;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
    padding: 0 1.25rem;
  }

  .settings-icon-box {
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
    font-family: 'Space Grotesk', system-ui, sans-serif;
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

  /* Continuous list separated by border-b border-white/5, no individual card wrappers */
  .nav-tabs {
    display: flex;
    flex-direction: column;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    border-left: 2px solid transparent;
    border-radius: 0;
    color: #94a3b8;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.03);
    color: #e2e8f0;
  }

  .tab-btn.active {
    background: rgba(0, 229, 255, 0.08);
    border-left: 2px solid #00e5ff;
    color: #ffffff;
    font-weight: 700;
  }

  .tab-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .tab-label {
    flex: 1;
  }

  /* Right Tab Content Container with independent scroll */
  .tab-content {
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

  .tab-content::-webkit-scrollbar {
    width: 4px;
  }

  .tab-content::-webkit-scrollbar-track {
    background: rgba(8, 14, 24, 0.6);
  }

  .tab-content::-webkit-scrollbar-thumb {
    background: rgba(0, 229, 255, 0.35);
    border-radius: 4px;
  }

  .tab-content::-webkit-scrollbar-thumb:hover {
    background: #00e5ff;
  }

  .tab-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: 1.5rem;
    gap: 1.25rem;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* Section headings large and prominent */
  .section-heading {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    margin: 0;
    font-size: 1.65rem;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: -0.02em;
  }

  .pulse-rebinding {
    color: #00e5ff;
    font-size: 0.85rem;
    font-weight: 600;
    animation: pulseGlow 1.5s infinite;
  }

  @keyframes pulseGlow {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  .settings-scroll-area,
  .controls-scroll-area {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
  }

  /* Shared Card Aesthetics */
  .controls-card,
  .channel-card,
  .graphics-card,
  .triggers-editor-card,
  .emotes-toggle-card {
    background: #1a202a;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    padding: 1.15rem;
  }

  .card-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    margin: 0 0 0.85rem 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: 0.02em;
  }

  .grid-2col {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.75rem;
  }

  /* Keybind Rows */
  .bind-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: rgba(11, 17, 30, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
  }

  .bind-name {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .bind-hint {
    display: block;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.75rem;
    color: #64748b;
  }

  .key-badge {
    min-width: 78px;
    padding: 0.35rem 0.75rem;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.375rem;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.5), 0 0 8px rgba(0, 229, 255, 0.12);
    transition: all 0.15s ease;
  }

  .key-badge:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    color: #ffffff;
    box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.5), 0 0 12px rgba(0, 229, 255, 0.4);
  }

  .key-badge.rebinding {
    background: #00e5ff;
    border-color: #00e5ff;
    color: #0b111e;
    box-shadow: 0 0 14px #00e5ff;
  }

  /* Pane Footer */
  .pane-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .btn-reset {
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.5rem;
    color: #94a3b8;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.825rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-reset:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: #cbd5e1;
    color: #f8fafc;
  }

  /* iOS / Aero Switch Toggler */
  .switch-toggle {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .switch-toggle.mini {
    width: 36px;
    height: 20px;
  }

  .switch-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background-color: #334155;
    border-radius: 9999px;
    transition: 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: #ffffff;
    border-radius: 50%;
    transition: 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .switch-toggle.mini .toggle-slider:before {
    height: 14px;
    width: 14px;
  }

  .switch-toggle input:checked + .toggle-slider {
    background-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
  }

  .switch-toggle input:checked + .toggle-slider:before {
    transform: translateX(20px);
    background-color: #08111e;
  }

  .switch-toggle.mini input:checked + .toggle-slider:before {
    transform: translateX(16px);
  }

  /* Mute Switch Active Red Glowing State */
  .toggle-slider.mute-slider.muted-active {
    background-color: #ff4757 !important;
    box-shadow: 0 0 14px rgba(255, 71, 87, 0.6) !important;
  }

  .toggle-slider.mute-slider.muted-active:before {
    transform: translateX(20px);
    background-color: #ffffff !important;
  }

  /* Dynamic Track Fill Custom Sliders */
  .custom-slider {
    width: 100%;
    height: 6px;
    background: linear-gradient(
      to right,
      #00e5ff 0%,
      #00e5ff var(--val-percent, 50%),
      rgba(255, 255, 255, 0.1) var(--val-percent, 50%),
      rgba(255, 255, 255, 0.1) 100%
    );
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }

  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #00e5ff;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.7);
  }

  /* Master Volume Card */
  .master-volume-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.25rem;
    background: #1a202a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.1);
  }

  .master-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .master-title-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .master-icon {
    font-size: 1.4rem;
  }

  .master-title {
    display: block;
    font-size: 1.05rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .master-desc {
    font-size: 0.775rem;
    color: #94a3b8;
  }

  .mute-all-toggle-wrap {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .mute-label {
    font-size: 0.825rem;
    font-weight: 700;
    color: #94a3b8;
    transition: color 0.15s ease;
  }

  .mute-label.muted-active {
    color: #ff4757;
  }

  .master-slider-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .master-slider {
    flex: 1;
    height: 8px;
  }

  .volume-percent-large {
    min-width: 60px;
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 1.25rem;
    font-weight: 800;
    color: #00e5ff;
  }

  /* 2-Column Sound Grid & Disabled State */
  .sound-grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    transition: opacity 0.2s ease, filter 0.2s ease;
  }

  .sound-grid-2col.sound-disabled {
    opacity: 0.4;
    filter: grayscale(1);
    pointer-events: none;
  }

  .col-sfx-env {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .channel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }

  .channel-name {
    display: block;
    font-size: 0.9rem;
    font-weight: 700;
    color: #f1f5f9;
  }

  .channel-desc {
    display: block;
    font-size: 0.75rem;
    color: #64748b;
  }

  .channel-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .channel-val {
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: #00e5ff;
    font-size: 0.875rem;
  }

  .accordion-btn {
    padding: 0.25rem 0.6rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.375rem;
    color: #94a3b8;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .accordion-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #f8fafc;
  }

  .subtoggles-box {
    margin-top: 0.85rem;
    padding-top: 0.75rem;
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .subtoggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.825rem;
    color: #cbd5e1;
  }

  /* 2-Column Video Layout */
  .video-grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .col-visuals-ball {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .slider-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .slider-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }

  .param-name {
    color: #cbd5e1;
    font-weight: 600;
  }

  .param-val {
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
  }

  .toggles-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.55rem 0.75rem;
    background: rgba(11, 17, 30, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    font-size: 0.825rem;
    color: #e2e8f0;
  }

  .segmented-control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .segmented-pills {
    display: flex;
    background: #0b111e;
    padding: 0.25rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    gap: 0.25rem;
  }

  .seg-pill {
    padding: 0.35rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: #94a3b8;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .seg-pill.active {
    background: #00e5ff;
    color: #0b111e;
    font-weight: 700;
  }

  /* Info Tooltip Pattern */
  .label-with-tooltip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .info-tooltip-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: help;
    outline: none;
  }

  .info-help-icon {
    width: 0.85rem;
    height: 0.85rem;
    color: #64748b;
    transition: color 0.15s ease;
  }

  .info-tooltip-wrapper:hover .info-help-icon,
  .info-tooltip-wrapper:focus .info-help-icon {
    color: #00e5ff;
  }


  /* Ball Customization */
  .card-header-flex {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }

  .exclusive-mode-selector {
    display: flex;
    gap: 0.25rem;
    background: #0b111e;
    padding: 0.2rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .mode-choice-btn {
    padding: 0.3rem 0.65rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: #94a3b8;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .mode-choice-btn.active {
    background: #00e5ff;
    color: #0b111e;
    font-weight: 700;
  }

  .ball-cards-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .ball-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.65rem 0.4rem;
    background: rgba(11, 17, 30, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .ball-card:hover {
    border-color: rgba(0, 229, 255, 0.4);
    background: rgba(0, 229, 255, 0.04);
  }

  .ball-card.selected {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.2);
  }

  .ball-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-bottom: 0.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .classic-ball {
    background: #f1f5f9;
    border: 2px solid #0f172a;
  }

  .neon-ball {
    background: #0f172a;
    border: 2px solid #ccff00;
  }

  .retro-ball {
    background: #78350f;
    border: 2px solid #451a03;
  }

  .futsal-ball {
    background: #ffffff;
    border: 2px solid #ff0055;
  }

  .ball-svg {
    width: 100%;
    height: 100%;
  }

  .ball-name {
    font-size: 0.775rem;
    color: #f1f5f9;
  }

  .solid-color-picker-box {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 0.85rem;
    background: rgba(11, 17, 30, 0.7);
    border-radius: 0.5rem;
  }

  .color-preview-disc {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    position: relative;
    overflow: hidden;
  }

  .ball-shine-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.6) 0%, transparent 60%);
  }

  .color-picker-inputs {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .color-picker-inputs label {
    font-size: 0.8rem;
    color: #cbd5e1;
  }

  .inputs-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .inputs-row input[type="color"] {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    cursor: pointer;
  }

  .hex-text-input {
    width: 85px;
    padding: 0.35rem 0.5rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.375rem;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
  }

  /* SECTION 4: EQUIPACIONES */
  .team-filter-tabs {
    display: flex;
    gap: 0.5rem;
  }

  .team-tab-pill {
    flex: 1;
    padding: 0.6rem 1rem;
    background: #1a202a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    color: #94a3b8;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .team-tab-pill.local.active {
    background: rgba(231, 76, 60, 0.15);
    border-color: #e74c3c;
    color: #ff6b6b;
  }

  .team-tab-pill.visitor.active {
    background: rgba(52, 152, 219, 0.15);
    border-color: #3498db;
    color: #00e5ff;
  }

  .kits-layout-grid {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 1.25rem;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .kits-controls-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.15rem;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0.5rem;
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .team-identity-block {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    padding: 0.85rem 1rem;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0.5rem;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .team-name-tag-row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
  }

  .team-name-group {
    flex: 1;
  }

  .team-tag-group {
    width: 80px;
    flex-shrink: 0;
  }

  .team-tag-group input {
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
  }

  .form-row-3col {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.65rem;
    width: 100%;
    box-sizing: border-box;
  }

  /* Checkbox Contorno */
  .checkbox-option-box {
    padding: 0.4rem 0.15rem;
  }

  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }

  .checkbox-custom {
    width: 18px;
    height: 18px;
    background: #0b111e;
    border: 1.5px solid rgba(0, 229, 255, 0.45);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .checkbox-label input[type="checkbox"]:checked ~ .checkbox-custom {
    background: #00e5ff;
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .checkbox-custom::after {
    content: "";
    display: none;
    width: 4px;
    height: 8px;
    border: solid #050811;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
    margin-bottom: 2px;
  }

  .checkbox-label input[type="checkbox"]:checked ~ .checkbox-custom::after {
    display: block;
  }

  .checkbox-text {
    font-size: 0.8rem;
    color: #e2e8f0;
    font-weight: 600;
  }

  .form-row-4col {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.45rem;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .input-group label,
  .color-picker-box label {
    font-size: 0.775rem;
    color: #94a3b8;
    font-weight: 600;
  }

  .input-group input[type="text"] {
    padding: 0.45rem 0.65rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.375rem;
    color: #f8fafc;
    font-size: 0.85rem;
  }

  .color-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .color-control input[type="color"] {
    width: 30px;
    height: 30px;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .hex-mini-input {
    width: 68px;
    padding: 0.3rem 0.4rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.375rem;
    color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.75rem;
  }

  .group-subtitle {
    font-size: 0.8rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  /* 8 patterns grid without text labels */
  .patterns-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .pattern-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    background: rgba(11, 17, 30, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pattern-card:hover {
    border-color: rgba(0, 229, 255, 0.4);
    transform: scale(1.04);
  }

  .pattern-card.active {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.15);
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
  }

  .pattern-sample {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .pattern-sample.solid {
    background-color: var(--c1);
  }

  .pattern-sample.vertical {
    background: repeating-linear-gradient(90deg, var(--c1) 0, var(--c1) 5px, var(--c2) 5px, var(--c2) 10px);
  }

  .pattern-sample.hoop {
    background: linear-gradient(180deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .pattern-sample.vertical_stripe {
    background: linear-gradient(90deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .pattern-sample.diagonal_right {
    background: linear-gradient(45deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .pattern-sample.diagonal_left {
    background: linear-gradient(135deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .pattern-sample.halves {
    background: linear-gradient(90deg, var(--c1) 50%, var(--c2) 50%);
  }

  .pattern-sample.checkerboard {
    background-image: conic-gradient(var(--c1) 90deg, var(--c2) 90deg 180deg, var(--c1) 180deg 270deg, var(--c2) 270deg);
    background-size: 16px 16px;
  }

  /* Legacy fallback patterns */
  .pattern-sample.diagonal {
    background: linear-gradient(45deg, var(--c1) 50%, var(--c2) 50%);
  }

  .pattern-sample.cross {
    background: linear-gradient(var(--c2), var(--c2)) no-repeat center/30% 100%,
      linear-gradient(var(--c2), var(--c2)) no-repeat center/100% 30%,
      var(--c1);
  }

  .pattern-sample.chevrons {
    background: repeating-linear-gradient(135deg, var(--c1) 0 5px, var(--c2) 5px 10px);
  }

  .pattern-sample.diagonal_checks {
    background: repeating-linear-gradient(45deg, var(--c1) 0, var(--c1) 5px, var(--c2) 5px, var(--c2) 10px);
  }

  /* Kit Preview Column */
  .kits-preview-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
    padding: 1rem;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0.5rem;
    justify-content: center;
    min-width: 0;
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .preview-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: #f8fafc;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .tactical-pitch-box {
    width: 100%;
    height: 190px;
    background: #143521;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.5rem;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
    overflow: hidden;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.6);
  }

  .pitch-preview-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    z-index: 2;
  }

  .pitch-preview-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .scoreboard-preview-badge {
    min-width: 48px;
    height: 28px;
    padding: 0 0.65rem;
    border-radius: 4px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    letter-spacing: 0.05em;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }

  .tactical-pitch-lines {
    position: absolute;
    inset: 10px;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .tactical-pitch-lines::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 70px;
    height: 70px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
  }

  .kit-live-disc {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 3px solid;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
  }

  .live-pattern-overlay {
    position: absolute;
    inset: 0;
  }

  .live-pattern-overlay.vertical-stripes {
    background: repeating-linear-gradient(90deg, var(--c1) 0, var(--c1) 8px, var(--c2) 8px, var(--c2) 16px);
  }

  .live-pattern-overlay.hoop-stripes {
    background: linear-gradient(180deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .live-pattern-overlay.vertical-stripe-center {
    background: linear-gradient(90deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .live-pattern-overlay.diagonal-right-stripes {
    background: linear-gradient(45deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .live-pattern-overlay.diagonal-left-stripes {
    background: linear-gradient(135deg, var(--c1) 0%, var(--c1) 32%, var(--c2) 32%, var(--c2) 68%, var(--c1) 68%, var(--c1) 100%);
  }

  .live-pattern-overlay.halves-stripes {
    background: linear-gradient(90deg, var(--c1) 50%, var(--c2) 50%);
  }

  .live-pattern-overlay.checkerboard-pattern {
    background-image: conic-gradient(var(--c1) 90deg, var(--c2) 90deg 180deg, var(--c1) 180deg 270deg, var(--c2) 270deg);
    background-size: 24px 24px;
  }

  .live-pattern-overlay.diagonal-stripes {
    background: linear-gradient(45deg, var(--c1) 50%, var(--c2) 50%);
  }

  .live-pattern-overlay.cross-stripes {
    background: linear-gradient(var(--c2), var(--c2)) no-repeat center/28% 100%,
      linear-gradient(var(--c2), var(--c2)) no-repeat center/100% 28%,
      var(--c1);
  }

  .live-pattern-overlay.chevrons-stripes {
    background: repeating-linear-gradient(135deg, var(--c1) 0 8px, var(--c2) 8px 16px);
  }

  .live-pattern-overlay.diagonal-checks-stripes {
    background: repeating-linear-gradient(45deg, var(--c1) 0, var(--c1) 8px, var(--c2) 8px, var(--c2) 16px);
  }

  .captain-badge {
    position: relative;
    z-index: 2;
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.25rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  }

  /* SECTION 5: AVATAR Y EMOTES */
  .compact-avatar-editor {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.15rem;
    background: #1a202a;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
  }

  .avatar-disc-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .hero-disc-circle {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: #00e5ff;
    border: 3px solid #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 18px rgba(0, 229, 255, 0.4);
    position: relative;
    overflow: hidden;
  }

  .hero-disc-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.6rem;
    font-weight: 900;
    color: #08111e;
  }

  .hero-disc-emoji {
    font-size: 1.9rem;
    line-height: 1;
  }

  .hero-disc-shine {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.5) 0%, transparent 60%);
  }

  .player-nick-badge {
    font-size: 0.85rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .avatar-controls-cartucho {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .avatar-mode-segmented {
    display: flex;
    background: #0b111e;
    padding: 0.25rem;
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    gap: 0.25rem;
  }

  .mode-seg-btn {
    flex: 1;
    padding: 0.45rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: #94a3b8;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .mode-seg-btn.active {
    background: #00e5ff;
    color: #0b111e;
    font-weight: 700;
  }

  .initials-compact-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .initials-compact-row label {
    font-size: 0.825rem;
    color: #cbd5e1;
  }

  .initials-input-field {
    width: 70px;
    padding: 0.4rem 0.6rem;
    background: #0b111e;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.375rem;
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.15rem;
    font-weight: 800;
    text-align: center;
  }

  .emoji-compact-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
  }

  .emoji-choice-btn-compact {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(11, 17, 30, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.375rem;
    font-size: 1.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .emoji-choice-btn-compact:hover {
    background: rgba(0, 229, 255, 0.1);
    border-color: #00e5ff;
    transform: scale(1.06);
  }

  .emoji-choice-btn-compact.selected {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
  }

  /* Emotes Toggle Card */
  .toggle-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-card-title {
    display: block;
    font-size: 0.95rem;
    color: #f1f5f9;
  }

  /* Custom Triggers Editor Table */
  .triggers-header {
    margin-bottom: 0.75rem;
  }

  .triggers-subtitle {
    display: block;
    font-size: 0.75rem;
    color: #64748b;
  }

  .triggers-table-wrap {
    overflow-x: auto;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .triggers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .triggers-table th {
    padding: 0.5rem 0.75rem;
    background: #0b111e;
    color: #94a3b8;
    text-align: left;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .actions-th {
    width: 60px;
    text-align: center !important;
  }

  .triggers-table td {
    padding: 0.45rem 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    background: rgba(18, 27, 46, 0.5);
  }

  .code-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .code-wrapper code {
    font-family: monospace;
    color: #38bdf8;
    font-size: 0.8rem;
  }

  .inline-trigger-edit {
    padding: 0.25rem 0.5rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.25rem;
    color: #f1f5f9;
    font-size: 0.8rem;
    width: 110px;
  }

  .inline-emoji-select {
    padding: 0.2rem 0.35rem;
    background: #0b111e;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.25rem;
    font-size: 1.1rem;
    color: #f1f5f9;
    cursor: pointer;
    text-align: center;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .inline-emoji-select:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.35);
  }

  .inline-emoji-select option,
  .trigger-emoji-select option {
    background: #0b111e;
    color: #f1f5f9;
    font-size: 1.1rem;
  }

  .delete-td {
    text-align: center;
  }

  .btn-delete-row {
    padding: 0.2rem 0.45rem;
    background: transparent;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.25rem;
    color: #ef4444;
    cursor: pointer;
    font-weight: 700;
  }

  .btn-delete-row:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
  }

  .add-trigger-form {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    padding: 0.65rem 0.75rem;
    background: rgba(11, 17, 30, 0.7);
    border-radius: 0.5rem;
  }

  .input-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .input-field label {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .input-field input {
    padding: 0.35rem 0.55rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.375rem;
    color: #f1f5f9;
    font-size: 0.825rem;
  }

  .emoji-field {
    width: 68px;
  }

  .trigger-emoji-select {
    padding: 0.3rem 0.35rem;
    background: #0b111e;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.375rem;
    font-size: 1.05rem;
    color: #f1f5f9;
    cursor: pointer;
    text-align: center;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .trigger-emoji-select:focus {
    border-color: #00e5ff;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.35);
  }

  .btn-add-trigger {
    padding: 0.45rem 0.85rem;
    background: rgba(0, 229, 255, 0.15);
    border: 1px solid #00e5ff;
    border-radius: 0.375rem;
    color: #00e5ff;
    font-size: 0.825rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .btn-add-trigger:hover:not(:disabled) {
    background: #00e5ff;
    color: #0b111e;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
  }

  .btn-add-trigger:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    border-color: rgba(255, 255, 255, 0.2);
    color: #64748b;
  }

  /* Responsive Adjustments */
  @media (max-width: 768px) {
    .settings-modal-card {
      flex-direction: column;
    }
    .tabs-sidebar {
      width: 100%;
      flex-direction: row;
      overflow-x: auto;
      border-right: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.75rem;
    }
    .nav-tabs {
      flex-direction: row;
      border-top: none;
    }
    .tab-btn {
      border-bottom: none;
      border-left: none;
      border-bottom: 2px solid transparent;
    }
    .tab-btn.active {
      border-left: none;
      border-bottom: 2px solid #00e5ff;
    }
    .sound-grid-2col,
    .video-grid-2col,
    .kits-layout-grid {
      grid-template-columns: 1fr;
    }
    .ball-cards-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
