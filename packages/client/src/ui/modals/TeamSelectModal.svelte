<script lang="ts">
  import {
    gameUI,
    type TeamSlot,
    type RosterPlayer,
    type MatchStatsSnapshot,
    type PlayerStatEntry
  } from '../state/gameUI.svelte';
  import { type PlayerPosition, PLAYER_POSITIONS } from '@legacyx/core';
  import { soundFX } from '../../audio/SoundFX';
  import { gameApp } from '../../net/GameApp';
  import StadiumPreviewCanvas from '../components/StadiumPreviewCanvas.svelte';
  import { getKitPatternCss } from '../utils/kitPatterns.js';

  let {
    onStartMatch = () => {},
    onStopMatch = () => {},
    onTogglePause = () => {},
    onLeaveRoom = () => {},
    onTeamChange = (_playerId: number, _team: TeamSlot) => {}
  }: {
    onStartMatch?: () => void;
    onStopMatch?: () => void;
    onTogglePause?: () => void;
    onLeaveRoom?: () => void;
    onTeamChange?: (playerId: number, team: TeamSlot) => void;
  } = $props();

  const RED_ZONE_ORDER: readonly PlayerPosition[] = ['GK', 'DFC', 'MC', 'ST'];
  const BLUE_ZONE_ORDER: readonly PlayerPosition[] = ['ST', 'MC', 'DFC', 'GK'];

  const POSITION_META: Record<PlayerPosition, { label: string; title: string }> = {
    GK: { label: 'GK', title: 'Portero' },
    DFC: { label: 'DFC', title: 'Defensa' },
    MC: { label: 'MC', title: 'Mediocampista' },
    ST: { label: 'ST', title: 'Delantero' }
  };

  // Solo se puede mostrar STATS en escritorio si el partido está detenido y hay estadísticas de un partido concluido
  let canShowStats = $derived(
    gameUI.matchPhase === 0 && gameUI.hasCompletedMatch === true && gameUI.lastMatchStats !== null
  );

  // Ajustes de Sala es visible y deslizable siempre, PERO únicamente para Admins y Host
  let canSeeRoomSettings = $derived(gameUI.isAdmin || gameUI.isHost);

  // Slides: 0 = STATS, 1 = LISTA DE JUGADORES, 2 = AJUSTES DE SALA (Solo Admins), 3 = CHAT (Móvil)
  let desktopActiveSlide = $state<0 | 1 | 2>(
    gameUI.activeSlide === 'STATS' ? 0 : 1
  );
  let mobileActiveSlide = $state<0 | 1 | 2 | 3>(
    gameUI.activeSlide === 'STATS' ? 0 : 1
  );

  $effect(() => {
    if (gameUI.isMobileLayout) {
      if (gameUI.activeSlide === 'STATS' && mobileActiveSlide !== 0) {
        mobileActiveSlide = 0;
      } else if (gameUI.activeSlide === 'MENU' && mobileActiveSlide === 0) {
        mobileActiveSlide = 1;
      }
      if (!canSeeRoomSettings && mobileActiveSlide === 2) {
        mobileActiveSlide = 1;
      }
    } else {
      if (gameUI.activeSlide === 'STATS' && canShowStats) {
        desktopActiveSlide = 0;
      } else if (desktopActiveSlide === 0 && (!canShowStats || gameUI.activeSlide === 'MENU')) {
        desktopActiveSlide = 1;
      }
      if (!canSeeRoomSettings && desktopActiveSlide === 2) {
        desktopActiveSlide = 1;
      }
    }
  });

  let chatSlideIndex = 3 as const;

  let currentSlide = $derived<0 | 1 | 2 | 3>(
    gameUI.isMobileLayout
      ? (!canSeeRoomSettings && mobileActiveSlide === 2 ? 1 : mobileActiveSlide)
      : canShowStats && desktopActiveSlide === 0
        ? 0
        : canSeeRoomSettings && desktopActiveSlide === 2
          ? 2
          : 1
  );

  let menuChatInput = $state('');
  let menuChatInputEl = $state<HTMLInputElement | null>(null);
  let menuChatScrollEl = $state<HTMLDivElement | null>(null);
  let lastSeenChatCount = $state(gameUI.chatMessages.length);
  let unreadChatCount = $derived(
    currentSlide === chatSlideIndex ? 0 : Math.max(0, gameUI.chatMessages.length - lastSeenChatCount)
  );
  let mobilePingClass = $derived(
    gameUI.pingMs < 60 ? 'is-good' : gameUI.pingMs <= 120 ? 'is-mid' : 'is-high'
  );

  $effect(() => {
    const count = gameUI.chatMessages.length;
    if (gameUI.isMobileLayout && currentSlide === chatSlideIndex) {
      lastSeenChatCount = count;
      if (menuChatScrollEl) {
        menuChatScrollEl.scrollTop = menuChatScrollEl.scrollHeight;
      }
    }
  });

  function goToSlide(slide: 0 | 1 | 2 | 3) {
    if (slide === 2 && !canSeeRoomSettings) {
      if (gameUI.isMobileLayout) {
        mobileActiveSlide = 3;
        soundFX.playUIClick();
        lastSeenChatCount = gameUI.chatMessages.length;
      }
      return;
    }
    if (!gameUI.isMobileLayout) {
      if (slide === 3) return;
      if (slide === 0 && !canShowStats) return;
      desktopActiveSlide = slide as 0 | 1 | 2;
    } else {
      mobileActiveSlide = slide;
    }
    soundFX.playUIClick();
    if (slide === 0) {
      gameUI.activeSlide = 'STATS';
      gameUI.activeModal = 'STATS';
    } else {
      gameUI.activeSlide = 'MENU';
      gameUI.activeModal = 'TEAM_SELECT';
    }
    if (gameUI.isMobileLayout && slide === chatSlideIndex) {
      lastSeenChatCount = gameUI.chatMessages.length;
    }
  }

  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeTracking = false;

  function handleCorridorTouchStart(e: TouchEvent) {
    if (!gameUI.isMobileLayout || e.touches.length !== 1) return;
    if (draggedPlayerId !== null || pointerDragPlayerId !== null) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, .room-slider, .player-slot-card, .pitch-player-token, .bench-seat-slot')) {
      swipeTracking = false;
      return;
    }
    const t = e.touches[0]!;
    swipeStartX = t.clientX;
    swipeStartY = t.clientY;
    swipeTracking = true;
  }

  function handleCorridorTouchEnd(e: TouchEvent) {
    if (!swipeTracking) return;
    swipeTracking = false;
    if (!gameUI.isMobileLayout || draggedPlayerId !== null || pointerDragPlayerId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - swipeStartX;
    const dy = t.clientY - swipeStartY;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;

    const validOrder: Array<0 | 1 | 2 | 3> = canSeeRoomSettings ? [0, 1, 2, 3] : [0, 1, 3];
    const curIdx = validOrder.indexOf(currentSlide);
    if (curIdx === -1) return;
    if (dx < 0 && curIdx < validOrder.length - 1) {
      goToSlide(validOrder[curIdx + 1]!);
    } else if (dx > 0 && curIdx > 0) {
      goToSlide(validOrder[curIdx - 1]!);
    }
  }

  function handleSendMenuChat(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = menuChatInput.trim();
    if (!trimmed) return;
    gameUI.sendChatMessage(trimmed);
    menuChatInput = '';
    lastSeenChatCount = gameUI.chatMessages.length;
    menuChatInputEl?.blur();
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  let expandedPlayers = $state<Set<string>>(new Set());

  function getPlayerStatKey(team: 'red' | 'blue', idx: number, player: PlayerStatEntry): string {
    const rawId = (player as any).playerId ?? (player as any).id;
    return String(rawId ?? `${team}:${idx}:${player.nickname || (player as any).playerName || ''}`);
  }

  function isTeamAllExpanded(team: 'red' | 'blue'): boolean {
    const list = team === 'red' ? gameUI.redTeamStats : gameUI.blueTeamStats;
    if (list.length === 0) return false;
    return list.every((player, idx) => expandedPlayers.has(getPlayerStatKey(team, idx, player)));
  }

  function toggleAccordion(key: string) {
    soundFX.playUIClick();
    const next = new Set(expandedPlayers);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedPlayers = next;
  }

  function toggleAllTeam(team: 'red' | 'blue') {
    soundFX.playUIClick();
    const list = team === 'red' ? gameUI.redTeamStats : gameUI.blueTeamStats;
    if (list.length === 0) return;
    const allExpanded = isTeamAllExpanded(team);
    const next = new Set(expandedPlayers);
    list.forEach((player, idx) => {
      const key = getPlayerStatKey(team, idx, player);
      if (allExpanded) next.delete(key);
      else next.add(key);
    });
    expandedPlayers = next;
  }

  let copyStatus = $state<'idle' | 'copied'>('idle');

  // Orden estricta por orden de unión al equipo (primero que se unió = índice 0 = Capitán)
  let redPlayers = $derived(gameUI.getTeamPlayers('red'));
  let specPlayers = $derived(gameUI.getTeamPlayers('spectator'));
  let bluePlayers = $derived(gameUI.getTeamPlayers('blue'));

  let localPlayer = $derived(gameUI.players.find((p) => p.id === gameUI.localPlayerId));
  let localTeam = $derived<TeamSlot>(localPlayer?.team ?? gameUI.myTeam);
  let canSwitchOwnTeam = $derived(!gameUI.teamsLocked || gameUI.isAdmin || gameUI.isHost);

  function resolvePlayerZone(p: RosterPlayer, idxInTeam: number): PlayerPosition {
    if (p.position && PLAYER_POSITIONS.includes(p.position)) {
      return p.position;
    }
    if (idxInTeam === 0) return 'GK';
    if (idxInTeam === 1) return 'DFC';
    if (idxInTeam === 2) return 'MC';
    return 'ST';
  }

  function getZonePlayers(players: RosterPlayer[], zone: PlayerPosition): RosterPlayer[] {
    return players.filter((p, idx) => resolvePlayerZone(p, idx) === zone);
  }

  function computeFormationLabel(players: RosterPlayer[]): string {
    if (players.length === 0) return '0 - 0 - 0';
    let dfc = 0;
    let mc = 0;
    let st = 0;
    players.forEach((p, idx) => {
      const zone = resolvePlayerZone(p, idx);
      if (zone === 'DFC') dfc++;
      else if (zone === 'MC') mc++;
      else if (zone === 'ST') st++;
    });
    return `${dfc} - ${mc} - ${st}`;
  }

  let canManageBots = $derived(
    (gameUI.isPracticeMode || gameUI.isHost) && gameUI.roomType !== 'ranked'
  );
  let canClearTeams = $derived(gameUI.isPracticeMode || gameUI.isHost || gameUI.isAdmin);
  let showRedControls = $state(true);
  let showBlueControls = $state(true);
  let redFormation = $derived(computeFormationLabel(redPlayers));
  let blueFormation = $derived(computeFormationLabel(bluePlayers));

  function botDifficultyLabel(diff?: 'easy' | 'medium' | 'hard'): string {
    if (diff === 'easy') return 'FÁC';
    if (diff === 'hard') return 'DIF';
    return 'MED';
  }

  function handleAddBotTo(team: 'red' | 'blue') {
    if (!canManageBots) return;
    gameUI.addBotToTeam(team, 'medium');
  }

  function handleClearTeamList(team: 'red' | 'blue') {
    if (!canClearTeams) return;
    gameUI.clearTeam(team);
  }

  function handleQuickJoinTeam(targetTeam: TeamSlot) {
    if (localTeam === targetTeam || !canSwitchOwnTeam) return;
    soundFX.playUIClick();
    if (gameUI.changeTeam(gameUI.localPlayerId, targetTeam)) {
      onTeamChange(gameUI.localPlayerId, targetTeam);
    }
  }

  let redCaptain = $derived(redPlayers[0] ?? null);
  let blueCaptain = $derived(bluePlayers[0] ?? null);
  let redActiveKit = $derived(gameUI.redCaptainKit);
  let blueActiveKit = $derived(gameUI.blueCaptainKit);

  let redTeamName = $derived(redPlayers.length > 0 ? (redActiveKit?.name || 'ROJO') : 'ROJO');
  let redTeamTag = $derived(redPlayers.length > 0 ? (redActiveKit?.tag || 'RED') : 'RED');
  let redPrimaryColor = $derived(redActiveKit?.primaryColor || gameUI.redTeamKit?.primaryColor || '#e74c3c');
  let redSecondaryColor = $derived(redActiveKit?.secondaryColor || gameUI.redTeamKit?.secondaryColor || '#b02a1c');
  let redKitTertiary = $derived(redActiveKit?.tertiaryColor || gameUI.redTeamKit?.tertiaryColor || '#ffffff');
  let redHasOutline = $derived(
    Boolean(redActiveKit?.outline === true || redActiveKit?.hasOutline === true)
  );

  let blueTeamName = $derived(bluePlayers.length > 0 ? (blueActiveKit?.name || 'AZUL') : 'AZUL');
  let blueTeamTag = $derived(bluePlayers.length > 0 ? (blueActiveKit?.tag || 'BLU') : 'BLU');
  let bluePrimaryColor = $derived(blueActiveKit?.primaryColor || gameUI.blueTeamKit?.primaryColor || '#3498db');
  let blueSecondaryColor = $derived(blueActiveKit?.secondaryColor || gameUI.blueTeamKit?.secondaryColor || '#217dbb');
  let blueKitTertiary = $derived(blueActiveKit?.tertiaryColor || gameUI.blueTeamKit?.tertiaryColor || '#ffffff');
  let blueHasOutline = $derived(
    Boolean(blueActiveKit?.outline === true || blueActiveKit?.hasOutline === true)
  );

  let redResolvedKit = $derived(redActiveKit ?? gameUI.redTeamKit);
  let blueResolvedKit = $derived(blueActiveKit ?? gameUI.blueTeamKit);
  let redKitBg = $derived(getKitPatternCss(redResolvedKit, redPrimaryColor));
  let blueKitBg = $derived(getKitPatternCss(blueResolvedKit, bluePrimaryColor));

  let matchStatsSnapshot = $derived<MatchStatsSnapshot | null>(
    gameUI.lastMatchStats && !Array.isArray(gameUI.lastMatchStats)
      ? (gameUI.lastMatchStats as MatchStatsSnapshot)
      : null
  );
  let matchRedScore = $derived(matchStatsSnapshot ? matchStatsSnapshot.redScore : gameUI.redScore);
  let matchBlueScore = $derived(matchStatsSnapshot ? matchStatsSnapshot.blueScore : gameUI.blueScore);
  let matchDurationFormatted = $derived.by(() => {
    if (matchStatsSnapshot && Number.isFinite(matchStatsSnapshot.matchDuration)) {
      const secs = Math.max(0, Math.floor(matchStatsSnapshot.matchDuration));
      return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    }
    return gameUI.matchTimeFormatted;
  });

  let isRedCaptainOrAdmin = $derived(
    gameUI.isHost || gameUI.isAdmin || (gameUI.allowCaptainKitSwitch && redCaptain && redCaptain.id === gameUI.localPlayerId)
  );
  let isBlueCaptainOrAdmin = $derived(
    gameUI.isHost || gameUI.isAdmin || (gameUI.allowCaptainKitSwitch && blueCaptain && blueCaptain.id === gameUI.localPlayerId)
  );

  function handleSetRedKitVariant(variant: 'home' | 'away') {
    if (!isRedCaptainOrAdmin) return;
    soundFX.playUIClick();
    gameUI.setRedKitVariant(variant);
    gameApp.setKitVariant('red', variant);
  }

  function handleSetBlueKitVariant(variant: 'home' | 'away') {
    if (!isBlueCaptainOrAdmin) return;
    soundFX.playUIClick();
    gameUI.setBlueKitVariant(variant);
    gameApp.setKitVariant('blue', variant);
  }

  let isMatchStopped = $derived(
    gameUI.fsmPhase === 'STOPPED' ||
    gameUI.matchPhase === 0 ||
    gameUI.matchState === 'STOPPED' ||
    gameUI.matchState === 'STATS'
  );
  let isMatchPaused = $derived(gameUI.fsmPhase === 'PAUSED' || gameUI.matchPhase === 2.1);
  let isResumeCountdown = $derived(
    gameUI.fsmPhase === 'RESUME_COUNTDOWN' || gameUI.matchPhase === 2.2
  );
  let isPauseLocked = $derived(
    isResumeCountdown ||
      gameUI.fsmPhase === 'PRE_MATCH_VS' ||
      gameUI.fsmPhase === 'START_COUNTDOWN' ||
      gameUI.fsmPhase === 'GOAL' ||
      gameUI.fsmPhase === 'CELEBRATION'
  );
  let canClose = $derived(!gameUI.isTeamSelectForcedOpen && gameUI.matchPhase !== 0);

  let isRoomPublic = $state(gameUI.activeRoom ? !gameUI.activeRoom.isPrivate : true);
  let roomPassword = $state(gameUI.activeRoom?.password || '');

  // ==========================================
  // DRAG & DROP DE EQUIPOS / ZONAS Y PERMISOS DE CAPITÁN
  // ==========================================
  let draggedPlayerId = $state<number | null>(null);
  let dragOverTeam = $state<TeamSlot | null>(null);
  let dragOverZone = $state<{ team: 'red' | 'blue'; pos: PlayerPosition } | null>(null);
  let wasDragged = $state(false);
  let dragStartTime = 0;

  // Pointer Events touch drag state
  let pointerDragPlayerId = $state<number | null>(null);
  let pointerDragId = $state<number | null>(null);
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerHasMoved = false;
  const POINTER_DRAG_THRESHOLD_PX = 10;

  function isLocalCaptainOf(team: TeamSlot): boolean {
    if (team !== 'red' && team !== 'blue') return false;
    const cap = team === 'red' ? redCaptain : blueCaptain;
    return Boolean(cap && cap.id === gameUI.localPlayerId);
  }

  function canDragPlayer(player: RosterPlayer): boolean {
    if (gameUI.isAdmin || gameUI.isHost) return true;
    // El capitán puede organizar jugadores que YA estén dentro de su propio equipo (entre las 4 zonas)
    if ((player.team === 'red' || player.team === 'blue') && isLocalCaptainOf(player.team)) {
      return true;
    }
    if (!gameUI.teamsLocked && player.id === gameUI.localPlayerId) return true;
    return false;
  }

  function resolveDropTargetAtPoint(
    clientX: number,
    clientY: number
  ): { team: TeamSlot | null; zone: PlayerPosition | null } {
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
      return { team: null, zone: null };
    }
    const hitEl = document.elementFromPoint(clientX, clientY);
    const zoneEl = hitEl?.closest?.('[data-zone-team]') as HTMLElement | null;
    if (zoneEl) {
      const zTeam = zoneEl.dataset.zoneTeam;
      const zPos = zoneEl.dataset.zonePos as PlayerPosition | undefined;
      if ((zTeam === 'red' || zTeam === 'blue') && zPos && PLAYER_POSITIONS.includes(zPos)) {
        return { team: zTeam, zone: zPos };
      }
    }
    const colEl = hitEl?.closest?.('[data-team-column]') as HTMLElement | null;
    const raw = colEl?.dataset?.teamColumn;
    if (raw === 'red' || raw === 'spectator' || raw === 'blue') {
      return { team: raw, zone: null };
    }
    return { team: null, zone: null };
  }

  function applyDropMove(player: RosterPlayer, targetTeam: TeamSlot | null, targetZone: PlayerPosition | null) {
    if (!targetTeam) return;
    if (targetTeam === player.team && targetZone && (targetTeam === 'red' || targetTeam === 'blue')) {
      gameUI.changePlayerPosition(player.id, targetZone);
      return;
    }
    if (targetTeam !== player.team) {
      // Un capitán no-admin NO puede cambiar de equipo ni meter espectadores ni tocar rivales
      if (!gameUI.isAdmin && !gameUI.isHost && player.id !== gameUI.localPlayerId) {
        return;
      }
      soundFX.playUIClick();
      if (gameUI.changeTeam(player.id, targetTeam)) {
        onTeamChange(player.id, targetTeam);
        if (targetZone && (targetTeam === 'red' || targetTeam === 'blue')) {
          gameUI.changePlayerPosition(player.id, targetZone);
        }
      }
    }
  }

  function handlePlayerPointerDown(e: PointerEvent, player: RosterPlayer) {
    if (!canDragPlayer(player)) return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    pointerDragPlayerId = player.id;
    pointerDragId = e.pointerId;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerHasMoved = false;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
    }
  }

  function handlePlayerPointerMove(e: PointerEvent, player: RosterPlayer) {
    if (pointerDragPlayerId !== player.id) return;
    if (pointerDragId !== null && e.pointerId !== pointerDragId) return;

    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;
    if (!pointerHasMoved && Math.hypot(dx, dy) <= POINTER_DRAG_THRESHOLD_PX) {
      return;
    }

    if (!pointerHasMoved) {
      pointerHasMoved = true;
      draggedPlayerId = player.id;
      wasDragged = true;
      dragStartTime = Date.now();
      (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
    }

    const hit = resolveDropTargetAtPoint(e.clientX, e.clientY);
    dragOverTeam = hit.team;
    dragOverZone = hit.zone && (hit.team === 'red' || hit.team === 'blue')
      ? { team: hit.team, pos: hit.zone }
      : null;
  }

  function handlePlayerPointerUp(e: PointerEvent, player: RosterPlayer) {
    if (pointerDragPlayerId !== player.id) return;
    if (pointerDragId !== null && e.pointerId !== pointerDragId) return;

    if (pointerHasMoved) {
      const hit = resolveDropTargetAtPoint(e.clientX, e.clientY);
      const targetTeam = hit.team ?? dragOverTeam;
      const targetZone = hit.zone ?? dragOverZone?.pos ?? null;
      dragOverTeam = null;
      dragOverZone = null;
      draggedPlayerId = null;
      applyDropMove(player, targetTeam, targetZone);
      dragStartTime = Date.now();
      setTimeout(() => {
        wasDragged = false;
      }, 150);
    }

    (e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);
    pointerDragPlayerId = null;
    pointerDragId = null;
    pointerHasMoved = false;
  }

  function handlePlayerPointerCancel(e: PointerEvent) {
    (e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);
    pointerDragPlayerId = null;
    pointerDragId = null;
    pointerHasMoved = false;
    dragOverTeam = null;
    dragOverZone = null;
    draggedPlayerId = null;
    setTimeout(() => {
      wasDragged = false;
    }, 150);
  }

  function handleDragStart(e: DragEvent, player: RosterPlayer) {
    if (!canDragPlayer(player)) {
      e.preventDefault();
      return;
    }
    draggedPlayerId = player.id;
    wasDragged = true;
    dragStartTime = Date.now();
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', String(player.id));
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragEnd() {
    draggedPlayerId = null;
    dragOverTeam = null;
    dragOverZone = null;
    setTimeout(() => {
      wasDragged = false;
    }, 150);
  }

  function handleDragOver(e: DragEvent, team: TeamSlot) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverTeam = team;
  }

  function handleZoneDragOver(e: DragEvent, team: 'red' | 'blue', pos: PlayerPosition) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverTeam = team;
    dragOverZone = { team, pos };
  }

  function handleDragLeave(team: TeamSlot) {
    if (dragOverTeam === team) {
      dragOverTeam = null;
    }
  }

  function handleZoneDrop(e: DragEvent, targetTeam: 'red' | 'blue', targetPos: PlayerPosition) {
    e.preventDefault();
    e.stopPropagation();
    const idStr = e.dataTransfer?.getData('text/plain');
    const playerId = idStr ? Number(idStr) : draggedPlayerId;
    dragOverTeam = null;
    dragOverZone = null;
    draggedPlayerId = null;
    if (playerId !== null && !isNaN(playerId)) {
      const p = gameUI.players.find((item) => item.id === playerId);
      if (p) {
        applyDropMove(p, targetTeam, targetPos);
      }
    }
    setTimeout(() => {
      wasDragged = false;
    }, 150);
  }

  function handleDrop(e: DragEvent, targetTeam: TeamSlot) {
    e.preventDefault();
    const idStr = e.dataTransfer?.getData('text/plain');
    const playerId = idStr ? Number(idStr) : draggedPlayerId;
    dragOverTeam = null;
    dragOverZone = null;
    draggedPlayerId = null;
    if (playerId !== null && !isNaN(playerId)) {
      const p = gameUI.players.find((item) => item.id === playerId);
      if (p) {
        applyDropMove(p, targetTeam, null);
      }
    }
    setTimeout(() => {
      wasDragged = false;
    }, 150);
  }

  // Menú contextual (Admin completo o Capitán para organizar posiciones dentro de su equipo)
  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    player: RosterPlayer | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    player: null
  });

  function canOpenContextMenuFor(player: RosterPlayer): boolean {
    if (gameUI.isAdmin || gameUI.isHost) return true;
    if ((player.team === 'red' || player.team === 'blue') && isLocalCaptainOf(player.team)) {
      return true;
    }
    return false;
  }

  function handlePlayerCardClick(e: MouseEvent, player: RosterPlayer) {
    if (wasDragged || Date.now() - dragStartTime < 200) return;
    if (!canOpenContextMenuFor(player)) return;

    e.stopPropagation();
    soundFX.playUIClick();

    const menuWidth = 210;
    const menuHeight = 290;
    let x = e.clientX;
    let y = e.clientY;

    if (typeof window !== 'undefined') {
      if (x + menuWidth > window.innerWidth - 12) {
        x = Math.max(8, window.innerWidth - menuWidth - 12);
      }
      if (y + menuHeight > window.innerHeight - 12) {
        y = Math.max(8, window.innerHeight - menuHeight - 12);
      }
    }

    contextMenu = {
      visible: true,
      x,
      y,
      player
    };
  }

  function closeContextMenu() {
    contextMenu.visible = false;
  }

  function handleContextMoveTeam(targetTeam: TeamSlot) {
    if (!contextMenu.player) return;
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    const targetId = contextMenu.player.id;
    soundFX.playUIClick();
    if (gameUI.changeTeam(targetId, targetTeam)) {
      onTeamChange(targetId, targetTeam);
    }
    closeContextMenu();
  }

  function handleContextAssignPosition(pos: PlayerPosition) {
    if (!contextMenu.player) return;
    gameUI.changePlayerPosition(contextMenu.player.id, pos);
    closeContextMenu();
  }

  // ==========================================
  // CONTROLES FSM Y OPERACIÓN DE SALA
  // ==========================================
  function handleStartMatch() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur();
    }
    gameUI.startMatch();
    gameUI.clearModalStack();
    gameUI.activeModal = 'NONE';
    onStartMatch();
  }

  function handleStopMatch() {
    if (!gameUI.isAdmin && !gameUI.isHost) return;
    soundFX.playUIClick();
    gameUI.stopMatch();
    if (gameUI.isHost) {
      gameUI.openOverlay('TEAM_MANAGEMENT');
    }
    onStopMatch();
  }

  function handlePauseToggle() {
    if ((!gameUI.isAdmin && !gameUI.isHost) || isPauseLocked) return;
    const wasPaused = isMatchPaused;
    soundFX.playUIClick();
    gameUI.togglePause();
    if (wasPaused && canClose) {
      gameUI.closeModal();
    }
    onTogglePause();
  }

  function handleClose() {
    if (!canClose) return;
    soundFX.playUIClick();
    gameUI.closeModal();
  }

  function handleLeave() {
    soundFX.playUIClick();
    gameUI.leaveRoom();
    onLeaveRoom();
  }

  let roomCapacity = $state(gameUI.activeRoom?.maxPlayers || 12);

  $effect(() => {
    if (gameUI.activeRoom?.maxPlayers) {
      roomCapacity = gameUI.activeRoom.maxPlayers;
    }
  });

  let benchSeats = $derived(
    Array.from({ length: Math.max(2, Math.min(30, roomCapacity)) }, (_, i) => specPlayers[i] ?? null)
  );

  function handleCopyLink() {
    soundFX.playUIClick();
    const roomCode = gameUI.matchId || gameUI.activeRoom?.id || 'CTNYRS';
    const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}/#room=${roomCode}` : roomCode;
    navigator.clipboard?.writeText(fullUrl).catch(() => {});
    copyStatus = 'copied';
    setTimeout(() => {
      copyStatus = 'idle';
    }, 2000);
  }

  function changeCapacity(delta: number) {
    if (!gameUI.isHost) return;
    soundFX.playUIClick();
    const next = Math.max(2, Math.min(30, roomCapacity + delta));
    roomCapacity = next;
    if (gameUI.activeRoom) {
      gameUI.activeRoom.maxPlayers = next;
    }
    gameApp.updateRoomConfig({ maxPlayers: next });
    gameUI.onRoomConfigChanged?.({ maxPlayers: next });
  }

  function formatTimeLimit(val: number): string {
    return val === 0 ? '0 (Indefinido)' : `${val} min`;
  }

  function formatGoalsLimit(val: number): string {
    return val === 0 ? '0 (Sin límite)' : `${val} ${val === 1 ? 'gol' : 'goles'}`;
  }
</script>

<div
  id="modal-team-select"
  data-id="ingame-menu"
  class="modal-backdrop"
  class:is-forced-open={gameUI.isTeamSelectForcedOpen || gameUI.matchPhase === 0}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={(e) => {
    if (e.target === e.currentTarget && canClose) handleClose();
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape' && canClose) {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
    }
  }}
>
  <div class="corridor-viewport">
    <div
      class="corridor-container"
      class:is-mobile-carousel={gameUI.isMobileLayout}
      role="region"
      aria-label="Carrusel de vistas de sala"
      ontouchstart={handleCorridorTouchStart}
      ontouchend={handleCorridorTouchEnd}
    >
      <!-- ======================================================== -->
      <!-- DIAPOSITIVA 0: ESTADÍSTICAS Y MVP                        -->
      <!-- ======================================================== -->
      <div
        class="corridor-slide slide-stats"
        class:is-active={currentSlide === 0}
        class:slide-out-left={currentSlide > 0}
        id="slide-stats"
      >
        {#if !gameUI.isMobileLayout}
          <button
            type="button"
            id="btn-goto-menu"
            class="external-nav-tab right-tab"
            aria-label="Ir a Lista de Jugadores"
            onclick={() => goToSlide(1)}
          >
            <span id="stats-to-menu-btn">JUGADORES</span>
            <span class="nav-chevron">&gt;</span>
          </button>
        {/if}

        {#snippet statsBreakdownDrawer(player: PlayerStatEntry)}
          {@const goalsPts = (player.goals ?? 0) * 100}
          {@const powerGoalsPts = ((player as any).powerGoals ?? 0) * 30}
          {@const curveGoalsPts = ((player as any).curveGoals ?? 0) * 30}
          {@const assistsPts = (player.assists ?? 0) * 50}
          {@const curveAssistsPts = ((player as any).curveAssists ?? 0) * 20}
          {@const savesPts = (player.saves ?? 0) * 100}
          {@const shotsPts = (player.shots ?? 0) * 20}
          {@const passesPts = (player.passes ?? 0) * 10}
          {@const hattrickPts = player.hasHattrickBonus ? 100 : 0}
          {@const ownGoalPts = player.ownGoals ? -(player.ownGoals * 50) : 0}
          <div class="accordion-drawer">
            <div class="drawer-grid">
              <div class="drawer-chip">
                <span class="chip-label">Gol (+100)</span>
                <span class="chip-val" class:text-green={goalsPts > 0} class:text-muted={goalsPts === 0}>+{goalsPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Gol Pot. (+30)</span>
                <span class="chip-val" class:text-gold={powerGoalsPts > 0} class:text-muted={powerGoalsPts === 0}>+{powerGoalsPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Gol Ef. (+30)</span>
                <span class="chip-val" class:text-cyan={curveGoalsPts > 0} class:text-muted={curveGoalsPts === 0}>+{curveGoalsPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Asist. (+50)</span>
                <span class="chip-val" class:text-green={assistsPts > 0} class:text-muted={assistsPts === 0}>+{assistsPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Asist. Ef. (+20)</span>
                <span class="chip-val" class:text-cyan={curveAssistsPts > 0} class:text-muted={curveAssistsPts === 0}>+{curveAssistsPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Atajada (+100)</span>
                <span class="chip-val" class:text-green={savesPts > 0} class:text-muted={savesPts === 0}>+{savesPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Tiro (+20)</span>
                <span class="chip-val" class:text-cyan={shotsPts > 0} class:text-muted={shotsPts === 0}>+{shotsPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Pase (+10)</span>
                <span class="chip-val" class:text-cyan={passesPts > 0} class:text-muted={passesPts === 0}>+{passesPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Hattrick (+100)</span>
                <span class="chip-val" class:text-gold={hattrickPts > 0} class:text-muted={hattrickPts === 0}>+{hattrickPts}</span>
              </div>
              <div class="drawer-chip">
                <span class="chip-label">Autogol (-50)</span>
                <span class="chip-val" class:text-error={ownGoalPts < 0} class:text-muted={ownGoalPts === 0}>{ownGoalPts}</span>
              </div>
            </div>
          </div>
        {/snippet}

        {#snippet statsTeamTable(
          team: 'red' | 'blue',
          teamName: string,
          primaryColor: string,
          _secondaryColor: string,
          tertiaryColor: string,
          hasOutline: boolean,
          statsList: ReadonlyArray<PlayerStatEntry>
        )}
          {@const allExpanded = isTeamAllExpanded(team)}
          {@const headerBg = team === 'red' ? redKitBg : blueKitBg}
          <div
            class="team-table-box {team}-box"
            style={team === 'red'
              ? `--captain-local-primary: ${primaryColor}; --captain-local-glow: ${primaryColor}40; --captain-local-tertiary: ${tertiaryColor};`
              : `--captain-visitor-primary: ${primaryColor}; --captain-visitor-glow: ${primaryColor}40; --captain-visitor-tertiary: ${tertiaryColor};`}
          >
            <div
              class="table-header {team}-header captain-bicolor-header"
              style="background: {headerBg}; border: {hasOutline ? '1.5px solid #000000' : 'none'};"
            >
              <div class="table-header-left">
                <span
                  class="col-team-name-hdr"
                  style="color: {tertiaryColor}; {hasOutline ? '-webkit-text-stroke: 2px #000000; paint-order: stroke fill; text-shadow: -1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000;' : 'text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);'}"
                >{teamName}</span>
                <button
                  type="button"
                  class="team-expand-all-btn"
                  disabled={statsList.length === 0}
                  onclick={() => toggleAllTeam(team)}
                >
                  <span>{allExpanded ? 'Contraer todos' : 'Desplegar todos'}</span>
                  <span aria-hidden="true">{allExpanded ? '▲' : '▼'}</span>
                </button>
              </div>
              <div
                class="col-headers-right"
                style="color: {tertiaryColor}; {hasOutline ? 'text-shadow: -1px -1px 0 #000000, 1px -1px 0 #000000, -1px 1px 0 #000000, 1px 1px 0 #000000;' : ''}"
              >
                <span class="col-pts">PTS</span>
                <span class="col-stat">G</span>
                <span class="col-stat">A</span>
                <span class="col-stat">S</span>
                <span class="col-stat">P</span>
                <span class="col-stat">T</span>
                <span class="col-arrow"></span>
              </div>
            </div>

            <div class="table-scroll-body {team === 'red' ? 'custom-scrollbar-red' : 'custom-scrollbar'}">
              {#each statsList as player, idx (getPlayerStatKey(team, idx, player))}
                {@const rowKey = getPlayerStatKey(team, idx, player)}
                {@const isExpanded = expandedPlayers.has(rowKey)}
                <div
                  class="player-stat-row"
                  class:is-mvp={player.isMvp}
                  class:row-expanded={isExpanded}
                >
                  <div
                    class="row-summary accordion-trigger"
                    role="button"
                    tabindex="0"
                    aria-expanded={isExpanded}
                    onclick={() => toggleAccordion(rowKey)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleAccordion(rowKey);
                      }
                    }}
                  >
                    <span class="col-player bold" class:gold-player={player.isMvp}>
                      {#if player.isMvp}
                        <svg class="crown-svg-sm" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M3 18h18v2H3v-2zm0-2l2-9 5 4 2-6 2 6 5-4 2 9H3z"></path>
                        </svg>
                      {:else if player.isCaptain}
                        <span class="badge-cap {team}">C</span>
                      {/if}
                      {player.nickname}
                      {#if player.isHost}
                        <span class="host-tag">(Host)</span>
                      {/if}
                    </span>
                    <span
                      class="col-pts"
                      class:gold-txt={player.isMvp}
                      class:red-txt={!player.isMvp && team === 'red'}
                      class:blue-txt={!player.isMvp && team === 'blue'}
                    >
                      {player.points ?? 0}
                    </span>
                    <span class="col-stat" class:gold-stat={player.isMvp}>{player.goals ?? 0}</span>
                    <span class="col-stat">{player.assists ?? 0}</span>
                    <span class="col-stat">{player.saves ?? 0}</span>
                    <span class="col-stat">{player.passes ?? 0}</span>
                    <span class="col-stat">{player.shots ?? 0}</span>
                    <span class="col-arrow chevron-icon">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {#if isExpanded}
                    {@render statsBreakdownDrawer(player)}
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/snippet}

        <div class="team-modal-card stats-modal-card">
          {#if gameUI.isMobileLayout && !canShowStats}
            <div class="stats-empty-mobile">
              <div class="stats-empty-badge">ESTADÍSTICAS DEL PARTIDO</div>
              <p class="stats-empty-desc">
                Las estadísticas detalladas, MVP y desglose por jugador aparecerán aquí al finalizar el partido.
              </p>
              <button type="button" class="stats-empty-back-btn" onclick={() => goToSlide(1)}>
                Volver a Lista de Jugadores &gt;
              </button>
            </div>
          {:else}
            <header class="stats-header-row">
              <div class="stats-hero-matchup">
                <div class="hero-team-side hero-red">
                  <div
                    class="stats-acronym-badge red-acronym"
                    style="
                      background: {redKitBg};
                      border: {redHasOutline ? '1.5px solid #000000' : 'none'};
                      box-shadow: {redHasOutline ? '0 0 0 1.5px #000000' : 'none'};
                      color: {redKitTertiary};
                      {redHasOutline ? '-webkit-text-stroke: 3px #000000; paint-order: stroke fill; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);' : '-webkit-text-stroke: 0px transparent; text-shadow: none;'}
                    "
                  >
                    {redTeamTag}
                  </div>
                  <span class="hero-team-label">{redTeamName}</span>
                </div>

                <div class="stats-hero-score">
                  <span class="stats-score-num" id="post-score-red">{matchRedScore}</span>
                  <span class="stats-score-sep">-</span>
                  <span class="stats-score-num" id="post-score-blue">{matchBlueScore}</span>
                </div>

                <div class="hero-team-side hero-blue">
                  <span class="hero-team-label">{blueTeamName}</span>
                  <div
                    class="stats-acronym-badge blue-acronym"
                    style="
                      background: {blueKitBg};
                      border: {blueHasOutline ? '1.5px solid #000000' : 'none'};
                      box-shadow: {blueHasOutline ? '0 0 0 1.5px #000000' : 'none'};
                      color: {blueKitTertiary};
                      {blueHasOutline ? '-webkit-text-stroke: 3px #000000; paint-order: stroke fill; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);' : '-webkit-text-stroke: 0px transparent; text-shadow: none;'}
                    "
                  >
                    {blueTeamTag}
                  </div>
                </div>
              </div>

              <div class="stats-center-zone">
                {#if gameUI.mvp}
                  <div class="mvp-golden-plaque">
                    <svg class="crown-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M3 18h18v2H3v-2zm0-2l2-9 5 4 2-6 2 6 5-4 2 9H3z"></path>
                    </svg>
                    <span class="mvp-title">MVP: {gameUI.mvp.nickname}</span>
                    <span class="mvp-points-chip">({gameUI.mvp.points} pts)</span>
                    <span class="mvp-mini-line">
                      {gameUI.mvp.goals}G · {gameUI.mvp.assists}A · {(gameUI.mvp as any).saves ?? 0}S
                    </span>
                  </div>
                {/if}
              </div>

              <div class="match-status-meta">
                <span class="match-result-chip">
                  {matchRedScore > matchBlueScore
                    ? `VICTORIA ${redTeamTag}`
                    : matchBlueScore > matchRedScore
                      ? `VICTORIA ${blueTeamTag}`
                      : 'EMPATE'}
                </span>
                <span class="match-time-chip">{matchDurationFormatted}</span>
              </div>
            </header>

            <div class="tables-parallel-grid">
              {@render statsTeamTable('red', redTeamName, redPrimaryColor, redSecondaryColor, redKitTertiary, redHasOutline, gameUI.redTeamStats)}
              {@render statsTeamTable('blue', blueTeamName, bluePrimaryColor, blueSecondaryColor, blueKitTertiary, blueHasOutline, gameUI.blueTeamStats)}
            </div>
          {/if}
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- SLIDE 1: LISTA DE JUGADORES TEMÁTICA (CANCHA + BANQUILLO)-->
      <!-- ======================================================== -->
      <div
        class="corridor-slide slide-menu"
        class:is-active={currentSlide === 1}
        class:slide-out-right={currentSlide === 0}
        class:slide-out-left={currentSlide > 1}
        id="slide-lobby"
      >
        {#if canShowStats && !gameUI.isMobileLayout}
          <button
            type="button"
            id="btn-goto-stats"
            class="external-nav-tab left-tab"
            aria-label="Ir a Estadísticas"
            onclick={() => goToSlide(0)}
          >
            <span class="nav-chevron">&lt;</span>
            <span id="lobby-to-stats-btn">STATS</span>
          </button>
        {/if}

        {#if canSeeRoomSettings && !gameUI.isMobileLayout}
          <button
            type="button"
            id="btn-goto-settings"
            class="external-nav-tab right-tab"
            aria-label="Ir a Ajustes de Sala"
            onclick={() => goToSlide(2)}
          >
            <span id="lobby-to-settings-btn">AJUSTES</span>
            <span class="nav-chevron">&gt;</span>
          </button>
        {/if}

        {#snippet playerPitchToken(p: RosterPlayer, team: 'red' | 'blue')}
          {@const isCaptain = team === 'red' ? p.id === redCaptain?.id : p.id === blueCaptain?.id}
          {@const isDraggable = canDragPlayer(p)}
          {@const tertiary = team === 'red' ? redKitTertiary : blueKitTertiary}
          {@const primary = team === 'red' ? redPrimaryColor : bluePrimaryColor}
          <div
            class="pitch-player-token {team}-token"
            class:is-captain={isCaptain}
            class:cursor-grab={isDraggable}
            class:cursor-not-allowed={!isDraggable}
            class:is-dragging={draggedPlayerId === p.id}
            role="button"
            tabindex="0"
            draggable={isDraggable}
            ondragstart={(e) => handleDragStart(e, p)}
            ondragend={handleDragEnd}
            onpointerdown={(e) => handlePlayerPointerDown(e, p)}
            onpointermove={(e) => handlePlayerPointerMove(e, p)}
            onpointerup={(e) => handlePlayerPointerUp(e, p)}
            onpointercancel={handlePlayerPointerCancel}
            onclick={(e) => handlePlayerCardClick(e, p)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePlayerCardClick(e as unknown as MouseEvent, p);
              }
            }}
            title={canOpenContextMenuFor(p) ? 'Haz clic o arrastra para organizar posición' : (p.name || p.nickname)}
          >
            <div class="token-avatar-wrap">
              <div class="slot-avatar {team}" style="color: {tertiary};">{p.avatar || p.number || '1'}</div>
              {#if p.isAdmin || p.isHost}
                <span class="token-crown" title={p.isHost ? 'Anfitrión de la sala' : 'Administrador'}>👑</span>
              {/if}
              {#if isCaptain}
                <span
                  class="token-captain-c"
                  style="background-color: {primary}; color: {tertiary};"
                  title="Capitán del equipo"
                >C</span>
              {/if}
              {#if p.isBot}
                <span class="token-bot-badge" title="Bot IA ({botDifficultyLabel(p.botDifficulty)})">{botDifficultyLabel(p.botDifficulty)}</span>
              {/if}
            </div>
            <span class="token-nickname">{p.name || p.nickname}</span>
            <span class="token-ping-line">{p.isBot ? 'BOT IA' : `${p.ping ?? 0}ms`}</span>
          </div>
        {/snippet}

        <div class="team-modal-card lobby-modal-card">
          <!-- Cabecera + Mini Tarjeta Goles/Minutos -->
          <header class="modal-header">
            <div class="room-identity">
              <h2 class="room-title">{gameUI.activeRoomName || 'TORNEO NOCTURNO #12'}</h2>
              <span class="header-divider">|</span>
              {#if gameUI.isPracticeMode}
                <span class="practice-offline-badge" id="practice-offline-badge">
                  MODO ENTRENAMIENTO (OFFLINE)
                </span>
              {:else}
                <span class="room-id-badge">ID: {gameUI.matchId || gameUI.activeRoom?.id || 'CTNYRS'}</span>
              {/if}

              <!-- Mini tarjeta de Goles y Minutos configurados -->
              <div class="match-rules-minicard" data-testid="match-rules-minicard" title="Reglas configuradas para el partido">
                <span class="minicard-item">
                  <span aria-hidden="true">⚽</span>
                  <span>{gameUI.scoreLimitGoals === 0 ? '∞ Goles' : `${gameUI.scoreLimitGoals} ${gameUI.scoreLimitGoals === 1 ? 'Gol' : 'Goles'}`}</span>
                </span>
                <span class="minicard-sep">·</span>
                <span class="minicard-item">
                  <span aria-hidden="true">⏱️</span>
                  <span>{gameUI.timeLimitMinutes === 0 ? '∞ Min' : `${gameUI.timeLimitMinutes} Min`}</span>
                </span>
              </div>

              {#if gameUI.isMobileLayout}
                <span class="mobile-menu-telemetry {mobilePingClass}" aria-label="Ping y FPS en vivo">
                  <span class="m-tel-dot" aria-hidden="true"></span>
                  <span>{gameUI.pingMs} ms</span>
                  <span class="m-tel-sep">·</span>
                  <span>{gameUI.fps} FPS</span>
                </span>
              {/if}
            </div>

            <div class="header-actions">
              {#if canSeeRoomSettings}
                <button
                  type="button"
                  id="btn-header-room-settings"
                  class="btn-settings-quick"
                  onclick={() => goToSlide(2)}
                  title="Ir a Ajustes de Sala y Control de Partido"
                >
                  <span aria-hidden="true">⚙️</span>
                  <span>Ajustes</span>
                </button>
              {/if}

              {#if !gameUI.isPracticeMode}
                <button
                  type="button"
                  id="btn-header-copy-link"
                  class="btn-copy-link"
                  onclick={handleCopyLink}
                  title="Copiar enlace directo a la sala"
                >
                  <svg class="header-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                  </svg>
                  <span>{copyStatus === 'copied' ? '¡COPIADO!' : 'COPIAR LINK'}</span>
                </button>
              {/if}

              <button
                type="button"
                id="btn-quick-close"
                class="btn-leave"
                onclick={handleLeave}
                title="Abandonar la sala"
              >
                <svg class="header-btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span>ABANDONAR</span>
              </button>

              {#if canClose}
                <button
                  type="button"
                  id="menu-close-btn"
                  class="btn-close-x"
                  onclick={handleClose}
                  aria-label="Cerrar menú"
                >
                  ✕
                </button>
              {/if}
            </div>
          </header>

          <!-- Broadcast 3-Col Layout: Mitad Roja | Espectadores (Sillas + Reglas) | Mitad Azul -->
          <div class="pitch-lineup-workspace broadcast-3col" data-testid="broadcast-lineup-3col">
            <!-- COLUMNA IZQUIERDA: EQUIPO ROJO -->
            <section
              class="broadcast-team-col red-col"
              data-team-column="red"
              class:is-drag-over={dragOverTeam === 'red'}
              ondragover={(e) => handleDragOver(e, 'red')}
              ondragleave={() => handleDragLeave('red')}
              ondrop={(e) => handleDrop(e, 'red')}
              aria-label="Columna Equipo Rojo"
            >
              <div
                class="pitch-team-bar red-bar captain-bicolor-header"
                style="--captain-local-primary: {redPrimaryColor}; background: {redKitBg}; border: {redHasOutline ? '1.5px solid #000000' : 'none'};"
              >
                <span
                  class="team-name"
                  style="color: {redKitTertiary}; {redHasOutline ? '-webkit-text-stroke: 2px #000000; paint-order: stroke fill;' : 'text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);'}"
                >{redTeamName} ({redPlayers.length})</span>
                <div class="bench-header-actions">
                  <div class="kit-variant-toggles" role="group" aria-label="Equipación del equipo rojo">
                    <button
                      type="button"
                      class="kit-variant-btn"
                      class:active={gameUI.redKitVariant === 'home'}
                      disabled={!isRedCaptainOrAdmin}
                      onclick={() => handleSetRedKitVariant('home')}
                    >Local</button>
                    <button
                      type="button"
                      class="kit-variant-btn"
                      class:active={gameUI.redKitVariant === 'away'}
                      disabled={!isRedCaptainOrAdmin}
                      onclick={() => handleSetRedKitVariant('away')}
                    >Visit.</button>
                  </div>
                  <button
                    type="button"
                    class="bench-join-btn"
                    disabled={localTeam === 'red' || !canSwitchOwnTeam}
                    onclick={() => handleQuickJoinTeam('red')}
                  >+ Unirse</button>
                </div>
              </div>

              <div class="formation-badge red-formation">{redFormation}</div>

              <div id="redPlayersList" class="vertical-half-pitch red-pitch">
                <div class="vpitch-goal-arc top-goal" aria-hidden="true"></div>
                <div class="vpitch-mid-curve bottom-curve" aria-hidden="true"></div>
                {#each RED_ZONE_ORDER as zonePos (zonePos)}
                  {@const zoneMembers = getZonePlayers(redPlayers, zonePos)}
                  <div
                    class="pitch-zone-col vertical-zone zone-{zonePos.toLowerCase()}"
                    data-zone-team="red"
                    data-zone-pos={zonePos}
                    role="region"
                    aria-label="Zona {POSITION_META[zonePos].title} Rojo"
                    class:is-zone-hover={dragOverZone?.team === 'red' && dragOverZone?.pos === zonePos}
                    ondragover={(e) => handleZoneDragOver(e, 'red', zonePos)}
                    ondrop={(e) => handleZoneDrop(e, 'red', zonePos)}
                  >
                    <span class="zone-header-pill role-{zonePos.toLowerCase()}" title={POSITION_META[zonePos].title}>
                      {POSITION_META[zonePos].label}
                    </span>
                    <div class="zone-players-stack vertical-stack custom-scrollbar-red">
                      {#each zoneMembers as p (p.id)}
                        {@render playerPitchToken(p, 'red')}
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>

              {#if canManageBots || canClearTeams}
                <div class="team-controls-box red-controls">
                  <button
                    type="button"
                    class="team-controls-toggle red-toggle"
                    onclick={() => (showRedControls = !showRedControls)}
                  >
                    <span>Controles de Equipo</span>
                    <span>{showRedControls ? '▾' : '▸'}</span>
                  </button>
                  {#if showRedControls}
                    <div class="team-controls-actions">
                      {#if canManageBots}
                        <button
                          type="button"
                          class="tctrl-btn tctrl-add-bot"
                          data-testid="btn-add-bot-red"
                          onclick={() => handleAddBotTo('red')}
                        >
                          <span>Añadir Bot</span>
                          <span>+</span>
                        </button>
                      {/if}
                      {#if canClearTeams}
                        <button
                          type="button"
                          class="tctrl-btn tctrl-clear"
                          data-testid="btn-clear-red"
                          disabled={redPlayers.length === 0}
                          onclick={() => handleClearTeamList('red')}
                        >
                          <span>Vaciar Equipo</span>
                          <span>🗑</span>
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </section>

            <!-- COLUMNA CENTRAL: ESPECTADORES + SILLAS + REGLAS -->
            <section
              class="broadcast-center-col"
              data-team-column="spectator"
              class:is-drag-over={dragOverTeam === 'spectator'}
              ondragover={(e) => handleDragOver(e, 'spectator')}
              ondragleave={() => handleDragLeave('spectator')}
              ondrop={(e) => handleDrop(e, 'spectator')}
              aria-label="Banquillo Espectadores"
            >
              <div class="center-spec-heading">
                <span class="banquillo-title">ESPECTADORES</span>
                <span class="banquillo-cap-badge">{specPlayers.length} / {roomCapacity} sillas</span>
              </div>

              <div class="dugout-middle-row">
                <div class="side-transfer-rail">
                  <button
                    type="button"
                    class="rail-arrow-btn is-red"
                    disabled={localTeam === 'red' || !canSwitchOwnTeam}
                    onclick={() => handleQuickJoinTeam('red')}
                    title="Unirse a Rojo"
                    aria-label="Ir a Equipo Rojo"
                  >&lt;</button>
                  <button
                    type="button"
                    class="rail-arrow-btn is-spec"
                    disabled={localTeam === 'spectator' || !canSwitchOwnTeam}
                    onclick={() => handleQuickJoinTeam('spectator')}
                    title="Ir al Banquillo"
                    aria-label="Ir al Banquillo"
                  >&gt;</button>
                </div>

                <div class="banquillo-dugout broadcast-dugout">
                  <div class="banquillo-header">
                    <span class="waiting-sub">Banquillo de Suplentes</span>
                    <button
                      type="button"
                      class="bench-join-btn"
                      disabled={localTeam === 'spectator' || !canSwitchOwnTeam}
                      onclick={() => handleQuickJoinTeam('spectator')}
                    >Sentarse</button>
                  </div>

                  <div id="specPlayersList" class="banquillo-chairs-grid broadcast-chairs custom-scrollbar">
                    {#each benchSeats as chairPlayer, seatIdx (seatIdx)}
                      {#if chairPlayer}
                        {@const isDraggable = canDragPlayer(chairPlayer)}
                        <div
                          class="bench-seat-slot is-occupied"
                          class:cursor-grab={isDraggable}
                          class:is-dragging={draggedPlayerId === chairPlayer.id}
                          role="button"
                          tabindex="0"
                          draggable={isDraggable}
                          ondragstart={(e) => handleDragStart(e, chairPlayer)}
                          ondragend={handleDragEnd}
                          onpointerdown={(e) => handlePlayerPointerDown(e, chairPlayer)}
                          onpointermove={(e) => handlePlayerPointerMove(e, chairPlayer)}
                          onpointerup={(e) => handlePlayerPointerUp(e, chairPlayer)}
                          onpointercancel={handlePlayerPointerCancel}
                          onclick={(e) => handlePlayerCardClick(e, chairPlayer)}
                          onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handlePlayerCardClick(e as unknown as MouseEvent, chairPlayer);
                            }
                          }}
                        >
                          <span class="chair-num">{seatIdx + 1}</span>
                          <div class="seat-backrest" aria-hidden="true"></div>
                          <div class="seat-avatar-wrap">
                            <div class="slot-avatar spec">{chairPlayer.avatar || chairPlayer.number || 'S'}</div>
                            {#if chairPlayer.isAdmin || chairPlayer.isHost}
                              <span class="seat-crown" title={chairPlayer.isHost ? 'Anfitrión' : 'Admin'}>👑</span>
                            {/if}
                          </div>
                          <span class="seat-player-name">{chairPlayer.name || chairPlayer.nickname}</span>
                          <span class="seat-ping">{chairPlayer.ping ?? 0}ms</span>
                        </div>
                      {:else}
                        <div
                          class="bench-seat-slot is-empty"
                          role="button"
                          tabindex="0"
                          aria-label="Silla vacía {seatIdx + 1}"
                          onclick={() => handleQuickJoinTeam('spectator')}
                          onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleQuickJoinTeam('spectator');
                            }
                          }}
                        >
                          <span class="chair-num">{seatIdx + 1}</span>
                          <div class="seat-backrest empty-chair" aria-hidden="true"></div>
                          <span class="seat-empty-plus">+</span>
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>

                <div class="side-transfer-rail">
                  <button
                    type="button"
                    class="rail-arrow-btn is-blue"
                    disabled={localTeam === 'blue' || !canSwitchOwnTeam}
                    onclick={() => handleQuickJoinTeam('blue')}
                    title="Unirse a Azul"
                    aria-label="Ir a Equipo Azul"
                  >&gt;</button>
                  <button
                    type="button"
                    class="rail-arrow-btn is-spec"
                    disabled={localTeam === 'spectator' || !canSwitchOwnTeam}
                    onclick={() => handleQuickJoinTeam('spectator')}
                    title="Ir al Banquillo"
                    aria-label="Ir al Banquillo"
                  >&lt;</button>
                </div>
              </div>

              <!-- Tarjeta inferior de Límites (Minutos & Goles) -->
              <div class="center-limits-bar">
                <div class="limit-pill-group">
                  <span class="limit-lbl">Tiempo límite</span>
                  <span class="limit-val">{gameUI.timeLimitMinutes === 0 ? '∞' : `${gameUI.timeLimitMinutes}m`}</span>
                </div>
                <div class="limit-pill-group">
                  <span class="limit-lbl">Límite de goles</span>
                  <span class="limit-val">{gameUI.scoreLimitGoals === 0 ? '∞' : gameUI.scoreLimitGoals}</span>
                </div>
              </div>
            </section>

            <!-- COLUMNA DERECHA: EQUIPO AZUL -->
            <section
              class="broadcast-team-col blue-col"
              data-team-column="blue"
              class:is-drag-over={dragOverTeam === 'blue'}
              ondragover={(e) => handleDragOver(e, 'blue')}
              ondragleave={() => handleDragLeave('blue')}
              ondrop={(e) => handleDrop(e, 'blue')}
              aria-label="Columna Equipo Azul"
            >
              <div
                class="pitch-team-bar blue-bar captain-bicolor-header"
                style="--captain-visitor-primary: {bluePrimaryColor}; background: {blueKitBg}; border: {blueHasOutline ? '1.5px solid #000000' : 'none'};"
              >
                <span
                  class="team-name"
                  style="color: {blueKitTertiary}; {blueHasOutline ? '-webkit-text-stroke: 2px #000000; paint-order: stroke fill;' : 'text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);'}"
                >{blueTeamName} ({bluePlayers.length})</span>
                <div class="bench-header-actions">
                  <div class="kit-variant-toggles" role="group" aria-label="Equipación del equipo azul">
                    <button
                      type="button"
                      class="kit-variant-btn"
                      class:active={gameUI.blueKitVariant === 'home'}
                      disabled={!isBlueCaptainOrAdmin}
                      onclick={() => handleSetBlueKitVariant('home')}
                    >Local</button>
                    <button
                      type="button"
                      class="kit-variant-btn"
                      class:active={gameUI.blueKitVariant === 'away'}
                      disabled={!isBlueCaptainOrAdmin}
                      onclick={() => handleSetBlueKitVariant('away')}
                    >Visit.</button>
                  </div>
                  <button
                    type="button"
                    class="bench-join-btn"
                    disabled={localTeam === 'blue' || !canSwitchOwnTeam}
                    onclick={() => handleQuickJoinTeam('blue')}
                  >+ Unirse</button>
                </div>
              </div>

              <div class="formation-badge blue-formation">{blueFormation}</div>

              <div id="bluePlayersList" class="vertical-half-pitch blue-pitch">
                <div class="vpitch-goal-arc top-goal" aria-hidden="true"></div>
                <div class="vpitch-mid-curve bottom-curve" aria-hidden="true"></div>
                {#each RED_ZONE_ORDER as zonePos (zonePos)}
                  {@const zoneMembers = getZonePlayers(bluePlayers, zonePos)}
                  <div
                    class="pitch-zone-col vertical-zone zone-{zonePos.toLowerCase()}"
                    data-zone-team="blue"
                    data-zone-pos={zonePos}
                    role="region"
                    aria-label="Zona {POSITION_META[zonePos].title} Azul"
                    class:is-zone-hover={dragOverZone?.team === 'blue' && dragOverZone?.pos === zonePos}
                    ondragover={(e) => handleZoneDragOver(e, 'blue', zonePos)}
                    ondrop={(e) => handleZoneDrop(e, 'blue', zonePos)}
                  >
                    <span class="zone-header-pill role-{zonePos.toLowerCase()}" title={POSITION_META[zonePos].title}>
                      {POSITION_META[zonePos].label}
                    </span>
                    <div class="zone-players-stack vertical-stack custom-scrollbar">
                      {#each zoneMembers as p (p.id)}
                        {@render playerPitchToken(p, 'blue')}
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>

              {#if canManageBots || canClearTeams}
                <div class="team-controls-box blue-controls">
                  <button
                    type="button"
                    class="team-controls-toggle blue-toggle"
                    onclick={() => (showBlueControls = !showBlueControls)}
                  >
                    <span>Controles de Equipo</span>
                    <span>{showBlueControls ? '▾' : '▸'}</span>
                  </button>
                  {#if showBlueControls}
                    <div class="team-controls-actions">
                      {#if canManageBots}
                        <button
                          type="button"
                          class="tctrl-btn tctrl-add-bot"
                          data-testid="btn-add-bot-blue"
                          onclick={() => handleAddBotTo('blue')}
                        >
                          <span>Añadir Bot</span>
                          <span>+</span>
                        </button>
                      {/if}
                      {#if canClearTeams}
                        <button
                          type="button"
                          class="tctrl-btn tctrl-clear"
                          data-testid="btn-clear-blue"
                          disabled={bluePlayers.length === 0}
                          onclick={() => handleClearTeamList('blue')}
                        >
                          <span>Vaciar Equipo</span>
                          <span>🗑</span>
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </section>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- SLIDE 2: AJUSTES DE SALA & CONTROL DE PARTIDO (SOLO ADMIN)-->
      <!-- ======================================================== -->
      {#if canSeeRoomSettings}
        <div
          class="corridor-slide slide-settings"
          class:is-active={currentSlide === 2}
          class:slide-out-left={currentSlide > 2}
          class:slide-out-right={currentSlide < 2}
          id="slide-settings"
        >
          {#if !gameUI.isMobileLayout}
            <button
              type="button"
              id="btn-settings-to-players"
              class="external-nav-tab left-tab"
              aria-label="Volver a Lista de Jugadores"
              onclick={() => goToSlide(1)}
            >
              <span class="nav-chevron">&lt;</span>
              <span>JUGADORES</span>
            </button>
          {/if}

          <div class="team-modal-card settings-slide-card">
            <header class="modal-header">
              <div class="room-identity">
                <h2 class="room-title">AJUSTES DE SALA & CONTROL</h2>
                <span class="header-divider">|</span>
                <span class="room-id-badge">{gameUI.isHost ? 'ANFITRIÓN' : 'ADMIN'}</span>
              </div>
              <div class="header-actions">
                <button
                  type="button"
                  class="btn-copy-link"
                  onclick={() => goToSlide(1)}
                >
                  &lt; Ver Cancha
                </button>
                {#if canClose}
                  <button
                    type="button"
                    class="btn-close-x"
                    onclick={handleClose}
                    aria-label="Cerrar menú"
                  >
                    ✕
                  </button>
                {/if}
              </div>
            </header>

            <div class="settings-slide-body custom-scrollbar">
              <div class="settings-2col-grid">
                <!-- Columna Izquierda: Reglas de Partido & Estadio -->
                <div class="settings-panel-box">
                  <span class="card-micro-title">REGLAS DEL PARTIDO Y ESTADIO</span>

                  <div class="rules-4btn-grid">
                    <!-- Tiempo -->
                    <div class="rule-cartouche" title="Tiempo de partido">
                      <span class="rule-cartouche-content">
                        <svg class="rule-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <circle cx="12" cy="13" r="8"></circle>
                          <polyline points="12 9 12 13 14.5 14.5"></polyline>
                          <line x1="9" y1="2" x2="15" y2="2"></line>
                        </svg>
                        <span class="rule-value">{formatTimeLimit(gameUI.timeLimitMinutes)}</span>
                      </span>
                      <span class="rule-arrow">▾</span>
                      <select
                        id="select-time-limit"
                        class="rule-select-overlay"
                        value={gameUI.timeLimitMinutes}
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                        onchange={(e) => {
                          const val = Number((e.currentTarget as HTMLSelectElement).value);
                          soundFX.playUIClick();
                          gameUI.timeLimitMinutes = val;
                          gameUI.physicsModifiers.timeLimit = val;
                          if (gameUI.activeRoom) gameUI.activeRoom.timeLimit = val;
                          if (gameUI.isHost && !gameUI.isPracticeMode) {
                            gameApp.updateRoomConfig({ timeLimit: val });
                          }
                          gameUI.onRoomConfigChanged?.({ timeLimit: val });
                        }}
                      >
                        {#each Array.from({ length: 16 }, (_, i) => i) as t}
                          <option value={t}>{formatTimeLimit(t)}</option>
                        {/each}
                      </select>
                    </div>

                    <!-- Goles -->
                    <div class="rule-cartouche" title="Límite de goles">
                      <span class="rule-cartouche-content">
                        <svg class="rule-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                          <circle cx="12" cy="12" r="9"></circle>
                          <polygon points="12 7.5 15.8 10.3 14.4 14.8 9.6 14.8 8.2 10.3 12 7.5"></polygon>
                        </svg>
                        <span class="rule-value">{formatGoalsLimit(gameUI.scoreLimitGoals)}</span>
                      </span>
                      <span class="rule-arrow">▾</span>
                      <select
                        id="select-goal-limit"
                        class="rule-select-overlay"
                        value={gameUI.scoreLimitGoals}
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                        onchange={(e) => {
                          const val = Number((e.currentTarget as HTMLSelectElement).value);
                          soundFX.playUIClick();
                          gameUI.scoreLimitGoals = val;
                          gameUI.physicsModifiers.scoreLimit = val;
                          if (gameUI.activeRoom) gameUI.activeRoom.scoreLimit = val;
                          if (gameUI.isHost && !gameUI.isPracticeMode) {
                            gameApp.updateRoomConfig({ scoreLimit: val });
                          }
                          gameUI.onRoomConfigChanged?.({ scoreLimit: val });
                        }}
                      >
                        {#each Array.from({ length: 16 }, (_, i) => i) as g}
                          <option value={g}>{formatGoalsLimit(g)}</option>
                        {/each}
                      </select>
                    </div>

                    {#if !gameUI.isPracticeMode}
                      <button
                        type="button"
                        id="btn-lock-teams"
                        class="rule-cartouche-btn lock-teams-btn"
                        class:active-locked={gameUI.teamsLocked}
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                        onclick={() => {
                          soundFX.playUIClick();
                          gameUI.toggleTeamsLock();
                          gameUI.onRoomConfigChanged?.({ teamsLocked: gameUI.teamsLocked });
                        }}
                      >
                        <span class="lock-label">{gameUI.teamsLocked ? 'Bloqueados' : 'Equipos Libres'}</span>
                        <span class="lock-tag">{gameUI.teamsLocked ? 'ADMINS' : 'TODOS'}</span>
                      </button>

                      <button
                        type="button"
                        id="btn-lock-captain-kits"
                        class="rule-cartouche-btn lock-teams-btn"
                        class:active-locked={!gameUI.allowCaptainKitSwitch}
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || gameUI.isMatchActive}
                        onclick={() => {
                          soundFX.playUIClick();
                          gameUI.allowCaptainKitSwitch = !gameUI.allowCaptainKitSwitch;
                          if (gameUI.isHost) {
                            gameApp.updateRoomConfig({ allowCaptainKitSwitch: gameUI.allowCaptainKitSwitch });
                          } else {
                            gameApp.dispatchAdminAction('TOGGLE_CAPTAIN_KIT_SWITCH', { allowCaptainKitSwitch: gameUI.allowCaptainKitSwitch });
                          }
                        }}
                      >
                        <span class="lock-label">{gameUI.allowCaptainKitSwitch ? 'Kits Libres' : 'Kits Fijos'}</span>
                        <span class="lock-tag">{gameUI.allowCaptainKitSwitch ? 'CAPITÁN' : 'FIJO'}</span>
                      </button>
                    {/if}

                    <div class="grid grid-cols-2 gap-1.5 w-full h-10 auto-reset-container">
                      <button
                        type="button"
                        id="btn-auto-balance"
                        class="rule-cartouche-btn btn-auto-balance h-full w-full flex items-center justify-center"
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || specPlayers.length === 0}
                        onclick={() => gameUI.autoBalanceSpectators()}
                      >
                        <span class="lock-label">Auto</span>
                      </button>

                      <button
                        type="button"
                        id="btn-reset-teams"
                        class="rule-cartouche-btn btn-reset-teams h-full w-full flex items-center justify-center"
                        disabled={(!gameUI.isAdmin && !gameUI.isHost) || (redPlayers.length === 0 && bluePlayers.length === 0)}
                        onclick={() => gameUI.resetTeamsToSpectators()}
                      >
                        <span class="lock-label">Reset</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      id="btn-open-physics-modifiers"
                      class="rule-cartouche-btn btn-modifiers"
                      disabled={!gameUI.isHost || gameUI.isMatchActive}
                      onclick={() => {
                        if (!gameUI.isHost) return;
                        gameUI.openOverlay('MODIFIERS');
                      }}
                    >
                      <svg class="rule-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                      </svg>
                      <span>Modifiers</span>
                    </button>
                  </div>

                  <div class="stadium-section w-full">
                    <div class="param-label-row">
                      <span class="param-name">Escoger estadio</span>
                    </div>
                    <div
                      class="stadium-preview-box"
                      tabindex="0"
                      role="button"
                      onmouseenter={() => soundFX.playUIHover()}
                      onclick={() => {
                        if ((gameUI.isAdmin || gameUI.isHost) && !gameUI.isMatchActive) {
                          soundFX.playUIClick();
                          gameUI.openOverlay('STADIUM_SELECT');
                        }
                      }}
                      onkeydown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && (gameUI.isAdmin || gameUI.isHost) && !gameUI.isMatchActive) {
                          e.preventDefault();
                          soundFX.playUIClick();
                          gameUI.openOverlay('STADIUM_SELECT');
                        }
                      }}
                    >
                      <div class="stadium-canvas-wrap">
                        <StadiumPreviewCanvas stadiumId={gameUI.selectedStadiumId || 'mediano'} compact={true} />
                      </div>
                      <div class="stadium-overlay">
                        <span class="stadium-name">{gameUI.activeStadiumName || 'Mediano'}</span>
                        <span class="stadium-action-text">Dar click para cambiar de estadio</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Columna Derecha: Ajustes Avanzados (Host) + Botones FSM Exclusivos -->
                <div class="settings-panel-box">
                  {#if !gameUI.isPracticeMode}
                    <div class="advanced-settings-card w-full">
                      <span class="card-micro-title">CONFIGURACIÓN DE LA SALA {#if !gameUI.isHost}<span class="text-xs text-muted">(Solo Host)</span>{/if}</span>

                      <div class="adv-row">
                        <label for="room-name-input">Nombre de Sala</label>
                        <input
                          id="room-name-input"
                          type="text"
                          maxlength="50"
                          class="styled-adv-input"
                          bind:value={gameUI.activeRoomName}
                          disabled={!gameUI.isHost || gameUI.isMatchActive}
                          oninput={() => gameUI.onRoomConfigChanged?.({ name: gameUI.activeRoomName })}
                        />
                      </div>

                      <div class="adv-capacity-row">
                        <span class="adv-label">Capacidad (Sillas Banquillo):</span>
                        <div class="cap-stepper">
                          <button
                            type="button"
                            id="btn-cap-minus"
                            class="cap-step-btn"
                            disabled={!gameUI.isHost || gameUI.isMatchActive}
                            onclick={() => changeCapacity(-1)}
                          >-</button>
                          <span id="capacity-value" class="cap-num-val">{roomCapacity}</span>
                          <button
                            type="button"
                            id="btn-cap-plus"
                            class="cap-step-btn"
                            disabled={!gameUI.isHost || gameUI.isMatchActive}
                            onclick={() => changeCapacity(1)}
                          >+</button>
                        </div>
                      </div>

                      <div class="toggle-row">
                        <span class="toggle-label">{isRoomPublic ? 'Sala pública' : 'Sala privada'}</span>
                        <label class="switch">
                          <input
                            type="checkbox"
                            bind:checked={isRoomPublic}
                            disabled={!gameUI.isHost || gameUI.isMatchActive}
                            onchange={() => {
                              soundFX.playUIClick();
                              if (isRoomPublic) {
                                roomPassword = '';
                                if (gameUI.activeRoom) {
                                  gameUI.activeRoom.isPrivate = false;
                                  gameUI.activeRoom.password = '';
                                }
                              } else {
                                if (gameUI.activeRoom) {
                                  gameUI.activeRoom.isPrivate = true;
                                }
                              }
                              gameUI.onRoomConfigChanged?.({
                                isPrivate: !isRoomPublic,
                                password: roomPassword
                              });
                            }}
                          />
                          <span class="slider"></span>
                        </label>
                      </div>

                      {#if !isRoomPublic}
                        <div class="adv-row password-row">
                          <label for="room-password-input">Contraseña de Sala</label>
                          <input
                            id="room-password-input"
                            type="text"
                            maxlength="30"
                            placeholder="Escribe la clave de acceso..."
                            class="styled-adv-input"
                            bind:value={roomPassword}
                            disabled={!gameUI.isHost || gameUI.isMatchActive}
                            oninput={(e) => {
                              const val = (e.currentTarget as HTMLInputElement).value;
                              roomPassword = val;
                              if (gameUI.activeRoom) gameUI.activeRoom.password = val;
                              gameUI.onRoomConfigChanged?.({
                                isPrivate: true,
                                password: val
                              });
                            }}
                          />
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <!-- Control de Partido (Exclusivo dentro de Ajustes de Sala) -->
                  <div class="fsm-footer-controls settings-fsm-box">
                    <span class="card-micro-title">CONTROL DEL PARTIDO</span>
                    {#if isMatchStopped}
                      <button
                        type="button"
                        id="btn-match-toggle"
                        class="btn-start-match btn btn-success btn-match-toggle"
                        disabled={!gameUI.isAdmin && !gameUI.isHost}
                        onclick={handleStartMatch}
                      >
                        <span>INICIAR PARTIDO</span>
                      </button>
                    {:else}
                      <div class="fsm-running-grid">
                        <button
                          type="button"
                          id="btn-match-toggle"
                          class="btn-stop-match btn btn-danger btn-match-toggle"
                          disabled={!gameUI.isAdmin && !gameUI.isHost}
                          onclick={handleStopMatch}
                        >
                          <span>DETENER PARTIDO</span>
                        </button>

                        <button
                          type="button"
                          id="btn-fsm-pause"
                          class="btn-pause-match btn btn-warning"
                          class:is-resuming={isMatchPaused}
                          disabled={(!gameUI.isAdmin && !gameUI.isHost) || isPauseLocked}
                          onclick={handlePauseToggle}
                        >
                          <span>{isResumeCountdown ? 'REANUDANDO...' : isMatchPaused ? 'REANUDAR' : 'PAUSAR'}</span>
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- ======================================================== -->
      <!-- SLIDE FINAL MÓVIL: CHAT EN VIVO                          -->
      <!-- ======================================================== -->
      {#if gameUI.isMobileLayout}
        <div
          class="corridor-slide slide-chat"
          class:is-active={currentSlide === chatSlideIndex}
          class:slide-out-right={currentSlide !== chatSlideIndex}
          id="slide-chat"
        >
          <div class="team-modal-card chat-modal-card">
            <header class="modal-header chat-slide-header">
              <div class="room-identity">
                <h2 class="room-title">CHAT DE LA SALA</h2>
                <span class="header-divider">|</span>
                <span class="mobile-menu-telemetry {mobilePingClass}">
                  <span class="m-tel-dot" aria-hidden="true"></span>
                  <span>{gameUI.pingMs} ms</span>
                  <span class="m-tel-sep">·</span>
                  <span>{gameUI.fps} FPS</span>
                </span>
              </div>
              <button
                type="button"
                class="btn-close-x"
                onclick={() => goToSlide(1)}
                aria-label="Volver a Lista de Jugadores"
              >
                &lt; Jugadores
              </button>
            </header>

            <div class="mobile-menu-chat-messages custom-scrollbar" bind:this={menuChatScrollEl}>
              {#if gameUI.chatMessages.length === 0}
                <div class="mobile-chat-empty">
                  Aún no hay mensajes en esta sala. ¡Saluda a los demás jugadores!
                </div>
              {:else}
                {#each gameUI.chatMessages as msg (msg.id)}
                  <div class="mobile-chat-row" class:is-system={msg.team === 'SYSTEM'}>
                    <span
                      class="mchat-sender"
                      class:is-red={msg.team === 'RED'}
                      class:is-blue={msg.team === 'BLUE'}
                      class:is-spec={msg.team === 'SPEC'}
                      class:is-sys={msg.team === 'SYSTEM'}
                    >
                      {msg.sender}:
                    </span>
                    <span class="mchat-text">{msg.text}</span>
                  </div>
                {/each}
              {/if}
            </div>

            <form class="mobile-menu-chat-form" onsubmit={handleSendMenuChat}>
              <input
                bind:this={menuChatInputEl}
                type="text"
                class="mobile-chat-input"
                maxlength="140"
                placeholder="Escribe en el chat de la sala..."
                bind:value={menuChatInput}
              />
              <button
                type="submit"
                class="mobile-chat-send-btn"
                disabled={gameUI.chatCooldownActive || !menuChatInput.trim()}
              >
                {gameUI.chatCooldownActive ? 'Espera...' : 'Enviar'}
              </button>
            </form>
          </div>
        </div>
      {/if}
    </div>

    <!-- Indicador inferior reactivo del carrusel móvil -->
    {#if gameUI.isMobileLayout}
      <nav class="mobile-carousel-indicator" aria-label="Indicador de vistas del menú">
        <button
          type="button"
          class="carousel-pill is-stats"
          class:is-active={currentSlide === 0}
          onclick={() => goToSlide(0)}
        >
          <span class="pill-arrow" aria-hidden="true">‹</span>
          <span class="pill-dot" aria-hidden="true"></span>
          <span class="pill-label">Stats</span>
        </button>

        <button
          type="button"
          class="carousel-pill is-menu"
          class:is-active={currentSlide === 1}
          onclick={() => goToSlide(1)}
        >
          <span class="pill-dot" aria-hidden="true"></span>
          <span class="pill-label">Jugadores</span>
        </button>

        {#if canSeeRoomSettings}
          <button
            type="button"
            class="carousel-pill is-settings"
            class:is-active={currentSlide === 2}
            onclick={() => goToSlide(2)}
          >
            <span class="pill-dot" aria-hidden="true"></span>
            <span class="pill-label">Ajustes</span>
          </button>
        {/if}

        <button
          type="button"
          class="carousel-pill is-chat"
          class:is-active={currentSlide === chatSlideIndex}
          onclick={() => goToSlide(chatSlideIndex)}
        >
          <span class="pill-dot" aria-hidden="true"></span>
          <span class="pill-label">Chat</span>
          {#if unreadChatCount > 0}
            <span class="pill-unread-badge">{unreadChatCount > 9 ? '9+' : unreadChatCount}</span>
          {/if}
          <span class="pill-arrow" aria-hidden="true">›</span>
        </button>
      </nav>
    {/if}
  </div>

  <!-- Menú Contextual: Organización de Posición (Capitán en su equipo) + Moderación (Admin/Host) -->
  {#if contextMenu.visible && contextMenu.player}
    {@const ctxPlayer = contextMenu.player}
    {@const canAssignPos = (ctxPlayer.team === 'red' || ctxPlayer.team === 'blue') && gameUI.canManageTeamPositions(ctxPlayer.team)}
    {@const canModerate = gameUI.isAdmin || gameUI.isHost}
    <div
      class="context-menu-backdrop"
      role="button"
      tabindex="-1"
      aria-label="Cerrar menú contextual"
      onclick={closeContextMenu}
      onkeydown={(e) => { if (e.key === 'Escape') closeContextMenu(); }}
      oncontextmenu={(e) => { e.preventDefault(); closeContextMenu(); }}
    ></div>
    <div
      class="admin-context-menu"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
    >
      <div class="menu-target-header">
        <span class="target-name">{ctxPlayer.name || ctxPlayer.nickname}</span>
      </div>

      {#if canAssignPos}
        <div class="ctx-position-section">
          <span class="ctx-pos-label">Posición en cancha:</span>
          <div class="ctx-pos-grid">
            {#each PLAYER_POSITIONS as posOpt (posOpt)}
              <button
                type="button"
                class="ctx-pos-btn role-{posOpt.toLowerCase()}"
                class:is-current={ctxPlayer.position === posOpt}
                onclick={() => handleContextAssignPosition(posOpt)}
              >
                {posOpt}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if ctxPlayer.isBot && canManageBots}
        <div class="ctx-position-section" data-testid="ctx-bot-difficulty">
          <span class="ctx-pos-label">Dificultad del Bot:</span>
          <div class="ctx-bot-diff-grid">
            {#each [['easy', 'Fácil'], ['medium', 'Medio'], ['hard', 'Difícil']] as [diffKey, diffLabel] (diffKey)}
              <button
                type="button"
                class="ctx-pos-btn"
                class:is-current={(ctxPlayer.botDifficulty ?? 'medium') === diffKey}
                onclick={() => {
                  gameUI.setBotDifficulty(ctxPlayer.id, diffKey as 'easy' | 'medium' | 'hard');
                  closeContextMenu();
                }}
              >
                {diffLabel}
              </button>
            {/each}
          </div>
          <button
            type="button"
            class="context-menu-item item-danger"
            onclick={() => {
              gameUI.removeBot(ctxPlayer.id);
              closeContextMenu();
            }}
          >
            <span>Eliminar Bot</span>
          </button>
        </div>
      {:else if canModerate}
        {#if ctxPlayer.team !== 'red'}
          <button
            type="button"
            class="context-menu-item item-move-red"
            onclick={() => handleContextMoveTeam('red')}
          >
            <span>Mover a Rojo</span>
          </button>
        {/if}
        {#if ctxPlayer.team !== 'spectator'}
          <button
            type="button"
            class="context-menu-item item-move-spec"
            onclick={() => handleContextMoveTeam('spectator')}
          >
            <span>Mover al Banquillo</span>
          </button>
        {/if}
        {#if ctxPlayer.team !== 'blue'}
          <button
            type="button"
            class="context-menu-item item-move-blue"
            onclick={() => handleContextMoveTeam('blue')}
          >
            <span>Mover a Azul</span>
          </button>
        {/if}
        {#if !ctxPlayer.isHost}
          <button
            type="button"
            class="context-menu-item"
            onclick={() => {
              soundFX.playUIClick();
              gameUI.togglePlayerAdmin(ctxPlayer.id);
              closeContextMenu();
            }}
          >
            <span>{ctxPlayer.isAdmin ? '✕ Quitar Admin' : '★ Dar Admin'}</span>
          </button>
          {#if ctxPlayer.id !== gameUI.localPlayerId}
            <button
              type="button"
              class="context-menu-item item-danger"
              onclick={() => {
                soundFX.playUIClick();
                gameUI.kickPlayer(ctxPlayer.id);
                closeContextMenu();
              }}
            >
              <span>Expulsar (Kick)</span>
            </button>
            <button
              type="button"
              class="context-menu-item item-danger"
              onclick={() => {
                soundFX.playUIClick();
                gameUI.banPlayer(ctxPlayer.id);
                closeContextMenu();
              }}
            >
              <span>Banear (Ban)</span>
            </button>
          {/if}
        {:else}
          <div class="context-menu-item disabled">
            <span>Anfitrión (Inmutable)</span>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30;
    padding: 0;
    pointer-events: none;
    user-select: none;
  }

  .corridor-viewport {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 30;
    overflow: hidden;
  }

  .corridor-container {
    position: fixed;
    top: 48px;
    bottom: calc(var(--chat-height, 148px) + 12px);
    left: 50%;
    transform: translateX(-50%);
    width: min(95vw, 1140px);
    max-height: calc(100dvh - var(--chat-height, 148px) - 62px);
    pointer-events: none;
  }

  .corridor-slide {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
  }

  .corridor-slide.is-active {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
    z-index: 30;
  }

  .corridor-slide.slide-out-left {
    transform: translateX(-115%);
    opacity: 0;
    pointer-events: none;
    z-index: 20;
  }

  .corridor-slide.slide-out-right {
    transform: translateX(115%);
    opacity: 0;
    pointer-events: none;
    z-index: 20;
  }

  .team-modal-card {
    width: 100%;
    height: 100%;
    max-height: 100%;
    background: rgba(10, 16, 26, 0.96);
    border: 1px solid rgba(0, 229, 255, 0.45);
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #dde2f1;
    box-shadow: 0 0 35px rgba(0, 229, 255, 0.22), 0 10px 30px rgba(0, 0, 0, 0.8);
    font-family: 'Chivo', system-ui, sans-serif;
    pointer-events: auto;
  }

  .external-nav-tab {
    border-radius: 8px;
    padding: 12px 13px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 800;
    font-size: 12px;
    letter-spacing: 0.05em;
    transition: all 0.2s ease;
    cursor: pointer;
    pointer-events: auto;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    z-index: 40;
    outline: none;
  }

  .right-tab {
    position: absolute;
    right: -84px;
    top: 50%;
    transform: translateY(-50%);
    background: #00e5ff;
    color: #0a101a;
    border: 2px solid #a5f3fc;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.55);
  }

  .right-tab:hover {
    background: #38bdf8;
    transform: translateY(-50%) scale(1.05);
  }

  .left-tab {
    position: absolute;
    left: -84px;
    top: 50%;
    transform: translateY(-50%);
    background: #ffd700;
    color: #0a101a;
    border: 2px solid #fff275;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.55);
  }

  .left-tab:hover {
    background: #ffe033;
    transform: translateY(-50%) scale(1.05);
  }

  .nav-chevron {
    font-size: 0.85rem;
    font-weight: 800;
  }

  /* HEADER GENERAL DE SALA */
  .modal-header {
    height: 48px;
    padding: 0 1rem;
    background: rgba(8, 14, 24, 0.9);
    border-bottom: 1px solid rgba(0, 229, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-shrink: 0;
  }

  .room-identity {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
    flex: 1;
  }

  .room-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #ffffff;
    text-transform: uppercase;
    margin: 0;
    max-width: 280px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-divider {
    color: #3b494c;
    font-size: 0.85rem;
  }

  .room-id-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    font-weight: 700;
    color: #00e5ff;
    background: rgba(0, 229, 255, 0.12);
    padding: 0.18rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(0, 229, 255, 0.35);
    white-space: nowrap;
  }

  .match-rules-minicard {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(251, 191, 36, 0.45);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    font-weight: 800;
    color: #fde68a;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .minicard-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .minicard-sep {
    opacity: 0.45;
  }

  .practice-offline-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.66rem;
    font-weight: 800;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.12);
    padding: 0.18rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(255, 215, 0, 0.45);
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .btn-settings-quick,
  .btn-copy-link,
  .btn-leave,
  .btn-close-x {
    padding: 0.32rem 0.65rem;
    border-radius: 0.375rem;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    transition: all 0.15s ease;
    outline: none;
    white-space: nowrap;
  }

  .btn-settings-quick {
    background: rgba(250, 204, 21, 0.12);
    border: 1px solid rgba(250, 204, 21, 0.45);
    color: #fde047;
  }

  .btn-settings-quick:hover {
    background: rgba(250, 204, 21, 0.25);
    border-color: #fde047;
  }

  .header-btn-svg {
    width: 0.85rem;
    height: 0.85rem;
  }

  .btn-copy-link {
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #00e5ff;
  }

  .btn-copy-link:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: #00e5ff;
  }

  .btn-leave {
    background: rgba(255, 51, 102, 0.12);
    border: 1px solid rgba(255, 51, 102, 0.4);
    color: #ff3366;
  }

  .btn-leave:hover {
    background: #ff3366;
    color: #ffffff;
  }

  .btn-close-x {
    background: transparent;
    border: 1px solid rgba(132, 147, 150, 0.3);
    color: #bac9cc;
    padding: 0.32rem 0.55rem;
  }

  .btn-close-x:hover {
    background: #242a35;
    color: #ffffff;
    border-color: #ffffff;
  }

  /* ======================================================== */
  /* SLIDE 1: CANCHA TÁCTICA EN 4 ZONAS + BANQUILLO           */
  /* ======================================================== */
  .pitch-lineup-workspace {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.55rem 0.75rem 0.65rem 0.75rem;
    overflow: hidden;
  }

  .pitch-lineup-workspace.broadcast-3col {
    display: grid;
    grid-template-columns: minmax(0, 1.12fr) minmax(0, 1.16fr) minmax(0, 1.12fr);
    gap: 0.65rem;
    align-items: stretch;
  }

  .broadcast-team-col {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-height: 0;
    min-width: 0;
    background: rgba(11, 16, 26, 0.94);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0.6rem;
    padding: 0.45rem;
    transition: border-color 0.15s ease;
  }

  .broadcast-team-col.red-col { border-color: rgba(239, 68, 68, 0.38); }
  .broadcast-team-col.blue-col { border-color: rgba(56, 189, 248, 0.38); }
  .broadcast-team-col.is-drag-over { border-color: #00e5ff; box-shadow: inset 0 0 18px rgba(0, 229, 255, 0.15); }

  .formation-badge {
    align-self: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    font-weight: 800;
    padding: 0.12rem 0.75rem;
    border-radius: 999px;
    background: #172133;
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #e2e8f0;
    flex-shrink: 0;
  }

  .vertical-half-pitch {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.22rem;
    padding: 0.35rem;
    border-radius: 0.5rem;
    border: 1.5px solid rgba(148, 163, 184, 0.28);
    background: repeating-linear-gradient(
      180deg,
      #141c24 0px,
      #141c24 38px,
      #18212b 38px,
      #18212b 76px
    );
    overflow-y: auto;
    overflow-x: hidden;
  }

  .vpitch-goal-arc {
    position: absolute;
    left: 24%;
    right: 24%;
    top: 0;
    height: 36px;
    border: 1.5px solid rgba(255, 255, 255, 0.18);
    border-top: none;
    border-radius: 0 0 10px 10px;
    pointer-events: none;
  }

  .vpitch-mid-curve {
    position: absolute;
    left: 28%;
    right: 28%;
    bottom: 0;
    height: 26px;
    border: 1.5px solid rgba(255, 255, 255, 0.14);
    border-bottom: none;
    border-radius: 999px 999px 0 0;
    pointer-events: none;
  }

  .pitch-zone-col.vertical-zone {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.2rem 0.18rem;
    border-radius: 0.38rem;
    border: 1px dashed transparent;
  }

  .pitch-zone-col.vertical-zone.is-zone-hover {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
  }

  .zone-players-stack.vertical-stack {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 0.35rem 0.45rem;
    width: 100%;
  }

  .token-ping-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.56rem;
    font-weight: 700;
    color: #34d399;
    line-height: 1;
  }

  .token-bot-badge {
    position: absolute;
    bottom: -3px;
    left: -5px;
    padding: 1px 3px;
    border-radius: 4px;
    background: #0f172a;
    border: 1px solid #38bdf8;
    color: #38bdf8;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.48rem;
    font-weight: 900;
    line-height: 1;
  }

  .team-controls-box {
    flex-shrink: 0;
    border-radius: 0.45rem;
    background: #101724;
    border: 1px solid rgba(148, 163, 184, 0.25);
    overflow: hidden;
  }

  .team-controls-toggle {
    width: 100%;
    padding: 0.3rem 0.55rem;
    border: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.68rem;
    font-weight: 800;
    color: #ffffff;
    cursor: pointer;
  }

  .team-controls-toggle.red-toggle { background: rgba(153, 27, 27, 0.72); }
  .team-controls-toggle.blue-toggle { background: rgba(30, 64, 175, 0.72); }

  .team-controls-actions {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.25rem;
  }

  .tctrl-btn {
    width: 100%;
    padding: 0.26rem 0.5rem;
    border-radius: 0.32rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: #172030;
    color: #e2e8f0;
    font-size: 0.68rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .tctrl-btn:hover:not(:disabled) { border-color: #00e5ff; background: #1e293b; }
  .tctrl-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .broadcast-center-col {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.4rem;
    min-width: 0;
    min-height: 0;
    padding: 0.35rem 0.2rem;
  }

  .center-spec-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.4rem;
    flex-shrink: 0;
  }

  .dugout-middle-row {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.3rem;
  }

  .side-transfer-rail {
    display: flex;
    flex-direction: column;
    gap: 0.32rem;
  }

  .rail-arrow-btn {
    width: 24px;
    height: 30px;
    border-radius: 0.35rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: #182235;
    color: #f8fafc;
    font-weight: 900;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .rail-arrow-btn.is-red { border-color: rgba(239, 68, 68, 0.55); background: rgba(153, 27, 27, 0.5); }
  .rail-arrow-btn.is-blue { border-color: rgba(56, 189, 248, 0.55); background: rgba(30, 64, 175, 0.5); }
  .rail-arrow-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .banquillo-dugout.broadcast-dugout {
    height: 100%;
    min-height: 0;
  }

  .waiting-sub {
    font-size: 0.68rem;
    font-weight: 700;
    color: #94a3b8;
  }

  .banquillo-chairs-grid.broadcast-chairs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.3rem;
    overflow-y: auto;
    overflow-x: hidden;
    align-content: start;
    flex: 1;
  }

  .chair-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.54rem;
    font-weight: 800;
    color: #94a3b8;
    line-height: 1;
  }

  .seat-ping {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.52rem;
    font-weight: 700;
    color: #34d399;
    line-height: 1;
  }

  .seat-empty-plus {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 1.5px dashed rgba(148, 163, 184, 0.45);
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .center-limits-bar {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.45rem;
    padding: 0.36rem 0.5rem;
    border-radius: 0.45rem;
    background: #101724;
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  .limit-pill-group {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.3rem;
    padding: 0.2rem 0.42rem;
    border-radius: 0.32rem;
    background: #0a0f1a;
  }

  .limit-lbl {
    font-size: 0.62rem;
    font-weight: 700;
    color: #94a3b8;
  }

  .limit-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    font-weight: 900;
    color: #f8fafc;
  }

  .ctx-bot-diff-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
    margin-bottom: 0.3rem;
  }

  .pitch-team-bar {
    height: 34px;
    border-radius: 0.4rem;
    padding: 0 0.48rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .red-half.is-drag-over {
    background: rgba(231, 76, 60, 0.14);
  }

  .blue-half.is-drag-over {
    background: rgba(0, 229, 255, 0.14);
  }

  .pitch-zone-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.35rem 0.2rem;
    border-right: 1px dashed rgba(255, 255, 255, 0.08);
    min-height: 0;
    transition: background 0.14s ease;
  }

  .pitch-zone-col:last-child {
    border-right: none;
  }

  .pitch-zone-col.is-zone-hover {
    background: rgba(0, 229, 255, 0.2);
    box-shadow: inset 0 0 12px rgba(0, 229, 255, 0.35);
  }

  .zone-header-pill {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 0.12rem 0.42rem;
    border-radius: 999px;
    background: rgba(8, 13, 23, 0.85);
    border: 1px solid currentColor;
    margin-bottom: 0.35rem;
    flex-shrink: 0;
  }

  .role-gk { color: #fbbf24; }
  .role-dfc { color: #38bdf8; }
  .role-mc { color: #34d399; }
  .role-st { color: #ff6b81; }

  .zone-players-stack {
    flex: 1;
    width: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.15rem 0;
    min-height: 0;
  }

  .pitch-player-token {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.18rem;
    padding: 0.22rem 0.28rem;
    border-radius: 0.45rem;
    background: rgba(8, 14, 24, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.14);
    max-width: 100%;
    transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
  }

  .pitch-player-token:hover {
    background: rgba(15, 23, 42, 0.94);
    border-color: rgba(0, 229, 255, 0.6);
    transform: translateY(-1px);
  }

  .pitch-player-token.is-captain {
    border-color: rgba(251, 191, 36, 0.65);
  }

  .pitch-player-token.is-dragging {
    opacity: 0.4;
  }

  .token-avatar-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .token-crown {
    position: absolute;
    top: -6px;
    right: -6px;
    font-size: 0.65rem;
    line-height: 1;
  }

  .token-captain-c {
    position: absolute;
    bottom: -3px;
    right: -4px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    font-size: 0.56rem;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(0, 0, 0, 0.85);
  }

  .token-nickname {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.66rem;
    font-weight: 700;
    color: #f8fafc;
    max-width: 82px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  /* Banquillo de Espectadores con Sillas Temáticas */
  .banquillo-dugout {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(11, 17, 29, 0.94);
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 0.6rem;
    padding: 0.42rem 0.6rem;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .banquillo-dugout.is-drag-over {
    border-color: #00e5ff;
    background: rgba(0, 229, 255, 0.1);
  }

  .banquillo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .banquillo-title-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .banquillo-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #e2e8f0;
  }

  .banquillo-cap-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.66rem;
    font-weight: 700;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.1rem 0.42rem;
    border-radius: 999px;
  }

  .banquillo-chairs-grid {
    display: flex;
    align-items: stretch;
    gap: 0.38rem;
    overflow-x: auto;
    padding-bottom: 0.15rem;
  }

  .bench-seat-slot {
    position: relative;
    min-width: 60px;
    width: 64px;
    height: 62px;
    flex-shrink: 0;
    border-radius: 0.45rem;
    background: rgba(19, 28, 44, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.22);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.2rem;
    box-sizing: border-box;
  }

  .bench-seat-slot.is-occupied {
    border-color: rgba(0, 229, 255, 0.4);
    background: rgba(24, 34, 54, 0.96);
  }

  .bench-seat-slot.is-empty {
    opacity: 0.45;
  }

  .seat-backrest {
    position: absolute;
    top: 3px;
    left: 10px;
    right: 10px;
    height: 4px;
    border-radius: 3px;
    background: #00e5ff;
    opacity: 0.65;
  }

  .seat-backrest.empty-chair {
    background: #64748b;
    opacity: 0.4;
  }

  .seat-avatar-wrap {
    position: relative;
    margin-top: 4px;
  }

  .seat-crown {
    position: absolute;
    top: -5px;
    right: -5px;
    font-size: 0.58rem;
    line-height: 1;
  }

  .seat-player-name {
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 0.62rem;
    font-weight: 700;
    color: #f1f5f9;
    max-width: 58px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  .seat-empty-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    color: #64748b;
    margin-top: 6px;
  }

  /* ======================================================== */
  /* SLIDE 2: AJUSTES DE SALA (SOLO ADMINS)                   */
  /* ======================================================== */
  .settings-slide-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.85rem 1rem;
  }

  .settings-2col-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
    align-items: start;
  }

  .settings-panel-box {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(0, 229, 255, 0.22);
    border-radius: 0.65rem;
    padding: 0.8rem;
  }

  .settings-fsm-box {
    margin-top: 0.2rem;
  }

  /* Avatars & Reusable Controls */
  .slot-avatar {
    width: 30px;
    height: 30px;
    min-width: 30px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .slot-avatar.red {
    background: var(--captain-local-primary, #e74c3c);
    color: var(--captain-local-tertiary, #ffffff);
    box-shadow: 0 0 8px var(--captain-local-primary, rgba(231, 76, 60, 0.5));
  }

  .slot-avatar.spec {
    width: 26px;
    height: 26px;
    min-width: 26px;
    font-size: 0.66rem;
    background: #2f3540;
    color: #dde2f1;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .slot-avatar.blue {
    background: var(--captain-visitor-primary, #00e5ff);
    color: var(--captain-visitor-tertiary, #ffffff);
    box-shadow: 0 0 8px var(--captain-visitor-primary, rgba(0, 229, 255, 0.5));
  }

  .cursor-grab { cursor: grab; }
  .cursor-grab:active { cursor: grabbing; }
  .cursor-not-allowed { cursor: default; }

  .rules-4btn-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    width: 100%;
  }

  .rule-svg {
    width: 0.85rem;
    height: 0.85rem;
    color: #00e5ff;
    flex-shrink: 0;
  }

  .rule-cartouche,
  .rule-cartouche-btn {
    position: relative;
    height: 38px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.6rem;
    background: rgba(16, 24, 38, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 0.5rem;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .rule-cartouche:hover,
  .rule-cartouche-btn:hover:not(:disabled) {
    border-color: #00e5ff;
  }

  .rule-cartouche-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .rule-cartouche-content {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    pointer-events: none;
    min-width: 0;
  }

  .rule-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
  }

  .rule-arrow {
    font-size: 10px;
    color: #00e5ff;
    pointer-events: none;
  }

  .rule-select-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 10;
  }

  .rule-select-overlay option {
    background: #080e18;
    color: #dde2f1;
  }

  .lock-teams-btn {
    color: #dde2f1;
  }

  .lock-teams-btn.active-locked {
    border-color: rgba(251, 191, 36, 0.6);
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
  }

  .lock-label {
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .lock-tag {
    font-size: 9px;
    background: #0e1726;
    color: #00e5ff;
    padding: 2px 5px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 800;
  }

  .auto-reset-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    width: 100%;
    height: 38px;
  }

  .btn-auto-balance {
    background: rgba(0, 229, 255, 0.1);
    border-color: rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    justify-content: center;
  }

  .btn-reset-teams {
    background: rgba(255, 71, 87, 0.1);
    border-color: rgba(255, 71, 87, 0.4);
    color: #ff6b81;
    justify-content: center;
  }

  .btn-modifiers {
    background: rgba(251, 191, 36, 0.1);
    border-color: rgba(251, 191, 36, 0.4);
    color: #fcd34d;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
  }

  .stadium-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .param-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #849396;
  }

  .stadium-preview-box {
    position: relative;
    width: 100%;
    aspect-ratio: 2 / 1;
    min-height: 105px;
    max-height: 145px;
    border-radius: 0.5rem;
    overflow: hidden;
    background: #07170e;
    border: 1px solid rgba(0, 229, 255, 0.35);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stadium-canvas-wrap {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .stadium-overlay {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    background: rgba(10, 16, 26, 0.94);
    border: 1px solid rgba(0, 229, 255, 0.4);
    padding: 6px 14px;
    border-radius: 0.5rem;
  }

  .stadium-name {
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
  }

  .stadium-action-text {
    font-size: 10px;
    font-weight: 600;
    color: #00e5ff;
  }

  .advanced-settings-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card-micro-title {
    font-size: 0.68rem;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.05em;
  }

  .adv-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .adv-row label {
    font-size: 0.65rem;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .styled-adv-input {
    background: #080e18;
    border: 1px solid rgba(59, 73, 76, 0.6);
    border-radius: 0.25rem;
    padding: 0.34rem 0.5rem;
    font-size: 0.78rem;
    color: #ffffff;
    outline: none;
  }

  .adv-capacity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
  }

  .adv-label { color: #cbd5e1; }

  .cap-stepper {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #080e18;
    border: 1px solid rgba(59, 73, 76, 0.5);
    border-radius: 0.25rem;
    padding: 0.15rem 0.35rem;
  }

  .cap-step-btn {
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 0.25rem;
    background: #1a202a;
    border: none;
    color: #00e5ff;
    font-weight: 700;
    cursor: pointer;
  }

  .cap-num-val {
    min-width: 1.3rem;
    text-align: center;
    font-weight: 700;
    color: #ffffff;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .toggle-label { font-size: 11px; font-weight: 600; color: #dde2f1; }

  .switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 18px;
  }

  .switch input { opacity: 0; width: 0; height: 0; }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: #1a202a;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 18px;
    transition: 0.2s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 12px;
    width: 12px;
    left: 2px;
    bottom: 2px;
    background-color: #ffffff;
    border-radius: 50%;
    transition: 0.2s;
  }

  input:checked + .slider {
    background-color: rgba(0, 229, 255, 0.4);
    border-color: #00e5ff;
  }

  input:checked + .slider:before {
    transform: translateX(18px);
    background-color: #00e5ff;
  }

  .fsm-footer-controls {
    padding-top: 0.65rem;
    border-top: 1px solid rgba(0, 229, 255, 0.25);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .btn-start-match {
    width: 100%;
    padding: 0.72rem;
    background: #2ecc71;
    border: none;
    border-radius: 0.5rem;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 900;
    color: #050811;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .btn-start-match:disabled { opacity: 0.4; cursor: not-allowed; }

  .fsm-running-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .btn-stop-match {
    padding: 0.65rem;
    background: #ff3366;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.78rem;
    font-weight: 900;
    color: #ffffff;
    cursor: pointer;
  }

  .btn-pause-match {
    padding: 0.65rem;
    border: 1.5px solid #38bdf8;
    background: #0284c7;
    color: #ffffff;
    border-radius: 0.5rem;
    font-size: 0.78rem;
    font-weight: bold;
    cursor: pointer;
  }

  /* Kit toggles & Headers */
  .captain-bicolor-header {
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.8);
  }

  .bench-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .kit-variant-toggles {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 1px;
  }

  .kit-variant-btn {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 5px;
    border-radius: 3px;
    cursor: pointer;
  }

  .kit-variant-btn.active {
    background: #ffffff;
    color: #000000;
    font-weight: 800;
  }

  .kit-variant-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .team-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bench-join-btn {
    border: 1px solid rgba(255, 255, 255, 0.38);
    background: rgba(8, 14, 24, 0.78);
    color: #ffffff;
    font-size: 0.62rem;
    font-weight: 800;
    padding: 3px 7px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .bench-join-btn:hover:not(:disabled) {
    background: #00e5ff;
    color: #050811;
    border-color: #00e5ff;
  }

  .bench-join-btn:disabled { opacity: 0.38; cursor: not-allowed; }

  /* Context Menu */
  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: transparent;
    pointer-events: auto;
  }

  .admin-context-menu {
    position: fixed;
    z-index: 9999;
    background: rgba(10, 16, 26, 0.98);
    border: 1px solid rgba(0, 229, 255, 0.45);
    border-radius: 0.55rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.85), 0 0 16px rgba(0, 229, 255, 0.25);
    min-width: 195px;
    padding: 0.45rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    pointer-events: auto;
  }

  .menu-target-header {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.78rem;
    font-weight: 800;
    color: #00e5ff;
  }

  .ctx-position-section {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.3rem 0.4rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .ctx-pos-label {
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .ctx-pos-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
  }

  .ctx-pos-btn {
    padding: 0.28rem 0.2rem;
    border-radius: 0.32rem;
    border: 1px solid currentColor;
    background: rgba(15, 23, 42, 0.9);
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
    text-align: center;
  }

  .ctx-pos-btn.is-current {
    background: rgba(255, 255, 255, 0.18);
    box-shadow: 0 0 8px currentColor;
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.42rem 0.6rem;
    border-radius: 0.35rem;
    background: transparent;
    border: none;
    color: #dde2f1;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
  }

  .context-menu-item:hover:not(.disabled) {
    background: rgba(0, 229, 255, 0.15);
    color: #00e5ff;
  }

  .context-menu-item.item-move-red { color: #ff6b81; }
  .context-menu-item.item-move-spec { color: #cbd5e1; }
  .context-menu-item.item-move-blue { color: #38bdf8; }
  .context-menu-item.item-danger { color: #ff4757; }
  .context-menu-item.disabled { opacity: 0.5; cursor: not-allowed; }

  /* Stats Slide */
  .stats-header-row {
    padding: 0.8rem 1.15rem;
    background: #080e18;
    border-bottom: 1px solid rgba(0, 229, 255, 0.28);
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) auto minmax(0, 0.9fr);
    align-items: center;
    flex-shrink: 0;
    gap: 0.85rem;
  }

  .stats-hero-matchup {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    background: #0d1626;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 0.65rem;
    padding: 0.35rem 0.7rem;
  }

  .hero-team-side { display: flex; align-items: center; gap: 0.45rem; }

  .hero-team-label {
    font-size: 0.82rem;
    font-weight: 800;
    color: #e2e8f0;
    max-width: 115px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stats-hero-score {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.6rem;
    border-radius: 0.45rem;
    background: #070c16;
  }

  .stats-score-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.55rem;
    font-weight: 900;
    color: #ffffff;
  }

  .stats-score-sep { color: #849396; font-weight: 700; }

  .stats-center-zone { justify-self: center; display: flex; align-items: center; }

  .stats-acronym-badge {
    min-width: 64px;
    height: 34px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    font-size: 0.9rem;
    font-weight: 900;
  }

  .match-status-meta {
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .match-result-chip {
    font-size: 0.72rem;
    font-weight: 800;
    color: #00e5ff;
    background: #0d1626;
    border: 1px solid rgba(0, 229, 255, 0.35);
    padding: 0.22rem 0.55rem;
    border-radius: 0.32rem;
  }

  .match-time-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: #ffe16d;
    background: #080e18;
    padding: 0.22rem 0.5rem;
    border-radius: 0.32rem;
    border: 1px solid rgba(255, 219, 60, 0.3);
  }

  .mvp-golden-plaque {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #17140a;
    border: 1px solid #ffe16d;
    padding: 0.3rem 0.7rem;
    border-radius: 0.42rem;
  }

  .crown-svg { width: 1rem; height: 1rem; color: #ffe16d; }
  .crown-svg-sm { width: 0.85rem; height: 0.85rem; color: #ffe16d; }
  .mvp-title { font-size: 0.82rem; font-weight: 800; color: #ffe16d; }
  .mvp-points-chip { font-size: 0.72rem; font-weight: 700; color: #ffe16d; }
  .mvp-mini-line { font-size: 0.7rem; font-weight: 700; color: #f8fafc; }

  .tables-parallel-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    flex: 1;
    min-height: 0;
    padding: 0.75rem 1rem 1rem 1rem;
  }

  .team-table-box {
    background: rgba(8, 14, 24, 0.85);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .team-table-box.red-box { border: 1px solid var(--captain-local-primary, #e74c3c); }
  .team-table-box.blue-box { border: 1px solid var(--captain-visitor-primary, #3498db); }

  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.45rem 0.6rem;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .table-header-left { display: flex; align-items: center; gap: 0.45rem; }
  .col-team-name-hdr { font-size: 0.78rem; font-weight: 800; }

  .team-expand-all-btn {
    padding: 0.14rem 0.45rem;
    border-radius: 0.3rem;
    background: rgba(8, 14, 24, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.28);
    color: #f8fafc;
    font-size: 0.62rem;
    font-weight: 700;
    cursor: pointer;
  }

  .col-headers-right { display: flex; align-items: center; }
  .col-player { flex: 1; text-align: left; }
  .col-pts { width: 44px; text-align: right; }
  .col-stat { width: 26px; text-align: center; }
  .col-arrow { width: 20px; text-align: center; }

  .table-scroll-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.32rem;
  }

  .player-stat-row {
    background: rgba(22, 28, 38, 0.75);
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .row-summary {
    display: flex;
    align-items: center;
    padding: 0.42rem 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.74rem;
    cursor: pointer;
  }

  .col-player.bold { font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 0.3rem; }
  .col-player.gold-player { color: #ffe16d; }
  .badge-cap.red { color: #ff4757; font-weight: 900; }
  .badge-cap.blue { color: #00e5ff; font-weight: 900; }
  .host-tag { font-size: 0.64rem; color: #849396; }
  .col-pts.red-txt { color: #ff4757; font-weight: 800; }
  .col-pts.blue-txt { color: #00e5ff; font-weight: 800; }
  .col-pts.gold-txt { color: #ffe16d; font-weight: 900; }

  .accordion-drawer {
    padding: 0.4rem 0.6rem;
    background: rgba(8, 14, 24, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .drawer-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.3rem;
    text-align: center;
  }

  .drawer-chip {
    background: #161c26;
    padding: 0.22rem;
    border-radius: 0.25rem;
    display: flex;
    flex-direction: column;
  }

  .chip-label { font-size: 0.62rem; color: #849396; }
  .chip-val { font-size: 0.72rem; font-weight: 800; }
  .text-cyan { color: #00e5ff; }
  .text-green { color: #2ecc71; }
  .text-gold { color: #ffe16d; }
  .text-error { color: #ff4757; }
  .text-muted { color: #849396; }

  /* Mobile Carousel & Chat */
  .mobile-menu-telemetry {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.66rem;
    font-weight: 700;
    padding: 0.16rem 0.44rem;
    border-radius: 999px;
    background: rgba(8, 14, 24, 0.92);
    border: 1px solid rgba(0, 229, 255, 0.35);
    color: #67e8f9;
  }

  .mobile-menu-telemetry.is-good { color: #4ade80; }
  .mobile-menu-telemetry.is-mid { color: #fbbf24; }
  .mobile-menu-telemetry.is-high { color: #f87171; }

  .m-tel-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .mobile-carousel-indicator {
    position: fixed;
    left: 50%;
    bottom: max(6px, env(safe-area-inset-bottom, 6px));
    transform: translateX(-50%);
    z-index: 45;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.26rem 0.6rem;
    border-radius: 999px;
    background: rgba(8, 14, 24, 0.94);
    border: 1px solid rgba(0, 229, 255, 0.32);
    pointer-events: auto;
  }

  .carousel-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.26rem;
    padding: 0.2rem 0.48rem;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: #94a3b8;
    font-size: 0.66rem;
    font-weight: 700;
    opacity: 0.65;
    cursor: pointer;
  }

  .carousel-pill.is-active {
    opacity: 1;
    color: #06101c;
    background: #00e5ff;
  }

  .carousel-pill.is-stats.is-active {
    background: #ffd700;
  }

  .carousel-pill .pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }

  .pill-unread-badge {
    padding: 0 0.32rem;
    border-radius: 999px;
    background: #ff4757;
    color: #ffffff;
    font-size: 0.58rem;
    font-weight: 800;
  }

  .mobile-menu-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.65rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .mobile-chat-empty { margin: auto; text-align: center; font-size: 0.8rem; color: #94a3b8; }
  .mobile-chat-row { font-size: 0.78rem; padding: 0.26rem 0.5rem; border-radius: 6px; background: rgba(15, 23, 42, 0.65); }
  .mchat-sender { font-weight: 800; margin-right: 0.35rem; }
  .mchat-sender.is-red { color: #ff6b81; }
  .mchat-sender.is-blue { color: #38bdf8; }
  .mchat-sender.is-spec { color: #cbd5e1; }
  .mchat-sender.is-sys { color: #facc15; }
  .mobile-menu-chat-form { display: flex; gap: 0.45rem; padding: 0.5rem 0.7rem; background: rgba(8, 14, 24, 0.92); }
  .mobile-chat-input { flex: 1; height: 34px; padding: 0 0.65rem; border-radius: 8px; border: 1px solid rgba(0, 229, 255, 0.35); background: rgba(15, 23, 42, 0.9); color: #ffffff; font-size: 0.8rem; }
  .mobile-chat-send-btn { height: 34px; padding: 0 0.8rem; border-radius: 8px; border: 1px solid rgba(0, 229, 255, 0.65); background: rgba(0, 229, 255, 0.2); color: #e0f2fe; font-size: 0.75rem; font-weight: 800; cursor: pointer; }

  .stats-empty-mobile { margin: auto; max-width: 360px; padding: 1.25rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.7rem; }
  .stats-empty-badge { font-size: 0.68rem; font-weight: 800; color: #ffd700; }
  .stats-empty-desc { margin: 0; font-size: 0.8rem; color: #94a3b8; }
  .stats-empty-back-btn { padding: 0.45rem 0.9rem; border-radius: 8px; border: 1px solid rgba(0, 229, 255, 0.55); background: rgba(0, 229, 255, 0.16); color: #67e8f9; font-weight: 700; cursor: pointer; }

  .custom-scrollbar::-webkit-scrollbar,
  .custom-scrollbar-red::-webkit-scrollbar { width: 4px; height: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 229, 255, 0.35); border-radius: 4px; }
  .custom-scrollbar-red::-webkit-scrollbar-thumb { background: rgba(255, 51, 102, 0.35); border-radius: 4px; }

  /* Responsive Mobile Landscape & Compact Touch Viewports */
  @media (max-height: 520px), (max-width: 960px) {
    .corridor-container,
    .corridor-container.is-mobile-carousel {
      top: calc(36px + env(safe-area-inset-top, 0px));
      bottom: calc(38px + env(safe-area-inset-bottom, 0px));
      width: min(98vw, 1140px);
      max-height: calc(100dvh - 76px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    }

    .modal-header {
      height: 36px;
      padding: 0 0.55rem;
    }

    .room-title {
      font-size: 0.78rem;
      max-width: 140px;
    }

    .match-rules-minicard {
      padding: 0.12rem 0.42rem;
      font-size: 0.62rem;
      gap: 0.3rem;
    }

    .btn-settings-quick,
    .btn-copy-link,
    .btn-leave,
    .btn-close-x {
      padding: 0.2rem 0.45rem;
      font-size: 0.62rem;
      min-height: 24px;
    }

    .pitch-lineup-workspace {
      padding: 0.32rem 0.45rem;
      gap: 0.28rem;
    }

    .pitch-team-bar {
      height: 28px;
      padding: 0 0.4rem;
    }

    .team-name { font-size: 0.65rem; }

    .zone-header-pill {
      font-size: 0.56rem;
      padding: 0.08rem 0.3rem;
      margin-bottom: 0.2rem;
    }

    .slot-avatar { width: 22px; height: 22px; min-width: 22px; font-size: 0.62rem; }
    .token-nickname { font-size: 0.58rem; max-width: 58px; }

    .banquillo-dugout {
      padding: 0.26rem 0.45rem;
      gap: 0.22rem;
    }

    .banquillo-chairs-grid.broadcast-chairs {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.2rem;
    }

    .bench-seat-slot {
      min-width: 0;
      width: 100%;
      height: 50px;
      gap: 0.08rem;
    }

    .pitch-lineup-workspace.broadcast-3col {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) minmax(0, 1fr);
      gap: 0.3rem;
      padding: 0.28rem 0.35rem;
    }

    .stats-header-row {
      grid-template-columns: 1fr;
      padding: 0.5rem 0.65rem;
      gap: 0.45rem;
    }

    .stats-hero-matchup,
    .stats-center-zone,
    .match-status-meta {
      justify-self: center;
      flex-wrap: wrap;
    }

    .slot-avatar.spec { width: 20px; height: 20px; min-width: 20px; font-size: 0.56rem; }
    .seat-player-name { font-size: 0.54rem; max-width: 46px; }

    .settings-2col-grid {
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .settings-panel-box {
      padding: 0.5rem;
      gap: 0.45rem;
    }
  }

  @media (max-width: 680px) {
    .pitch-lineup-workspace.broadcast-3col {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.22rem;
    }
    .banquillo-chairs-grid.broadcast-chairs {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .side-transfer-rail { display: none; }
    .settings-2col-grid,
    .tables-parallel-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
