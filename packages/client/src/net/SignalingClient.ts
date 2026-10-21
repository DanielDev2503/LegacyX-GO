import { setDynamicIceServers, DEFAULT_STUN_SERVERS } from './PeerConnection';

export interface RoomListing {
  id: string;
  name: string;
  stadiumId: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
}

export interface RoomConfig {
  name?: string;
  maxPlayers?: number;
  password?: string;
  isPrivate?: boolean;
  timeLimit?: number;
  scoreLimit?: number;
  teamsLocked?: boolean;
  stadiumId?: string;
}

export interface SignalingMessage {
  type:
    | 'ice_config'
    | 'WELCOME'
    | 'ROOM_LIST'
    | 'ROOM_CREATED'
    | 'JOIN_SUCCESS'
    | 'PEER_JOINED'
    | 'PEER_LEFT'
    | 'SIGNAL'
    | 'ERROR'
    | 'register_host'
    | 'join_room'
    | 'offer'
    | 'answer'
    | 'ice_candidate'
    | 'room_created'
    | 'room_joined'
    | 'peer_joined'
    | 'room_list'
    | 'create_room'
    | 'list_rooms'
    | 'error'
    | 'host_disconnected'
    | 'update_room_count'
    | 'close_room'
    | 'ping'
    | 'pong';
  roomId?: string;
  peerId?: string;
  targetPeerId?: string;
  senderPeerId?: string;
  fromPeerId?: string;
  hostPeerId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  data?: unknown;
  rooms?: Array<any>;
  config?: RoomConfig;
  password?: string;
  playerCount?: number;
  reason?: string;
  message?: string;
  iceServers?: RTCIceServer[];
  timestamp?: number;
  onlineCount?: number;
}

type EventCallback = (payload: any) => void;

export function getDefaultSignalingUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8080';
  const envUrl = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SIGNALING_URL;
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Si estamos en Vite dev server (puerto 5173), apunta al backend (8080)
  if (window.location.port === '5173') {
    return `${protocol}//${window.location.hostname}:8080`;
  }
  // En producción (Railway / Docker), el mismo host y puerto atienden HTTP y WS
  return `${protocol}//${window.location.host}`;
}

export class SignalingClient {
  public ws: WebSocket | null = null;
  public peerId: string = 'peer_' + Math.random().toString(36).substring(2, 9);
  private url: string;
  public isConnected: boolean = false;
  public pingMs: number | null = null;
  public onlineCount: number = 1;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<EventCallback>>();

  public onMessage: ((msg: SignalingMessage) => void) | null = null;
  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;

  public iceConfigReady!: Promise<RTCIceServer[]>;
  private resolveIceConfig!: (servers: RTCIceServer[]) => void;
  public isIceReady: boolean = false;

  constructor(url?: string, autoConnect: boolean = true) {
    this.url = url || getDefaultSignalingUrl();
    this.resetIcePromise();
    if (autoConnect && typeof window !== 'undefined') {
      Promise.resolve().then(() => {
        if (!this.isConnected && !this.ws) {
          this.connect();
        }
      });
    }
  }

  public async ensureConnected(): Promise<void> {
    if (this.isOpen()) return;
    return this.connect();
  }

  private resetIcePromise(): void {
    this.isIceReady = false;
    this.iceConfigReady = new Promise<RTCIceServer[]>((resolve) => {
      this.resolveIceConfig = (servers: RTCIceServer[]) => {
        this.isIceReady = true;
        resolve(servers);
      };
    });
  }

  public async whenIceReady(timeoutMs: number = 2500): Promise<RTCIceServer[]> {
    if (this.isIceReady) {
      return this.iceConfigReady;
    }
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const fallbackPromise = new Promise<RTCIceServer[]>((resolve) => {
      timeoutHandle = setTimeout(() => {
        console.warn('[WebRTC] Timeout esperando ice_config; usando STUN por defecto.');
        resolve([{ urls: DEFAULT_STUN_SERVERS }]);
      }, timeoutMs);
    });

    const result = await Promise.race([this.iceConfigReady, fallbackPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return result;
  }

  public measurePing(): void {
    if (this.isOpen()) {
      this.send({ type: 'ping', timestamp: Date.now() });
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.measurePing();
    this.pingInterval = setInterval(() => {
      this.measurePing();
    }, 3000);
  }

  private stopPingLoop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public connect(): Promise<void> {
    this.resetIcePromise();
    return new Promise((resolve) => {
      try {
        try {
          this.ws = new WebSocket(this.url);
        } catch {
          this.ws = (WebSocket as unknown as (u: string) => WebSocket)(this.url);
        }

        this.ws.onopen = () => {
          this.isConnected = true;
          this.startPingLoop();
          this.requestRooms();
          if (this.onConnected) this.onConnected();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as SignalingMessage;
            if (typeof msg.onlineCount === 'number') {
              this.onlineCount = msg.onlineCount;
              this.emit('telemetry', { pingMs: this.pingMs, onlineCount: this.onlineCount });
            }
            if (msg.type === 'pong' || (msg.type as string) === 'PONG') {
              if (typeof msg.timestamp === 'number') {
                this.pingMs = Math.max(1, Math.round(Date.now() - msg.timestamp));
                this.emit('telemetry', { pingMs: this.pingMs, onlineCount: this.onlineCount });
              }
              return;
            }
            if ((msg.type === 'ice_config' || msg.type === 'WELCOME') && Array.isArray(msg.iceServers)) {
              console.log('[WebRTC] Servidores ICE recibidos de señalización:', msg.iceServers);
              setDynamicIceServers(msg.iceServers);
              const hasMeteredTurn = msg.iceServers.some((s) => {
                const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
                return urls.some(
                  (u) => typeof u === 'string' && (u.includes('relay.metered.ca') || u.includes('.metered.live'))
                );
              });
              if (hasMeteredTurn) {
                console.log('[WebRTC] Credenciales TURN activadas desde Metered.ca API.');
              }
              this.resolveIceConfig(msg.iceServers);
              if (msg.type === 'ice_config') {
                return;
              }
            }
            if (this.onMessage) {
              this.onMessage(msg);
            }
            if (msg.type) {
              const lower = msg.type.toLowerCase();
              const upper = msg.type.toUpperCase();
              const eventKeys = new Set<string>([msg.type, lower, upper]);
              if (upper === 'ROOM_JOINED' || upper === 'JOIN_SUCCESS') {
                eventKeys.add('ROOM_JOINED');
                eventKeys.add('room_joined');
                eventKeys.add('JOIN_SUCCESS');
                eventKeys.add('join_success');
              } else if (upper === 'ROOM_CLOSED' || upper === 'HOST_DISCONNECT' || upper === 'HOST_LEFT') {
                eventKeys.add('ROOM_CLOSED');
                eventKeys.add('room_closed');
                eventKeys.add('HOST_DISCONNECT');
                eventKeys.add('host_disconnected');
                eventKeys.add('host_left');
              } else if (upper === 'PEER_DISCONNECT' || upper === 'PEER_LEFT') {
                eventKeys.add('PEER_LEFT');
                eventKeys.add('peer_left');
                eventKeys.add('PEER_DISCONNECT');
              }

              const invoked = new Set<EventCallback>();
              for (const key of eventKeys) {
                const set = this.listeners.get(key);
                if (set) {
                  for (const cb of set) {
                    if (!invoked.has(cb)) {
                      invoked.add(cb);
                      cb(msg);
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error('Invalid signaling message:', err);
          }
        };

        this.ws.onclose = () => {
          this.stopPingLoop();
          this.pingMs = null;
          this.isConnected = false;
          if (this.onDisconnected) this.onDisconnected();
          this.emit('telemetry', { pingMs: null, onlineCount: this.onlineCount });
          this.emit('DISCONNECTED', {});
        };

        this.ws.onerror = () => {
          this.stopPingLoop();
          this.pingMs = null;
          this.isConnected = false;
          resolve();
        };
      } catch {
        this.stopPingLoop();
        this.pingMs = null;
        this.isConnected = false;
        resolve();
      }
    });
  }

  public on(event: string, cb: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
  }

  public off(event: string, cb: EventCallback): void {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }

  public send(msg: SignalingMessage | Record<string, unknown>): void {
    const payload = { peerId: this.peerId, ...msg };
    if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public createRoom(
    nameOrPeerId: string,
    stadiumIdOrConfig?: string | RoomConfig,
    maxPlayers?: number,
    password?: string
  ): void {
    if (typeof stadiumIdOrConfig === 'string' && typeof maxPlayers === 'number') {
      this.send({
        type: 'CREATE_ROOM',
        name: nameOrPeerId,
        stadiumId: stadiumIdOrConfig,
        maxPlayers,
        password
      });
    } else {
      this.send({
        type: 'create_room',
        peerId: nameOrPeerId,
        config: typeof stadiumIdOrConfig === 'object' ? stadiumIdOrConfig : undefined
      });
    }
  }

  public joinRoom(roomId: string, peerIdOrPassword?: string, password?: string): void {
    if (password !== undefined) {
      this.send({
        type: 'join_room',
        roomId,
        peerId: peerIdOrPassword,
        password
      });
    } else {
      this.send({
        type: 'JOIN_ROOM',
        roomId,
        password: peerIdOrPassword
      });
    }
  }

  public requestRooms(): void {
    this.send({ type: 'GET_ROOMS' });
  }

  public listRooms(): void {
    this.send({ type: 'list_rooms' });
  }

  public leaveRoom(roomId?: string): void {
    this.send({ type: 'leave_room', roomId });
  }

  public sendSignal(targetPeerId: string, data: unknown): void {
    this.send({
      type: 'SIGNAL',
      targetPeerId,
      data
    });
  }

  public sendOffer(roomId: string, senderPeerId: string, targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.send({
      type: 'offer',
      roomId,
      senderPeerId,
      targetPeerId,
      sdp
    });
  }

  public sendAnswer(roomId: string, senderPeerId: string, targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.send({
      type: 'answer',
      roomId,
      senderPeerId,
      targetPeerId,
      sdp
    });
  }

  public sendIceCandidate(
    roomId: string,
    senderPeerId: string,
    targetPeerId: string,
    candidate: RTCIceCandidateInit
  ): void {
    this.send({
      type: 'ice_candidate',
      roomId,
      senderPeerId,
      targetPeerId,
      candidate
    });
  }

  public isOpen(): boolean {
    const openConst = typeof WebSocket !== 'undefined' && WebSocket.OPEN ? WebSocket.OPEN : 1;
    return Boolean(this.ws && this.isConnected && this.ws.readyState === openConst);
  }

  public reconnect(): void {
    const openConst = typeof WebSocket !== 'undefined' && WebSocket.OPEN ? WebSocket.OPEN : 1;
    const connectingConst = typeof WebSocket !== 'undefined' && WebSocket.CONNECTING !== undefined ? WebSocket.CONNECTING : 0;
    if (this.ws && (this.ws.readyState === openConst || this.ws.readyState === connectingConst)) {
      return;
    }
    void this.connect();
  }

  public disconnect(): void {
    this.stopPingLoop();
    this.pingMs = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const sharedSignaling = new SignalingClient();

