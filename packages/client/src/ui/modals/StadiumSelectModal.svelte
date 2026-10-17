<script lang="ts">
  import { gameUI, type StadiumPresetKey } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';
  import { $roomConfig as roomConfigStore } from '../../controllers/stores/gameStore.js';

  let {
    onSelectStadium = (_id: StadiumPresetKey) => {}
  }: {
    onSelectStadium?: (id: StadiumPresetKey) => void;
  } = $props();

  interface ArenaSpawn {
    label: string;
    x: number;
    y: number;
    role: string;
  }

  interface ArenaOption {
    id: string;
    canonicalId: StadiumPresetKey;
    name: string;
    author: string;
    recommendedMode: string;
    fieldSize: string;
    goalWidth: string;
    measuresText: string;
    colorHue: string;
    spawnRed: ArenaSpawn[];
    spawnBlue: ArenaSpawn[];
  }

  const ARENA_CATALOG: ArenaOption[] = [
    {
      id: 'individual',
      canonicalId: 'individual',
      name: 'Individual',
      author: 'Yami',
      recommendedMode: '1v1',
      fieldSize: '800 x 380 px',
      goalWidth: '120 px',
      measuresText: '800 x 380 px | Arcos: 120 px',
      colorHue: '#0d1d1a',
      spawnRed: [
        { label: 'R1', x: 170, y: 125, role: 'SOLO' }
      ],
      spawnBlue: [
        { label: 'B1', x: 410, y: 125, role: 'SOLO' }
      ]
    },
    {
      id: 'small',
      canonicalId: 'small',
      name: 'Pequeño',
      author: 'Yami',
      recommendedMode: '2v2',
      fieldSize: '1000 x 460 px',
      goalWidth: '130 px',
      measuresText: '1000 x 460 px | Arcos: 130 px',
      colorHue: '#0a1926',
      spawnRed: [
        { label: 'R1', x: 140, y: 100, role: 'GK' },
        { label: 'R2', x: 200, y: 150, role: 'FWD' }
      ],
      spawnBlue: [
        { label: 'B1', x: 440, y: 100, role: 'GK' },
        { label: 'B2', x: 380, y: 150, role: 'FWD' }
      ]
    },
    {
      id: 'classic',
      canonicalId: 'classic',
      name: 'Mediano',
      author: 'Yami',
      recommendedMode: '3v3',
      fieldSize: '1200 x 540 px',
      goalWidth: '140 px',
      measuresText: '1200 x 540 px | Arcos: 140 px',
      colorHue: '#081d14',
      spawnRed: [
        { label: 'R1', x: 130, y: 125, role: 'GK' },
        { label: 'R2', x: 190, y: 75, role: 'DEF' },
        { label: 'R3', x: 210, y: 175, role: 'ATT' }
      ],
      spawnBlue: [
        { label: 'B1', x: 450, y: 125, role: 'GK' },
        { label: 'B2', x: 390, y: 75, role: 'DEF' },
        { label: 'B3', x: 370, y: 175, role: 'ATT' }
      ]
    },
    {
      id: 'big',
      canonicalId: 'big',
      name: 'Grande',
      author: 'Yami',
      recommendedMode: '4v4',
      fieldSize: '1600 x 720 px',
      goalWidth: '160 px',
      measuresText: '1600 x 720 px | Arcos: 160 px',
      colorHue: '#061816',
      spawnRed: [
        { label: 'R1', x: 110, y: 125, role: 'GK' },
        { label: 'R2', x: 170, y: 65, role: 'DEF' },
        { label: 'R3', x: 170, y: 185, role: 'MID' },
        { label: 'R4', x: 220, y: 125, role: 'FWD' }
      ],
      spawnBlue: [
        { label: 'B1', x: 470, y: 125, role: 'GK' },
        { label: 'B2', x: 410, y: 65, role: 'DEF' },
        { label: 'B3', x: 410, y: 185, role: 'MID' },
        { label: 'B4', x: 360, y: 125, role: 'FWD' }
      ]
    }
  ];

  function matchCurrentArenaId(): string {
    const curr = (gameUI.selectedStadiumId || 'classic').toLowerCase();
    if (curr.includes('indiv') || curr.includes('1v1')) return 'individual';
    if (curr.includes('small') || curr.includes('peque') || curr.includes('2v2')) return 'small';
    if (curr.includes('big') || curr.includes('grand') || curr.includes('4v4')) return 'big';
    return 'classic';
  }

  // Estado del estadio confirmado/activo
  let activeConfirmedId = $state<string>(matchCurrentArenaId());

  // Estado del estadio actualmente inspeccionado en el panel de detalle
  let inspectedId = $state<string>(matchCurrentArenaId());

  let showConfirmationToast = $state(false);
  let isSelecting = $state(false);

  let inspectedArena = $derived(
    ARENA_CATALOG.find((a) => a.id === inspectedId) ?? ARENA_CATALOG[2]!
  );

  // Regla B.2: Bloqueo Justificado
  // En ROOM_CREATOR o LOBBY: NUNCA se bloquea
  // En IN_GAME: Solo se bloquea si el partido está en juego activo (matchPhase !== 0 y fsmPhase !== 'STOPPED')
  let isMatchLocked = $derived(
    gameUI.currentScreen === 'IN_GAME' && gameUI.matchPhase !== 0 && gameUI.fsmPhase !== 'STOPPED'
  );

  let canSelect = $derived(
    (gameUI.currentScreen === 'ROOM_CREATOR' || gameUI.isHost || gameUI.isAdmin) && !isMatchLocked
  );

  function handleInspectArena(arenaId: string) {
    soundFX.playUIClick();
    inspectedId = arenaId;
  }

  function handleClose() {
    soundFX.playUIClick();
    gameUI.closeOverlay();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleConfirmSelection() {
    if (!canSelect || isSelecting) return;

    soundFX.playUIClick();
    isSelecting = true;
    activeConfirmedId = inspectedId;

    gameUI.selectStadium(inspectedArena.canonicalId, inspectedArena.name);
    onSelectStadium(inspectedArena.canonicalId);
    roomConfigStore.set({ ...roomConfigStore.get(), stadiumId: inspectedArena.id });

    showConfirmationToast = true;

    // Pausa deliberada de 1000 ms para retroalimentación visual al usuario
    setTimeout(() => {
      showConfirmationToast = false;
      isSelecting = false;
      gameUI.closeOverlay();
    }, 1000);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
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
  ← Volver
</button>

<!-- OVERLAY BACKDROP (Condición #) -->
<div
  class="modal-backdrop"
  role="presentation"
  onclick={handleBackdropClick}
>
  <!-- MODAL CONTAINER -->
  <div class="stadium-modal-card" role="dialog" aria-modal="true" aria-labelledby="stadium-dialog-title">
    <!-- Top Ribbon & Header Limpio (Sin etiquetas mock) -->
    <header class="modal-header-ribbon">
      <div class="header-left">
        <!-- Glifo reglamentario de cancha / estadio de fútbol -->
        <div class="stadium-icon-box" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="stadium-pitch-glyph" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <line x1="12" y1="4" x2="12" y2="20" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M2 9h3v6H2" />
            <path d="M22 9h-3v6h3" />
          </svg>
        </div>
        <div class="title-meta">
          <h1 id="stadium-dialog-title" class="dialog-title">Elegir Estadio</h1>
          <span class="dialog-subtitle">Canchas y dimensiones oficiales reglamentarias</span>
        </div>
      </div>

      <div class="header-right">
        {#if isMatchLocked}
          <span class="warning-pill">⚠️ PARTIDO EN CURSO (BLOQUEADO)</span>
        {/if}
      </div>
    </header>

    <!-- Subtitle Bar -->
    <div class="subtitle-bar">
      <div class="subtitle-content">
        <span class="info-icon">ℹ</span>
        <span>Haz clic para inspeccionar cualquier cancha y confirma tu selección con el botón principal.</span>
      </div>
    </div>

    <!-- CENTRAL LAYOUT (2 Columnas: Lista de 4 Estadios + Previsualización e Información) -->
    <div class="stadium-content-grid">
      <!-- LEFT COLUMN: Carrusel Vertical de los 4 Estadios Oficiales -->
      <aside class="stadium-sidebar">
        <div class="sidebar-header-row">
          <span>CATÁLOGO OFICIAL</span>
          <span class="arenas-count">4 ESTADIOS</span>
        </div>

        <div class="stadium-scroll-list">
          {#each ARENA_CATALOG as arena (arena.id)}
            {@const isConfirmed = activeConfirmedId === arena.id}
            {@const isInspected = inspectedId === arena.id}
            <button
              type="button"
              class="arena-card"
              class:inspected={isInspected}
              class:confirmed={isConfirmed}
              onclick={() => handleInspectArena(arena.id)}
            >
              <!-- Checkbox visual de confirmación: Solo marcado en el estadio activo -->
              <div class="checkbox-container">
                <span class="custom-checkbox" class:checked={isConfirmed}>
                  {#if isConfirmed}
                    <svg viewBox="0 0 16 16" class="check-icon" fill="currentColor">
                      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                    </svg>
                  {/if}
                </span>
              </div>

              <div class="card-text">
                <div class="card-title-row">
                  <span class="arena-name">{arena.name}</span>
                  <span class="format-badge">{arena.recommendedMode}</span>
                </div>
                <span class="card-measures">{arena.measuresText}</span>
              </div>
            </button>
          {/each}
        </div>
      </aside>

      <!-- RIGHT COLUMN: Vista Previa Táctica e Información del Mapa -->
      <section class="stadium-detail-panel">
        <!-- Tactical Pitch Preview -->
        <div
          class="tactical-pitch-surface"
          style="background-color: {inspectedArena.colorHue};"
        >
          <div class="pitch-turf-overlay"></div>

          <svg class="tactical-pitch-svg" viewBox="0 0 580 250" fill="none">
            <defs>
              <pattern id="stadium-red-net" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 0 0 L 8 8 M 8 0 L 0 8" fill="none" stroke="#e74c3c" stroke-opacity="0.45" stroke-width="0.7"></path>
              </pattern>
              <pattern id="stadium-blue-net" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 0 0 L 8 8 M 8 0 L 0 8" fill="none" stroke="#3498db" stroke-opacity="0.45" stroke-width="0.7"></path>
              </pattern>
            </defs>

            <!-- Outer Pitch Boundary -->
            <rect x="50" y="20" width="480" height="210" rx="14" stroke="#00e5ff" stroke-opacity="0.85" stroke-width="1.8" />
            <!-- Center Line -->
            <line x1="290" y1="20" x2="290" y2="230" stroke="#00e5ff" stroke-opacity="0.75" stroke-width="1.4" />
            <!-- Center Circle & Spot -->
            <circle cx="290" cy="125" r="44" stroke="#00e5ff" stroke-opacity="0.75" stroke-width="1.4" />
            <circle cx="290" cy="125" r="3.5" fill="#00e5ff" />

            <!-- LEFT GOAL (RED TEAM) -->
            <rect x="20" y="85" width="30" height="80" rx="4" fill="url(#stadium-red-net)" stroke="#e74c3c" stroke-opacity="0.7" stroke-width="1.2" />
            <line x1="50" y1="85" x2="50" y2="165" stroke="#ffffff" stroke-dasharray="3 3" stroke-opacity="0.5" stroke-width="2" />
            <circle cx="50" cy="85" r="4.5" fill="#ffffff" stroke="#e74c3c" stroke-width="2" />
            <circle cx="50" cy="165" r="4.5" fill="#ffffff" stroke="#e74c3c" stroke-width="2" />
            <path d="M 50 60 H 105 V 190 H 50" stroke="#00e5ff" stroke-opacity="0.6" stroke-width="1.2" />
            <circle cx="88" cy="125" r="2.5" fill="#00e5ff" opacity="0.8" />

            <!-- RIGHT GOAL (BLUE TEAM) -->
            <rect x="530" y="85" width="30" height="80" rx="4" fill="url(#stadium-blue-net)" stroke="#3498db" stroke-opacity="0.7" stroke-width="1.2" />
            <line x1="530" y1="85" x2="530" y2="165" stroke="#ffffff" stroke-dasharray="3 3" stroke-opacity="0.5" stroke-width="2" />
            <circle cx="530" cy="85" r="4.5" fill="#ffffff" stroke="#3498db" stroke-width="2" />
            <circle cx="530" cy="165" r="4.5" fill="#ffffff" stroke="#3498db" stroke-width="2" />
            <path d="M 530 60 H 475 V 190 H 530" stroke="#00e5ff" stroke-opacity="0.6" stroke-width="1.2" />
            <circle cx="492" cy="125" r="2.5" fill="#00e5ff" opacity="0.8" />

            <!-- Spawns (Red & Blue) -->
            {#each inspectedArena.spawnRed as s}
              <g transform="translate({s.x}, {s.y})">
                <circle r="12" fill="#e74c3c" fill-opacity="0.25" stroke="#ff4d4d" stroke-width="1.5" />
                <circle r="8" fill="#e74c3c" />
                <text text-anchor="middle" dy="3.5" fill="#ffffff" font-size="8.5" font-weight="700" font-family="'JetBrains Mono', monospace">{s.label}</text>
              </g>
            {/each}

            {#each inspectedArena.spawnBlue as s}
              <g transform="translate({s.x}, {s.y})">
                <circle r="12" fill="#3498db" fill-opacity="0.25" stroke="#00e5ff" stroke-width="1.5" />
                <circle r="8" fill="#3498db" />
                <text text-anchor="middle" dy="3.5" fill="#ffffff" font-size="8.5" font-weight="700" font-family="'JetBrains Mono', monospace">{s.label}</text>
              </g>
            {/each}

            <!-- Central Ball -->
            <g transform="translate(290, 125)">
              <circle r="11" fill="#ffe16d" fill-opacity="0.2" />
              <circle r="6.5" fill="#ffffff" stroke="#e9c400" stroke-width="1.8" />
              <circle r="2" fill="#0e141e" />
            </g>
          </svg>
        </div>

        <!-- Panel Formal: Información del mapa -->
        <div class="technical-specs-panel">
          <div class="specs-header">
            <span class="terminal-icon">🏟</span>
            <span class="specs-title">Información del mapa</span>
          </div>

          <ul class="specs-list">
            <li>
              <span class="bullet">•</span>
              <span class="label">Nombre del mapa:</span>
              <strong class="highlight">{inspectedArena.name}</strong>
            </li>
            <li>
              <span class="bullet">•</span>
              <span class="label">Autor:</span>
              <strong class="highlight author-tag">{inspectedArena.author}</strong>
            </li>
            <li>
              <span class="bullet">•</span>
              <span class="label">Modo recomendado:</span>
              <span class="badge-mode">{inspectedArena.recommendedMode}</span>
            </li>
            <li>
              <span class="bullet">•</span>
              <span class="label">Medidas:</span>
              <span class="measures-val">{inspectedArena.measuresText}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <!-- MODAL FOOTER: Botón principal "Seleccionar estadio" -->
    <footer class="modal-footer">
      <button
        type="button"
        class="confirm-selection-btn"
        disabled={!canSelect || isSelecting}
        onclick={handleConfirmSelection}
      >
        {#if isSelecting}
          <span class="spinner"></span>
          <span>Aplicando estadio...</span>
        {:else if showConfirmationToast}
          <span>✓ ¡Estadio Seleccionado!</span>
        {:else}
          <span>Seleccionar estadio</span>
        {/if}
      </button>

      {#if !canSelect && !isMatchLocked}
        <p class="guest-notice">⚠️ Solo el anfitrión de la sala tiene permisos para cambiar el estadio.</p>
      {/if}
    </footer>

    {#if showConfirmationToast}
      <div class="toast-notification">
        <span>✓</span>
        <span>Estadio {inspectedArena.name} configurado correctamente</span>
      </div>
    {/if}
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
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 9999px;
    color: #00e5ff;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 229, 255, 0.15);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    pointer-events: auto;
  }

  .floating-back-btn:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
    color: #ffffff;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6), 0 0 25px rgba(0, 229, 255, 0.35);
    transform: translateY(-1px);
  }

  .floating-back-btn:active {
    transform: translateY(0);
  }

  /* Modal Backdrop Overlay */
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
  .stadium-modal-card {
    position: relative;
    width: min(94vw, 920px);
    height: 640px;
    background: rgba(10, 16, 26, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.6);
    border-radius: 0.5rem;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.35), inset 0 0 12px rgba(0, 229, 255, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #dde2f1;
    pointer-events: auto;
  }

  /* Header Ribbon */
  .modal-header-ribbon {
    width: 100%;
    background: #080e18;
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    box-sizing: border-box;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .stadium-icon-box {
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 0.5rem;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.35);
    color: #00e5ff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.2);
  }

  .stadium-pitch-glyph {
    width: 1.35rem;
    height: 1.35rem;
  }

  .title-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .dialog-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.01em;
  }

  .dialog-subtitle {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .warning-pill {
    padding: 0.35rem 0.75rem;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 0.4rem;
    color: #fbbf24;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  /* Subtitle Bar */
  .subtitle-bar {
    padding: 0.5rem 1.25rem;
    background: rgba(14, 21, 37, 0.9);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .subtitle-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .info-icon {
    color: #00e5ff;
  }

  /* Content Grid: 2 Columns */
  .stadium-content-grid {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Left Sidebar: 4 Arenas List */
  .stadium-sidebar {
    width: 270px;
    background: #090f1b;
    border-right: 1px solid rgba(0, 229, 255, 0.15);
    display: flex;
    flex-direction: column;
    padding: 1rem 0.85rem;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .sidebar-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.72rem;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.05em;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    margin-bottom: 0.75rem;
  }

  .arenas-count {
    background: rgba(0, 229, 255, 0.12);
    padding: 0.15rem 0.45rem;
    border-radius: 0.25rem;
    color: #00e5ff;
    font-size: 0.68rem;
  }

  .stadium-scroll-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    overflow-y: auto;
  }

  /* Arena Card */
  .arena-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 0.95rem;
    background: rgba(18, 28, 48, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.65rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .arena-card:hover {
    background: rgba(18, 28, 48, 0.95);
    border-color: rgba(0, 229, 255, 0.3);
  }

  .arena-card.inspected {
    border-color: rgba(0, 229, 255, 0.7);
    background: rgba(0, 229, 255, 0.08);
    box-shadow: 0 0 15px rgba(0, 229, 255, 0.12);
  }

  .arena-card.confirmed {
    border-color: #00e5ff;
  }

  /* Custom Checkbox */
  .checkbox-container {
    flex-shrink: 0;
  }

  .custom-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.35rem;
    border: 1.5px solid rgba(255, 255, 255, 0.25);
    background: rgba(11, 17, 30, 0.8);
    transition: all 0.15s ease;
  }

  .custom-checkbox.checked {
    background: #00e5ff;
    border-color: #00e5ff;
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
  }

  .check-icon {
    width: 0.9rem;
    height: 0.9rem;
    color: #0a101a;
  }

  .card-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    overflow: hidden;
    flex: 1;
  }

  .card-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .arena-name {
    font-size: 0.88rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .format-badge {
    font-size: 0.68rem;
    font-weight: 800;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    padding: 0.15rem 0.4rem;
    border-radius: 0.25rem;
  }

  .card-measures {
    font-size: 0.68rem;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Right Detail Panel */
  .stadium-detail-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #080e18;
    overflow-y: auto;
    padding: 1.25rem;
    box-sizing: border-box;
    gap: 1rem;
  }

  .tactical-pitch-surface {
    position: relative;
    width: 100%;
    height: 250px;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid rgba(0, 229, 255, 0.25);
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pitch-turf-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.4) 100%);
    pointer-events: none;
  }

  .tactical-pitch-svg {
    width: 100%;
    height: 100%;
    max-height: 240px;
    z-index: 1;
  }

  /* Information Panel */
  .technical-specs-panel {
    background: rgba(13, 21, 38, 0.85);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
  }

  .specs-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.85rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .terminal-icon {
    font-size: 1.1rem;
    color: #00e5ff;
  }

  .specs-title {
    font-size: 0.85rem;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .specs-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem 1.25rem;
  }

  .specs-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .bullet {
    color: #00e5ff;
  }

  .label {
    color: #94a3b8;
    font-weight: 500;
  }

  .highlight {
    color: #f1f5f9;
    font-weight: 700;
  }

  .author-tag {
    color: #38bdf8;
  }

  .badge-mode {
    background: rgba(0, 229, 255, 0.12);
    color: #00e5ff;
    padding: 0.15rem 0.5rem;
    border-radius: 0.25rem;
    font-weight: 800;
  }

  .measures-val {
    color: #f1f5f9;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
  }

  /* Modal Footer */
  .modal-footer {
    padding: 0.9rem 1.25rem;
    background: #080e18;
    border-top: 1px solid rgba(0, 229, 255, 0.15);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .confirm-selection-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.75rem 1.75rem;
    background: linear-gradient(135deg, #00e5ff 0%, #00b4d8 100%);
    border: none;
    border-radius: 0.5rem;
    color: #070d18;
    font-size: 0.875rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
    transition: all 0.2s ease;
  }

  .confirm-selection-btn:hover:not(:disabled) {
    box-shadow: 0 0 30px rgba(0, 229, 255, 0.7);
    transform: translateY(-1px);
    color: #000000;
  }

  .confirm-selection-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .confirm-selection-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    border-top-color: #000000;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .guest-notice {
    margin: 0;
    font-size: 0.75rem;
    color: #fbbf24;
  }

  .toast-notification {
    position: absolute;
    bottom: 4.5rem;
    right: 1.5rem;
    background: #059669;
    color: #ffffff;
    padding: 0.65rem 1.15rem;
    border-radius: 0.5rem;
    font-size: 0.8rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 10;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .stadium-content-grid {
      flex-direction: column;
    }
    .stadium-sidebar {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid rgba(0, 229, 255, 0.15);
    }
    .specs-list {
      grid-template-columns: 1fr;
    }
  }
</style>
