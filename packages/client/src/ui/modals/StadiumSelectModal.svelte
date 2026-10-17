<script lang="ts">
  import { gameUI, type StadiumPresetKey } from '../state/gameUI.svelte';

  let {
    onSelectStadium = (_id: StadiumPresetKey) => {}
  }: {
    onSelectStadium?: (id: StadiumPresetKey) => void;
  } = $props();

  interface StadiumOption {
    id: StadiumPresetKey;
    title: string;
    format: string;
    dimensions: string;
    goalWidth: number;
    runOff: number;
    description: string;
  }

  const STADIUM_OPTIONS: StadiumOption[] = [
    {
      id: 'AF 3v3 Official',
      title: 'AF 3v3 Official by Vitão ®',
      format: '3v3 Competitivo Oficial',
      dimensions: '1200 × 540 px',
      goalWidth: 170,
      runOff: 110,
      description: 'Mapa competitivo oficial con balón naranja de restitución calibrada (0.412) y zona perimetral amplia.'
    },
    {
      id: 'Small',
      title: 'Pequeño (1v1 / 2v2)',
      format: '1v1 / 2v2 Rápido',
      dimensions: '1000 × 460 px',
      goalWidth: 140,
      runOff: 45,
      description: 'Cancha compacta ideal para duelos intensos 1v1 y 2v2 con transiciones rápidas.'
    },
    {
      id: 'Medium',
      title: 'Mediano (3v3 Estándar)',
      format: '3v3 Equilibrado',
      dimensions: '1200 × 540 px',
      goalWidth: 170,
      runOff: 45,
      description: 'Dimensiones estándar balanceadas para juego asociativo de pases y paredes.'
    },
    {
      id: 'Classic',
      title: 'Clásico (3v3 Tradicional)',
      format: '3v3 Clásico',
      dimensions: '1200 × 540 px',
      goalWidth: 170,
      runOff: 45,
      description: 'Proporciones clásicas de salón con rebote neutro y arcos de caja elástica.'
    },
    {
      id: 'Big',
      title: 'Grande (4v4 Competitivo)',
      format: '4v4 / 5v5 Abierto',
      dimensions: '1600 × 720 px',
      goalWidth: 200,
      runOff: 45,
      description: 'Gran superficie táctica para partidos 4v4 con espacio para sprints largos y efecto Magnus.'
    }
  ];

  let previewId = $state<StadiumPresetKey>(gameUI.selectedStadium);
  let activeOption = $derived(
    STADIUM_OPTIONS.find((s) => s.id === previewId) ?? STADIUM_OPTIONS[0]!
  );

  function confirmSelection() {
    if (gameUI.isMatchActive) return;
    if (gameUI.selectStadium(previewId)) {
      onSelectStadium(previewId);
      gameUI.openModal('teamSelect');
    }
  }
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true">
  <div class="stadium-modal-card">
    <header class="modal-header">
      <div>
        <span class="kicker">SELECTOR DE CANCHA</span>
        <h2>Seleccionar Estadio</h2>
      </div>
      <button class="back-btn modal-nav-back-btn" onclick={() => gameUI.openModal('teamSelect')}>
        ← Volver
      </button>
    </header>

    {#if gameUI.isMatchActive}
      <div class="locked-banner">
        ⚠️ No se puede cambiar el estadio con un partido en curso. Detén el partido primero.
      </div>
    {/if}

    <div class="stadium-layout">
      <div class="stadium-list">
        {#each STADIUM_OPTIONS as item (item.id)}
          <button
            class="stadium-option-btn"
            class:active-stadium={previewId === item.id}
            onclick={() => (previewId = item.id)}
          >
            <div class="opt-top">
              <strong>{item.title}</strong>
              <span class="badge-dim">{item.dimensions}</span>
            </div>
            <span class="opt-format">{item.format}</span>
          </button>
        {/each}
      </div>

      <div class="stadium-preview-panel">
        <div class="pitch-diagram">
          <div class="pitch-outer">
            <div class="goal-box left"></div>
            <div class="pitch-inner">
              <div class="half-line"></div>
              <div class="center-circle"></div>
            </div>
            <div class="goal-box right"></div>
          </div>
        </div>

        <div class="preview-details">
          <h3>{activeOption.title}</h3>
          <p>{activeOption.description}</p>
          <div class="specs-grid">
            <div class="spec-chip">
              <span>Dimensiones</span>
              <strong>{activeOption.dimensions}</strong>
            </div>
            <div class="spec-chip">
              <span>Arco</span>
              <strong>{activeOption.goalWidth} px</strong>
            </div>
            <div class="spec-chip">
              <span>Run-Off</span>
              <strong>{activeOption.runOff} px</strong>
            </div>
          </div>
        </div>

        <button
          class="btn-cta-green"
          disabled={gameUI.isMatchActive || (!gameUI.isAdmin && !gameUI.isHost)}
          onclick={confirmSelection}
        >
          ✓ Seleccionar Estadio
        </button>
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
    z-index: 130;
    padding: 1rem;
  }

  .stadium-modal-card {
    width: min(820px, 95vw);
    background: rgba(10, 16, 26, 0.98);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 18px;
    padding: 1.5rem;
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
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    padding-bottom: 0.75rem;
  }

  .kicker {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: #00e5ff;
  }

  h2 {
    margin: 0.15rem 0 0;
    font-size: 1.35rem;
  }

  .back-btn {
    background: rgba(30, 41, 59, 0.85);
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }

  .locked-banner {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: #fcd34d;
    padding: 0.6rem 0.9rem;
    border-radius: 10px;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .stadium-layout {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 1.2rem;
  }

  .stadium-list {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .stadium-option-btn {
    text-align: left;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 10px;
    padding: 0.75rem 0.9rem;
    color: #e2e8f0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stadium-option-btn.active-stadium {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
  }

  .opt-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.86rem;
  }

  .badge-dim {
    font-size: 0.7rem;
    color: #38bdf8;
    font-family: monospace;
  }

  .opt-format {
    font-size: 0.74rem;
    color: #94a3b8;
  }

  .stadium-preview-panel {
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .pitch-diagram {
    height: 150px;
    background: #070f1e;
    border-radius: 10px;
    border: 1px solid rgba(0, 229, 255, 0.22);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem;
  }

  .pitch-outer {
    display: flex;
    align-items: center;
    width: 85%;
    height: 82%;
  }

  .pitch-inner {
    flex: 1;
    height: 100%;
    border: 2px solid rgba(0, 229, 255, 0.65);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .half-line {
    width: 2px;
    height: 100%;
    background: rgba(0, 229, 255, 0.45);
  }

  .center-circle {
    position: absolute;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 2px solid rgba(0, 229, 255, 0.45);
  }

  .goal-box {
    width: 14px;
    height: 44%;
    border: 2px solid rgba(255, 255, 255, 0.65);
  }

  .goal-box.left {
    border-right: none;
    border-color: #ff0055;
  }

  .goal-box.right {
    border-left: none;
    border-color: #00e5ff;
  }

  .preview-details h3 {
    margin: 0 0 0.3rem;
    font-size: 1.02rem;
  }

  .preview-details p {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    color: #94a3b8;
    line-height: 1.4;
  }

  .specs-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .spec-chip {
    background: rgba(2, 6, 23, 0.6);
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .spec-chip span {
    font-size: 0.68rem;
    color: #64748b;
  }

  .spec-chip strong {
    font-size: 0.8rem;
    color: #e2e8f0;
  }

  .btn-cta-green {
    padding: 0.75rem;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #10b981, #059669);
    color: #042f2e;
    font-weight: 800;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-cta-green:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
