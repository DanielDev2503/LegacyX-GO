<script lang="ts">
  import { gameUI, type BallSkinType } from '../state/gameUI.svelte';
  import KeybindModal from './KeybindModal.svelte';

  type SettingsTab = 'audio' | 'graphics' | 'minimap' | 'controls';
  let activeTab = $state<SettingsTab>('audio');

  function updateSetting<K extends keyof typeof gameUI.settings>(
    key: K,
    val: (typeof gameUI.settings)[K]
  ) {
    gameUI.updateSettings({ [key]: val });
  }
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true">
  <div class="settings-modal-card">
    <header class="modal-header">
      <div>
        <span class="kicker">PREFERENCIAS DEL CLIENTE</span>
        <h2>Ajustes del Juego</h2>
      </div>
      <div class="header-actions">
        <button
          class="theme-btn modal-nav-theme-btn"
          onclick={() => gameUI.toggleTheme()}
          title="Cambiar tema Claro / Oscuro"
        >
          {gameUI.theme === 'dark' ? '☀️ Aero Light' : '🌙 Cyber Dark'}
        </button>
        <button class="back-btn modal-nav-back-btn" onclick={() => gameUI.closeModal()}>
          ← Volver
        </button>
      </div>
    </header>

    <div class="settings-body">
      <nav class="tabs-sidebar">
        <button
          class="tab-btn"
          class:active={activeTab === 'audio'}
          onclick={() => (activeTab = 'audio')}
        >
          🔊 Audio
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === 'graphics'}
          onclick={() => (activeTab = 'graphics')}
        >
          🖥️ Gráficos y Red
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === 'minimap'}
          onclick={() => (activeTab = 'minimap')}
        >
          🗺️ Radar Táctico
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === 'controls'}
          onclick={() => (activeTab = 'controls')}
        >
          🎮 Controles
        </button>
      </nav>

      <div class="tab-content">
        {#if activeTab === 'audio'}
          <div class="settings-group">
            <label class="setting-row">
              <span>Silenciar Todo el Audio</span>
              <input
                type="checkbox"
                checked={gameUI.settings.isMuted}
                onchange={(e) => updateSetting('isMuted', (e.currentTarget as HTMLInputElement).checked)}
              />
            </label>

            <label class="setting-slider">
              <div class="slider-head">
                <span>Volumen Maestro</span>
                <strong>{Math.round(gameUI.settings.masterVolume * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={gameUI.settings.masterVolume}
                oninput={(e) =>
                  updateSetting('masterVolume', Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>

            <label class="setting-slider">
              <div class="slider-head">
                <span>Efectos de Partido (Pateo, Poste, Silbato, Gol)</span>
                <strong>{Math.round(gameUI.settings.sfxVolume * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={gameUI.settings.sfxVolume}
                oninput={(e) =>
                  updateSetting('sfxVolume', Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>

            <label class="setting-slider">
              <div class="slider-head">
                <span>Multitud y Ambiente</span>
                <strong>{Math.round(gameUI.settings.crowdVolume * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={gameUI.settings.crowdVolume}
                oninput={(e) =>
                  updateSetting('crowdVolume', Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>
          </div>
        {:else if activeTab === 'graphics'}
          <div class="settings-group">
            <div class="setting-row">
              <span>Tema Visual</span>
              <div class="pill-selector">
                <button
                  class:selected={gameUI.theme === 'dark'}
                  onclick={() => gameUI.setTheme('dark')}
                >
                  Cyber Dark
                </button>
                <button
                  class:selected={gameUI.theme === 'light'}
                  onclick={() => gameUI.setTheme('light')}
                >
                  Aero Light
                </button>
              </div>
            </div>

            <div class="setting-row">
              <span>Diseño del Balón (3D Icosaedro)</span>
              <div class="pill-selector">
                {#each ['classic', 'retro', 'neon'] as skin}
                  <button
                    class:selected={gameUI.settings.ballSkin === skin}
                    onclick={() => updateSetting('ballSkin', skin as BallSkinType)}
                  >
                    {skin.toUpperCase()}
                  </button>
                {/each}
              </div>
            </div>

            <div class="setting-row">
              <span>Límite de Cuadros (FPS Cap)</span>
              <select
                value={gameUI.settings.fpsCap}
                onchange={(e) =>
                  updateSetting('fpsCap', Number((e.currentTarget as HTMLSelectElement).value) as 0 | 60 | 120 | 144)}
              >
                <option value={0}>Ilimitado (Nativo)</option>
                <option value={60}>60 FPS</option>
                <option value={120}>120 FPS</option>
                <option value={144}>144 FPS</option>
              </select>
            </div>

            <label class="setting-slider">
              <div class="slider-head">
                <span>Extrapolación Visual de Red (ms)</span>
                <strong>{gameUI.settings.extrapolationMs} ms</strong>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={gameUI.settings.extrapolationMs}
                oninput={(e) =>
                  updateSetting('extrapolationMs', Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>

            <label class="setting-row">
              <span>Mostrar Monitor de Telemetría (Ping / FPS)</span>
              <input
                type="checkbox"
                checked={gameUI.settings.showStatsMonitor}
                onchange={(e) =>
                  updateSetting('showStatsMonitor', (e.currentTarget as HTMLInputElement).checked)}
              />
            </label>

            <label class="setting-row">
              <span>Indicadores Perimetrales Fuera de Cámara</span>
              <input
                type="checkbox"
                checked={gameUI.settings.offscreenIndicators}
                onchange={(e) =>
                  updateSetting('offscreenIndicators', (e.currentTarget as HTMLInputElement).checked)}
              />
            </label>
          </div>
        {:else if activeTab === 'minimap'}
          <div class="settings-group">
            <div class="setting-row">
              <span>Visibilidad del Radar</span>
              <select
                value={gameUI.settings.minimapMode}
                onchange={(e) =>
                  updateSetting(
                    'minimapMode',
                    (e.currentTarget as HTMLSelectElement).value as 'always' | 'auto' | 'off'
                  )}
              >
                <option value="always">Siempre Visible</option>
                <option value="auto">Automático (Canchas Medianas/Grandes)</option>
                <option value="off">Oculto</option>
              </select>
            </div>

            <div class="setting-row">
              <span>Posición en Pantalla</span>
              <select
                value={gameUI.settings.minimapPosition}
                onchange={(e) =>
                  updateSetting(
                    'minimapPosition',
                    (e.currentTarget as HTMLSelectElement).value as 'top-right' | 'bottom-right' | 'bottom-left'
                  )}
              >
                <option value="bottom-right">Inferior Derecha</option>
                <option value="top-right">Superior Derecha</option>
                <option value="bottom-left">Inferior Izquierda</option>
              </select>
            </div>

            <div class="setting-row">
              <span>Tamaño del Minimapa</span>
              <div class="pill-selector">
                {#each ['small', 'normal', 'large'] as sz}
                  <button
                    class:selected={gameUI.settings.minimapSize === sz}
                    onclick={() =>
                      updateSetting('minimapSize', sz as 'small' | 'normal' | 'large')}
                  >
                    {sz === 'small' ? 'Pequeño' : sz === 'normal' ? 'Normal' : 'Grande'}
                  </button>
                {/each}
              </div>
            </div>

            <label class="setting-slider">
              <div class="slider-head">
                <span>Opacidad del Radar</span>
                <strong>{Math.round(gameUI.settings.minimapOpacity * 100)}%</strong>
              </div>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={gameUI.settings.minimapOpacity}
                oninput={(e) =>
                  updateSetting('minimapOpacity', Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>
          </div>
        {:else if activeTab === 'controls'}
          <KeybindModal embedded={true} />
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 17, 0.78);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 135;
    padding: 1rem;
  }

  .settings-modal-card {
    width: min(760px, 95vw);
    background: rgba(10, 16, 26, 0.98);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 18px;
    padding: 1.4rem 1.6rem;
    color: #f0f8ff;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.65);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .kicker {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: #00e5ff;
  }

  h2 {
    margin: 0.15rem 0 0;
    font-size: 1.3rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .theme-btn,
  .back-btn {
    background: rgba(30, 41, 59, 0.85);
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 8px;
    padding: 0.45rem 0.85rem;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .settings-body {
    display: grid;
    grid-template-columns: 190px 1fr;
    gap: 1.25rem;
    min-height: 330px;
  }

  .tabs-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .tab-btn {
    text-align: left;
    padding: 0.65rem 0.85rem;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.14);
    color: #94a3b8;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
  }

  .tab-btn.active {
    background: rgba(0, 229, 255, 0.14);
    border-color: #00e5ff;
    color: #f8fafc;
  }

  .tab-content {
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 12px;
    padding: 1rem 1.15rem;
  }

  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    color: #e2e8f0;
  }

  .setting-row select {
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid rgba(0, 229, 255, 0.28);
    border-radius: 8px;
    padding: 0.38rem 0.65rem;
    font-size: 0.8rem;
  }

  .setting-slider {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.84rem;
  }

  .slider-head {
    display: flex;
    justify-content: space-between;
    color: #cbd5e1;
  }

  .slider-head strong {
    color: #38bdf8;
    font-family: monospace;
  }

  input[type='range'] {
    width: 100%;
    accent-color: #00e5ff;
  }

  .pill-selector {
    display: flex;
    gap: 0.35rem;
  }

  .pill-selector button {
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: #0f172a;
    color: #94a3b8;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }

  .pill-selector button.selected {
    background: rgba(0, 229, 255, 0.18);
    border-color: #00e5ff;
    color: #00e5ff;
  }
</style>
