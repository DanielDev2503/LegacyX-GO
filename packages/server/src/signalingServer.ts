import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { RoomRegistry } from './rooms/RoomRegistry.js';
import type {
  ClientSignalMessage,
  ServerSignalMessage,
  IceServerConfig,
  SignalType
} from '@legacyx/core';

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
}

export interface Room {
  id: string;
  config: RoomConfig;
  hostId: string;
  hostWs: WebSocket;
  peers: Map<string, WebSocket>;
  pendingPeers?: Map<string, WebSocket>;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

interface AliveWebSocket extends WebSocket {
  isAlive: boolean;
  peerId?: string | undefined;
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
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
    console.log('[SignalingServer] Solicitando credenciales ICE dinámicas a Metered.ca...');
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
      cacheExpiry = now + 12 * 60 * 60 * 1000; // 12 horas de caché
      console.log(`[SignalingServer] ${servers.length} servidores ICE cacheados exitosamente.`);
      return cachedIceServers;
    }
    throw new Error('Respuesta inválida de Metered (no es un array de servidores)');
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
    const payloadUpper = JSON.stringify({
      type: 'ROOM_LIST',
      rooms: publicRooms
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
          client.send(payloadUpper);
        } catch {
          // Ignorar sockets en proceso de cierre
        }
      }
    }
  }

  // Heartbeat para limpiar conexiones zombi
  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as AliveWebSocket;
      if (!ws.isAlive) {
        console.log(`[SignalingServer] Heartbeat timeout para socket: ${ws.peerId || 'desconocido'}`);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', async (socket: WebSocket) => {
    const ws = socket as AliveWebSocket;
    ws.isAlive = true;
    const initialPeerId = randomUUID().slice(0, 8);
    ws.peerId = initialPeerId;

    peerSockets.set(initialPeerId, socket);
    socketToPeerId.set(socket, initialPeerId);

    console.log(`[SignalingServer] Nuevo peer conectado: ${initialPeerId}`);

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
        iceServers
      });
    }

    // Enviar lista actual de salas al cliente recién conectado
    send(socket, {
      type: 'room_list',
      rooms: registry.getPublicRooms(new Set(peerSockets.keys())),
      onlineCount: wss.clients.size
    });

    ws.on('pong', () => {
      ws.isAlive = true;
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
        }
        const effectivePeerId = ws.peerId ?? initialPeerId;
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
              type: 'PONG',
              timestamp: msg.timestamp,
              onlineCount: wss.clients.size
            });
            send(ws, {
              type: 'pong',
              timestamp: msg.timestamp,
              onlineCount: wss.clients.size
            });
            break;
          }

          case 'PONG': {
            ws.isAlive = true;
            break;
          }

          case 'CREATE_ROOM':
          case 'ROOM_CREATE': {
            const config = msg.roomConfig || msg.config || {};
            const cleanName = String(msg.name || config.name || `Room #${effectivePeerId}`).slice(0, 50);
            const stadium = String(msg.stadiumId || msg.stadium || config.stadiumId || config.stadium || 'mediano');
            const maxPlayers = Math.max(2, Math.min(20, Number(msg.maxPlayers ?? config.maxPlayers ?? 12)));
            const password = String(msg.password || config.password || '');
            const isDedicated = Boolean(msg.isDedicated ?? config.isDedicated);

            const room = registry.createRoom(effectivePeerId, {
              name: cleanName,
              stadiumId: stadium,
              maxPlayers,
              password: password || undefined,
              isDedicated
            });

            console.log(`[SignalingServer] Sala creada: ${room.id} (${room.name}) por Host ${effectivePeerId} (Dedicada: ${room.isDedicated ?? false})`);

            // Responder al anfitrión con ambas variantes de nombres
            send(socket, { type: 'ROOM_CREATED', roomId: room.id, roomConfig: room, config: room });
            send(socket, { type: 'room_created', roomId: room.id, roomName: room.name, roomConfig: room, config: room });

            // Broadcast Inmediato a todos los WebSockets conectados
            broadcastRoomList();
            break;
          }

          case 'ROOM_LIST':
          case 'LIST_ROOMS':
          case 'GET_ROOMS':
          case 'JOIN_LOBBY': {
            const activePeerIds = new Set(peerSockets.keys());
            const publicRooms = registry.getPublicRooms(activePeerIds);
            send(socket, { type: 'room_list', rooms: publicRooms, onlineCount: wss.clients.size });
            send(socket, { type: 'ROOM_LIST', rooms: publicRooms });
            break;
          }

          case 'ROOM_JOIN':
          case 'JOIN_ROOM': {
            const roomId = String(msg.roomId || '');
            const password = msg.password ? String(msg.password) : undefined;
            const result = registry.joinRoom(effectivePeerId, roomId, password);

            if (!result.ok) {
              send(socket, { type: 'ERROR', code: result.code, message: `Error al unirse a la sala: ${result.code}` });
              send(socket, { type: 'error', code: result.code, message: `Error al unirse a la sala: ${result.code}` });
              return;
            }

            const room = result.room;
            console.log(`[SignalingServer] Peer ${effectivePeerId} ("${msg.nickname ?? 'Guest'}") se unió a sala ${room.id}`);

            // Notificar al invitado que se unió con éxito
            send(socket, {
              type: 'ROOM_JOINED',
              roomId: room.id,
              hostPeerId: room.hostPeerId,
              stadiumId: room.stadiumId
            });
            send(socket, {
              type: 'room_joined',
              roomId: room.id,
              hostId: room.hostPeerId,
              hostPeerId: room.hostPeerId,
              roomName: room.name,
              stadiumId: room.stadiumId
            });
            send(socket, {
              type: 'JOIN_SUCCESS',
              roomId: room.id,
              hostPeerId: room.hostPeerId,
              stadiumId: room.stadiumId
            });

            // Notificar al anfitrión (Host)
            const hostSocket = peerSockets.get(room.hostPeerId);
            if (hostSocket) {
              send(hostSocket, {
                type: 'PEER_JOINED',
                peerId: effectivePeerId,
                nickname: msg.nickname ?? 'Guest'
              });
              send(hostSocket, {
                type: 'peer_joined',
                peerId: effectivePeerId,
                nickname: msg.nickname ?? 'Guest'
              });
            }

            broadcastRoomList();
            break;
          }

          case 'ROOM_LEAVE':
          case 'LEAVE_ROOM': {
            const left = registry.leaveRoom(effectivePeerId);
            if (left) {
              for (const notifyPeerId of left.notify) {
                const targetSock = peerSockets.get(notifyPeerId);
                if (targetSock) {
                  send(targetSock, { type: 'PEER_DISCONNECT', peerId: effectivePeerId });
                  send(targetSock, { type: 'peer_left', peerId: effectivePeerId });
                  if (left.destroyed) {
                    send(targetSock, { type: 'HOST_DISCONNECT', roomId: left.room.id } as any);
                    send(targetSock, { type: 'host_left', roomId: left.room.id });
                  }
                }
              }
              broadcastRoomList();
            }
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
              // Enviar en ambos formatos (data anidado y campos sueltos sdp/candidate)
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
      console.log(`[SignalingServer] Peer desconectado: ${closingPeerId}`);

      peerSockets.delete(closingPeerId);
      if (ws.peerId) peerSockets.delete(ws.peerId);
      socketToPeerId.delete(socket);

      const left = registry.leaveRoom(closingPeerId);
      if (left) {
        for (const notifyPeerId of left.notify) {
          const targetSock = peerSockets.get(notifyPeerId);
          if (targetSock) {
            send(targetSock, { type: 'PEER_DISCONNECT', peerId: closingPeerId });
            send(targetSock, { type: 'peer_left', peerId: closingPeerId });
            if (left.destroyed) {
              send(targetSock, { type: 'HOST_DISCONNECT', roomId: left.room.id } as any);
              send(targetSock, { type: 'host_left', roomId: left.room.id });
            }
          }
        }
      }

      registry.purgeInactiveRooms(new Set(peerSockets.keys()));
      broadcastRoomList();
    });
  });

  return { registry, peerSockets };
}

export const setupSignaling = setupSignalingServer;
