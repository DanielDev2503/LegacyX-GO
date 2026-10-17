import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { RoomRegistry } from './rooms/RoomRegistry.js';
import type {
  ClientSignalMessage,
  ServerSignalMessage,
  IceServerConfig,
  SignalType
} from '@legacyx/core';

const PORT = Number(process.env.PORT) || 8080;
const HEARTBEAT_INTERVAL_MS = 15_000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  peerId?: string;
}

const registry = new RoomRegistry();
const peerSockets = new Map<string, WebSocket>();
const socketToPeerId = new Map<WebSocket, string>();

// Configuración ICE (STUN por defecto + TURN si está provisto en entorno)
function resolveIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ];

  const turnUrl = process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    const urls = turnUrl.split(',').map((u) => u.trim()).filter(Boolean);
    servers.push({
      urls,
      username: turnUsername,
      credential: turnCredential
    });
  }

  return servers;
}

const iceServers = resolveIceServers();

function send(ws: WebSocket, message: ServerSignalMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.warn('[SignalingServer] Error enviando mensaje a socket:', err);
    }
  }
}

function broadcastRoomList(wss: WebSocketServer): void {
  const activePeerIds = new Set(peerSockets.keys());
  const rooms = registry.getPublicRooms(activePeerIds);
  const payload: ServerSignalMessage = { type: 'ROOM_LIST', rooms };
  const raw = JSON.stringify(payload);
  const rawAlt = JSON.stringify({ type: 'room_list', rooms, onlineCount: wss.clients.size });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(raw);
        client.send(rawAlt);
      } catch {
        // Ignorar sockets en proceso de cierre
      }
    }
  }
}

export function startSignalingServer(port: number = PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });
  console.log(`[LegacyX Signaling] Servidor de señalización escuchando en el puerto ${port}`);

  // Heartbeat para limpiar conexiones zombi
  const heartbeatTimer = setInterval(() => {
    for (const client of wss.clients) {
      const sock = client as TrackedSocket;
      if (sock.isAlive === false) {
        console.log(`[SignalingServer] Terminando socket inactivo: ${sock.peerId ?? 'desconocido'}`);
        sock.terminate();
        continue;
      }
      sock.isAlive = false;
      try {
        sock.ping();
      } catch {
        sock.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  wss.on('connection', (socket: WebSocket) => {
    const sock = socket as TrackedSocket;
    sock.isAlive = true;
    const peerId = randomUUID().slice(0, 8);
    sock.peerId = peerId;

    peerSockets.set(peerId, socket);
    socketToPeerId.set(socket, peerId);

    console.log(`[SignalingServer] Nuevo peer conectado: ${peerId}`);

    // Enviar bienvenida con peerId asignado y lista de servidores ICE
    send(socket, {
      type: 'WELCOME',
      peerId,
      iceServers
    });

    sock.on('pong', () => {
      sock.isAlive = true;
    });

    sock.on('message', (data: Buffer | string) => {
      sock.isAlive = true;
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        send(socket, { type: 'ERROR', code: 'INVALID_JSON', message: 'Payload no es JSON válido' });
        return;
      }

      if (msg.peerId && typeof msg.peerId === 'string') {
        peerSockets.set(msg.peerId, socket);
        socketToPeerId.set(socket, msg.peerId);
        sock.peerId = msg.peerId;
      }
      const effectivePeerId = sock.peerId ?? peerId;
      const normType = String(msg.type || '').toUpperCase();

      switch (normType) {
        case 'PING':
        case 'HEARTBEAT': {
          send(socket, { type: 'PONG', ...(msg.timestamp ? { timestamp: msg.timestamp } : {}) } as any);
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp, onlineCount: wss.clients.size }));
            } catch {}
          }
          break;
        }

        case 'ROOM_CREATE':
        case 'CREATE_ROOM': {
          const config = msg.config || {};
          const room = registry.createRoom(effectivePeerId, {
            name: msg.name || config.name || `Room #${effectivePeerId}`,
            stadiumId: msg.stadiumId || config.stadiumId || 'Classic',
            maxPlayers: msg.maxPlayers ?? config.maxPlayers ?? 12,
            password: msg.password || config.password,
            isDedicated: Boolean(msg.isDedicated ?? config.isDedicated)
          });
          console.log(`[SignalingServer] Sala creada: ${room.id} (${room.name}) por Host ${effectivePeerId} (Dedicada: ${room.isDedicated ?? false})`);
          send(socket, { type: 'ROOM_CREATED', roomId: room.id });
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'room_created', roomId: room.id, roomName: room.name, config: room }));
            } catch {}
          }
          broadcastRoomList(wss);
          break;
        }

        case 'ROOM_LIST':
        case 'LIST_ROOMS':
        case 'GET_ROOMS': {
          const activePeerIds = new Set(peerSockets.keys());
          const publicRooms = registry.getPublicRooms(activePeerIds);
          send(socket, { type: 'ROOM_LIST', rooms: publicRooms });
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'room_list', rooms: publicRooms, onlineCount: wss.clients.size }));
            } catch {}
          }
          break;
        }

        case 'ROOM_JOIN':
        case 'JOIN_ROOM': {
          const result = registry.joinRoom(effectivePeerId, msg.roomId, msg.password);
          if (!result.ok) {
            send(socket, { type: 'ERROR', code: result.code, message: `Error al unirse a la sala: ${result.code}` });
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send(JSON.stringify({ type: 'error', code: result.code, message: `Error al unirse a la sala: ${result.code}` }));
              } catch {}
            }
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
          if (socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'room_joined', roomId: room.id, hostId: room.hostPeerId, roomName: room.name }));
            } catch {}
          }

          // Notificar al anfitrión (Host) para que inicie la negociación WebRTC (crear Offer)
          const hostSocket = peerSockets.get(room.hostPeerId);
          if (hostSocket) {
            send(hostSocket, {
              type: 'PEER_JOINED',
              peerId: effectivePeerId,
              nickname: msg.nickname ?? 'Guest'
            });
            if (hostSocket.readyState === WebSocket.OPEN) {
              try {
                hostSocket.send(JSON.stringify({ type: 'peer_joined', peerId: effectivePeerId, nickname: msg.nickname ?? 'Guest' }));
              } catch {}
            }
          }

          broadcastRoomList(wss);
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
                if (left.destroyed) {
                  send(targetSock, { type: 'HOST_DISCONNECT', roomId: left.room.id } as any);
                  if (targetSock.readyState === WebSocket.OPEN) {
                    try {
                      targetSock.send(JSON.stringify({ type: 'host_left', roomId: left.room.id }));
                    } catch {}
                  }
                }
              }
            }
            broadcastRoomList(wss);
          }
          break;
        }

        case 'SIGNAL_OFFER':
        case 'SIGNAL_ANSWER':
        case 'SIGNAL_ICE_CANDIDATE': {
          const targetSocket = peerSockets.get(msg.targetId);
          if (targetSocket) {
            const forwarded: ServerSignalMessage = {
              type: msg.type as SignalType,
              fromId: effectivePeerId,
              data: msg.data
            };
            send(targetSocket, forwarded);
          } else {
            send(socket, {
              type: 'ERROR',
              code: 'PEER_NOT_FOUND',
              message: `El peer de destino ${msg.targetId} no está disponible.`
            });
          }
          break;
        }

        default:
          console.warn(`[SignalingServer] Mensaje desconocido de ${effectivePeerId}:`, msg);
      }
    });

    sock.on('close', () => {
      const closingPeerId = socketToPeerId.get(socket) ?? peerId;
      console.log(`[SignalingServer] Peer desconectado: ${closingPeerId}`);

      peerSockets.delete(closingPeerId);
      if (sock.peerId) peerSockets.delete(sock.peerId);
      socketToPeerId.delete(socket);

      const left = registry.leaveRoom(closingPeerId);
      if (left) {
        for (const notifyPeerId of left.notify) {
          const targetSock = peerSockets.get(notifyPeerId);
          if (targetSock) {
            send(targetSock, { type: 'PEER_DISCONNECT', peerId: closingPeerId });
            if (left.destroyed) {
              send(targetSock, { type: 'HOST_DISCONNECT', roomId: left.room.id } as any);
              if (targetSock.readyState === WebSocket.OPEN) {
                try {
                  targetSock.send(JSON.stringify({ type: 'host_left', roomId: left.room.id }));
                } catch {}
              }
            }
          }
        }
      }

      registry.purgeInactiveRooms(new Set(peerSockets.keys()));
      broadcastRoomList(wss);
    });
  });

  return wss;
}

export { registry };
export {
  getMeteredIceServers,
  resetCachedIceServers,
  getProvisionedIceServers,
  getRuntimeIceServers,
  setupSignalingServer,
  setupSignaling,
  type RoomConfig,
  type Room,
  type RTCIceServer
} from './signalingServer.js';

// Inicialización directa si se ejecuta como script principal
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('index.ts') ||
  process.argv[1].endsWith('index.js')
);

if (isDirectExecution) {
  startSignalingServer();
}
