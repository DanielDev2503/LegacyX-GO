<script lang="ts">
  import {
    EngineInstance,
    MatchPhase,
    type GameStateSnapshot,
    type PlayerInput,
    INPUT_FLAG_UP,
    INPUT_FLAG_DOWN,
    INPUT_FLAG_LEFT,
    INPUT_FLAG_RIGHT,
    INPUT_FLAG_KICK,
    INPUT_FLAG_DASH,
    INPUT_FLAG_MAGNUS_LEFT,
    INPUT_FLAG_MAGNUS_RIGHT
  } from '@legacyx/core';

  import { GameRenderer } from './renderer/GameRenderer.js';

  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let fps = $state(60);
  let processedTicks = $state(0);
  let fsmState = $state('KICKOFF');
  let redScore = $state(0);
  let blueScore = $state(0);

  let rendererInstance: GameRenderer | null = null;
  let testEngine: EngineInstance | null = null;

  // Acciones directas de prueba para el HUD
  function handleTestShake(): void {
    rendererInstance?.triggerShake(12, 350);
  }

  function handleTestGoal(team: 'red' | 'blue'): void {
    if (testEngine) {
      testEngine.fsm.registerGoal(team);
    }
  }

  function handleTestPowerShot(): void {
    if (testEngine) {
      testEngine.ball.pos.set(0, 0);
      testEngine.ball.vel.set(22.0, -8.0); // > 950 px/s
      testEngine.ball.spin = -1.5; // Curva Magnus
      testEngine.ball.isCurvingAllowed = true;
    }
  }

  function handleResetKickoff(): void {
    if (testEngine) {
      testEngine.startMatch();
    }
  }

  $effect(() => {
    if (!canvasRef) return;

    // 1. Inicializar motor matemático canónico a 60 Hz
    const engine = new EngineInstance();
    testEngine = engine;

    // Configurar 2 jugadores (1 en Rojo, 1 en Azul)
    engine.addPlayer(1, 'red');
    engine.addPlayer(2, 'blue');
    engine.startMatch();

    // 2. Inicializar GameRenderer
    const renderer = new GameRenderer(canvasRef, {
      stadium: engine.stadium,
      playerInfos: new Map([
        [1, { nickname: 'Host (Red)', number: 10 }],
        [2, { nickname: 'Rival (Blue)', number: 7 }]
      ])
    });
    rendererInstance = renderer;

    const handleResize = () => {
      if (canvasRef) {
        renderer.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // 3. Captura de inputs del teclado
    const keyState = new Map<string, boolean>();
    const onKeyDown = (e: KeyboardEvent) => {
      keyState.set(e.code, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keyState.set(e.code, false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 4. Bucle desacoplado: Física a 60 Hz exactos + Renderizado a la tasa nativa del monitor en rAF
    const FIXED_DT_MS = 1000 / 60;
    let accumulatedTime = 0;
    let lastTimestamp = performance.now();
    let animFrameId: number;

    let prevSnapshot: GameStateSnapshot = engine.getState();
    let currSnapshot: GameStateSnapshot = engine.getState();

    // Cálculo de FPS visuales
    let frameCount = 0;
    let lastFpsCalculation = performance.now();

    function renderLoop(currentTime: number): void {
      const deltaMs = Math.min(100, currentTime - lastTimestamp);
      lastTimestamp = currentTime;
      accumulatedTime += deltaMs;

      // Integración de inputs del jugador local (Player 1)
      let mask = 0;
      if (keyState.get('ArrowUp') || keyState.get('KeyW')) mask |= INPUT_FLAG_UP;
      if (keyState.get('ArrowDown') || keyState.get('KeyS')) mask |= INPUT_FLAG_DOWN;
      if (keyState.get('ArrowLeft') || keyState.get('KeyA')) mask |= INPUT_FLAG_LEFT;
      if (keyState.get('ArrowRight') || keyState.get('KeyD')) mask |= INPUT_FLAG_RIGHT;
      if (keyState.get('Space') || keyState.get('KeyX')) mask |= INPUT_FLAG_KICK;
      if (keyState.get('ShiftLeft') || keyState.get('ShiftRight')) mask |= INPUT_FLAG_DASH;
      if (keyState.get('KeyQ')) mask |= INPUT_FLAG_MAGNUS_LEFT;
      if (keyState.get('KeyE')) mask |= INPUT_FLAG_MAGNUS_RIGHT;

      const inputs = new Map<number, PlayerInput>();
      inputs.set(1, { inputMask: mask });

      // Avance del paso físico en múltiplos exactos de 1/60s (60 Hz deterministas)
      while (accumulatedTime >= FIXED_DT_MS) {
        prevSnapshot = currSnapshot;
        engine.step(inputs);
        currSnapshot = engine.getState();
        accumulatedTime -= FIXED_DT_MS;
      }

      // Factor alpha de interpolación continua: fracción de tiempo transcurrido
      const alpha = Math.max(0, Math.min(1.0, accumulatedTime / FIXED_DT_MS));

      // Renderizado interpolado libre en Canvas 2D
      renderer.render(prevSnapshot, currSnapshot, alpha, 1);

      // Métricas y telemetría de desarrollo
      frameCount++;
      if (currentTime - lastFpsCalculation >= 500) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastFpsCalculation));
        frameCount = 0;
        lastFpsCalculation = currentTime;

        processedTicks = engine.currentTick;
        redScore = engine.fsm.redScore;
        blueScore = engine.fsm.blueScore;

        const phase = engine.fsm.state;
        fsmState = phase === MatchPhase.PLAYING ? 'PLAYING'
          : phase === MatchPhase.KICKOFF ? 'KICKOFF'
          : phase === MatchPhase.GOAL ? 'GOAL'
          : phase === MatchPhase.PAUSE ? 'PAUSE'
          : 'STOPPED';
      }

      animFrameId = requestAnimationFrame(renderLoop);
    }

    animFrameId = requestAnimationFrame(renderLoop);

    // Limpieza al desmontar
    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.destroy();
      rendererInstance = null;
      testEngine = null;
    };
  });
</script>

<main class="game-container">
  <!-- Lienzo principal de renderizado Canvas 2D -->
  <canvas bind:this={canvasRef}></canvas>

  <!-- HUD de desarrollo y telemetría del motor -->
  <aside class="dev-hud">
    <div class="hud-header">
      <span class="hud-title">LEGACYX-GO</span>
      <span class="badge-fps">{fps} FPS</span>
    </div>

    <div class="hud-scoreboard">
      <span class="score-team red">RED {redScore}</span>
      <span class="score-sep">-</span>
      <span class="score-team blue">{blueScore} BLUE</span>
    </div>

    <div class="hud-row">
      <span class="label">Estado FSM:</span>
      <span class="val state-tag">{fsmState}</span>
    </div>

    <div class="hud-row">
      <span class="label">Ticks Físicos:</span>
      <span class="val">{processedTicks} (60 Hz)</span>
    </div>

    <div class="hud-controls-hint">
      WASD / Flechas: Moverse | Espacio: Patear | Shift: Dash | Q/E: Magnus
    </div>

    <div class="hud-buttons">
      <button class="btn btn-shake" onclick={handleTestShake}>Screen Shake</button>
      <button class="btn btn-shot" onclick={handleTestPowerShot}>Tiro Fuego (>950px)</button>
      <button class="btn btn-goal" onclick={() => handleTestGoal('red')}>Gol Rojo</button>
      <button class="btn btn-goal" onclick={() => handleTestGoal('blue')}>Gol Azul</button>
      <button class="btn btn-reset" onclick={handleResetKickoff}>Saque Centro</button>
    </div>
  </aside>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #0b0f19;
    color: #f3f4f6;
    overflow: hidden;
    user-select: none;
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .game-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background-color: #090d16;
  }

  /* HUD de desarrollo */
  .dev-hud {
    position: absolute;
    top: 14px;
    left: 14px;
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 14px 18px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    min-width: 280px;
    max-width: 340px;
    font-size: 0.85rem;
    pointer-events: auto;
    z-index: 10;
  }

  .hud-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .hud-title {
    font-weight: 700;
    font-size: 0.95rem;
    letter-spacing: 0.05em;
    color: #38bdf8;
  }

  .badge-fps {
    background: #0284c7;
    color: #ffffff;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: 'JetBrains Mono', 'Consolas', monospace;
  }

  .hud-scoreboard {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    margin-bottom: 8px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 6px;
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-weight: 700;
  }

  .score-team.red {
    color: #ef4444;
  }

  .score-team.blue {
    color: #38bdf8;
  }

  .score-sep {
    color: #94a3b8;
  }

  .hud-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    font-size: 0.8rem;
  }

  .hud-row .label {
    color: #94a3b8;
  }

  .hud-row .val {
    color: #f1f5f9;
    font-family: 'JetBrains Mono', 'Consolas', monospace;
  }

  .state-tag {
    color: #34d399 !important;
    font-weight: 600;
  }

  .hud-controls-hint {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.72rem;
    color: #94a3b8;
    line-height: 1.3;
  }

  .hud-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 10px;
  }

  .btn {
    border: none;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-shake {
    background: #475569;
    color: #f8fafc;
  }
  .btn-shake:hover {
    background: #64748b;
  }

  .btn-shot {
    background: #ea580c;
    color: #fff;
  }
  .btn-shot:hover {
    background: #f97316;
  }

  .btn-goal {
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .btn-goal:hover {
    background: #334155;
  }

  .btn-reset {
    grid-column: span 2;
    background: #0284c7;
    color: #fff;
  }
  .btn-reset:hover {
    background: #0369a1;
  }
</style>
