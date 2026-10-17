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
  import { gameUI, type PhysicsModifiers } from './ui/state/gameUI.svelte.js';
  import { soundFX } from './audio/SoundFX.js';

  import Gatekeeper from './ui/screens/Gatekeeper.svelte';
  import Lobby from './ui/screens/Lobby.svelte';
  import RoomCreator from './ui/screens/RoomCreator.svelte';
  import InGameHUD from './ui/hud/InGameHUD.svelte';
  import PhysicsModal from './ui/modals/PhysicsModal.svelte';
  import TeamSelectModal from './ui/modals/TeamSelectModal.svelte';
  import StadiumSelectModal from './ui/modals/StadiumSelectModal.svelte';
  import SettingsModal from './ui/modals/SettingsModal.svelte';
  import KeybindModal from './ui/modals/KeybindModal.svelte';
  import PostMatchCarousel from './ui/hud/PostMatchCarousel.svelte';

  let canvasRef = $state<HTMLCanvasElement | null>(null);

  let rendererInstance: GameRenderer | null = null;
  let testEngine: EngineInstance | null = null;

  function applyModifiersToEngine(modifiers: PhysicsModifiers): void {
    if (!testEngine) return;
    testEngine.ball.radius = modifiers.ballRadius;
    testEngine.ball.mass = modifiers.ballMass;
    testEngine.ball.damping = modifiers.pitchFriction;
    testEngine.world.magnusCoefficient = modifiers.magnusCoefficient;
    testEngine.modifiers = { ...testEngine.modifiers, ...modifiers };
    for (const player of testEngine.players.values()) {
      player.radius = modifiers.playerRadius;
      player.mass = modifiers.playerMass;
    }
  }

  $effect(() => {
    if (gameUI.currentScreen !== 'IN_GAME' || !canvasRef) return;

    // 1. Inicializar motor matemático canónico a 60 Hz
    const engine = new EngineInstance();
    testEngine = engine;

    // Configurar jugadores (1 en Rojo, 1 en Azul)
    engine.addPlayer(1, 'red');
    engine.addPlayer(2, 'blue');
    engine.startMatch();

    // Conectar callbacks de estado UI
    gameUI.onModifiersChanged = (mods) => {
      applyModifiersToEngine(mods);
    };

    gameUI.onStartPracticeMode = () => {
      engine.ball.pos.set(0, 0);
      engine.ball.vel.set(0, 0);
      engine.startMatch();
      soundFX.playWhistle();
    };

    // Conectar eventos del motor al sintetizador procedural Web Audio API
    engine.on('goal', () => {
      soundFX.playGoalHorn();
      soundFX.playWhistle();
      rendererInstance?.triggerShake(14, 450);
    });

    engine.on('post_hit', () => {
      soundFX.playPostHit();
      rendererInstance?.triggerShake(6, 200);
    });

    engine.on('kick', (payload: any) => {
      soundFX.playKick(payload?.strength ?? 1.0);
    });

    engine.on('state_change', ({ newState }: { newState: MatchPhase }) => {
      if (newState === MatchPhase.KICKOFF) {
        soundFX.playWhistle();
      }
    });

    // 2. Inicializar GameRenderer desacoplado
    const renderer = new GameRenderer(canvasRef, {
      stadium: engine.stadium,
      playerInfos: new Map([
        [1, { nickname: gameUI.nickname || 'Host (Red)', number: 10 }],
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

    // 3. Captura y enrutamiento de inputs
    const keyState = new Map<string, boolean>();

    const onKeyDown = (e: KeyboardEvent) => {
      // Activar contexto de audio con la primera interacción del usuario
      soundFX.ensureContext();

      // Atajo canónico para Modificadores [#] o cerrar modales [Escape]
      if (e.code === 'Escape') {
        if (gameUI.activeModal !== 'NONE') {
          gameUI.closeModal();
          e.preventDefault();
          return;
        } else if (gameUI.currentScreen === 'IN_GAME') {
          gameUI.openModal('TEAM_MANAGEMENT');
          e.preventDefault();
          return;
        }
      }

      // No capturar controles de movimiento si el usuario está escribiendo en un input
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      keyState.set(e.code, true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keyState.set(e.code, false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 4. Bucle desacoplado: Física a 60 Hz exactos + Render en requestAnimationFrame
    const FIXED_DT_MS = 1000 / 60;
    let accumulatedTime = 0;
    let lastTimestamp = performance.now();
    let animFrameId: number;

    let prevSnapshot: GameStateSnapshot = engine.getState();
    let currSnapshot: GameStateSnapshot = engine.getState();

    let frameCount = 0;
    let lastFpsCalculation = performance.now();

    function renderLoop(currentTime: number): void {
      const deltaMs = Math.min(100, currentTime - lastTimestamp);
      lastTimestamp = currentTime;
      accumulatedTime += deltaMs;

      // Inputs del jugador local (Player 1)
      let mask = 0;
      const isInputActive = gameUI.currentScreen === 'IN_GAME' && gameUI.activeModal === 'NONE';
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (isInputActive && !isTyping) {
        if (keyState.get('ArrowUp') || keyState.get('KeyW')) mask |= INPUT_FLAG_UP;
        if (keyState.get('ArrowDown') || keyState.get('KeyS')) mask |= INPUT_FLAG_DOWN;
        if (keyState.get('ArrowLeft') || keyState.get('KeyA')) mask |= INPUT_FLAG_LEFT;
        if (keyState.get('ArrowRight') || keyState.get('KeyD')) mask |= INPUT_FLAG_RIGHT;
        if (keyState.get('Space') || keyState.get('KeyX')) mask |= INPUT_FLAG_KICK;
        if (keyState.get('ShiftLeft') || keyState.get('ShiftRight')) mask |= INPUT_FLAG_DASH;
        if (keyState.get('KeyQ') || keyState.get('KeyZ')) mask |= INPUT_FLAG_MAGNUS_LEFT;
        if (keyState.get('KeyE') || keyState.get('KeyC')) mask |= INPUT_FLAG_MAGNUS_RIGHT;
      }

      const inputs = new Map<number, PlayerInput>();
      inputs.set(1, { inputMask: mask });

      // Simulación física a 60 Hz deterministas
      while (accumulatedTime >= FIXED_DT_MS) {
        prevSnapshot = currSnapshot;
        engine.step(inputs);
        currSnapshot = engine.getState();
        accumulatedTime -= FIXED_DT_MS;
      }

      // Interpolación lineal libre en Canvas 2D
      const alpha = Math.max(0, Math.min(1.0, accumulatedTime / FIXED_DT_MS));
      renderer.render(prevSnapshot, currSnapshot, alpha, 1);

      // Actualizar telemetría reactiva en UI
      frameCount++;
      if (currentTime - lastFpsCalculation >= 500) {
        gameUI.fps = Math.round((frameCount * 1000) / (currentTime - lastFpsCalculation));
        frameCount = 0;
        lastFpsCalculation = currentTime;

        gameUI.redScore = engine.fsm.redScore;
        gameUI.blueScore = engine.fsm.blueScore;

        const totalSec = Math.floor(engine.currentTick / 60);
        const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const secs = (totalSec % 60).toString().padStart(2, '0');
        gameUI.matchTimeFormatted = `${mins}:${secs}`;

        const phase = engine.fsm.state;
        if (gameUI.fsmPhase !== 'STATS') {
          gameUI.fsmPhase = phase === MatchPhase.PLAYING ? 'PLAYING'
            : phase === MatchPhase.KICKOFF ? 'KICKOFF'
            : phase === MatchPhase.GOAL ? 'GOAL'
            : phase === MatchPhase.STATS ? 'STATS'
            : 'WARMUP';
        }
      }

      animFrameId = requestAnimationFrame(renderLoop);
    }

    animFrameId = requestAnimationFrame(renderLoop);

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

<main class="app-root">
  <!-- Capa 3: Canvas 2D en z-index 0 con GameRenderer desacoplado (solo montado en partida) -->
  {#if gameUI.currentScreen === 'IN_GAME'}
    <div class="canvas-layer">
      <canvas bind:this={canvasRef}></canvas>
    </div>
  {/if}

  <!-- Capa 1: Interfaz reactiva superpuesta en z-index 10 -->
  <div class="ui-layer">
    <!-- Pantallas principales -->
    {#if gameUI.currentScreen === 'GATEKEEPER'}
      <Gatekeeper />
    {:else if gameUI.currentScreen === 'LOBBY'}
      <Lobby />
    {:else if gameUI.currentScreen === 'ROOM_CREATOR'}
      <RoomCreator />
    {:else if gameUI.currentScreen === 'IN_GAME'}
      <InGameHUD />
    {/if}

    <!-- Modales canónicos -->
    {#if gameUI.activeModal === 'PHYSICS_MODIFIERS' || gameUI.activeModal === 'physics'}
      <PhysicsModal />
    {:else if gameUI.activeModal === 'TEAM_MANAGEMENT' || gameUI.activeModal === 'teamSelect'}
      <TeamSelectModal />
    {:else if gameUI.activeModal === 'STADIUM_SELECTOR' || gameUI.activeModal === 'stadiumSelect'}
      <StadiumSelectModal />
    {:else if gameUI.activeModal === 'SETTINGS' || gameUI.activeModal === 'settings'}
      <SettingsModal />
    {:else if gameUI.activeModal === 'KEYBINDS' || gameUI.activeModal === 'keybinds'}
      <KeybindModal />
    {/if}

    <!-- Carrusel panorámico post-partido (100vw) -->
    {#if gameUI.currentScreen === 'IN_GAME' && (gameUI.fsmPhase === 'STATS' || gameUI.showPostMatchCarousel)}
      <PostMatchCarousel />
    {/if}
  </div>
</main>

<style>
  .app-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    background-color: #050811;
    color: #dde2f1;
    overflow: hidden;
    user-select: none;
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .canvas-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background-color: #050811;
  }

  .ui-layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
  }
</style>
