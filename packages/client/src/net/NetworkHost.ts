import { BinaryProtocol, PLAYER_POSITIONS, type PlayerInput, type PlayerPosition } from '@legacyx/core';
import { PeerConnection, SCTP_BACKPRESSURE_LIMIT_BYTES } from './PeerConnection';
import { SignalingClient } from './SignalingClient';
import { canChangeTeam } from './ClientPrediction';

export interface PlayerInfo {
  id: number;
  peerId: string;
  userId?: string | null;
  isGuest?: boolean;
  elo?: number;
  nickname: string;
  name?: string;
  team: 'red' | 'blue' | 'spectator';
  position?: PlayerPosition;
  teamOrder?: number;
  number: number;
  isAdmin: boolean;
  isHost?: boolean;
  avatar?: string;
  avatarType?: 'letters' | 'emoji' | string;
  isBot?: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
  ping?: number;
  kit?: any;
  localKit?: any;
  visitorKit?: any;
  isTyping?: boolean;
}

export class NetworkHost {
  private static readonly MAX_PROBE_PEERS = 8;
  private static readonly PROBE_PEER_TTL_MS = 4000;
  private static readonly CHAT_EMOTE_COOLDOWN_MS = 1450;

  private signaling: SignalingClient;
  private peers = new Map<string, PeerConnection>();
  private probePeers = new Map<string, { peer: PeerConnection; timer: ReturnType<typeof setTimeout> }>();
  private peerToPlayerId = new Map<string, number>();
  private pendingNicknames = new Map<string, string>();
  private players = new Map<number, PlayerInfo>();
  private bannedPeerIds = new Set<string>();
  private welcomedPeers = new Set<string>();
  private lastChatAtByPlayerId = new Map<number, number>();
  private readonly decodedInputScratch: PlayerInput[] = [{}, {}, {}];
  private snapshotTickCounter = 0;
  private pendingClosePeers = new Map<ReturnType<typeof setTimeout>, PeerConnection>();
  private nextPlayerId = 2; // 1 is reserved for Host local player
  private nextTeamOrder = 1;
  private iceServers: RTCIceServer[] = [];
  public teamsLocked = false;
  public allowCaptainKitSwitch = false;
  public roomId: string = '';
  public roomName: string = '';
  public stadiumId: string = 'mediano';
  public maxPlayers: number = 12;
  public timeLimit: number = 3;
  public scoreLimit: number = 3;
  public matchPhase: number = 0;

  private boundOnWelcome!: (msg: any) => void;
  private boundOnPeerJoined!: (msg: any) => void;
  private boundOnSignal!: (msg: any) => void;
  private boundOnRtcPingSignal!: (msg: any) => void;
  private boundOnPeerLeft!: (msg: any) => void;
  private boundOnRoomReclaimed!: (msg: any) => void;

  public onPlayerInput?: (
    playerId: number,
    inputMask: number,
    tick: number,
    aimAngle?: number | null,
    aimThrottle?: number
  ) => void;
  public onPlayerJoined?: (player: PlayerInfo) => void;
  public onPlayerLeft?: (playerId: number) => void;
  public onPlayersUpdated?: (players: PlayerInfo[]) => void;
  public onChatMessage?: (sender: string, text: string, team?: string, id?: string) => void;
  public onPlayerEmote?: (playerId: number, emoji: string) => void;
  public onTeamChangeRequest?: (playerId: number, team: 'red' | 'blue' | 'spectator') => void;
  public onPositionChanged?: (playerId: number, position: PlayerPosition) => void;
  public onAdminMatchAction?: (action: string, payload?: Record<string, unknown>) => void;
  public onPlayerTyping?: (playerId: number, isTyping: boolean) => void;
  public onGoalReplaySkipped?: (playerId: number) => void;

  public engine: {
    lastGoalScorerId?: number | null;
    skipGoalReplay?: (requesterPlayerId?: number) => boolean;
    isPracticeMode?: boolean;
  } | null = null;
  public activeGoalScorerId: number | null = null;

  public redKitVariant: 'home' | 'away' = 'home';
  public blueKitVariant: 'home' | 'away' = 'away';
  public gameplayConfig: Record<string, unknown> | null = null;
  public modifiers: Record<string, unknown> | null = null;
  public activeBanner: Record<string, unknown> | null = null;

  constructor(signaling: SignalingClient, hostNickname: string, hostProfile?: Partial<PlayerInfo>) {
    this.signaling = signaling;

    // Register host player (Admin & Host immutable)
    this.players.set(1, {
      id: 1,
      peerId: hostProfile?.peerId || signaling.peerId || 'host',
      userId: hostProfile?.userId,
      isGuest: hostProfile?.isGuest,
      elo: hostProfile?.elo,
      nickname: hostNickname,
      name: hostNickname,
      team: hostProfile?.team ?? 'spectator',
      number: hostProfile?.number ?? 10,
      isAdmin: true,
      isHost: true,
      ping: 0,
      avatar: hostProfile?.avatar ?? '1',
      avatarType: hostProfile?.avatarType ?? 'letters',
      kit: hostProfile?.kit,
      localKit: hostProfile?.localKit,
      visitorKit: hostProfile?.visitorKit
    });

    this.setupSignalingListeners();
  }

  public updateHostProfile(patch: Partial<PlayerInfo>): void {
    const host = this.players.get(1);
    if (!host) return;
    if (patch.nickname !== undefined) {
      host.nickname = patch.nickname;
      host.name = patch.nickname;
    }
    if (patch.avatar !== undefined) host.avatar = patch.avatar;
    if (patch.avatarType !== undefined) host.avatarType = patch.avatarType;
    if (patch.number !== undefined) host.number = patch.number;
    if (patch.team !== undefined && patch.team !== host.team) {
      this.applyTeamTransition(host, patch.team);
    }
    if (patch.kit !== undefined) host.kit = patch.kit;
    if (patch.localKit !== undefined) host.localKit = patch.localKit;
    if (patch.visitorKit !== undefined) host.visitorKit = patch.visitorKit;
    if (patch.userId !== undefined) host.userId = patch.userId;
    if (patch.isGuest !== undefined) host.isGuest = patch.isGuest;
    if (patch.elo !== undefined) host.elo = patch.elo;
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
  }

  private setupSignalingListeners(): void {
    this.boundOnWelcome = (msg) => {
      if (msg.iceServers) {
        this.iceServers = msg.iceServers;
      }
    };

    this.boundOnPeerJoined = async (msg) => {
      const peerId = msg.peerId as string;
      if (!peerId || this.bannedPeerIds.has(peerId)) {
        return;
      }
      if (msg.nickname && typeof msg.nickname === 'string') {
        this.pendingNicknames.set(peerId, msg.nickname);
      }
      const existingPeer = this.peers.get(peerId);
      if (existingPeer && existingPeer.linkState !== 'closed' && existingPeer.linkState !== 'failed') {
        return;
      }
      await this.signaling.whenIceReady();
      await this.initiatePeerConnection(peerId);
    };

    this.boundOnSignal = async (msg) => {
      const fromPeerId = (msg.fromPeerId ?? msg.senderPeerId ?? msg.fromId) as string;
      const peer = this.peers.get(fromPeerId);
      if (peer) {
        await peer.handleSignal(msg.data ?? msg);
      }
    };

    this.boundOnRtcPingSignal = async (msg) => {
      await this.handleRtcPingSignal(msg);
    };

    this.boundOnPeerLeft = (msg) => {
      this.handlePeerDisconnect(msg.peerId as string);
    };

    this.boundOnRoomReclaimed = (msg) => {
      const host = this.players.get(1);
      if (host && typeof msg?.hostPeerId === 'string' && msg.hostPeerId) {
        host.peerId = msg.hostPeerId;
      }
    };

    this.signaling.on('WELCOME', this.boundOnWelcome);
    this.signaling.on('PEER_JOINED', this.boundOnPeerJoined);
    this.signaling.on('SIGNAL', this.boundOnSignal);
    this.signaling.on('RTC_PING_SIGNAL', this.boundOnRtcPingSignal);
    this.signaling.on('PEER_LEFT', this.boundOnPeerLeft);
    this.signaling.on('ROOM_RECLAIMED', this.boundOnRoomReclaimed);
  }

  private cleanupSignalingListeners(): void {
    this.signaling.off('WELCOME', this.boundOnWelcome);
    this.signaling.off('PEER_JOINED', this.boundOnPeerJoined);
    this.signaling.off('SIGNAL', this.boundOnSignal);
    this.signaling.off('RTC_PING_SIGNAL', this.boundOnRtcPingSignal);
    this.signaling.off('PEER_LEFT', this.boundOnPeerLeft);
    this.signaling.off('ROOM_RECLAIMED', this.boundOnRoomReclaimed);
  }

  private cleanupProbePeer(probeKey: string): void {
    const entry = this.probePeers.get(probeKey);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.probePeers.delete(probeKey);
    entry.peer.close();
  }

  private async handleRtcPingSignal(msg: any): Promise<void> {
    const fromPeerId = typeof msg?.fromPeerId === 'string' ? msg.fromPeerId : '';
    const probeId = typeof msg?.probeId === 'string' ? msg.probeId : '';
    const msgRoomId = typeof msg?.roomId === 'string' ? msg.roomId : '';
    const data = msg?.data;
    if (!fromPeerId || !probeId || !data) return;
    if (msgRoomId && this.roomId && msgRoomId !== this.roomId) return;
    if (this.bannedPeerIds.has(fromPeerId)) return;

    const probeKey = `${fromPeerId}:${probeId}`;
    let entry = this.probePeers.get(probeKey);
    if (!entry) {
      if (this.probePeers.size >= NetworkHost.MAX_PROBE_PEERS) {
        const oldestKey = this.probePeers.keys().next().value as string | undefined;
        if (oldestKey) {
          this.cleanupProbePeer(oldestKey);
        }
      }

      const timer = setTimeout(() => {
        this.cleanupProbePeer(probeKey);
      }, NetworkHost.PROBE_PEER_TTL_MS);

      const iceServers = this.iceServers.length > 0 ? this.iceServers : undefined;
      const probePeer = new PeerConnection({
        peerId: `probe_${probeKey}`,
        isInitiator: false,
        unreliableOnly: true,
        iceServers,
        signalingClient: this.signaling,
        onReliableMessage: (rawMsg: unknown) => {
          const m =
            typeof rawMsg === 'string'
              ? (() => {
                  try {
                    return JSON.parse(rawMsg);
                  } catch {
                    return null;
                  }
                })()
              : (rawMsg as Record<string, unknown> | null);
          if (m && m.type === 'PING_PROBE') {
            probePeer.sendUnreliableMessage({ type: 'PONG_PROBE', t: m.t });
          }
        }
      });

      probePeer.onLocalDescription = (sdp) => {
        this.signaling.sendRtcPingSignal({
          roomId: msgRoomId || this.roomId,
          probeId,
          targetPeerId: fromPeerId,
          data: sdp
        });
      };
      probePeer.onLocalCandidate = (cand) => {
        this.signaling.sendRtcPingSignal({
          roomId: msgRoomId || this.roomId,
          probeId,
          targetPeerId: fromPeerId,
          data: { candidate: cand }
        });
      };
      probePeer.onDisconnected = () => {
        this.cleanupProbePeer(probeKey);
      };

      entry = { peer: probePeer, timer };
      this.probePeers.set(probeKey, entry);
    }

    await entry.peer.handleSignal(data);
  }

  private resolveGoalScorerId(bannerScorerId?: unknown): number | null {
    if (this.engine && 'lastGoalScorerId' in this.engine) {
      const id = (this.engine as any).lastGoalScorerId;
      return typeof id === 'number' && Number.isFinite(id) ? id : null;
    }
    if (typeof bannerScorerId === 'number' && Number.isFinite(bannerScorerId)) {
      return bannerScorerId;
    }
    return this.activeGoalScorerId;
  }

  private buildRoomStateSyncPayload(assignedPlayerId?: number): Record<string, unknown> {
    const playersList = this.getPlayers();
    const lastGoalScorerId = this.resolveGoalScorerId();
    return {
      type: 'ROOM_STATE_SYNC',
      assignedPlayerId,
      playerId: assignedPlayerId,
      playersList,
      players: playersList,
      teamsLocked: this.teamsLocked,
      allowCaptainKitSwitch: this.allowCaptainKitSwitch,
      roomId: this.roomId,
      roomName: this.roomName,
      stadiumId: this.stadiumId,
      maxPlayers: this.maxPlayers,
      timeLimit: this.timeLimit,
      scoreLimit: this.scoreLimit,
      matchPhase: this.matchPhase,
      lastGoalScorerId,
      scorerPlayerId: lastGoalScorerId,
      redKitVariant: this.redKitVariant,
      blueKitVariant: this.blueKitVariant,
      gameplayConfig: this.gameplayConfig,
      modifiers: this.modifiers,
      activeBanner: this.activeBanner,
      roomConfig: {
        id: this.roomId,
        name: this.roomName,
        stadiumId: this.stadiumId,
        maxPlayers: this.maxPlayers,
        timeLimit: this.timeLimit,
        scoreLimit: this.scoreLimit,
        teamsLocked: this.teamsLocked,
        allowCaptainKitSwitch: this.allowCaptainKitSwitch
      }
    };
  }

  private roomStateSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  public broadcastRoomStateSync(immediate: boolean = false): void {
    if (immediate) {
      if (this.roomStateSyncDebounceTimer) {
        clearTimeout(this.roomStateSyncDebounceTimer);
        this.roomStateSyncDebounceTimer = null;
      }
      this.doBroadcastRoomStateSync();
      return;
    }
    if (this.roomStateSyncDebounceTimer) return;
    this.roomStateSyncDebounceTimer = setTimeout(() => {
      this.roomStateSyncDebounceTimer = null;
      this.doBroadcastRoomStateSync();
    }, 40);
  }

  private doBroadcastRoomStateSync(): void {
    const playersList = this.getPlayers();
    for (const [peerId, peer] of this.peers.entries()) {
      const pid = this.peerToPlayerId.get(peerId);
      peer.sendReliable(this.buildRoomStateSyncPayload(pid));
    }
    this.broadcastReliable({
      type: 'PLAYER_LIST',
      players: playersList,
      playersList,
      teamsLocked: this.teamsLocked
    });
  }

  private async initiatePeerConnection(peerId: string): Promise<void> {
    const peer = new PeerConnection({
      peerId,
      isInitiator: true,
      iceServers: this.iceServers.length > 0 ? this.iceServers : undefined,
      signalingClient: this.signaling,
      onSignal: (data) => {
        this.signaling.sendSignal(peerId, data);
      },
      onReliableMessage: (msg: unknown) => {
        this.handleReliableMessage(peerId, msg as Record<string, unknown>);
      },
      onUnreliableInput: (buffer: ArrayBuffer) => {
        const playerId = this.peerToPlayerId.get(peerId);
        if (playerId !== undefined) {
          const count = BinaryProtocol.decodeInputBundleInto(buffer, this.decodedInputScratch);
          for (let i = 0; i < count; i++) {
            const decoded = this.decodedInputScratch[i]!;
            this.onPlayerInput?.(
              playerId,
              decoded.inputMask ?? 0,
              decoded.tick ?? decoded.sequence ?? 0,
              decoded.aimAngle,
              decoded.aimThrottle
            );
          }
        }
      },
      onConnected: () => {
        let playerId = this.peerToPlayerId.get(peerId);
        const isFirstConnect = playerId === undefined;

        if (isFirstConnect) {
          playerId = this.nextPlayerId++;
          this.peerToPlayerId.set(peerId, playerId);

          const team = 'spectator';
          const initialNick = this.pendingNicknames.get(peerId) || `Player ${playerId}`;

          const playerInfo: PlayerInfo = {
            id: playerId,
            peerId,
            nickname: initialNick,
            name: initialNick,
            team,
            number: playerId,
            avatar: String(playerId),
            avatarType: 'letters',
            isAdmin: false,
            isHost: false
          };

          this.players.set(playerId, playerInfo);
          this.onPlayerJoined?.(playerInfo);
          this.onPlayersUpdated?.(this.getPlayers());
        }

        const playersList = this.getPlayers();
        const syncPayload = this.buildRoomStateSyncPayload(playerId);

        peer.sendReliable(syncPayload);
        peer.sendReliable({
          ...syncPayload,
          type: 'INITIAL_STATE_PACKET'
        });
        peer.sendReliable({
          type: 'ASSIGN_ID',
          playerId,
          players: playersList,
          teamsLocked: this.teamsLocked
        });

        this.broadcastReliable({
          type: 'PLAYER_LIST',
          players: playersList,
          playersList,
          teamsLocked: this.teamsLocked
        });
      },
      onDisconnected: () => {
        this.handlePeerDisconnect(peerId);
      }
    });

    this.peers.set(peerId, peer);
    await peer.createOffer();
  }

  private handleReliableMessage(peerId: string, msg: Record<string, unknown>): void {
    const playerId = this.peerToPlayerId.get(peerId);
    if (playerId === undefined) return;
    const player = this.players.get(playerId);
    if (!player) return;

    if (msg.type === 'SET_PROFILE' || msg.type === 'CLIENT_HELLO') {
      const isHello = msg.type === 'CLIENT_HELLO';
      const nick = String(msg.name || msg.nickname || player.nickname).trim().slice(0, 25);
      if (nick) {
        player.nickname = nick;
        player.name = nick;
      }
      if (typeof msg.userId === 'string') {
        player.userId = msg.userId;
      }
      if (typeof msg.isGuest === 'boolean') {
        player.isGuest = msg.isGuest;
      }
      if (typeof msg.elo === 'number' && Number.isFinite(msg.elo)) {
        player.elo = msg.elo;
      }
      if (msg.number !== undefined) {
        player.number = Number(msg.number || player.number) % 100;
      }
      if (msg.avatar !== undefined && String(msg.avatar).trim() !== '') {
        player.avatar = String(msg.avatar).trim();
      }
      if (msg.avatarType) {
        player.avatarType = String(msg.avatarType);
      }
      if (msg.kit && typeof msg.kit === 'object') {
        player.kit = msg.kit;
      }
      if (msg.localKit && typeof msg.localKit === 'object') {
        player.localKit = msg.localKit;
      }
      if (msg.visitorKit && typeof msg.visitorKit === 'object') {
        player.visitorKit = msg.visitorKit;
      }

      this.onPlayersUpdated?.(this.getPlayers());
      if (isHello) {
        const peer = this.peers.get(peerId);
        if (peer) {
          const syncPayload = this.buildRoomStateSyncPayload(playerId);
          peer.sendReliable({
            ...syncPayload,
            type: 'INITIAL_STATE_PACKET'
          });
        }
        if (!this.welcomedPeers.has(peerId)) {
          this.welcomedPeers.add(peerId);
          this.broadcastSystemNotice(`${player.nickname} se ha unido a la sala`);
        }
      }
      this.broadcastRoomStateSync();
    } else if (msg.type === 'PING_PROBE') {
      const peer = this.peers.get(peerId);
      peer?.sendUnreliableMessage({
        type: 'PONG_PROBE',
        t: msg.t
      });
    } else if (msg.type === 'CHAT_TYPING') {
      const isTyping = Boolean(msg.isTyping);
      player.isTyping = isTyping;
      this.onPlayerTyping?.(player.id, isTyping);
    } else if (msg.type === 'KIT_VARIANT_CHANGE') {
      const redCapId = this.getRedCaptainId();
      const blueCapId = this.getBlueCaptainId();
      const isCaptain = player.id === redCapId || player.id === blueCapId;
      if (player.isAdmin || player.isHost || (this.allowCaptainKitSwitch && isCaptain)) {
        if (msg.team === 'red' && (msg.variant === 'home' || msg.variant === 'away')) {
          this.redKitVariant = msg.variant;
        } else if (msg.team === 'blue' && (msg.variant === 'home' || msg.variant === 'away')) {
          this.blueKitVariant = msg.variant;
        }
        this.broadcastRoomStateSync();
      }
    } else if (msg.type === 'UPDATE_PLAYER_PROFILE') {
      const pid = Number(msg.playerId ?? playerId);
      const target = this.players.get(pid);
      if (target) {
        if (typeof msg.nickname === 'string' && msg.nickname) target.nickname = msg.nickname;
        if (typeof msg.name === 'string' && msg.name) target.name = msg.name;
        if (typeof msg.userId === 'string') target.userId = msg.userId;
        if (typeof msg.isGuest === 'boolean') target.isGuest = msg.isGuest;
        if (typeof msg.elo === 'number' && Number.isFinite(msg.elo)) target.elo = msg.elo;
        if (typeof msg.avatar === 'string') target.avatar = msg.avatar;
        if (typeof msg.avatarType === 'string') target.avatarType = msg.avatarType as any;
        if (msg.localKit && typeof msg.localKit === 'object') target.localKit = msg.localKit;
        if (msg.visitorKit && typeof msg.visitorKit === 'object') target.visitorKit = msg.visitorKit;
        if (msg.kit && typeof msg.kit === 'object') target.kit = msg.kit;
        this.onPlayersUpdated?.(this.getPlayers());
        this.broadcastRoomStateSync();
      }
    } else if (msg.type === 'CHAT' || msg.type === 'CHAT_MSG') {
      const text = String(msg.text || '').trim().slice(0, 140);
      if (!text || !this.tryConsumeChatCooldown(playerId)) {
        return;
      }
      const msgId = typeof msg.id === 'string'
        ? msg.id
        : `${playerId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      this.onChatMessage?.(player.nickname, text, player.team, msgId);
      this.broadcastReliable({
        type: 'CHAT',
        id: msgId,
        sender: player.nickname,
        text,
        team: player.team,
        isHost: Boolean(player.isHost)
      });
    } else if (msg.type === 'EMOTE') {
      const emoji = String(msg.emoji || '').trim();
      const isGuestPlayer = player.isGuest === true || /^inv_/i.test(player.nickname || '');
      const isActiveTeam = player.team === 'red' || player.team === 'blue';
      if (!emoji || isGuestPlayer || !isActiveTeam) return;
      if (!this.tryConsumeChatCooldown(playerId)) return;
      this.onPlayerEmote?.(playerId, emoji);
      this.broadcastReliable(
        {
          type: 'EMOTE',
          playerId,
          emoji
        },
        peerId
      );
    } else if (msg.type === 'TEAM_CHANGE') {
      const targetId = Number(msg.targetPlayerId ?? playerId);
      const targetTeam = msg.team as 'red' | 'blue' | 'spectator';
      if (
        canChangeTeam(
          peerId,
          targetId === playerId ? peerId : `player_${targetId}`,
          this.teamsLocked,
          Boolean(player.isAdmin || player.isHost)
        )
      ) {
        const targetPlayer = this.players.get(targetId);
        if (targetPlayer && (targetTeam === 'red' || targetTeam === 'blue' || targetTeam === 'spectator')) {
          this.applyTeamTransition(targetPlayer, targetTeam);
          this.onTeamChangeRequest?.(targetId, targetTeam);
          this.onPlayersUpdated?.(this.getPlayers());
          this.broadcastRoomStateSync();
        }
      }
    } else if (msg.type === 'POSITION_CHANGE') {
      const targetId = Number(msg.targetPlayerId ?? 0);
      const pos = String(msg.position || '') as PlayerPosition;
      if (targetId > 0 && PLAYER_POSITIONS.includes(pos)) {
        this.setPlayerPosition(targetId, pos, playerId);
      }
    } else if (msg.type === 'ADMIN_ACTION') {
      if (!player.isAdmin && !player.isHost) return;
      const action = String(msg.action || '');
      const targetId = Number(msg.targetPlayerId ?? 0);

      if (action === 'TOGGLE_ADMIN') {
        const target = this.players.get(targetId);
        if (target && target.id !== 1 && !target.isHost) {
          target.isAdmin = !target.isAdmin;
          this.onPlayersUpdated?.(this.getPlayers());
          this.broadcastRoomStateSync();
        }
      } else if (action === 'KICK' || action === 'BAN') {
        const target = this.players.get(targetId);
        if (target && target.id !== 1 && !target.isHost && target.id !== playerId) {
          this.kickPlayer(targetId, action === 'BAN', true);
        }
      } else if (action === 'TOGGLE_CAPTAIN_KIT_SWITCH') {
        if (typeof msg.allowCaptainKitSwitch === 'boolean') {
          this.allowCaptainKitSwitch = msg.allowCaptainKitSwitch;
        } else {
          this.allowCaptainKitSwitch = !this.allowCaptainKitSwitch;
        }
        this.broadcastRoomStateSync();
      } else if (action === 'AUTO_BALANCE') {
        this.autoBalanceSpectators();
      } else if (action === 'CLEAR_TEAM' && (msg.team === 'red' || msg.team === 'blue')) {
        this.clearTeam(msg.team);
      } else if (
        action === 'START_MATCH' ||
        action === 'STOP_MATCH' ||
        action === 'TOGGLE_PAUSE' ||
        action === 'SET_RULES' ||
        action === 'AUTO_BALANCE' ||
        action === 'RESET_TEAMS'
      ) {
        if (action === 'AUTO_BALANCE') {
          this.autoBalanceSpectators();
          return;
        }
        if (action === 'RESET_TEAMS') {
          this.resetTeamsToSpectators();
          return;
        }
        if (action === 'SET_RULES') {
          if (typeof msg.teamsLocked === 'boolean') this.teamsLocked = msg.teamsLocked;
          if (typeof msg.timeLimit === 'number') this.timeLimit = msg.timeLimit;
          if (typeof msg.scoreLimit === 'number') this.scoreLimit = msg.scoreLimit;
          if (typeof msg.stadiumId === 'string') this.stadiumId = msg.stadiumId;
          if (typeof msg.allowCaptainKitSwitch === 'boolean') this.allowCaptainKitSwitch = msg.allowCaptainKitSwitch;
        }
        this.onAdminMatchAction?.(action, msg);
        this.broadcastRoomStateSync();
      }
    } else if (msg.type === 'SKIP_GOAL_REPLAY') {
      const scorerId = (this.engine as any)?.lastGoalScorerId ?? null;
      if (typeof scorerId === 'number' && playerId === scorerId) {
        const skipped = (this.engine as any)?.skipGoalReplay?.(playerId);
        if (skipped !== false) {
          this.activeGoalScorerId = null;
          this.onGoalReplaySkipped?.(playerId);
          this.broadcastRoomStateSync(true);
        }
      }
    }
  }

  public togglePlayerAdmin(targetPlayerId: number): boolean {
    if (targetPlayerId === 1) return false;
    const target = this.players.get(targetPlayerId);
    if (!target || target.isHost) return false;
    target.isAdmin = !target.isAdmin;
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
    return true;
  }

  public elevatePeerToAdmin(peerId: string): boolean {
    const cleanPeerId = String(peerId || '').trim();
    if (!cleanPeerId) return false;
    for (const target of this.players.values()) {
      if (target.peerId === cleanPeerId) {
        if (!target.isAdmin) {
          target.isAdmin = true;
          this.onPlayersUpdated?.(this.getPlayers());
          this.broadcastRoomStateSync();
          this.broadcastSystemNotice(`${target.nickname} ahora es administrador de la sala.`);
        }
        return true;
      }
    }
    return false;
  }

  public assignDefaultPosition(team: 'red' | 'blue', excludePlayerId?: number): PlayerPosition {
    const teammates = Array.from(this.players.values()).filter(
      (p) => p.team === team && p.id !== excludePlayerId
    );
    const occupied = new Set(teammates.map((p) => p.position).filter(Boolean));
    for (const pos of PLAYER_POSITIONS) {
      if (!occupied.has(pos)) return pos;
    }
    const counts: Record<PlayerPosition, number> = { GK: 0, DFC: 0, MC: 0, ST: 0 };
    for (const tm of teammates) {
      if (tm.position && counts[tm.position] !== undefined) {
        counts[tm.position]++;
      }
    }
    const outfield: PlayerPosition[] = ['DFC', 'MC', 'ST'];
    outfield.sort((a, b) => counts[a] - counts[b]);
    return outfield[0] ?? 'MC';
  }

  private applyTeamTransition(player: PlayerInfo, nextTeam: 'red' | 'blue' | 'spectator'): void {
    const prevTeam = player.team;
    player.team = nextTeam;
    if (nextTeam === 'spectator') {
      player.teamOrder = 0;
      player.position = undefined;
      return;
    }
    if (prevTeam !== nextTeam) {
      player.teamOrder = this.nextTeamOrder++;
      player.position = this.assignDefaultPosition(nextTeam, player.id);
    } else if (!player.position) {
      player.position = this.assignDefaultPosition(nextTeam, player.id);
    }
  }

  public setPlayerTeam(targetPlayerId: number, team: 'red' | 'blue' | 'spectator'): boolean {
    const target = this.players.get(targetPlayerId);
    if (!target) return false;
    if (target.isBot && team === 'spectator') {
      return this.removeBot(targetPlayerId);
    }
    this.applyTeamTransition(target, team);
    this.onTeamChangeRequest?.(targetPlayerId, team);
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
    return true;
  }

  public addBot(team: 'red' | 'blue', difficulty: 'easy' | 'medium' | 'hard' = 'medium'): PlayerInfo | null {
    if (team !== 'red' && team !== 'blue') return null;
    const id = this.nextPlayerId++;
    const botIndex = Array.from(this.players.values()).filter((p) => p.isBot).length + 1;
    const position = this.assignDefaultPosition(team, id);
    const botInfo: PlayerInfo = {
      id,
      peerId: `bot_${id}`,
      nickname: `BOT ${botIndex}`,
      name: `BOT ${botIndex}`,
      team,
      position,
      teamOrder: this.nextTeamOrder++,
      number: id,
      isAdmin: false,
      isHost: false,
      isGuest: false,
      isBot: true,
      botDifficulty: difficulty,
      avatar: '🤖',
      avatarType: 'emoji',
      ping: 0
    };
    this.players.set(id, botInfo);
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
    return botInfo;
  }

  public setBotDifficulty(botId: number, difficulty: 'easy' | 'medium' | 'hard'): boolean {
    const target = this.players.get(botId);
    if (!target || !target.isBot) return false;
    target.botDifficulty = difficulty;
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
    return true;
  }

  public removeBot(botId: number): boolean {
    const target = this.players.get(botId);
    if (!target || !target.isBot) return false;
    this.players.delete(botId);
    this.onTeamChangeRequest?.(botId, 'spectator');
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
    return true;
  }

  public clearTeam(team: 'red' | 'blue'): boolean {
    let changed = false;
    for (const [id, player] of Array.from(this.players.entries())) {
      if (player.team !== team) continue;
      if (player.isBot) {
        this.players.delete(id);
        this.onTeamChangeRequest?.(id, 'spectator');
        changed = true;
      } else {
        this.applyTeamTransition(player, 'spectator');
        this.onTeamChangeRequest?.(id, 'spectator');
        changed = true;
      }
    }
    if (changed) {
      if (team === 'red') this.redKitVariant = 'home';
      else this.blueKitVariant = 'away';
      this.onPlayersUpdated?.(this.getPlayers());
      this.broadcastRoomStateSync();
    }
    return changed;
  }

  public setPlayerPosition(
    targetPlayerId: number,
    position: PlayerPosition,
    requesterId: number = 1
  ): boolean {
    if (!PLAYER_POSITIONS.includes(position)) return false;
    const target = this.players.get(targetPlayerId);
    const requester = this.players.get(requesterId);
    if (!target || !requester) return false;
    if (target.team !== 'red' && target.team !== 'blue') return false;

    const captainId = target.team === 'red' ? this.getRedCaptainId() : this.getBlueCaptainId();
    const isAdminOrHost = Boolean(requester.isHost || requester.isAdmin);
    const isCaptainOfTargetTeam = captainId === requesterId && requester.team === target.team;
    if (!isAdminOrHost && !isCaptainOfTargetTeam) {
      return false;
    }

    const prevPos: PlayerPosition = target.position || 'DFC';
    if (prevPos === position) return true;

    if (position === 'GK') {
      for (const other of this.players.values()) {
        if (other.id !== targetPlayerId && other.team === target.team && other.position === 'GK') {
          other.position = prevPos === 'GK' ? 'DFC' : prevPos;
          this.onPositionChanged?.(other.id, other.position);
        }
      }
    }

    target.position = position;
    this.onPositionChanged?.(targetPlayerId, position);
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
    return true;
  }

  public autoBalanceSpectators(): void {
    const spectators = Array.from(this.players.values()).filter((p) => p.team === 'spectator');
    if (spectators.length === 0) return;
    const redCount = Array.from(this.players.values()).filter((p) => p.team === 'red').length;
    const blueCount = Array.from(this.players.values()).filter((p) => p.team === 'blue').length;

    if (redCount < blueCount) {
      const first = spectators[0];
      this.applyTeamTransition(first, 'red');
      this.onTeamChangeRequest?.(first.id, 'red');
    } else if (blueCount < redCount) {
      const first = spectators[0];
      this.applyTeamTransition(first, 'blue');
      this.onTeamChangeRequest?.(first.id, 'blue');
    } else {
      // redCount === blueCount
      if (spectators.length >= 2) {
        const first = spectators[0];
        const second = spectators[1];
        this.applyTeamTransition(first, 'red');
        this.onTeamChangeRequest?.(first.id, 'red');
        this.applyTeamTransition(second, 'blue');
        this.onTeamChangeRequest?.(second.id, 'blue');
      } else {
        const first = spectators[0];
        this.applyTeamTransition(first, 'red');
        this.onTeamChangeRequest?.(first.id, 'red');
      }
    }
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
  }

  public resetTeamsToSpectators(): void {
    for (const player of this.players.values()) {
      if (player.team === 'red' || player.team === 'blue') {
        this.applyTeamTransition(player, 'spectator');
        this.onTeamChangeRequest?.(player.id, 'spectator');
      }
    }
    this.redKitVariant = 'home';
    this.blueKitVariant = 'away';
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
  }

  public getRedCaptainId(): number | null {
    const p = this.getPlayers().find((item) => item.team === 'red');
    return p ? p.id : null;
  }

  public getBlueCaptainId(): number | null {
    const p = this.getPlayers().find((item) => item.team === 'blue');
    return p ? p.id : null;
  }

  public kickPlayer(targetPlayerId: number, ban: boolean = false, byHostOrAdmin: boolean = false): boolean {
    // Host admin immutability: Host (id === 1) cannot be kicked or banned
    if (targetPlayerId === 1) return false;
    const target = this.players.get(targetPlayerId);
    if (!target || target.isHost) return false;
    if (!byHostOrAdmin && target.isAdmin) return false;

    if (ban) {
      this.bannedPeerIds.add(target.peerId);
    }

    const reason = ban
      ? 'Has sido baneado de la sala por el anfitrión.'
      : 'Has sido expulsado de la sala por el anfitrión.';

    const peer = this.peers.get(target.peerId);
    if (peer) {
      peer.sendReliable({
        type: ban ? 'PLAYER_BANNED' : 'PLAYER_KICKED',
        roomId: this.roomId,
        roomName: this.roomName,
        reason
      });
    }

    this.signaling?.send?.({
      type: 'ROOM_MODERATION_ACTION',
      action: ban ? 'ban' : 'kick',
      roomId: this.roomId,
      targetPeerId: target.peerId,
      reason
    });

    const targetName = target.name || target.nickname;
    this.handlePeerDisconnect(target.peerId, true, true);
    this.broadcastSystemNotice(ban ? `${targetName} ha sido baneado de la sala` : `${targetName} ha sido expulsado de la sala`);
    return true;
  }

  private handlePeerDisconnect(
    peerId: string,
    wasKickedOrBanned: boolean = false,
    deferClose: boolean = false
  ): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.peers.delete(peerId);
      if (deferClose) {
        // Defer closing the RTCPeerConnection slightly so the reliable moderation packet flushes first.
        const timer = setTimeout(() => {
          this.pendingClosePeers.delete(timer);
          peer.close();
        }, 120);
        this.pendingClosePeers.set(timer, peer);
      } else {
        peer.close();
      }
    }
    this.pendingNicknames.delete(peerId);
    this.welcomedPeers.delete(peerId);

    const playerId = this.peerToPlayerId.get(peerId);
    if (playerId !== undefined) {
      const p = this.players.get(playerId);
      const pName = p ? (p.name || p.nickname) : `Player ${playerId}`;
      this.peerToPlayerId.delete(peerId);
      this.players.delete(playerId);
      this.lastChatAtByPlayerId.delete(playerId);
      if (!wasKickedOrBanned) {
        this.broadcastSystemNotice(`${pName} ha abandonado la sala`);
      }
      this.onPlayerLeft?.(playerId);
      this.onPlayersUpdated?.(this.getPlayers());
      this.broadcastRoomStateSync();
    }
  }

  public broadcastSnapshot(
    buffer: ArrayBuffer,
    opts?: { forceImmediate?: boolean }
  ): void {
    this.snapshotTickCounter = (this.snapshotTickCounter + 1) >>> 0;
    const forceImmediate = Boolean(opts?.forceImmediate);
    const highPlayerDensity = this.players.size >= 6;
    const isEvenTick = (this.snapshotTickCounter & 1) === 0;

    this.peers.forEach((peer) => {
      // Backpressure SCTP estricto (16 KB): omite snapshot para evitar bufferbloat
      if (peer.unreliableBufferedAmount > SCTP_BACKPRESSURE_LIMIT_BYTES) return;
      // Tasa adaptativa 30–60 Hz si >= 6 jugadores o enlace TURN relay congestionado
      const isCongestedRelay =
        peer.candidateType === 'relay' && peer.unreliableBufferedAmount > 4096;
      if (!forceImmediate && (highPlayerDensity || isCongestedRelay) && !isEvenTick) {
        return;
      }
      peer.sendUnreliable(buffer);
    });
  }

  private tryConsumeChatCooldown(playerId: number): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const lastAt = this.lastChatAtByPlayerId.get(playerId) ?? -Infinity;
    if (now - lastAt < NetworkHost.CHAT_EMOTE_COOLDOWN_MS) {
      return false;
    }
    this.lastChatAtByPlayerId.set(playerId, now);
    return true;
  }

  public broadcastReliable(msg: unknown, excludePeerId?: string): void {
    this.peers.forEach((peer, pid) => {
      if (excludePeerId !== undefined && pid === excludePeerId) return;
      peer.sendReliable(msg);
    });
  }

  public sendChat(sender: string, text: string, team?: string): void {
    const msgId = `host-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.broadcastReliable({
      type: 'CHAT',
      id: msgId,
      sender,
      text,
      team,
      isHost: true
    });
    this.onChatMessage?.(sender, text, team, msgId);
  }

  public broadcastSystemNotice(text: string): void {
    const msgId = `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.broadcastReliable({
      type: 'CHAT',
      id: msgId,
      sender: '',
      text,
      team: 'system',
      isSystem: true
    });
    this.onChatMessage?.('', text, 'system', msgId);
  }

  public broadcastMatchStats(snapshot: any, stats: any[], mvp?: any, redTeamStats?: any[], blueTeamStats?: any[]): void {
    this.broadcastReliable({
      type: 'MATCH_STATS_SUMMARY',
      snapshot,
      stats,
      mvp,
      redTeamStats,
      blueTeamStats
    });
  }

  public sendEmote(playerId: number, emoji: string): void {
    this.broadcastReliable({
      type: 'EMOTE',
      playerId,
      emoji
    });
  }

  public broadcastGameFx(fx: string, intensity?: number, countdownValue?: number): void {
    this.broadcastReliable({
      type: 'GAME_FX_EVENT',
      fx,
      intensity,
      countdownValue
    });
  }

  public broadcastMatchBanner(banner: Record<string, unknown> | null): void {
    const isCleared = !banner || banner.kind === 'NONE';
    const rawBannerScorer = banner?.scorerPlayerId ?? banner?.lastGoalScorerId;
    const scorerId = isCleared ? null : this.resolveGoalScorerId(rawBannerScorer);
    if (isCleared) {
      this.activeGoalScorerId = null;
    } else if (banner?.kind === 'GOAL') {
      this.activeGoalScorerId = scorerId;
    }
    const normalizedBanner = banner
      ? {
          ...banner,
          ...(banner.kind === 'GOAL'
            ? { lastGoalScorerId: scorerId, scorerPlayerId: scorerId }
            : {})
        }
      : { kind: 'NONE' };
    this.activeBanner = normalizedBanner;
    this.broadcastReliable({
      type: 'MATCH_BANNER_EVENT',
      lastGoalScorerId: scorerId,
      scorerPlayerId: scorerId,
      banner: normalizedBanner
    });
  }

  public broadcastScoreEvent(payload: Record<string, unknown>): void {
    this.broadcastReliable({
      type: 'SCORE_EVENT',
      ...payload
    });
  }

  public getPrimaryIceRoute(): string {
    if (this.peers.size === 0) return 'Host Local';
    let hasRelay = false;
    let hasStun = false;
    let hasLan = false;
    for (const peer of this.peers.values()) {
      if (peer.iceRoute === 'Relay (TURN)') hasRelay = true;
      else if (peer.iceRoute === 'Direct P2P (STUN/srflx)') hasStun = true;
      else if (peer.iceRoute === 'Direct P2P (LAN/host)') hasLan = true;
    }
    if (hasRelay) return 'Relay (TURN)';
    if (hasStun) return 'Direct P2P (STUN/srflx)';
    if (hasLan) return 'Direct P2P (LAN/host)';
    return 'Host Local';
  }

  public getPlayers(): PlayerInfo[] {
    return Array.from(this.players.values()).sort((a, b) => {
      const aActive = a.team === 'red' || a.team === 'blue';
      const bActive = b.team === 'red' || b.team === 'blue';
      if (aActive && bActive && a.team === b.team) {
        const oa = a.teamOrder && a.teamOrder > 0 ? a.teamOrder : Number.MAX_SAFE_INTEGER;
        const ob = b.teamOrder && b.teamOrder > 0 ? b.teamOrder : Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
      }
      return a.id - b.id;
    });
  }

  public closeRoomAndDestroy(): void {
    this.broadcastReliable({
      type: 'ROOM_CLOSED',
      roomId: this.roomId,
      roomName: this.roomName,
      reason: 'El anfitrión ha abandonado la sala.'
    });
    this.destroy();
  }

  public destroy(): void {
    this.cleanupSignalingListeners();
    this.activeGoalScorerId = null;
    for (const [timer, deferredPeer] of this.pendingClosePeers.entries()) {
      clearTimeout(timer);
      deferredPeer.close();
    }
    this.pendingClosePeers.clear();
    for (const probeKey of [...this.probePeers.keys()]) {
      this.cleanupProbePeer(probeKey);
    }
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.peerToPlayerId.clear();
    this.pendingNicknames.clear();
    this.welcomedPeers.clear();
    this.lastChatAtByPlayerId.clear();
  }
}
