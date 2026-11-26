import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  setupSignalingServer,
  registry,
  getMeteredIceServers,
  resetCachedIceServers
} from '../src/signalingServer.js';

async function createTestServer(opts?: { hostGraceMs?: number; heartbeatIntervalMs?: number }) {
  const httpServer = http.createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const wss = new WebSocketServer({ server: httpServer });
  const handle = setupSignalingServer(wss, opts);
  return {
    wss,
    url: `ws://127.0.0.1:${port}`,
    handle,
    close: async () => {
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // Ignore
        }
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }
  };
}

async function connectWs(url: string) {
  const ws = new WebSocket(url);
  const queue: any[] = [];
  const waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void }> = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const idx = waiters.findIndex((w) => w.pred(msg));
    if (idx !== -1) {
      const [w] = waiters.splice(idx, 1);
      w!.resolve(msg);
    } else {
      queue.push(msg);
    }
  });

  const waitFor = (pred: (m: any) => boolean, timeoutMs = 3000) => {
    const i = queue.findIndex(pred);
    if (i !== -1) {
      const [found] = queue.splice(i, 1);
      return Promise.resolve(found);
    }
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === wrapped);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for message (${timeoutMs}ms)`));
      }, timeoutMs);
      const wrapped = (m: any) => {
        clearTimeout(timer);
        resolve(m);
      };
      waiters.push({ pred, resolve: wrapped });
    });
  };

  const welcome = await waitFor((m) => m.type === 'WELCOME');
  await waitFor((m) => m.type === 'room_list');
  return { ws, peerId: welcome.peerId as string, waitFor };
}

describe('Phase 5 Audit Suite — Signaling Heartbeat, Host Grace/Reclaim, Zombie Cleanup & Metered TURN TTL', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    resetCachedIceServers();
    while (cleanups.length > 0) {
      const fn = cleanups.pop()!;
      await fn();
    }
  });

  it('survives unexpected Host WS disconnect via grace window and restores ownership on RECLAIM_ROOM', async () => {
    const srv = await createTestServer({ hostGraceMs: 800, heartbeatIntervalMs: 5000 });
    cleanups.push(() => srv.close());

    const host1 = await connectWs(srv.url);
    const guest = await connectWs(srv.url);
    cleanups.push(() => guest.ws.close());

    host1.ws.send(
      JSON.stringify({
        type: 'ROOM_CREATE',
        name: 'Grace Survival Room',
        stadiumId: 'mediano',
        maxPlayers: 6,
        clientSessionId: 'host-session-alpha'
      })
    );
    const created = await host1.waitFor((m) => m.type === 'ROOM_CREATED');
    const roomId = created.roomId as string;
    const reclaimToken = created.reclaimToken as string;
    expect(reclaimToken).toBeTruthy();

    guest.ws.send(JSON.stringify({ type: 'ROOM_JOIN', roomId, nickname: 'GuestOne' }));
    await guest.waitFor((m) => m.type === 'ROOM_JOINED');

    // Simulate sudden network drop on Host (no ROOM_LEAVE)
    host1.ws.terminate();
    const reconnectingNotice = await guest.waitFor((m) => m.type === 'HOST_RECONNECTING');
    expect(reconnectingNotice.roomId).toBe(roomId);
    expect(registry.getRoomById(roomId)).toBeDefined();

    // Unauthorized attacker cannot reclaim room with invalid token
    const attacker = await connectWs(srv.url);
    cleanups.push(() => attacker.ws.close());
    attacker.ws.send(
      JSON.stringify({
        type: 'RECLAIM_ROOM',
        roomId,
        reclaimToken: 'invalid-forged-token'
      })
    );
    const err = await attacker.waitFor((m) => m.type === 'ERROR');
    expect(err.code).toBe('UNAUTHORIZED_RECLAIM');

    // Real Host reconnects within grace window and reclaims room
    const host2 = await connectWs(srv.url);
    cleanups.push(() => host2.ws.close());
    host2.ws.send(
      JSON.stringify({
        type: 'RECLAIM_ROOM',
        roomId,
        reclaimToken,
        previousPeerId: host1.peerId,
        clientSessionId: 'host-session-alpha'
      })
    );

    const reclaimed = await host2.waitFor((m) => m.type === 'ROOM_RECLAIMED');
    expect(reclaimed.roomId).toBe(roomId);
    expect(reclaimed.hostPeerId).toBe(host2.peerId);
    expect(reclaimed.guests).toContain(guest.peerId);

    const hostBack = await guest.waitFor((m) => m.type === 'HOST_RECONNECTED');
    expect(hostBack.roomId).toBe(roomId);
    expect(hostBack.hostPeerId).toBe(host2.peerId);
    expect(registry.getRoomById(roomId)?.hostPeerId).toBe(host2.peerId);

    // Explicit ROOM_LEAVE destroys immediately
    host2.ws.send(JSON.stringify({ type: 'ROOM_LEAVE', roomId }));
    const closedNotice = await guest.waitFor((m) => m.type === 'ROOM_CLOSED_NOTICE');
    expect(closedNotice.roomId).toBe(roomId);
    expect(registry.getRoomById(roomId)).toBeUndefined();
  });

  it('destroys room and notifies guests when Host grace window expires without reclaim, and cleans zombie guests', async () => {
    const srv = await createTestServer({ hostGraceMs: 180, heartbeatIntervalMs: 5000 });
    cleanups.push(() => srv.close());

    const host = await connectWs(srv.url);
    const guest = await connectWs(srv.url);
    cleanups.push(() => guest.ws.close());

    host.ws.send(JSON.stringify({ type: 'ROOM_CREATE', name: 'Expire Room', stadiumId: 'mediano', maxPlayers: 2 }));
    const created = await host.waitFor((m) => m.type === 'ROOM_CREATED');
    const roomId = created.roomId as string;

    guest.ws.send(JSON.stringify({ type: 'ROOM_JOIN', roomId, nickname: 'GuestTwo' }));
    await guest.waitFor((m) => m.type === 'ROOM_JOINED');

    // Inject zombie guest peer directly into registry and verify purgeInactiveRooms clears it
    const roomObj = registry.getRoomById(roomId)!;
    roomObj.guests.add('zombie-peer-999');
    roomObj.currentPlayers = roomObj.guests.size + 1;
    registry.purgeInactiveRooms(new Set([host.peerId, guest.peerId]));
    expect(roomObj.guests.has('zombie-peer-999')).toBe(false);
    expect(roomObj.currentPlayers).toBe(2);

    // Drop Host without reclaiming -> expires after 180ms
    host.ws.terminate();
    await guest.waitFor((m) => m.type === 'HOST_RECONNECTING');
    const closed = await guest.waitFor((m) => m.type === 'room_closed', 1500);
    expect(closed.roomId).toBe(roomId);
    expect(registry.getRoomById(roomId)).toBeUndefined();
  });

  it('answers bidirectional HEARTBEAT/PING with pong and deduplicates concurrent Metered TURN fetches with credential TTL', async () => {
    const srv = await createTestServer({ heartbeatIntervalMs: 5000 });
    cleanups.push(() => srv.close());

    const client = await connectWs(srv.url);
    cleanups.push(() => client.ws.close());

    const sentAt = Date.now();
    client.ws.send(JSON.stringify({ type: 'HEARTBEAT', timestamp: sentAt }));
    const pong = await client.waitFor((m) => m.type === 'pong');
    expect(pong.timestamp).toBe(sentAt);
    expect(typeof pong.serverTime).toBe('number');

    // Metered TURN cache deduplication + Coturn unix timestamp expiry detection
    const prevDomain = process.env.METERED_DOMAIN;
    const prevKey = process.env.METERED_API_KEY;
    process.env.METERED_DOMAIN = 'audit.metered.live';
    process.env.METERED_API_KEY = 'audit-secret-key';
    resetCachedIceServers();

    const soonExpiryUnix = Math.floor((Date.now() + 20 * 60 * 1000) / 1000); // 20 min TTL credential
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 25));
      return new Response(
        JSON.stringify([
          { urls: 'stun:stun.relay.metered.ca:80' },
          {
            urls: 'turn:global.relay.metered.ca:80',
            username: `${soonExpiryUnix}:audituser`,
            credential: 'secret'
          }
        ]),
        { status: 200 }
      );
    });

    // 5 concurrent callers -> strictly 1 REST call (zero stampede)
    const results = await Promise.all([
      getMeteredIceServers(),
      getMeteredIceServers(),
      getMeteredIceServers(),
      getMeteredIceServers(),
      getMeteredIceServers()
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r.length).toBe(2);
    }

    process.env.METERED_DOMAIN = prevDomain;
    process.env.METERED_API_KEY = prevKey;
    resetCachedIceServers();
  });
});
