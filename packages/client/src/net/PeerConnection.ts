import { BinaryProtocol } from '@legacyx/core';

export type IceLinkState = 'new' | 'checking' | 'connected' | 'Completed' | 'disconnected' | 'failed' | 'closed';

export interface PeerConnectionConfig {
  iceServers?: RTCIceServer[];
  signalingClient?: {
    isOpen: () => boolean;
    reconnect: () => void;
  };
}

export interface PeerConnectionOptions {
  peerId: string;
  isInitiator?: boolean;
  iceServers?: RTCIceServer[];
  signalingClient?: {
    isOpen: () => boolean;
    reconnect: () => void;
  };
  onSignal?: (signalData: unknown) => void;
  onReliableMessage?: (msg: unknown) => void;
  onUnreliableSnapshot?: (buffer: ArrayBuffer) => void;
  onUnreliableInput?: (buffer: ArrayBuffer) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302'
];

let dynamicIceServers: RTCIceServer[] | null = null;

export function setDynamicIceServers(servers: RTCIceServer[] | null): void {
  dynamicIceServers = servers && servers.length > 0 ? servers : null;
}

export function parseIceUrls(rawValue: string | undefined, fallback: string[]): string[] {
  if (!rawValue || rawValue.trim() === '') return fallback;
  const parsed = rawValue
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export function readEnvTurnServers(env?: Record<string, string | undefined>): RTCIceServer[] {
  const e = env ?? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  const stunUrls = parseIceUrls(e.VITE_ICE_STUN_URLS, DEFAULT_STUN_SERVERS);
  return [{ urls: stunUrls }];
}

export function getIceServers(env?: Record<string, string | undefined>): RTCIceServer[] {
  if (dynamicIceServers && dynamicIceServers.length > 0) {
    return dynamicIceServers;
  }
  return readEnvTurnServers(env);
}

export class PeerConnection {
  public readonly peerId: string;
  public readonly remotePeerId: string;
  public pc: RTCPeerConnection;
  public dataChannel: RTCDataChannel | null = null;
  public reliableChannel: RTCDataChannel | null = null;
  public unreliableChannel: RTCDataChannel | null = null;
  public isInitiator: boolean;
  public linkState: IceLinkState = 'new';

  public onReliableMessage: ((data: string) => void) | null = null;
  public onUnreliableMessage: ((data: ArrayBuffer) => void) | null = null;
  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onLocalDescription: ((sdp: RTCSessionDescriptionInit) => void) | null = null;
  public onLocalCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;
  public onIceRestartOffer: ((offer: RTCSessionDescriptionInit) => void) | null = null;

  private pendingCandidates: RTCIceCandidateInit[] = [];
  private isSettingRemoteDescription: boolean = false;
  private iceRetryCount = 0;
  private readonly maxIceRetries = 3;
  private iceRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private isRecovering: boolean = false;
  private disconnectedGraceTimer: ReturnType<typeof setTimeout> | null = null;
  public hasEverConnected: boolean = false;
  private signalingClient?: { isOpen: () => boolean; reconnect: () => void };
  private isClosingIntentionally = false;
  private options: PeerConnectionOptions | null = null;

  public rttMs: number = 0;
  public candidateType: string = 'unknown';

  constructor(
    peerIdOrOptions: string | PeerConnectionOptions,
    isInitiatorParam: boolean = false,
    config: PeerConnectionConfig = {}
  ) {
    if (typeof peerIdOrOptions === 'string') {
      this.peerId = peerIdOrOptions;
      this.remotePeerId = peerIdOrOptions;
      this.isInitiator = isInitiatorParam;
      this.signalingClient = config.signalingClient;
    } else {
      this.options = peerIdOrOptions;
      this.peerId = peerIdOrOptions.peerId;
      this.remotePeerId = peerIdOrOptions.peerId;
      this.isInitiator = Boolean(peerIdOrOptions.isInitiator);
      this.signalingClient = peerIdOrOptions.signalingClient;
      if (peerIdOrOptions.onConnected) this.onConnected = peerIdOrOptions.onConnected;
      if (peerIdOrOptions.onDisconnected) this.onDisconnected = peerIdOrOptions.onDisconnected;
      if (peerIdOrOptions.onSignal) {
        this.onLocalCandidate = (cand) => peerIdOrOptions.onSignal?.({ candidate: cand });
      }
    }

    const explicitIce = typeof peerIdOrOptions === 'string' ? config.iceServers : peerIdOrOptions.iceServers;
    const iceServers = explicitIce ?? getIceServers();

    const hasMeteredTurn = iceServers.some((s) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some((u) => typeof u === 'string' && (u.includes('relay.metered.ca') || u.includes('.metered.live')));
    });

    if (hasMeteredTurn) {
      console.log('[WebRTC] Credenciales TURN activadas desde Metered.ca API.');
    }

    const pcConfig: RTCConfiguration = {
      iceServers,
      iceCandidatePoolSize: 4
    };
    try {
      this.pc = new RTCPeerConnection(pcConfig);
    } catch {
      this.pc = (RTCPeerConnection as unknown as (cfg: RTCConfiguration) => RTCPeerConnection)(pcConfig);
    }

    this.setupPeerEvents();

    if (this.isInitiator) {
      this.initChannels();
    }
  }

  private initChannels(): void {
    if (this.unreliableChannel || this.reliableChannel) return;
    // Unordered, no-retransmit UDP-like DataChannel for 60Hz snapshots & inputs
    const gameDc = this.pc.createDataChannel('game', {
      ordered: false,
      maxRetransmits: 0
    });
    this.setupUnreliableChannel(gameDc);

    // Reliable ordered channel for critical match state, chat, and lobby control
    const reliableDc = this.pc.createDataChannel('reliable', {
      ordered: true
    });
    this.setupReliableChannel(reliableDc);
  }

  private setupPeerEvents(): void {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const init = typeof event.candidate.toJSON === 'function' ? event.candidate.toJSON() : (event.candidate as RTCIceCandidateInit);
        if (this.onLocalCandidate) {
          this.onLocalCandidate(init);
        }
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        this.linkState = 'connected';
        this.iceRetryCount = 0;
        this.isRecovering = false;
        this.clearRestartTimer();
        this.clearDisconnectedGraceTimer();
        void this.auditIceConnection();
        if (this.areChannelsOpen() && this.onConnected) {
          this.onConnected();
        }
      } else if (state === 'disconnected') {
        this.linkState = 'disconnected';
        if (!this.isClosingIntentionally && this.hasEverConnected && !this.isRecovering && !this.disconnectedGraceTimer) {
          this.disconnectedGraceTimer = setTimeout(() => {
            this.disconnectedGraceTimer = null;
            if (
              !this.isClosingIntentionally &&
              (this.pc.iceConnectionState === 'disconnected' || this.pc.iceConnectionState === 'failed')
            ) {
              this.scheduleRecovery();
            }
          }, 2000);
        }
      } else if (state === 'failed') {
        this.linkState = 'failed';
        this.clearDisconnectedGraceTimer();
        if (!this.isClosingIntentionally && this.hasEverConnected) {
          this.scheduleRecovery();
        }
      } else if (state === 'closed') {
        this.linkState = 'closed';
        this.clearRestartTimer();
        this.clearDisconnectedGraceTimer();
        if (this.onDisconnected) this.onDisconnected();
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'connected') {
        this.linkState = 'connected';
        this.iceRetryCount = 0;
        this.isRecovering = false;
        this.clearRestartTimer();
        this.clearDisconnectedGraceTimer();
        if (this.areChannelsOpen() && this.onConnected) {
          this.onConnected();
        }
      } else if (state === 'failed') {
        this.linkState = 'failed';
        this.clearDisconnectedGraceTimer();
        if (!this.isClosingIntentionally && this.hasEverConnected) {
          this.scheduleRecovery();
        }
      } else if (state === 'closed') {
        this.linkState = 'closed';
        this.clearRestartTimer();
        this.clearDisconnectedGraceTimer();
        if (this.onDisconnected) this.onDisconnected();
      }
    };

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === 'reliable') {
        this.setupReliableChannel(channel);
      } else {
        this.setupUnreliableChannel(channel);
      }
    };
  }

  private clearRestartTimer(): void {
    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer);
      this.iceRestartTimer = null;
    }
  }

  private clearDisconnectedGraceTimer(): void {
    if (this.disconnectedGraceTimer) {
      clearTimeout(this.disconnectedGraceTimer);
      this.disconnectedGraceTimer = null;
    }
  }

  private scheduleRecovery(): void {
    if (this.isClosingIntentionally) return;
    if (!this.hasEverConnected) return;
    if (this.isRecovering) return;

    if (this.iceRetryCount >= this.maxIceRetries) {
      this.isRecovering = false;
      this.linkState = 'failed';
      if (this.onDisconnected) this.onDisconnected();
      return;
    }

    this.isRecovering = true;
    const delayMs = Math.min(2000 * Math.pow(2, this.iceRetryCount), 6000);
    this.iceRetryCount++;

    this.clearRestartTimer();
    this.iceRestartTimer = setTimeout(async () => {
      this.iceRestartTimer = null;
      if (this.isClosingIntentionally) {
        this.isRecovering = false;
        return;
      }

      if (
        this.pc.iceConnectionState === 'connected' ||
        this.pc.iceConnectionState === 'completed' ||
        this.pc.connectionState === 'connected'
      ) {
        this.isRecovering = false;
        this.iceRetryCount = 0;
        return;
      }

      if (this.signalingClient && !this.signalingClient.isOpen()) {
        this.signalingClient.reconnect();
      } else {
        await this.executeIceRestart();
      }

      this.iceRestartTimer = setTimeout(() => {
        this.iceRestartTimer = null;
        if (
          !this.isClosingIntentionally &&
          this.pc.iceConnectionState !== 'connected' &&
          this.pc.iceConnectionState !== 'completed' &&
          this.pc.connectionState !== 'connected'
        ) {
          this.isRecovering = false;
          this.scheduleRecovery();
        }
      }, 4000);
    }, delayMs);
  }

  public async executeIceRestart(): Promise<RTCSessionDescriptionInit | null> {
    if (this.isClosingIntentionally) return null;
    try {
      if (typeof this.pc.restartIce === 'function') {
        this.pc.restartIce();
      }
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      if (this.onIceRestartOffer) {
        this.onIceRestartOffer(offer);
      } else if (this.onLocalDescription) {
        this.onLocalDescription(offer);
      } else if (this.options?.onSignal) {
        this.options.onSignal(offer);
      }
      return offer;
    } catch {
      return null;
    }
  }

  public async auditIceConnection(): Promise<{ rttMs: number; candidateType: string }> {
    if (!this.pc || typeof this.pc.getStats !== 'function') {
      return { rttMs: this.rttMs, candidateType: this.candidateType };
    }
    try {
      const stats = await this.pc.getStats();
      let activeLocalCandidateId: string | null = null;
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          if (typeof report.currentRoundTripTime === 'number') {
            this.rttMs = Math.round(report.currentRoundTripTime * 1000);
          }
          activeLocalCandidateId = report.localCandidateId;
        }
      });

      if (activeLocalCandidateId) {
        stats.forEach((report) => {
          if (report.id === activeLocalCandidateId && report.type === 'local-candidate') {
            this.candidateType = report.candidateType || 'unknown';
          }
        });
      }
    } catch {
      // Ignore stats error in mock environments
    }
    return { rttMs: this.rttMs, candidateType: this.candidateType };
  }

  public async measureRtt(): Promise<number> {
    const res = await this.auditIceConnection();
    return res.rttMs;
  }

  public getRtt(): number {
    return this.rttMs;
  }

  private setupReliableChannel(channel: RTCDataChannel): void {
    this.reliableChannel = channel;
    channel.onopen = () => {
      this.hasEverConnected = true;
      this.linkState = 'connected';
      if (this.onConnected) this.onConnected();
    };
    channel.onclose = () => {
      if (this.isClosingIntentionally && this.onDisconnected) {
        this.onDisconnected();
      }
    };
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (this.onReliableMessage) this.onReliableMessage(event.data);
        if (this.options?.onReliableMessage) {
          try {
            this.options.onReliableMessage(JSON.parse(event.data));
          } catch {
            this.options.onReliableMessage(event.data);
          }
        }
      }
    };
  }

  private setupUnreliableChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer';
    this.unreliableChannel = channel;
    this.dataChannel = channel;

    channel.onopen = () => {
      this.linkState = 'connected';
      if (this.onConnected) this.onConnected();
    };

    channel.onclose = () => {
      if (this.isClosingIntentionally && this.onDisconnected) {
        this.onDisconnected();
      }
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (this.onReliableMessage) this.onReliableMessage(event.data);
        if (this.options?.onReliableMessage) {
          try {
            this.options.onReliableMessage(JSON.parse(event.data));
          } catch {
            this.options.onReliableMessage(event.data);
          }
        }
      } else if (event.data instanceof ArrayBuffer) {
        if (this.onUnreliableMessage) this.onUnreliableMessage(event.data);
        if (this.options?.onUnreliableSnapshot || this.options?.onUnreliableInput) {
          const type = BinaryProtocol.peekPacketType(event.data);
          if (type === BinaryProtocol.PKT_SNAPSHOT || event.data.byteLength >= 17) {
            this.options.onUnreliableSnapshot?.(event.data);
          } else {
            this.options.onUnreliableInput?.(event.data);
          }
        }
      }
    };
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.unreliableChannel && !this.reliableChannel && this.options) {
      this.initChannels();
    }
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    if (this.onLocalDescription) this.onLocalDescription(offer);
    if (this.options?.onSignal) this.options.onSignal(offer);
    return offer;
  }

  private createSessionDesc(desc: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
    if (typeof RTCSessionDescription === 'undefined') return desc;
    try {
      return new RTCSessionDescription(desc);
    } catch {
      return (RTCSessionDescription as unknown as (d: RTCSessionDescriptionInit) => RTCSessionDescriptionInit)(desc);
    }
  }

  private createIceCand(cand: RTCIceCandidateInit): RTCIceCandidateInit {
    if (typeof RTCIceCandidate === 'undefined') return cand;
    try {
      return new RTCIceCandidate(cand);
    } catch {
      return (RTCIceCandidate as unknown as (c: RTCIceCandidateInit) => RTCIceCandidateInit)(cand);
    }
  }

  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.isSettingRemoteDescription = true;
    try {
      await this.pc.setRemoteDescription(this.createSessionDesc(offer));
    } finally {
      this.isSettingRemoteDescription = false;
    }
    await this.flushPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    if (this.onLocalDescription) this.onLocalDescription(answer);
    if (this.options?.onSignal) this.options.onSignal(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (this.pc.signalingState === 'stable') return;
    this.isSettingRemoteDescription = true;
    try {
      await this.pc.setRemoteDescription(this.createSessionDesc(answer));
    } finally {
      this.isSettingRemoteDescription = false;
    }
    await this.flushPendingCandidates();
  }

  public async handleCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    return this.handleRemoteCandidate(candidate);
  }

  public async handleRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription || !this.pc.remoteDescription.type || this.isSettingRemoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(this.createIceCand(candidate));
    } catch {
      // Ignore benign late candidate errors
    }
  }

  public async handleSignal(signal: unknown): Promise<void> {
    const data = signal as {
      type?: RTCSdpType;
      sdp?: string;
      candidate?: RTCIceCandidateInit;
    };
    if (data.type === 'offer') {
      await this.handleOffer(data as RTCSessionDescriptionInit);
    } else if (data.type === 'answer') {
      await this.handleAnswer(data as RTCSessionDescriptionInit);
    } else if (data.candidate) {
      await this.handleRemoteCandidate(data.candidate);
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc.remoteDescription) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(this.createIceCand(candidate));
        } catch {
          // Ignore invalid candidate
        }
      }
    }
  }

  public getPendingCandidateCount(): number {
    return this.pendingCandidates.length;
  }

  public sendReliable(data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.reliableChannel && this.reliableChannel.readyState === 'open') {
      try {
        this.reliableChannel.send(payload);
        return;
      } catch {
        // Fallback to dataChannel if reliable fails
      }
    }
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(payload);
      } catch {
        // Ignore transient buffer overflow
      }
    }
  }

  public sendUnreliable(buffer: ArrayBuffer): void {
    const target = this.unreliableChannel || this.dataChannel;
    if (target && target.readyState === 'open') {
      try {
        if ((target.bufferedAmount ?? 0) <= 65536) {
          target.send(buffer);
        }
      } catch {
        // Ignore transient UDP-like drop
      }
    }
  }

  public areChannelsOpen(): boolean {
    const uOpen = Boolean(this.unreliableChannel && this.unreliableChannel.readyState === 'open');
    const rOpen = Boolean(this.reliableChannel && this.reliableChannel.readyState === 'open');
    const dOpen = Boolean(this.dataChannel && this.dataChannel.readyState === 'open');
    return (uOpen && rOpen) || dOpen;
  }

  public get currentRecoveryAttempts(): number {
    return this.iceRetryCount;
  }

  public get isRecoveryActive(): boolean {
    return this.isRecovering;
  }

  public close(): void {
    this.isClosingIntentionally = true;
    this.isRecovering = false;
    this.clearRestartTimer();
    this.clearDisconnectedGraceTimer();
    this.pendingCandidates = [];
    if (this.reliableChannel) {
      this.reliableChannel.close();
      this.reliableChannel = null;
    }
    if (this.unreliableChannel) {
      this.unreliableChannel.close();
      this.unreliableChannel = null;
    }
    this.dataChannel = null;
    this.pc.close();
    this.linkState = 'closed';
  }
}
