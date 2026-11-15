import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { setupSignalingServer } from '../src/index.js';

async function createEphemeralSignaling() {
  const httpServer = http.createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const wss = new WebSocketServer({ server: httpServer });
  setupSignalingServer(wss);

  return {
    url: `ws://127.0.0.1:${port}`,
    close: async () => {
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {}
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }
  };
}

async function connectClient(url: string) {
  const ws = new WebSocket(url);
  const queue: any[] = [];
  const waiters: Array<{ predicate: (msg: any) => boolean; resolve: (msg: any) => void }> = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const idx = waiters.findIndex((w) => w.predicate(msg));
    if (idx !== -1) {
      const [w] = waiters.splice(idx, 1);
      w!.resolve(msg);
    } else {
      queue.push(msg);
    }
  });

  const waitFor = (predicate: (msg: any) => boolean, timeoutMs = 3000): Promise<any> => {
    const queuedIdx = queue.findIndex(predicate);
    if (queuedIdx !== -1) {
      const [found] = queue.splice(queuedIdx, 1);
      return Promise.resolve(found);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.findIndex((w) => w.resolve === wrappedResolve);
        if (i !== -1) waiters.splice(i, 1);
        reject(new Error(`Timeout waiting for WS message (${timeoutMs}ms)`));
      }, timeoutMs);
      const wrappedResolve = (msg: any) => {
        clearTimeout(timer);
        resolve(msg);
      };
      waiters.push({ predicate, resolve: wrappedResolve });
    });
  };

  const welcome = await waitFor((m) => m.type === 'WELCOME');
  await waitFor((m) => m.type === 'room_list');
  return { ws, peerId: welcome.peerId as string, waitFor };
}

describe('Wave-4 Server Moderation: Kick, Ban, Banned-Rejoin & Room Closed Notices', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('delivers ROOM_MODERATION_NOTICE for kick/ban, blocks banned rejoin with ROOM_BANNED, and sends ROOM_CLOSED_NOTICE when host leaves', async () => {
    const srv = await createEphemeralSignaling();
    cleanups.push(() => srv.close());

    const host = await connectClient(srv.url);
    const guestA = await connectClient(srv.url);
    const guestB = await connectClient(srv.url);

    host.ws.send(
      JSON.stringify({
        type: 'create_room',
        name: 'Copa Mundial Room',
        capacity: 10,
        userId: 'host-uid-1'
      })
    );
    const created = await host.waitFor((m) => m.type === 'room_created' || m.type === 'ROOM_CREATED');
    const roomId = created.room?.id ?? created.roomId;
    expect(roomId).toBeTruthy();

    guestA.ws.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        userId: 'guest-a-uid'
      })
    );
    await guestA.waitFor((m) => m.type === 'room_joined' || m.type === 'ROOM_JOINED');

    // 1. Kick (allows rejoin)
    host.ws.send(
      JSON.stringify({
        type: 'ROOM_MODERATION_ACTION',
        action: 'kick',
        roomId,
        targetPeerId: guestA.peerId,
        targetUserId: 'guest-a-uid'
      })
    );
    const kickNotice = await guestA.waitFor((m) => m.type === 'ROOM_MODERATION_NOTICE');
    expect(kickNotice.kind).toBe('kicked');
    expect(kickNotice.roomName).toBe('Copa Mundial Room');

    guestA.ws.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        userId: 'guest-a-uid'
      })
    );
    await guestA.waitFor((m) => m.type === 'room_joined' || m.type === 'ROOM_JOINED');

    // 2. Ban (blocks subsequent rejoin even on a fresh socket with same userId)
    host.ws.send(
      JSON.stringify({
        type: 'ROOM_MODERATION_ACTION',
        action: 'ban',
        roomId,
        targetPeerId: guestA.peerId,
        targetUserId: 'guest-a-uid'
      })
    );
    const banNotice = await guestA.waitFor((m) => m.type === 'ROOM_MODERATION_NOTICE');
    expect(banNotice.kind).toBe('banned');
    expect(banNotice.roomName).toBe('Copa Mundial Room');

    const guestAReconnect = await connectClient(srv.url);
    guestAReconnect.ws.send(
      JSON.stringify({
        type: 'join_room',
        roomId,
        userId: 'guest-a-uid'
      })
    );
    const banReject = await guestAReconnect.waitFor((m) => m.type === 'ERROR' || m.type === 'error');
    expect(banReject.code).toBe('ROOM_BANNED');

    // 3. Host closes room while Guest B is connected
    guestB.ws.send(JSON.stringify({ type: 'join_room', roomId, userId: 'guest-b-uid' }));
    await guestB.waitFor((m) => m.type === 'room_joined' || m.type === 'ROOM_JOINED');

    host.ws.send(JSON.stringify({ type: 'leave_room', roomId }));
    const closedNotice = await guestB.waitFor((m) => m.type === 'ROOM_CLOSED_NOTICE');
    expect(closedNotice.roomId).toBe(roomId);
    expect(closedNotice.roomName).toBe('Copa Mundial Room');
  });
});
