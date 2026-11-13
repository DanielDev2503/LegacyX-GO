import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  AuthService,
  startSignalingServer,
  setupSignalingServer,
  registry,
  type ClientSignalMessage
} from '../src/index.js';
import { DedicatedHost } from '../src/headless/DedicatedHost.js';

async function createEphemeralSignaling(opts?: { pingProbeTimeoutMs?: number }): Promise<{
  wss: WebSocketServer;
  url: string;
  getRealOnlineCount: () => number;
  close: () => Promise<void>;
}> {
  const httpServer = http.createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const wss = new WebSocketServer({ server: httpServer });
  const handle = setupSignalingServer(wss, opts as any) as any;

  return {
    wss,
    url: `ws://127.0.0.1:${port}`,
    getRealOnlineCount: () => handle.getRealOnlineCount?.(),
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

async function connectClient(url: string): Promise<{
  ws: WebSocket;
  peerId: string;
  waitFor: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
  drain: () => void;
}> {
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
  return {
    ws,
    peerId: welcome.peerId,
    waitFor,
    drain: () => {
      queue.length = 0;
    }
  };
}

describe('Task 2 Server Fixes: name_changed, Ranked Sanity, Real Hover Ping & Online Dedup', () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) {
      const fn = cleanups.pop()!;
      await fn();
    }
  });

  describe('Item 29: AuthService.fetchFullProfile includes name_changed', () => {
    it('selects name_changed from Supabase profiles and maps nameChanged boolean onto UserProfileRecord', async () => {
      const svc = new AuthService();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'user-abc',
                username: 'NeoStriker',
                display_name: 'NeoStriker',
                email: 'neo@legacyx.gg',
                role: 'jugador',
                is_verified: true,
                name_changed: true
              }
            ]),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                elo: 1120,
                matches_played: 5,
                wins: 3,
                losses: 1,
                draws: 1,
                goals: 7,
                assists: 4,
                saves: 2,
                mvp_count: 1
              }
            ]),
            { status: 200 }
          )
        );

      const profile = await svc.fetchFullProfile('user-abc', 'jwt-token');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [profileUrl] = fetchSpy.mock.calls[0]!;
      expect(String(profileUrl)).toContain('name_changed');
      expect(profile).not.toBeNull();
      expect((profile as any).nameChanged).toBe(true);
      expect(profile?.elo).toBe(1120);
    });
  });

  describe('Item 11: Ranked Match Report Validation (AuthService + Signaling)', () => {
    it('validates active matchToken, bounded non-negative stats, opposing teams, and score/stat arithmetic before RPC', async () => {
      const mod = (await import('../src/auth/AuthService.js')) as any;
      expect(typeof mod.validateRankedMatchReport).toBe('function');
      const validate = mod.validateRankedMatchReport as (
        report: any,
        opts?: { expectedMatchToken?: string | null }
      ) => { valid: boolean; error?: string };

      const validReport = {
        matchToken: 'tok-valid',
        durationSeconds: 180,
        redScore: 2,
        blueScore: 1,
        winner: 'red' as const,
        status: 'COMPLETED' as const,
        participants: [
          { userId: 'u-red-1', team: 'red' as const, goals: 2, assists: 1, saves: 1, isMvp: true },
          { userId: 'u-blue-1', team: 'blue' as const, goals: 1, assists: 0, saves: 3, isMvp: false }
        ]
      };

      expect(validate(validReport, { expectedMatchToken: 'tok-valid' }).valid).toBe(true);

      // Missing or mismatched token
      expect(validate({ ...validReport, matchToken: '' }).valid).toBe(false);
      expect(validate(validReport, { expectedMatchToken: 'other-tok' }).valid).toBe(false);
      expect(validate(validReport, { expectedMatchToken: null }).valid).toBe(false);

      // Negative / non-finite / out-of-bounds numbers
      expect(validate({ ...validReport, durationSeconds: -10 }).valid).toBe(false);
      expect(validate({ ...validReport, durationSeconds: Number.NaN }).valid).toBe(false);
      expect(
        validate({
          ...validReport,
          participants: [
            { userId: 'u-red-1', team: 'red', goals: -1, assists: 0, saves: 0, isMvp: false },
            { userId: 'u-blue-1', team: 'blue', goals: 1, assists: 0, saves: 0, isMvp: false }
          ]
        }).valid
      ).toBe(false);

      // Fewer than 2 opposing teams represented
      expect(
        validate({
          ...validReport,
          blueScore: 0,
          participants: [
            { userId: 'u-red-1', team: 'red', goals: 2, assists: 0, saves: 0, isMvp: true }
          ]
        }).valid
      ).toBe(false);

      // Sum mismatch: red player goals > redScore
      expect(
        validate({
          ...validReport,
          redScore: 1,
          blueScore: 0,
          participants: [
            { userId: 'u-red-1', team: 'red', goals: 3, assists: 0, saves: 0, isMvp: true },
            { userId: 'u-blue-1', team: 'blue', goals: 0, assists: 0, saves: 0, isMvp: false }
          ]
        }).valid
      ).toBe(false);

      // Winner contradicts scores
      expect(validate({ ...validReport, winner: 'blue' }).valid).toBe(false);

      // Assists exceed team score
      expect(
        validate({
          ...validReport,
          redScore: 1,
          blueScore: 0,
          participants: [
            { userId: 'u-red-1', team: 'red', goals: 1, assists: 3, saves: 0, isMvp: true },
            { userId: 'u-blue-1', team: 'blue', goals: 0, assists: 0, saves: 0, isMvp: false }
          ]
        }).valid
      ).toBe(false);
    });

    it('rejects tampered RANKED_MATCH_REPORT on AuthService and SignalingServer without calling Supabase RPC', async () => {
      const svc = new AuthService();
      const token = svc.issueMatchToken({
        roomId: 'R1',
        hostUserId: 'host-1',
        stadiumId: 'mediano',
        participantUserIds: ['u1', 'u2']
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const badSvcRes = await svc.reportRankedMatch({
        matchToken: token,
        hostUserId: 'host-1',
        stadiumId: 'mediano',
        durationSeconds: 180,
        redScore: 1,
        blueScore: 0,
        winner: 'red',
        status: 'COMPLETED',
        participants: [
          { userId: 'u1', team: 'red', goals: 5, assists: 0, saves: 0, isMvp: true },
          { userId: 'u2', team: 'blue', goals: 0, assists: 0, saves: 0, isMvp: false }
        ]
      });

      expect(badSvcRes.success).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      // Signaling test with inactive match token
      const server = await createEphemeralSignaling();
      cleanups.push(() => server.close());

      vi.spyOn((await import('../src/auth/AuthService.js')).authService, 'verifySession').mockResolvedValue({
        id: 'rep-1',
        username: 'RepUser',
        displayName: 'RepUser',
        email: 'rep@legacyx.gg',
        role: 'representante',
        isVerified: true,
        nameChanged: false,
        elo: 1000,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goals: 0,
        assists: 0,
        saves: 0,
        mvpCount: 0
      } as any);

      const host = await connectClient(server.url);
      cleanups.push(() => host.ws.close());

      host.ws.send(
        JSON.stringify({
          type: 'CREATE_ROOM',
          name: 'Ranked Arena',
          stadiumId: 'mediano',
          maxPlayers: 6,
          roomType: 'ranked',
          accessToken: 'rep-jwt'
        })
      );
      const created = await host.waitFor((m) => m.type === 'ROOM_CREATED');

      // Send report WITHOUT RANKED_MATCH_START (no active match token)
      host.ws.send(
        JSON.stringify({
          type: 'RANKED_MATCH_REPORT',
          roomId: created.roomId,
          matchToken: token,
          accessToken: 'rep-jwt',
          stadiumId: 'mediano',
          durationSeconds: 120,
          redScore: 1,
          blueScore: 0,
          winner: 'red',
          participants: [
            { userId: 'u1', team: 'red', goals: 1, assists: 0, saves: 0, isMvp: true },
            { userId: 'u2', team: 'blue', goals: 0, assists: 0, saves: 0, isMvp: false }
          ]
        })
      );

      const result = await host.waitFor((m) => m.type === 'RANKED_MATCH_RESULT');
      expect(result.success).toBe(false);

      // Now execute valid RANKED_MATCH_START -> RANKED_MATCH_REPORT and confirm single consumption (no replay)
      const fetchSpy2 = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, status: 'COMPLETED' }), { status: 200 })
      );
      host.ws.send(
        JSON.stringify({
          type: 'RANKED_MATCH_START',
          roomId: created.roomId,
          stadiumId: 'mediano',
          participantUserIds: ['u1', 'u2'],
          accessToken: 'rep-jwt'
        })
      );
      const started = await host.waitFor((m) => m.type === 'RANKED_MATCH_TOKEN');
      expect(started.matchToken).toBeTruthy();

      const validReportMsg = {
        type: 'RANKED_MATCH_REPORT',
        roomId: created.roomId,
        matchToken: started.matchToken,
        accessToken: 'rep-jwt',
        stadiumId: 'mediano',
        durationSeconds: 120,
        redScore: 2,
        blueScore: 1,
        winner: 'red',
        participants: [
          { userId: 'u1', team: 'red', goals: 2, assists: 0, saves: 1, isMvp: true },
          { userId: 'u2', team: 'blue', goals: 1, assists: 0, saves: 2, isMvp: false }
        ]
      };
      host.ws.send(JSON.stringify(validReportMsg));
      const okRes = await host.waitFor((m) => m.type === 'RANKED_MATCH_RESULT');
      expect(okRes.success).toBe(true);
      expect(fetchSpy2).toHaveBeenCalledTimes(1);

      // Replay of the exact same matchToken must be rejected without calling RPC again
      host.ws.send(JSON.stringify(validReportMsg));
      const replayRes = await host.waitFor((m) => m.type === 'RANKED_MATCH_RESULT');
      expect(replayRes.success).toBe(false);
      expect(fetchSpy2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Item 28: Real Online Player Count Deduplication', () => {
    it('deduplicates OPEN sockets sharing the same userId or clientSessionId while counting distinct users/guests accurately', async () => {
      const server = await createEphemeralSignaling();
      cleanups.push(() => server.close());

      const c1 = await connectClient(server.url);
      const c2 = await connectClient(server.url);
      cleanups.push(() => c1.ws.close(), () => c2.ws.close());

      // Two anonymous guests without identity -> 2
      expect(server.getRealOnlineCount()).toBe(2);

      // Both identify as the same registered userId -> 1
      c1.drain();
      c1.ws.send(JSON.stringify({ type: 'IDENTIFY', userId: 'user-1', clientSessionId: 'tab-a' }));
      await c1.waitFor((m) => m.type === 'room_list');
      c2.drain();
      c2.ws.send(JSON.stringify({ type: 'JOIN_LOBBY', userId: 'user-1', clientSessionId: 'tab-b' }));
      const listMsg = await c2.waitFor((m) => m.type === 'room_list' && m.onlineCount === 1);

      expect(listMsg.onlineCount).toBe(1);
      expect(server.getRealOnlineCount()).toBe(1);

      // A third connection with a different user -> 2; two more sharing guest clientSessionId -> 3
      const c3 = await connectClient(server.url);
      const c4 = await connectClient(server.url);
      const c5 = await connectClient(server.url);
      cleanups.push(() => c3.ws.close(), () => c4.ws.close(), () => c5.ws.close());

      c3.ws.send(JSON.stringify({ type: 'CREATE_ROOM', name: 'Test', stadiumId: 'mediano', maxPlayers: 6, userId: 'user-2' }));
      await c3.waitFor((m) => m.type === 'ROOM_CREATED');
      c4.drain();
      c4.ws.send(JSON.stringify({ type: 'IDENTIFY', clientSessionId: 'guest-tab-99' }));
      await c4.waitFor((m) => m.type === 'room_list');
      c5.drain();
      c5.ws.send(JSON.stringify({ type: 'JOIN_LOBBY', clientSessionId: 'guest-tab-99' }));
      const list5 = await c5.waitFor((m) => m.type === 'room_list' && m.onlineCount === 3);

      expect(list5.onlineCount).toBe(3);

      // Closing one of user-1's tabs keeps user-1 online (still 3)
      await new Promise<void>((resolve) => {
        c1.ws.once('close', () => resolve());
        c1.ws.close();
      });
      await new Promise((r) => setTimeout(r, 30));
      expect(server.getRealOnlineCount()).toBe(3);

      // Closing the second user-1 tab drops count to 2
      c3.drain();
      await new Promise<void>((resolve) => {
        c2.ws.once('close', () => resolve());
        c2.ws.close();
      });
      await c3.waitFor((m) => m.type === 'room_list' && m.onlineCount === 2);
      expect(server.getRealOnlineCount()).toBe(2);

      // Clearing userId on IDENTIFY stops deduplicating as that userId
      c4.drain();
      c4.ws.send(JSON.stringify({ type: 'IDENTIFY', userId: 'user-3', clientSessionId: 'guest-tab-99' }));
      await c4.waitFor((m) => m.type === 'room_list' && m.onlineCount === 3);
      expect(server.getRealOnlineCount()).toBe(3);

      c4.drain();
      c4.ws.send(JSON.stringify({ type: 'IDENTIFY', userId: null, clientSessionId: 'guest-tab-99' }));
      await c4.waitFor((m) => m.type === 'room_list' && m.onlineCount === 2);
      expect(server.getRealOnlineCount()).toBe(2);
    });
  });

  describe('Item 15 & Item 3-server: Real Room Hover Ping Probe & DedicatedHost', () => {
    it('relays ROOM_PING_PROBE -> PING_PROBE -> PONG_PROBE -> ROOM_PING_RESULT using real elapsed ms, and handles unreachable host timeout', async () => {
      const server = await createEphemeralSignaling({ pingProbeTimeoutMs: 120 });
      cleanups.push(() => server.close());

      const host = await connectClient(server.url);
      const guest = await connectClient(server.url);
      const imposter = await connectClient(server.url);
      cleanups.push(() => host.ws.close(), () => guest.ws.close(), () => imposter.ws.close());

      host.ws.send(
        JSON.stringify({
          type: 'CREATE_ROOM',
          name: 'Real Ping Arena',
          stadiumId: 'mediano',
          maxPlayers: 8
        })
      );
      const created = await host.waitFor((m) => m.type === 'ROOM_CREATED');
      const roomId = created.roomId as string;

      const sentAt = Date.now() - 47;
      guest.ws.send(
        JSON.stringify({
          type: 'ROOM_PING_PROBE',
          roomId,
          clientSentAt: sentAt,
          probeId: 'probe-47'
        })
      );

      const pingProbe = await host.waitFor((m) => m.type === 'PING_PROBE');
      expect(pingProbe.roomId).toBe(roomId);
      expect(pingProbe.requesterId).toBe(guest.peerId);
      expect(pingProbe.clientSentAt).toBe(sentAt);
      expect(pingProbe.probeId).toBe('probe-47');

      // Imposter cannot spoof PONG_PROBE for a room it does not own
      imposter.ws.send(
        JSON.stringify({
          type: 'PONG_PROBE',
          roomId,
          requesterId: guest.peerId,
          clientSentAt: sentAt,
          probeId: 'probe-47'
        })
      );

      // Real host responds
      host.ws.send(
        JSON.stringify({
          type: 'PONG_PROBE',
          roomId,
          requesterId: pingProbe.requesterId,
          clientSentAt: pingProbe.clientSentAt,
          probeId: pingProbe.probeId
        })
      );

      const probeResult = await guest.waitFor(
        (m) => m.type === 'ROOM_PING_RESULT' && m.probeId === 'probe-47'
      );
      expect(probeResult.roomId).toBe(roomId);
      expect(probeResult.clientSentAt).toBe(sentAt);
      expect(probeResult.pingMs).toBeGreaterThanOrEqual(47);
      expect(probeResult.pingMs).toBeLessThan(1500);

      // Silent/unresponsive host triggers timeout fallback instead of hanging
      guest.ws.send(
        JSON.stringify({
          type: 'ROOM_PING_PROBE',
          roomId,
          clientSentAt: Date.now(),
          probeId: 'probe-timeout'
        })
      );
      const timeoutResult = await guest.waitFor(
        (m) => m.type === 'ROOM_PING_RESULT' && m.probeId === 'probe-timeout',
        1000
      );
      expect(timeoutResult.roomId).toBe(roomId);
      expect(timeoutResult.timedOut).toBe(true);

      // Co-located dedicated room without active host WS falls back to measured client WS RTT
      const coLocatedRoom = registry.createRoom('colocated-host-peer', {
        name: 'CoLocated Dedicated',
        stadiumId: 'mediano',
        maxPlayers: 6,
        isDedicated: true
      });
      guest.ws.send(JSON.stringify({ type: 'REPORT_PING', pingMs: 19 }));
      guest.ws.send(
        JSON.stringify({
          type: 'ROOM_PING_PROBE',
          roomId: coLocatedRoom.id,
          clientSentAt: Date.now(),
          probeId: 'colocated-probe'
        })
      );
      const colocatedRes = await guest.waitFor(
        (m) => m.type === 'ROOM_PING_RESULT' && m.probeId === 'colocated-probe'
      );
      expect(colocatedRes.roomId).toBe(coLocatedRoom.id);
      expect(colocatedRes.pingMs).toBe(19);
      registry.removeRoom(coLocatedRoom.id);
    });

    it('DedicatedHost answers PING_PROBE over WS, uses staminaRegenMoving:false / rate:25 defaults, and forwards goal/score fields', async () => {
      const server = await createEphemeralSignaling();
      cleanups.push(() => server.close());

      const dedicated = new DedicatedHost({
        signalingUrl: server.url,
        roomName: 'Dedicated Probe Test',
        stadiumId: 'mediano'
      });
      cleanups.push(() => dedicated.stop());

      // Item 3-server defaults
      expect((dedicated.config.modifiers as any).staminaRegenMoving).toBe(false);
      expect((dedicated.config.modifiers as any).staminaRegenMovingRate).toBe(25);
      expect((dedicated.engine.modifiers as any).staminaRegenMoving).toBe(false);
      expect((dedicated.engine.modifiers as any).staminaRegenMovingRate).toBe(25);

      await dedicated.start();
      await vi.waitFor(() => {
        expect(dedicated.roomId).toBeTruthy();
      });

      const guest = await connectClient(server.url);
      cleanups.push(() => guest.ws.close());

      const sentAt = Date.now() - 35;
      guest.ws.send(
        JSON.stringify({
          type: 'ROOM_PING_PROBE',
          roomId: dedicated.roomId,
          clientSentAt: sentAt,
          probeId: 'ded-probe-1'
        })
      );

      const res = await guest.waitFor(
        (m) => m.type === 'ROOM_PING_RESULT' && m.probeId === 'ded-probe-1'
      );
      expect(res.roomId).toBe(dedicated.roomId);
      expect(res.pingMs).toBeGreaterThanOrEqual(35);

      // Verify goal banner & score_event forwarding
      const goalBanners: any[] = [];
      const scoreEvents: any[] = [];
      (dedicated as any).onGoalBanner = (b: any) => goalBanners.push(b);
      (dedicated as any).onScoreEvent = (e: any) => scoreEvents.push(e);

      const p1 = dedicated.registerPlayer('p-red');
      dedicated.engine.playerNames.set(p1.id, 'Striker');
      (dedicated.engine as any).emit('score_event', {
        playerId: String(p1.id),
        playerName: 'Striker',
        team: 'red',
        text: 'Gol +100',
        points: 100,
        x: 0,
        y: 0,
        category: 'goal'
      });
      (dedicated.engine as any).emit('goal', {
        scoringTeam: 'red',
        redScore: 1,
        blueScore: 0,
        scorerName: 'Striker',
        assisterName: null,
        isOwnGoal: false,
        speedKmh: 112,
        isPower: true,
        isCurve: true
      });

      expect(scoreEvents).toHaveLength(1);
      expect(scoreEvents[0].playerName).toBe('Striker');
      expect(scoreEvents[0].team).toBe('red');

      expect(goalBanners).toHaveLength(1);
      expect(goalBanners[0].speedKmh).toBe(112);
      expect(goalBanners[0].isPower).toBe(true);
      expect(goalBanners[0].isCurve).toBe(true);
    });
  });
});
