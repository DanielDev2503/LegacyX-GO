import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SignalingClient } from '../../src/net/SignalingClient.js';
import { NetworkHost } from '../../src/net/NetworkHost.js';
import { NetworkClient } from '../../src/net/NetworkClient.js';
import { GameApp } from '../../src/net/GameApp.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

const CLIENT_SRC_DIR = resolve(process.cwd(), 'src');

function readClientFile(relPath: string): string {
  return readFileSync(resolve(CLIENT_SRC_DIR, relPath), 'utf8');
}

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readonly url: string;
  public readyState: number = MockWebSocket.CONNECTING;
  public sentMessages: Array<Record<string, any>> = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public send(data: string): void {
    this.sentMessages.push(JSON.parse(data));
  }

  public close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  public simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  public simulateMessage(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

interface MockDataChannel {
  label: string;
  ordered?: boolean;
  maxRetransmits?: number;
  readyState: 'connecting' | 'open' | 'closed';
  binaryType: string;
  sent: Array<string | Uint8Array>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
}

function createMockDataChannel(label: string, init?: { ordered?: boolean; maxRetransmits?: number }): MockDataChannel {
  const ch: MockDataChannel = {
    label,
    ordered: init?.ordered,
    maxRetransmits: init?.maxRetransmits,
    readyState: 'connecting',
    binaryType: 'arraybuffer',
    sent: [],
    send: vi.fn((data: any) => {
      ch.sent.push(data);
    }),
    close: vi.fn(() => {
      ch.readyState = 'closed';
    }),
    onopen: null,
    onclose: null,
    onmessage: null
  };
  return ch;
}

describe('Hover Ping Parity, Ephemeral RTC Probe & Host/Guest Telemetry', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalRTC = (globalThis as any).RTCPeerConnection;
  const originalSessionDesc = (globalThis as any).RTCSessionDescription;
  const originalIceCandidate = (globalThis as any).RTCIceCandidate;
  let mockPcList: any[] = [];

  beforeEach(() => {
    MockWebSocket.instances = [];
    mockPcList = [];
    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).RTCSessionDescription = function MockRTCSessionDescription(desc: any) {
      return desc;
    };
    (globalThis as any).RTCIceCandidate = function MockRTCIceCandidate(cand: any) {
      return cand;
    };
    (globalThis as any).RTCPeerConnection = function MockRTCPeerConnection() {
      const channels: Record<string, MockDataChannel> = {};
      const pc: any = {
        channels,
        remoteDescription: null,
        localDescription: null,
        iceConnectionState: 'new',
        connectionState: 'new',
        createDataChannel: vi.fn((label: string, opts?: any) => {
          const dc = createMockDataChannel(label, opts);
          channels[label] = dc;
          return dc;
        }),
        createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'mock-offer-sdp' })),
        createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'mock-answer-sdp' })),
        setLocalDescription: vi.fn(async (desc: any) => {
          pc.localDescription = desc;
        }),
        setRemoteDescription: vi.fn(async (desc: any) => {
          pc.remoteDescription = desc;
        }),
        addIceCandidate: vi.fn(async () => {}),
        close: vi.fn(() => {
          pc.connectionState = 'closed';
          Object.values(channels).forEach((ch) => {
            ch.readyState = 'closed';
          });
        }),
        onicecandidate: null,
        oniceconnectionstatechange: null,
        onconnectionstatechange: null,
        ondatachannel: null,
        simulateIncomingDataChannel(label: string) {
          const dc = createMockDataChannel(label);
          channels[label] = dc;
          pc.ondatachannel?.({ channel: dc });
          return dc;
        }
      };
      mockPcList.push(pc);
      return pc;
    };

    gameUI.rooms = [];
    gameUI.availableRooms = [];
    gameUI.rosterPlayers = [];
    gameUI.pingMs = 0;
    gameUI.fps = 60;
    gameUI.realPing = 42;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (globalThis as any).WebSocket = originalWebSocket;
    (globalThis as any).RTCPeerConnection = originalRTC;
    (globalThis as any).RTCSessionDescription = originalSessionDesc;
    (globalThis as any).RTCIceCandidate = originalIceCandidate;
  });

  async function connectMockClient(url: string, peerId: string): Promise<{
    client: SignalingClient;
    ws: MockWebSocket;
  }> {
    const client = new SignalingClient(url, false);
    const connectPromise = client.ensureConnected();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: 'WELCOME', peerId, iceServers: [] });
    await connectPromise;
    return { client, ws };
  }

  it('NetworkHost handles RTC_PING_SIGNAL on isolated probePeers (max 8, 4s TTL, cleaned on destroy) without joining players, bans blocked, and echoes PONG_PROBE on unreliable DC', async () => {
    vi.useFakeTimers();
    const { client: hostSignaling, ws: hostWs } = await connectMockClient('ws://localhost:8080', 'host-peer');
    const host = new NetworkHost(hostSignaling, 'room-rtc', 'mediano', {
      nickname: 'Anfitrion',
      peerId: 'host-peer'
    });

    const onJoined = vi.fn();
    host.onPlayerJoined = onJoined;

    expect(host.getPlayers()).toHaveLength(1);
    expect(host.getPlayers()[0]!.ping).toBe(0);

    // 1. Incoming RTC_PING_SIGNAL offer from hovering guest
    hostWs.simulateMessage({
      type: 'RTC_PING_SIGNAL',
      roomId: 'room-rtc',
      probeId: 'probe-hover-1',
      fromPeerId: 'hover-guest-1',
      data: { type: 'offer', sdp: 'guest-offer' }
    });

    await vi.waitFor(() => {
      const answerMsg = hostWs.sentMessages.find(
        (m) => m.type === 'RTC_PING_SIGNAL' && m.probeId === 'probe-hover-1'
      );
      expect(answerMsg).toBeDefined();
    });

    const answerMsg = hostWs.sentMessages.find(
      (m) => m.type === 'RTC_PING_SIGNAL' && m.probeId === 'probe-hover-1'
    )!;
    expect(answerMsg.targetPeerId).toBe('hover-guest-1');
    expect(answerMsg.roomId).toBe('room-rtc');
    expect(answerMsg.data?.type).toBe('answer');

    // Must NOT pollute game room peers, roster, or system join notices
    expect(onJoined).not.toHaveBeenCalled();
    expect(host.getPlayers()).toHaveLength(1);
    const probePc = mockPcList[0]!;
    const probeGameDc = probePc.simulateIncomingDataChannel('game');
    probeGameDc.readyState = 'open';
    probeGameDc.onopen?.();
    probeGameDc.onmessage?.({ data: JSON.stringify({ type: 'PING_PROBE', t: 1234.5 }) });

    expect(probeGameDc.send).toHaveBeenCalledTimes(1);
    const pongPayload = JSON.parse(String(probeGameDc.sent[0]));
    expect(pongPayload).toEqual({ type: 'PONG_PROBE', t: 1234.5 });

    // 2. Bound probePeers to max 8
    for (let i = 2; i <= 10; i++) {
      hostWs.simulateMessage({
        type: 'RTC_PING_SIGNAL',
        roomId: 'room-rtc',
        probeId: `probe-${i}`,
        fromPeerId: `hover-guest-${i}`,
        data: { type: 'offer', sdp: `offer-${i}` }
      });
    }
    await vi.waitFor(() => {
      expect(hostWs.sentMessages.filter((m) => m.type === 'RTC_PING_SIGNAL').length).toBeGreaterThanOrEqual(9);
    });
    expect((host as any).probePeers.size).toBeLessThanOrEqual(8);

    // 3. Banned peer is rejected from creating a probe peer
    const testPlayer = { id: 2, peerId: 'banned-peer', nickname: 'Bad', isHost: false, isAdmin: false, team: 'spectator' as const, joinIndex: 2 };
    (host as any).players.set(2, testPlayer);
    host.kickPlayer(2, true, true);
    const pcCountBeforeBan = mockPcList.length;
    hostWs.simulateMessage({
      type: 'RTC_PING_SIGNAL',
      roomId: 'room-rtc',
      probeId: 'probe-banned',
      fromPeerId: 'banned-peer',
      data: { type: 'offer', sdp: 'banned-offer' }
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(mockPcList.length).toBe(pcCountBeforeBan);

    // 4. TTL 4s cleanup evicts expired probe peers
    await vi.advanceTimersByTimeAsync(4100);
    expect((host as any).probePeers.size).toBe(0);

    // 5. destroy() cleans up active probe peers too
    hostWs.simulateMessage({
      type: 'RTC_PING_SIGNAL',
      roomId: 'room-rtc',
      probeId: 'probe-destroy',
      fromPeerId: 'hover-guest-destroy',
      data: { type: 'offer', sdp: 'offer-destroy' }
    });
    await vi.advanceTimersByTimeAsync(10);
    expect((host as any).probePeers.size).toBe(1);
    host.destroy();
    expect((host as any).probePeers.size).toBe(0);
  });

  it('SignalingClient.probeRoomPing resolves via ephemeral WebRTC probe first, deduplicates in-flight, caches for 8s, and closes probe peer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T20:00:00Z'));

    let perfNow = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => perfNow);

    const { client, ws } = await connectMockClient('ws://localhost:8080', 'guest-hover');
    const pingUpdates: Array<{ roomId: string; ms: number }> = [];
    client.onRoomPingResult = (roomId, ms) => pingUpdates.push({ roomId, ms });

    // Kick off two concurrent hover probes -> should dedup into 1
    const p1 = client.probeRoomPing('room-p2p');
    const p2 = client.probeRoomPing('room-p2p');

    await vi.advanceTimersByTimeAsync(5);

    const rtcSignals = ws.sentMessages.filter((m) => m.type === 'RTC_PING_SIGNAL');
    const wsProbes = ws.sentMessages.filter((m) => m.type === 'ROOM_PING_PROBE');
    expect(rtcSignals).toHaveLength(1);
    expect(wsProbes).toHaveLength(1);

    const probeId = rtcSignals[0]!.probeId as string;
    const probePc = mockPcList[0]!;
    expect(probePc.channels['game']).toBeDefined();
    expect(probePc.channels['game']!.ordered).toBe(false);
    expect(probePc.channels['game']!.maxRetransmits).toBe(0);

    // Complete SDP handshake & open unreliable channel
    ws.simulateMessage({
      type: 'RTC_PING_SIGNAL',
      roomId: 'room-p2p',
      probeId,
      fromPeerId: 'host-1',
      targetPeerId: 'guest-hover',
      data: { type: 'answer', sdp: 'host-answer' }
    });
    await vi.advanceTimersByTimeAsync(5);

    const unreliableDc = probePc.channels['game']!;
    unreliableDc.readyState = 'open';
    unreliableDc.onopen?.();

    expect(unreliableDc.sent.length).toBeGreaterThanOrEqual(1);
    const probePacket1 = JSON.parse(String(unreliableDc.sent[0]));
    expect(probePacket1.type).toBe('PING_PROBE');

    // Advance monotonic clock by 22 ms and send PONG_PROBE back
    perfNow += 22;
    unreliableDc.onmessage?.({
      data: JSON.stringify({ type: 'PONG_PROBE', t: probePacket1.t })
    });
    // If client sends a 2nd verification packet, answer it with 24 ms too
    if (unreliableDc.sent.length > 1) {
      const probePacket2 = JSON.parse(String(unreliableDc.sent[1]));
      perfNow += 2;
      unreliableDc.onmessage?.({
        data: JSON.stringify({ type: 'PONG_PROBE', t: probePacket2.t })
      });
    }

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(r1).toBeGreaterThanOrEqual(22);
    expect(r1).toBeLessThanOrEqual(30);
    expect(probePc.close).toHaveBeenCalled();
    expect(pingUpdates.some((u) => u.roomId === 'room-p2p' && u.ms === r1)).toBe(true);

    // Within 8_000 ms cache window -> returns cached value with zero new signaling messages
    const sentCountAfterFirst = ws.sentMessages.length;
    perfNow += 2000;
    await vi.advanceTimersByTimeAsync(2000);
    const cached = await client.probeRoomPing('room-p2p');
    expect(cached).toBe(r1);
    expect(ws.sentMessages.length).toBe(sentCountAfterFirst);

    // Past 8_000 ms cache expiry -> issues a fresh probe
    perfNow += 6500;
    await vi.advanceTimersByTimeAsync(6500);
    const p3 = client.probeRoomPing('room-p2p');
    await vi.advanceTimersByTimeAsync(5);
    expect(ws.sentMessages.length).toBeGreaterThan(sentCountAfterFirst);

    // Clean up pending probe by simulating WS fallback result
    const freshWsProbe = ws.sentMessages.filter((m) => m.type === 'ROOM_PING_PROBE').pop()!;
    perfNow += 48;
    ws.simulateMessage({
      type: 'ROOM_PING_RESULT',
      roomId: 'room-p2p',
      probeId: freshWsProbe.probeId,
      clientSentAt: freshWsProbe.clientSentAt,
      hostRelayMs: 12
    });
    // Advance past 1.5s WebRTC timeout if WS fallback waits for RTC timeout, OR WS falls back cleanly
    await vi.advanceTimersByTimeAsync(1600);
    const r3 = await p3;
    expect(r3).toBe(48);
  });

  it('SignalingClient WS fallback uses local monotonic performance.now() even when Date.now() is skewed by minutes', async () => {
    vi.useFakeTimers();
    let perfNow = 5000;
    vi.spyOn(performance, 'now').mockImplementation(() => perfNow);
    // Simulate severe client wall-clock offset
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    // Disable RTCPeerConnection to force WS fallback directly
    (globalThis as any).RTCPeerConnection = undefined;

    const { client, ws } = await connectMockClient('ws://localhost:8080', 'guest-skew');
    const probePromise = client.probeRoomPing('room-ws');

    const sentProbe = ws.sentMessages.find((m) => m.type === 'ROOM_PING_PROBE')!;
    expect(sentProbe).toBeDefined();

    // Advance 33ms on monotonic performance.now()
    perfNow += 33;
    // Server omits pingMs (clock-skew-free P2P WS relay contract)
    ws.simulateMessage({
      type: 'ROOM_PING_RESULT',
      roomId: 'room-ws',
      probeId: sentProbe.probeId,
      clientSentAt: sentProbe.clientSentAt,
      hostRelayMs: 9
    });

    const measured = await probePromise;
    expect(measured).toBe(33);
  });

  it('Host reports 0 ms telemetry and NetworkClient sends an immediate PING_PROBE upon DataChannel open', async () => {
    const { client: hostSignaling } = await connectMockClient('ws://localhost:8080', 'host-zero');
    const app = new GameApp(hostSignaling);
    gameUI.realPing = 68;

    const host = new NetworkHost(hostSignaling, 'room-host-0', 'mediano', {
      nickname: 'HostZero',
      peerId: 'host-zero'
    });
    (app as any).setupHostState(host, 'room-host-0', 'Sala Cero', 'mediano', 6);

    expect(gameUI.pingMs).toBe(0);
    expect(gameUI.activeRoom?.ping).toBe(0);
    expect(gameUI.rosterPlayers[0]?.ping).toBe(0);

    // Guest client sends PING_PROBE immediately on startPingProbe without waiting 1000ms
    const { client: guestSignaling } = await connectMockClient('ws://localhost:8080', 'guest-dc');
    const netClient = new NetworkClient(guestSignaling, 'host-zero');
    const sentUnreliable: any[] = [];
    (netClient as any).peer = {
      sendUnreliableMessage: vi.fn((msg: any) => sentUnreliable.push(msg)),
      sendReliableMessage: vi.fn(),
      close: vi.fn()
    };

    netClient.startPingProbe();
    expect(sentUnreliable.length).toBe(1);
    expect(sentUnreliable[0]!.type).toBe('PING_PROBE');
    expect(typeof sentUnreliable[0]!.t).toBe('number');
    netClient.stopPingProbe();
  });

  it('Lobby.svelte binds hover and focus probes cleanly while preserving Mediendo... text', () => {
    const lobbySrc = readClientFile('ui/screens/Lobby.svelte');
    expect(lobbySrc).toContain('sharedSignaling.probeRoomPing');
    expect(lobbySrc).not.toContain('estimateRoomPing');
    expect(lobbySrc).toContain('onmouseenter={() => handleRoomHover(');
    expect(lobbySrc).toContain('onfocus={() => handleRoomHover(');
    expect(lobbySrc).toContain("room.ping > 0 ? `${room.ping} ms` : 'Midiendo...'");
  });
});
