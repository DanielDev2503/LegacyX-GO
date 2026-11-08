import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomRegistry, MAX_ROOM_PLAYERS } from '../src/rooms/RoomRegistry.js';
import {
  AuthService,
  RANKED_GUEST_REJECT_MESSAGE,
  formatGuestNickname,
  isGuestNickname,
  validateRegistrationUsername,
  canCreateRankedRoom,
  canJoinRankedRoom,
  calculateEloDelta
} from '../src/auth/AuthService.js';

describe('Gates 1 & 2: 30-Player Room Capacity, Guest Prefix (inv_), Roles & Ranked Security', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Gate 1: MAX_ROOM_PLAYERS = 30 Capacity & Clamping', () => {
    it('allows rooms up to 30 players, clamps out-of-range limits, admits 29 guests, and rejects the 31st peer', () => {
      expect(MAX_ROOM_PLAYERS).toBe(30);

      const registry = new RoomRegistry();
      const clampedHigh = registry.createRoom('host-clamp-hi', {
        name: 'Overflow Test',
        stadiumId: 'big',
        maxPlayers: 99
      });
      expect(clampedHigh.maxPlayers).toBe(30);

      const clampedLow = registry.createRoom('host-clamp-lo', {
        name: 'Underflow Test',
        stadiumId: 'small',
        maxPlayers: 1
      });
      expect(clampedLow.maxPlayers).toBe(2);

      const fullRoom = registry.createRoom('host-30', {
        name: 'Cyber Arena 15v15',
        stadiumId: 'big',
        maxPlayers: 30,
        countryCode: 'co',
        hostPingMs: 24
      });
      expect(fullRoom.maxPlayers).toBe(30);
      expect(fullRoom.countryCode).toBe('CO');
      expect(fullRoom.hostPingMs).toBe(24);

      for (let i = 1; i <= 29; i++) {
        const res = registry.joinRoom(`guest-${i}`, fullRoom.id);
        expect(res.ok).toBe(true);
      }
      expect(fullRoom.currentPlayers).toBe(30);

      const overflow = registry.joinRoom('guest-30', fullRoom.id);
      expect(overflow).toEqual({ ok: false, code: 'ROOM_FULL' });
    });
  });

  describe('Gate 2: Guest Prefix (inv_), 3-Role Hierarchy, Ranked Rejection & MatchToken Integrity', () => {
    it('enforces immutable inv_ prefix on guests and blocks inv_ usernames during account registration', () => {
      expect(formatGuestNickname('Ronaldinho')).toBe('inv_Ronaldinho');
      expect(formatGuestNickname('inv_inv_Zidane')).toBe('inv_Zidane');
      expect(isGuestNickname('inv_Player1')).toBe(true);
      expect(isGuestNickname('INV_Pro')).toBe(true);
      expect(isGuestNickname('CyberStriker')).toBe(false);

      expect(validateRegistrationUsername('inv_hacker').valid).toBe(false);
      expect(validateRegistrationUsername('INV_admin').valid).toBe(false);
      expect(validateRegistrationUsername('ab').valid).toBe(false);
      expect(validateRegistrationUsername('CyberPro_99').valid).toBe(true);
    });

    it('restricts Ranked room creation exclusively to verified representante and superadmin accounts', () => {
      expect(canCreateRankedRoom('superadmin', false)).toBe(true);
      expect(canCreateRankedRoom('representante', false)).toBe(true);
      expect(canCreateRankedRoom('jugador', false)).toBe(false);
      expect(canCreateRankedRoom('superadmin', true)).toBe(false);
      expect(canCreateRankedRoom('representante', true)).toBe(false);
      expect(canCreateRankedRoom(null, true)).toBe(false);
    });

    it('rejects guests and unverified accounts from Ranked rooms with the exact Spanish message while admitting verified players', () => {
      const registry = new RoomRegistry();
      const rankedRoom = registry.createRoom('rep-host', {
        name: 'Liga Oficial Clasificatoria',
        stadiumId: 'af_3v3',
        maxPlayers: 12,
        roomType: 'ranked',
        hostUserId: 'uuid-rep-1'
      });

      expect(rankedRoom.roomType).toBe('ranked');

      // Guest attempting to join Ranked
      const guestAttempt = registry.joinRoom('peer-guest', rankedRoom.id, undefined, {
        isGuest: true,
        isVerified: false,
        nickname: 'inv_Guest10'
      });
      expect(guestAttempt).toEqual({
        ok: false,
        code: 'RANKED_ACCOUNT_REQUIRED',
        message: RANKED_GUEST_REJECT_MESSAGE
      });
      expect(RANKED_GUEST_REJECT_MESSAGE).toBe(
        'Esta sala es Clasificatoria. Debes iniciar sesión con una cuenta verificada para entrar.'
      );

      // Unverified registered account attempting to join Ranked
      const unverifiedAttempt = registry.joinRoom('peer-unverified', rankedRoom.id, undefined, {
        isGuest: false,
        isVerified: false,
        nickname: 'PendingUser'
      });
      expect(unverifiedAttempt.ok).toBe(false);

      // Verified jugador account joining Ranked -> allowed!
      expect(
        canJoinRankedRoom({ isGuest: false, isVerified: true, nickname: 'VerifiedPro' }).allowed
      ).toBe(true);
      const verifiedJoin = registry.joinRoom('peer-verified', rankedRoom.id, undefined, {
        isGuest: false,
        isVerified: true,
        nickname: 'VerifiedPro'
      });
      expect(verifiedJoin.ok).toBe(true);
    });

    it('signs and verifies HMAC MatchTokens, computes ELO deltas, and aborts disconnected Ranked matches with 0 ELO loss', async () => {
      const svc = new AuthService();
      const token = svc.issueMatchToken({
        roomId: 'RANK01',
        hostUserId: 'host-uuid-001',
        stadiumId: 'mediano',
        participantUserIds: ['u1', 'u2']
      });

      const verified = svc.verifyMatchToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.roomId).toBe('RANK01');
      expect(verified?.hostUserId).toBe('host-uuid-001');

      // Tampered signature must fail verification
      expect(svc.verifyMatchToken(`${token}tampered`)).toBeNull();

      // Equal-ELO win/loss/draw check
      expect(calculateEloDelta(1000, 1000, 'win')).toBe(16);
      expect(calculateEloDelta(1000, 1000, 'loss')).toBe(-16);
      expect(calculateEloDelta(1000, 1000, 'draw')).toBe(0);

      // Mock fetch to verify abortRankedMatch sends p_status: 'ABORTED' and p_player_updates: []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, status: 'ABORTED' }), { status: 200 })
      );

      const abortRes = await svc.abortRankedMatch({
        matchToken: token,
        hostUserId: 'host-uuid-001',
        stadiumId: 'mediano'
      });

      expect(abortRes.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, reqInit] = fetchSpy.mock.calls[0]!;
      const body = JSON.parse(String(reqInit?.body));
      expect(body.p_status).toBe('ABORTED');
      expect(body.p_player_updates).toEqual([]);
    });
  });
});
