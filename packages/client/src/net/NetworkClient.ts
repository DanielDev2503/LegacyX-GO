import {
  BinaryProtocol,
  type PlayerInput,
  type GameStateSnapshot,
  OP_SNAPSHOT
} from '@legacyx/core';
import { PeerConnection } from './PeerConnection.js';
import { JitterBuffer } from './JitterBuffer.js';
import type { SignalingClient } from './SignalingClient.js';

export interface NetworkClientOptions {
  signalingClient: SignalingClient;
  interpolationDelayMs?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onSnapshotReceived?: (snapshot: GameStateSnapshot) => void;
}

export class NetworkClient {
  public readonly jitterBuffer: JitterBuffer;
  private signaling: SignalingClient;
  private peer: PeerConnection | null = null;
  private hostPeerId: string | null = null;
  private isConnectedToHost = false;

  public onConnected?: () => void;
  public onDisconnected?: () => void;
  public onSnapshotReceived?: (snapshot: GameStateSnapshot) => void;

  constructor(options: NetworkClientOptions) {
    this.signaling = options.signalingClient;
    this.jitterBuffer = new JitterBuffer(options.interpolationDelayMs ?? 33);
    this.onConnected = options.onConnected;
    this.onDisconnected = options.onDisconnected;
    this.onSnapshotReceived = options.onSnapshotReceived;

    this.setupSignaling();
  }

  private setupSignaling(): void {
    this.signaling.on('room_joined', ({ hostPeerId }: { hostPeerId: string }) => {
      this.hostPeerId = hostPeerId;
      console.log(`[NetworkClient] Sala unida. Esperando oferta WebRTC del Host ${hostPeerId}...`);

      this.peer = new PeerConnection({
        peerId: hostPeerId,
        isInitiator: false,
        iceServers: this.signaling.iceServers,
        onOpen: () => {
          console.log(`[NetworkClient] DataChannel conectado exitosamente con el Host!`);
          this.isConnectedToHost = true;
          this.onConnected?.();
        },
        onClose: () => {
          this.handleDisconnect();
        },
        onError: (err) => {
          console.warn(`[NetworkClient] Error en PeerConnection con Host:`, err);
        },
        onBinaryMessage: (data) => {
          this.handleIncomingHostData(data);
        },
        onSignalData: (signal) => {
          if (signal.candidate && this.hostPeerId) {
            this.signaling.sendSignal('SIGNAL_ICE_CANDIDATE', this.hostPeerId, signal);
          }
        }
      });
    });

    this.signaling.on('signal', async ({ type, fromId, data }) => {
      if (this.peer && fromId === this.hostPeerId) {
        if (type === 'SIGNAL_OFFER' && data.sdp) {
          const answer = await this.peer.handleOffer(data.sdp as RTCSessionDescriptionInit);
          this.signaling.sendSignal('SIGNAL_ANSWER', fromId, {
            sdp: { type: answer.type, sdp: answer.sdp }
          });
        } else if (type === 'SIGNAL_ICE_CANDIDATE' && data.candidate) {
          await this.peer.addIceCandidate(data.candidate as RTCIceCandidateInit);
        }
      }
    });

    this.signaling.on('peer_disconnect', ({ peerId }: { peerId: string }) => {
      if (peerId === this.hostPeerId) {
        console.warn('[NetworkClient] El anfitrión (Host) se ha desconectado de la sala.');
        this.handleDisconnect();
      }
    });
  }

  private handleIncomingHostData(data: ArrayBuffer): void {
    const view = new DataView(data);
    if (view.byteLength < 1) return;

    const opcode = view.getUint8(0);
    if (opcode === OP_SNAPSHOT) {
      // 1. Ingresar en el buffer de fluctuación (JitterBuffer)
      this.jitterBuffer.push(data);

      // 2. Notificar llegada de snapshot
      const decoded = BinaryProtocol.decodeSnapshot(data);
      if (decoded) {
        this.onSnapshotReceived?.(decoded);
      }
    }
  }

  public sendInput(input: PlayerInput): void {
    if (this.peer && this.peer.isOpen) {
      const buffer = BinaryProtocol.encodeInput(input);
      this.peer.send(buffer);
    }
  }

  public getInterpolatedSnapshot(renderTime?: number): GameStateSnapshot | null {
    return this.jitterBuffer.getInterpolatedSnapshot(renderTime);
  }

  public get isConnected(): boolean {
    return this.isConnectedToHost && (this.peer?.isOpen ?? false);
  }

  private handleDisconnect(): void {
    this.isConnectedToHost = false;
    this.jitterBuffer.clear();
    this.onDisconnected?.();
  }

  public disconnect(): void {
    this.handleDisconnect();
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
    this.hostPeerId = null;
  }
}
