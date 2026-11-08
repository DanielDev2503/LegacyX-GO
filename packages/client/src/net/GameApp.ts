import { SignalingClient, sharedSignaling } from './SignalingClient.js';
import { NetworkHost, type PlayerInfo } from './NetworkHost.js';
import { NetworkClient } from './NetworkClient.js';
import { gameUI, type RosterPlayer, type ChatEntry } from '../ui/state/gameUI.svelte.js';
import { userProfile } from '../ui/state/userProfile.svelte.js';
import { soundFX } from '../audio/SoundFX.js';
import { triggerPitchEmote } from '../renderer/DiscRenderer.js';
import type { PlayerInput } from '@legacyx/core';

export interface CreateRoomParams {
  name: string;
  stadium: string;
  isPublic?: boolean;
  password?: string;
  maxPlayers?: number;
  timeLimit?: number;
  scoreLimit?: number;
  teamsLocked?: boolean;
  allowCaptainKitSwitch?: boolean;
  roomType?: 'casual' | 'ranked';
}

export function hasChatMentionForUser(
  text: string,
  localNickname: string,
  sender?: string
): boolean {
  if (!text) return false;
  if (sender && localNickname && sender.toLowerCase() === localNickname.toLowerCase()) {
    return false;
  }
  const lower = text.toLowerCase();
  if (/(^|\s)@all(\b|\s|[.,!?:;]|$)/i.test(lower)) {
    return true;
  }
  const cleanLocal = (localNickname || '').trim().toLowerCase();
  if (!cleanLocal) return false;
  const escaped = cleanLocal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)@${escaped}(\\b|\\s|[.,!?:;]|$)`, 'i').test(lower);
}

export interface RoomConfigPatch {
  name?: string;
  stadiumId?: string;
  maxPlayers?: number;
  isPrivate?: boolean;
  password?: string;
  teamsLocked?: boolean;
  timeLimit?: number;
  scoreLimit?: number;
  redKitVariant?: 'home' | 'away';
  blueKitVariant?: 'home' | 'away';
  allowCaptainKitSwitch?: boolean;
  gameplayConfig?: Record<string, unknown>;
  modifiers?: Record<string, unknown>;
}

/** Acciones que un Admin no-Host puede delegar al Host vía `ADMIN_ACTION`. */
const ADMIN_RULE_KEYS = ['stadiumId', 'timeLimit', 'scoreLimit', 'teamsLocked'] as const;

function toChatTeam(team?: string): ChatEntry['team'] {
  if (team === 'red') return 'RED';
  if (team === 'blue') return 'BLUE';
  if (team === 'system') return 'SYSTEM';
  return 'SPEC';
}

export function mapPlayersToRoster(players: PlayerInfo[]): RosterPlayer[] {
  return players.map((p) => {
    const nick = p.nickname || p.name || `Player ${p.id}`;
    return {
      id: p.id,
      peerId: p.peerId,
      nickname: nick,
      name: p.name || nick,
      number: p.number ?? p.id,
      avatar: p.avatar || nick.slice(0, 2).toUpperCase(),
      avatarType: p.avatarType || 'letters',
      team: p.team,
      isAdmin: Boolean(p.isHost || p.isAdmin),
      isHost: Boolean(p.isHost),
      ping: p.ping ?? 20,
      kit: p.kit ?? p.localKit,
      localKit: p.localKit ?? p.kit,
      visitorKit: p.visitorKit ?? p.kit
    };
  });
}

export class GameApp {
  public signaling: SignalingClient;
  public networkHost: NetworkHost | null = null;
  public networkClient: NetworkClient | null = null;
  public isHost: boolean = false;
  public currentRoomId: string | null = null;
  public currentRoomConfig: CreateRoomParams | null = null;
  /** Inputs de jugadores remotos recibidos por el Host (playerId → máscara). */
  public remoteInputs = new Map<number, PlayerInput>();
  public activeMatchToken: string | null = null;
  public lastJoinError: string | null = null;
  public onScoreEventReceived: ((payload: Record<string, unknown>) => void) | null = null;

  constructor(signaling: SignalingClient = sharedSignaling) {
    this.signaling = signaling;

    gameUI.onLeaveRoom = () => this.leaveCurrentRoom();
    gameUI.onRoomConfigChanged = (patch: RoomConfigPatch) => this.updateRoomConfig(patch);
    gameUI.onAdminAction = (action: string, payload?: any) => this.dispatchAdminAction(action, payload);
    gameUI.onProfileUpdated = () => this.syncPlayerProfile();

    this.signaling.on('RANKED_MATCH_TOKEN', (msg: any) => {
      if (typeof msg?.matchToken === 'string' && msg.matchToken) {
        this.activeMatchToken = msg.matchToken;
      }
    });
    this.signaling.on('RANKED_MATCH_RESULT', (msg: any) => {
      if (msg?.ok) {
        void userProfile.fetchLeaderboard(userProfile.leaderboardCategory);
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.currentRoomId) this.leaveCurrentRoom();
      });
    }
  }

  private getLocalProfile() {
    const nickname = (gameUI.nickname || 'Jugador').trim() || 'Jugador';
    const avatar = (gameUI.avatarValue || '').trim() || nickname.slice(0, 2).toUpperCase();
    return {
      nickname,
      avatar,
      avatarType: gameUI.avatarMode || 'letters',
      kit: { ...gameUI.settings.localKit },
      localKit: { ...gameUI.settings.localKit },
      visitorKit: { ...gameUI.settings.visitorKit }
    };
  }

  private syncLocalRole(): void {
    const me = gameUI.rosterPlayers.find(
      (p) => p.id === gameUI.localPlayerId || p.peerId === this.signaling.peerId
    );
    if (me) {
      gameUI.localPlayerId = me.id;
      gameUI.isAdmin = Boolean(me.isAdmin || me.isHost);
    }
    if (gameUI.activeRoom) {
      gameUI.activeRoom.playersCount = gameUI.rosterPlayers.length;
    }
  }

  private pushChat(sender: string, text: string, team?: string, isHost?: boolean, id?: string): void {
    const isSys = team === 'system';
    if (isSys) {
      soundFX.playPlayerJoinedSound();
      const msgId = id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      gameUI.addChatMessage({
        id: msgId,
        team: 'SYSTEM',
        senderTeam: 'system',
        sender: '',
        isHost: false,
        isSystem: true,
        text
      });
      return;
    }

    // Comprobar si el emisor es espectador: si lo es, jamás activa emote y siempre se muestra en chat
    const player = gameUI.rosterPlayers.find((p) => p.nickname === sender || p.name === sender);
    const playerTeam = team || player?.team;
    const isSpectator = playerTeam === 'spectator' || playerTeam === 'spectators' || playerTeam === 'spec' || playerTeam === 'SPEC';
    const emoteEmoji = isSpectator ? null : gameUI.matchEmoteTrigger(text);
    const playerId = player ? player.id : (isHost ? 1 : null);

    if (emoteEmoji && gameUI.settings.showPitchEmotes !== false) {
      if (playerId !== null) {
        triggerPitchEmote(playerId, emoteEmoji);
      }
      if (gameUI.settings.chatEmotesSoundEnabled !== false) {
        soundFX.playPitchEmoteSound();
      }
      return; // Ocultar comando del feed de chat cuando los emotes en cancha están activados
    }

    if (hasChatMentionForUser(text, gameUI.nickname, sender)) {
      soundFX.playChatMentionSound();
    } else {
      soundFX.playChatMessageSound();
    }
    const msgId = id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    gameUI.addChatMessage({
      id: msgId,
      team: isSpectator ? 'SPEC' : toChatTeam(team),
      senderTeam: isSpectator ? 'spectator' : (toChatTeam(team).toLowerCase() as any),
      sender,
      isHost: Boolean(isHost),
      isSystem: false,
      text
    });
  }

  private showEmote(playerId: number, emoji: string): void {
    if (gameUI.settings.showPitchEmotes !== false) {
      triggerPitchEmote(playerId, emoji);
      if (gameUI.settings.chatEmotesSoundEnabled !== false) {
        soundFX.playPitchEmoteSound();
      }
    }
  }

  public playAndApplyGameFx(fx: string, intensity?: number, countdownValue?: number): void {
    switch (fx) {
      case 'kick':
        soundFX.playKick(intensity ?? 1.0);
        break;
      case 'power_shot':
        soundFX.playKick(intensity ?? 1.8);
        break;
      case 'post':
        soundFX.playPostHit();
        if (gameUI.screenShake) {
          gameUI.onTriggerShake?.(7, 220);
        }
        break;
      case 'wall':
        soundFX.playBounce();
        break;
      case 'goal':
        soundFX.playGoalHorn();
        soundFX.playWhistle();
        if (gameUI.screenShake) {
          gameUI.onTriggerShake?.(15, 500);
        }
        break;
      case 'whistle':
        soundFX.playWhistle();
        break;
      case 'countdown_tick':
        soundFX.playCountdown(countdownValue === 0);
        break;
    }
  }

  public syncPlayerProfile(): void {
    const profile = this.getLocalProfile();
    if (this.isHost && this.networkHost) {
      const hostPlayer = (this.networkHost as any).players?.get(1);
      if (hostPlayer) {
        hostPlayer.nickname = profile.nickname;
        hostPlayer.name = profile.nickname;
        hostPlayer.avatar = profile.avatar;
        hostPlayer.avatarType = profile.avatarType;
        hostPlayer.localKit = profile.localKit;
        hostPlayer.visitorKit = profile.visitorKit;
        hostPlayer.kit = profile.localKit;
      }
      this.networkHost.broadcastRoomStateSync();
    } else if (!this.isHost && this.networkClient) {
      this.networkClient.sendProfileUpdate(profile);
    }
  }

  /** Propaga acciones administrativas (Host: ejecuta; Admin no-Host: delega al Host). */
  public dispatchAdminAction(action: string, payload: Record<string, unknown> = {}): void {
    if (this.isHost && this.networkHost) {
      const targetId = Number(payload.targetPlayerId ?? 0);
      if (action === 'TOGGLE_ADMIN') {
        this.networkHost.togglePlayerAdmin(targetId);
      } else if (action === 'KICK' || action === 'BAN') {
        this.networkHost.kickPlayer(targetId, action === 'BAN', true);
      } else if (action === 'TOGGLE_CAPTAIN_KIT_SWITCH') {
        if (typeof payload.allowCaptainKitSwitch === 'boolean') {
          this.networkHost.allowCaptainKitSwitch = payload.allowCaptainKitSwitch;
        } else {
          this.networkHost.allowCaptainKitSwitch = !this.networkHost.allowCaptainKitSwitch;
        }
        this.networkHost.broadcastRoomStateSync();
      } else if (action === 'AUTO_BALANCE') {
        this.networkHost.autoBalanceSpectators();
      } else if (action === 'RESET_TEAMS') {
        this.networkHost.resetTeamsToSpectators();
      }
      return;
    }
    if (!this.isHost && this.networkClient && gameUI.isAdmin) {
      this.networkClient.sendAdminAction(action, payload);
    }
  }

  /** Aplica cambios de configuración de sala. Ajustes avanzados (nombre, capacidad, privacidad) son exclusivos del Host. */
  public updateRoomConfig(patch: RoomConfigPatch): void {
    if (!this.currentRoomId) return;

    if (this.isHost && this.networkHost) {
      const host = this.networkHost;
      if (patch.name !== undefined) host.roomName = patch.name;
      if (patch.stadiumId !== undefined) host.stadiumId = patch.stadiumId;
      if (patch.maxPlayers !== undefined) host.maxPlayers = patch.maxPlayers;
      if (patch.teamsLocked !== undefined) host.teamsLocked = patch.teamsLocked;
      if (patch.allowCaptainKitSwitch !== undefined) host.allowCaptainKitSwitch = patch.allowCaptainKitSwitch;
      if (patch.timeLimit !== undefined) host.timeLimit = patch.timeLimit;
      if (patch.scoreLimit !== undefined) host.scoreLimit = patch.scoreLimit;
      if (patch.redKitVariant !== undefined) host.redKitVariant = patch.redKitVariant;
      if (patch.blueKitVariant !== undefined) host.blueKitVariant = patch.blueKitVariant;
      if (patch.gameplayConfig !== undefined) host.gameplayConfig = patch.gameplayConfig;
      if (patch.modifiers !== undefined) host.modifiers = patch.modifiers;
      host.broadcastRoomStateSync();

      this.signaling.send({
        type: 'update_room',
        roomId: this.currentRoomId,
        ...patch,
        playerCount: gameUI.rosterPlayers.length
      });
      return;
    }

    if (this.networkClient && gameUI.isAdmin) {
      const rules: Record<string, unknown> = {};
      for (const key of ADMIN_RULE_KEYS) {
        if (patch[key] !== undefined) rules[key] = patch[key];
      }
      if (Object.keys(rules).length > 0) {
        this.networkClient.sendAdminAction('SET_RULES', rules);
      }
    }
  }

  /** Notifica a los guests la fase actual del partido (Host). */
  public syncMatchPhase(phase: number): void {
    if (!this.networkHost || this.networkHost.matchPhase === phase) return;
    this.networkHost.matchPhase = phase;
    this.networkHost.broadcastRoomStateSync();
  }

  public setKitVariant(team: 'red' | 'blue', variant: 'home' | 'away'): void {
    if (this.isHost && this.networkHost) {
      if (team === 'red') this.networkHost.redKitVariant = variant;
      else this.networkHost.blueKitVariant = variant;
      this.networkHost.broadcastRoomStateSync();
    } else if (this.networkClient) {
      this.networkClient.sendKitVariantChange(team, variant);
    }
  }

  public async createRoom(params: CreateRoomParams): Promise<boolean> {
    this.teardownNetworkSession();
    this.lastJoinError = null;
    gameUI.lobbyError = null;
    await this.signaling.ensureConnected();

    return new Promise<boolean>((resolve) => {
      const cleanName = params.name.trim() || `${gameUI.nickname || 'Player'}'s room`;
      const stadium = params.stadium || 'mediano';
      const maxPlayers = Math.max(2, Math.min(30, params.maxPlayers ?? 12));
      const isPublic = params.isPublic !== false;
      const password = params.password;
      const roomType = params.roomType === 'ranked' ? 'ranked' : 'casual';
      let tz = '';
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch {
        tz = '';
      }

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          // Fallback optimista para modo local/offline
          this.setupHostState(cleanName, stadium, maxPlayers, isPublic, `R-${Date.now().toString().slice(-4)}`, params);
          resolve(true);
        }
      }, 4000);

      const onRoomCreated = (msg: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          const roomId = msg.roomId || msg.id || `R-${Date.now().toString().slice(-4)}`;
          this.setupHostState(cleanName, stadium, maxPlayers, isPublic, roomId, params);
          resolve(true);
        }
      };

      const onError = (msg: any) => {
        if (!resolved && msg?.code === 'RANKED_ROLE_REQUIRED') {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          const errMsg = String(msg.message || 'No tienes permisos para crear salas Clasificatorias.');
          this.lastJoinError = errMsg;
          gameUI.lobbyError = errMsg;
          resolve(false);
        }
      };

      const cleanup = () => {
        this.signaling.off('room_created', onRoomCreated);
        this.signaling.off('ROOM_CREATED', onRoomCreated);
        this.signaling.off('error', onError);
        this.signaling.off('ERROR', onError);
      };

      this.signaling.on('room_created', onRoomCreated);
      this.signaling.on('ROOM_CREATED', onRoomCreated);
      this.signaling.on('error', onError);
      this.signaling.on('ERROR', onError);

      this.signaling.send({
        type: 'create_room',
        name: cleanName,
        stadiumId: stadium,
        stadium,
        maxPlayers,
        isPublic,
        password,
        roomType,
        timeZone: tz,
        accessToken: userProfile.jwt || undefined,
        config: {
          name: cleanName,
          stadiumId: stadium,
          stadium,
          maxPlayers,
          isPrivate: !isPublic,
          password,
          timeLimit: params.timeLimit ?? 3,
          scoreLimit: params.scoreLimit ?? 3,
          teamsLocked: params.teamsLocked ?? false,
          roomType,
          timeZone: tz
        }
      });
    });
  }

  private setupHostState(
    name: string,
    stadium: string,
    maxPlayers: number,
    isPublic: boolean,
    roomId: string,
    params?: CreateRoomParams
  ): void {
    this.isHost = true;
    this.currentRoomId = roomId;
    this.activeMatchToken = null;
    this.currentRoomConfig = params || { name, stadium, maxPlayers, isPublic };
    this.remoteInputs.clear();

    this.networkClient?.disconnect();
    this.networkClient = null;
    this.networkHost?.destroy();

    soundFX.startHostKeepAlive();

    // Registrar al Host con su perfil real (nombre, avatar, equipaciones)
    const profile = this.getLocalProfile();
    const host = new NetworkHost(this.signaling, profile.nickname, {
      peerId: this.signaling.peerId,
      userId: userProfile.id,
      isGuest: userProfile.isGuest,
      team: 'spectator',
      avatar: profile.avatar,
      avatarType: profile.avatarType,
      kit: profile.kit,
      localKit: profile.localKit,
      visitorKit: profile.visitorKit
    });
    host.roomId = roomId;
    host.roomName = name;
    host.stadiumId = stadium;
    host.maxPlayers = maxPlayers;
    host.teamsLocked = params?.teamsLocked ?? false;
    host.allowCaptainKitSwitch = params?.allowCaptainKitSwitch ?? false;
    host.timeLimit = params?.timeLimit ?? 3;
    host.scoreLimit = params?.scoreLimit ?? 3;
    host.matchPhase = 0;
    host.gameplayConfig = { ...gameUI.gameplayConfig } as any;
    host.modifiers = { ...gameUI.modifiers } as any;
    this.networkHost = host;

    const roomType = params?.roomType === 'ranked' ? 'ranked' : 'casual';
    gameUI.isPracticeMode = false;
    gameUI.roomType = roomType;
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.localPlayerId = 1;
    gameUI.matchId = roomId;
    gameUI.previousMatchPhase = 0;
    gameUI.hasJoinedInitialSync = true;
    gameUI.teamsLocked = host.teamsLocked;
    gameUI.allowCaptainKitSwitch = host.allowCaptainKitSwitch;
    gameUI.timeLimitMinutes = host.timeLimit;
    gameUI.scoreLimitGoals = host.scoreLimit;
    gameUI.redScore = 0;
    gameUI.blueScore = 0;
    gameUI.matchTimeFormatted = '00:00';
    gameUI.applyMatchBanner({ kind: 'NONE' });
    gameUI.chatMessages = [];
    gameUI.activeRoom = {
      id: roomId,
      name,
      stadium,
      maxPlayers,
      playersCount: 1,
      ping: gameUI.realPing || 20,
      roomType,
      isPrivate: !isPublic,
      password: params?.password,
      timeLimit: host.timeLimit,
      scoreLimit: host.scoreLimit
    };
    gameUI.selectStadium(stadium as any);
    gameUI.rosterPlayers = mapPlayersToRoster(host.getPlayers());

    host.onPlayersUpdated = (players) => {
      gameUI.rosterPlayers = mapPlayersToRoster(players);
      this.syncLocalRole();
      const activeIds = new Set(players.map((p) => p.id));
      for (const id of this.remoteInputs.keys()) {
        if (!activeIds.has(id)) this.remoteInputs.delete(id);
      }
      if (this.currentRoomId) {
        this.signaling.send({ type: 'update_room', roomId: this.currentRoomId, playerCount: players.length });
      }
    };

    host.onPlayerInput = (playerId, inputMask, _tick, aimAngle, aimThrottle) => {
      this.remoteInputs.set(playerId, { inputMask, aimAngle, aimThrottle });
    };

    host.onChatMessage = (sender, text, team, id) => this.pushChat(sender, text, team, false, id);

    host.onPlayerEmote = (playerId, emoji) => {
      this.showEmote(playerId, emoji);
      gameUI.onPlayerEmote?.(playerId, emoji);
    };

    host.onAdminMatchAction = (action, payload) => {
      if (action === 'START_MATCH') {
        gameUI.startMatch();
        gameUI.clearModalStack();
      } else if (action === 'STOP_MATCH') {
        gameUI.stopMatch();
      } else if (action === 'TOGGLE_PAUSE') {
        gameUI.togglePause();
      } else if (action === 'SET_RULES' && payload) {
        if (typeof payload.stadiumId === 'string') gameUI.selectStadium(payload.stadiumId as any);
        if (typeof payload.timeLimit === 'number') gameUI.timeLimitMinutes = payload.timeLimit;
        if (typeof payload.scoreLimit === 'number') gameUI.scoreLimitGoals = payload.scoreLimit;
        if (typeof payload.teamsLocked === 'boolean') gameUI.teamsLocked = payload.teamsLocked;
      }
    };
  }

  public startRankedMatchSession(): void {
    this.activeMatchToken = null;
    if (gameUI.isPracticeMode || gameUI.roomType !== 'ranked') return;
    if (!this.isHost || !this.currentRoomId || !userProfile.jwt || !this.networkHost) return;

    const participantUserIds = this.networkHost
      .getPlayers()
      .filter((p) => (p.team === 'red' || p.team === 'blue') && p.userId && !p.isGuest)
      .map((p) => p.userId as string);

    this.signaling.send({
      type: 'RANKED_MATCH_START',
      roomId: this.currentRoomId,
      accessToken: userProfile.jwt,
      participantUserIds
    });
  }

  public reportRankedMatchIfEligible(summary: {
    stadiumId: string;
    durationSeconds: number;
    redScore: number;
    blueScore: number;
    winner: 'red' | 'blue' | 'draw';
    stats: Array<{
      playerId: string | number;
      team: string;
      goals: number;
      assists: number;
      saves: number;
    }>;
    mvpPlayerId?: string | number | null;
  }): void {
    // En salas Casual o en Modo Entrenamiento JAMÁS se suman estadísticas globales ni ELO
    if (gameUI.isPracticeMode || gameUI.roomType !== 'ranked') return;
    if (!this.isHost || !this.currentRoomId || !this.activeMatchToken || !userProfile.jwt || !this.networkHost) {
      return;
    }

    const hostPlayers = this.networkHost.getPlayers();
    const participants = summary.stats
      .map((s) => {
        const pidNum = Number(s.playerId);
        const pInfo = hostPlayers.find((p) => p.id === pidNum);
        if (!pInfo || pInfo.isGuest || !pInfo.userId) return null;
        if (s.team !== 'red' && s.team !== 'blue') return null;
        return {
          userId: pInfo.userId,
          team: s.team as 'red' | 'blue',
          goals: Number(s.goals || 0),
          assists: Number(s.assists || 0),
          saves: Number(s.saves || 0),
          isMvp:
            summary.mvpPlayerId !== undefined &&
            summary.mvpPlayerId !== null &&
            String(summary.mvpPlayerId) === String(s.playerId)
        };
      })
      .filter(Boolean);

    this.signaling.send({
      type: 'RANKED_MATCH_REPORT',
      roomId: this.currentRoomId,
      matchToken: this.activeMatchToken,
      accessToken: userProfile.jwt,
      stadiumId: summary.stadiumId,
      durationSeconds: Math.max(1, Math.round(summary.durationSeconds)),
      redScore: summary.redScore,
      blueScore: summary.blueScore,
      winner: summary.winner,
      participants
    });
    this.activeMatchToken = null;
  }

  public async joinRoom(roomId: string, password?: string): Promise<boolean> {
    this.teardownNetworkSession();
    this.lastJoinError = null;
    gameUI.lobbyError = null;
    await this.signaling.ensureConnected();

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, 5000);

      const onJoined = (msg: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          this.setupGuestState(roomId, msg);
          resolve(true);
        }
      };

      const onError = (msg: any) => {
        if (
          !resolved &&
          (msg.code === 'ROOM_NOT_FOUND' ||
            msg.code === 'INVALID_PASSWORD' ||
            msg.code === 'ROOM_FULL' ||
            msg.code === 'RANKED_ACCOUNT_REQUIRED')
        ) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          const fallbackMsg =
            msg.code === 'RANKED_ACCOUNT_REQUIRED'
              ? 'Esta sala es Clasificatoria. Debes iniciar sesión con una cuenta verificada para entrar.'
              : msg.code === 'INVALID_PASSWORD'
                ? 'Contraseña incorrecta.'
                : msg.code === 'ROOM_FULL'
                  ? 'La sala está llena (máximo 30 jugadores).'
                  : 'No se pudo entrar a la sala.';
          const errMsg = String(msg.message || fallbackMsg);
          this.lastJoinError = errMsg;
          gameUI.lobbyError = errMsg;
          resolve(false);
        }
      };

      const cleanup = () => {
        this.signaling.off('room_joined', onJoined);
        this.signaling.off('ROOM_JOINED', onJoined);
        this.signaling.off('JOIN_SUCCESS', onJoined);
        this.signaling.off('error', onError);
        this.signaling.off('ERROR', onError);
      };

      this.signaling.on('room_joined', onJoined);
      this.signaling.on('ROOM_JOINED', onJoined);
      this.signaling.on('JOIN_SUCCESS', onJoined);
      this.signaling.on('error', onError);
      this.signaling.on('ERROR', onError);

      this.signaling.send({
        type: 'join_room',
        roomId,
        password,
        nickname: gameUI.nickname || 'Guest',
        isGuest: userProfile.isGuest,
        accessToken: userProfile.jwt || undefined
      });
    });
  }

  private setupGuestState(roomId: string, msg: any): void {
    this.isHost = false;
    this.currentRoomId = roomId;
    this.activeMatchToken = null;
    this.remoteInputs.clear();

    this.networkHost?.destroy();
    this.networkHost = null;
    this.networkClient?.disconnect();

    const profile = this.getLocalProfile();
    const client = new NetworkClient(this.signaling, profile.nickname, 7, {
      userId: userProfile.id,
      isGuest: userProfile.isGuest,
      avatar: profile.avatar,
      avatarType: profile.avatarType,
      kit: profile.kit,
      localKit: profile.localKit,
      visitorKit: profile.visitorKit
    });
    this.networkClient = client;

    gameUI.isPracticeMode = false;
    gameUI.roomType = msg.roomType === 'ranked' ? 'ranked' : 'casual';
    gameUI.isHost = false;
    gameUI.isAdmin = false;
    gameUI.matchId = roomId;
    gameUI.previousMatchPhase = 0;
    gameUI.hasJoinedInitialSync = false;
    gameUI.redScore = 0;
    gameUI.blueScore = 0;
    gameUI.matchTimeFormatted = '00:00';
    gameUI.applyMatchBanner({ kind: 'NONE' });
    gameUI.chatMessages = [];
    gameUI.activeRoom = {
      id: roomId,
      name: msg.roomName || msg.name || `Sala ${roomId}`,
      stadium: msg.stadiumId || msg.stadium || 'mediano',
      maxPlayers: msg.maxPlayers || 12,
      playersCount: 2,
      ping: gameUI.realPing || 20,
      roomType: gameUI.roomType,
      isPrivate: false
    };
    gameUI.selectStadium((msg.stadiumId || msg.stadium || 'mediano') as any);

    // Perfil provisional hasta recibir ROOM_STATE_SYNC del Host
    gameUI.localPlayerId = 0;
    gameUI.rosterPlayers = [];

    client.onRoomStateSync = (state: Record<string, any>) => {
      const assigned = Number(state.assignedPlayerId ?? state.playerId ?? 0);
      if (assigned > 0) gameUI.localPlayerId = assigned;
      if (gameUI.activeRoom) {
        if (state.roomName) gameUI.activeRoom.name = String(state.roomName);
        if (state.maxPlayers) gameUI.activeRoom.maxPlayers = Number(state.maxPlayers);
      }
      if (typeof state.stadiumId === 'string' && state.stadiumId !== gameUI.selectedStadiumId) {
        gameUI.selectStadium(state.stadiumId as any);
      }
      if (typeof state.teamsLocked === 'boolean') gameUI.teamsLocked = state.teamsLocked;
      if (typeof state.timeLimit === 'number') gameUI.modifiers.matchTimeMinutes = state.timeLimit;
      if (typeof state.scoreLimit === 'number') gameUI.modifiers.goalLimit = state.scoreLimit;
      if (state.gameplayConfig || state.modifiers) {
        gameUI.applyRemoteGameplayConfig(state.gameplayConfig, state.modifiers);
      }
      if (typeof state.matchPhase === 'number') {
        if (state.matchPhase === 0) {
          gameUI.matchTimeFormatted = '00:00';
        }
        gameUI.handleMatchPhaseTransition(state.matchPhase, state.type === 'INITIAL_STATE_PACKET');
      }
    };

    client.onPlayerListUpdated = (players) => {
      gameUI.rosterPlayers = mapPlayersToRoster(players);
      if (client.localPlayerId) gameUI.localPlayerId = client.localPlayerId;
      this.syncLocalRole();
    };

    client.onChatMessage = (sender, text, team, isHost, id) => this.pushChat(sender, text, team, isHost, id);

    client.onEmote = (playerId, emoji) => {
      this.showEmote(playerId, emoji);
      gameUI.onPlayerEmote?.(playerId, emoji);
    };

    client.onGameFx = (fx, intensity, countdownValue) => {
      this.playAndApplyGameFx(fx, intensity, countdownValue);
    };

    client.onMatchBanner = (banner) => {
      gameUI.applyMatchBanner(banner as any);
    };

    client.onScoreEvent = (payload) => {
      this.onScoreEventReceived?.(payload);
    };

    client.onRoomClosed = () => this.handleRemoteRoomClosed();

    const hostPeerId = msg.hostPeerId || msg.hostId;
    if (hostPeerId) {
      void client.connectToHost(hostPeerId);
    }
  }

  /** Guest: la sala fue destruida por el Host (o fuimos expulsados) → volver al Lobby. */
  private handleRemoteRoomClosed(): void {
    if (!this.currentRoomId) return;
    const roomId = this.currentRoomId;
    this.currentRoomId = null;
    this.networkClient = null; // NetworkClient ya se auto-desconecta tras ROOM_CLOSED
    this.signaling.send({ type: 'leave_room', roomId });
    this.resetToLobbyState();
    gameUI.clearModalStack();
    gameUI.navigateTo('LOBBY');
  }

  public teardownNetworkSession(): void {
    soundFX.stopHostKeepAlive();
    if (this.networkHost) {
      this.networkHost.closeRoomAndDestroy();
      this.networkHost = null;
    }
    if (this.networkClient) {
      this.networkClient.disconnect();
      this.networkClient = null;
    }
    if (this.currentRoomId) {
      this.signaling.send({ type: 'leave_room', roomId: this.currentRoomId });
      this.currentRoomId = null;
    }
    this.remoteInputs.clear();
    this.currentRoomConfig = null;
    gameUI.resetRoomSession();
  }

  public setupPracticeMode(): void {
    this.teardownNetworkSession();
    this.isHost = true;
    gameUI.resetRoomSession();
    const profile = this.getLocalProfile();
    gameUI.localPlayerId = 1;
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.rosterPlayers = [
      {
        id: 1,
        peerId: 'local',
        nickname: profile.nickname,
        name: profile.nickname,
        team: 'spectator',
        number: 1,
        isAdmin: true,
        isHost: true,
        avatar: profile.avatar,
        avatarType: profile.avatarType,
        kit: profile.kit,
        localKit: profile.localKit,
        visitorKit: profile.visitorKit,
        ping: 0
      }
    ];
    gameUI.players = gameUI.rosterPlayers;
  }

  private resetToLobbyState(): void {
    this.isHost = false;
    this.currentRoomConfig = null;
    this.remoteInputs.clear();
    gameUI.activeRoom = null;
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.localPlayerId = 1;
    gameUI.fsmPhase = 'STOPPED';
    gameUI.matchTimeFormatted = '00:00';
    gameUI.refreshRooms();
  }

  public leaveCurrentRoom(): void {
    this.teardownNetworkSession();
    this.resetToLobbyState();
  }
}

export const gameApp = new GameApp();
