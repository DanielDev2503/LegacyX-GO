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
    INPUT_FLAG_TYPING,
    INPUT_FLAG_MOUSE_AIM,
    INPUT_FLAG_MOUSE_ACTIVE,
    lerp
  } from '@legacyx/core';

  import { GameRenderer, triggerPitchEmote } from './renderer/GameRenderer.js';
  import type { PlayerVisualInfo } from './renderer/DiscRenderer.js';
  import {
    gameUI,
    isFloatingScoreCategoryEnabled,
    type PhysicsModifiers,
    type MatchBannerPayload
  } from './ui/state/gameUI.svelte.js';
  import { soundFX } from './audio/SoundFX.js';
  import { gameApp } from './net/GameApp.js';
  import { SimulationTicker } from './net/SimulationTicker.js';
  import { ClientPredictionReconciler } from './net/ClientPrediction.js';
  import { computeMouseMovementVector, mouseButtonToCode } from './controllers/InputManager.js';
  import { matchRecorder } from './recorder/MatchRecorder.svelte.js';
  import { userProfile } from './ui/state/userProfile.svelte.js';

  import Gatekeeper from './ui/screens/Gatekeeper.svelte';
  import Lobby from './ui/screens/Lobby.svelte';
  import RoomCreator from './ui/screens/RoomCreator.svelte';
  import InGameHUD from './ui/hud/InGameHUD.svelte';
  import PhysicsModal from './ui/modals/PhysicsModal.svelte';
  import TeamSelectModal from './ui/modals/TeamSelectModal.svelte';
  import StadiumSelectModal from './ui/modals/StadiumSelectModal.svelte';
  import SettingsModal from './ui/modals/SettingsModal.svelte';
  import KeybindModal from './ui/modals/KeybindModal.svelte';
  import ReplayViewerModal from './ui/modals/ReplayViewerModal.svelte';
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

  function syncEngineMatchLimits(targetEngine: EngineInstance | null): void {
    if (!targetEngine) return;
    targetEngine.isPracticeMode = Boolean(gameUI.isPracticeMode);
    targetEngine.setTimeLimit(Math.max(0, Number(gameUI.timeLimitMinutes ?? 0)) * 60);
    targetEngine.setScoreLimit(Math.max(0, Number(gameUI.scoreLimitGoals ?? 0)));
  }

  let didAutoRouteAuthenticatedBoot = false;
  let wasAuthenticatedSession = Boolean(userProfile.isAuthenticated && !userProfile.isGuest);

  $effect(() => {
    const isLoggedAccount = Boolean(userProfile.isAuthenticated && !userProfile.isGuest);
    gameApp.signaling.setUserId(isLoggedAccount ? (userProfile.id ?? null) : null);

    if (wasAuthenticatedSession && !isLoggedAccount) {
      didAutoRouteAuthenticatedBoot = true;
      gameApp.handleLogout();
      wasAuthenticatedSession = false;
      return;
    }
    wasAuthenticatedSession = isLoggedAccount;

    // Sincronizar retorno OAuth y entrada automática al Lobby una única vez al arrancar con sesión activa
    if (typeof window !== 'undefined' && window.location.hash?.includes('access_token=')) {
      void userProfile.handleOAuthRedirect();
    } else if (!didAutoRouteAuthenticatedBoot && isLoggedAccount && gameUI.currentScreen === 'GATEKEEPER') {
      didAutoRouteAuthenticatedBoot = true;
      gameUI.setPlayerNickname(userProfile.username);
      gameUI.navigateTo('LOBBY');
    } else if (gameUI.currentScreen !== 'GATEKEEPER') {
      didAutoRouteAuthenticatedBoot = true;
    }
  });

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
    let lastObservedGuestRedScore = 0;
    let lastObservedGuestBlueScore = 0;
    let lastRecordedBannerSig = '';

    if (isHostInitial) {
      engine = new EngineInstance(gameUI.selectedStadiumId || 'mediano');
      testEngine = engine;
      engine.isPracticeMode = Boolean(gameUI.isPracticeMode);
      engine.applyModifiers(gameUI.physicsModifiers);
      syncEngineMatchLimits(engine);
      engine.resetPositions();
      soundFX.startHostKeepAlive();
    } else {
      predEngine = new EngineInstance(predStadiumId);
      predEngine.isPracticeMode = Boolean(gameUI.isPracticeMode);
      predEngine.applyModifiers(gameUI.physicsModifiers);
      syncEngineMatchLimits(predEngine);
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

    gameUI.onChatAdded = (entry) => {
      if (!matchRecorder.isRecording) return;
      const senderTeam =
        entry.senderTeam === 'red' || entry.team === 'RED'
          ? 'RED'
          : entry.senderTeam === 'blue' || entry.team === 'BLUE'
            ? 'BLUE'
            : entry.senderTeam === 'spectator' || entry.team === 'SPEC'
              ? 'SPECTATOR'
              : undefined;
      const kind = entry.isSystem || entry.team === 'SYSTEM' || entry.senderTeam === 'system' ? 'system' : 'chat';
      matchRecorder.recordChat({
        kind,
        sender: entry.sender || '',
        ...(senderTeam ? { senderTeam } : {}),
        text: entry.text || ''
      });
    };

    gameUI.onBannerApplied = (banner) => {
      if (!matchRecorder.isRecording) {
        lastRecordedBannerSig = '';
        return;
      }
      const sig = JSON.stringify(banner);
      if (sig === lastRecordedBannerSig) return;
      lastRecordedBannerSig = sig;
      matchRecorder.recordBanner(banner);
    };

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
      lastObservedGuestRedScore = 0;
      lastObservedGuestBlueScore = 0;
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
        syncEngineMatchLimits(engine);
        engine.resetMatchStats();
        engine.startMatchWithIntro();
        gameApp.startRankedMatchSession();
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
      if (matchRecorder.isRecording) {
        matchRecorder.stop();
      }
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
      predEngine = null;
      lastRecordedBannerSig = '';
      if (!engine) {
        engine = new EngineInstance('mediano');
        testEngine = engine;
        engine.applyModifiers(gameUI.physicsModifiers);
        wireHostEngineEvents(engine);
      }
      engine.isPracticeMode = true;
      engine.loadStadium('mediano');
      syncEngineMatchLimits(engine);
      rendererInstance?.setStadium(createStadium('mediano'));
      syncEnginePlayers();
      engine.setPlayerTeam(1, 'red');
      engine.resetPositions();
      gameUI.applyMatchBanner({ kind: 'NONE' });
      gameUI.fsmPhase = 'STOPPED';
      gameUI.matchPhase = 0;
      gameUI.closeOverlay();
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
      if (gameUI.isPracticeMode || (!gameApp.networkHost && !gameApp.networkClient)) {
        const msgId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        gameUI.addChatMessage({
          id: msgId,
          team: gameUI.myTeam === 'red' ? 'RED' : gameUI.myTeam === 'blue' ? 'BLUE' : 'SPEC',
          sender: gameUI.nickname,
          senderTeam: gameUI.myTeam,
          text
        });
      } else if (gameUI.isHost) {
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

    function dispatchScoreEvent(ev: any): void {
      if (!ev) return;
      const localId = gameUI.localPlayerId;
      const pId = String(ev.playerId ?? '');
      if (!localId || !pId || pId !== String(localId)) return;

      const cat = String(ev.category || ev.eventType || '').toLowerCase();
      const filterCat = cat.includes('own')
        ? 'ownGoal'
        : cat.includes('hattrick')
          ? 'hattrick'
          : cat.includes('assist')
            ? 'assist'
            : cat.includes('save')
              ? 'save'
              : cat.includes('shot')
                ? 'shot'
                : cat.includes('pass')
                  ? 'pass'
                  : cat.includes('goal') || cat.includes('power')
                    ? 'goal'
                    : undefined;
      if (!isFloatingScoreCategoryEnabled(gameUI.settings, filterCat)) return;

      const player = gameUI.rosterPlayers.find((p) => String(p.id) === pId || p.peerId === pId);
      let eventType = 'EVENTO';
      if (cat.includes('power')) eventType = 'GOL POTENCIA';
      else if (cat.includes('curve_goal')) eventType = 'GOL EFECTO';
      else if (cat.includes('curve_assist')) eventType = 'ASISTENCIA EFECTO';
      else if (cat.includes('assist')) eventType = 'ASISTENCIA';
      else if (cat.includes('goal') && !cat.includes('own')) eventType = 'GOL';
      else if (cat.includes('own')) eventType = 'AUTOGOL';
      else if (cat.includes('save')) eventType = 'ATAJADA';
      else if (cat.includes('shot')) eventType = 'TIRO';
      else if (cat.includes('pass')) eventType = 'PASE';
      else if (cat.includes('hattrick')) eventType = 'HATTRICK';

      const pts = Number(ev.points ?? 0);
      const pointsText = `${pts >= 0 ? '+' : ''}${pts} PTS`;
      const team = player?.team === 'red' || player?.team === 'blue' ? player.team : 'neutral';

      gameUI.pushScoreEvent({
        playerName: '',
        eventType,
        pointsText,
        color: String(ev.color || (team === 'red' ? '#ff0055' : team === 'blue' ? '#00e5ff' : '#ffd700')),
        team
      });
    }

    // Recepción de eventos de puntos deslizantes para clientes No-Host (paridad 100% con Host)
    gameApp.onScoreEventReceived = (ev: Record<string, unknown>) => {
      dispatchScoreEvent(ev);
    };

    // Conectar eventos del motor al sintetizador procedural Web Audio API, Screen Shake y Red P2P
    function wireHostEngineEvents(hostEngine: EngineInstance): void {
      hostEngine.on('score_event', (ev: any) => {
        if (!ev) return;
        dispatchScoreEvent(ev);
        gameApp.networkHost?.broadcastScoreEvent(ev);
      });

      hostEngine.on('goal', (payload: any) => {
        soundFX.playGoalHorn();
        soundFX.playWhistle();
        if (gameUI.screenShake) {
          rendererInstance?.triggerShake(15, 500);
        }
        gameApp.networkHost?.broadcastGameFx('goal');

        if (typeof payload?.redScore === 'number') gameUI.redScore = payload.redScore;
        if (typeof payload?.blueScore === 'number') gameUI.blueScore = payload.blueScore;

        matchRecorder.recordGoal({
          scoringTeam: payload?.scoringTeam === 'blue' ? 'blue' : 'red',
          scorerName: payload?.scorerName ?? null,
          redScore: payload?.redScore ?? gameUI.redScore,
          blueScore: payload?.blueScore ?? gameUI.blueScore
        });

        // Si el gol no concluyó el partido (fase 3: GOAL), desplegar Banner de Gol (3.0s)
        if (hostEngine.fsm.state === MatchPhase.GOAL) {
          setAndBroadcastBanner({
            kind: 'GOAL',
            scoringTeam: payload?.scoringTeam ?? 'red',
            scorerName: payload?.scorerName ?? null,
            assisterName: payload?.assisterName ?? null,
            isOwnGoal: Boolean(payload?.isOwnGoal),
            redScore: payload?.redScore ?? gameUI.redScore,
            blueScore: payload?.blueScore ?? gameUI.blueScore,
            ...(typeof payload?.speedKmh === 'number' ? { speedKmh: payload.speedKmh } : {}),
            isPower: Boolean(payload?.isPower),
            isCurve: Boolean(payload?.isCurve)
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
          isOwnGoal: Boolean(lastGoal?.isOwnGoal),
          ...(typeof lastGoal?.speedKmh === 'number' ? { speedKmh: lastGoal.speedKmh } : {}),
          isPower: Boolean(lastGoal?.isPower),
          isCurve: Boolean(lastGoal?.isCurve)
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

        if (matchRecorder.isRecording) {
          matchRecorder.stop();
        }

        const frozen = frozenMatchSnapshot ?? buildMatchStatsSnapshot(winner, stats, mvp);
        frozenMatchSnapshot = null;

        gameApp.reportRankedMatchIfEligible({
          stadiumId: gameUI.selectedStadiumId || 'mediano',
          durationSeconds: Math.max(1, Number(frozen.snapshot.matchDuration || 1)),
          redScore: frozen.snapshot.redScore,
          blueScore: frozen.snapshot.blueScore,
          winner: frozen.snapshot.winner,
          stats: frozen.allStats,
          mvpPlayerId: frozen.theMVP?.playerId ?? null
        });

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
    renderer.setTeamKits(gameUI.redCaptainKit, gameUI.blueCaptainKit);

    let measuredChatWidth = 0;
    let measuredChatHeight = gameUI.chatHeight;
    let observedChatEl: Element | null = null;
    let chatResizeObserver: ResizeObserver | null = null;

    function syncChatBounds(): void {
      if (typeof document !== 'undefined') {
        const chatEl = document.querySelector('.hud-chat-container');
        if (chatEl) {
          const rect = chatEl.getBoundingClientRect();
          if (rect.width > 0) measuredChatWidth = Math.round(rect.width);
          if (rect.height > 0) measuredChatHeight = Math.round(rect.height);
          if (chatEl !== observedChatEl && typeof ResizeObserver !== 'undefined') {
            chatResizeObserver?.disconnect();
            observedChatEl = chatEl;
            chatResizeObserver = new ResizeObserver((entries) => {
              const entry = entries[0];
              if (!entry) return;
              const { width, height } = entry.contentRect;
              if (width > 0) measuredChatWidth = Math.round(width);
              if (height > 0) measuredChatHeight = Math.round(height);
              renderer.setChatBounds(measuredChatWidth, Math.max(measuredChatHeight, gameUI.chatHeight));
            });
            chatResizeObserver.observe(chatEl);
          }
        }
      }
      renderer.setChatBounds(measuredChatWidth, Math.max(measuredChatHeight, gameUI.chatHeight));
    }

    const handleResize = () => {
      if (canvasRef) {
        renderer.resize(window.innerWidth, window.innerHeight);
      }
      syncChatBounds();
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // 3. Captura y enrutamiento de inputs (Teclado + Clicks de Ratón + Puntero 360°)
    const keyState = new Map<string, boolean>();
    let dashTriggered = false;
    let mouseClientX = window.innerWidth / 2;
    let mouseClientY = window.innerHeight / 2;
    let hasMousePosition = false;

    const onPointerDown = () => {
      soundFX.ensureContext();
    };

    const onCanvasContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseClientX = e.clientX;
      mouseClientY = e.clientY;
      hasMousePosition = true;
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
        kb.focusBall.includes(code)
      );
    }

    function getLocalPlayerWorldPos(): { x: number; y: number } | null {
      const localId = gameUI.localPlayerId;
      if (localId <= 0) return null;
      if (gameUI.isHost && engine) {
        const p = engine.players.get(localId);
        if (p) return { x: p.pos.x, y: p.pos.y };
      } else {
        if (hasPredLocalPos) {
          return { x: currPredLocalPos.x, y: currPredLocalPos.y };
        }
        const snapDisc = currSnapshot?.discs?.find((d) => d.id === localId);
        if (snapDisc) return { x: snapDisc.x, y: snapDisc.y };
      }
      return null;
    }

    function computeLocalPlayerInput(consumeDash: boolean): PlayerInput {
      let mask = 0;
      const isInputActive = gameUI.currentScreen === 'IN_GAME' && gameUI.activeModal === 'NONE';
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (!isInputActive || isTyping) {
        keyState.clear();
        dashTriggered = false;
        gameUI.isFocusingBall = false;
        renderer.focusBallOnly = false;
        return { inputMask: isTyping ? INPUT_FLAG_TYPING : 0, aimAngle: null, aimThrottle: 0 };
      }

      const focusHeld = gameUI.keybinds.focusBall.some((k) => keyState.get(k));
      gameUI.isFocusingBall = focusHeld;
      renderer.focusBallOnly = focusHeld;

      if (gameUI.keybinds.kick.some((k) => keyState.get(k))) mask |= INPUT_FLAG_KICK;
      if (gameUI.keybinds.turbo.some((k) => keyState.get(k))) mask |= INPUT_FLAG_TURBO;

      if (dashTriggered) {
        mask |= INPUT_FLAG_DASH;
        if (consumeDash) {
          dashTriggered = false;
        }
      }

      if (gameUI.keybinds.curveLeft.some((k) => keyState.get(k))) {
        mask |= INPUT_FLAG_MAGNUS_LEFT;
      }
      if (gameUI.keybinds.curveRight.some((k) => keyState.get(k))) {
        mask |= INPUT_FLAG_MAGNUS_RIGHT;
      }

      if (gameUI.settings.movementMode === 'mouse') {
        const localPos = getLocalPlayerWorldPos();
        if (hasMousePosition && localPos) {
          const mouseWorld = renderer.clientToWorld(mouseClientX, mouseClientY);
          const vec = computeMouseMovementVector(localPos.x, localPos.y, mouseWorld.x, mouseWorld.y);
          if (vec.active) {
            mask |= INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE;
            return {
              inputMask: mask,
              aimAngle: vec.angle,
              aimThrottle: vec.throttle
            };
          }
        }
        return { inputMask: mask, aimAngle: null, aimThrottle: 0 };
      }

      if (gameUI.keybinds.up.some((k) => keyState.get(k))) mask |= INPUT_FLAG_UP;
      if (gameUI.keybinds.down.some((k) => keyState.get(k))) mask |= INPUT_FLAG_DOWN;
      if (gameUI.keybinds.left.some((k) => keyState.get(k))) mask |= INPUT_FLAG_LEFT;
      if (gameUI.keybinds.right.some((k) => keyState.get(k))) mask |= INPUT_FLAG_RIGHT;

      return { inputMask: mask, aimAngle: null, aimThrottle: 0 };
    }

    function dispatchImmediateGuestInput(): void {
      if (gameUI.isHost || !gameApp.networkClient) return;
      const pkt = computeLocalPlayerInput(false);
      const tick = predEngine ? predEngine.currentTick + 1 : clientTick;
      gameApp.networkClient.sendInput(pkt.inputMask ?? 0, tick, pkt.aimAngle, pkt.aimThrottle);
    }

    function hasAnyHeldInput(): boolean {
      if (dashTriggered || gameUI.isFocusingBall) return true;
      for (const pressed of keyState.values()) {
        if (pressed) return true;
      }
      return false;
    }

    function releaseAndFlushHeldInputs(): void {
      const hadHeld = hasAnyHeldInput();
      keyState.clear();
      dashTriggered = false;
      gameUI.isFocusingBall = false;
      renderer.focusBallOnly = false;
      const activeTag = typeof document !== 'undefined' ? document.activeElement?.tagName : '';
      if (hadHeld || activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        dispatchImmediateGuestInput();
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      soundFX.ensureContext();
      mouseClientX = e.clientX;
      mouseClientY = e.clientY;
      hasMousePosition = true;

      if (e.target !== canvasEl) return;
      if (gameUI.currentScreen !== 'IN_GAME' || gameUI.activeModal !== 'NONE') return;

      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isTyping) return;

      const code = mouseButtonToCode(e.button);
      if (!code) return;

      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
      }

      if (gameUI.keybinds.dash.includes(code)) {
        dashTriggered = true;
      }

      const wasDown = Boolean(keyState.get(code));
      keyState.set(code, true);
      if (!wasDown && isGameplayBindCode(code)) {
        dispatchImmediateGuestInput();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const code = mouseButtonToCode(e.button);
      if (!code) return;
      if (gameUI.keybinds.dash.includes(code)) {
        dashTriggered = false;
      }
      const wasDown = Boolean(keyState.get(code));
      if (wasDown) {
        keyState.set(code, false);
        if (isGameplayBindCode(code)) {
          dispatchImmediateGuestInput();
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      soundFX.ensureContext();

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        return;
      }

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

      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isTyping) {
        return;
      }

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

      if (
        gameUI.currentScreen === 'IN_GAME' &&
        gameUI.activeModal === 'NONE' &&
        gameUI.keybinds.focusBall.includes(e.code)
      ) {
        e.preventDefault();
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

    const onWindowBlur = () => {
      releaseAndFlushHeldInputs();
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        releaseAndFlushHeldInputs();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        releaseAndFlushHeldInputs();
      }
    };

    canvasEl.addEventListener('contextmenu', onCanvasContextMenu);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focusin', onFocusIn);

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

    function syncHudTelemetryFromSnapshot(snap: GameStateSnapshot): void {
      const rScore = snap.redScore ?? 0;
      if (gameUI.redScore !== rScore) gameUI.redScore = rScore;
      const bScore = snap.blueScore ?? 0;
      if (gameUI.blueScore !== bScore) gameUI.blueScore = bScore;

      const phase = snap.phase ?? 0;
      if (phase === MatchPhase.STOP || phase === 0) {
        if (gameUI.matchTimerSeconds !== 0) gameUI.matchTimerSeconds = 0;
        if (gameUI.matchTimeFormatted !== '00:00') gameUI.matchTimeFormatted = '00:00';
        if (gameUI.isGoldenGoal) gameUI.isGoldenGoal = false;
      } else {
        const golden = Boolean(snap.isGoldenGoal);
        if (gameUI.isGoldenGoal !== golden) gameUI.isGoldenGoal = golden;
        const totalSec = snap.matchTimer ?? 0;
        if (gameUI.matchTimerSeconds !== totalSec) {
          gameUI.matchTimerSeconds = totalSec;
          const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
          const secs = (totalSec % 60).toString().padStart(2, '0');
          const fmt = `${mins}:${secs}`;
          if (gameUI.matchTimeFormatted !== fmt) gameUI.matchTimeFormatted = fmt;
        }
      }
      gameUI.handleMatchPhaseTransition(phase);
    }

    const handleAuthoritativeSnapshot = (snap: GameStateSnapshot) => {
      if (!gameUI.isHost && matchRecorder.isRecording) {
        if (snap.redScore > lastObservedGuestRedScore) {
          matchRecorder.recordGoal({
            scoringTeam: 'red',
            scorerName: 'Equipo Rojo',
            redScore: snap.redScore,
            blueScore: snap.blueScore
          });
        } else if (snap.blueScore > lastObservedGuestBlueScore) {
          matchRecorder.recordGoal({
            scoringTeam: 'blue',
            scorerName: 'Equipo Azul',
            redScore: snap.redScore,
            blueScore: snap.blueScore
          });
        }
      }
      lastObservedGuestRedScore = snap.redScore ?? 0;
      lastObservedGuestBlueScore = snap.blueScore ?? 0;

      currSnapshot = snap;
      syncHudTelemetryFromSnapshot(snap);
      if (!predEngine && !gameUI.isHost) {
        predEngine = new EngineInstance(gameUI.selectedStadiumId || 'mediano');
        predEngine.applyModifiers(gameUI.physicsModifiers);
      }
      if (predEngine && gameUI.localPlayerId > 0) {
        syncEngineMatchLimits(predEngine);
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

    const guestLocalInputMap = new Map<number, PlayerInput>();
    const hostSimulationInputs = new Map<number, PlayerInput>();
    let wasModalOpen = gameUI.activeModal !== 'NONE';

    const simTicker = new SimulationTicker((now) => {
      lastSimTimestamp = now;
      const isModalOpen = gameUI.activeModal !== 'NONE';
      if (!wasModalOpen && isModalOpen) {
        releaseAndFlushHeldInputs();
      }
      wasModalOpen = isModalOpen;
      const localPkt = computeLocalPlayerInput(true);

      if (!gameUI.isHost) {
        // Guest: Predicción local a 60 Hz + envío de input (9 o 12 bytes) por canal no confiable
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
            syncEngineMatchLimits(predEngine);
            const localDiscBefore = predEngine.players.get(gameUI.localPlayerId)!;
            prevPredLocalPos.x = localDiscBefore.pos.x;
            prevPredLocalPos.y = localDiscBefore.pos.y;

            const nextTick = (predEngine.currentTick + 1) >>> 0;
            const localMask = localPkt.inputMask ?? 0;
            reconciler.recordInput(nextTick, localMask, localPkt.aimAngle, localPkt.aimThrottle);
            gameApp.networkClient.sendInput(
              localMask,
              nextTick,
              localPkt.aimAngle,
              localPkt.aimThrottle
            );

            (localPkt as any).sequence = nextTick;
            guestLocalInputMap.clear();
            guestLocalInputMap.set(gameUI.localPlayerId, localPkt);
            predEngine.step(guestLocalInputMap);

            const localDiscAfter = predEngine.players.get(gameUI.localPlayerId);
            if (localDiscAfter) {
              currPredLocalPos.x = localDiscAfter.pos.x;
              currPredLocalPos.y = localDiscAfter.pos.y;
              hasPredLocalPos = true;
            }
            clientTick = predEngine.currentTick;
          } else {
            const nextTick = (++clientTick) >>> 0;
            gameApp.networkClient.sendInput(
              localPkt.inputMask ?? 0,
              nextTick,
              localPkt.aimAngle,
              localPkt.aimThrottle
            );
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
        // Host: Sincronizar jugadores, límites y procesar física autoritativa
        syncEnginePlayers();
        syncEngineMatchLimits(engine);
        hostSimulationInputs.clear();
        hostSimulationInputs.set(gameUI.localPlayerId, localPkt);
        for (const [rId, rInput] of gameApp.remoteInputs.entries()) {
          hostSimulationInputs.set(rId, rInput);
        }

        prevSnapshot = currSnapshot;
        engine.step(hostSimulationInputs);
        currSnapshot = engine.getState();

        // Broadcast snapshot autoritativo a todos los peers conectados
        const snapBuffer = BinaryProtocol.encodeSnapshot(currSnapshot);
        gameApp.networkHost?.broadcastSnapshot(snapBuffer);
      }
    });

    simTicker.start();

    let frameCount = 0;
    let lastFpsCalculation = performance.now();
    let lastRenderFrameTime = performance.now();
    let wasRecordingPrevFrame = false;
    const scratchRenderSnapshot: GameStateSnapshot = {
      tick: 0,
      phase: 0,
      matchTimer: 0,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: []
    };
    const scratchDiscs: CompactDiscState[] = [];

    function syncRecorderMetadata(): void {
      if (!matchRecorder.isRecording) return;
      const r = renderer as any;
      const effectiveZoom =
        typeof r.getEffectiveZoom === 'function'
          ? r.getEffectiveZoom()
          : renderer.camera.scale !== 1.0
            ? renderer.camera.scale
            : renderer.camera.zoom !== 1.0
              ? renderer.camera.zoom
              : renderer.scale || gameUI.settings.cameraZoom || 1.0;
      const viewportWidth = canvasEl.clientWidth || canvasEl.width || window.innerWidth || 1280;
      const viewportHeight = canvasEl.clientHeight || canvasEl.height || window.innerHeight || 720;
      matchRecorder.updateMetadata({
        roomName: gameUI.activeRoom?.name || gameUI.activeRoomName || 'Partida LegacyX-GO',
        stadiumId: gameUI.selectedStadiumId || 'mediano',
        redKit: gameUI.redCaptainKit as unknown as Record<string, unknown>,
        blueKit: gameUI.blueCaptainKit as unknown as Record<string, unknown>,
        recordingPlayerId: gameUI.localPlayerId ?? null,
        recordingPlayerName: gameUI.nickname || userProfile.username || '',
        cameraZoom: effectiveZoom,
        viewportWidth,
        viewportHeight,
        timeLimitSeconds: Math.max(0, Number(gameUI.timeLimitMinutes ?? 3)) * 60,
        players: gameUI.rosterPlayers.map((rp) => ({
          id: rp.id,
          nickname: rp.nickname || rp.name || `P${rp.id}`,
          team: rp.team,
          avatar: rp.avatar,
          avatarType: rp.avatarType,
          number: rp.number
        }))
      });
    }

    function renderLoop(currentTime: number): void {
      const now = currentTime || performance.now();
      const frameDt = Math.max(0.001, Math.min(0.1, (now - lastRenderFrameTime) / 1000));
      lastRenderFrameTime = now;

      // Interpolación lineal libre en Canvas 2D
      const alpha = Math.max(0, Math.min(1.0, (currentTime - lastSimTimestamp) / FIXED_DT_MS));

      // Sincronizar cámara, zoom y proyección 2D
      renderer.camera.setZoom(gameUI.settings.cameraZoom || 1.0);
      renderer.scale = renderer.camera.zoom;
      renderer.focusBallOnly = gameUI.isFocusingBall;

      // Sincronizar ajustes reactivos del minimapa y chat en el renderer
      const sz = gameUI.settings.minimapSize;
      const minimapPxWidth =
        sz === 'small' || sz === 160 ? 160 : sz === 'large' || sz === 280 || sz === 240 ? 280 : 220;
      renderer.minimapEnabled = gameUI.settings.minimapEnabled !== false;
      renderer.minimapOpacity = (gameUI.settings.minimapOpacity ?? 60) / 100;
      renderer.minimapSize = minimapPxWidth;
      renderer.minimapCameraFrustum = gameUI.settings.minimapCameraFrustum;
      renderer.setChatBounds(measuredChatWidth, Math.max(measuredChatHeight, gameUI.chatHeight));
      renderer.screenShakeEnabled = gameUI.screenShake;
      renderer.setExtrapolation(gameUI.extrapolationMs);
      renderer.discRenderer.dampingBall = gameUI.modifiers.ballFriction ?? gameUI.modifiers.pitchFriction ?? 0.99;
      renderer.discRenderer.dampingPlayer = gameUI.modifiers.playerFriction ?? 0.96;
      renderer.setGoalNets(gameUI.isHost && engine ? engine.world.goalNets : null);

      // Sincronizar equipaciones de los capitanes, balón y VFX en tiempo real
      const redActiveKit = gameUI.redCaptainKit;
      const blueActiveKit = gameUI.blueCaptainKit;
      renderer.setTeamKits(redActiveKit, blueActiveKit);
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
        reconciler.updateVisualSmoothing(frameDt);
        const interpSnap =
          gameApp.networkClient.getInterpolatedState(currentTime) ??
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

            scratchDiscs.length = 0;
            const inDiscs = interpSnap.discs;
            for (let i = 0; i < inDiscs.length; i++) {
              const d = inDiscs[i]!;
              if (d.id === localId) {
                const predRt = (predEngine as any).getRuntime?.(localId);
                scratchDiscs.push({
                  id: d.id,
                  team: d.team,
                  x: predX,
                  y: predY,
                  vx: predDisc.vel.x,
                  vy: predDisc.vel.y,
                  flags: predFlags || d.flags,
                  stamina: predDisc.stamina,
                  spin: d.spin,
                  dashTimer: predRt?.ticksRemaining ?? 0,
                  dashCooldown: predRt?.cooldownTimer ?? 0,
                  lastAckedInputSeq: d.lastAckedInputSeq
                });
              } else {
                scratchDiscs.push(d);
              }
            }

            scratchRenderSnapshot.tick = interpSnap.tick;
            scratchRenderSnapshot.phase = interpSnap.phase;
            scratchRenderSnapshot.matchTimer = interpSnap.matchTimer;
            scratchRenderSnapshot.redScore = interpSnap.redScore;
            scratchRenderSnapshot.blueScore = interpSnap.blueScore;
            scratchRenderSnapshot.soundMask = interpSnap.soundMask ?? 0;
            scratchRenderSnapshot.kickoffActive = interpSnap.kickoffActive;
            scratchRenderSnapshot.isGoldenGoal = interpSnap.isGoldenGoal;
            scratchRenderSnapshot.isNeutralKickoff = interpSnap.isNeutralKickoff;
            scratchRenderSnapshot.kickoffPossessingTeam = interpSnap.kickoffPossessingTeam;
            scratchRenderSnapshot.discs = scratchDiscs;
            renderSnap = scratchRenderSnapshot;
          }
          currSnapshot = renderSnap;
          prevSnapshot = renderSnap;
          if (matchRecorder.isRecording && !wasRecordingPrevFrame) {
            lastRecordedBannerSig = '';
            syncRecorderMetadata();
            if (gameUI.activeBanner && gameUI.activeBanner.kind !== 'NONE') {
              gameUI.onBannerApplied?.(gameUI.activeBanner);
            }
          }
          renderer.render(renderSnap, renderSnap, 1.0, gameUI.localPlayerId);
          if (matchRecorder.isRecording) {
            matchRecorder.recordFrame(renderSnap);
          }
        }
      } else if (currSnapshot && currSnapshot.discs) {
        if (matchRecorder.isRecording && !wasRecordingPrevFrame) {
          lastRecordedBannerSig = '';
          syncRecorderMetadata();
          if (gameUI.activeBanner && gameUI.activeBanner.kind !== 'NONE') {
            gameUI.onBannerApplied?.(gameUI.activeBanner);
          }
        }
        renderer.render(prevSnapshot, currSnapshot, alpha, gameUI.localPlayerId);
        if (matchRecorder.isRecording) {
          matchRecorder.recordFrame(currSnapshot);
        }
      }
      wasRecordingPrevFrame = matchRecorder.isRecording;

      // Actualizar telemetría reactiva en UI
      frameCount++;
      if (currentTime - lastFpsCalculation >= 500) {
        gameUI.fps = Math.round((frameCount * 1000) / (currentTime - lastFpsCalculation));
        frameCount = 0;
        lastFpsCalculation = currentTime;
        syncChatBounds();

        if (matchRecorder.isRecording) {
          syncRecorderMetadata();
        }

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
            gameUI.matchTimerSeconds = 0;
            if (gameUI.isGoldenGoal) gameUI.isGoldenGoal = false;
            gameUI.handleMatchPhaseTransition(0);
          } else {
            const isGolden = Boolean(
              currSnapshot.isGoldenGoal ?? (gameUI.isHost && engine ? engine.fsm.isOvertime : gameUI.isGoldenGoal)
            );
            if (gameUI.isGoldenGoal !== isGolden) {
              gameUI.isGoldenGoal = isGolden;
            }
            const totalSec = currSnapshot.matchTimer ?? (engine ? Math.floor(engine.fsm.matchTicksElapsed / 60) : 0);
            gameUI.matchTimerSeconds = totalSec;
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
      if (matchRecorder.isRecording) {
        matchRecorder.stop();
      }
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
      gameApp.onScoreEventReceived = null;
      gameUI.onTriggerShake = null;
      gameUI.onChatAdded = undefined;
      gameUI.onBannerApplied = undefined;
      gameUI.isFocusingBall = false;
      chatResizeObserver?.disconnect();
      chatResizeObserver = null;
      cancelAnimationFrame(animFrameId);
      canvasEl.removeEventListener('contextmenu', onCanvasContextMenu);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focusin', onFocusIn);
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
    {:else if (gameUI.activeModal === 'REPLAY_VIEWER' || gameUI.activeModal === 'replayViewer') && userProfile.isAuthenticated && !userProfile.isGuest}
      <ReplayViewerModal />
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
