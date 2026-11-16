import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkHost } from '../../src/net/NetworkHost.js';
import { SignalingClient } from '../../src/net/SignalingClient.js';

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readyState = MockWebSocket.CONNECTING;
  public sentMessages: Array<Record<string, any>> = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(public readonly url: string) {
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

interface MockChannel {
  label: string;
  readyState: 'connecting' | 'open' | 'closed';
  binaryType: string;
  bufferedAmount: number;
  sent: Array<string | ArrayBuffer>;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
}

function createMockChannel(label: string): MockChannel {
  const ch: MockChannel = {
    label,
    readyState: 'connecting',
    binaryType: 'arraybuffer',
    bufferedAmount: 0,
    sent: [],
    send: vi.fn((data: any) => ch.sent.push(data)),
    close: vi.fn(() => {
      ch.readyState = 'closed';
    }),
    onopen: null,
    onclose: null,
    onmessage: null
  };
  return ch;
}

function parseReliableSent(pc: any): Array<Record<string, any>> {
  return (pc.channels.reliable.sent as string[]).map((raw) => JSON.parse(raw));
}

function sendReliableFromPeer(pc: any, msg: Record<string, unknown>): void {
  pc.channels.reliable.onmessage?.({ data: JSON.stringify(msg) });
}

describe('NetworkHost Chat Cooldown & Emote Guardrails', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalRTC = (globalThis as any).RTCPeerConnection;
  const originalSessionDesc = (globalThis as any).RTCSessionDescription;
  const originalIceCandidate = (globalThis as any).RTCIceCandidate;

  let mockPcList: any[] = [];
  let nowMs = 10_000;
  let activeHost: NetworkHost | null = null;

  beforeEach(() => {
    MockWebSocket.instances = [];
    mockPcList = [];
    nowMs = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).RTCSessionDescription = function (d: any) {
      return d;
    };
    (globalThis as any).RTCIceCandidate = function (c: any) {
      return c;
    };
    (globalThis as any).RTCPeerConnection = function () {
      const channels: Record<string, MockChannel> = {};
      const pc: any = {
        channels,
        remoteDescription: null,
        localDescription: null,
        iceConnectionState: 'new',
        connectionState: 'new',
        signalingState: 'stable',
        createDataChannel: vi.fn((label: string) => {
          const dc = createMockChannel(label);
          channels[label] = dc;
          return dc;
        }),
        createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'mock-offer' })),
        createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'mock-answer' })),
        setLocalDescription: vi.fn(async (d: any) => {
          pc.localDescription = d;
        }),
        setRemoteDescription: vi.fn(async (d: any) => {
          pc.remoteDescription = d;
        }),
        addIceCandidate: vi.fn(async () => {}),
        close: vi.fn(() => {
          pc.connectionState = 'closed';
        }),
        onicecandidate: null,
        oniceconnectionstatechange: null,
        onconnectionstatechange: null,
        ondatachannel: null
      };
      mockPcList.push(pc);
      return pc;
    };
  });

  afterEach(() => {
    activeHost?.destroy();
    activeHost = null;
    vi.restoreAllMocks();
    (globalThis as any).WebSocket = originalWebSocket;
    (globalThis as any).RTCPeerConnection = originalRTC;
    (globalThis as any).RTCSessionDescription = originalSessionDesc;
    (globalThis as any).RTCIceCandidate = originalIceCandidate;
  });

  async function createHostWithPeers(
    specs: Array<{
      peerId: string;
      nickname: string;
      team: 'red' | 'blue' | 'spectator';
      isGuest?: boolean;
      userId?: string;
    }>
  ) {
    const sig = new SignalingClient('ws://localhost:8080', false);
    const connectPromise = sig.ensureConnected();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
    ws.simulateOpen();
    ws.simulateMessage({ type: 'WELCOME', peerId: 'host-1', iceServers: [] });
    await connectPromise;

    const host = new NetworkHost(sig, 'Anfitrion', { peerId: 'host-1', isGuest: false });
    activeHost = host;

    const connected: Array<{ peerId: string; playerId: number; pc: any }> = [];

    for (const spec of specs) {
      const expectedCount = mockPcList.length + 1;
      ws.simulateMessage({ type: 'PEER_JOINED', peerId: spec.peerId, nickname: spec.nickname });
      await vi.waitFor(() => expect(mockPcList.length).toBe(expectedCount));

      const pc = mockPcList[mockPcList.length - 1]!;
      pc.channels.game.readyState = 'open';
      pc.channels.reliable.readyState = 'open';
      pc.iceConnectionState = 'connected';
      pc.oniceconnectionstatechange?.();

      const player = host.getPlayers().find((p) => p.peerId === spec.peerId)!;
      sendReliableFromPeer(pc, {
        type: 'CLIENT_HELLO',
        name: spec.nickname,
        isGuest: spec.isGuest,
        userId: spec.userId
      });
      host.setPlayerTeam(player.id, spec.team);
      connected.push({ peerId: spec.peerId, playerId: player.id, pc });
    }

    for (const entry of connected) {
      entry.pc.channels.reliable.sent = [];
    }

    return { host, connected };
  }

  it('enforces 1450ms rate limit on CHAT_MSG (rejects at +1400ms, accepts at +1450ms+)', async () => {
    const { host, connected } = await createHostWithPeers([
      { peerId: 'peer-red', nickname: 'Striker', team: 'red', isGuest: false, userId: 'u-2' },
      { peerId: 'peer-obs', nickname: 'Observer', team: 'blue', isGuest: false, userId: 'u-3' }
    ]);
    const [sender, observer] = connected;
    const chatSpy = vi.fn();
    host.onChatMessage = chatSpy;

    // Initial message at t = 10_000 -> accepted
    sendReliableFromPeer(sender.pc, { type: 'CHAT_MSG', text: 'Primer mensaje' });
    expect(chatSpy).toHaveBeenCalledTimes(1);
    expect(chatSpy).toHaveBeenLastCalledWith('Striker', 'Primer mensaje', 'red', expect.any(String));

    // +1400ms (11_400) -> rejected by 1450ms server anti-spam window
    nowMs = 11_400;
    sendReliableFromPeer(sender.pc, { type: 'CHAT_MSG', text: 'Spam bloqueado' });
    expect(chatSpy).toHaveBeenCalledTimes(1);

    // +1450ms (11_450) -> accepted
    nowMs = 11_450;
    sendReliableFromPeer(sender.pc, { type: 'CHAT_MSG', text: 'Segundo mensaje' });
    expect(chatSpy).toHaveBeenCalledTimes(2);
    expect(chatSpy).toHaveBeenLastCalledWith('Striker', 'Segundo mensaje', 'red', expect.any(String));

    const observerChats = parseReliableSent(observer.pc).filter((m) => m.type === 'CHAT');
    expect(observerChats.map((m) => m.text)).toEqual(['Primer mensaje', 'Segundo mensaje']);
  });

  it('rejects EMOTE from guests (isGuest: true or inv_* nickname) and spectators', async () => {
    const { host, connected } = await createHostWithPeers([
      { peerId: 'peer-guest-flag', nickname: 'GuestFlagged', team: 'red', isGuest: true },
      { peerId: 'peer-guest-nick', nickname: 'inv_visitante', team: 'blue', isGuest: false },
      { peerId: 'peer-guest-upper', nickname: 'INV_Mayus', team: 'red' },
      { peerId: 'peer-spec', nickname: 'AuthSpectator', team: 'spectator', isGuest: false, userId: 'u-spec' },
      { peerId: 'peer-obs', nickname: 'AuthBlue', team: 'blue', isGuest: false, userId: 'u-blue' }
    ]);

    const emoteSpy = vi.fn();
    host.onPlayerEmote = emoteSpy;

    const [guestFlagged, guestNick, guestUpper, spectator, observer] = connected;

    sendReliableFromPeer(guestFlagged.pc, { type: 'EMOTE', emoji: '🔥' });
    sendReliableFromPeer(guestNick.pc, { type: 'EMOTE', emoji: '⚽' });
    sendReliableFromPeer(guestUpper.pc, { type: 'EMOTE', emoji: '👑' });
    sendReliableFromPeer(spectator.pc, { type: 'EMOTE', emoji: '👏' });

    expect(emoteSpy).not.toHaveBeenCalled();

    for (const entry of connected) {
      const emotes = parseReliableSent(entry.pc).filter((m) => m.type === 'EMOTE');
      expect(emotes).toEqual([]);
    }

    // Empty/whitespace emoji from an authenticated active player is also ignored without consuming cooldown
    sendReliableFromPeer(observer.pc, { type: 'EMOTE', emoji: '   ' });
    expect(emoteSpy).not.toHaveBeenCalled();
    sendReliableFromPeer(observer.pc, { type: 'EMOTE', emoji: '🔥' });
    expect(emoteSpy).toHaveBeenCalledTimes(1);
    expect(emoteSpy).toHaveBeenCalledWith(observer.playerId, '🔥');
  });

  it('accepts EMOTE for authenticated red/blue players and shares the 1450ms cooldown with chat messages', async () => {
    const { host, connected } = await createHostWithPeers([
      { peerId: 'peer-red', nickname: 'AuthRed', team: 'red', isGuest: false, userId: 'u-red' },
      { peerId: 'peer-blue', nickname: 'AuthBlue', team: 'blue', userId: 'u-blue' }
    ]);

    const [redPeer, bluePeer] = connected;
    const emoteSpy = vi.fn();
    const chatSpy = vi.fn();
    host.onPlayerEmote = emoteSpy;
    host.onChatMessage = chatSpy;

    // Red emits EMOTE at t = 10_000 -> accepted
    sendReliableFromPeer(redPeer.pc, { type: 'EMOTE', emoji: '🔥' });
    expect(emoteSpy).toHaveBeenCalledTimes(1);
    expect(emoteSpy).toHaveBeenLastCalledWith(redPeer.playerId, '🔥');

    // Blue has an independent cooldown and can emote right away at t = 10_100
    nowMs = 10_100;
    sendReliableFromPeer(bluePeer.pc, { type: 'EMOTE', emoji: '⚽' });
    expect(emoteSpy).toHaveBeenCalledTimes(2);
    expect(emoteSpy).toHaveBeenLastCalledWith(bluePeer.playerId, '⚽');

    // Red tries CHAT_MSG at +1400ms after its EMOTE (t = 11_400) -> blocked by shared cooldown
    nowMs = 11_400;
    sendReliableFromPeer(redPeer.pc, { type: 'CHAT_MSG', text: 'Bloqueado tras emote' });
    expect(chatSpy).not.toHaveBeenCalled();

    // Red sends CHAT_MSG at +1450ms (t = 11_450) -> accepted
    nowMs = 11_450;
    sendReliableFromPeer(redPeer.pc, { type: 'CHAT_MSG', text: 'Chat permitido' });
    expect(chatSpy).toHaveBeenCalledTimes(1);

    // Red tries EMOTE at +1400ms after its CHAT_MSG (t = 12_850) -> blocked by shared cooldown
    nowMs = 12_850;
    sendReliableFromPeer(redPeer.pc, { type: 'EMOTE', emoji: '👑' });
    expect(emoteSpy).toHaveBeenCalledTimes(2);

    // Red sends EMOTE at +1450ms after its CHAT_MSG (t = 12_900) -> accepted
    nowMs = 12_900;
    sendReliableFromPeer(redPeer.pc, { type: 'EMOTE', emoji: '👑' });
    expect(emoteSpy).toHaveBeenCalledTimes(3);
    expect(emoteSpy).toHaveBeenLastCalledWith(redPeer.playerId, '👑');
  });

  it('relays peer EMOTE to all peers except the originating sender, while sendEmote broadcasts to all peers', async () => {
    const { host, connected } = await createHostWithPeers([
      { peerId: 'peer-sender', nickname: 'Sender', team: 'red', isGuest: false, userId: 'u-1' },
      { peerId: 'peer-other-1', nickname: 'OtherOne', team: 'blue', isGuest: false, userId: 'u-2' },
      { peerId: 'peer-other-2', nickname: 'OtherTwo', team: 'spectator', isGuest: false, userId: 'u-3' }
    ]);

    const [sender, other1, other2] = connected;
    const emoteSpy = vi.fn();
    host.onPlayerEmote = emoteSpy;

    sendReliableFromPeer(sender.pc, { type: 'EMOTE', emoji: '🔥' });

    expect(emoteSpy).toHaveBeenCalledTimes(1);
    expect(emoteSpy).toHaveBeenCalledWith(sender.playerId, '🔥');

    // Originating sender MUST NOT receive an echo of its own EMOTE
    expect(parseReliableSent(sender.pc).filter((m) => m.type === 'EMOTE')).toEqual([]);

    // Other connected peers receive the relayed EMOTE
    expect(parseReliableSent(other1.pc).filter((m) => m.type === 'EMOTE')).toEqual([
      { type: 'EMOTE', playerId: sender.playerId, emoji: '🔥' }
    ]);
    expect(parseReliableSent(other2.pc).filter((m) => m.type === 'EMOTE')).toEqual([
      { type: 'EMOTE', playerId: sender.playerId, emoji: '🔥' }
    ]);

    // Host sendEmote still broadcasts to ALL connected peers
    for (const entry of connected) {
      entry.pc.channels.reliable.sent = [];
    }
    host.sendEmote(1, '🎉');
    for (const entry of connected) {
      expect(parseReliableSent(entry.pc).filter((m) => m.type === 'EMOTE')).toEqual([
        { type: 'EMOTE', playerId: 1, emoji: '🎉' }
      ]);
    }
  });
});
