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
  roomType?: 'casual' | 'ranked';
  timeZone?: string;
}

export interface SignalingMessage {
  type:
    | 'ice_config'
    | 'WELCOME'
    | 'IDENTIFY'
    | 'JOIN_LOBBY'
    | 'AUTH'
    | 'CREATE_ROOM'
    | 'JOIN_ROOM'
    | 'GET_ROOMS'
    | 'ROOM_LIST'
    | 'ROOM_CREATED'
    | 'JOIN_SUCCESS'
    | 'PEER_JOINED'
    | 'PEER_LEFT'
    | 'SIGNAL'
    | 'ERROR'
    | 'PING_PROBE'
    | 'PONG_PROBE'
    | 'ROOM_PING_PROBE'
    | 'ROOM_PING_RESULT'
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
    | 'leave_room'
    | 'error'
    | 'host_disconnected'
    | 'update_room_count'
    | 'close_room'
    | 'ping'
    | 'pong'
    | (string & {});
  roomId?: string;
  peerId?: string;
  userId?: string;
  clientSessionId?: string;
  targetPeerId?: string;
  senderPeerId?: string;
  fromPeerId?: string;
  hostPeerId?: string;
  requesterId?: string;
  probeId?: string;
  clientSentAt?: number;
  t0?: number;
  pingMs?: number | null;
  ping?: number | null;
  unreachable?: boolean;
  timedOut?: boolean;
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

const CLIENT_SESSION_STORAGE_KEY = 'legacyx_client_session_id';
const AUTH_SESSION_STORAGE_KEY = 'legacyx_auth_session';
let fallbackTabSessionId: string | null = null;

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function getOrCreateClientSessionId(): string {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const existing = sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
      if (existing && existing.trim()) {
        fallbackTabSessionId = existing;
        return existing;
      }
      const created = generateUuid();
      sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, created);
      fallbackTabSessionId = created;
      return created;
    } catch {
      // Fallback to in-memory UUID when sessionStorage is restricted
    }
  }
  if (!fallbackTabSessionId) {
    fallbackTabSessionId = generateUuid();
  }
  return fallbackTabSessionId;
}

function readStoredUserId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, any>;
    const candidate = parsed?.profile?.id ?? parsed?.user?.id ?? parsed?.id;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  } catch {
    return null;
  }
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
  public readonly clientSessionId: string;
  public userId: string | null = null;
  private url: string;
  public isConnected: boolean = false;
  public pingMs: number | null = null;
  public onlineCount: number = 1;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<EventCallback>>();
  private connectPromise: Promise<void> | null = null;
  private probeCounter = 0;
  private pendingRoomProbes = new Map<
    string,
    { roomId: string; sentAt: number; timer: ReturnType<typeof setTimeout>; resolve: (ms: number) => void }
  >();

  public onMessage: ((msg: SignalingMessage) => void) | null = null;
  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onRoomPingResult: ((roomId: string, pingMs: number) => void) | null = null;

  public iceConfigReady!: Promise<RTCIceServer[]>;
  private resolveIceConfig!: (servers: RTCIceServer[]) => void;
  public isIceReady: boolean = false;

  constructor(url?: string, autoConnect: boolean = true) {
    this.url = url || getDefaultSignalingUrl();
    this.clientSessionId = getOrCreateClientSessionId();
    this.userId = readStoredUserId();
    this.resetIcePromise();
    if (autoConnect && typeof window !== 'undefined') {
      Promise.resolve().then(() => {
        void this.ensureConnected();
      });
    }
  }

  private static getWsReadyStateConstants(): { connecting: number; open: number } {
    const connecting =
      typeof WebSocket !== 'undefined' && typeof WebSocket.CONNECTING === 'number' ? WebSocket.CONNECTING : 0;
    const open = typeof WebSocket !== 'undefined' && typeof WebSocket.OPEN === 'number' ? WebSocket.OPEN : 1;
    return { connecting, open };
  }

  public setUserId(userId: string | null): void {
    const normalized = typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : null;
    this.userId = normalized;
    if (this.isOpen()) {
      this.identify(normalized);
    }
  }

  public identify(userId: string | null = this.userId): void {
    if (userId !== undefined) {
      this.userId = typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : null;
    }
    if (this.isOpen()) {
      this.send({
        type: 'IDENTIFY',
        userId: this.userId ?? undefined,
        clientSessionId: this.clientSessionId
      });
    }
  }

  public joinLobby(): void {
    if (this.isOpen()) {
      this.send({
        type: 'JOIN_LOBBY',
        userId: this.userId ?? undefined,
        clientSessionId: this.clientSessionId
      });
    }
  }

  public async ensureConnected(): Promise<void> {
    if (this.isOpen()) return;
    if (this.connectPromise) return this.connectPromise;
    const { connecting, open } = SignalingClient.getWsReadyStateConstants();
    if (this.ws && (this.ws.readyState === connecting || this.ws.readyState === open)) {
      return;
    }
    return this.connect();
  }

  private clearPendingRoomProbes(): void {
    for (const pending of this.pendingRoomProbes.values()) {
      clearTimeout(pending.timer);
      pending.resolve(-1);
    }
    this.pendingRoomProbes.clear();
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

  public probeRoomPing(roomId: string): Promise<number> {
    if (!roomId || !this.isOpen()) {
      return Promise.resolve(-1);
    }
    const probeId = `probe_${++this.probeCounter}_${Date.now().toString(36)}`;
    const sentAt = Date.now();

    return new Promise<number>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRoomProbes.delete(probeId);
        resolve(-1);
      }, 4500);

      this.pendingRoomProbes.set(probeId, {
        roomId,
        sentAt,
        timer,
        resolve
      });

      this.send({
        type: 'ROOM_PING_PROBE',
        roomId,
        probeId,
        clientSentAt: sentAt,
        t0: sentAt
      });
    });
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
    const { connecting, open } = SignalingClient.getWsReadyStateConstants();
    if (this.isOpen()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    if (this.ws && (this.ws.readyState === connecting || this.ws.readyState === open)) {
      return Promise.resolve();
    }

    this.resetIcePromise();
    const promise = new Promise<void>((resolve) => {
      let settled = false;
      const settleConnect = () => {
        if (settled) return;
        settled = true;
        if (this.connectPromise === promise) {
          this.connectPromise = null;
        }
        resolve();
      };

      try {
        let socket: WebSocket;
        try {
          socket = new WebSocket(this.url);
        } catch {
          socket = (WebSocket as unknown as (u: string) => WebSocket)(this.url);
        }
        this.ws = socket;

        socket.onopen = () => {
          if (this.ws !== socket) return;
          this.isConnected = true;
          this.startPingLoop();
          this.identify(this.userId ?? readStoredUserId());
          this.joinLobby();
          this.requestRooms();
          if (this.onConnected) this.onConnected();
          settleConnect();
        };

        socket.onmessage = (event) => {
          if (this.ws !== socket) return;
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
                if (this.isOpen()) {
                  this.send({ type: 'REPORT_PING', pingMs: this.pingMs });
                }
              }
              return;
            }
            if (msg.type === 'PING_PROBE') {
              if (this.isOpen()) {
                this.send({
                  type: 'PONG_PROBE',
                  roomId: msg.roomId,
                  probeId: msg.probeId,
                  requesterId: msg.requesterId,
                  clientSentAt: msg.clientSentAt,
                  ...(msg.t0 !== undefined ? { t0: msg.t0 } : {})
                });
              }
              return;
            }
            if (msg.type === 'ROOM_PING_RESULT') {
              const roomId = typeof msg.roomId === 'string' ? msg.roomId : '';
              const probeId = typeof msg.probeId === 'string' ? msg.probeId : '';
              const rawPing =
                typeof msg.pingMs === 'number' && Number.isFinite(msg.pingMs)
                  ? Math.max(1, Math.round(msg.pingMs))
                  : typeof msg.ping === 'number' && Number.isFinite(msg.ping)
                    ? Math.max(1, Math.round(msg.ping))
                    : -1;

              let pendingEntry:
                | { roomId: string; sentAt: number; timer: ReturnType<typeof setTimeout>; resolve: (ms: number) => void }
                | undefined;
              if (probeId && this.pendingRoomProbes.has(probeId)) {
                pendingEntry = this.pendingRoomProbes.get(probeId);
                this.pendingRoomProbes.delete(probeId);
              } else if (roomId) {
                for (const [k, v] of this.pendingRoomProbes.entries()) {
                  if (v.roomId === roomId) {
                    pendingEntry = v;
                    this.pendingRoomProbes.delete(k);
                    break;
                  }
                }
              }

              if (pendingEntry) {
                clearTimeout(pendingEntry.timer);
                const resolvedMs =
                  rawPing > 0
                    ? rawPing
                    : msg.unreachable
                      ? -1
                      : Math.max(1, Math.round(Date.now() - pendingEntry.sentAt));
                pendingEntry.resolve(resolvedMs);
              }

              if (roomId && rawPing > 0) {
                msg.ping = rawPing;
                msg.pingMs = rawPing;
                this.onRoomPingResult?.(roomId, rawPing);
              }
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

        socket.onclose = () => {
          if (this.ws !== socket) return;
          this.stopPingLoop();
          this.pingMs = null;
          this.isConnected = false;
          this.ws = null;
          this.clearPendingRoomProbes();
          if (this.onDisconnected) this.onDisconnected();
          this.emit('telemetry', { pingMs: null, onlineCount: this.onlineCount });
          this.emit('DISCONNECTED', {});
          settleConnect();
        };

        socket.onerror = () => {
          if (this.ws !== socket) return;
          this.stopPingLoop();
          this.pingMs = null;
          this.isConnected = false;
          this.clearPendingRoomProbes();
          settleConnect();
        };
      } catch {
        this.stopPingLoop();
        this.pingMs = null;
        this.isConnected = false;
        this.clearPendingRoomProbes();
        settleConnect();
      }
    });

    this.connectPromise = promise;
    return promise;
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
    const activeUserId = this.userId ?? readStoredUserId();
    const payload: Record<string, unknown> = {
      peerId: this.peerId,
      clientSessionId: this.clientSessionId,
      ...(activeUserId ? { userId: activeUserId } : {}),
      ...msg
    };
    const { open } = SignalingClient.getWsReadyStateConstants();
    if (this.ws && (this.isConnected || this.ws.readyState === open) && this.ws.readyState === open) {
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
    const { open } = SignalingClient.getWsReadyStateConstants();
    return Boolean(this.ws && this.isConnected && this.ws.readyState === open);
  }

  public reconnect(): void {
    const { connecting, open } = SignalingClient.getWsReadyStateConstants();
    if (this.connectPromise || (this.ws && (this.ws.readyState === open || this.ws.readyState === connecting))) {
      return;
    }
    void this.ensureConnected();
  }

  public disconnect(): void {
    this.stopPingLoop();
    this.pingMs = null;
    this.connectPromise = null;
    this.clearPendingRoomProbes();
    const sock = this.ws;
    this.ws = null;
    this.isConnected = false;
    if (sock) {
      sock.close();
    }
  }
}

export const sharedSignaling = new SignalingClient();

