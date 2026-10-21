<script lang="ts">
  import { untrack } from 'svelte';
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
    INPUT_FLAG_TURBO,
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
  import GlobalTooltip from './ui/components/GlobalTooltip.svelte';

  let canvasRef = $state<HTMLCanvasElement | null>(null);

  let rendererInstance: GameRenderer | null = null;
  let testEngine: EngineInstance | null = null;

  function applyModifiersToEngine(modifiers: PhysicsModifiers): void {
    if (!testEngine) return;
    testEngine.applyModifiers(modifiers);
  }

  $effect(() => {
    if (gameUI.currentScreen !== 'IN_GAME' || !canvasRef) return;
    // untrack: el montaje del motor solo depende de pantalla y canvas. Sin esto, cualquier
    // cambio en activeModal/stadium re-ejecutaba el efecto y reabría el menú (bug overlays #).
    return untrack(() => mountGame(canvasRef!));
  });

  function mountGame(canvasEl: HTMLCanvasElement): () => void {
    // 1. Inicializar motor matemático canónico a 60 Hz
    const engine = new EngineInstance(gameUI.selectedStadiumId || 'mediano');
    testEngine = engine;

    // Configurar jugador local exclusivamente (sin bots/rivales simulados)
    const localTeam = gameUI.myTeam === 'blue' ? 'blue' : 'red';
    engine.addPlayer(1, localTeam);
    engine.resetPositions();

    // Inicializar siempre en 0: STOP con el menú de sala abierto
    gameUI.fsmPhase = 'STOPPED';
    gameUI.matchPhase = 0;
    gameUI.clearModalStack();
    gameUI.openOverlay('TEAM_MANAGEMENT');

    // Conectar callbacks de estado UI
    gameUI.onModifiersChanged = (mods) => {
      applyModifiersToEngine(mods);
    };

    gameUI.onStartMatch = () => {
      engine.startMatch();
      soundFX.playWhistle();
      gameUI.clearModalStack();
    };

    gameUI.onStopMatch = () => {
      engine.stopMatch();
      soundFX.playWhistle();
      gameUI.clearModalStack();
      gameUI.openOverlay('TEAM_MANAGEMENT');
    };

    gameUI.onTogglePause = () => {
      engine.togglePause();
    };

    gameUI.onStartPracticeMode = () => {
      engine.resetPositions();
      gameUI.fsmPhase = 'STOPPED';
      gameUI.matchPhase = 0;
      gameUI.enforceStopMenu();
    };

    gameUI.onTeamChanged = (playerId: number, team: 'red' | 'blue' | 'spectator') => {
      engine.setPlayerTeam(playerId, team);
      engine.resetPositions();
    };

    gameUI.onPlayerEmote = (playerId: number, emoji: string) => {
      const visual = renderer.playerInfos.get(playerId);
      if (visual) {
        visual.activeEmote = { emoji, timer: 120 };
      }
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
    const renderer = new GameRenderer(canvasEl, {
      stadium: engine.stadium,
      playerInfos: new Map([
        [
          1,
          {
            nickname: gameUI.nickname || 'Jugador',
            number: 10,
            avatar: gameUI.avatarValue || '1',
            avatarType: gameUI.avatarMode,
            hasOutline: gameUI.settings.localKit?.outlineColor !== 'none' && gameUI.settings.localKit?.outlineColor !== '',
            tertiaryColor: gameUI.settings.localKit?.tertiaryColor || '#ffffff',
            kit: gameUI.settings.localKit
          }
        ]
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
    let dashTriggered = false;

    const onKeyDown = (e: KeyboardEvent) => {
      // Activar contexto de audio con la primera interacción del usuario
      soundFX.ensureContext();

      // Atajo canónico para Modificadores [#] o cerrar modales [Escape]
      // Escape: los overlays `#` gestionan su propio cierre (svelte:window + preventDefault);
      // aquí solo se conmuta el menú de sala (bloqueado abierto en 0: STOP).
      if (e.code === 'Escape') {
        if (e.defaultPrevented || gameUI.isSecondaryOverlayOpen) return;
        if (gameUI.currentScreen === 'IN_GAME') {
          gameUI.toggleRoomMenu();
        } else if (gameUI.activeModal !== 'NONE') {
          gameUI.closeOverlay();
        }
        e.preventDefault();
        return;
      }

      // No capturar controles de movimiento si el usuario está escribiendo en un input
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isTyping) {
        return;
      }

      // Atajo canónico para Modificadores [#]
      if (e.key === '#') {
        if (gameUI.activeModal === 'PHYSICS_MODIFIERS' || gameUI.activeModal === 'MODIFIERS') {
          gameUI.closeOverlay();
        } else {
          gameUI.openOverlay('PHYSICS_MODIFIERS');
        }
        e.preventDefault();
        return;
      }

      if (e.code === 'ArrowUp' && !e.repeat) {
        dashTriggered = true;
      }

      keyState.set(e.code, true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp') {
        dashTriggered = false;
      }
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

      // Inputs canónicos del jugador local (Player 1)
      let mask = 0;
      const isInputActive = gameUI.currentScreen === 'IN_GAME' && gameUI.activeModal === 'NONE';
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (isInputActive && !isTyping) {
        // Movimiento: WASD
        if (keyState.get('KeyW')) mask |= INPUT_FLAG_UP;
        if (keyState.get('KeyS')) mask |= INPUT_FLAG_DOWN;
        if (keyState.get('KeyA')) mask |= INPUT_FLAG_LEFT;
        if (keyState.get('KeyD')) mask |= INPUT_FLAG_RIGHT;

        // Patear / Chutar: Space / KeyX
        if (keyState.get('Space') || keyState.get('KeyX')) mask |= INPUT_FLAG_KICK;

        // Turbo / Sprint: ShiftLeft / ShiftRight
        if (keyState.get('ShiftLeft') || keyState.get('ShiftRight')) mask |= INPUT_FLAG_TURBO;

        // Dash: ArrowUp (flanco ascendente / edge-trigger)
        if (dashTriggered) {
          mask |= INPUT_FLAG_DASH;
          dashTriggered = false;
        }

        // Curva Magnus: ArrowLeft / ArrowRight (y KeyQ/KeyZ / KeyE/KeyC)
        if (keyState.get('ArrowLeft') || keyState.get('KeyQ') || keyState.get('KeyZ')) mask |= INPUT_FLAG_MAGNUS_LEFT;
        if (keyState.get('ArrowRight') || keyState.get('KeyE') || keyState.get('KeyC')) mask |= INPUT_FLAG_MAGNUS_RIGHT;
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

      // Sincronizar cámara, zoom y proyección 2D
      renderer.camera.setZoom(gameUI.settings.cameraZoom || 1.0);
      renderer.scale = renderer.camera.zoom;

      // Sincronizar ajustes reactivos del minimapa y chat en el renderer
      const sz = gameUI.settings.minimapSize;
      const minimapPxWidth =
        sz === 'small' || sz === 160 ? 160 : sz === 'large' || sz === 280 || sz === 240 ? 280 : 220;
      renderer.minimapEnabled = gameUI.settings.minimapEnabled !== false;
      renderer.minimapOpacity = (gameUI.settings.minimapOpacity ?? 60) / 100;
      renderer.minimapSize = minimapPxWidth;
      renderer.minimapCameraFrustum = gameUI.settings.minimapCameraFrustum;
      renderer.chatHeight = gameUI.chatHeight;
      renderer.screenShakeEnabled = gameUI.settings.screenShakeEnabled !== false;

      // Sincronizar equipaciones, balón y VFX en tiempo real
      renderer.discRenderer.redKit = gameUI.settings.localKit;
      renderer.discRenderer.blueKit = gameUI.settings.visitorKit;
      renderer.discRenderer.ballSkin = gameUI.settings.ballSkin as any;
      renderer.discRenderer.ballMode = gameUI.settings.ballMode;
      renderer.discRenderer.ballCustomColor = gameUI.settings.ballCustomColor;
      renderer.discRenderer.playerGlowEnabled = gameUI.settings.playerGlowEnabled !== false;
      renderer.discRenderer.ballTrailEnabled = gameUI.settings.ballTrailEnabled !== false;

      renderer.vfx.magnusTrailEnabled = gameUI.settings.magnusTrailEnabled !== false;
      renderer.vfx.fireTrailEnabled = gameUI.settings.fireShotEnabled !== false;
      renderer.vfx.floatingPointsEnabled = gameUI.settings.floatingPointsEnabled !== false;

      // Sincronizar telemetría visual del jugador local
      const localVisual = renderer.playerInfos.get(1);
      if (localVisual) {
        localVisual.nickname = gameUI.nickname || 'Jugador';
        localVisual.avatar = gameUI.avatarValue || '1';
        localVisual.avatarType = gameUI.avatarMode;
        localVisual.hasOutline = gameUI.settings.localKit?.outlineColor !== 'none' && gameUI.settings.localKit?.outlineColor !== '';
        localVisual.tertiaryColor = gameUI.settings.localKit?.tertiaryColor || '#ffffff';
        localVisual.kit = gameUI.settings.localKit;
      }

      renderer.render(prevSnapshot, currSnapshot, alpha, 1);

      // Actualizar telemetría reactiva en UI
      frameCount++;
      if (currentTime - lastFpsCalculation >= 500) {
        gameUI.fps = Math.round((frameCount * 1000) / (currentTime - lastFpsCalculation));
        frameCount = 0;
        lastFpsCalculation = currentTime;

        gameUI.redScore = engine.fsm.redScore;
        gameUI.blueScore = engine.fsm.blueScore;

        if (typeof (engine.fsm as any).getPossessionPercentages === 'function') {
          const possession = (engine.fsm as any).getPossessionPercentages();
          if (possession) {
            gameUI.redPossession = possession.red;
            gameUI.bluePossession = possession.blue;
          }
        }

        const totalSec = Math.floor(engine.currentTick / 60);
        const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const secs = (totalSec % 60).toString().padStart(2, '0');
        gameUI.matchTimeFormatted = `${mins}:${secs}`;

        const phase = engine.fsm.state;
        if (phase === MatchPhase.STATS) {
          if (gameUI.fsmPhase !== 'STATS') {
            // Transición a 5: STATS → contenedor central unificado en vista de estadísticas
            gameUI.hasCompletedMatch = true;
            if (!gameUI.isSecondaryOverlayOpen) {
              gameUI.clearModalStack();
              gameUI.activeModal = 'STATS';
            }
          }
          gameUI.fsmPhase = 'STATS';
          gameUI.matchPhase = 5;
        } else if (gameUI.fsmPhase !== 'STATS') {
          if (phase === MatchPhase.PLAYING) {
            gameUI.fsmPhase = 'PLAYING';
            gameUI.matchPhase = 2;
          } else if (phase === MatchPhase.KICKOFF) {
            gameUI.fsmPhase = 'KICKOFF';
            gameUI.matchPhase = 1;
          } else if (phase === MatchPhase.GOAL) {
            gameUI.fsmPhase = 'GOAL';
            gameUI.matchPhase = 3;
          } else if (phase === MatchPhase.PAUSE) {
            gameUI.fsmPhase = 'PAUSED';
            gameUI.matchPhase = 2.1;
          } else if (phase === MatchPhase.STOP) {
            gameUI.fsmPhase = 'STOPPED';
            gameUI.matchPhase = 0;
          }
        }
        gameUI.enforceStopMenu();
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
  }
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
    {#if gameUI.activeModal === 'PHYSICS_MODIFIERS' || gameUI.activeModal === 'physics' || gameUI.activeModal === 'MODIFIERS'}
      <PhysicsModal />
    {:else if gameUI.activeModal === 'TEAM_MANAGEMENT' || gameUI.activeModal === 'teamSelect' || gameUI.activeModal === 'TEAM_SELECT' || gameUI.activeModal === 'STATS' || gameUI.activeModal === 'stats'}
      <TeamSelectModal />
    {:else if gameUI.activeModal === 'STADIUM_SELECTOR' || gameUI.activeModal === 'stadiumSelect' || gameUI.activeModal === 'STADIUM_SELECT'}
      <StadiumSelectModal />
    {:else if gameUI.activeModal === 'SETTINGS' || gameUI.activeModal === 'settings'}
      <SettingsModal />
    {:else if gameUI.activeModal === 'KEYBINDS' || gameUI.activeModal === 'keybinds'}
      <KeybindModal />
    {/if}

    <!-- Tooltip Global Singleton (Portal) -->
    <GlobalTooltip />
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
