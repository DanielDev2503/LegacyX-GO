import { BinaryProtocol, type GameStateSnapshot, type PlayerPosition } from '@legacyx/core';
import { PeerConnection, type IceRouteLabel } from './PeerConnection';
import { SignalingClient } from './SignalingClient';
import { JitterBuffer } from './JitterBuffer';
import type { PlayerInfo } from './NetworkHost';
import { gameUI } from '../ui/state/gameUI.svelte.js';

export interface ClientProfileOptions {
  userId?: string | null;
  isGuest?: boolean;
  elo?: number;
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
  private roomClosedNotified: boolean = false;

  private boundOnWelcome!: (msg: any) => void;
  private boundOnJoinSuccess!: (msg: any) => void;
  private boundOnSignal!: (msg: any) => void;
  private boundOnPeerLeft!: (msg: any) => void;
  private boundOnRoomClosed!: (msg: any) => void;
  private boundOnRoomClosedNotice!: (msg: any) => void;
  private boundOnHostDisconnect!: (msg: any) => void;
  private boundOnHostReconnecting!: (msg: any) => void;
  private boundOnHostReconnected!: (msg: any) => void;
  private boundOnModerationNotice!: (msg: any) => void;

  private signalQueue: Promise<void> = Promise.resolve();
  public initialHandshakeConfirmed: boolean = false;
  private handshakeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeAttempts: number = 0;
  private handshakeWaiters: Array<(ok: boolean) => void> = [];
  private static readonly HANDSHAKE_RETRY_MS = 5000;
  private static readonly MAX_HANDSHAKE_RETRIES = 3;

  public roomId: string = '';
  public roomName: string = '';
  public localPlayerId: number | null = null;
  public players: PlayerInfo[] = [];
  public teamsLocked: boolean = false;
  public jitterBuffer = new JitterBuffer(32, 30, true);
  public latestSnapshot: GameStateSnapshot | null = null;
  public activeGoalScorerId: number | null = null;
  public autoExtrapolationMs: number = 0;

  // Telemetría real WebRTC + Packet Loss Zero-GC (Fase 4)
  public packetLossPct: number = 0;
  public iceRoute: IceRouteLabel = 'Unknown';
  public webrtcRttMs: number = 0;
  private lossWindowExpected: number = 0;
  private lossWindowMissing: number = 0;
  private lastLossTrackTick: number = -1;
  private consecutiveStride2Count: number = 0;
  private nominalSnapshotStride: number = 1;

  private highestSnapshotTick: number = -1;
  private lastSnapshotPhase: number | null = null;
  private lastSyncedStadiumId: string | null = null;
  private lastSyncedConfigSig: string = '';
  private rttSamples: number[] = [];
  private pingWarmupTimers: ReturnType<typeof setTimeout>[] = [];

  public onConnected?: (playerId: number) => void;
  public onDisconnected?: () => void;
  public onRoomClosed?: (
    reason?: 'kicked' | 'banned' | 'closed',
    message?: string,
    roomName?: string
  ) => void;
  public onPlayerListUpdated?: (players: PlayerInfo[]) => void;
  public onRoomStateSync?: (msg: Record<string, unknown>) => void;
  public onGoalScorerIdChanged?: (id: number | null) => void;
  public onChatMessage?: (sender: string, text: string, team?: string, isHost?: boolean, id?: string) => void;
  public onEmote?: (playerId: number, emoji: string) => void;
  public onGameFx?: (fx: string, intensity?: number, countdownValue?: number) => void;
  public onMatchBanner?: (banner: Record<string, unknown>) => void;
  public onScoreEvent?: (payload: Record<string, unknown>) => void;
  public onSnapshotBuffer?: (buffer: ArrayBuffer) => void;
  public onSnapshotDecoded?: (snapshot: GameStateSnapshot) => void;

  private nickname: string;
  private number: number;
  // Ring buffer Zero-GC de los últimos 3 inputs sin confirmar para redundancia 3x (OP_INPUT_BUNDLE)
  private readonly inputHistory: Array<{
    sequence: number;
    tick: number;
    inputMask: number;
    aimAngle: number | null;
    aimThrottle: number;
  }> = [
    { sequence: 0, tick: 0, inputMask: 0, aimAngle: null, aimThrottle: 0 },
    { sequence: 0, tick: 0, inputMask: 0, aimAngle: null, aimThrottle: 0 },
    { sequence: 0, tick: 0, inputMask: 0, aimAngle: null, aimThrottle: 0 }
  ];
  private inputHistoryCount: number = 0;
  private readonly reusableBundleBuffers: [ArrayBuffer, ArrayBuffer, ArrayBuffer] = [
    new ArrayBuffer(BinaryProtocol.INPUT_BUNDLE_HEADER_SIZE + BinaryProtocol.INPUT_BUNDLE_ENTRY_SIZE),
    new ArrayBuffer(BinaryProtocol.INPUT_BUNDLE_HEADER_SIZE + BinaryProtocol.INPUT_BUNDLE_ENTRY_SIZE * 2),
    new ArrayBuffer(BinaryProtocol.INPUT_BUNDLE_HEADER_SIZE + BinaryProtocol.INPUT_BUNDLE_ENTRY_SIZE * 3)
  ];
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;

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

  public waitForInitialHandshake(timeoutMs: number = 15_000): Promise<boolean> {
    if (this.initialHandshakeConfirmed && this.localPlayerId !== null) {
      return Promise.resolve(true);
    }
    if (this.isDisconnecting || this.roomClosedNotified) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        const idx = this.handshakeWaiters.indexOf(done);
        if (idx !== -1) this.handshakeWaiters.splice(idx, 1);
        done(false);
      }, Math.max(1000, timeoutMs));
      this.handshakeWaiters.push(done);
    });
  }

  private resolveHandshakeWaiters(ok: boolean): void {
    this.clearHandshakeRetryTimer();
    const waiters = this.handshakeWaiters.splice(0);
    for (let i = 0; i < waiters.length; i++) {
      waiters[i]!(ok);
    }
  }

  private clearHandshakeRetryTimer(): void {
    if (this.handshakeRetryTimer) {
      clearTimeout(this.handshakeRetryTimer);
      this.handshakeRetryTimer = null;
    }
  }

  private startAtomicHandshake(): void {
    if (this.initialHandshakeConfirmed || this.isDisconnecting || !this.peer) return;
    if (!this.peer.areChannelsOpen()) return;
    this.helloSent = true;
    this.handshakeAttempts = 1;
    this.sendClientHello();
    this.scheduleHandshakeRetry();
  }

  private scheduleHandshakeRetry(): void {
    this.clearHandshakeRetryTimer();
    if (this.initialHandshakeConfirmed || this.isDisconnecting) return;
    this.handshakeRetryTimer = setTimeout(() => {
      this.handshakeRetryTimer = null;
      if (this.initialHandshakeConfirmed || this.isDisconnecting || !this.peer) return;
      if (this.handshakeAttempts >= NetworkClient.MAX_HANDSHAKE_RETRIES) {
        this.resolveHandshakeWaiters(false);
        return;
      }
      this.handshakeAttempts++;
      if (!this.peer.areChannelsOpen()) {
        void this.peer.executeIceRestart();
      } else {
        this.sendClientHello();
      }
      this.scheduleHandshakeRetry();
    }, NetworkClient.HANDSHAKE_RETRY_MS);
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
      userId: this.profile.userId ?? null,
      isGuest: this.profile.isGuest ?? true,
      elo: this.profile.elo,
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
      if (typeof msg.roomId === 'string' && msg.roomId) {
        this.roomId = msg.roomId;
      }
      if (typeof msg.roomName === 'string' && msg.roomName) {
        this.roomName = msg.roomName;
      }
      const hId = (msg.hostPeerId ?? msg.hostId) as string;
      if (hId) {
        await this.connectToHost(hId);
      }
    };

    this.boundOnSignal = (msg) => {
      const fromPeerId = (msg.fromPeerId ?? msg.senderPeerId ?? msg.fromId) as string;
      if (!this.hostPeerId && fromPeerId) {
        this.hostPeerId = fromPeerId;
      }
      if (fromPeerId !== this.hostPeerId) return;
      // Garantiza orden estricto y espera iceConfigReady ANTES de instanciar RTCPeerConnection
      this.signalQueue = this.signalQueue
        .then(async () => {
          if (this.isDisconnecting) return;
          if (!this.peer) {
            await this.signaling.whenIceReady();
            if (this.isDisconnecting) return;
            if (!this.peer) {
              this.initPeerConnection();
            }
          }
          if (this.peer) {
            await this.peer.handleSignal(msg.data ?? msg);
          }
        })
        .catch(() => {
          // Ignore stale signal error during teardown
        });
    };

    this.boundOnPeerLeft = (msg) => {
      if (msg.peerId && msg.peerId === this.hostPeerId) {
        this.notifyRoomClosed(
          'closed',
          'El anfitrión ha abandonado la sala.',
          typeof msg.roomName === 'string' ? msg.roomName : undefined
        );
      }
    };

    this.boundOnRoomClosed = (msg) => {
      if (msg?.roomId && this.roomId && msg.roomId !== this.roomId) return;
      this.notifyRoomClosed(
        'closed',
        String(msg?.reason || msg?.message || 'El anfitrión ha cerrado la sala.'),
        typeof msg?.roomName === 'string' ? msg.roomName : undefined
      );
    };

    this.boundOnRoomClosedNotice = (msg) => {
      if (msg?.roomId && this.roomId && msg.roomId !== this.roomId) return;
      this.notifyRoomClosed(
        'closed',
        String(msg?.message || msg?.reason || 'La sala ha sido cerrada por el anfitrión.'),
        typeof msg?.roomName === 'string' ? msg.roomName : undefined
      );
    };

    this.boundOnHostDisconnect = (msg) => {
      if (msg?.roomId && this.roomId && msg.roomId !== this.roomId) return;
      this.notifyRoomClosed(
        'closed',
        'El anfitrión ha cerrado la sala o se ha desconectado.',
        typeof msg?.roomName === 'string' ? msg.roomName : undefined
      );
    };

    this.boundOnModerationNotice = (msg) => {
      if (msg?.roomId && this.roomId && msg.roomId !== this.roomId) return;
      const reason = msg?.kind === 'banned' ? 'banned' : 'kicked';
      const defaultMsg =
        reason === 'banned'
          ? 'Has sido baneado de la sala por el anfitrión.'
          : 'Has sido expulsado de la sala por el anfitrión.';
      this.notifyRoomClosed(
        reason,
        typeof msg?.reason === 'string' && msg.reason.trim() ? msg.reason : defaultMsg,
        typeof msg?.roomName === 'string' ? msg.roomName : undefined
      );
    };

    this.boundOnHostReconnecting = (msg) => {
      if (msg?.roomId && this.roomId && msg.roomId !== this.roomId) return;
      // Mantener el enlace P2P vivo durante la ventana de gracia del Host
    };

    this.boundOnHostReconnected = (msg) => {
      if (msg?.roomId && this.roomId && msg.roomId !== this.roomId) return;
      if (typeof msg?.hostPeerId === 'string' && msg.hostPeerId) {
        this.hostPeerId = msg.hostPeerId;
      }
    };

    this.signaling.on('WELCOME', this.boundOnWelcome);
    this.signaling.on('JOIN_SUCCESS', this.boundOnJoinSuccess);
    this.signaling.on('SIGNAL', this.boundOnSignal);
    this.signaling.on('PEER_LEFT', this.boundOnPeerLeft);
    this.signaling.on('ROOM_CLOSED', this.boundOnRoomClosed);
    this.signaling.on('room_closed', this.boundOnRoomClosed);
    this.signaling.on('ROOM_CLOSED_NOTICE', this.boundOnRoomClosedNotice);
    this.signaling.on('HOST_DISCONNECT', this.boundOnHostDisconnect);
    this.signaling.on('HOST_RECONNECTING', this.boundOnHostReconnecting);
    this.signaling.on('HOST_RECONNECTED', this.boundOnHostReconnected);
    this.signaling.on('ROOM_MODERATION_NOTICE', this.boundOnModerationNotice);
  }

  private cleanupSignalingListeners(): void {
    this.signaling.off('WELCOME', this.boundOnWelcome);
    this.signaling.off('JOIN_SUCCESS', this.boundOnJoinSuccess);
    this.signaling.off('SIGNAL', this.boundOnSignal);
    this.signaling.off('PEER_LEFT', this.boundOnPeerLeft);
    this.signaling.off('ROOM_CLOSED', this.boundOnRoomClosed);
    this.signaling.off('room_closed', this.boundOnRoomClosed);
    this.signaling.off('ROOM_CLOSED_NOTICE', this.boundOnRoomClosedNotice);
    this.signaling.off('HOST_DISCONNECT', this.boundOnHostDisconnect);
    this.signaling.off('HOST_RECONNECTING', this.boundOnHostReconnecting);
    this.signaling.off('HOST_RECONNECTED', this.boundOnHostReconnected);
    this.signaling.off('ROOM_MODERATION_NOTICE', this.boundOnModerationNotice);
  }

  private notifyRoomClosed(
    reason: 'kicked' | 'banned' | 'closed',
    message?: string,
    roomName?: string
  ): void {
    if (this.roomClosedNotified) return;
    this.roomClosedNotified = true;
    this.onRoomClosed?.(reason, message, roomName ?? (this.roomName || undefined));
    this.disconnect();
  }

  private initPeerConnection(): void {
    if (this.peer) return;
    this.helloSent = false;
    this.inputHistoryCount = 0;
    this.highestSnapshotTick = -1;
    this.lastSnapshotPhase = null;
    this.lastLossTrackTick = -1;
    this.lossWindowExpected = 0;
    this.lossWindowMissing = 0;
    this.packetLossPct = 0;
    this.iceRoute = 'Unknown';
    this.webrtcRttMs = 0;
    this.consecutiveStride2Count = 0;
    this.nominalSnapshotStride = 1;
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
        this.jitterBuffer.push(snapshot, performance.now());

        const phaseChangedToSpecial =
          snapshot.phase !== this.lastSnapshotPhase &&
          (snapshot.phase === 0 || snapshot.phase === 3.5);
        const isTickReset =
          this.highestSnapshotTick >= 0 && snapshot.tick + 100 < this.highestSnapshotTick;
        const isMonotonic =
          this.highestSnapshotTick < 0 ||
          snapshot.tick >= this.highestSnapshotTick ||
          phaseChangedToSpecial ||
          isTickReset;

        if (!isMonotonic) return;

        // Medición real de pérdida de paquetes UDP por saltos de secuencia de snapshots (Zero-GC)
        if (this.lastLossTrackTick >= 0 && snapshot.tick > this.lastLossTrackTick) {
          const deltaTicks = snapshot.tick - this.lastLossTrackTick;
          if (deltaTicks < 120) {
            if (deltaTicks === 2) {
              this.consecutiveStride2Count = Math.min(10, this.consecutiveStride2Count + 1);
              if (this.consecutiveStride2Count >= 4) {
                this.nominalSnapshotStride = 2;
              }
            } else if (deltaTicks === 1) {
              this.consecutiveStride2Count = 0;
              this.nominalSnapshotStride = 1;
            }
            const stride = this.nominalSnapshotStride;
            const expectedPackets = Math.max(1, Math.round(deltaTicks / stride));
            const missingPackets = Math.max(0, expectedPackets - 1);
            this.lossWindowExpected += expectedPackets;
            this.lossWindowMissing += missingPackets;
            if (this.lossWindowExpected >= 30) {
              const rawPct = (this.lossWindowMissing / this.lossWindowExpected) * 100;
              this.packetLossPct = Math.round(Math.min(100, rawPct) * 10) / 10;
              // Decaimiento suave de ventana para reaccionar rápido a cambios de red
              this.lossWindowExpected = Math.floor(this.lossWindowExpected * 0.5);
              this.lossWindowMissing = Math.floor(this.lossWindowMissing * 0.5);
            }
          }
        }
        this.lastLossTrackTick = snapshot.tick;

        this.highestSnapshotTick = snapshot.tick;
        this.lastSnapshotPhase = snapshot.phase;
        this.latestSnapshot = snapshot;
        if (snapshot.phase === 3.5) {
          this.jitterBuffer.setMatchState(3.5);
        } else if (snapshot.phase === 0 || snapshot.phase === 1) {
          this.updateActiveGoalScorerId(null);
        }
        this.onSnapshotDecoded?.(snapshot);
        this.onSnapshotBuffer?.(buffer);
      },
      onUnreliableOpen: () => {
        this.sendPingProbe();
      },
      onConnected: () => {
        if (!this.helloSent) {
          this.startAtomicHandshake();
        }
        this.startPingProbe();
      },
      onDisconnected: () => {
        if (
          !this.isDisconnecting &&
          !this.roomClosedNotified &&
          (this.localPlayerId !== null || Boolean(this.hostPeerId))
        ) {
          this.notifyRoomClosed(
            'closed',
            'Se ha perdido la conexión con el anfitrión o la sala ha sido cerrada.'
          );
          return;
        }
        this.onDisconnected?.();
      }
    });
    this.peer.onStatsUpdated = (stats) => {
      this.webrtcRttMs = stats.rttMs;
      this.iceRoute = stats.iceRoute;
      if (stats.rttMs > 0 && this.rttSamples.length === 0) {
        gameUI.recordTelemetrySample(stats.rttMs, gameUI.fps);
      }
    };
  }

  private updateActiveGoalScorerId(nextId: number | null): void {
    const normalized = typeof nextId === 'number' && Number.isFinite(nextId) ? nextId : null;
    if (this.activeGoalScorerId !== normalized) {
      this.activeGoalScorerId = normalized;
      this.onGoalScorerIdChanged?.(normalized);
    }
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
      if (typeof msg.allowCaptainKitSwitch === 'boolean') {
        gameUI.allowCaptainKitSwitch = msg.allowCaptainKitSwitch;
      }
      if (
        typeof msg.stadiumId === 'string' &&
        msg.stadiumId &&
        msg.stadiumId !== this.lastSyncedStadiumId &&
        gameUI.onStadiumChanged
      ) {
        this.lastSyncedStadiumId = msg.stadiumId;
        gameUI.onStadiumChanged(msg.stadiumId);
      }
      if (msg.redKitVariant === 'home' || msg.redKitVariant === 'away') {
        gameUI.redKitVariant = msg.redKitVariant;
      }
      if (msg.blueKitVariant === 'home' || msg.blueKitVariant === 'away') {
        gameUI.blueKitVariant = msg.blueKitVariant;
      }
      if (msg.gameplayConfig || msg.modifiers) {
        let configSig = '';
        try {
          configSig = JSON.stringify([msg.gameplayConfig ?? null, msg.modifiers ?? null]);
        } catch {
          configSig = String(Date.now());
        }
        if (configSig !== this.lastSyncedConfigSig) {
          this.lastSyncedConfigSig = configSig;
          gameUI.applyRemoteGameplayConfig(msg.gameplayConfig as any, msg.modifiers as any);
        }
      }

      // Gestionar transición de fase sin cerrar el menú en bucle durante el partido
      if (typeof msg.matchPhase === 'number') {
        this.jitterBuffer.setMatchState(msg.matchPhase);
        gameUI.handleMatchPhaseTransition(msg.matchPhase, msg.type === 'INITIAL_STATE_PACKET');
        if (msg.matchPhase === 0 || msg.matchPhase === 1) {
          this.updateActiveGoalScorerId(null);
        } else if ('lastGoalScorerId' in msg || 'scorerPlayerId' in msg) {
          const rawScorer = msg.lastGoalScorerId ?? msg.scorerPlayerId;
          this.updateActiveGoalScorerId(typeof rawScorer === 'number' ? rawScorer : null);
        }
      } else if ('lastGoalScorerId' in msg || 'scorerPlayerId' in msg) {
        const rawScorer = msg.lastGoalScorerId ?? msg.scorerPlayerId;
        this.updateActiveGoalScorerId(typeof rawScorer === 'number' ? rawScorer : null);
      }
      if (msg.activeBanner && typeof msg.activeBanner === 'object') {
        this.onMatchBanner?.(msg.activeBanner as Record<string, unknown>);
      }

      this.onRoomStateSync?.(msg);
      this.onPlayerListUpdated?.(this.players);
      if (this.localPlayerId !== null) {
        if (!this.initialHandshakeConfirmed) {
          this.initialHandshakeConfirmed = true;
          this.resolveHandshakeWaiters(true);
        }
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
        Boolean(msg.isHost),
        typeof msg.id === 'string' || typeof msg.id === 'number' ? String(msg.id) : undefined
      );
    } else if (msg.type === 'PONG_PROBE') {
      const now = performance.now();
      const sentTime = Number(msg.t || 0);
      if (sentTime > 0) {
        const rtt = Math.max(1, Math.round(now - sentTime));
        this.rttSamples.push(rtt);
        if (this.rttSamples.length > 5) {
          this.rttSamples.shift();
        }
        let targetPing = rtt;
        if (this.rttSamples.length >= 2) {
          const sorted = this.rttSamples.slice().sort((a, b) => a - b);
          targetPing = sorted[Math.floor(sorted.length / 2)]!;
        }
        gameUI.recordTelemetrySample(targetPing, gameUI.fps);
        if (typeof (gameUI as any).effectiveExtrapolationMs === 'number') {
          this.setAutoExtrapolationMs((gameUI as any).effectiveExtrapolationMs);
        }
      }
    } else if (msg.type === 'MATCH_STATS_SUMMARY') {
      if (msg.snapshot) {
        gameUI.lastMatchStats = msg.snapshot as any;
      } else if (Array.isArray(msg.stats)) {
        gameUI.lastMatchStats = msg.stats as any;
      }
      if (msg.snapshot || Array.isArray(msg.stats)) {
        gameUI.hasCompletedMatch = true;
        gameUI.activeSlide = 'STATS';
        gameUI.fsmPhase = 'STOPPED';
        gameUI.matchPhase = 0;
        gameUI.previousMatchPhase = 0;
        if (msg.mvp) {
          gameUI.mvp = msg.mvp as any;
        }
        if (Array.isArray(msg.redTeamStats)) {
          gameUI.redTeamStats = msg.redTeamStats;
        }
        if (Array.isArray(msg.blueTeamStats)) {
          gameUI.blueTeamStats = msg.blueTeamStats;
        }
        if (!gameUI.isSecondaryOverlayOpen) {
          gameUI.clearModalStack();
          gameUI.activeModal = 'TEAM_SELECT';
        }
      }
    } else if (msg.type === 'EMOTE') {
      const pid = Number(msg.playerId ?? 0);
      const emoji = String(msg.emoji || '');
      if (pid > 0 && emoji) {
        this.onEmote?.(pid, emoji);
      }
    } else if (msg.type === 'GAME_FX_EVENT') {
      const fx = String(msg.fx || '');
      if (fx) {
        this.onGameFx?.(
          fx,
          typeof msg.intensity === 'number' ? msg.intensity : undefined,
          typeof msg.countdownValue === 'number' ? msg.countdownValue : undefined
        );
      }
    } else if (msg.type === 'MATCH_BANNER_EVENT') {
      const bannerObj =
        msg.banner && typeof msg.banner === 'object'
          ? (msg.banner as Record<string, unknown>)
          : null;
      const rawScorer =
        msg.lastGoalScorerId ??
        msg.scorerPlayerId ??
        bannerObj?.lastGoalScorerId ??
        bannerObj?.scorerPlayerId;
      if (bannerObj?.kind === 'NONE') {
        this.updateActiveGoalScorerId(null);
      } else if (rawScorer !== undefined) {
        this.updateActiveGoalScorerId(typeof rawScorer === 'number' ? rawScorer : null);
      }
      if (bannerObj) {
        this.onMatchBanner?.(bannerObj);
      }
    } else if (msg.type === 'SCORE_EVENT') {
      this.onScoreEvent?.(msg);
    } else if (msg.type === 'MATCH_PAUSED') {
      this.jitterBuffer.setMatchState('PAUSED');
    } else if (msg.type === 'MATCH_RESUMED') {
      this.jitterBuffer.setMatchState('PLAYING');
    } else if (msg.type === 'ROOM_CLOSED') {
      this.notifyRoomClosed(
        'closed',
        String(msg.reason || 'El anfitrión ha cerrado la sala.'),
        typeof msg.roomName === 'string' ? msg.roomName : undefined
      );
    } else if (msg.type === 'PLAYER_KICKED' || msg.type === 'PLAYER_BANNED') {
      const reason = msg.type === 'PLAYER_BANNED' ? 'banned' : 'kicked';
      const defaultMsg =
        reason === 'banned'
          ? 'Has sido baneado de la sala por el anfitrión.'
          : 'Has sido expulsado de la sala por el anfitrión.';
      this.notifyRoomClosed(
        reason,
        String(msg.reason || defaultMsg),
        typeof msg.roomName === 'string' ? msg.roomName : undefined
      );
    }
  }

  public sendInput(
    inputMask: number,
    tick: number,
    aimAngle?: number | null,
    aimThrottle: number = 1
  ): void {
    if (!this.peer) return;
    const seq = tick >>> 0;
    const normalizedAngle = aimAngle ?? null;
    const normalizedThrottle = aimAngle !== null && aimAngle !== undefined ? aimThrottle : 0;

    if (this.inputHistoryCount > 0 && this.inputHistory[0]!.sequence === seq) {
      // Mismo seq (p. ej. despacho inmediato por flanco ascendente + tick 60 Hz): fusionar bits críticos sin alocar
      this.inputHistory[0]!.inputMask |= inputMask;
      this.inputHistory[0]!.aimAngle = normalizedAngle;
      this.inputHistory[0]!.aimThrottle = normalizedThrottle;
    } else {
      // Desplazar [1] -> [2], [0] -> [1] in-place (Zero-GC)
      const h2 = this.inputHistory[2]!;
      const h1 = this.inputHistory[1]!;
      const h0 = this.inputHistory[0]!;
      h2.sequence = h1.sequence;
      h2.tick = h1.tick;
      h2.inputMask = h1.inputMask;
      h2.aimAngle = h1.aimAngle;
      h2.aimThrottle = h1.aimThrottle;

      h1.sequence = h0.sequence;
      h1.tick = h0.tick;
      h1.inputMask = h0.inputMask;
      h1.aimAngle = h0.aimAngle;
      h1.aimThrottle = h0.aimThrottle;

      h0.sequence = seq;
      h0.tick = seq;
      h0.inputMask = inputMask;
      h0.aimAngle = normalizedAngle;
      h0.aimThrottle = normalizedThrottle;

      if (this.inputHistoryCount < 3) {
        this.inputHistoryCount++;
      }
    }

    const count = this.inputHistoryCount;
    const buffer = BinaryProtocol.encodeInputBundle(
      this.inputHistory,
      count,
      this.reusableBundleBuffers[count - 1]
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

  public requestPositionChange(targetPlayerId: number, position: PlayerPosition): void {
    this.peer?.sendReliable({
      type: 'POSITION_CHANGE',
      targetPlayerId,
      position
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

  public sendProfileUpdate(profile: {
    nickname?: string;
    userId?: string | null;
    isGuest?: boolean;
    elo?: number;
    avatar?: string;
    avatarType?: string;
    kit?: any;
    localKit?: any;
    visitorKit?: any;
  }): void {
    this.profile = { ...this.profile, ...profile };
    this.peer?.sendReliable({
      type: 'UPDATE_PLAYER_PROFILE',
      playerId: this.localPlayerId,
      ...profile
    });
  }

  public sendEmote(emoji: string): void {
    this.peer?.sendReliable({
      type: 'EMOTE',
      emoji
    });
  }

  public sendKitVariantChange(team: 'red' | 'blue', variant: 'home' | 'away'): void {
    this.peer?.sendReliable({
      type: 'KIT_VARIANT_CHANGE',
      team,
      variant
    });
  }

  public sendSkipGoalReplay(): void {
    this.peer?.sendReliable({
      type: 'SKIP_GOAL_REPLAY'
    });
  }

  private hasConfiguredExtrap: boolean = false;

  public setAutoExtrapolationMs(ms: number): void {
    const clamped = Number.isFinite(ms) ? Math.max(0, Math.min(250, Math.round(ms))) : 0;
    if (this.hasConfiguredExtrap && clamped === this.autoExtrapolationMs) {
      return;
    }
    this.hasConfiguredExtrap = true;
    this.autoExtrapolationMs = clamped;
    const jb = this.jitterBuffer as unknown as {
      autoExtrapolationMs?: number;
      setAutoExtrapolationMs?: (val: number) => void;
      interpolationDelayMs: number;
    };
    if (typeof jb.setAutoExtrapolationMs === 'function') {
      jb.setAutoExtrapolationMs(clamped);
    } else {
      jb.autoExtrapolationMs = clamped;
    }
    const targetDelay = Math.max(28, Math.min(100, 28 + clamped * 0.25));
    jb.interpolationDelayMs = jb.interpolationDelayMs * 0.8 + targetDelay * 0.2;
  }

  public getInterpolatedState(nowMs: number = performance.now()): GameStateSnapshot | null {
    const interp = this.jitterBuffer.getInterpolatedState(nowMs);
    if (interp && this.latestSnapshot) {
      if (interp.isGoldenGoal === undefined && this.latestSnapshot.isGoldenGoal !== undefined) {
        interp.isGoldenGoal = this.latestSnapshot.isGoldenGoal;
      }
      if (interp.kickoffActive === undefined && this.latestSnapshot.kickoffActive !== undefined) {
        interp.kickoffActive = this.latestSnapshot.kickoffActive;
      }
      if (interp.isNeutralKickoff === undefined && this.latestSnapshot.isNeutralKickoff !== undefined) {
        interp.isNeutralKickoff = this.latestSnapshot.isNeutralKickoff;
      }
      if (interp.kickoffPossessingTeam === undefined && this.latestSnapshot.kickoffPossessingTeam !== undefined) {
        interp.kickoffPossessingTeam = this.latestSnapshot.kickoffPossessingTeam;
      }
    }
    return interp;
  }

  private lastTypingStateSent: boolean | null = null;

  public sendTyping(isTyping: boolean): void {
    if (this.lastTypingStateSent === isTyping) return;
    this.lastTypingStateSent = isTyping;
    this.peer?.sendReliable({
      type: 'CHAT_TYPING',
      isTyping
    });
  }

  private sendPingProbe(): void {
    this.peer?.sendUnreliableMessage({
      type: 'PING_PROBE',
      t: performance.now()
    });
  }

  public startPingProbe(): void {
    this.sendPingProbe();
    if (this.pingIntervalId !== null) return;
    this.pingWarmupTimers.push(
      setTimeout(() => this.sendPingProbe(), 250),
      setTimeout(() => this.sendPingProbe(), 550)
    );
    this.pingIntervalId = setInterval(() => {
      this.sendPingProbe();
    }, 1000);
  }

  public stopPingProbe(): void {
    for (let i = 0; i < this.pingWarmupTimers.length; i++) {
      clearTimeout(this.pingWarmupTimers[i]);
    }
    this.pingWarmupTimers.length = 0;
    this.rttSamples.length = 0;
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  public disconnect(): void {
    this.isDisconnecting = true;
    this.inputHistoryCount = 0;
    this.resolveHandshakeWaiters(false);
    this.stopPingProbe();
    this.highestSnapshotTick = -1;
    this.lastSnapshotPhase = null;
    this.lastSyncedStadiumId = null;
    this.lastSyncedConfigSig = '';
    this.cleanupSignalingListeners();
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
    this.localPlayerId = null;
    this.updateActiveGoalScorerId(null);
    this.onDisconnected?.();
  }
}
