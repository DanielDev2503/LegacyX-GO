import {
  BinaryProtocol,
  type PlayerInput,
  type PhysicsModifiers,
  type GameConfig,
  type GameStateSnapshot,
  OP_INPUT
} from '@legacyx/core';
import { PeerConnection } from './PeerConnection.js';
import type { SignalingClient } from './SignalingClient.js';
import type { WorkerInMessage, WorkerOutMessage } from '../worker/physics.worker.js';

export interface NetworkHostOptions {
  signalingClient: SignalingClient;
  hostPlayerId?: number;
  worker?: Worker;
  onSnapshot?: (snapshot: GameStateSnapshot, raw: ArrayBuffer) => void;
  onGameEvent?: (event: string, payload: unknown) => void;
  onPeerConnected?: (peerId: string, playerId: number) => void;
  onPeerDisconnected?: (peerId: string, playerId: number) => void;
}

export class NetworkHost {
  public readonly hostPlayerId: number;
  private signaling: SignalingClient;
  private worker: Worker;
  private peers = new Map<string, PeerConnection>();
  private peerToPlayerId = new Map<string, number>();
  private nextPlayerId = 2; // El Host ocupa el slot 1

  public onSnapshot?: (snapshot: GameStateSnapshot, raw: ArrayBuffer) => void;
  public onGameEvent?: (event: string, payload: unknown) => void;
  public onPeerConnected?: (peerId: string, playerId: number) => void;
  public onPeerDisconnected?: (peerId: string, playerId: number) => void;

  constructor(options: NetworkHostOptions) {
    this.signaling = options.signalingClient;
    this.hostPlayerId = options.hostPlayerId ?? 1;
    this.onSnapshot = options.onSnapshot;
    this.onGameEvent = options.onGameEvent;
    this.onPeerConnected = options.onPeerConnected;
    this.onPeerDisconnected = options.onPeerDisconnected;

    this.worker = options.worker ?? new Worker(
      new URL('../worker/physics.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.setupWorker();
    this.setupSignaling();
  }

  private setupWorker(): void {
    this.worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'SNAPSHOT') {
        const rawBuffer = msg.snapshot;

        // 1. Decodificar para vista local
        const decoded = BinaryProtocol.decodeSnapshot(rawBuffer);
        if (decoded) {
          this.onSnapshot?.(decoded, rawBuffer);
        }

        // 2. Retransmitir inmediatamente por DataChannel no bloqueante a todos los clientes
        for (const peer of this.peers.values()) {
          if (peer.isOpen) {
            peer.send(rawBuffer);
          }
        }
      } else if (msg.type === 'EVENT') {
        this.onGameEvent?.(msg.event, msg.payload);
      }
    };
  }

  private setupSignaling(): void {
    this.signaling.on('peer_joined', async ({ peerId }: { peerId: string }) => {
      console.log(`[NetworkHost] Nuevo peer unido: ${peerId}. Iniciando handshake WebRTC...`);
      const playerId = this.nextPlayerId++;
      this.peerToPlayerId.set(peerId, playerId);

      const peerConn = new PeerConnection({
        peerId,
        isInitiator: true,
        iceServers: this.signaling.iceServers,
        onOpen: () => {
          console.log(`[NetworkHost] DataChannel abierto con peer ${peerId} (Player ${playerId})`);
          // Asignar jugador en el worker
          this.worker.postMessage({
            type: 'ADD_PLAYER',
            playerId,
            team: playerId % 2 === 0 ? 'blue' : 'red'
          } as WorkerInMessage);
          this.onPeerConnected?.(peerId, playerId);
        },
        onClose: () => {
          this.handlePeerDisconnect(peerId);
        },
        onError: (err) => {
          console.warn(`[NetworkHost] Error en PeerConnection con ${peerId}:`, err);
        },
        onBinaryMessage: (data) => {
          this.handleIncomingPeerData(peerId, data);
        },
        onSignalData: (signal) => {
          if (signal.candidate) {
            this.signaling.sendSignal('SIGNAL_ICE_CANDIDATE', peerId, signal);
          }
        }
      });

      this.peers.set(peerId, peerConn);

      const offer = await peerConn.createOffer();
      this.signaling.sendSignal('SIGNAL_OFFER', peerId, {
        sdp: { type: offer.type, sdp: offer.sdp }
      });
    });

    this.signaling.on('signal', async ({ type, fromId, data }) => {
      const peer = this.peers.get(fromId);
      if (!peer) return;

      if (type === 'SIGNAL_ANSWER' && data.sdp) {
        await peer.handleAnswer(data.sdp as RTCSessionDescriptionInit);
      } else if (type === 'SIGNAL_ICE_CANDIDATE' && data.candidate) {
        await peer.addIceCandidate(data.candidate as RTCIceCandidateInit);
      }
    });

    this.signaling.on('peer_disconnect', ({ peerId }: { peerId: string }) => {
      this.handlePeerDisconnect(peerId);
    });
  }

  private handleIncomingPeerData(peerId: string, data: ArrayBuffer): void {
    const view = new DataView(data);
    if (view.byteLength < 1) return;

    const opcode = view.getUint8(0);
    if (opcode === OP_INPUT) {
      const input = BinaryProtocol.decodeInput(view);
      const playerId = this.peerToPlayerId.get(peerId);
      if (input && playerId !== undefined) {
        this.worker.postMessage({
          type: 'PLAYER_INPUT',
          playerId,
          input
        } as WorkerInMessage);
      }
    }
  }

  private handlePeerDisconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    const playerId = this.peerToPlayerId.get(peerId);

    if (playerId !== undefined) {
      this.worker.postMessage({
        type: 'REMOVE_PLAYER',
        playerId
      } as WorkerInMessage);
      this.peerToPlayerId.delete(peerId);
      this.onPeerDisconnected?.(peerId, playerId);
    }

    if (peer) {
      this.peers.delete(peerId);
      peer.close();
    }
  }

  public sendLocalInput(input: PlayerInput | number): void {
    this.worker.postMessage({
      type: 'PLAYER_INPUT',
      playerId: this.hostPlayerId,
      input
    } as WorkerInMessage);
  }

  public startSimulation(stadiumId?: string, config?: Partial<GameConfig>): void {
    this.worker.postMessage({
      type: 'START_SIMULATION',
      stadiumId,
      config
    } as WorkerInMessage);

    // Añadir al host al equipo rojo
    this.worker.postMessage({
      type: 'ADD_PLAYER',
      playerId: this.hostPlayerId,
      team: 'red'
    } as WorkerInMessage);
  }

  public startMatch(): void {
    this.worker.postMessage({
      type: 'FSM_COMMAND',
      command: 'START_MATCH'
    } as WorkerInMessage);
  }

  public pauseMatch(): void {
    this.worker.postMessage({
      type: 'FSM_COMMAND',
      command: 'PAUSE_MATCH'
    } as WorkerInMessage);
  }

  public resumeMatch(): void {
    this.worker.postMessage({
      type: 'FSM_COMMAND',
      command: 'RESUME_MATCH'
    } as WorkerInMessage);
  }

  public resetKickoff(): void {
    this.worker.postMessage({
      type: 'FSM_COMMAND',
      command: 'RESET_KICKOFF'
    } as WorkerInMessage);
  }

  public applyModifiers(modifiers: Partial<PhysicsModifiers>): void {
    this.worker.postMessage({
      type: 'APPLY_MODIFIERS',
      modifiers
    } as WorkerInMessage);
  }

  public destroy(): void {
    this.worker.postMessage({ type: 'STOP_SIMULATION' } as WorkerInMessage);
    this.worker.terminate();

    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
    this.peerToPlayerId.clear();
  }
}
