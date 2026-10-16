import type {
  ClientSignalMessage,
  ServerSignalMessage,
  IceServerConfig,
  RoomSummary,
  SignalType,
  SignalData
} from '@legacyx/core';

export type SignalingEvent =
  | 'welcome'
  | 'room_created'
  | 'room_list'
  | 'room_joined'
  | 'peer_joined'
  | 'peer_disconnect'
  | 'signal'
  | 'error'
  | 'open'
  | 'close';

export interface SignalingClientOptions {
  url?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export class SignalingClient {
  public peerId: string | null = null;
  public iceServers: IceServerConfig[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ];

  private ws: WebSocket | null = null;
  private url: string;
  private autoReconnect: boolean;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;

  private listeners: Map<SignalingEvent, Array<(payload: any) => void>> = new Map();

  constructor(options?: SignalingClientOptions) {
    this.url = options?.url ?? (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8080`
      : 'ws://localhost:8080');
    this.autoReconnect = options?.autoReconnect ?? true;
    this.maxReconnectAttempts = options?.maxReconnectAttempts ?? 5;
  }

  public on(event: SignalingEvent, callback: (payload: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    return () => this.off(event, callback);
  }

  public off(event: SignalingEvent, callback: (payload: any) => void): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const index = arr.indexOf(callback);
    if (index !== -1) arr.splice(index, 1);
  }

  private emit(event: SignalingEvent, payload?: any): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      try {
        arr[i](payload);
      } catch (err) {
        console.error(`[SignalingClient] Error en callback de evento ${event}:`, err);
      }
    }
  }

  public connect(): Promise<string> {
    this.isIntentionallyClosed = false;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emit('open');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        let msg: ServerSignalMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'WELCOME':
            this.peerId = msg.peerId;
            if (msg.iceServers && msg.iceServers.length > 0) {
              this.iceServers = msg.iceServers;
            }
            this.emit('welcome', { peerId: this.peerId, iceServers: this.iceServers });
            resolve(this.peerId);
            break;

          case 'ROOM_CREATED':
            this.emit('room_created', { roomId: msg.roomId });
            break;

          case 'ROOM_LIST':
            this.emit('room_list', { rooms: msg.rooms });
            break;

          case 'ROOM_JOINED':
            this.emit('room_joined', {
              roomId: msg.roomId,
              hostPeerId: msg.hostPeerId,
              stadiumId: msg.stadiumId
            });
            break;

          case 'PEER_JOINED':
            this.emit('peer_joined', { peerId: msg.peerId, nickname: msg.nickname });
            break;

          case 'PEER_DISCONNECT':
            this.emit('peer_disconnect', { peerId: msg.peerId });
            break;

          case 'SIGNAL_OFFER':
          case 'SIGNAL_ANSWER':
          case 'SIGNAL_ICE_CANDIDATE':
            this.emit('signal', { type: msg.type, fromId: msg.fromId, data: msg.data });
            break;

          case 'ERROR':
            this.emit('error', { code: msg.code, message: msg.message });
            break;

          case 'PONG':
            break;
        }
      };

      this.ws.onerror = (err) => {
        this.emit('error', { code: 'WS_ERROR', message: 'Error de conexión WebSocket' });
      };

      this.ws.onclose = () => {
        this.emit('close');
        if (!this.isIntentionallyClosed && this.autoReconnect) {
          this.scheduleReconnect();
        }
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[SignalingClient] Límite máximo de reintentos de reconexión alcanzado.');
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    console.log(`[SignalingClient] Reintentando conexión en ${backoffMs} ms (intento ${this.reconnectAttempts})...`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, backoffMs);
  }

  public send(message: ClientSignalMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public createRoom(name: string, stadiumId: string, maxPlayers: number, password?: string): void {
    this.send({
      type: 'ROOM_CREATE',
      name,
      stadiumId,
      maxPlayers,
      password
    });
  }

  public joinRoom(roomId: string, password?: string, nickname?: string): void {
    this.send({
      type: 'ROOM_JOIN',
      roomId,
      password,
      nickname
    });
  }

  public leaveRoom(): void {
    this.send({ type: 'ROOM_LEAVE' });
  }

  public requestRoomList(): void {
    this.send({ type: 'ROOM_LIST' });
  }

  public sendSignal(type: SignalType, targetId: string, data: SignalData): void {
    this.send({
      type,
      targetId,
      data
    });
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
