import { BinaryProtocol } from '@legacyx/core';
import { PeerConnection } from './PeerConnection';
import { SignalingClient } from './SignalingClient';
import { canChangeTeam } from './ClientPrediction';

export interface PlayerInfo {
  id: number;
  peerId: string;
  nickname: string;
  team: 'red' | 'blue' | 'spectator';
  number: number;
  isAdmin: boolean;
}

export class NetworkHost {
  private signaling: SignalingClient;
  private peers = new Map<string, PeerConnection>();
  private peerToPlayerId = new Map<string, number>();
  private players = new Map<number, PlayerInfo>();
  private bannedPeerIds = new Set<string>();
  private nextPlayerId = 2; // 1 is reserved for Host local player
  private iceServers: RTCIceServer[] = [];
  public teamsLocked = false;

  public onPlayerInput?: (playerId: number, inputMask: number, tick: number) => void;
  public onPlayerJoined?: (player: PlayerInfo) => void;
  public onPlayerLeft?: (playerId: number) => void;
  public onChatMessage?: (sender: string, text: string, team?: string) => void;
  public onTeamChangeRequest?: (playerId: number, team: 'red' | 'blue' | 'spectator') => void;

  constructor(signaling: SignalingClient, hostNickname: string) {
    this.signaling = signaling;

    // Register host player (Admin immutable)
    this.players.set(1, {
      id: 1,
      peerId: 'host',
      nickname: hostNickname,
      team: 'red',
      number: 10,
      isAdmin: true
    });

    this.setupSignalingListeners();
  }

  private setupSignalingListeners(): void {
    this.signaling.on('WELCOME', (msg) => {
      if (msg.iceServers) {
        this.iceServers = msg.iceServers;
      }
    });

    this.signaling.on('PEER_JOINED', async (msg) => {
      const peerId = msg.peerId as string;
      if (this.bannedPeerIds.has(peerId)) {
        return;
      }
      await this.signaling.whenIceReady();
      await this.initiatePeerConnection(peerId);
    });

    this.signaling.on('SIGNAL', async (msg) => {
      const fromPeerId = (msg.fromPeerId ?? msg.senderPeerId) as string;
      const peer = this.peers.get(fromPeerId);
      if (peer) {
        await peer.handleSignal(msg.data ?? msg);
      }
    });

    this.signaling.on('PEER_LEFT', (msg) => {
      this.handlePeerDisconnect(msg.peerId as string);
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
        const playerId = this.nextPlayerId++;
        this.peerToPlayerId.set(peerId, playerId);

        const redCount = Array.from(this.players.values()).filter((p) => p.team === 'red').length;
        const blueCount = Array.from(this.players.values()).filter((p) => p.team === 'blue').length;
        const team = redCount <= blueCount ? 'red' : 'blue';

        const playerInfo: PlayerInfo = {
          id: playerId,
          peerId,
          nickname: `Player ${playerId}`,
          team,
          number: playerId,
          isAdmin: false
        };

        this.players.set(playerId, playerInfo);
        this.onPlayerJoined?.(playerInfo);

        peer.sendReliable({
          type: 'ASSIGN_ID',
          playerId,
          players: Array.from(this.players.values()),
          teamsLocked: this.teamsLocked
        });

        this.broadcastReliable({
          type: 'PLAYER_LIST',
          players: Array.from(this.players.values()),
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

    if (msg.type === 'SET_PROFILE') {
      player.nickname = String(msg.nickname || player.nickname).slice(0, 16);
      player.number = Number(msg.number || player.number) % 100;
      this.broadcastReliable({
        type: 'PLAYER_LIST',
        players: Array.from(this.players.values()),
        teamsLocked: this.teamsLocked
      });
    } else if (msg.type === 'CHAT') {
      const text = String(msg.text || '').trim().slice(0, 140);
      if (text) {
        this.onChatMessage?.(player.nickname, text, player.team);
        this.broadcastReliable({
          type: 'CHAT',
          sender: player.nickname,
          text,
          team: player.team
        });
      }
    } else if (msg.type === 'TEAM_CHANGE') {
      const targetId = Number(msg.targetPlayerId ?? playerId);
      const targetTeam = msg.team as 'red' | 'blue' | 'spectator';
      if (
        canChangeTeam(peerId, targetId === playerId ? peerId : `player_${targetId}`, this.teamsLocked, player.isAdmin)
      ) {
        const targetPlayer = this.players.get(targetId);
        if (targetPlayer && (targetTeam === 'red' || targetTeam === 'blue' || targetTeam === 'spectator')) {
          targetPlayer.team = targetTeam;
          this.onTeamChangeRequest?.(targetId, targetTeam);
          this.broadcastReliable({
            type: 'PLAYER_LIST',
            players: Array.from(this.players.values()),
            teamsLocked: this.teamsLocked
          });
        }
      }
    }
  }

  public kickPlayer(targetPlayerId: number, ban: boolean = false): boolean {
    // Host admin immutability: Host (id === 1) cannot be kicked or banned
    if (targetPlayerId === 1) return false;
    const target = this.players.get(targetPlayerId);
    if (!target || target.isAdmin) return false;

    if (ban) {
      this.bannedPeerIds.add(target.peerId);
    }

    const peer = this.peers.get(target.peerId);
    if (peer) {
      peer.sendReliable({
        type: ban ? 'PLAYER_BANNED' : 'PLAYER_KICKED',
        reason: ban ? 'Banned by host' : 'Kicked by host'
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

    const playerId = this.peerToPlayerId.get(peerId);
    if (playerId !== undefined) {
      this.peerToPlayerId.delete(peerId);
      this.players.delete(playerId);
      this.onPlayerLeft?.(playerId);

      this.broadcastReliable({
        type: 'PLAYER_LIST',
        players: Array.from(this.players.values()),
        teamsLocked: this.teamsLocked
      });
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
      team
    });
  }

  public getPlayers(): PlayerInfo[] {
    return Array.from(this.players.values());
  }

  public destroy(): void {
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
  }
}
