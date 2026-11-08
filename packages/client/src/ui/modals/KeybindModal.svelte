<script lang="ts">
  import { gameUI, formatKeybindCode, type KeybindConfig } from '../state/gameUI.svelte.js';
  import { mouseButtonToCode } from '../../controllers/InputManager.js';

  let {
    embedded = false
  }: {
    embedded?: boolean;
  } = $props();

  const ACTION_LABELS: { key: keyof KeybindConfig; label: string }[] = [
    { key: 'up', label: 'Mover Arriba' },
    { key: 'down', label: 'Mover Abajo' },
    { key: 'left', label: 'Mover Izquierda' },
    { key: 'right', label: 'Mover Derecha' },
    { key: 'kick', label: 'Patear Balón (X / Click Izq)' },
    { key: 'turbo', label: 'Sprint Turbo (Shift)' },
    { key: 'dash', label: 'Impulso Dash (Espacio / Click Der)' },
    { key: 'curveLeft', label: 'Curva Magnus Izq. (Z)' },
    { key: 'curveRight', label: 'Curva Magnus Der. (C)' },
    { key: 'focusBall', label: 'Enfocar Balón (V / Tab)' },
    { key: 'pause', label: 'Pausar Partido (P)' },
    { key: 'menu', label: 'Menú de Sala (Esc)' },
    { key: 'chat', label: 'Interactuar con Chat (Enter)' }
  ];

  let listeningKey = $state<keyof KeybindConfig | null>(null);

  function formatKeyCode(code: string | string[]): string {
    const raw = Array.isArray(code) ? (code[0] ?? '') : code;
    return formatKeybindCode(raw) || 'Sin asignar';
  }

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (!listeningKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      listeningKey = null;
      return;
    }
    gameUI.setKeybind(listeningKey, e.code);
    listeningKey = null;
  }

  function handleWindowMouseDown(e: MouseEvent) {
    if (!listeningKey) return;
    const code = mouseButtonToCode(e.button);
    if (!code) return;
    e.preventDefault();
    e.stopPropagation();
    gameUI.setKeybind(listeningKey, code);
    listeningKey = null;
  }

  function handleWindowContextMenu(e: MouseEvent) {
    if (listeningKey) {
      e.preventDefault();
    }
  }
</script>

<svelte:window
  onkeydown={handleWindowKeyDown}
  onmousedown={handleWindowMouseDown}
  oncontextmenu={handleWindowContextMenu}
/>

{#if embedded}
  <div class="keybind-panel">
    {#if gameUI.lastKeybindSwapNotice}
      <div class="swap-notice">{gameUI.lastKeybindSwapNotice}</div>
    {/if}
    <div class="keybind-list">
      {#each ACTION_LABELS as item (item.key)}
        <div class="keybind-row">
          <span class="action-label">{item.label}</span>
          <button
            type="button"
            class="bind-btn"
            class:listening={listeningKey === item.key}
            onmousedown={(e) => {
              if (listeningKey !== item.key) e.stopPropagation();
            }}
            onclick={() => {
              if (listeningKey !== item.key) listeningKey = item.key;
            }}
          >
            {listeningKey === item.key ? 'Tecla o Click...' : formatKeyCode(gameUI.keybinds[item.key])}
          </button>
        </div>
      {/each}
    </div>
    <div class="keybind-footer">
      <button type="button" class="reset-btn" onclick={() => gameUI.resetKeybinds()}>
        Restablecer Controles por Defecto
      </button>
    </div>
  </div>
{:else}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="keybind-modal-card">
      <header class="modal-header">
        <div>
          <span class="kicker">CONTROLES PERSONALIZADOS</span>
          <h2>Mapeo de Teclas y Ratón</h2>
        </div>
        <button type="button" class="close-btn" onclick={() => gameUI.closeModal()} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {#if gameUI.lastKeybindSwapNotice}
        <div class="swap-notice">{gameUI.lastKeybindSwapNotice}</div>
      {/if}

      <div class="keybind-list">
        {#each ACTION_LABELS as item (item.key)}
          <div class="keybind-row">
            <span class="action-label">{item.label}</span>
            <button
              type="button"
              class="bind-btn"
              class:listening={listeningKey === item.key}
              onmousedown={(e) => {
                if (listeningKey !== item.key) e.stopPropagation();
              }}
              onclick={() => {
                if (listeningKey !== item.key) listeningKey = item.key;
              }}
            >
              {listeningKey === item.key ? 'Tecla o Click...' : formatKeyCode(gameUI.keybinds[item.key])}
            </button>
          </div>
        {/each}
      </div>

      <footer class="keybind-footer">
        <button type="button" class="reset-btn" onclick={() => gameUI.resetKeybinds()}>
          Restablecer por Defecto
        </button>
        <button type="button" class="done-btn" onclick={() => gameUI.closeModal()}>
          Guardar y Cerrar
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 14, 0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 140;
    padding: 1rem;
    pointer-events: auto;
  }

  .keybind-modal-card {
    width: min(540px, 95vw);
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.6);
    border-radius: 0.5rem;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.25), inset 0 0 12px rgba(0, 229, 255, 0.1);
    padding: 1.4rem;
    color: #f0f8ff;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    font-family: 'Chivo', system-ui, sans-serif;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .kicker {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: #00e5ff;
  }

  h2 {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    margin: 0.15rem 0 0;
    font-size: 1.2rem;
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #131c2e;
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 8px;
    padding: 0.45rem;
    cursor: pointer;
  }

  .swap-notice {
    font-size: 0.76rem;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.08);
    border: 1px solid rgba(255, 215, 0, 0.35);
    border-radius: 6px;
    padding: 0.45rem 0.7rem;
  }

  .keybind-panel {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .keybind-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 340px;
    overflow-y: auto;
  }

  .keybind-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 8px;
  }

  .action-label {
    font-size: 0.84rem;
    font-weight: 600;
    color: #cbd5e1;
  }

  .bind-btn {
    min-width: 145px;
    padding: 0.38rem 0.75rem;
    border-radius: 6px;
    background: #080d17;
    border: 1px solid rgba(0, 229, 255, 0.35);
    color: #38bdf8;
    font-family: 'JetBrains Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .bind-btn.listening {
    background: rgba(245, 158, 11, 0.2);
    border-color: #f59e0b;
    color: #fbbf24;
  }

  .keybind-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.65rem;
    padding-top: 0.4rem;
  }

  .reset-btn {
    padding: 0.55rem 0.95rem;
    border-radius: 8px;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.25);
    color: #cbd5e1;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }

  .done-btn {
    padding: 0.55rem 1.1rem;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #00e5ff, #0284c7);
    color: #04131f;
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
  }
</style>
