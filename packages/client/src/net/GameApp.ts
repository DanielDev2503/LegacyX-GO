import { SignalingClient, sharedSignaling } from './SignalingClient.js';
import { NetworkHost, type PlayerInfo } from './NetworkHost.js';
import { NetworkClient } from './NetworkClient.js';
import { gameUI, type RosterPlayer, type ChatEntry } from '../ui/state/gameUI.svelte.js';
import { userProfile } from '../ui/state/userProfile.svelte.js';
import { soundFX } from '../audio/SoundFX.js';
import { triggerPitchEmote } from '../renderer/DiscRenderer.js';
import {
  INPUT_FLAG_DASH,
  INPUT_FLAG_KICK,
  INPUT_FLAG_MAGNUS_LEFT,
  INPUT_FLAG_MAGNUS_RIGHT,
  type PlayerInput,
  type PlayerPosition
} from '@legacyx/core';

const REMOTE_IMPULSE_FLAGS =
  INPUT_FLAG_DASH | INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_LEFT | INPUT_FLAG_MAGNUS_RIGHT;

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
      position: p.position,
      teamOrder: p.teamOrder,
      isAdmin: Boolean(p.isHost || p.isAdmin),
      isHost: Boolean(p.isHost),
      isGuest: Boolean(p.isGuest),
      isBot: Boolean(p.isBot),
      botDifficulty: p.botDifficulty,
      ping: p.isHost ? 0 : (p.ping ?? 20),
      kit: p.kit ?? p.localKit,
      localKit: p.localKit ?? p.kit,
      visitorKit: p.visitorKit ?? p.kit
    };
  });
}

export class GameApp {
  private static readonly MAX_REMOTE_INPUT_QUEUE = 6;
  public signaling: SignalingClient;
  public networkHost: NetworkHost | null = null;
  public networkClient: NetworkClient | null = null;
  public isHost: boolean = false;
  public currentRoomId: string | null = null;
  public currentRoomConfig: CreateRoomParams | null = null;
  /** Inputs de jugadores remotos recibidos por el Host (playerId → máscara). */
  public remoteInputs = new Map<number, PlayerInput>();
  private remoteInputQueues = new Map<number, PlayerInput[]>();
  private lastConsumedRemoteSeq = new Map<number, number>();
  private seenRemoteSeqWindow = new Map<number, { maxSeq: number; mask: number }>();
  private pendingImpulseMasks = new Map<number, number>();
  private rawRemoteMasks = new Map<number, number>();
  private lastRemoteInputSeq = new Map<number, number>();
  private recentLocalEmotes = new Map<string, number>();
  public activeMatchToken: string | null = null;
  private activeRankedRoster = new Map<number, { userId: string; team: 'red' | 'blue'; elo?: number }>();
  public activeGoalScorerId: number | null = null;
  public hostEngine: any = null;
  public lastJoinError: string | null = null;
  public lastJoinErrorCode: string | null = null;
  public onScoreEventReceived: ((payload: Record<string, unknown>) => void) | null = null;
  public onRoomClosed?: (
    reason?: 'kicked' | 'banned' | 'closed',
    message?: string,
    roomName?: string
  ) => void;
  public onJoinError?: (code: string | null, message: string) => void;
  public onJoinBanned?: (message: string, roomId?: string) => void;

  constructor(signaling: SignalingClient = sharedSignaling) {
    this.signaling = signaling;
    this.signaling.setUserId(userProfile.id ?? null);

    gameUI.onLeaveRoom = () => this.leaveCurrentRoom();
    gameUI.onRoomConfigChanged = (patch: RoomConfigPatch) => this.updateRoomConfig(patch);
    gameUI.onAdminAction = (action: string, payload?: any) => this.dispatchAdminAction(action, payload);
    gameUI.onProfileUpdated = () => this.syncPlayerProfile();
    gameUI.onPositionChange = (playerId: number, position: PlayerPosition) => {
      this.requestPositionChange(playerId, position);
    };
    gameUI.onAddBot = (team: 'red' | 'blue', difficulty: 'easy' | 'medium' | 'hard' = 'medium') => {
      if (this.isHost && this.networkHost && gameUI.roomType !== 'ranked') {
        this.networkHost.addBot(team, difficulty);
      }
    };
    gameUI.onSetBotDifficulty = (botId: number, difficulty: 'easy' | 'medium' | 'hard') => {
      if (this.isHost && this.networkHost && gameUI.roomType !== 'ranked') {
        this.networkHost.setBotDifficulty(botId, difficulty);
      }
    };
    gameUI.onRemoveBot = (botId: number) => {
      if (this.isHost && this.networkHost) {
        this.networkHost.removeBot(botId);
      }
    };
    gameUI.onClearTeam = (team: 'red' | 'blue') => {
      if (this.isHost && this.networkHost) {
        this.networkHost.clearTeam(team);
      } else if (!this.isHost && this.networkClient && gameUI.isAdmin) {
        this.networkClient.sendAdminAction('CLEAR_TEAM', { team });
      }
    };
    gameUI.onSuperadminElevate = () => this.requestSuperadminRoomAdmin();
    gameUI.onSimLagChanged = (cfg) => {
      this.networkClient?.setNetworkImpairment(cfg);
    };

    this.signaling.on('SESSION_REPLACED', (msg: any) => {
      this.handleSessionReplaced(
        typeof msg?.message === 'string' && msg.message.trim()
          ? msg.message
          : 'Tu cuenta inició sesión en otro dispositivo o pestaña.'
      );
    });
    this.signaling.on('SUPERADMIN_ELEVATE_PEER', (msg: any) => {
      if (this.isHost && this.networkHost && typeof msg?.peerId === 'string') {
        this.networkHost.elevatePeerToAdmin(msg.peerId);
      }
    });
    this.signaling.on('SUPERADMIN_ADMIN_RESULT', (msg: any) => {
      if (typeof msg?.message === 'string' && msg.message.trim()) {
        gameUI.pushLocalSystemNotice(msg.message);
      }
    });

    this.signaling.on('RANKED_MATCH_TOKEN', (msg: any) => {
      if (typeof msg?.matchToken === 'string' && msg.matchToken) {
        this.activeMatchToken = msg.matchToken;
      }
    });
    this.signaling.on('RANKED_MATCH_RESULT', (msg: any) => {
      if (msg?.success || msg?.ok) {
        void userProfile.fetchLeaderboard(userProfile.leaderboardCategory);
        void userProfile.fetchPersonalRank(userProfile.leaderboardCategory);
      }
    });
    this.signaling.on('ROOM_PING_RESULT', (msg: any) => {
      const pingVal =
        typeof msg?.pingMs === 'number' && Number.isFinite(msg.pingMs)
          ? msg.pingMs
          : typeof msg?.ping === 'number' && Number.isFinite(msg.ping)
            ? msg.ping
            : -1;
      if (typeof msg?.roomId === 'string' && pingVal > 0) {
        gameUI.updateRoomHoverPing(msg.roomId, pingVal);
      }
    });

    if (typeof window !== 'undefined') {
      const handleExplicitUnload = () => {
        if (this.currentRoomId) this.leaveCurrentRoom();
      };
      window.addEventListener('beforeunload', handleExplicitUnload);
      window.addEventListener('pagehide', handleExplicitUnload);
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

    // Comprobar si el emisor es espectador o invitado: jamás activan emotes y siempre se muestran en chat
    const cleanSender = (sender || '').trim();
    const player =
      gameUI.rosterPlayers.find((p) => p.nickname === sender || p.name === sender) ??
      gameUI.rosterPlayers.find(
        (p) =>
          p.nickname.trim().toLowerCase() === cleanSender.toLowerCase() ||
          (p.name || '').trim().toLowerCase() === cleanSender.toLowerCase()
      );
    const playerTeam = team || player?.team;
    const isSpectator = playerTeam === 'spectator' || playerTeam === 'spectators' || playerTeam === 'spec' || playerTeam === 'SPEC';
    const isGuestSender = Boolean(player?.isGuest) || /^inv_/i.test(cleanSender);
    const emoteEmoji = isSpectator || isGuestSender ? null : gameUI.matchEmoteTrigger(text);
    const playerId = player ? player.id : (isHost ? 1 : null);

    if (emoteEmoji && gameUI.settings.showPitchEmotes !== false) {
      if (playerId !== null) {
        this.dispatchEmoteWithRecord(playerId, emoteEmoji);
      } else if (gameUI.settings.chatEmotesSoundEnabled !== false) {
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

  public markLocalEmoteDispatched(playerId: number, emoji: string): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.recentLocalEmotes.set(`${playerId}:${emoji}`, now);
  }

  private consumeRecentLocalEmote(playerId: number, emoji: string): boolean {
    const key = `${playerId}:${emoji}`;
    const prev = this.recentLocalEmotes.get(key);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (prev !== undefined && now - prev < 350) {
      this.recentLocalEmotes.delete(key);
      return true;
    }
    return false;
  }

  private dispatchEmoteWithRecord(playerId: number, emoji: string): void {
    if (this.consumeRecentLocalEmote(playerId, emoji)) {
      return;
    }
    if (gameUI.settings.showPitchEmotes !== false && gameUI.settings.chatEmotesSoundEnabled !== false) {
      soundFX.playPitchEmoteSound();
    }
    if (gameUI.onPlayerEmote) {
      gameUI.onPlayerEmote(playerId, emoji);
    } else if (gameUI.settings.showPitchEmotes !== false) {
      triggerPitchEmote(playerId, emoji);
    }
  }

  public popRemoteInputsForTick(out: Map<number, PlayerInput>): void {
    for (const [playerId, queue] of this.remoteInputQueues.entries()) {
      if (queue.length === 0) continue;
      const next = queue.shift()!;
      const latched = this.pendingImpulseMasks.get(playerId) ?? 0;
      if (latched !== 0) {
        next.inputMask = (next.inputMask ?? 0) | latched;
        this.pendingImpulseMasks.delete(playerId);
      }
      const consumedSeq = ((next as any).seq ?? next.tick ?? 0) >>> 0;
      this.lastConsumedRemoteSeq.set(playerId, consumedSeq);
      this.remoteInputs.set(playerId, next);
      this.rawRemoteMasks.set(playerId, next.inputMask ?? 0);
      out.set(playerId, next);
    }

    for (const [playerId, last] of this.remoteInputs.entries()) {
      if (out.has(playerId)) continue;
      const latched = this.pendingImpulseMasks.get(playerId) ?? 0;
      if (latched !== 0) {
        this.pendingImpulseMasks.delete(playerId);
      }
      const baseMask = this.rawRemoteMasks.get(playerId) ?? last.inputMask ?? 0;
      last.inputMask = (baseMask & ~INPUT_FLAG_DASH) | latched;
      out.set(playerId, last);
    }
  }

  public consumeRemoteImpulses(): void {
    this.pendingImpulseMasks.clear();
    for (const [playerId, entry] of this.remoteInputs.entries()) {
      const rawMask = this.rawRemoteMasks.get(playerId);
      if (rawMask !== undefined) {
        entry.inputMask = rawMask & ~INPUT_FLAG_DASH;
      } else {
        entry.inputMask = (entry.inputMask ?? 0) & ~INPUT_FLAG_DASH;
      }
    }
  }

  private clearRemoteInputTracking(): void {
    this.remoteInputs.clear();
    this.remoteInputQueues.clear();
    this.lastConsumedRemoteSeq.clear();
    this.seenRemoteSeqWindow.clear();
    this.pendingImpulseMasks.clear();
    this.rawRemoteMasks.clear();
    this.lastRemoteInputSeq.clear();
    this.recentLocalEmotes.clear();
  }

  /**
   * Ventana deslizante de 32 bits (Zero-GC) para deduplicación exacta de paquetes redundantes 3x.
   * Devuelve `true` si `seq` ya fue visto/procesado; si era nuevo, lo marca como visto y devuelve `false`.
   */
  private checkAndMarkSeenRemoteSeq(playerId: number, seq: number): boolean {
    let win = this.seenRemoteSeqWindow.get(playerId);
    if (!win) {
      win = { maxSeq: seq, mask: 1 };
      this.seenRemoteSeqWindow.set(playerId, win);
      return false;
    }
    if (seq > win.maxSeq) {
      const shift = seq - win.maxSeq;
      win.mask = shift >= 32 ? 1 : ((win.mask << shift) | 1);
      win.maxSeq = seq;
      return false;
    }
    const delta = win.maxSeq - seq;
    if (delta >= 32) {
      return true;
    }
    const bit = 1 << delta;
    if ((win.mask & bit) !== 0) {
      return true;
    }
    win.mask |= bit;
    return false;
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
        soundFX.playGoalCelebration();
        if (gameUI.screenShake) {
          gameUI.onTriggerShake?.(15, 500);
        }
        break;
      case 'whistle':
        soundFX.playWhistle('kickoff');
        break;
      case 'fulltime':
        soundFX.playWhistle('fulltime');
        break;
      case 'countdown_tick':
        soundFX.playCountdown(countdownValue === 0);
        break;
      case 'golden_goal':
        soundFX.playGoldenGoalSiren();
        break;
      case 'barras':
        soundFX.playBarrasChant();
        break;
      case 'save_gasp':
        soundFX.playCrowdGasp();
        break;
      case 'dash':
        soundFX.playDashWhoosh();
        break;
      case 'magnus':
        soundFX.playMagnusSwirl();
        break;
    }
  }

  public syncPlayerProfile(): void {
    const profile = this.getLocalProfile();
    if (this.isHost && this.networkHost) {
      this.networkHost.updateHostProfile({
        nickname: profile.nickname,
        userId: userProfile.id,
        isGuest: userProfile.isGuest,
        elo: userProfile.elo,
        avatar: profile.avatar,
        avatarType: profile.avatarType,
        kit: profile.localKit,
        localKit: profile.localKit,
        visitorKit: profile.visitorKit
      });
    } else if (!this.isHost && this.networkClient) {
      this.networkClient.sendProfileUpdate({
        ...profile,
        userId: userProfile.id,
        isGuest: userProfile.isGuest,
        elo: userProfile.elo
      });
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

  private setActiveGoalScorerId(id: number | null): void {
    const normalized = typeof id === 'number' && Number.isFinite(id) ? id : null;
    this.activeGoalScorerId = normalized;
    if (this.networkHost) {
      this.networkHost.activeGoalScorerId = normalized;
    }
    (gameUI as any).activeGoalScorerId = normalized;
  }

  public attachHostEngine(engine: any): void {
    this.hostEngine = engine;
    if (this.networkHost) {
      this.networkHost.engine = engine;
    }
  }

  /** Salta la repetición de gol: Host valida que el jugador local sea el goleador (o modo práctica); Guest delega al Host. */
  public skipGoalReplay(engineArg?: any): boolean {
    if (this.isHost || gameUI.isHost || gameUI.isPracticeMode) {
      const engine = engineArg ?? this.networkHost?.engine ?? this.hostEngine;
      if (!engine || typeof engine.skipGoalReplay !== 'function') return false;
      const localId = gameUI.localPlayerId ?? 1;
      const isPractice = Boolean(gameUI.isPracticeMode || engine.isPracticeMode);
      if (!isPractice && engine.lastGoalScorerId !== localId) {
        return false;
      }
      const skipped = engine.skipGoalReplay(localId);
      if (skipped !== false) {
        this.setActiveGoalScorerId(null);
        this.networkHost?.broadcastRoomStateSync(true);
        return true;
      }
      return false;
    }

    if (this.networkClient) {
      this.networkClient.sendSkipGoalReplay();
      return true;
    }
    return false;
  }

  /** Notifica a los guests la fase actual del partido (Host). */
  public syncMatchPhase(phase: number): void {
    if (!this.networkHost) return;
    if (phase === 0 || phase === 1) {
      this.setActiveGoalScorerId(null);
    } else if (phase === 3 || phase === 3.5) {
      const engine = this.networkHost.engine ?? this.hostEngine;
      const scorerId = typeof engine?.lastGoalScorerId === 'number' ? engine.lastGoalScorerId : null;
      this.setActiveGoalScorerId(scorerId);
    }
    if (this.networkHost.matchPhase === phase) return;
    this.networkHost.matchPhase = phase;
    this.networkHost.broadcastRoomStateSync();
  }

  public probeRoomPing(roomId: string, hostPeerId?: string): Promise<number> {
    return this.signaling.probeRoomPing(roomId, hostPeerId);
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

  public requestSuperadminRoomAdmin(): void {
    if (userProfile.isGuest || !userProfile.isAuthenticated || userProfile.role !== 'superadmin') {
      gameUI.pushLocalSystemNotice('Comando /admin exclusivo para Superadmin.');
      return;
    }
    if (gameUI.isPracticeMode) {
      gameUI.isAdmin = true;
      gameUI.pushLocalSystemNotice('Ya eres administrador en Modo Entrenamiento.');
      return;
    }
    if (!this.currentRoomId) {
      gameUI.pushLocalSystemNotice('Debes estar dentro de una sala para usar /admin.');
      return;
    }
    if (this.isHost && this.networkHost) {
      this.networkHost.elevatePeerToAdmin(this.networkHost.getPlayers()[0]?.peerId || this.signaling.peerId);
      gameUI.isAdmin = true;
      gameUI.pushLocalSystemNotice('Permisos de administrador de sala verificados.');
      return;
    }
    if (!userProfile.jwt) {
      gameUI.pushLocalSystemNotice('No se encontró un token de sesión válido.');
      return;
    }
    this.signaling.send({
      type: 'VERIFY_SUPERADMIN_ROOM_ADMIN',
      roomId: this.currentRoomId,
      accessToken: userProfile.jwt
    });
  }

  public handleSessionReplaced(
    message: string = 'Tu cuenta inició sesión en otro dispositivo o pestaña.',
    clearStorage: boolean = true
  ): void {
    if (this.currentRoomId || this.networkHost || this.networkClient) {
      this.teardownNetworkSession();
      this.resetToLobbyState(false);
    }
    userProfile.evictReplacedSession(message, clearStorage);
  }

  public requestPositionChange(targetPlayerId: number, position: PlayerPosition): void {
    if (this.isHost && this.networkHost) {
      this.networkHost.setPlayerPosition(targetPlayerId, position, gameUI.localPlayerId || 1);
    } else if (this.networkClient) {
      this.networkClient.requestPositionChange(targetPlayerId, position);
    }
  }

  public async createRoom(params: CreateRoomParams): Promise<boolean> {
    this.teardownNetworkSession();
    gameUI.isPracticeMode = false;
    this.lastJoinError = null;
    gameUI.lobbyError = null;
    this.signaling.setUserId(userProfile.id ?? null);
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
          this.signaling.setActiveHostedRoom(
            roomId,
            typeof msg.reclaimToken === 'string' ? msg.reclaimToken : undefined
          );
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
        userId: userProfile.id ?? undefined,
        clientSessionId: this.signaling.clientSessionId,
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
    this.clearRemoteInputTracking();

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
      elo: userProfile.elo,
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
    if (this.hostEngine) {
      host.engine = this.hostEngine;
    }
    this.networkHost = host;
    this.setActiveGoalScorerId(null);
    host.onGoalReplaySkipped = () => {
      this.setActiveGoalScorerId(null);
    };

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
    gameUI.recordTelemetrySample(0, gameUI.fps);
    gameUI.activeRoom = {
      id: roomId,
      name,
      stadium,
      maxPlayers,
      playersCount: 1,
      ping: 0,
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
      if (this.activeMatchToken && gameUI.roomType === 'ranked') {
        for (const p of players) {
          if ((p.team === 'red' || p.team === 'blue') && p.userId && !p.isGuest && !(p as any).isBot) {
            this.activeRankedRoster.set(p.id, {
              userId: p.userId,
              team: p.team,
              elo: typeof p.elo === 'number' && Number.isFinite(p.elo) ? p.elo : undefined
            });
          }
        }
      }
      const activeIds = new Set(players.map((p) => p.id));
      for (const id of this.remoteInputs.keys()) {
        if (!activeIds.has(id)) {
          this.remoteInputs.delete(id);
          this.remoteInputQueues.delete(id);
          this.lastConsumedRemoteSeq.delete(id);
          this.seenRemoteSeqWindow.delete(id);
          this.pendingImpulseMasks.delete(id);
          this.rawRemoteMasks.delete(id);
          this.lastRemoteInputSeq.delete(id);
        }
      }
      for (const id of this.remoteInputQueues.keys()) {
        if (!activeIds.has(id)) {
          this.remoteInputQueues.delete(id);
          this.lastConsumedRemoteSeq.delete(id);
        }
      }
      if (this.currentRoomId) {
        this.signaling.send({ type: 'update_room', roomId: this.currentRoomId, playerCount: players.length });
      }
    };

    host.onPlayerInput = (playerId, inputMask, tick, aimAngle, aimThrottle) => {
      const seq = tick >>> 0;
      const lastConsumed = this.lastConsumedRemoteSeq.get(playerId);
      const lastSeq = this.lastRemoteInputSeq.get(playerId);
      const seqReset =
        (lastConsumed !== undefined && lastConsumed >= 500 && lastConsumed - seq >= 500) ||
        (lastSeq !== undefined && lastSeq >= 500 && lastSeq - seq >= 500);
      if (seqReset) {
        this.remoteInputQueues.delete(playerId);
        this.lastConsumedRemoteSeq.delete(playerId);
        this.seenRemoteSeqWindow.delete(playerId);
        this.lastRemoteInputSeq.delete(playerId);
        this.pendingImpulseMasks.delete(playerId);
      }

      const alreadySeen = this.checkAndMarkSeenRemoteSeq(playerId, seq);

      const activeConsumed = this.lastConsumedRemoteSeq.get(playerId);
      if (activeConsumed !== undefined) {
        if (seq === activeConsumed) {
          return;
        }
        if (seq < activeConsumed && activeConsumed - seq < 500) {
          // Solo rescatar impulsos de paquetes genuinamente perdidos (nunca duplicados redundantes 3x ya consumidos)
          if (!alreadySeen) {
            const impulseBits = inputMask & REMOTE_IMPULSE_FLAGS;
            if (impulseBits !== 0) {
              this.pendingImpulseMasks.set(
                playerId,
                (this.pendingImpulseMasks.get(playerId) ?? 0) | impulseBits
              );
            }
          }
          return;
        }
      }

      let queue = this.remoteInputQueues.get(playerId);
      if (!queue) {
        queue = [];
        this.remoteInputQueues.set(playerId, queue);
      }

      for (let i = 0; i < queue.length; i++) {
        const queuedSeq = ((queue[i] as any).seq ?? queue[i]!.tick ?? 0) >>> 0;
        if (queuedSeq === seq) {
          queue[i]!.inputMask = (queue[i]!.inputMask ?? 0) | (inputMask & REMOTE_IMPULSE_FLAGS);
          return;
        }
      }

      const entry: PlayerInput = {
        inputMask,
        aimAngle,
        aimThrottle,
        tick: seq,
        sequence: seq,
        seq
      } as any;

      let inserted = false;
      for (let i = queue.length - 1; i >= 0; i--) {
        const queuedSeq = ((queue[i] as any).seq ?? queue[i]!.tick ?? 0) >>> 0;
        if (seq > queuedSeq) {
          queue.splice(i + 1, 0, entry);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        queue.unshift(entry);
      }

      while (queue.length > GameApp.MAX_REMOTE_INPUT_QUEUE) {
        const dropped = queue.shift()!;
        const droppedImpulses = (dropped.inputMask ?? 0) & REMOTE_IMPULSE_FLAGS;
        if (droppedImpulses !== 0 && queue.length > 0) {
          queue[0]!.inputMask = (queue[0]!.inputMask ?? 0) | droppedImpulses;
        }
      }

      const prevLast = this.lastRemoteInputSeq.get(playerId) ?? 0;
      if (seq >= prevLast) {
        this.lastRemoteInputSeq.set(playerId, seq);
        this.rawRemoteMasks.set(playerId, inputMask);
        this.remoteInputs.set(playerId, entry);
      }
    };

    host.onChatMessage = (sender, text, team, id) => {
      const hostPlayer = host.getPlayers().find((p) => p.id === 1);
      const isHostSender = Boolean(hostPlayer && hostPlayer.nickname === sender);
      this.pushChat(sender, text, team, isHostSender, id);
    };

    host.onPlayerEmote = (playerId, emoji) => {
      this.dispatchEmoteWithRecord(playerId, emoji);
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
    this.activeRankedRoster.clear();
    if (gameUI.isPracticeMode || gameUI.roomType !== 'ranked') return;
    if (!this.isHost || !this.currentRoomId || !userProfile.jwt || !this.networkHost) return;

    const participantPlayers = this.networkHost
      .getPlayers()
      .filter((p) => (p.team === 'red' || p.team === 'blue') && p.userId && !p.isGuest && !(p as any).isBot);

    for (const p of participantPlayers) {
      this.activeRankedRoster.set(p.id, {
        userId: p.userId as string,
        team: p.team as 'red' | 'blue',
        elo: typeof p.elo === 'number' && Number.isFinite(p.elo) ? p.elo : undefined
      });
    }

    const participantUserIds = participantPlayers.map((p) => p.userId as string);

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
        const cached = this.activeRankedRoster.get(pidNum);
        if (pInfo && ((pInfo as any).isBot || pInfo.isGuest)) return null;
        const userId = pInfo?.userId || cached?.userId;
        const resolvedTeam =
          s.team === 'red' || s.team === 'blue' ? s.team : cached?.team;
        if (!userId || (resolvedTeam !== 'red' && resolvedTeam !== 'blue')) return null;
        return {
          userId,
          team: resolvedTeam as 'red' | 'blue',
          elo:
            typeof pInfo?.elo === 'number' && Number.isFinite(pInfo.elo)
              ? pInfo.elo
              : typeof cached?.elo === 'number' && Number.isFinite(cached.elo)
                ? cached.elo
                : 1000,
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
    this.activeRankedRoster.clear();
  }

  public async joinRoom(
    roomId: string,
    password?: string,
    opts?: { waitForHandshake?: boolean; handshakeTimeoutMs?: number }
  ): Promise<boolean> {
    this.teardownNetworkSession();
    gameUI.isPracticeMode = false;
    this.lastJoinError = null;
    this.lastJoinErrorCode = null;
    gameUI.lobbyError = null;
    this.signaling.setUserId(userProfile.id ?? null);
    await this.signaling.ensureConnected();

    const joinedViaSignaling = await new Promise<boolean>((resolve) => {
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
        const code = typeof msg?.code === 'string' ? msg.code : null;
        if (
          !resolved &&
          (code === 'ROOM_NOT_FOUND' ||
            code === 'INVALID_PASSWORD' ||
            code === 'ROOM_FULL' ||
            code === 'ROOM_LOCKED' ||
            code === 'ROOM_BANNED' ||
            code === 'RANKED_ACCOUNT_REQUIRED' ||
            code === 'HOST_RECONNECTING')
        ) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          const fallbackMsg =
            code === 'RANKED_ACCOUNT_REQUIRED'
              ? 'Esta sala es Clasificatoria. Debes iniciar sesión con una cuenta verificada para entrar.'
              : code === 'INVALID_PASSWORD'
                ? 'Contraseña incorrecta.'
                : code === 'ROOM_FULL'
                  ? 'La sala está llena (máximo 30 jugadores).'
                  : code === 'ROOM_LOCKED'
                    ? 'La sala está bloqueada por el anfitrión.'
                    : code === 'ROOM_BANNED'
                      ? 'Has sido baneado de esta sala y no puedes volver a ingresar.'
                      : code === 'HOST_RECONNECTING'
                        ? 'El anfitrión está reconectando. Intenta de nuevo en unos segundos.'
                        : 'No se pudo entrar a la sala.';
          const errMsg = String(msg.message || fallbackMsg);
          this.lastJoinErrorCode = code;
          this.lastJoinError = errMsg;
          gameUI.lobbyError = errMsg;
          this.onJoinError?.(code, errMsg);
          if (code === 'ROOM_BANNED') {
            this.onJoinBanned?.(errMsg, roomId);
            gameUI.showRoomDisconnectNotice({
              kind: 'banned_join',
              title: 'ACCESO DENEGADO — BANEADO',
              message: errMsg
            });
          }
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
        userId: userProfile.id ?? undefined,
        clientSessionId: this.signaling.clientSessionId,
        accessToken: userProfile.jwt || undefined
      });
    });

    if (!joinedViaSignaling) return false;
    if (opts?.waitForHandshake && this.networkClient) {
      const handshakeOk = await this.networkClient.waitForInitialHandshake(opts.handshakeTimeoutMs ?? 15_000);
      if (!handshakeOk) {
        const errMsg = 'No se pudo completar el handshake P2P (DataChannels) con el anfitrión.';
        this.lastJoinErrorCode = 'HANDSHAKE_TIMEOUT';
        this.lastJoinError = errMsg;
        gameUI.lobbyError = errMsg;
        this.teardownNetworkSession();
        return false;
      }
    }
    return true;
  }

  private setupGuestState(roomId: string, msg: any): void {
    this.isHost = false;
    this.currentRoomId = roomId;
    this.activeMatchToken = null;
    this.activeRankedRoster.clear();
    this.setActiveGoalScorerId(null);
    this.hostEngine = null;
    this.clearRemoteInputTracking();

    this.networkHost?.destroy();
    this.networkHost = null;
    this.networkClient?.disconnect();

    const profile = this.getLocalProfile();
    const client = new NetworkClient(this.signaling, profile.nickname, 7, {
      userId: userProfile.id,
      isGuest: userProfile.isGuest,
      elo: userProfile.elo,
      avatar: profile.avatar,
      avatarType: profile.avatarType,
      kit: profile.kit,
      localKit: profile.localKit,
      visitorKit: profile.visitorKit
    });
    client.roomId = roomId;
    client.roomName = String(msg.roomName || msg.name || `Sala ${roomId}`);
    if (gameUI.simLagConfig.enabled) {
      client.setNetworkImpairment(gameUI.simLagConfig);
    }
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
    gameUI.pingMs = 0;
    gameUI.activeRoom = {
      id: roomId,
      name: msg.roomName || msg.name || `Sala ${roomId}`,
      stadium: msg.stadiumId || msg.stadium || 'mediano',
      maxPlayers: msg.maxPlayers || 12,
      playersCount: 2,
      ping: 0,
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
      if (typeof state.timeLimit === 'number') {
        gameUI.modifiers.matchTimeMinutes = state.timeLimit;
        gameUI.modifiers.timeLimit = state.timeLimit;
      }
      if (typeof state.scoreLimit === 'number') gameUI.modifiers.goalLimit = state.scoreLimit;
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
      this.dispatchEmoteWithRecord(playerId, emoji);
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

    client.onGoalScorerIdChanged = (scorerId) => {
      this.setActiveGoalScorerId(scorerId);
    };

    client.onRoomClosed = (reason, message, roomName) => {
      this.handleRemoteRoomClosed(reason, message, roomName);
    };

    const hostPeerId = msg.hostPeerId || msg.hostId;
    if (hostPeerId) {
      void client.connectToHost(hostPeerId);
    }
  }

  /** Guest: la sala fue destruida por el Host (o fuimos expulsados/baneados) → volver al Lobby. */
  private handleRemoteRoomClosed(
    reason: 'kicked' | 'banned' | 'closed' = 'closed',
    message?: string,
    roomName?: string
  ): void {
    if (!this.currentRoomId) return;
    const roomId = this.currentRoomId;
    const activeRoomName = roomName || gameUI.activeRoom?.name || undefined;
    this.currentRoomId = null;
    this.networkClient = null; // NetworkClient ya se auto-desconecta tras ROOM_CLOSED / moderación
    this.signaling.send({ type: 'leave_room', roomId });
    const stayOnGatekeeper = gameUI.currentScreen === 'GATEKEEPER';
    this.resetToLobbyState(!stayOnGatekeeper);
    gameUI.clearModalStack();
    if (!stayOnGatekeeper) {
      gameUI.navigateTo('LOBBY');
    }
    this.onRoomClosed?.(reason, message, activeRoomName);
    const defaultTitles: Record<'kicked' | 'banned' | 'closed', string> = {
      kicked: 'EXPULSADO DE LA SALA',
      banned: 'BANEADO DE LA SALA',
      closed: 'SALA CERRADA'
    };
    const defaultMessages: Record<'kicked' | 'banned' | 'closed', string> = {
      kicked: 'Has sido expulsado de la sala por un administrador o anfitrión.',
      banned: 'Has sido baneado de esta sala y no podrás volver a ingresar.',
      closed: 'La sala ha sido cerrada por el anfitrión.'
    };
    gameUI.showRoomDisconnectNotice({
      kind: reason,
      title: defaultTitles[reason],
      message: message || defaultMessages[reason],
      roomName: activeRoomName
    });
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
    this.signaling.setActiveHostedRoom(null);
    this.activeMatchToken = null;
    this.activeRankedRoster.clear();
    this.setActiveGoalScorerId(null);
    this.hostEngine = null;
    this.clearRemoteInputTracking();
    this.currentRoomConfig = null;
    gameUI.isPracticeMode = false;
    gameUI.resetRoomSession();
  }

  public setupPracticeMode(): void {
    this.teardownNetworkSession();
    this.isHost = true;
    gameUI.resetRoomSession();
    gameUI.isPracticeMode = true;
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
        team: 'red',
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

  private resetToLobbyState(shouldRefreshRooms: boolean = true): void {
    this.isHost = false;
    this.currentRoomConfig = null;
    this.activeMatchToken = null;
    this.activeRankedRoster.clear();
    this.setActiveGoalScorerId(null);
    this.hostEngine = null;
    this.clearRemoteInputTracking();
    gameUI.isPracticeMode = false;
    gameUI.activeRoom = null;
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.localPlayerId = 1;
    gameUI.fsmPhase = 'STOPPED';
    gameUI.matchTimeFormatted = '00:00';
    if (shouldRefreshRooms) {
      gameUI.refreshRooms();
    }
  }

  public leaveCurrentRoom(): void {
    this.teardownNetworkSession();
    this.resetToLobbyState(true);
  }

  public handleLogout(): void {
    this.signaling.setUserId(null);
    this.teardownNetworkSession();
    this.resetToLobbyState(false);
  }
}

export const gameApp = new GameApp();
