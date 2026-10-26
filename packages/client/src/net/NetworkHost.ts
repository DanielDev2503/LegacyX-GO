import { BinaryProtocol } from '@legacyx/core';
import { PeerConnection } from './PeerConnection';
import { SignalingClient } from './SignalingClient';
import { canChangeTeam } from './ClientPrediction';

export interface PlayerInfo {
  id: number;
  peerId: string;
  nickname: string;
  name?: string;
  team: 'red' | 'blue' | 'spectator';
  number: number;
  isAdmin: boolean;
  isHost?: boolean;
  avatar?: string;
  avatarType?: 'letters' | 'emoji' | string;
  ping?: number;
  kit?: any;
  localKit?: any;
  visitorKit?: any;
}

export class NetworkHost {
  private signaling: SignalingClient;
  private peers = new Map<string, PeerConnection>();
  private peerToPlayerId = new Map<string, number>();
  private pendingNicknames = new Map<string, string>();
  private players = new Map<number, PlayerInfo>();
  private bannedPeerIds = new Set<string>();
  private nextPlayerId = 2; // 1 is reserved for Host local player
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
  private boundOnPeerLeft!: (msg: any) => void;

  public onPlayerInput?: (playerId: number, inputMask: number, tick: number) => void;
  public onPlayerJoined?: (player: PlayerInfo) => void;
  public onPlayerLeft?: (playerId: number) => void;
  public onPlayersUpdated?: (players: PlayerInfo[]) => void;
  public onChatMessage?: (sender: string, text: string, team?: string, id?: string) => void;
  public onPlayerEmote?: (playerId: number, emoji: string) => void;
  public onTeamChangeRequest?: (playerId: number, team: 'red' | 'blue' | 'spectator') => void;
  public onAdminMatchAction?: (action: string, payload?: Record<string, unknown>) => void;

  public redKitVariant: 'home' | 'away' = 'home';
  public blueKitVariant: 'home' | 'away' = 'away';
  public gameplayConfig: Record<string, unknown> | null = null;
  public modifiers: Record<string, unknown> | null = null;

  constructor(signaling: SignalingClient, hostNickname: string, hostProfile?: Partial<PlayerInfo>) {
    this.signaling = signaling;

    // Register host player (Admin & Host immutable)
    this.players.set(1, {
      id: 1,
      peerId: hostProfile?.peerId || signaling.peerId || 'host',
      nickname: hostNickname,
      name: hostNickname,
      team: hostProfile?.team ?? 'spectator',
      number: hostProfile?.number ?? 10,
      isAdmin: true,
      isHost: true,
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
    if (patch.team !== undefined) host.team = patch.team;
    if (patch.kit !== undefined) host.kit = patch.kit;
    if (patch.localKit !== undefined) host.localKit = patch.localKit;
    if (patch.visitorKit !== undefined) host.visitorKit = patch.visitorKit;
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

    this.boundOnPeerLeft = (msg) => {
      this.handlePeerDisconnect(msg.peerId as string);
    };

    this.signaling.on('WELCOME', this.boundOnWelcome);
    this.signaling.on('PEER_JOINED', this.boundOnPeerJoined);
    this.signaling.on('SIGNAL', this.boundOnSignal);
    this.signaling.on('PEER_LEFT', this.boundOnPeerLeft);
  }

  private cleanupSignalingListeners(): void {
    this.signaling.off('WELCOME', this.boundOnWelcome);
    this.signaling.off('PEER_JOINED', this.boundOnPeerJoined);
    this.signaling.off('SIGNAL', this.boundOnSignal);
    this.signaling.off('PEER_LEFT', this.boundOnPeerLeft);
  }

  private buildRoomStateSyncPayload(assignedPlayerId?: number): Record<string, unknown> {
    const playersList = this.getPlayers();
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
      redKitVariant: this.redKitVariant,
      blueKitVariant: this.blueKitVariant,
      gameplayConfig: this.gameplayConfig,
      modifiers: this.modifiers,
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

  public broadcastRoomStateSync(): void {
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
          const decoded = BinaryProtocol.decodeInput(buffer);
          if (decoded) {
            this.onPlayerInput?.(playerId, decoded.inputMask ?? 0, decoded.tick ?? decoded.sequence ?? 0);
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
      this.broadcastRoomStateSync();
      if (isHello) {
        this.broadcastSystemNotice(`${player.nickname} se ha unido a la sala`);
      }
    } else if (msg.type === 'PING_PROBE') {
      const peer = this.peers.get(peerId);
      peer?.sendReliable({
        type: 'PONG_PROBE',
        t: msg.t
      });
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
        if (typeof msg.avatar === 'string') target.avatar = msg.avatar;
        if (typeof msg.avatarType === 'string') target.avatarType = msg.avatarType as any;
        if (msg.localKit && typeof msg.localKit === 'object') target.localKit = msg.localKit;
        if (msg.visitorKit && typeof msg.visitorKit === 'object') target.visitorKit = msg.visitorKit;
        if (msg.kit && typeof msg.kit === 'object') target.kit = msg.kit;
        this.onPlayersUpdated?.(this.getPlayers());
        this.broadcastRoomStateSync();
      }
    } else if (msg.type === 'CHAT') {
      const text = String(msg.text || '').trim().slice(0, 140);
      if (text) {
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
      }
    } else if (msg.type === 'EMOTE') {
      const emoji = String(msg.emoji || '').trim();
      if (emoji && player.team !== 'spectator') {
        this.onPlayerEmote?.(playerId, emoji);
        this.broadcastReliable({
          type: 'EMOTE',
          playerId,
          emoji
        });
      }
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
          targetPlayer.team = targetTeam;
          this.onTeamChangeRequest?.(targetId, targetTeam);
          this.onPlayersUpdated?.(this.getPlayers());
          this.broadcastRoomStateSync();
        }
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

  public setPlayerTeam(targetPlayerId: number, team: 'red' | 'blue' | 'spectator'): boolean {
    const target = this.players.get(targetPlayerId);
    if (!target) return false;
    target.team = team;
    this.onTeamChangeRequest?.(targetPlayerId, team);
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
      first.team = 'red';
      this.onTeamChangeRequest?.(first.id, 'red');
    } else if (blueCount < redCount) {
      const first = spectators[0];
      first.team = 'blue';
      this.onTeamChangeRequest?.(first.id, 'blue');
    } else {
      // redCount === blueCount
      if (spectators.length >= 2) {
        const first = spectators[0];
        const second = spectators[1];
        first.team = 'red';
        this.onTeamChangeRequest?.(first.id, 'red');
        second.team = 'blue';
        this.onTeamChangeRequest?.(second.id, 'blue');
      } else {
        const first = spectators[0];
        first.team = 'red';
        this.onTeamChangeRequest?.(first.id, 'red');
      }
    }
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
  }

  public resetTeamsToSpectators(): void {
    for (const player of this.players.values()) {
      if (player.team === 'red' || player.team === 'blue') {
        player.team = 'spectator';
        this.onTeamChangeRequest?.(player.id, 'spectator');
      }
    }
    this.redKitVariant = 'home';
    this.blueKitVariant = 'away';
    this.onPlayersUpdated?.(this.getPlayers());
    this.broadcastRoomStateSync();
  }

  public getRedCaptainId(): number | null {
    const p = Array.from(this.players.values()).find((item) => item.team === 'red');
    return p ? p.id : null;
  }

  public getBlueCaptainId(): number | null {
    const p = Array.from(this.players.values()).find((item) => item.team === 'blue');
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

    const peer = this.peers.get(target.peerId);
    if (peer) {
      peer.sendReliable({
        type: ban ? 'PLAYER_BANNED' : 'PLAYER_KICKED',
        reason: ban ? 'Banned by admin' : 'Kicked by admin'
      });
    }
    const targetName = target.name || target.nickname;
    this.broadcastSystemNotice(ban ? `${targetName} ha sido baneado de la sala` : `${targetName} ha sido expulsado de la sala`);
    this.handlePeerDisconnect(target.peerId, true);
    return true;
  }

  private handlePeerDisconnect(peerId: string, wasKickedOrBanned: boolean = false): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
    }
    this.pendingNicknames.delete(peerId);

    const playerId = this.peerToPlayerId.get(peerId);
    if (playerId !== undefined) {
      const p = this.players.get(playerId);
      const pName = p ? (p.name || p.nickname) : `Player ${playerId}`;
      this.peerToPlayerId.delete(peerId);
      this.players.delete(playerId);
      if (!wasKickedOrBanned) {
        this.broadcastSystemNotice(`${pName} ha abandonado la sala`);
      }
      this.onPlayerLeft?.(playerId);
      this.onPlayersUpdated?.(this.getPlayers());
      this.broadcastRoomStateSync();
    }
  }

  public broadcastSnapshot(buffer: ArrayBuffer): void {
    this.peers.forEach((peer) => {
      peer.sendUnreliable(buffer);
    });
  }

  public broadcastReliable(msg: unknown): void {
    this.peers.forEach((peer) => {
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

  public getPlayers(): PlayerInfo[] {
    return Array.from(this.players.values());
  }

  public closeRoomAndDestroy(): void {
    this.broadcastReliable({
      type: 'ROOM_CLOSED',
      roomId: this.roomId,
      reason: 'El anfitrión ha abandonado la sala.'
    });
    this.destroy();
  }

  public destroy(): void {
    this.cleanupSignalingListeners();
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.peerToPlayerId.clear();
    this.pendingNicknames.clear();
  }
}
