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
  public onChatMessage?: (sender: string, text: string, team?: string) => void;
  public onPlayerEmote?: (playerId: number, emoji: string) => void;
  public onTeamChangeRequest?: (playerId: number, team: 'red' | 'blue' | 'spectator') => void;
  public onAdminMatchAction?: (action: string, payload?: Record<string, unknown>) => void;

  constructor(signaling: SignalingClient, hostNickname: string, hostProfile?: Partial<PlayerInfo>) {
    this.signaling = signaling;

    // Register host player (Admin & Host immutable)
    this.players.set(1, {
      id: 1,
      peerId: hostProfile?.peerId || signaling.peerId || 'host',
      nickname: hostNickname,
      name: hostNickname,
      team: hostProfile?.team ?? 'red',
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
      roomId: this.roomId,
      roomName: this.roomName,
      stadiumId: this.stadiumId,
      maxPlayers: this.maxPlayers,
      timeLimit: this.timeLimit,
      scoreLimit: this.scoreLimit,
      matchPhase: this.matchPhase,
      roomConfig: {
        id: this.roomId,
        name: this.roomName,
        stadiumId: this.stadiumId,
        maxPlayers: this.maxPlayers,
        timeLimit: this.timeLimit,
        scoreLimit: this.scoreLimit,
        teamsLocked: this.teamsLocked
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

          const redCount = Array.from(this.players.values()).filter((p) => p.team === 'red').length;
          const blueCount = Array.from(this.players.values()).filter((p) => p.team === 'blue').length;
          const team = redCount <= blueCount ? 'red' : 'blue';
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
    } else if (msg.type === 'CHAT') {
      const text = String(msg.text || '').trim().slice(0, 140);
      if (text) {
        this.onChatMessage?.(player.nickname, text, player.team);
        this.broadcastReliable({
          type: 'CHAT',
          sender: player.nickname,
          text,
          team: player.team,
          isHost: Boolean(player.isHost)
        });
      }
    } else if (msg.type === 'EMOTE') {
      const emoji = String(msg.emoji || '').trim();
      if (emoji) {
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
      } else if (
        action === 'START_MATCH' ||
        action === 'STOP_MATCH' ||
        action === 'TOGGLE_PAUSE' ||
        action === 'SET_RULES'
      ) {
        if (action === 'SET_RULES') {
          if (typeof msg.teamsLocked === 'boolean') this.teamsLocked = msg.teamsLocked;
          if (typeof msg.timeLimit === 'number') this.timeLimit = msg.timeLimit;
          if (typeof msg.scoreLimit === 'number') this.scoreLimit = msg.scoreLimit;
          if (typeof msg.stadiumId === 'string') this.stadiumId = msg.stadiumId;
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
    this.handlePeerDisconnect(target.peerId);
    return true;
  }

  private handlePeerDisconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
    }
    this.pendingNicknames.delete(peerId);

    const playerId = this.peerToPlayerId.get(peerId);
    if (playerId !== undefined) {
      this.peerToPlayerId.delete(peerId);
      this.players.delete(playerId);
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
    this.broadcastReliable({
      type: 'CHAT',
      sender,
      text,
      team,
      isHost: true
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
