import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { startSignalingServer, registry } from '../src/index.js';
import type { ServerSignalMessage, ClientSignalMessage } from '@legacyx/core';

describe('Signaling Server - Shift-Left Smoke Test', () => {
  let wss: WebSocketServer;
  const TEST_PORT = 9182;
  const WS_URL = `ws://localhost:${TEST_PORT}`;

  beforeAll(() => {
    wss = startSignalingServer(TEST_PORT);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  });

  it('debe completar el flujo integral de sala: bienvenida, creación, unión, intercambio de oferta SDP y limpieza tras desconexión', async () => {
    let hostPeerId = '';
    let guestPeerId = '';
    let createdRoomId = '';

    // 1. Conectar Socket del Anfitrión (Host)
    const hostWs = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      hostWs.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerSignalMessage;
        if (msg.type === 'WELCOME') {
          hostPeerId = msg.peerId;
          expect(msg.iceServers).toBeDefined();
          resolve();
        }
      });
    });

    expect(hostPeerId).toBeTruthy();

    // 2. Anfitrión crea sala dedicada
    const roomCreatedPromise = new Promise<string>((resolve) => {
      const handler = (data: any) => {
        const msg = JSON.parse(data.toString()) as ServerSignalMessage;
        if (msg.type === 'ROOM_CREATED') {
          hostWs.off('message', handler);
          resolve(msg.roomId);
        }
      };
      hostWs.on('message', handler);
    });

    const createMsg: ClientSignalMessage = {
      type: 'ROOM_CREATE',
      name: 'Smoke Test Arena',
      stadiumId: 'AF 3v3',
      maxPlayers: 6,
      isDedicated: true
    };
    hostWs.send(JSON.stringify(createMsg));

    createdRoomId = await roomCreatedPromise;
    expect(createdRoomId).toBeTruthy();

    // Verificar en la memoria del registro
    const inMemoryRoom = registry.getRoomById(createdRoomId);
    expect(inMemoryRoom).toBeDefined();
    expect(inMemoryRoom?.name).toBe('Smoke Test Arena');
    expect(inMemoryRoom?.isDedicated).toBe(true);

    // 3. Conectar Socket del Invitado (Guest)
    const guestWs = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      guestWs.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerSignalMessage;
        if (msg.type === 'WELCOME') {
          guestPeerId = msg.peerId;
          resolve();
        }
      });
    });

    expect(guestPeerId).toBeTruthy();
    expect(guestPeerId).not.toBe(hostPeerId);

    // 4. Invitado se une a la sala
    const guestJoinedPromise = new Promise<void>((resolve) => {
      const handler = (data: any) => {
        const msg = JSON.parse(data.toString()) as ServerSignalMessage;
        if (msg.type === 'ROOM_JOINED') {
          expect(msg.roomId).toBe(createdRoomId);
          expect(msg.hostPeerId).toBe(hostPeerId);
          guestWs.off('message', handler);
          resolve();
        }
      };
      guestWs.on('message', handler);
    });

    const hostPeerJoinedPromise = new Promise<void>((resolve) => {
      const handler = (data: any) => {
        const msg = JSON.parse(data.toString()) as ServerSignalMessage;
        if (msg.type === 'PEER_JOINED') {
          expect(msg.peerId).toBe(guestPeerId);
          hostWs.off('message', handler);
          resolve();
        }
      };
      hostWs.on('message', handler);
    });

    guestWs.send(JSON.stringify({
      type: 'ROOM_JOIN',
      roomId: createdRoomId,
      nickname: 'SmokeTesterGuest'
    } as ClientSignalMessage));

    await Promise.all([guestJoinedPromise, hostPeerJoinedPromise]);

    // 5. Intercambio de Oferta SDP ficticia entre Guest y Host
    const sdpPayload = { type: 'offer', sdp: 'v=0\r\no=legacyx 12345 2 IN IP4 127.0.0.1' };
    const offerReceivedPromise = new Promise<void>((resolve) => {
      const handler = (data: any) => {
        const msg = JSON.parse(data.toString()) as ServerSignalMessage;
        if (msg.type === 'SIGNAL_OFFER') {
          expect(msg.fromId).toBe(guestPeerId);
          expect(msg.data).toEqual(sdpPayload);
          hostWs.off('message', handler);
          resolve();
        }
      };
      hostWs.on('message', handler);
    });

    guestWs.send(JSON.stringify({
      type: 'SIGNAL_OFFER',
      targetId: hostPeerId,
      data: sdpPayload
    } as ClientSignalMessage));

    await offerReceivedPromise;

    // 6. Cierre de sockets y comprobación de eliminación en memoria
    await new Promise<void>((resolve) => {
      guestWs.close();
      guestWs.on('close', () => resolve());
    });

    await new Promise<void>((resolve) => {
      hostWs.close();
      hostWs.on('close', () => resolve());
    });

    // Dar un breve margen para el evento 'close' del socket en el servidor
    await new Promise((r) => setTimeout(r, 50));

    // Como el host se desconectó, la sala debe haberse destruido en el RoomRegistry
    const roomAfterHostLeave = registry.getRoomById(createdRoomId);
    expect(roomAfterHostLeave).toBeUndefined();
  });
});
