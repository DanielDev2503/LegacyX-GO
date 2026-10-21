import { BinaryProtocol, type GameStateSnapshot } from '@legacyx/core';
import { PeerConnection } from './PeerConnection';
import { SignalingClient } from './SignalingClient';
import { JitterBuffer } from './JitterBuffer';
import type { PlayerInfo } from './NetworkHost';

export interface ClientProfileOptions {
  avatar?: string;
  avatarType?: string;
  kit?: any;
  localKit?: any;
  visitorKit?: any;
}

export class NetworkClient {
  private signaling: SignalingClient;
  private peer: PeerConnection | null = null;
  private hostPeerId: string = '';
  private iceServers: RTCIceServer[] = [];
  private profile: ClientProfileOptions;
  private helloSent: boolean = false;
  private isDisconnecting: boolean = false;

  private boundOnWelcome!: (msg: any) => void;
  private boundOnJoinSuccess!: (msg: any) => void;
  private boundOnSignal!: (msg: any) => void;
  private boundOnPeerLeft!: (msg: any) => void;
  private boundOnRoomClosed!: (msg: any) => void;

  public localPlayerId: number | null = null;
  public players: PlayerInfo[] = [];
  public teamsLocked: boolean = false;
  public jitterBuffer = new JitterBuffer(33, 30, true);
  public latestSnapshot: GameStateSnapshot | null = null;

  public onConnected?: (playerId: number) => void;
  public onDisconnected?: () => void;
  public onRoomClosed?: (reason?: string) => void;
  public onPlayerListUpdated?: (players: PlayerInfo[]) => void;
  public onRoomStateSync?: (msg: Record<string, unknown>) => void;
  public onChatMessage?: (sender: string, text: string, team?: string, isHost?: boolean) => void;
  public onEmote?: (playerId: number, emoji: string) => void;
  public onSnapshotBuffer?: (buffer: ArrayBuffer) => void;
  public onSnapshotDecoded?: (snapshot: GameStateSnapshot) => void;

  private nickname: string;
  private number: number;
  private reusableInputBuffer = new ArrayBuffer(8);

  constructor(
    signaling: SignalingClient,
    nickname: string,
    number: number = 7,
    profile: ClientProfileOptions = {}
  ) {
    this.signaling = signaling;
    this.nickname = nickname;
    this.number = number;
    this.profile = profile;
    this.setupSignalingListeners();
  }

  public async connectToHost(hostPeerId: string): Promise<void> {
    if (!hostPeerId) return;
    this.hostPeerId = hostPeerId;
    await this.signaling.whenIceReady();
    if (!this.peer && !this.isDisconnecting) {
      this.initPeerConnection();
    }
  }

  public updateProfile(nickname: string, profile: ClientProfileOptions = {}): void {
    this.nickname = nickname;
    this.profile = { ...this.profile, ...profile };
    this.sendClientHello();
  }

  private sendClientHello(): void {
    if (!this.peer) return;
    this.peer.sendReliable({
      type: 'CLIENT_HELLO',
      name: this.nickname,
      nickname: this.nickname,
      number: this.number,
      avatar: this.profile.avatar,
      avatarType: this.profile.avatarType,
      kit: this.profile.kit,
      localKit: this.profile.localKit,
      visitorKit: this.profile.visitorKit
    });
  }

  private setupSignalingListeners(): void {
    this.boundOnWelcome = (msg) => {
      if (msg.iceServers) {
        this.iceServers = msg.iceServers;
      }
    };

    this.boundOnJoinSuccess = async (msg) => {
      const hId = (msg.hostPeerId ?? msg.hostId) as string;
      if (hId) {
        await this.connectToHost(hId);
      }
    };

    this.boundOnSignal = async (msg) => {
      const fromPeerId = (msg.fromPeerId ?? msg.senderPeerId ?? msg.fromId) as string;
      if (!this.hostPeerId && fromPeerId) {
        this.hostPeerId = fromPeerId;
      }
      if (fromPeerId === this.hostPeerId) {
        if (!this.peer && !this.isDisconnecting) {
          this.initPeerConnection();
        }
        if (this.peer) {
          await this.peer.handleSignal(msg.data ?? msg);
        }
      }
    };

    this.boundOnPeerLeft = (msg) => {
      if (msg.peerId && msg.peerId === this.hostPeerId) {
        this.onRoomClosed?.('El anfitrión ha abandonado la sala.');
        this.disconnect();
      }
    };

    this.boundOnRoomClosed = (msg) => {
      this.onRoomClosed?.(String(msg?.reason || 'El anfitrión ha cerrado la sala.'));
      this.disconnect();
    };

    this.signaling.on('WELCOME', this.boundOnWelcome);
    this.signaling.on('JOIN_SUCCESS', this.boundOnJoinSuccess);
    this.signaling.on('SIGNAL', this.boundOnSignal);
    this.signaling.on('PEER_LEFT', this.boundOnPeerLeft);
    this.signaling.on('ROOM_CLOSED', this.boundOnRoomClosed);
  }

  private cleanupSignalingListeners(): void {
    this.signaling.off('WELCOME', this.boundOnWelcome);
    this.signaling.off('JOIN_SUCCESS', this.boundOnJoinSuccess);
    this.signaling.off('SIGNAL', this.boundOnSignal);
    this.signaling.off('PEER_LEFT', this.boundOnPeerLeft);
    this.signaling.off('ROOM_CLOSED', this.boundOnRoomClosed);
  }

  private initPeerConnection(): void {
    if (this.peer) return;
    this.helloSent = false;
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
        if (!snapshot) return;
        this.latestSnapshot = snapshot;
        this.jitterBuffer.push(snapshot, performance.now());
        this.onSnapshotDecoded?.(snapshot);
        this.onSnapshotBuffer?.(buffer);
      },
      onConnected: () => {
        if (!this.helloSent) {
          this.helloSent = true;
          this.sendClientHello();
        }
      },
      onDisconnected: () => {
        this.onDisconnected?.();
      }
    });
  }

  private handleReliableMessage(msg: Record<string, unknown>): void {
    if (
      msg.type === 'ROOM_STATE_SYNC' ||
      msg.type === 'INITIAL_STATE_PACKET' ||
      msg.type === 'ASSIGN_ID'
    ) {
      const assignedId = (msg.assignedPlayerId ?? msg.playerId) as number;
      if (typeof assignedId === 'number' && assignedId > 0) {
        this.localPlayerId = assignedId;
      }
      this.players = ((msg.playersList ?? msg.players) as PlayerInfo[]) || [];
      if (typeof msg.teamsLocked === 'boolean') {
        this.teamsLocked = msg.teamsLocked;
      }
      this.onRoomStateSync?.(msg);
      this.onPlayerListUpdated?.(this.players);
      if (this.localPlayerId !== null) {
        this.onConnected?.(this.localPlayerId);
      }
    } else if (msg.type === 'PLAYER_LIST') {
      this.players = ((msg.playersList ?? msg.players) as PlayerInfo[]) || [];
      if (typeof msg.teamsLocked === 'boolean') {
        this.teamsLocked = msg.teamsLocked;
      }
      this.onPlayerListUpdated?.(this.players);
    } else if (msg.type === 'CHAT') {
      this.onChatMessage?.(
        String(msg.sender || 'Player'),
        String(msg.text || ''),
        msg.team as string | undefined,
        Boolean(msg.isHost)
      );
    } else if (msg.type === 'EMOTE') {
      const pid = Number(msg.playerId ?? 0);
      const emoji = String(msg.emoji || '');
      if (pid > 0 && emoji) {
        this.onEmote?.(pid, emoji);
      }
    } else if (msg.type === 'MATCH_PAUSED') {
      this.jitterBuffer.setMatchState('PAUSED');
    } else if (msg.type === 'MATCH_RESUMED') {
      this.jitterBuffer.setMatchState('PLAYING');
    } else if (msg.type === 'ROOM_CLOSED') {
      this.onRoomClosed?.(String(msg.reason || 'El anfitrión ha cerrado la sala.'));
      this.disconnect();
    } else if (msg.type === 'PLAYER_KICKED' || msg.type === 'PLAYER_BANNED') {
      this.onRoomClosed?.(String(msg.reason || 'Has sido expulsado de la sala.'));
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

  public sendAdminAction(action: string, payload: Record<string, unknown> = {}): void {
    this.peer?.sendReliable({
      type: 'ADMIN_ACTION',
      action,
      ...payload
    });
  }

  public sendChat(text: string): void {
    this.peer?.sendReliable({
      type: 'CHAT',
      text
    });
  }

  public sendEmote(emoji: string): void {
    this.peer?.sendReliable({
      type: 'EMOTE',
      emoji
    });
  }

  public getInterpolatedState(): GameStateSnapshot | null {
    return this.jitterBuffer.getInterpolatedState(performance.now());
  }

  public disconnect(): void {
    this.isDisconnecting = true;
    this.cleanupSignalingListeners();
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
    this.localPlayerId = null;
    this.onDisconnected?.();
  }
}
