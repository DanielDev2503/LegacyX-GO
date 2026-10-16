import type { IceServerConfig, SignalData } from '@legacyx/core';

export const GAME_CHANNEL_LABEL = 'legacyx-game';

export interface PeerConnectionOptions {
  peerId: string;
  isInitiator: boolean;
  iceServers?: IceServerConfig[];
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: unknown) => void;
  onBinaryMessage?: (data: ArrayBuffer) => void;
  onSignalData?: (signal: SignalData) => void;
}

export class PeerConnection {
  public readonly peerId: string;
  public readonly isInitiator: boolean;

  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private isRemoteDescriptionSet = false;
  private isClosed = false;

  public onOpen?: () => void;
  public onClose?: () => void;
  public onError?: (err: unknown) => void;
  public onBinaryMessage?: (data: ArrayBuffer) => void;
  public onSignalData?: (signal: SignalData) => void;

  constructor(options: PeerConnectionOptions) {
    this.peerId = options.peerId;
    this.isInitiator = options.isInitiator;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.onError = options.onError;
    this.onBinaryMessage = options.onBinaryMessage;
    this.onSignalData = options.onSignalData;

    const configuration: RTCConfiguration = {
      iceServers: options.iceServers ?? [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
      ]
    };

    this.pc = new RTCPeerConnection(configuration);

    this.setupPeerConnectionEvents();

    if (this.isInitiator) {
      // El Host/Iniciador abre el DataChannel de alto rendimiento para el juego
      this.initDataChannel(
        this.pc.createDataChannel(GAME_CHANNEL_LABEL, {
          ordered: false,
          maxRetransmits: 0
        })
      );
    } else {
      // El Invitado espera el DataChannel emitido por el host
      this.pc.ondatachannel = (event) => {
        if (event.channel.label === GAME_CHANNEL_LABEL) {
          this.initDataChannel(event.channel);
        }
      };
    }
  }

  private setupPeerConnectionEvents(): void {
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onSignalData) {
        this.onSignalData({
          candidate: event.candidate.toJSON()
        });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.handleDisconnect();
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'failed' || state === 'closed') {
        this.handleDisconnect();
      }
    };
  }

  private initDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.onOpen?.();
    };

    this.dataChannel.onclose = () => {
      this.handleDisconnect();
    };

    this.dataChannel.onerror = (err) => {
      this.onError?.(err);
    };

    this.dataChannel.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        this.onBinaryMessage?.(event.data);
      }
    };
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this.isRemoteDescriptionSet = true;
    await this.drainPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this.isRemoteDescriptionSet = true;
    await this.drainPendingCandidates();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.isRemoteDescriptionSet) {
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      this.onError?.(err);
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    while (this.pendingCandidates.length > 0) {
      const cand = this.pendingCandidates.shift()!;
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        this.onError?.(err);
      }
    }
  }

  public send(data: ArrayBuffer | Uint8Array): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(data as any);
      } catch (err) {
        this.onError?.(err);
      }
    }
  }

  public get isOpen(): boolean {
    return this.dataChannel?.readyState === 'open';
  }

  private handleDisconnect(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.onClose?.();
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    try {
      this.pc.close();
    } catch {}

    this.onClose?.();
  }
}
