import { BinaryProtocol, type GameStateSnapshot } from '@legacyx/core';
import { PeerConnection } from './PeerConnection';
import { SignalingClient } from './SignalingClient';
import { JitterBuffer } from './JitterBuffer';
import type { PlayerInfo } from './NetworkHost';

export class NetworkClient {
  private signaling: SignalingClient;
  private peer: PeerConnection | null = null;
  private hostPeerId: string = '';
  private iceServers: RTCIceServer[] = [];

  public localPlayerId: number | null = null;
  public players: PlayerInfo[] = [];
  public teamsLocked: boolean = false;
  public jitterBuffer = new JitterBuffer(33, 30, true);

  public onConnected?: (playerId: number) => void;
  public onDisconnected?: () => void;
  public onPlayerListUpdated?: (players: PlayerInfo[]) => void;
  public onChatMessage?: (sender: string, text: string, team?: string) => void;
  public onSnapshotBuffer?: (buffer: ArrayBuffer) => void;

  private nickname: string;
  private number: number;
  private reusableInputBuffer = new ArrayBuffer(8);

  constructor(signaling: SignalingClient, nickname: string, number: number = 7) {
    this.signaling = signaling;
    this.nickname = nickname;
    this.number = number;
    this.setupSignalingListeners();
  }

  private setupSignalingListeners(): void {
    this.signaling.on('WELCOME', (msg) => {
      if (msg.iceServers) {
        this.iceServers = msg.iceServers;
      }
    });

    this.signaling.on('JOIN_SUCCESS', async (msg) => {
      this.hostPeerId = msg.hostPeerId as string;
      await this.signaling.whenIceReady();
      this.initPeerConnection();
    });

    this.signaling.on('SIGNAL', async (msg) => {
      const fromPeerId = (msg.fromPeerId ?? msg.senderPeerId) as string;
      if (fromPeerId === this.hostPeerId && this.peer) {
        await this.peer.handleSignal(msg.data ?? msg);
      }
    });

    this.signaling.on('PEER_LEFT', (msg) => {
      if (msg.peerId === this.hostPeerId) {
        this.disconnect();
      }
    });
  }

  private initPeerConnection(): void {
    this.peer = new PeerConnection({
      peerId: this.hostPeerId,
      isInitiator: false,
      iceServers: this.iceServers.length > 0 ? this.iceServers : undefined,
      signalingClient: this.signaling,
      onSignal: (data) => {
        this.signaling.sendSignal(this.hostPeerId, data);
      },
      onReliableMessage: (msg: unknown) => {
        this.handleReliableMessage(msg as Record<string, unknown>);
      },
      onUnreliableSnapshot: (buffer: ArrayBuffer) => {
        const snapshot = BinaryProtocol.decodeSnapshot(buffer);
        this.jitterBuffer.push(snapshot, performance.now());
        this.onSnapshotBuffer?.(buffer);
      },
      onConnected: () => {
        this.peer?.sendReliable({
          type: 'SET_PROFILE',
          nickname: this.nickname,
          number: this.number
        });
      },
      onDisconnected: () => {
        this.onDisconnected?.();
      }
    });
  }

  private handleReliableMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'ASSIGN_ID') {
      this.localPlayerId = msg.playerId as number;
      this.players = (msg.players as PlayerInfo[]) || [];
      this.teamsLocked = Boolean(msg.teamsLocked);
      this.onPlayerListUpdated?.(this.players);
      this.onConnected?.(this.localPlayerId);
    } else if (msg.type === 'PLAYER_LIST') {
      this.players = (msg.players as PlayerInfo[]) || [];
      if (typeof msg.teamsLocked === 'boolean') {
        this.teamsLocked = msg.teamsLocked;
      }
      this.onPlayerListUpdated?.(this.players);
    } else if (msg.type === 'CHAT') {
      this.onChatMessage?.(
        String(msg.sender || 'Player'),
        String(msg.text || ''),
        msg.team as string | undefined
      );
    } else if (msg.type === 'MATCH_PAUSED') {
      this.jitterBuffer.setMatchState('PAUSED');
    } else if (msg.type === 'MATCH_RESUMED') {
      this.jitterBuffer.setMatchState('PLAYING');
    } else if (msg.type === 'PLAYER_KICKED' || msg.type === 'PLAYER_BANNED') {
      this.disconnect();
    }
  }

  public sendInput(inputMask: number, tick: number): void {
    if (!this.peer) return;
    const buffer = BinaryProtocol.encodeInput(
      {
        tick,
        inputMask,
        aimAngle: 0
      },
      this.reusableInputBuffer
    );
    this.peer.sendUnreliable(buffer);
  }

  public requestTeamChange(team: 'red' | 'blue' | 'spectator', targetPlayerId?: number): void {
    this.peer?.sendReliable({
      type: 'TEAM_CHANGE',
      team,
      targetPlayerId: targetPlayerId ?? this.localPlayerId
    });
  }

  public sendChat(text: string): void {
    this.peer?.sendReliable({
      type: 'CHAT',
      text
    });
  }

  public getInterpolatedState(): GameStateSnapshot | null {
    return this.jitterBuffer.getInterpolatedState(performance.now());
  }

  public disconnect(): void {
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
    this.localPlayerId = null;
    this.onDisconnected?.();
  }
}
