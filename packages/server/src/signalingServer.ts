import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { RoomRegistry, MAX_ROOM_PLAYERS } from './rooms/RoomRegistry.js';
import {
  authService,
  canCreateRankedRoom,
  canJoinRankedRoom,
  formatGuestNickname,
  isGuestNickname,
  RANKED_GUEST_REJECT_MESSAGE
} from './auth/AuthService.js';
import type { RoomCategory } from '@legacyx/core';

export interface RoomConfig {
  name: string;
  maxPlayers: number;
  isPrivate: boolean;
  password?: string | undefined;
  timeLimit?: number;
  scoreLimit?: number;
  teamsLocked?: boolean;
  stadiumId?: string | undefined;
  stadium?: string | undefined;
  roomType?: RoomCategory | undefined;
  countryCode?: string | undefined;
}

export interface Room {
  id: string;
  config: RoomConfig;
  hostId: string;
  hostWs: WebSocket;
  peers: Map<string, WebSocket>;
  pendingPeers?: Map<string, WebSocket>;
}

const HEARTBEAT_INTERVAL_MS = 10_000;

interface AliveWebSocket extends WebSocket {
  isAlive: boolean;
  peerId?: string | undefined;
  peerIds?: Set<string>;
  lastPingSentAt?: number;
  rttMs?: number;
  detectedCountry?: string;
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'america/bogota': 'CO',
  'america/argentina/buenos_aires': 'AR',
  'america/argentina/cordoba': 'AR',
  'america/argentina/mendoza': 'AR',
  'america/buenos_aires': 'AR',
  'america/sao_paulo': 'BR',
  'america/fortaleza': 'BR',
  'america/recife': 'BR',
  'america/manaus': 'BR',
  'america/belem': 'BR',
  'america/mexico_city': 'MX',
  'america/monterrey': 'MX',
  'america/tijuana': 'MX',
  'america/cancun': 'MX',
  'america/santiago': 'CL',
  'america/punta_arenas': 'CL',
  'america/lima': 'PE',
  'america/montevideo': 'UY',
  'america/guayaquil': 'EC',
  'america/caracas': 'VE',
  'america/la_paz': 'BO',
  'america/asuncion': 'PY',
  'america/costa_rica': 'CR',
  'america/panama': 'PA',
  'america/santo_domingo': 'DO',
  'america/guatemala': 'GT',
  'america/el_salvador': 'SV',
  'america/tegucigalpa': 'HN',
  'america/managua': 'NI',
  'america/puerto_rico': 'PR',
  'america/havana': 'CU',
  'america/new_york': 'US',
  'america/chicago': 'US',
  'america/denver': 'US',
  'america/los_angeles': 'US',
  'america/phoenix': 'US',
  'america/detroit': 'US',
  'america/toronto': 'CA',
  'america/vancouver': 'CA',
  'america/montreal': 'CA',
  'europe/madrid': 'ES',
  'atlantic/canary': 'ES',
  'europe/lisbon': 'PT',
  'europe/london': 'GB',
  'europe/paris': 'FR',
  'europe/berlin': 'DE',
  'europe/rome': 'IT',
  'europe/amsterdam': 'NL',
  'asia/tokyo': 'JP',
  'asia/seoul': 'KR',
  'australia/sydney': 'AU'
};

export function resolveCountryCode(opts: {
  explicitCountry?: string | null;
  timeZone?: string | null;
  headers?: IncomingMessage['headers'];
}): string {
  const h = opts.headers;
  const headerCountry =
    (h?.['cf-ipcountry'] as string | undefined) ||
    (h?.['x-vercel-ip-country'] as string | undefined) ||
    (h?.['x-country-code'] as string | undefined) ||
    (h?.['x-appengine-country'] as string | undefined);

  if (headerCountry && /^[A-Za-z]{2}$/.test(headerCountry.trim()) && headerCountry.toUpperCase() !== 'XX') {
    return headerCountry.trim().toUpperCase();
  }

  if (opts.explicitCountry && /^[A-Za-z]{2}$/.test(opts.explicitCountry.trim())) {
    return opts.explicitCountry.trim().toUpperCase();
  }

  if (opts.timeZone) {
    const normTz = opts.timeZone.trim().toLowerCase();
    if (TIMEZONE_TO_COUNTRY[normTz]) {
      return TIMEZONE_TO_COUNTRY[normTz]!;
    }
    if (normTz.startsWith('america/argentina/')) return 'AR';
    if (normTz.startsWith('america/indiana/') || normTz.startsWith('america/kentucky/')) return 'US';
  }

  const acceptLang = h?.['accept-language'];
  if (typeof acceptLang === 'string') {
    const match = acceptLang.match(/[a-z]{2}-([A-Z]{2})/);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }

  return 'CO';
}

let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiry = 0;

export async function getMeteredIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (cachedIceServers && now < cacheExpiry) {
    return cachedIceServers;
  }

  const rawDomain = process.env.METERED_DOMAIN || '';
  const cleanDomain = rawDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
  const apiKey = (process.env.METERED_API_KEY || '').trim();

  if (!cleanDomain || !apiKey) {
    console.warn('[SignalingServer] METERED_DOMAIN o METERED_API_KEY no configurados. Usando STUN público.');
    return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const url = `https://${cleanDomain}/api/v1/turn/credentials?apiKey=${apiKey}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Metered API status ${res.status}: ${await res.text()}`);
    }

    const servers = (await res.json()) as RTCIceServer[];
    if (Array.isArray(servers) && servers.length > 0) {
      cachedIceServers = servers;
      cacheExpiry = now + 12 * 60 * 60 * 1000;
      console.log(`[SignalingServer] ${servers.length} servidores ICE cacheados exitosamente.`);
      return cachedIceServers;
    }
    throw new Error('Respuesta inválida de Metered');
  } catch (err) {
    console.error('[SignalingServer] Error consultando Metered.ca:', err);
    return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  }
}

export function resetCachedIceServers(): void {
  cachedIceServers = null;
  cacheExpiry = 0;
}

export const getProvisionedIceServers = getMeteredIceServers;
export const getRuntimeIceServers = getMeteredIceServers;

export const registry = new RoomRegistry();

export function setupSignalingServer(wss: WebSocketServer) {
  const peerSockets = new Map<string, WebSocket>();
  const socketToPeerId = new Map<WebSocket, string>();

  function send(ws: WebSocket, data: object): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (err) {
        console.warn('[SignalingServer] Error sending payload:', err);
      }
    }
  }

  function broadcastRoomList(): void {
    const activePeerIds = new Set(peerSockets.keys());
    const publicRooms = registry.getPublicRooms(activePeerIds);
    const payload = JSON.stringify({
      type: 'room_list',
      rooms: publicRooms,
      onlineCount: wss.clients.size
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Ignorar sockets en proceso de cierre
        }
      }
    }
  }

  function maybeAbortRankedRoomMatch(room: {
    roomType: RoomCategory;
    activeMatchToken?: string | null;
    hostUserId?: string;
    hostAccessToken?: string;
    stadiumId: string;
  }): void {
    if (room.roomType === 'ranked' && room.activeMatchToken && room.hostUserId) {
      const tokenToAbort = room.activeMatchToken;
      room.activeMatchToken = null;
      void authService.abortRankedMatch({
        matchToken: tokenToAbort,
        hostUserId: room.hostUserId,
        stadiumId: room.stadiumId,
        accessToken: room.hostAccessToken
      });
    }
  }

  function handlePeerLeave(peerIdsToLeave: Iterable<string>, explicitRoomId?: string): boolean {
    let anyChanged = false;
    const processedRooms = new Set<string>();

    for (const pid of peerIdsToLeave) {
      const left = registry.leaveRoom(pid);
      if (left && !processedRooms.has(left.room.id)) {
        processedRooms.add(left.room.id);
        anyChanged = true;
        if (left.destroyed) {
          maybeAbortRankedRoomMatch(left.room);
        }
        for (const notifyPeerId of left.notify) {
          const targetSock = peerSockets.get(notifyPeerId);
          if (targetSock) {
            if (left.destroyed) {
              send(targetSock, {
                type: 'room_closed',
                roomId: left.room.id,
                reason: 'El anfitrión ha abandonado la sala.'
              });
              send(targetSock, {
                type: 'HOST_DISCONNECT',
                roomId: left.room.id
              });
            } else {
              send(targetSock, { type: 'PEER_DISCONNECT', peerId: pid });
              send(targetSock, { type: 'PEER_LEFT', peerId: pid });
            }
          }
        }
      }
    }

    if (explicitRoomId && !processedRooms.has(explicitRoomId)) {
      const room = registry.getRoomById(explicitRoomId);
      if (room) {
        const pidSet = new Set(peerIdsToLeave);
        if (pidSet.has(room.hostPeerId)) {
          const removed = registry.removeRoom(explicitRoomId);
          if (removed) {
            anyChanged = true;
            maybeAbortRankedRoomMatch(removed);
            for (const guestId of removed.guests) {
              const targetSock = peerSockets.get(guestId);
              if (targetSock) {
                send(targetSock, {
                  type: 'room_closed',
                  roomId: removed.id,
                  reason: 'El anfitrión ha abandonado la sala.'
                });
                send(targetSock, {
                  type: 'HOST_DISCONNECT',
                  roomId: removed.id
                });
              }
            }
          }
        }
      }
    }

    return anyChanged;
  }

  // Heartbeat & medición periódica de RTT de señalización por Host y cliente
  const heartbeatInterval = setInterval(() => {
    let rttUpdated = false;
    const now = Date.now();
    for (const client of wss.clients) {
      const ws = client as AliveWebSocket;
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.lastPingSentAt = now;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
      if (ws.peerId && ws.rttMs !== undefined) {
        const hostRoom = registry.getRoomOfPeer(ws.peerId);
        if (hostRoom && hostRoom.hostPeerId === ws.peerId && hostRoom.hostPingMs !== ws.rttMs) {
          registry.updateRoom(hostRoom.id, { hostPingMs: ws.rttMs });
          rttUpdated = true;
        }
      }
    }
    if (rttUpdated) {
      broadcastRoomList();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', async (socket: WebSocket, req?: IncomingMessage) => {
    const ws = socket as AliveWebSocket;
    ws.isAlive = true;
    ws.rttMs = 24;
    ws.detectedCountry = resolveCountryCode({ headers: req?.headers });
    const initialPeerId = randomUUID().slice(0, 8);
    ws.peerId = initialPeerId;
    ws.peerIds = new Set<string>([initialPeerId]);

    peerSockets.set(initialPeerId, socket);
    socketToPeerId.set(socket, initialPeerId);

    const iceServers = await getMeteredIceServers();
    if (socket.readyState === WebSocket.OPEN) {
      send(socket, {
        type: 'ice_config',
        iceServers,
        onlineCount: wss.clients.size
      });
      send(socket, {
        type: 'WELCOME',
        peerId: initialPeerId,
        iceServers,
        detectedCountry: ws.detectedCountry
      });
      ws.lastPingSentAt = Date.now();
      try {
        ws.ping();
      } catch {
        // Ignore
      }
    }

    send(socket, {
      type: 'room_list',
      rooms: registry.getPublicRooms(new Set(peerSockets.keys())),
      onlineCount: wss.clients.size
    });

    ws.on('pong', () => {
      ws.isAlive = true;
      if (ws.lastPingSentAt) {
        const measured = Math.max(1, Math.round(Date.now() - ws.lastPingSentAt));
        ws.rttMs = ws.rttMs ? Math.round(ws.rttMs * 0.65 + measured * 0.35) : measured;
        if (ws.peerId) {
          const room = registry.getRoomOfPeer(ws.peerId);
          if (room && room.hostPeerId === ws.peerId) {
            registry.updateRoom(room.id, { hostPingMs: ws.rttMs });
          }
        }
      }
    });

    ws.on('message', async (raw: string | Buffer) => {
      try {
        ws.isAlive = true;
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          send(socket, { type: 'ERROR', code: 'INVALID_JSON', message: 'Payload no es JSON válido' });
          return;
        }

        if (msg.peerId && typeof msg.peerId === 'string') {
          peerSockets.set(msg.peerId, socket);
          socketToPeerId.set(socket, msg.peerId);
          ws.peerId = msg.peerId;
          ws.peerIds?.add(msg.peerId);
        }
        const effectivePeerId = ws.peerId ?? initialPeerId;
        ws.peerIds?.add(effectivePeerId);
        const normType = String(msg.type || '').toUpperCase();

        switch (normType) {
          case 'GET_ICE_CONFIG':
          case 'REQUEST_ICE_CONFIG': {
            const servers = await getMeteredIceServers();
            send(ws, { type: 'ice_config', iceServers: servers });
            break;
          }

          case 'HEARTBEAT':
          case 'PING': {
            ws.isAlive = true;
            send(ws, {
              type: 'pong',
              timestamp: msg.timestamp ?? msg.clientSentAt,
              clientSentAt: msg.clientSentAt ?? msg.timestamp,
              serverTime: Date.now(),
              onlineCount: wss.clients.size
            });
            break;
          }

          case 'REPORT_PING': {
            if (typeof msg.pingMs === 'number' && Number.isFinite(msg.pingMs)) {
              ws.rttMs = Math.max(1, Math.min(999, Math.round(msg.pingMs)));
              const room = registry.getRoomOfPeer(effectivePeerId);
              if (room && room.hostPeerId === effectivePeerId) {
                registry.updateRoom(room.id, { hostPingMs: ws.rttMs });
              }
            }
            break;
          }

          case 'PONG': {
            ws.isAlive = true;
            break;
          }

          case 'CREATE_ROOM':
          case 'ROOM_CREATE':
          case 'REGISTER_HOST': {
            const config = msg.roomConfig || msg.config || {};
            const cleanName = String(msg.name || config.name || `Room #${effectivePeerId}`).slice(0, 50);
            const stadium = String(msg.stadiumId || msg.stadium || config.stadiumId || config.stadium || 'mediano');
            const maxPlayers = Math.max(2, Math.min(MAX_ROOM_PLAYERS, Number(msg.maxPlayers ?? config.maxPlayers ?? 12)));
            const password = String(msg.password || config.password || '');
            const isDedicated = Boolean(msg.isDedicated ?? config.isDedicated);
            const requestedRoomType: RoomCategory =
              (msg.roomType || config.roomType) === 'ranked' ? 'ranked' : 'casual';
            const accessToken = typeof msg.accessToken === 'string' ? msg.accessToken : undefined;

            let hostUserId: string | undefined;
            if (requestedRoomType === 'ranked') {
              const sessionProfile = await authService.verifySession(accessToken);
              if (!sessionProfile || !canCreateRankedRoom(sessionProfile.role, false)) {
                send(socket, {
                  type: 'ERROR',
                  code: 'RANKED_ROLE_REQUIRED',
                  message: 'Solo cuentas con rol Representante o Superadmin pueden crear salas Clasificatorias (Ranked).'
                });
                return;
              }
              hostUserId = sessionProfile.id;
            }

            const countryCode = resolveCountryCode({
              explicitCountry: msg.countryCode || config.countryCode,
              timeZone: msg.timeZone || config.timeZone,
              headers: req?.headers
            });

            if (ws.peerIds) {
              handlePeerLeave(ws.peerIds);
            }

            const room = registry.createRoom(effectivePeerId, {
              name: cleanName,
              stadiumId: stadium,
              maxPlayers,
              password: password || undefined,
              isDedicated,
              roomType: requestedRoomType,
              countryCode,
              hostPingMs: ws.rttMs ?? 24,
              hostUserId,
              hostAccessToken: accessToken
            });

            send(socket, {
              type: 'ROOM_CREATED',
              roomId: room.id,
              roomName: room.name,
              roomType: room.roomType,
              countryCode: room.countryCode,
              roomConfig: room,
              config: room
            });

            broadcastRoomList();
            break;
          }

          case 'UPDATE_ROOM':
          case 'UPDATE_ROOM_COUNT': {
            const room = (msg.roomId ? registry.getRoomById(String(msg.roomId)) : undefined) ?? registry.getRoomOfPeer(effectivePeerId);
            if (room && (room.hostPeerId === effectivePeerId || ws.peerIds?.has(room.hostPeerId))) {
              const cfg = msg.config || msg.roomConfig || msg;
              registry.updateRoom(room.id, {
                name: cfg.name,
                stadiumId: cfg.stadiumId ?? cfg.stadium,
                maxPlayers: cfg.maxPlayers,
                currentPlayers: msg.playerCount ?? cfg.playerCount ?? cfg.currentPlayers,
                password: cfg.password,
                isPrivate: cfg.isPrivate,
                hostPingMs: typeof msg.hostPingMs === 'number' ? msg.hostPingMs : ws.rttMs
              });
              broadcastRoomList();
            }
            break;
          }

          case 'ROOM_LIST':
          case 'LIST_ROOMS':
          case 'GET_ROOMS':
          case 'JOIN_LOBBY': {
            const activePeerIds = new Set(peerSockets.keys());
            const publicRooms = registry.getPublicRooms(activePeerIds);
            send(socket, { type: 'room_list', rooms: publicRooms, onlineCount: wss.clients.size });
            break;
          }

          case 'ROOM_JOIN':
          case 'JOIN_ROOM': {
            const roomId = String(msg.roomId || '');
            const password = msg.password ? String(msg.password) : undefined;
            const targetRoom = registry.getRoomById(roomId);

            if (!targetRoom) {
              send(socket, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'La sala solicitada no existe o ha cerrado.' });
              return;
            }

            let effectiveNickname = String(msg.nickname ?? 'Guest').trim();
            let joinerUserId: string | undefined;
            let joinerIsGuest = Boolean(msg.isGuest);
            let joinerIsVerified = false;

            if (typeof msg.accessToken === 'string' && msg.accessToken.length > 10) {
              const verifiedProfile = await authService.verifySession(msg.accessToken);
              if (verifiedProfile && verifiedProfile.isVerified) {
                joinerUserId = verifiedProfile.id;
                joinerIsGuest = false;
                joinerIsVerified = true;
                effectiveNickname = verifiedProfile.username;
              } else {
                joinerIsGuest = true;
              }
            } else if (targetRoom.roomType === 'ranked') {
              // Sin token válido en sala Clasificatoria -> bloquear ingreso
              joinerIsGuest = true;
              joinerIsVerified = false;
            } else if (msg.isGuest === true || isGuestNickname(effectiveNickname)) {
              joinerIsGuest = true;
              effectiveNickname = formatGuestNickname(effectiveNickname);
            }

            if (targetRoom.roomType === 'ranked') {
              const check = canJoinRankedRoom({
                isGuest: joinerIsGuest,
                isVerified: joinerIsVerified,
                nickname: effectiveNickname
              });
              if (!check.allowed) {
                send(socket, {
                  type: 'ERROR',
                  code: 'RANKED_ACCOUNT_REQUIRED',
                  message: check.error ?? RANKED_GUEST_REJECT_MESSAGE
                });
                return;
              }
            }

            const result = registry.joinRoom(effectivePeerId, roomId, password, {
              isGuest: joinerIsGuest,
              isVerified: joinerIsVerified,
              nickname: effectiveNickname
            });

            if (!result.ok) {
              send(socket, {
                type: 'ERROR',
                code: result.code,
                message: result.message || `Error al unirse a la sala: ${result.code}`
              });
              return;
            }

            const room = result.room;

            send(socket, {
              type: 'ROOM_JOINED',
              roomId: room.id,
              hostId: room.hostPeerId,
              hostPeerId: room.hostPeerId,
              roomName: room.name,
              stadiumId: room.stadiumId,
              maxPlayers: room.maxPlayers,
              roomType: room.roomType,
              countryCode: room.countryCode
            });

            const hostSocket = peerSockets.get(room.hostPeerId);
            if (hostSocket) {
              send(hostSocket, {
                type: 'PEER_JOINED',
                peerId: effectivePeerId,
                nickname: effectiveNickname,
                userId: joinerUserId,
                isGuest: joinerIsGuest
              });
            }

            broadcastRoomList();
            break;
          }

          case 'RANKED_MATCH_START': {
            const room = registry.getRoomById(String(msg.roomId || '')) ?? registry.getRoomOfPeer(effectivePeerId);
            if (!room || room.hostPeerId !== effectivePeerId || room.roomType !== 'ranked') {
              send(socket, {
                type: 'ERROR',
                code: 'RANKED_START_DENIED',
                message: 'La sala no está habilitada para emitir un MatchToken clasificatorio.'
              });
              return;
            }
            const accessToken = typeof msg.accessToken === 'string' ? msg.accessToken : room.hostAccessToken;
            const hostProfile = await authService.verifySession(accessToken);
            if (!hostProfile || !canCreateRankedRoom(hostProfile.role, false)) {
              send(socket, {
                type: 'ERROR',
                code: 'RANKED_HOST_INVALID',
                message: 'Sesión del Host no autorizada para iniciar partida Clasificatoria.'
              });
              return;
            }
            const participantIds = Array.isArray(msg.participantUserIds)
              ? msg.participantUserIds.map((x: unknown) => String(x)).filter(Boolean)
              : [];
            const matchToken = authService.issueMatchToken({
              roomId: room.id,
              hostUserId: hostProfile.id,
              stadiumId: String(msg.stadiumId || room.stadiumId || 'mediano'),
              participantUserIds: participantIds
            });
            room.hostUserId = hostProfile.id;
            room.hostAccessToken = accessToken;
            room.activeMatchToken = matchToken;

            send(socket, {
              type: 'RANKED_MATCH_TOKEN',
              roomId: room.id,
              matchToken
            });
            break;
          }

          case 'RANKED_MATCH_REPORT': {
            const room = registry.getRoomById(String(msg.roomId || '')) ?? registry.getRoomOfPeer(effectivePeerId);
            const accessToken = typeof msg.accessToken === 'string' ? msg.accessToken : room?.hostAccessToken;
            const hostProfile = await authService.verifySession(accessToken);
            if (!hostProfile || !canCreateRankedRoom(hostProfile.role, false)) {
              send(socket, {
                type: 'RANKED_MATCH_RESULT',
                roomId: String(msg.roomId || ''),
                success: false,
                error: 'No autorizado para reportar partida Clasificatoria.'
              });
              return;
            }

            const reportRes = await authService.reportRankedMatch({
              matchToken: String(msg.matchToken || ''),
              hostUserId: hostProfile.id,
              stadiumId: String(msg.stadiumId || room?.stadiumId || 'mediano'),
              durationSeconds: Number(msg.durationSeconds || 0),
              redScore: Number(msg.redScore || 0),
              blueScore: Number(msg.blueScore || 0),
              winner: msg.winner === 'red' || msg.winner === 'blue' ? msg.winner : 'draw',
              status: msg.status === 'ABORTED' ? 'ABORTED' : 'COMPLETED',
              participants: Array.isArray(msg.participants) ? msg.participants : [],
              accessToken
            });

            if (room && room.activeMatchToken === msg.matchToken) {
              room.activeMatchToken = null;
            }

            send(socket, {
              type: 'RANKED_MATCH_RESULT',
              roomId: String(msg.roomId || room?.id || ''),
              success: reportRes.success,
              status: reportRes.status,
              error: reportRes.error
            });
            break;
          }

          case 'ROOM_LEAVE':
          case 'LEAVE_ROOM':
          case 'CLOSE_ROOM': {
            const ids = ws.peerIds ? Array.from(ws.peerIds) : [effectivePeerId];
            handlePeerLeave(ids, msg.roomId ? String(msg.roomId) : undefined);
            broadcastRoomList();
            break;
          }

          case 'SIGNAL_OFFER':
          case 'OFFER':
          case 'SIGNAL_ANSWER':
          case 'ANSWER':
          case 'SIGNAL_ICE_CANDIDATE':
          case 'SIGNAL_ICE':
          case 'ICE_CANDIDATE': {
            const targetId = msg.targetId || msg.targetPeerId;
            const targetSocket = targetId ? peerSockets.get(targetId) : undefined;
            if (targetSocket) {
              const forwarded = {
                type: msg.type,
                fromId: effectivePeerId,
                senderPeerId: effectivePeerId,
                targetId,
                targetPeerId: targetId,
                data: msg.data || (msg.sdp ? { sdp: msg.sdp } : (msg.candidate ? { candidate: msg.candidate } : undefined)),
                sdp: msg.sdp || msg.data?.sdp,
                candidate: msg.candidate || msg.data?.candidate
              };
              send(targetSocket, forwarded);
            } else {
              send(socket, {
                type: 'ERROR',
                code: 'PEER_NOT_FOUND',
                message: `El peer de destino ${targetId} no está disponible.`
              });
            }
            break;
          }

          case 'SIGNAL': {
            const targetId = msg.targetPeerId || msg.targetId;
            const targetSocket = targetId ? peerSockets.get(targetId) : undefined;
            if (targetSocket) {
              send(targetSocket, {
                type: 'SIGNAL',
                fromPeerId: effectivePeerId,
                senderPeerId: effectivePeerId,
                targetPeerId: targetId,
                data: msg.data
              });
            }
            break;
          }

          default:
            console.warn(`[SignalingServer] Mensaje desconocido de ${effectivePeerId}:`, msg);
        }
      } catch (err) {
        console.error('[SignalingServer] Error processing message:', err);
      }
    });

    ws.on('close', () => {
      const closingPeerId = socketToPeerId.get(socket) ?? ws.peerId ?? initialPeerId;
      const allSocketPeerIds = ws.peerIds ? Array.from(ws.peerIds) : [closingPeerId];
      if (!allSocketPeerIds.includes(closingPeerId)) {
        allSocketPeerIds.push(closingPeerId);
      }

      for (const pid of allSocketPeerIds) {
        peerSockets.delete(pid);
      }
      socketToPeerId.delete(socket);

      handlePeerLeave(allSocketPeerIds);
      registry.purgeInactiveRooms(new Set(peerSockets.keys()));
      broadcastRoomList();
    });
  });

  return { registry, peerSockets };
}

export const setupSignaling = setupSignalingServer;
