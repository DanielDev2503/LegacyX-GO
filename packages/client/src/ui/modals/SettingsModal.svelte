<script lang="ts">
  import { gameUI, type BallSkinType, type PatternType } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

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

  // Avatar state
  let initialsInput = $state(gameUI.avatarMode === 'letters' ? gameUI.avatarValue : 'YA');
  let selectedEmoji = $state(gameUI.avatarMode === 'emoji' ? gameUI.avatarValue : '⚽');
  let avatarFormat = $state<'letters' | 'emoji'>(gameUI.avatarMode);

  // New trigger draft inputs
  let newTriggerWord = $state('');
  let newTriggerEmoji = $state('⚡');

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
      handleClose();
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
      const clean = initialsInput.trim().toUpperCase().slice(0, 2) || 'YA';
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
      const clean = initialsInput || 'YA';
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
  <div class="settings-modal-card" role="dialog" aria-modal="true" aria-label="Ajustes generales">
    <!-- Panel Izquierdo: Lista vertical de 5 Pestañas -->
    <nav class="tabs-sidebar" aria-label="Pestañas de ajustes">
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

              <!-- Nueva Subsección: Interacción con la interfaz -->
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
              <!-- Mute All Global Toggle Card -->
              <div class="mute-all-card">
                <div class="mute-text">
                  <strong class="mute-title">Silenciar todo el audio</strong>
                  <p class="mute-desc">Desactiva inmediatamente toda la salida acústica del juego.</p>
                </div>
                <label class="switch-toggle" aria-label="Silenciar todo el audio">
                  <input
                    type="checkbox"
                    checked={gameUI.settings.isMuted}
                    onchange={(e) => {
                      gameUI.settings.isMuted = (e.currentTarget as HTMLInputElement).checked;
                      gameUI.saveSettings();
                    }}
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- BARRA 1: Audio General (Master) -->
              <div class="channel-card">
                <div class="channel-header">
                  <div class="channel-info">
                    <span class="channel-name">1. Audio General (Master)</span>
                    <span class="channel-desc">Control maestro de ganancia acústica</span>
                  </div>
                  <span class="channel-val">{Math.round(gameUI.settings.masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  class="custom-slider"
                  min="0"
                  max="1"
                  step="0.01"
                  value={gameUI.settings.masterVolume}
                  oninput={(e) => {
                    gameUI.settings.masterVolume = Number((e.currentTarget as HTMLInputElement).value);
                    gameUI.saveSettings();
                  }}
                />
              </div>

              <!-- BARRA 2: Chat y Social -->
              <div class="channel-card">
                <div class="channel-header">
                  <div class="channel-info">
                    <span class="channel-name">2. Chat y Social</span>
                    <span class="channel-desc">Notificaciones de texto, menciones y emotes</span>
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
                  value={gameUI.settings.chatVolume}
                  oninput={(e) => {
                    gameUI.settings.chatVolume = Number((e.currentTarget as HTMLInputElement).value);
                    gameUI.saveSettings();
                  }}
                />

                {#if showChatAccordion}
                  <div class="subtoggles-box">
                    <div class="subtoggle-row">
                      <span>Sonido normal de mensajes de chat</span>
                      <label class="switch-toggle mini" aria-label="Sonido normal de chat">
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
                      <span>Sonido de mención (@tu_nombre)</span>
                      <label class="switch-toggle mini" aria-label="Sonido de mención">
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
                      <span>Sonido de emotes en cancha</span>
                      <label class="switch-toggle mini" aria-label="Sonido de emotes en cancha">
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

              <!-- BARRA 3: Efectos (SFX) -->
              <div class="channel-card">
                <div class="channel-header">
                  <div class="channel-info">
                    <span class="channel-name">3. Efectos (SFX)</span>
                    <span class="channel-desc">Impactos mecánicos, rebotes y choques</span>
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
                  value={gameUI.settings.sfxVolume}
                  oninput={(e) => {
                    gameUI.settings.sfxVolume = Number((e.currentTarget as HTMLInputElement).value);
                    gameUI.saveSettings();
                  }}
                />

                {#if showSfxAccordion}
                  <div class="subtoggles-box">
                    <div class="subtoggle-row">
                      <span>Pateo del balón</span>
                      <label class="switch-toggle mini" aria-label="Pateo del balón">
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
                      <span>Impacto del balón con los postes</span>
                      <label class="switch-toggle mini" aria-label="Impacto del balón con postes">
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

              <!-- BARRA 4: Entorno -->
              <div class="channel-card">
                <div class="channel-header">
                  <div class="channel-info">
                    <span class="channel-name">4. Entorno</span>
                    <span class="channel-desc">Silbato arbitral, bocinas, multitud y estadio</span>
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
                  value={gameUI.settings.envVolume}
                  oninput={(e) => {
                    gameUI.settings.envVolume = Number((e.currentTarget as HTMLInputElement).value);
                    gameUI.saveSettings();
                  }}
                />

                {#if showEnvAccordion}
                  <div class="subtoggles-box">
                    <div class="subtoggle-row">
                      <span>Pitido del silbato</span>
                      <label class="switch-toggle mini" aria-label="Pitido del silbato">
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
                      <span>Bocina de gol y celebración</span>
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
                      <span>Multitud / Ovaciones</span>
                      <label class="switch-toggle mini" aria-label="Multitud y ovaciones">
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
                      <span>Sonido ambiente del estadio</span>
                      <label class="switch-toggle mini" aria-label="Ambiente del estadio">
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

        <!-- ======================================================== -->
        <!-- SECCIÓN 3: VIDEO Y GRÁFICOS                              -->
        <!-- ======================================================== -->
        {:else if activeTab === 'video'}
          <div class="tab-pane">
            <div class="section-header-row">
              <h3 class="section-heading">Video y Gráficos</h3>
            </div>

            <div class="settings-scroll-area">
              <!-- Tarjeta 1: Cámara y Campo -->
              <div class="graphics-card">
                <h4 class="card-title">Cámara y Campo</h4>
                <div class="slider-row">
                  <div class="slider-meta">
                    <span class="param-name">Zoom de la cámara</span>
                    <strong class="param-val">{gameUI.settings.cameraZoom.toFixed(2)}x</strong>
                  </div>
                  <input
                    type="range"
                    class="custom-slider"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={gameUI.settings.cameraZoom}
                    oninput={(e) => {
                      gameUI.settings.cameraZoom = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />
                </div>

                <div class="toggles-grid pt-3">
                  <div class="toggle-item">
                    <span>Sacudida de pantalla (Screen shake)</span>
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
                    <span>Resplandor / Aura en los jugadores</span>
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
                </div>
              </div>

              <!-- Tarjeta 2: Efectos de Jugabilidad -->
              <div class="graphics-card">
                <h4 class="card-title">Efectos de Jugabilidad</h4>
                <div class="toggles-grid">
                  <div class="toggle-item">
                    <span>Estela de curva Magnus en el balón</span>
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
                    <span>Efecto de fuego en tiros potentes (&gt;950 px/s)</span>
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
                    <span>Textos flotantes de puntos / eventos</span>
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
                </div>
              </div>

              <!-- Tarjeta 3: Interfaz y Radar -->
              <div class="graphics-card">
                <h4 class="card-title">Interfaz y Radar</h4>
                <div class="toggles-grid">
                  <div class="toggle-item">
                    <span>Activar / Desactivar minimapa</span>
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
                    <span>Cono de visión de la cámara en minimapa</span>
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

                  <div class="toggle-item">
                    <span>Indicadores perimetrales fuera de pantalla</span>
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

                <!-- Selector segmentado Tamaño de Minimapa -->
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

                <!-- Sliders Opacidad -->
                <div class="slider-row pt-3">
                  <div class="slider-meta">
                    <span class="param-name">Opacidad del minimapa</span>
                    <strong class="param-val">{Math.round(gameUI.settings.minimapOpacity)}%</strong>
                  </div>
                  <input
                    type="range"
                    class="custom-slider"
                    min="10"
                    max="100"
                    step="5"
                    value={gameUI.settings.minimapOpacity}
                    oninput={(e) => {
                      gameUI.settings.minimapOpacity = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />
                </div>

                <div class="slider-row pt-3">
                  <div class="slider-meta">
                    <span class="param-name">Opacidad del chat</span>
                    <strong class="param-val">{Math.round(gameUI.settings.chatOpacity)}%</strong>
                  </div>
                  <input
                    type="range"
                    class="custom-slider"
                    min="10"
                    max="100"
                    step="5"
                    value={gameUI.settings.chatOpacity}
                    oninput={(e) => {
                      gameUI.settings.chatOpacity = Number((e.currentTarget as HTMLInputElement).value);
                      gameUI.saveSettings();
                    }}
                  />
                </div>
              </div>

              <!-- Tarjeta 4: Personalización del Balón (Diseño vs Color Exclusivo) -->
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
                      Diseño predefinido
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
                      Color plano sólido
                    </button>
                  </div>
                </div>

                <p class="exclusive-hint">
                  {gameUI.settings.ballMode === 'texture'
                    ? '✓ Modo activo: Diseño con skin y textura 3D procedural.'
                    : '✓ Modo activo: Balón sólido uniforme con color personalizado.'}
                </p>

                {#if gameUI.settings.ballMode === 'texture'}
                  <!-- Cuadrícula de 4 Diseños Predefinidos -->
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
                      <span class="ball-desc">Hexágonos icónicos</span>
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
                      <span class="ball-desc">Flúor de alta visibilidad</span>
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
                      <span class="ball-desc">Cuero tradicional cosido</span>
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
                      <strong class="ball-name">Fútbol Sala</strong>
                      <span class="ball-desc">Patrón dinámico Pro Court</span>
                    </button>
                  </div>
                {:else}
                  <!-- Selector de Color Hexadecimal para Balón Liso -->
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
              <h3 class="section-heading">Equipaciones de Equipo</h3>
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

            <!-- Nota de Capitán -->
            <div class="captain-callout-box">
              <div class="callout-icon">ℹ️</div>
              <p class="callout-text">
                <strong>Nota:</strong> Las modificaciones de nombre, siglas y equipación solo se aplicarán en partido si eres el Capitán del equipo (primer jugador listado en tu bando).
              </p>
            </div>

            <div class="kits-layout-grid">
              <!-- Columna Izquierda: Nombres, Siglas, Colores y Patrones -->
              <div class="kits-controls-col">
                <div class="form-row-2col">
                  <div class="input-group">
                    <label for="team-name-input">Nombre del Equipo (máx. 25)</label>
                    <input
                      id="team-name-input"
                      type="text"
                      maxlength="25"
                      bind:value={currentKit.name}
                      oninput={() => gameUI.saveSettings()}
                      placeholder={activeKitTab === 'local' ? 'Local FC' : 'Visitante CF'}
                    />
                  </div>

                  <div class="input-group">
                    <label for="team-tag-input">Siglas (máx. 4)</label>
                    <div class="tag-input-wrapper">
                      <input
                        id="team-tag-input"
                        type="text"
                        maxlength="4"
                        bind:value={currentKit.tag}
                        oninput={(e) => {
                          currentKit.tag = (e.currentTarget as HTMLInputElement).value.toUpperCase();
                          gameUI.saveSettings();
                        }}
                        placeholder={activeKitTab === 'local' ? 'LOC' : 'VIS'}
                      />
                      <span class="tag-badge">[{currentKit.tag || 'TAG'}]</span>
                    </div>
                  </div>
                </div>

                <div class="form-row-2col pt-2">
                  <div class="color-picker-box">
                    <label for="kit-color-primary">Color Primario</label>
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
                    <label for="kit-color-secondary">Color Secundario</label>
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
                </div>

                <span class="group-subtitle pt-3">Patrón de Camiseta</span>
                <div class="patterns-grid">
                  <button
                    type="button"
                    class="pattern-card"
                    class:active={currentKit.pattern === 'solid'}
                    onclick={() => {
                      currentKit.pattern = 'solid';
                      gameUI.saveSettings();
                    }}
                  >
                    <div class="pattern-sample solid" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    <span>Liso</span>
                  </button>

                  <button
                    type="button"
                    class="pattern-card"
                    class:active={currentKit.pattern === 'vertical'}
                    onclick={() => {
                      currentKit.pattern = 'vertical';
                      gameUI.saveSettings();
                    }}
                  >
                    <div class="pattern-sample vertical" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    <span>Rayas Verticales</span>
                  </button>

                  <button
                    type="button"
                    class="pattern-card"
                    class:active={currentKit.pattern === 'hoop'}
                    onclick={() => {
                      currentKit.pattern = 'hoop';
                      gameUI.saveSettings();
                    }}
                  >
                    <div class="pattern-sample hoop" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    <span>Franja Horizontal</span>
                  </button>

                  <button
                    type="button"
                    class="pattern-card"
                    class:active={currentKit.pattern === 'halves'}
                    onclick={() => {
                      currentKit.pattern = 'halves';
                      gameUI.saveSettings();
                    }}
                  >
                    <div class="pattern-sample halves" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    <span>Mitades</span>
                  </button>

                  <button
                    type="button"
                    class="pattern-card"
                    class:active={currentKit.pattern === 'chevrons'}
                    onclick={() => {
                      currentKit.pattern = 'chevrons';
                      gameUI.saveSettings();
                    }}
                  >
                    <div class="pattern-sample chevrons" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    <span>Chevrones</span>
                  </button>

                  <button
                    type="button"
                    class="pattern-card"
                    class:active={currentKit.pattern === 'diagonal_checks'}
                    onclick={() => {
                      currentKit.pattern = 'diagonal_checks';
                      gameUI.saveSettings();
                    }}
                  >
                    <div class="pattern-sample diagonal-checks" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    <span>Cuadros Diagonales</span>
                  </button>
                </div>
              </div>

              <!-- Columna Derecha: Previsualización en Vivo 1:1 Scale con Disco y Capitán 'C' -->
              <div class="kits-preview-col">
                <span class="preview-title">Previsualización en cancha (Escala 1:1)</span>
                <div class="tactical-pitch-box">
                  <div class="tactical-pitch-lines"></div>

                  <!-- Disco del Jugador Capitán -->
                  <div
                    class="kit-live-disc"
                    style="background-color: {currentKit.primaryColor}; border-color: {currentKit.secondaryColor};"
                  >
                    {#if currentKit.pattern === 'vertical'}
                      <div class="live-pattern-overlay vertical-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'hoop'}
                      <div class="live-pattern-overlay hoop-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'halves'}
                      <div class="live-pattern-overlay halves-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'chevrons'}
                      <div class="live-pattern-overlay chevrons-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {:else if currentKit.pattern === 'diagonal_checks'}
                      <div class="live-pattern-overlay diagonal-checks-stripes" style="--c1: {currentKit.primaryColor}; --c2: {currentKit.secondaryColor};"></div>
                    {/if}

                    <span class="captain-badge">C</span>
                    <div class="disc-pip"></div>
                  </div>
                </div>

                <div class="preview-legend">
                  <span class="legend-badge">Capitán: {currentKit.name || 'Equipo'} [{currentKit.tag || 'TAG'}]</span>
                  <span class="legend-auto">✓ Guardado automático</span>
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
              <!-- Previsualización circular del disco del jugador en tiempo real -->
              <div class="avatar-hero-preview">
                <div class="hero-disc-circle">
                  {#if avatarFormat === 'letters'}
                    <span class="hero-disc-text">{initialsInput || 'YA'}</span>
                  {:else}
                    <span class="hero-disc-emoji">{selectedEmoji}</span>
                  {/if}
                  <div class="hero-disc-shine"></div>
                </div>
                <div class="hero-disc-info">
                  <h4 class="player-nick-title">{gameUI.nickname}</h4>
                  <p class="player-avatar-desc">
                    {avatarFormat === 'letters' ? `Iniciales en dorsal: "${initialsInput || 'YA'}"` : `Avatar de emoji activo: ${selectedEmoji}`}
                  </p>
                </div>
              </div>

              <!-- Selector partido: Letras / Números vs Emojis -->
              <div class="avatar-mode-segmented">
                <button
                  type="button"
                  class="mode-seg-btn"
                  class:active={avatarFormat === 'letters'}
                  onclick={() => setAvatarMode('letters')}
                >
                  Letras / Números (máx. 2)
                </button>
                <button
                  type="button"
                  class="mode-seg-btn"
                  class:active={avatarFormat === 'emoji'}
                  onclick={() => setAvatarMode('emoji')}
                >
                  Emojis Predeterminados
                </button>
              </div>

              {#if avatarFormat === 'letters'}
                <div class="initials-editor-box">
                  <label for="initials-field">Escribe hasta 2 caracteres para tu disco:</label>
                  <input
                    id="initials-field"
                    type="text"
                    class="initials-input-field"
                    maxlength="2"
                    value={initialsInput}
                    oninput={(e) => handleInitialsChange((e.currentTarget as HTMLInputElement).value)}
                    placeholder="YA"
                  />
                </div>
              {:else}
                <div class="emoji-palette-container">
                  <span class="palette-title">Selecciona un emoji para tu disco:</span>
                  <div class="emoji-grid-12">
                    {#each EMOJI_PALETTE as emoji}
                      <button
                        type="button"
                        class="emoji-choice-btn"
                        class:selected={selectedEmoji === emoji}
                        onclick={() => handleEmojiSelect(emoji)}
                        aria-label={`Seleccionar avatar ${emoji}`}
                      >
                        {emoji}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Toggler de Emotes en Cancha y Filtrado de Chat -->
              <div class="emotes-toggle-card">
                <div class="toggle-card-head">
                  <div class="toggle-card-info">
                    <strong class="toggle-card-title">Mostrar emotes flotantes en cancha</strong>
                    <p class="toggle-card-desc">
                      Recomendamos mantener los emotes activados para evitar saturar el chat de texto con líneas de comando.
                    </p>
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

                <div class="behavior-note-box">
                  <span class="behavior-badge">Lógica de comportamiento:</span>
                  <p class="behavior-text">
                    {#if gameUI.settings.showPitchEmotes}
                      • Al escribir un comando (ej. <code>gol</code>), verás el globo flotante ⚽ sobre el disco del jugador y el texto NO se imprimirá en el feed de chat.
                    {:else}
                      • Emotes desactivados: No se dibujarán globos en la cancha y leerás el texto del comando directamente en el feed de chat.
                    {/if}
                  </p>
                </div>
              </div>

              <!-- Editor de Disparadores de Emotes (Custom Triggers) -->
              <div class="triggers-editor-card">
                <div class="triggers-header">
                  <h4 class="card-title">Disparadores de Emotes Rápidos (Triggers)</h4>
                  <span class="triggers-subtitle">Comandos de texto que invocan globos animados</span>
                </div>

                <!-- Tabla Interactiva -->
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
                            <input
                              type="text"
                              class="inline-emoji-edit"
                              maxlength="2"
                              value={item.emoji}
                              onchange={(e) => {
                                item.emoji = (e.currentTarget as HTMLInputElement).value.trim() || '⚽';
                                gameUI.saveSettings();
                              }}
                            />
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
                    <input
                      id="new-trigger-emoji"
                      type="text"
                      bind:value={newTriggerEmoji}
                      maxlength="2"
                      placeholder="🔥"
                    />
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
    padding: 0.6rem 1.1rem;
    background: rgba(13, 21, 38, 0.85);
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 9999px;
    color: #e2e8f0;
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    backdrop-filter: blur(12px);
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(0, 229, 255, 0.15);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .floating-back-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    color: #00e5ff;
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(0, 229, 255, 0.3);
  }

  .back-arrow-svg {
    width: 1.1rem;
    height: 1.1rem;
  }

  /* Overlay Backdrop Condition # */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(12px);
    padding: 1.5rem;
    box-sizing: border-box;
    pointer-events: auto;
  }

  /* Modal Main Card (Starts directly in 2 columns from the top) */
  .settings-modal-card {
    position: relative;
    width: 100%;
    max-width: 960px;
    height: 680px;
    max-height: 85vh;
    background: #0d1526;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 1rem;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 229, 255, 0.08);
    pointer-events: auto;
  }

  /* Left Sidebar */
  .tabs-sidebar {
    width: 220px;
    height: 100%;
    background: rgba(11, 17, 30, 0.75);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    padding: 1.25rem 0.75rem;
    gap: 0.4rem;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.9rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    color: #94a3b8;
    font-size: 0.875rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #f1f5f9;
  }

  .tab-btn.active {
    background: rgba(0, 229, 255, 0.12);
    border-color: rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.1);
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

  .section-heading {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: #f8fafc;
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

  /* Scrollable section container */
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
    background: rgba(18, 27, 46, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 0.75rem;
    padding: 1.15rem;
  }

  .card-title {
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
    font-size: 0.875rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .bind-hint {
    display: block;
    font-size: 0.75rem;
    color: #64748b;
  }

  .key-badge {
    padding: 0.35rem 0.75rem;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.375rem;
    color: #00e5ff;
    font-family: monospace;
    font-size: 0.825rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .key-badge:hover {
    background: #334155;
    border-color: #00e5ff;
  }

  .key-badge.rebinding {
    background: #00e5ff;
    color: #0b111e;
    box-shadow: 0 0 10px #00e5ff;
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

  /* Custom Sliders */
  .custom-slider {
    width: 100%;
    height: 6px;
    background: #1e293b;
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
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.6);
  }

  /* Mute All Card */
  .mute-all-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.75rem;
  }

  .mute-title {
    display: block;
    font-size: 0.95rem;
    font-weight: 700;
    color: #fca5a5;
  }

  .mute-desc {
    margin: 0.2rem 0 0 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  /* Audio Channels */
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
    font-family: monospace;
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

  /* Video & Graphics */
  .slider-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .slider-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
  }

  .param-name {
    color: #cbd5e1;
    font-weight: 600;
  }

  .param-val {
    color: #00e5ff;
    font-family: monospace;
  }

  .toggles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.75rem;
  }

  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.8rem;
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

  /* Ball Customization */
  .card-header-flex {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  .exclusive-mode-selector {
    display: flex;
    gap: 0.35rem;
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

  .exclusive-hint {
    margin: 0 0 0.85rem 0;
    font-size: 0.775rem;
    color: #38bdf8;
  }

  .ball-cards-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }

  .ball-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.85rem 0.5rem;
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
    width: 48px;
    height: 48px;
    border-radius: 50%;
    margin-bottom: 0.5rem;
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
    font-size: 0.825rem;
    color: #f1f5f9;
  }

  .ball-desc {
    font-size: 0.7rem;
    color: #64748b;
    text-align: center;
  }

  .solid-color-picker-box {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1rem;
    background: rgba(11, 17, 30, 0.7);
    border-radius: 0.5rem;
  }

  .color-preview-disc {
    width: 64px;
    height: 64px;
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
    gap: 0.4rem;
  }

  .color-picker-inputs label {
    font-size: 0.825rem;
    color: #cbd5e1;
  }

  .inputs-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .inputs-row input[type="color"] {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    cursor: pointer;
  }

  .hex-text-input {
    width: 90px;
    padding: 0.4rem 0.6rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.375rem;
    color: #00e5ff;
    font-family: monospace;
    font-size: 0.85rem;
  }

  /* SECTION 4: EQUIPACIONES */
  .team-filter-tabs {
    display: flex;
    gap: 0.5rem;
  }

  .team-tab-pill {
    flex: 1;
    padding: 0.65rem 1rem;
    background: rgba(18, 27, 46, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    color: #94a3b8;
    font-size: 0.9rem;
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

  .captain-callout-box {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: rgba(56, 189, 248, 0.08);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 0.5rem;
  }

  .callout-icon {
    font-size: 1.1rem;
  }

  .callout-text {
    margin: 0;
    font-size: 0.8rem;
    color: #bae6fd;
    line-height: 1.4;
  }

  .kits-layout-grid {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 1.25rem;
  }

  .kits-controls-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-row-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .input-group label,
  .color-picker-box label {
    font-size: 0.8rem;
    color: #94a3b8;
    font-weight: 600;
  }

  .input-group input[type="text"] {
    padding: 0.5rem 0.75rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.375rem;
    color: #f8fafc;
    font-size: 0.875rem;
  }

  .tag-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tag-input-wrapper input {
    flex: 1;
  }

  .tag-badge {
    padding: 0.35rem 0.5rem;
    background: #1e293b;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.375rem;
    color: #00e5ff;
    font-family: monospace;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .color-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .color-control input[type="color"] {
    width: 34px;
    height: 34px;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .hex-mini-input {
    width: 80px;
    padding: 0.35rem 0.5rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.375rem;
    color: #e2e8f0;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .group-subtitle {
    font-size: 0.825rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  .patterns-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .pattern-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 0.4rem;
    background: rgba(11, 17, 30, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
    color: #cbd5e1;
    transition: all 0.15s ease;
  }

  .pattern-card:hover {
    border-color: rgba(0, 229, 255, 0.3);
  }

  .pattern-card.active {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
    color: #00e5ff;
    font-weight: 700;
  }

  .pattern-sample {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .pattern-sample.solid {
    background-color: var(--c1);
  }

  .pattern-sample.vertical {
    background: repeating-linear-gradient(90deg, var(--c1) 0, var(--c1) 6px, var(--c2) 6px, var(--c2) 12px);
  }

  .pattern-sample.hoop {
    background: repeating-linear-gradient(0deg, var(--c1) 0, var(--c1) 6px, var(--c2) 6px, var(--c2) 12px);
  }

  .pattern-sample.halves {
    background: linear-gradient(90deg, var(--c1) 50%, var(--c2) 50%);
  }

  .pattern-sample.chevrons {
    background: repeating-linear-gradient(135deg, var(--c1) 0 5px, var(--c2) 5px 10px);
  }

  .pattern-sample.diagonal-checks {
    background: repeating-linear-gradient(45deg, var(--c1) 0, var(--c1) 5px, var(--c2) 5px, var(--c2) 10px);
  }

  /* Kit Preview Column */
  .kits-preview-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(18, 27, 46, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
  }

  .preview-title {
    font-size: 0.775rem;
    font-weight: 600;
    color: #94a3b8;
  }

  .tactical-pitch-box {
    width: 100%;
    height: 180px;
    background: #143521;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.5rem;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.6);
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
    background: repeating-linear-gradient(90deg, var(--c1) 0, var(--c1) 10px, var(--c2) 10px, var(--c2) 20px);
  }

  .live-pattern-overlay.hoop-stripes {
    background: repeating-linear-gradient(0deg, var(--c1) 0, var(--c1) 10px, var(--c2) 10px, var(--c2) 20px);
  }

  .live-pattern-overlay.halves-stripes {
    background: linear-gradient(90deg, var(--c1) 50%, var(--c2) 50%);
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
    font-family: monospace;
    font-size: 1.35rem;
    font-weight: 900;
    color: #ffffff;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  }

  .disc-pip {
    position: absolute;
    top: 50%;
    right: 3px;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ffffff;
    z-index: 3;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
  }

  .preview-legend {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.775rem;
  }

  .legend-badge {
    color: #e2e8f0;
    font-weight: 600;
  }

  .legend-auto {
    color: #00e5ff;
    font-size: 0.725rem;
  }

  /* SECTION 5: AVATAR Y EMOTES */
  .avatar-hero-preview {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1.15rem;
    background: rgba(18, 27, 46, 0.8);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0.75rem;
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
    font-family: monospace;
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

  .player-nick-title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .player-avatar-desc {
    margin: 0.2rem 0 0 0;
    font-size: 0.825rem;
    color: #94a3b8;
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
    padding: 0.55rem;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: #94a3b8;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .mode-seg-btn.active {
    background: #00e5ff;
    color: #0b111e;
    font-weight: 700;
  }

  .initials-editor-box {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: rgba(18, 27, 46, 0.6);
    border-radius: 0.5rem;
  }

  .initials-editor-box label {
    font-size: 0.825rem;
    color: #cbd5e1;
  }

  .initials-input-field {
    width: 80px;
    padding: 0.5rem 0.75rem;
    background: #0b111e;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.375rem;
    color: #00e5ff;
    font-family: monospace;
    font-size: 1.25rem;
    font-weight: 800;
    text-align: center;
  }

  .emoji-palette-container {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .palette-title {
    font-size: 0.825rem;
    color: #cbd5e1;
  }

  .emoji-grid-12 {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.5rem;
  }

  .emoji-choice-btn {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(11, 17, 30, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    font-size: 1.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .emoji-choice-btn:hover {
    background: rgba(0, 229, 255, 0.1);
    border-color: #00e5ff;
    transform: scale(1.05);
  }

  .emoji-choice-btn.selected {
    background: rgba(0, 229, 255, 0.2);
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.3);
  }

  /* Emotes Toggle Card */
  .toggle-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .toggle-card-title {
    display: block;
    font-size: 0.95rem;
    color: #f1f5f9;
  }

  .toggle-card-desc {
    margin: 0.2rem 0 0 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .behavior-note-box {
    padding: 0.65rem 0.85rem;
    background: rgba(11, 17, 30, 0.7);
    border-left: 3px solid #00e5ff;
    border-radius: 0.375rem;
  }

  .behavior-badge {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: #00e5ff;
    margin-bottom: 0.2rem;
  }

  .behavior-text {
    margin: 0;
    font-size: 0.775rem;
    color: #cbd5e1;
    line-height: 1.4;
  }

  .behavior-text code {
    background: rgba(0, 229, 255, 0.15);
    color: #00e5ff;
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-family: monospace;
  }

  /* Custom Triggers Editor Table */
  .triggers-header {
    margin-bottom: 0.75rem;
  }

  .triggers-subtitle {
    display: block;
    font-size: 0.775rem;
    color: #64748b;
  }

  .triggers-table-wrap {
    overflow-x: auto;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    margin-bottom: 0.85rem;
  }

  .triggers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .triggers-table th {
    padding: 0.6rem 0.75rem;
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
    padding: 0.5rem 0.75rem;
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

  .inline-emoji-edit {
    padding: 0.25rem 0.5rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.25rem;
    font-size: 1.1rem;
    width: 48px;
    text-align: center;
  }

  .delete-td {
    text-align: center;
  }

  .btn-delete-row {
    padding: 0.25rem 0.5rem;
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
    padding: 0.75rem;
    background: rgba(11, 17, 30, 0.7);
    border-radius: 0.5rem;
  }

  .input-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .input-field label {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .input-field input {
    padding: 0.4rem 0.6rem;
    background: #0b111e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.375rem;
    color: #f1f5f9;
    font-size: 0.825rem;
  }

  .emoji-field {
    width: 60px;
  }

  .emoji-field input {
    text-align: center;
    font-size: 1.1rem;
  }

  .btn-add-trigger {
    padding: 0.5rem 1rem;
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
    }
    .kits-layout-grid {
      grid-template-columns: 1fr;
    }
    .ball-cards-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
