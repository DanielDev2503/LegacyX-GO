import { SignalingClient, sharedSignaling } from './SignalingClient.js';
import { NetworkHost, type PlayerInfo } from './NetworkHost.js';
import { NetworkClient } from './NetworkClient.js';
import { gameUI, type RosterPlayer, type ChatEntry } from '../ui/state/gameUI.svelte.js';
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

  constructor(signaling: SignalingClient = sharedSignaling) {
    this.signaling = signaling;

    gameUI.onLeaveRoom = () => this.leaveCurrentRoom();
    gameUI.onRoomConfigChanged = (patch: RoomConfigPatch) => this.updateRoomConfig(patch);
    gameUI.onAdminAction = (action: string, payload?: any) => this.dispatchAdminAction(action, payload);
    gameUI.onProfileUpdated = () => this.syncPlayerProfile();

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

    soundFX.playChatMessageSound();
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
    await this.signaling.ensureConnected();

    return new Promise<boolean>((resolve) => {
      const cleanName = params.name.trim() || `${gameUI.nickname || 'Player'}'s room`;
      const stadium = params.stadium || 'mediano';
      const maxPlayers = params.maxPlayers ?? 12;
      const isPublic = params.isPublic !== false;
      const password = params.password;

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

      const cleanup = () => {
        this.signaling.off('room_created', onRoomCreated);
        this.signaling.off('ROOM_CREATED', onRoomCreated);
      };

      this.signaling.on('room_created', onRoomCreated);
      this.signaling.on('ROOM_CREATED', onRoomCreated);

      this.signaling.send({
        type: 'create_room',
        name: cleanName,
        stadiumId: stadium,
        stadium,
        maxPlayers,
        isPublic,
        password,
        config: {
          name: cleanName,
          stadiumId: stadium,
          stadium,
          maxPlayers,
          isPrivate: !isPublic,
          password,
          timeLimit: params.timeLimit ?? 3,
          scoreLimit: params.scoreLimit ?? 3,
          teamsLocked: params.teamsLocked ?? false
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
    this.networkHost = host;

    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.localPlayerId = 1;
    gameUI.matchId = roomId;
    gameUI.teamsLocked = host.teamsLocked;
    gameUI.allowCaptainKitSwitch = host.allowCaptainKitSwitch;
    gameUI.timeLimitMinutes = host.timeLimit;
    gameUI.scoreLimitGoals = host.scoreLimit;
    gameUI.redScore = 0;
    gameUI.blueScore = 0;
    gameUI.matchTimeFormatted = '00:00';
    gameUI.chatMessages = [];
    gameUI.activeRoom = {
      id: roomId,
      name,
      stadium,
      maxPlayers,
      playersCount: 1,
      ping: gameUI.realPing || 20,
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

    host.onPlayerInput = (playerId, inputMask) => {
      this.remoteInputs.set(playerId, { inputMask });
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

  public async joinRoom(roomId: string, password?: string): Promise<boolean> {
    this.teardownNetworkSession();
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
        if (!resolved && (msg.code === 'ROOM_NOT_FOUND' || msg.code === 'INVALID_PASSWORD' || msg.code === 'ROOM_FULL')) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
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
        nickname: gameUI.nickname || 'Guest'
      });
    });
  }

  private setupGuestState(roomId: string, msg: any): void {
    this.isHost = false;
    this.currentRoomId = roomId;
    this.remoteInputs.clear();

    this.networkHost?.destroy();
    this.networkHost = null;
    this.networkClient?.disconnect();

    const profile = this.getLocalProfile();
    const client = new NetworkClient(this.signaling, profile.nickname, 7, {
      avatar: profile.avatar,
      avatarType: profile.avatarType,
      kit: profile.kit,
      localKit: profile.localKit,
      visitorKit: profile.visitorKit
    });
    this.networkClient = client;

    gameUI.isHost = false;
    gameUI.isAdmin = false;
    gameUI.matchId = roomId;
    gameUI.redScore = 0;
    gameUI.blueScore = 0;
    gameUI.matchTimeFormatted = '00:00';
    gameUI.chatMessages = [];
    gameUI.activeRoom = {
      id: roomId,
      name: msg.roomName || msg.name || `Sala ${roomId}`,
      stadium: msg.stadiumId || msg.stadium || 'mediano',
      maxPlayers: msg.maxPlayers || 12,
      playersCount: 2,
      ping: gameUI.realPing || 20,
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
      if (typeof state.matchPhase === 'number' && state.matchPhase === 0 && gameUI.matchPhase !== 0) {
        gameUI.matchPhase = 0;
        gameUI.matchTimeFormatted = '00:00';
        gameUI.enforceStopMenu();
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
