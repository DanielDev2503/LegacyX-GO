<script lang="ts">
  import { untrack } from 'svelte';
  import {
    EngineInstance,
    MatchPhase,
    createStadium,
    BinaryProtocol,
    type CompactDiscState,
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
    INPUT_FLAG_MAGNUS_RIGHT,
    lerp
  } from '@legacyx/core';

  import { GameRenderer, triggerPitchEmote } from './renderer/GameRenderer.js';
  import type { PlayerVisualInfo } from './renderer/DiscRenderer.js';
  import { gameUI, type PhysicsModifiers, type MatchBannerPayload } from './ui/state/gameUI.svelte.js';
  import { soundFX } from './audio/SoundFX.js';
  import { gameApp } from './net/GameApp.js';
  import { SimulationTicker } from './net/SimulationTicker.js';
  import { ClientPredictionReconciler } from './net/ClientPrediction.js';

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
    if (rendererInstance) {
      rendererInstance.discRenderer.ballRadius = modifiers.ballRadius ?? gameUI.gameplayConfig.ballRadius ?? 5.8;
      rendererInstance.discRenderer.playerRadius = modifiers.playerRadius ?? gameUI.gameplayConfig.playerRadius ?? 15.0;
    }
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
    const isHostInitial = gameUI.isHost;
    let engine: EngineInstance | null = null;
    let predEngine: EngineInstance | null = null;
    const reconciler = new ClientPredictionReconciler();
    let predStadiumId = gameUI.selectedStadiumId || 'mediano';
    let prevPredLocalPos = { x: 0, y: 0 };
    let currPredLocalPos = { x: 0, y: 0 };
    let hasPredLocalPos = false;
    let frozenMatchSnapshot: any = null;
    let goBannerTimer: ReturnType<typeof setTimeout> | null = null;

    if (isHostInitial) {
      engine = new EngineInstance(gameUI.selectedStadiumId || 'mediano');
      testEngine = engine;
      engine.applyModifiers(gameUI.physicsModifiers);
      engine.resetPositions();
      soundFX.startHostKeepAlive();
    } else {
      predEngine = new EngineInstance(predStadiumId);
      predEngine.applyModifiers(gameUI.physicsModifiers);
    }

    // Inicializar siempre en 0: STOP con el menú de sala abierto
    gameUI.fsmPhase = 'STOPPED';
    gameUI.matchPhase = 0;
    gameUI.previousMatchPhase = 0;
    gameUI.applyMatchBanner({ kind: 'NONE' });
    if (isHostInitial) {
      gameUI.hasJoinedInitialSync = true;
    }
    gameUI.clearModalStack();
    gameUI.openOverlay('TEAM_MANAGEMENT');

    // Sincronizar jugadores del engine con el roster reactivo
    function syncEnginePlayers() {
      if (!engine) return;
      const activeIds = new Set<number>();
      for (const p of gameUI.rosterPlayers) {
        if (p.team === 'red' || p.team === 'blue') {
          activeIds.add(p.id);
          const currentTeam = engine.playerTeams.get(p.id);
          if (currentTeam !== p.team) {
            engine.setPlayerTeam(p.id, p.team);
          }
          engine.playerNames.set(p.id, p.nickname || p.name || `Player ${p.id}`);
        } else {
          if (engine.players.has(p.id)) {
            engine.removePlayer(p.id);
          }
        }
      }
      for (const id of Array.from(engine.players.keys())) {
        if (!activeIds.has(id)) {
          engine.removePlayer(id);
        }
      }
    }

    if (isHostInitial && engine) {
      syncEnginePlayers();
    }

    function setAndBroadcastBanner(banner: MatchBannerPayload): void {
      if (goBannerTimer !== null) {
        clearTimeout(goBannerTimer);
        goBannerTimer = null;
      }
      gameUI.applyMatchBanner(banner);
      gameApp.networkHost?.broadcastMatchBanner(banner as unknown as Record<string, unknown>);
    }

    function buildMatchStatsSnapshot(
      winnerOverride?: 'red' | 'blue' | 'draw' | null,
      statsOverride?: any[],
      mvpOverride?: any
    ) {
      const allStats = statsOverride ?? (engine ? engine.getMatchStats() : []);
      const theMVP = mvpOverride ?? (engine ? engine.getMVP() : null);
      const redStats = allStats.filter((s: any) => s.team === 'red');
      const blueStats = allStats.filter((s: any) => s.team === 'blue');
      const engineState = engine ? engine.getState() : null;
      const finalRedScore = engineState ? engineState.redScore : gameUI.redScore;
      const finalBlueScore = engineState ? engineState.blueScore : gameUI.blueScore;
      const finalDuration = engineState ? engineState.matchTimer : 0;
      const matchWinner: 'red' | 'blue' | 'draw' =
        (winnerOverride as 'red' | 'blue' | 'draw') ||
        (finalRedScore > finalBlueScore ? 'red' : finalBlueScore > finalRedScore ? 'blue' : 'draw');
      const redName = gameUI.redCaptainKit?.name || gameUI.redTeamKit?.name || 'Equipo Rojo';
      const blueName = gameUI.blueCaptainKit?.name || gameUI.blueTeamKit?.name || 'Equipo Azul';
      const redAcronym = gameUI.redCaptainKit?.tag || gameUI.redTeamKit?.tag || 'RED';
      const blueAcronym = gameUI.blueCaptainKit?.tag || gameUI.blueTeamKit?.tag || 'BLU';
      const winnerTeamName = matchWinner === 'red' ? redName : (matchWinner === 'blue' ? blueName : 'Empate');

      return {
        snapshot: {
          redScore: finalRedScore,
          blueScore: finalBlueScore,
          matchDuration: Math.round(finalDuration),
          winner: matchWinner,
          winnerTeamName,
          redTeamName: redName,
          blueTeamName: blueName,
          redAcronym,
          blueAcronym,
          redKit: { ...gameUI.redCaptainKit },
          blueKit: { ...gameUI.blueCaptainKit },
          mvpPlayerId: theMVP?.playerId ?? null,
          mvpName: theMVP?.nickname ?? '',
          mvpScore: theMVP?.points ?? 0,
          players: allStats.map((s: any) => ({ ...s }))
        },
        allStats: allStats.map((s: any) => ({ ...s })),
        theMVP: theMVP ? { ...theMVP } : null,
        redStats: redStats.map((s: any) => ({ ...s })),
        blueStats: blueStats.map((s: any) => ({ ...s }))
      };
    }

    // Conectar callbacks de estado UI
    gameUI.onModifiersChanged = (mods) => {
      applyModifiersToEngine(mods);
      if (predEngine) {
        predEngine.applyModifiers(mods);
      }
    };

    gameUI.onTriggerShake = (intensity: number, durationMs: number) => {
      if (gameUI.screenShake) {
        rendererInstance?.triggerShake(intensity, durationMs);
      }
    };

    gameUI.onStartMatch = () => {
      frozenMatchSnapshot = null;
      gameUI.hasCompletedMatch = false;
      gameUI.lastMatchStats = null;
      gameUI.activeSlide = 'MENU';
      gameUI.redTeamStats = [];
      gameUI.blueTeamStats = [];
      gameUI.mvp = null;
      gameUI.activeModal = 'NONE';
      gameUI.clearModalStack();
      if (typeof document !== 'undefined') {
        (document.activeElement as HTMLElement)?.blur();
      }
      if (gameUI.isHost && engine) {
        syncEnginePlayers();
        engine.resetMatchStats();
        engine.startMatchWithIntro();
        setAndBroadcastBanner({ kind: 'VS', durationMs: 1800 });
        gameUI.handleMatchPhaseTransition(engine.fsm.state);
        gameApp.syncMatchPhase(engine.fsm.state);
        gameApp.networkHost?.broadcastRoomStateSync();
      } else if (!gameUI.isHost && gameApp.networkClient) {
        gameApp.networkClient.sendAdminAction('START_MATCH');
      }
    };

    gameUI.onStopMatch = () => {
      frozenMatchSnapshot = null;
      if (gameUI.isHost && engine) {
        engine.stopMatch();
        soundFX.playWhistle();
        gameApp.networkHost?.broadcastGameFx('whistle');
        setAndBroadcastBanner({ kind: 'NONE' });
        gameApp.syncMatchPhase(0);
        gameApp.networkHost?.broadcastRoomStateSync();
      } else if (!gameUI.isHost && gameApp.networkClient) {
        gameApp.networkClient.sendAdminAction('STOP_MATCH');
        return;
      }
      gameUI.hasCompletedMatch = false;
      gameUI.lastMatchStats = null;
      gameUI.activeSlide = 'MENU';
      gameUI.redTeamStats = [];
      gameUI.blueTeamStats = [];
      gameUI.mvp = null;
      gameUI.clearModalStack();
      gameUI.activeModal = 'TEAM_SELECT';
    };

    gameUI.onTogglePause = () => {
      if (gameUI.isHost && engine) {
        engine.togglePause();
        gameUI.handleMatchPhaseTransition(engine.fsm.state);
        gameApp.syncMatchPhase(engine.fsm.state);
        gameApp.networkHost?.broadcastRoomStateSync();
      } else if (!gameUI.isHost && gameApp.networkClient) {
        gameApp.networkClient.sendAdminAction('TOGGLE_PAUSE');
      }
    };

    gameUI.onStartPracticeMode = () => {
      gameApp.setupPracticeMode();
      if (!engine) {
        engine = new EngineInstance('mediano');
        testEngine = engine;
        engine.applyModifiers(gameUI.physicsModifiers);
        wireHostEngineEvents(engine);
      }
      engine.loadStadium('mediano');
      rendererInstance?.setStadium(createStadium('mediano'));
      syncEnginePlayers();
      engine.resetPositions();
      gameUI.applyMatchBanner({ kind: 'NONE' });
      gameUI.fsmPhase = 'STOPPED';
      gameUI.matchPhase = 0;
      gameUI.enforceStopMenu();
    };

    gameUI.onTeamChanged = (playerId: number, team: 'red' | 'blue' | 'spectator') => {
      if (gameUI.isHost && engine) {
        engine.setPlayerTeam(playerId, team);
        if (gameUI.matchPhase === 0) {
          engine.resetPositions();
        }
        gameApp.networkHost?.setPlayerTeam(playerId, team);
      } else if (!gameUI.isHost && gameApp.networkClient) {
        gameApp.networkClient.requestTeamChange(team, playerId);
      }
    };

    gameUI.onStadiumChanged = (stadiumId: string) => {
      if (rendererInstance) {
        rendererInstance.setStadium(createStadium(stadiumId));
      }
      if (predEngine && predStadiumId !== stadiumId) {
        predStadiumId = stadiumId as any;
        predEngine.loadStadium(stadiumId);
      }
      if (gameUI.isHost && engine) {
        engine.loadStadium(stadiumId);
        gameApp.updateRoomConfig({ stadiumId });
      } else if (!gameUI.isHost && gameApp.networkClient && gameUI.isAdmin) {
        gameApp.networkClient.sendAdminAction('SET_RULES', { stadiumId });
      }
    };

    gameUI.onChatSent = (text: string) => {
      if (gameUI.isHost) {
        gameApp.networkHost?.sendChat(gameUI.nickname, text, gameUI.myTeam);
      } else {
        gameApp.networkClient?.sendChat(text);
      }
    };

    gameUI.onPlayerEmote = (playerId: number, emoji: string) => {
      if (gameUI.settings.showPitchEmotes !== false) {
        triggerPitchEmote(playerId, emoji);
      }
    };

    // Conectar eventos del motor al sintetizador procedural Web Audio API, Screen Shake y Red P2P
    function wireHostEngineEvents(hostEngine: EngineInstance): void {
      hostEngine.on('goal', (payload: any) => {
        soundFX.playGoalHorn();
        soundFX.playWhistle();
        if (gameUI.screenShake) {
          rendererInstance?.triggerShake(15, 500);
        }
        gameApp.networkHost?.broadcastGameFx('goal');

        if (typeof payload?.redScore === 'number') gameUI.redScore = payload.redScore;
        if (typeof payload?.blueScore === 'number') gameUI.blueScore = payload.blueScore;

        // Si el gol no concluyó el partido (fase 3: GOAL), desplegar Banner de Gol (3.0s)
        if (hostEngine.fsm.state === MatchPhase.GOAL) {
          setAndBroadcastBanner({
            kind: 'GOAL',
            scoringTeam: payload?.scoringTeam ?? 'red',
            scorerName: payload?.scorerName ?? null,
            assisterName: payload?.assisterName ?? null,
            isOwnGoal: Boolean(payload?.isOwnGoal),
            redScore: payload?.redScore ?? gameUI.redScore,
            blueScore: payload?.blueScore ?? gameUI.blueScore
          });
        }
      });

      hostEngine.on('victory_celebration', ({ winner, redScore, blueScore, stats, mvp, lastGoal }: any) => {
        // Congelar inmediatamente el snapshot inmutable de estadísticas al inicio de los 5.0s
        frozenMatchSnapshot = buildMatchStatsSnapshot(winner, stats, mvp);
        gameUI.lastMatchStats = frozenMatchSnapshot.snapshot;
        gameUI.mvp = frozenMatchSnapshot.theMVP;
        gameUI.redTeamStats = frozenMatchSnapshot.redStats;
        gameUI.blueTeamStats = frozenMatchSnapshot.blueStats;
        if (typeof redScore === 'number') gameUI.redScore = redScore;
        if (typeof blueScore === 'number') gameUI.blueScore = blueScore;

        setAndBroadcastBanner({
          kind: 'VICTORY',
          winner: winner ?? 'draw',
          redScore: redScore ?? gameUI.redScore,
          blueScore: blueScore ?? gameUI.blueScore,
          scorerName: lastGoal?.scorerName ?? null,
          assisterName: lastGoal?.assisterName ?? null,
          isOwnGoal: Boolean(lastGoal?.isOwnGoal)
        });
        gameUI.handleMatchPhaseTransition(MatchPhase.CELEBRATION);
        gameApp.syncMatchPhase(MatchPhase.CELEBRATION);
      });

      hostEngine.on('post_hit', () => {
        soundFX.playPostHit();
        if (gameUI.screenShake) {
          rendererInstance?.triggerShake(7, 220);
        }
        gameApp.networkHost?.broadcastGameFx('post');
      });

      hostEngine.on('wall_hit', () => {
        soundFX.playBounce();
        gameApp.networkHost?.broadcastGameFx('wall');
      });

      hostEngine.on('kick', (payload: any) => {
        const isPower = Boolean(payload?.isPowerShot);
        const strength = payload?.strength ?? (isPower ? 1.8 : 1.0);
        soundFX.playKick(strength);
        gameApp.networkHost?.broadcastGameFx(isPower ? 'power_shot' : 'kick', strength);
      });

      hostEngine.on('countdown_tick', ({ count, isResume }: { count: number; isResume: boolean }) => {
        soundFX.playCountdown(count === 0);
        gameApp.networkHost?.broadcastGameFx('countdown_tick', undefined, count);
        if (count > 0) {
          setAndBroadcastBanner({
            kind: 'COUNTDOWN',
            count,
            label: String(count),
            isResume
          });
        } else {
          setAndBroadcastBanner({
            kind: 'COUNTDOWN',
            count: 0,
            label: '¡JUEGUEN!',
            isResume
          });
          goBannerTimer = setTimeout(() => {
            goBannerTimer = null;
            if (gameUI.activeBanner.kind === 'COUNTDOWN' && gameUI.activeBanner.count === 0) {
              setAndBroadcastBanner({ kind: 'NONE' });
            }
          }, 650);
        }
      });

      hostEngine.on('whistle', () => {
        soundFX.playWhistle();
        gameApp.networkHost?.broadcastGameFx('whistle');
      });

      hostEngine.on('state_change', ({ newState, prevState }: { newState: MatchPhase; prevState: MatchPhase }) => {
        gameUI.handleMatchPhaseTransition(newState);
        gameApp.syncMatchPhase(newState);

        if (newState === MatchPhase.PAUSE) {
          setAndBroadcastBanner({ kind: 'PAUSED' });
        } else if (newState === MatchPhase.KICKOFF && prevState === MatchPhase.GOAL) {
          soundFX.playWhistle();
          gameApp.networkHost?.broadcastGameFx('whistle');
          setAndBroadcastBanner({ kind: 'NONE' });
        } else if (newState === MatchPhase.STOP) {
          setAndBroadcastBanner({ kind: 'NONE' });
        }
      });

      hostEngine.on('match_end', ({ winner, stats, mvp }: any) => {
        soundFX.playWhistle();
        gameApp.networkHost?.broadcastGameFx('whistle');
        setAndBroadcastBanner({ kind: 'NONE' });

        const frozen = frozenMatchSnapshot ?? buildMatchStatsSnapshot(winner, stats, mvp);
        frozenMatchSnapshot = null;

        gameUI.hasCompletedMatch = true;
        gameUI.activeSlide = 'STATS';
        gameUI.fsmPhase = 'STOPPED';
        gameUI.matchPhase = 0;
        gameUI.previousMatchPhase = 0;
        hostEngine.stopMatch();

        gameUI.lastMatchStats = frozen.snapshot;
        gameUI.mvp = frozen.theMVP;
        gameUI.redTeamStats = frozen.redStats;
        gameUI.blueTeamStats = frozen.blueStats;

        gameApp.syncMatchPhase(0);
        gameApp.networkHost?.broadcastMatchStats(
          frozen.snapshot,
          frozen.allStats,
          frozen.theMVP,
          frozen.redStats,
          frozen.blueStats
        );

        if (!gameUI.isSecondaryOverlayOpen) {
          gameUI.clearModalStack();
          gameUI.activeModal = 'TEAM_SELECT';
        }
      });
    }

    if (engine) {
      wireHostEngineEvents(engine);
    }

    // 2. Inicializar GameRenderer desacoplado
    const renderer = new GameRenderer(canvasEl, {
      stadium: engine?.stadium || createStadium(gameUI.selectedStadiumId || 'mediano'),
      playerInfos: new Map()
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

    const onPointerDown = () => {
      soundFX.ensureContext();
    };

    function isGameplayBindCode(code: string): boolean {
      const kb = gameUI.keybinds;
      return (
        kb.up.includes(code) ||
        kb.down.includes(code) ||
        kb.left.includes(code) ||
        kb.right.includes(code) ||
        kb.kick.includes(code) ||
        kb.turbo.includes(code) ||
        kb.dash.includes(code) ||
        kb.curveLeft.includes(code) ||
        kb.curveRight.includes(code) ||
        code === 'KeyX' ||
        code === 'ShiftRight' ||
        code === 'KeyQ' ||
        code === 'KeyZ' ||
        code === 'KeyE' ||
        code === 'KeyC'
      );
    }

    function dispatchImmediateGuestInput(): void {
      if (gameUI.isHost || !gameApp.networkClient) return;
      const mask = computeInputMask(false);
      const tick = predEngine ? predEngine.currentTick + 1 : clientTick;
      gameApp.networkClient.sendInput(mask, tick);
    }

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

      // Atajo de Pausa / Reanudación (por defecto KeyP) para Host y Admin
      if (
        !e.repeat &&
        gameUI.currentScreen === 'IN_GAME' &&
        (gameUI.isHost || gameUI.isAdmin) &&
        gameUI.keybinds.pause.includes(e.code)
      ) {
        e.preventDefault();
        gameUI.togglePause();
        return;
      }

      // Atajo canónico para Modificadores [#] (Exclusivo Host)
      if (e.key === '#') {
        if (!gameUI.isHost) return;
        if (gameUI.activeModal === 'PHYSICS_MODIFIERS' || gameUI.activeModal === 'MODIFIERS') {
          gameUI.closeOverlay();
        } else {
          gameUI.openOverlay('PHYSICS_MODIFIERS');
        }
        e.preventDefault();
        return;
      }

      if (gameUI.keybinds.dash.includes(e.code) && !e.repeat) {
        dashTriggered = true;
      }

      const wasDown = Boolean(keyState.get(e.code));
      keyState.set(e.code, true);
      if (!wasDown && isGameplayBindCode(e.code)) {
        dispatchImmediateGuestInput();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (gameUI.keybinds.dash.includes(e.code)) {
        dashTriggered = false;
      }
      const wasDown = Boolean(keyState.get(e.code));
      keyState.set(e.code, false);
      if (wasDown && isGameplayBindCode(e.code)) {
        dispatchImmediateGuestInput();
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 4. Bucle desacoplado: Simulación y Network a 60 Hz en Worker + Render en requestAnimationFrame
    const FIXED_DT_MS = 1000 / 60;
    let lastSimTimestamp = performance.now();
    let animFrameId: number;

    let clientTick = 0;
    let prevSnapshot: GameStateSnapshot = engine ? engine.getState() : ({} as any);
    let currSnapshot: GameStateSnapshot = engine ? engine.getState() : ({} as any);

    function isMovablePhase(phase: number): boolean {
      return (
        phase === MatchPhase.KICKOFF ||
        phase === MatchPhase.PLAYING ||
        phase === MatchPhase.GOAL ||
        phase === MatchPhase.CELEBRATION
      );
    }

    function computeInputMask(consumeDash: boolean): number {
      let mask = 0;
      const isInputActive = gameUI.currentScreen === 'IN_GAME' && gameUI.activeModal === 'NONE';
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (isInputActive && !isTyping) {
        if (gameUI.keybinds.up.some((k) => keyState.get(k))) mask |= INPUT_FLAG_UP;
        if (gameUI.keybinds.down.some((k) => keyState.get(k))) mask |= INPUT_FLAG_DOWN;
        if (gameUI.keybinds.left.some((k) => keyState.get(k))) mask |= INPUT_FLAG_LEFT;
        if (gameUI.keybinds.right.some((k) => keyState.get(k))) mask |= INPUT_FLAG_RIGHT;

        if (gameUI.keybinds.kick.some((k) => keyState.get(k)) || keyState.get('KeyX')) mask |= INPUT_FLAG_KICK;

        if (gameUI.keybinds.turbo.some((k) => keyState.get(k)) || keyState.get('ShiftRight')) mask |= INPUT_FLAG_TURBO;

        if (dashTriggered) {
          mask |= INPUT_FLAG_DASH;
          if (consumeDash) {
            dashTriggered = false;
          }
        }

        if (gameUI.keybinds.curveLeft.some((k) => keyState.get(k)) || keyState.get('KeyQ') || keyState.get('KeyZ')) {
          mask |= INPUT_FLAG_MAGNUS_LEFT;
        }
        if (gameUI.keybinds.curveRight.some((k) => keyState.get(k)) || keyState.get('KeyE') || keyState.get('KeyC')) {
          mask |= INPUT_FLAG_MAGNUS_RIGHT;
        }
      }
      return mask;
    }

    function syncHudTelemetryFromSnapshot(snap: GameStateSnapshot): void {
      gameUI.redScore = snap.redScore ?? gameUI.redScore;
      gameUI.blueScore = snap.blueScore ?? gameUI.blueScore;
      const phase = snap.phase ?? 0;
      if (phase === MatchPhase.STOP || phase === 0) {
        gameUI.matchTimeFormatted = '00:00';
      } else {
        const totalSec = snap.matchTimer ?? 0;
        const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const secs = (totalSec % 60).toString().padStart(2, '0');
        gameUI.matchTimeFormatted = `${mins}:${secs}`;
      }
      gameUI.handleMatchPhaseTransition(phase);
    }

    const handleAuthoritativeSnapshot = (snap: GameStateSnapshot) => {
      currSnapshot = snap;
      syncHudTelemetryFromSnapshot(snap);
      if (!predEngine && !gameUI.isHost) {
        predEngine = new EngineInstance(gameUI.selectedStadiumId || 'mediano');
        predEngine.applyModifiers(gameUI.physicsModifiers);
      }
      if (predEngine && gameUI.localPlayerId > 0) {
        reconciler.reconcile(predEngine, snap, gameUI.localPlayerId);
        const localDisc = predEngine.players.get(gameUI.localPlayerId);
        if (localDisc) {
          prevPredLocalPos.x = localDisc.pos.x;
          prevPredLocalPos.y = localDisc.pos.y;
          currPredLocalPos.x = localDisc.pos.x;
          currPredLocalPos.y = localDisc.pos.y;
          hasPredLocalPos = true;
        } else {
          hasPredLocalPos = false;
        }
      }
    };

    if (!isHostInitial && gameApp.networkClient) {
      gameApp.networkClient.onSnapshotDecoded = handleAuthoritativeSnapshot;
    }

    const simTicker = new SimulationTicker((now) => {
      lastSimTimestamp = now;
      const mask = computeInputMask(true);

      if (!gameUI.isHost) {
        // Guest: Predicción local a 60 Hz + envío de input por canal no confiable
        if (gameApp.networkClient) {
          if (!gameApp.networkClient.onSnapshotDecoded) {
            gameApp.networkClient.onSnapshotDecoded = handleAuthoritativeSnapshot;
          }
          if (
            predEngine &&
            gameUI.localPlayerId > 0 &&
            predEngine.players.has(gameUI.localPlayerId) &&
            isMovablePhase(predEngine.fsm.state)
          ) {
            const localDiscBefore = predEngine.players.get(gameUI.localPlayerId)!;
            prevPredLocalPos.x = localDiscBefore.pos.x;
            prevPredLocalPos.y = localDiscBefore.pos.y;

            const nextTick = predEngine.currentTick + 1;
            reconciler.recordInput(nextTick, mask);
            gameApp.networkClient.sendInput(mask, nextTick);

            const localInputMap = new Map<number, PlayerInput>();
            localInputMap.set(gameUI.localPlayerId, { inputMask: mask });
            predEngine.step(localInputMap);

            const localDiscAfter = predEngine.players.get(gameUI.localPlayerId);
            if (localDiscAfter) {
              currPredLocalPos.x = localDiscAfter.pos.x;
              currPredLocalPos.y = localDiscAfter.pos.y;
              hasPredLocalPos = true;
            }
            clientTick = predEngine.currentTick;
          } else {
            gameApp.networkClient.sendInput(mask, ++clientTick);
            if (predEngine && gameUI.localPlayerId > 0) {
              const localDisc = predEngine.players.get(gameUI.localPlayerId);
              if (localDisc) {
                prevPredLocalPos.x = localDisc.pos.x;
                prevPredLocalPos.y = localDisc.pos.y;
                currPredLocalPos.x = localDisc.pos.x;
                currPredLocalPos.y = localDisc.pos.y;
                hasPredLocalPos = true;
              }
            }
          }
        }
      } else if (engine) {
        // Host: Sincronizar jugadores y procesar física autoritativa
        syncEnginePlayers();
        const inputs = new Map<number, PlayerInput>();
        inputs.set(gameUI.localPlayerId, { inputMask: mask });
        for (const [rId, rInput] of gameApp.remoteInputs.entries()) {
          inputs.set(rId, rInput);
        }

        prevSnapshot = currSnapshot;
        engine.step(inputs);
        currSnapshot = engine.getState();

        // Broadcast snapshot autoritativo a todos los peers conectados
        const snapBuffer = BinaryProtocol.encodeSnapshot(currSnapshot);
        gameApp.networkHost?.broadcastSnapshot(snapBuffer);
      }
    });

    simTicker.start();

    let frameCount = 0;
    let lastFpsCalculation = performance.now();

    function renderLoop(currentTime: number): void {
      // Interpolación lineal libre en Canvas 2D
      const alpha = Math.max(0, Math.min(1.0, (currentTime - lastSimTimestamp) / FIXED_DT_MS));

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
      renderer.screenShakeEnabled = gameUI.screenShake;
      renderer.setExtrapolation(gameUI.extrapolationMs);
      renderer.discRenderer.dampingBall = gameUI.modifiers.ballFriction ?? gameUI.modifiers.pitchFriction ?? 0.99;
      renderer.discRenderer.dampingPlayer = gameUI.modifiers.playerFriction ?? 0.96;
      renderer.setGoalNets(gameUI.isHost && engine ? engine.world.goalNets : null);

      // Sincronizar equipaciones de los capitanes, balón y VFX en tiempo real
      const redActiveKit = gameUI.redCaptainKit;
      const blueActiveKit = gameUI.blueCaptainKit;
      renderer.discRenderer.redKit = redActiveKit;
      renderer.discRenderer.blueKit = blueActiveKit;
      renderer.discRenderer.ballRadius = gameUI.gameplayConfig.ballRadius || gameUI.modifiers.ballRadius || 5.8;
      renderer.discRenderer.playerRadius = gameUI.gameplayConfig.playerRadius || gameUI.modifiers.playerRadius || 15.0;
      renderer.discRenderer.ballSkin = gameUI.settings.ballSkin as any;
      renderer.discRenderer.ballMode = gameUI.settings.ballMode;
      renderer.discRenderer.ballCustomColor = gameUI.settings.ballCustomColor;
      renderer.discRenderer.playerGlowEnabled = gameUI.settings.playerGlowEnabled !== false;
      renderer.discRenderer.ballTrailEnabled = gameUI.settings.ballTrailEnabled !== false;

      renderer.vfx.magnusTrailEnabled = gameUI.settings.magnusTrailEnabled !== false;
      renderer.vfx.fireTrailEnabled = gameUI.settings.fireShotEnabled !== false;
      renderer.vfx.floatingPointsEnabled = gameUI.settings.floatingPointsEnabled !== false;

      // Sincronizar telemetría visual de TODOS los jugadores del roster en el Canvas
      const activeIds = new Set<number>();
      for (const p of gameUI.rosterPlayers) {
        activeIds.add(p.id);
        const activeKit = p.team === 'red' ? redActiveKit : blueActiveKit;
        const pAvatarType = (p.avatarType as 'emoji' | 'text' | 'letters') || 'letters';
        let visual = renderer.playerInfos.get(p.id);
        if (!visual) {
          const newVisual: PlayerVisualInfo = {
            nickname: p.nickname || p.name,
            number: p.number ?? p.id,
            avatar: p.avatar || String(p.id),
            avatarType: pAvatarType,
            hasOutline: activeKit?.outlineColor !== 'none' && activeKit?.outlineColor !== '',
            tertiaryColor: activeKit?.tertiaryColor || '#ffffff',
            kit: activeKit
          };
          renderer.playerInfos.set(p.id, newVisual);
        } else {
          visual.nickname = p.nickname || p.name;
          visual.number = p.number ?? p.id;
          visual.avatar = p.avatar || String(p.id);
          visual.avatarType = pAvatarType;
          visual.hasOutline = activeKit?.outlineColor !== 'none' && activeKit?.outlineColor !== '';
          visual.tertiaryColor = activeKit?.tertiaryColor || '#ffffff';
          visual.kit = activeKit;
        }
      }
      for (const id of Array.from(renderer.playerInfos.keys())) {
        if (!activeIds.has(id)) {
          renderer.playerInfos.delete(id);
        }
      }

      if (!gameUI.isHost && gameApp.networkClient) {
        reconciler.decayVisualOffset();
        const interpSnap =
          gameApp.networkClient.jitterBuffer.getInterpolatedSnapshot(currentTime) ??
          gameApp.networkClient.latestSnapshot;
        if (interpSnap && interpSnap.discs) {
          let renderSnap = interpSnap;
          const localId = gameUI.localPlayerId;
          const predDisc = predEngine && localId > 0 ? predEngine.players.get(localId) : undefined;
          if (predDisc && hasPredLocalPos && isMovablePhase(interpSnap.phase)) {
            const predX = lerp(prevPredLocalPos.x, currPredLocalPos.x, alpha) + reconciler.visualOffset.x;
            const predY = lerp(prevPredLocalPos.y, currPredLocalPos.y, alpha) + reconciler.visualOffset.y;
            let predFlags = 0;
            if (predDisc.kicking) predFlags |= 1 << 0;
            if (predDisc.isDashing) predFlags |= 1 << 1;
            if (predDisc.isTurbo) predFlags |= 1 << 4;
            if (predDisc.isTyping) predFlags |= 1 << 5;

            renderSnap = {
              ...interpSnap,
              discs: interpSnap.discs.map((d: CompactDiscState) =>
                d.id === localId
                  ? {
                      ...d,
                      x: predX,
                      y: predY,
                      vx: predDisc.vel.x,
                      vy: predDisc.vel.y,
                      stamina: predDisc.stamina,
                      flags: predFlags || d.flags
                    }
                  : d
              )
            };
          }
          currSnapshot = renderSnap;
          prevSnapshot = renderSnap;
          renderer.render(renderSnap, renderSnap, 1.0, gameUI.localPlayerId);
        }
      } else if (currSnapshot && currSnapshot.discs) {
        renderer.render(prevSnapshot, currSnapshot, alpha, gameUI.localPlayerId);
      }

      // Actualizar telemetría reactiva en UI
      frameCount++;
      if (currentTime - lastFpsCalculation >= 500) {
        gameUI.fps = Math.round((frameCount * 1000) / (currentTime - lastFpsCalculation));
        frameCount = 0;
        lastFpsCalculation = currentTime;

        if (currSnapshot && currSnapshot.discs) {
          gameUI.redScore = currSnapshot.redScore ?? (engine ? engine.fsm.redScore : gameUI.redScore);
          gameUI.blueScore = currSnapshot.blueScore ?? (engine ? engine.fsm.blueScore : gameUI.blueScore);

          if (gameUI.isHost && engine && typeof (engine.fsm as any).getPossessionPercentages === 'function') {
            const possession = (engine.fsm as any).getPossessionPercentages();
            if (possession) {
              gameUI.redPossession = possession.red;
              gameUI.bluePossession = possession.blue;
            }
          }

          const phase = currSnapshot.phase ?? (engine ? engine.fsm.state : 0);
          if (phase === MatchPhase.STOP || phase === 0) {
            gameUI.matchTimeFormatted = '00:00';
            gameUI.handleMatchPhaseTransition(0);
          } else {
            const totalSec = currSnapshot.matchTimer ?? (engine ? Math.floor(engine.fsm.matchTicksElapsed / 60) : 0);
            const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
            const secs = (totalSec % 60).toString().padStart(2, '0');
            gameUI.matchTimeFormatted = `${mins}:${secs}`;
            gameUI.handleMatchPhaseTransition(phase);
          }

          if (gameUI.isHost) {
            gameApp.syncMatchPhase(phase);
          }
          gameUI.enforceStopMenu();
        }
      }

      animFrameId = requestAnimationFrame(renderLoop);
    }

    animFrameId = requestAnimationFrame(renderLoop);

    return () => {
      if (goBannerTimer !== null) {
        clearTimeout(goBannerTimer);
        goBannerTimer = null;
      }
      simTicker.stop();
      if (gameUI.isHost) {
        soundFX.stopHostKeepAlive();
      }
      if (gameApp.networkClient) {
        gameApp.networkClient.onSnapshotDecoded = undefined;
      }
      gameUI.onTriggerShake = null;
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', onPointerDown);
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
