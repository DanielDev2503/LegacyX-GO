<script lang="ts">
  import { gameUI, type StadiumPresetKey } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

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
    subtext: string;
    format: string;
    dimensions: string;
    nets: string;
    bounce: string;
    badge: string;
    colorHue: string;
    spawnRed: ArenaSpawn[];
    spawnBlue: ArenaSpawn[];
  }

  const ARENA_CATALOG: ArenaOption[] = [
    {
      id: 'af3v3',
      canonicalId: 'AF 3v3 Official',
      name: 'AF 3v3 Official',
      author: 'Vitão (LegacyX Tier-1)',
      subtext: 'Estándar Competitivo',
      format: '3v3 y 4v4 competitivo oficial',
      dimensions: '840 × 400 px | Apertura de Porterías: 130 px',
      nets: 'Modelo elástico de baja amortiguación con postes cilíndricos de 8 px',
      bounce: '0.80 (Rebote dinámico estándar)',
      badge: 'OFICIAL TORNEO',
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
      id: 'classic',
      canonicalId: 'Classic',
      name: 'Classic Field',
      author: 'Basro Community Core',
      subtext: 'Haxball Clásico 2v2 / 3v3',
      format: '2v2 y 3v3 casual / rank',
      dimensions: '740 × 360 px | Apertura de Porterías: 120 px',
      nets: 'Red rígida estándar Haxball v1.2',
      bounce: '0.75 (Fricción equilibrada)',
      badge: 'CLÁSICO RETRO',
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
      id: 'bigstadium',
      canonicalId: 'Big',
      name: 'Big Stadium',
      author: 'LegacyX Map Guild',
      subtext: 'Cancha Grande 4v4 / 5v5',
      format: '4v4 y 5v5 escuadras completas',
      dimensions: '1120 × 520 px | Apertura de Porterías: 160 px',
      nets: 'Red profunda de amortiguación gradual',
      bounce: '0.85 (Aceleración alta)',
      badge: 'ESPACIO AMPLIO',
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
    },
    {
      id: 'smallarena',
      canonicalId: 'Small',
      name: 'Small Arena',
      author: 'SpeedDuel Systems',
      subtext: 'Espacio Reducido 1v1 / 2v2',
      format: '1v1 Duelos puros y práctica 2v2',
      dimensions: '600 × 300 px | Apertura de Porterías: 100 px',
      nets: 'Poste metálico sólido directo',
      bounce: '0.92 (Rebote ultra-rápido)',
      badge: 'DUELOS 1V1',
      colorHue: '#141724',
      spawnRed: [
        { label: 'R1', x: 170, y: 125, role: 'SOLO' }
      ],
      spawnBlue: [
        { label: 'B1', x: 410, y: 125, role: 'SOLO' }
      ]
    },
    {
      id: 'futsal',
      canonicalId: 'Medium',
      name: 'Futsal Pro Court',
      author: 'Futsal Federation Pro',
      subtext: 'Paredes Rígidas Rebote Rápido',
      format: '3v3 sin fuera de banda (pared perimetral)',
      dimensions: '800 × 380 px | Apertura de Porterías: 110 px',
      nets: 'Cajón compacto con absorción 0.3',
      bounce: '0.98 (Pared perimetral de madera técnica)',
      badge: 'FUTSAL RULES',
      colorHue: '#1c140c',
      spawnRed: [
        { label: 'R1', x: 130, y: 125, role: 'GK' },
        { label: 'R2', x: 195, y: 80, role: 'DEF' },
        { label: 'R3', x: 215, y: 170, role: 'PIVOT' }
      ],
      spawnBlue: [
        { label: 'B1', x: 450, y: 125, role: 'GK' },
        { label: 'B2', x: 385, y: 80, role: 'DEF' },
        { label: 'B3', x: 365, y: 170, role: 'PIVOT' }
      ]
    },
    {
      id: 'hockey',
      canonicalId: 'Medium',
      name: 'Hockey Rink Arena',
      author: 'Zero-G Labs',
      subtext: 'Superficie de Baja Fricción',
      format: '3v3 y 4v4 Puck/Ball deslizante',
      dimensions: '860 × 420 px | Apertura de Porterías: 140 px',
      nets: 'Tubos curvados de hockey sobre hielo',
      bounce: '0.95 (Hielo sintético sin deceleración)',
      badge: 'BAJA FRICCIÓN',
      colorHue: '#0a192f',
      spawnRed: [
        { label: 'R1', x: 130, y: 125, role: 'GK' },
        { label: 'R2', x: 200, y: 75, role: 'DEF' },
        { label: 'R3', x: 200, y: 175, role: 'WING' }
      ],
      spawnBlue: [
        { label: 'B1', x: 450, y: 125, role: 'GK' },
        { label: 'B2', x: 380, y: 75, role: 'DEF' },
        { label: 'B3', x: 380, y: 175, role: 'WING' }
      ]
    }
  ];

  function matchCurrentArenaId(): string {
    const curr = (gameUI.selectedStadiumId || 'classic').toLowerCase();
    if (curr.includes('af') || curr.includes('3v3')) return 'af3v3';
    if (curr.includes('big')) return 'bigstadium';
    if (curr.includes('small')) return 'smallarena';
    if (curr.includes('futsal')) return 'futsal';
    if (curr.includes('hockey')) return 'hockey';
    return 'classic';
  }

  let selectedId = $state<string>(matchCurrentArenaId());
  let showConfirmationToast = $state(false);

  let activeArena = $derived(
    ARENA_CATALOG.find((a) => a.id === selectedId) ?? ARENA_CATALOG[0]!
  );

  function handleSelectArena(arenaId: string) {
    soundFX.playUIClick();
    selectedId = arenaId;
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

  function handleConfirm() {
    if (gameUI.isMatchActive) return;
    if (!gameUI.isHost && !gameUI.isAdmin) return;

    soundFX.playUIClick();
    gameUI.selectStadium(activeArena.canonicalId, activeArena.name);
    onSelectStadium(activeArena.canonicalId);

    showConfirmationToast = true;
    setTimeout(() => {
      showConfirmationToast = false;
      gameUI.closeOverlay();
    }, 600);
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
  <!-- MODAL CONTAINER (Exact Stitch Specs: min(94vw, 920px), h: 620px) -->
  <div class="stadium-modal-card" role="dialog" aria-modal="true" aria-labelledby="stadium-dialog-title">
    <!-- Top Ribbon & Header -->
    <header class="modal-header-ribbon">
      <div class="header-left">
        <div class="stadium-icon-box">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M7 5h10v2H7V5zm-4 6h18v2H3v-2zm2 6h14v2H5v-2zM4 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4z" />
          </svg>
        </div>
        <div class="title-meta">
          <div class="protocol-row">
            <span class="protocol-tag">[MA] LOBBY PROTOCOL</span>
            <span class="protocol-dot"></span>
          </div>
          <h1 id="stadium-dialog-title" class="dialog-title">Elegir Estadio</h1>
        </div>
      </div>

      <div class="header-right">
        <div class="active-badge" id="header-active-map-badge">
          MAPA ACTIVO: {activeArena.name.toUpperCase()}
        </div>
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

    <!-- Subtitle Description Band -->
    <div class="subtitle-bar">
      <div class="subtitle-content">
        <span class="info-icon">ℹ</span>
        <span>Selecciona el terreno de juego para la partida. Nuevos mapas se añadirán dinámicamente a la lista oficial.</span>
      </div>
      {#if gameUI.isMatchActive}
        <span class="warning-pill">⚠️ PARTIDO EN CURSO (BLOQUEADO)</span>
      {/if}
    </div>

    <!-- CENTRAL LAYOUT (2 Columns: List 260px + Preview & Specs) -->
    <div class="stadium-content-grid">
      <!-- LEFT COLUMN: Vertical Stadium Carousel (Width: 260px) -->
      <aside class="stadium-sidebar">
        <div class="sidebar-header-row">
          <span>MAPAS DISPONIBLES</span>
          <span class="arenas-count">6 ARENAS</span>
        </div>

        <div class="stadium-scroll-list">
          {#each ARENA_CATALOG as arena (arena.id)}
            <button
              type="button"
              class="arena-card"
              class:selected={selectedId === arena.id}
              onclick={() => handleSelectArena(arena.id)}
            >
              <div class="accent-bar" class:visible={selectedId === arena.id}></div>
              <div class="card-text">
                <div class="card-title-row">
                  <span class="arena-name">{arena.name}</span>
                </div>
                <span class="arena-subtext">{arena.subtext}</span>
                <span class="arena-author">Autor: {arena.author}</span>
              </div>
              <div class="check-box" class:checked={selectedId === arena.id}>
                {#if selectedId === arena.id}
                  <span>✓</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </aside>

      <!-- RIGHT COLUMN: 2D Pitch Panorama + Technical Specs Fiche -->
      <main class="stadium-preview-area">
        <!-- Superior: 2D Pitch Vector Surface -->
        <div
          class="tactical-pitch-surface"
          style="background-color: {activeArena.colorHue};"
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
            <!-- Cylindrical Posts -->
            <circle cx="50" cy="85" r="4.5" fill="#ffffff" stroke="#e74c3c" stroke-width="2" />
            <circle cx="50" cy="165" r="4.5" fill="#ffffff" stroke="#e74c3c" stroke-width="2" />
            <!-- Penalty Box Left -->
            <path d="M 50 60 H 105 V 190 H 50" stroke="#00e5ff" stroke-opacity="0.6" stroke-width="1.2" />
            <circle cx="88" cy="125" r="2.5" fill="#00e5ff" opacity="0.8" />

            <!-- RIGHT GOAL (BLUE TEAM) -->
            <rect x="530" y="85" width="30" height="80" rx="4" fill="url(#stadium-blue-net)" stroke="#3498db" stroke-opacity="0.7" stroke-width="1.2" />
            <line x1="530" y1="85" x2="530" y2="165" stroke="#ffffff" stroke-dasharray="3 3" stroke-opacity="0.5" stroke-width="2" />
            <!-- Cylindrical Posts -->
            <circle cx="530" cy="85" r="4.5" fill="#ffffff" stroke="#3498db" stroke-width="2" />
            <circle cx="530" cy="165" r="4.5" fill="#ffffff" stroke="#3498db" stroke-width="2" />
            <!-- Penalty Box Right -->
            <path d="M 530 60 H 475 V 190 H 530" stroke="#00e5ff" stroke-opacity="0.6" stroke-width="1.2" />
            <circle cx="492" cy="125" r="2.5" fill="#00e5ff" opacity="0.8" />

            <!-- DYNAMIC TACTICAL SPAWN NODES (Red & Blue) -->
            {#each activeArena.spawnRed as s}
              <g transform="translate({s.x}, {s.y})">
                <circle r="12" fill="#e74c3c" fill-opacity="0.25" stroke="#ff4d4d" stroke-width="1.5" />
                <circle r="8" fill="#e74c3c" />
                <text text-anchor="middle" dy="3.5" fill="#ffffff" font-size="8.5" font-weight="700" font-family="'JetBrains Mono', monospace">{s.label}</text>
              </g>
            {/each}

            {#each activeArena.spawnBlue as s}
              <g transform="translate({s.x}, {s.y})">
                <circle r="12" fill="#3498db" fill-opacity="0.25" stroke="#00e5ff" stroke-width="1.5" />
                <circle r="8" fill="#3498db" />
                <text text-anchor="middle" dy="3.5" fill="#ffffff" font-size="8.5" font-weight="700" font-family="'JetBrains Mono', monospace">{s.label}</text>
              </g>
            {/each}

            <!-- Central Ball Disc with Glow -->
            <g transform="translate(290, 125)">
              <circle r="11" fill="#ffe16d" fill-opacity="0.2" />
              <circle r="6.5" fill="#ffffff" stroke="#e9c400" stroke-width="1.8" />
              <circle r="2" fill="#0e141e" />
            </g>
          </svg>
        </div>

        <!-- Technical Specs Fiche -->
        <div class="technical-specs-panel">
          <div class="specs-header">
            <span class="terminal-icon">⚡</span>
            <span class="specs-title">TELEMETRÍA TÉCNICA DEL MAPA</span>
          </div>

          <ul class="specs-list">
            <li>
              <span class="bullet">•</span>
              <span class="label">Estadio:</span>
              <strong class="highlight">{activeArena.name} by {activeArena.author}</strong>
            </li>
            <li>
              <span class="bullet">•</span>
              <span class="label">Formato Recomendado:</span>
              <span>{activeArena.format}</span>
            </li>
            <li>
              <span class="bullet">•</span>
              <span class="label">Dimensiones del Terreno:</span>
              <span>{activeArena.dimensions}</span>
            </li>
            <li>
              <span class="bullet">•</span>
              <span class="label">Arquitectura de Redes:</span>
              <span>{activeArena.nets}</span>
            </li>
            <li>
              <span class="bullet">•</span>
              <span class="label">Coeficiente de Rebote:</span>
              <span class="rebound-val">{activeArena.bounce}</span>
            </li>
          </ul>
        </div>
      </main>
    </div>

    <!-- BOTTOM MODULE: Full Width CTA Button -->
    <footer class="modal-footer">
      <button
        type="button"
        class="btn-cta-green"
        disabled={gameUI.isMatchActive || (!gameUI.isHost && !gameUI.isAdmin)}
        onclick={handleConfirm}
      >
        <span class="cta-check">✓</span>
        <span>SELECCIONAR ESTADIO</span>
      </button>

      {#if !gameUI.isHost && !gameUI.isAdmin}
        <p class="guest-notice">⚠️ Solo el anfitrión de la sala tiene permisos para cambiar el estadio.</p>
      {/if}
    </footer>

    {#if showConfirmationToast}
      <div class="toast-notification">
        <span>✓</span>
        <span>Estadio {activeArena.name} seleccionado correctamente</span>
      </div>
    {/if}
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

  .stadium-modal-card {
    position: relative;
    width: min(94vw, 920px);
    height: 620px;
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

  .modal-header-ribbon {
    width: 100%;
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

  .stadium-icon-box {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.35);
    color: #00e5ff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.2);
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
    font-size: 18px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .active-badge {
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 5px 10px;
    border-radius: 6px;
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
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .close-x-btn:hover {
    background: rgba(255, 71, 87, 0.2);
    border-color: #ff4757;
    color: #ff4757;
  }

  .subtitle-bar {
    width: 100%;
    background: #080d16;
    padding: 6px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    box-sizing: border-box;
  }

  .subtitle-content {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #94a3b8;
  }

  .info-icon {
    color: #00e5ff;
    font-weight: bold;
  }

  .warning-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #f1c40f;
    background: rgba(241, 196, 15, 0.15);
    border: 1px solid rgba(241, 196, 15, 0.4);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .stadium-content-grid {
    flex: 1;
    display: flex;
    padding: 12px 16px;
    gap: 14px;
    overflow: hidden;
    box-sizing: border-box;
  }

  .stadium-sidebar {
    width: 260px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: rgba(8, 14, 24, 0.8);
    border-radius: 8px;
    padding: 8px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .sidebar-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #94a3b8;
    padding: 4px 6px 8px;
    letter-spacing: 0.05em;
  }

  .arenas-count {
    color: #00e5ff;
    font-weight: 800;
  }

  .stadium-scroll-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .stadium-scroll-list::-webkit-scrollbar {
    width: 4px;
  }

  .stadium-scroll-list::-webkit-scrollbar-thumb {
    background: #00e5ff;
    border-radius: 2px;
  }

  .arena-card {
    position: relative;
    width: 100%;
    min-height: 62px;
    background: #121a29;
    border: 1px solid rgba(0, 229, 255, 0.15);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }

  .arena-card:hover {
    background: #1a2538;
    border-color: rgba(0, 229, 255, 0.35);
  }

  .arena-card.selected {
    background: rgba(0, 229, 255, 0.16);
    border-color: #00e5ff;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.25);
  }

  .accent-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: #00e5ff;
    border-radius: 3px 0 0 3px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .accent-bar.visible {
    opacity: 1;
  }

  .card-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-left: 4px;
  }

  .arena-name {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .arena-subtext {
    font-size: 11px;
    color: #00e5ff;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .arena-author {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #8fa0b5;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .check-box {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #00e5ff;
    font-size: 13px;
    font-weight: 800;
    flex-shrink: 0;
  }

  .check-box.checked {
    background: #00e5ff;
    color: #050811;
    box-shadow: 0 0 8px #00e5ff;
  }

  .stadium-preview-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .tactical-pitch-surface {
    position: relative;
    width: 100%;
    height: 230px;
    min-height: 230px;
    border-radius: 8px;
    border: 1px solid rgba(0, 229, 255, 0.25);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.65);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.25s;
  }

  .pitch-turf-overlay {
    position: absolute;
    inset: 0;
    opacity: 0.12;
    background-image: repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(0, 229, 255, 0.4) 38px, rgba(0, 229, 255, 0.4) 40px);
    pointer-events: none;
  }

  .tactical-pitch-svg {
    width: 100%;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
  }

  .technical-specs-panel {
    flex: 1;
    background: rgba(18, 26, 41, 0.75);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    box-sizing: border-box;
  }

  .specs-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.06em;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  }

  .specs-list {
    margin: 6px 0 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #dde2f1;
  }

  .specs-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bullet {
    color: #00e5ff;
    font-weight: bold;
  }

  .label {
    color: #8fa0b5;
  }

  .highlight {
    color: #00e5ff;
    font-weight: 700;
  }

  .rebound-val {
    color: #ffd700;
    font-weight: 700;
  }

  .modal-footer {
    background: #080e18;
    padding: 12px 18px;
    border-top: 1px solid rgba(0, 229, 255, 0.15);
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-sizing: border-box;
  }

  .btn-cta-green {
    width: 100%;
    height: 44px;
    background: #2ecc71;
    color: #05150c;
    border: none;
    border-radius: 6px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(46, 204, 113, 0.35);
    transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
  }

  .btn-cta-green:hover:not(:disabled) {
    background: #34e27f;
    box-shadow: 0 0 24px rgba(46, 204, 113, 0.6);
  }

  .btn-cta-green:active:not(:disabled) {
    transform: scale(0.99);
  }

  .btn-cta-green:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  .cta-check {
    font-size: 16px;
    font-weight: 900;
  }

  .guest-notice {
    margin: 2px 0 0 0;
    text-align: center;
    font-size: 11px;
    color: #f1c40f;
  }

  .toast-notification {
    position: absolute;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(14, 20, 30, 0.95);
    border: 1px solid #00e5ff;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.45);
    color: #00e5ff;
    padding: 8px 18px;
    border-radius: 20px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 50;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
