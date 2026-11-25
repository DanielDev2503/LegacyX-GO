<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen = false, onClose }: Props = $props();

  let currentStep = $state(0);

  const TOTAL_STEPS = 5;

  function goPrev() {
    if (currentStep > 0) {
      soundFX.playUIClick();
      currentStep--;
    }
  }

  function goNext() {
    soundFX.playUIClick();
    if (currentStep < TOTAL_STEPS - 1) {
      currentStep++;
    } else {
      handleFinish();
    }
  }

  function handleFinish() {
    soundFX.playUIClick();
    currentStep = 0;
    onClose();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="tutorial-backdrop"
    data-testid="tutorial-modal"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-label="Tutorial interactivo de LegacyX-GO"
    onkeydown={(e) => {
      if (e.key === 'Escape') handleFinish();
    }}
  >
    <div class="tutorial-card-shell">
      <header class="tutorial-header">
        <div class="tutorial-title-wrap">
          <span class="tutorial-badge">GUÍA RÁPIDA · {currentStep + 1} / {TOTAL_STEPS}</span>
          <h2 class="tutorial-heading">
            {#if currentStep === 0}
              {gameUI.isMobileLayout ? 'Controles Táctiles y Mando' : 'Movimiento y Control Total'}
            {:else if currentStep === 1}
              Disparo, Potencia y Efecto Magnus
            {:else if currentStep === 2}
              Turbo, Dash y Recuperación
            {:else if currentStep === 3}
              Entrenamiento vs Salas Online
            {:else}
              Alineación, Zonas y Capitanía
            {/if}
          </h2>
        </div>

        <button
          type="button"
          class="tutorial-close-btn"
          data-testid="btn-tutorial-skip"
          onclick={handleFinish}
          aria-label="Cerrar tutorial"
        >
          ✕
        </button>
      </header>

      <div class="tutorial-body">
        {#if currentStep === 0}
          <div class="tutorial-visual-stage" data-testid="tutorial-step-controls">
            {#if gameUI.isMobileLayout}
              <div class="mobile-controls-diagram">
                <div class="diag-pad">
                  <div class="diag-stick-ring">
                    <div class="diag-stick-knob"></div>
                  </div>
                  <span class="diag-caption">Joystick Izquierdo · Moverse</span>
                </div>
                <div class="diag-buttons-cluster">
                  <div class="diag-btn is-kick">Patear</div>
                  <div class="diag-btn is-curve">Curva</div>
                  <div class="diag-btn is-dash">Dash</div>
                  <div class="diag-btn is-turbo">Turbo</div>
                </div>
              </div>
              <p class="tutorial-copy">
                En <strong>móvil</strong> desliza el joystick izquierdo para desplazarte y usa los botones derechos para patear, meter rosca, hacer Dash o activar Turbo. Si conectas un <strong>mando Bluetooth/USB</strong>, los botones táctiles se ocultan automáticamente.
              </p>
            {:else}
              <div class="pc-controls-diagram">
                <div class="keys-cluster">
                  <div class="key-cap row-top">W</div>
                  <div class="keys-bottom-row">
                    <span class="key-cap">A</span>
                    <span class="key-cap">S</span>
                    <span class="key-cap">D</span>
                  </div>
                  <span class="diag-caption">WASD / Flechas o Ratón 360°</span>
                </div>
                <div class="actions-list">
                  <span class="action-pill"><b>Espacio / Click:</b> Patear</span>
                  <span class="action-pill"><b>Q / E:</b> Curva Magnus</span>
                  <span class="action-pill"><b>C:</b> Dash explosivo</span>
                  <span class="action-pill"><b>Shift:</b> Turbo sprint</span>
                </div>
              </div>
              <p class="tutorial-copy">
                Controla a tu jugador con <strong>WASD / Flechas</strong>, cambia a modo <strong>Ratón 360°</strong> o conecta cualquier <strong>Mando / Controlador</strong>. Puedes personalizar cada tecla en <strong>Ajustes &gt; Controles</strong>.
              </p>
            {/if}
          </div>
        {:else if currentStep === 1}
          <div class="tutorial-visual-stage" data-testid="tutorial-step-curve">
            <svg class="pitch-diagram-svg" viewBox="0 0 320 120" aria-hidden="true">
              <rect x="8" y="8" width="304" height="104" rx="10" fill="#0d2336" stroke="#1e3a5f" stroke-width="2" />
              <line x1="160" y1="8" x2="160" y2="112" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" />
              <rect x="292" y="34" width="20" height="52" fill="none" stroke="#38bdf8" stroke-width="2" />
              <circle cx="72" cy="78" r="14" fill="#ef4444" stroke="#ffffff" stroke-width="2" />
              <path d="M 94 74 Q 195 18 292 58" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="6 4" />
              <circle cx="110" cy="68" r="8" fill="#ffffff" stroke="#00e5ff" stroke-width="2" />
            </svg>
            <p class="tutorial-copy">
              Mantén presionado <strong>Curva (Q / E)</strong> antes o durante el contacto para aplicar <strong>efecto Magnus</strong> al balón y rodear porteros y defensas con tiros combeados.
            </p>
          </div>
        {:else if currentStep === 2}
          <div class="tutorial-visual-stage" data-testid="tutorial-step-stamina">
            <div class="stamina-diagram">
              <div class="stamina-bar-track">
                <div class="stamina-bar-fill"></div>
              </div>
              <div class="stamina-stages">
                <div class="stage-box">
                  <strong>TURBO</strong>
                  <span>Sprint continuo consumiendo estamina</span>
                </div>
                <div class="stage-box is-dash">
                  <strong>DASH</strong>
                  <span>Impulso rápido seguido de breve freno post-dash</span>
                </div>
              </div>
            </div>
            <p class="tutorial-copy">
              Administra la barra circular de <strong>estamina</strong> alrededor de tu jugador: usa el <strong>Turbo</strong> para alcanzar balones largos y el <strong>Dash</strong> en duelos decisivos, cuidando el breve freno posterior al impulso.
            </p>
          </div>
        {:else if currentStep === 3}
          <div class="tutorial-visual-stage" data-testid="tutorial-step-modes">
            <div class="compare-grid">
              <div class="compare-box is-practice">
                <h4>MODO ENTRENAMIENTO</h4>
                <ul>
                  <li>Juega al instante sin esperar sala.</li>
                  <li>Añade <strong>Bots inteligentes</strong> en cualquier equipo.</li>
                  <li>Ajusta velocidad, gravedad, Dash y Turbo libremente.</li>
                </ul>
              </div>
              <div class="compare-box is-rooms">
                <h4>SALAS ONLINE</h4>
                <ul>
                  <li>Crea o únete a partidas <strong>Casuales</strong> o <strong>Ranked</strong>.</li>
                  <li>Estadísticas, MVP y rankings ELO oficiales.</li>
                  <li>Host controla reglas, estadio y bots (en Casual).</li>
                </ul>
              </div>
            </div>
            <p class="tutorial-copy">
              Practica mecánicas y tácticas en <strong>Entrenamiento</strong>, o compite con amigos y sube en el ranking dentro de las <strong>Salas Online</strong>.
            </p>
          </div>
        {:else}
          <div class="tutorial-visual-stage" data-testid="tutorial-step-lineup">
            <div class="zones-diagram">
              <span class="z-chip z-gk">GK · Portero</span>
              <span class="z-chip z-dfc">DFC · Defensa</span>
              <span class="z-chip z-mc">MC · Medio</span>
              <span class="z-chip z-st">ST · Delantero</span>
            </div>
            <p class="tutorial-copy">
              Al entrar a un equipo, el primero en la lista asume la <strong>Capitanía</strong> y puede organizar a sus compañeros en las 4 zonas del campo (GK, DFC, MC, ST) para controlar dónde aparece cada uno al sacar.
            </p>
          </div>
        {/if}
      </div>

      <footer class="tutorial-footer">
        <button type="button" class="tut-btn-ghost" onclick={handleFinish}>
          Saltar
        </button>

        <div class="step-dots" aria-hidden="true">
          {#each Array.from({ length: TOTAL_STEPS }, (_, idx) => idx) as idx (idx)}
            <button
              type="button"
              class="step-dot"
              class:active={currentStep === idx}
              onclick={() => {
                soundFX.playUIClick();
                currentStep = idx;
              }}
              aria-label="Paso {idx + 1}"
            ></button>
          {/each}
        </div>

        <div class="tut-nav-group">
          {#if currentStep > 0}
            <button type="button" class="tut-btn-sec" onclick={goPrev}>Anterior</button>
          {/if}
          <button type="button" class="tut-btn-prim" data-testid="btn-tutorial-next" onclick={goNext}>
            {currentStep === TOTAL_STEPS - 1 ? '¡A jugar!' : 'Siguiente'}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .tutorial-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(4, 8, 16, 0.86);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .tutorial-card-shell {
    width: min(620px, 96vw);
    max-height: calc(100dvh - 1.5rem);
    background: #0c1322;
    border: 1px solid rgba(0, 229, 255, 0.42);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.72);
  }

  .tutorial-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1.05rem;
    background: #080e1a;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  }

  .tutorial-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    min-width: 0;
  }

  .tutorial-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.66rem;
    font-weight: 800;
    color: #38bdf8;
    letter-spacing: 0.06em;
  }

  .tutorial-heading {
    margin: 0;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1.05rem;
    font-weight: 800;
    color: #f8fafc;
  }

  .tutorial-close-btn {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: #131c2e;
    color: #cbd5e1;
    cursor: pointer;
    font-weight: 800;
    flex-shrink: 0;
  }

  .tutorial-body {
    padding: 0.95rem 1.05rem;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tutorial-visual-stage {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
  }

  .pc-controls-diagram,
  .mobile-controls-diagram {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
    padding: 0.8rem;
    border-radius: 10px;
    background: #090f1c;
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-sizing: border-box;
  }

  .keys-cluster,
  .diag-pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.28rem;
  }

  .keys-bottom-row {
    display: flex;
    gap: 0.28rem;
  }

  .key-cap {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    background: #17233a;
    border: 1px solid rgba(56, 189, 248, 0.55);
    color: #f8fafc;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 800;
    font-size: 0.8rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .diag-stick-ring {
    width: 58px;
    height: 58px;
    border-radius: 50%;
    border: 2px dashed rgba(56, 189, 248, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .diag-stick-knob {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #00e5ff;
  }

  .diag-buttons-cluster {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.38rem;
    align-items: center;
  }

  .diag-btn {
    padding: 0.42rem 0.5rem;
    border-radius: 999px;
    text-align: center;
    font-size: 0.7rem;
    font-weight: 800;
    color: #fff;
    background: #172540;
    border: 1px solid rgba(56, 189, 248, 0.45);
  }

  .diag-btn.is-kick { border-color: #f59e0b; color: #fbbf24; }
  .diag-btn.is-dash { border-color: #10b981; color: #34d399; }

  .diag-caption {
    font-size: 0.68rem;
    color: #94a3b8;
    font-weight: 700;
    text-align: center;
  }

  .actions-list {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.34rem;
  }

  .action-pill {
    font-size: 0.74rem;
    color: #e2e8f0;
    background: #111b2e;
    padding: 0.28rem 0.5rem;
    border-radius: 7px;
    border: 1px solid rgba(148, 163, 184, 0.16);
  }

  .pitch-diagram-svg {
    width: 100%;
    max-width: 340px;
    height: auto;
  }

  .stamina-diagram {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.8rem;
    border-radius: 10px;
    background: #090f1c;
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-sizing: border-box;
  }

  .stamina-bar-track {
    width: 100%;
    height: 12px;
    border-radius: 999px;
    background: #17233a;
    overflow: hidden;
  }

  .stamina-bar-fill {
    width: 68%;
    height: 100%;
    background: linear-gradient(90deg, #00e5ff, #10b981);
    border-radius: 999px;
  }

  .stamina-stages,
  .compare-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .stage-box,
  .compare-box {
    background: #10192b;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 9px;
    padding: 0.62rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.74rem;
    color: #cbd5e1;
  }

  .stage-box.is-dash { border-color: rgba(16, 185, 129, 0.45); }
  .compare-box.is-practice { border-color: rgba(16, 185, 129, 0.45); }
  .compare-box.is-rooms { border-color: rgba(56, 189, 248, 0.45); }

  .compare-box h4 {
    margin: 0;
    font-size: 0.78rem;
    color: #f8fafc;
    font-weight: 800;
  }

  .compare-box ul {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .zones-diagram {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.4rem;
    padding: 0.85rem 0.6rem;
    border-radius: 10px;
    background: #0d2b1e;
    border: 1.5px solid rgba(16, 185, 129, 0.45);
    box-sizing: border-box;
  }

  .z-chip {
    text-align: center;
    font-size: 0.72rem;
    font-weight: 800;
    padding: 0.45rem 0.25rem;
    border-radius: 8px;
    background: #0b1322;
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #f8fafc;
  }

  .z-gk { border-color: #f59e0b; color: #fbbf24; }
  .z-dfc { border-color: #00e5ff; color: #67e8f9; }
  .z-mc { border-color: #10b981; color: #34d399; }
  .z-st { border-color: #ff4757; color: #ff6b81; }

  .tutorial-copy {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.48;
    color: #cbd5e1;
    text-align: center;
  }

  .tutorial-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.75rem 1.05rem;
    background: #080e1a;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
  }

  .step-dots {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .step-dot {
    width: 8px;
    height: 8px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.35);
    cursor: pointer;
  }

  .step-dot.active {
    width: 20px;
    background: #00e5ff;
  }

  .tut-nav-group {
    display: flex;
    align-items: center;
    gap: 0.42rem;
  }

  .tut-btn-ghost,
  .tut-btn-sec,
  .tut-btn-prim {
    padding: 0.42rem 0.85rem;
    border-radius: 8px;
    font-size: 0.76rem;
    font-weight: 800;
    cursor: pointer;
  }

  .tut-btn-ghost {
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #94a3b8;
  }

  .tut-btn-sec {
    background: #152136;
    border: 1px solid rgba(148, 163, 184, 0.4);
    color: #f8fafc;
  }

  .tut-btn-prim {
    background: #00e5ff;
    border: none;
    color: #06101c;
  }

  @media (max-width: 640px), (max-height: 480px) {
    .tutorial-body { padding: 0.6rem 0.75rem; }
    .zones-diagram { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pc-controls-diagram,
    .mobile-controls-diagram,
    .compare-grid { grid-template-columns: 1fr; }
  }
</style>
