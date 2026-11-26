import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RoomCategory } from '@legacyx/core';
import { canJoinRankedRoom, RANKED_GUEST_REJECT_MESSAGE } from '../auth/AuthService.js';

export const MAX_ROOM_PLAYERS = 30;
export const DEFAULT_HOST_GRACE_MS = 45_000;

export interface Room {
  id: string;
  name: string;
  stadiumId: string;
  hostPeerId: string;
  hostUserId?: string;
  hostAccessToken?: string;
  hostClientSessionId?: string;
  reclaimToken: string;
  hostDisconnectedAt?: number | null;
  hostGraceExpiresAt?: number | null;
  maxPlayers: number;
  currentPlayers: number;
  hasPassword: boolean;
  passwordHash: string | null; // "salt:hash" (scrypt), nunca la contraseña en claro
  isLocked: boolean;
  isDedicated?: boolean;
  roomType: RoomCategory;
  countryCode: string;
  hostPingMs: number;
  activeMatchToken?: string | null;
  createdAt: number;
  guests: Set<string>;
  bannedPeerIds: Set<string>;
  bannedUserIds: Set<string>;
}

export type JoinResult =
  | { ok: true; room: Room }
  | {
      ok: false;
      code:
        | 'ROOM_NOT_FOUND'
        | 'ROOM_FULL'
        | 'ROOM_LOCKED'
        | 'ROOM_BANNED'
        | 'INVALID_PASSWORD'
        | 'ALREADY_IN_ROOM'
        | 'RANKED_ACCOUNT_REQUIRED'
        | 'HOST_RECONNECTING';
      message?: string;
    };

export type ReclaimResult =
  | { ok: true; room: Room; guests: string[] }
  | { ok: false; code: 'ROOM_NOT_FOUND' | 'GRACE_EXPIRED' | 'UNAUTHORIZED_RECLAIM'; message: string };

function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Registro de salas en memoria. Una sala vive mientras su host siga conectado. */
export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private peerToRoom = new Map<string, string>();

  public createRoom(
    hostPeerId: string,
    opts: {
      name: string;
      stadiumId: string;
      maxPlayers: number;
      password?: string;
      isDedicated?: boolean;
      roomType?: RoomCategory;
      countryCode?: string;
      hostPingMs?: number;
      hostUserId?: string;
      hostAccessToken?: string;
      hostClientSessionId?: string;
    }
  ): Room {
    this.leaveRoom(hostPeerId);
    const cleanCountry = String(opts.countryCode || 'UN')
      .trim()
      .toUpperCase()
      .slice(0, 2);

    const room: Room = {
      id: randomUUID().slice(0, 6).toUpperCase(),
      name: opts.name.slice(0, 50) || 'LegacyX Room',
      stadiumId: opts.stadiumId,
      hostPeerId,
      hostUserId: opts.hostUserId,
      hostAccessToken: opts.hostAccessToken,
      hostClientSessionId: opts.hostClientSessionId,
      reclaimToken: randomBytes(16).toString('hex'),
      hostDisconnectedAt: null,
      hostGraceExpiresAt: null,
      maxPlayers: Math.max(2, Math.min(MAX_ROOM_PLAYERS, Math.floor(opts.maxPlayers) || 12)),
      currentPlayers: 1,
      hasPassword: Boolean(opts.password),
      passwordHash: opts.password ? hashPassword(opts.password) : null,
      isLocked: false,
      isDedicated: Boolean(opts.isDedicated),
      roomType: opts.roomType === 'ranked' ? 'ranked' : 'casual',
      countryCode: /^[A-Z]{2}$/.test(cleanCountry) ? cleanCountry : 'UN',
      hostPingMs: Math.max(1, Math.round(opts.hostPingMs ?? 28)),
      activeMatchToken: null,
      createdAt: Date.now(),
      guests: new Set(),
      bannedPeerIds: new Set(),
      bannedUserIds: new Set()
    };
    this.rooms.set(room.id, room);
    this.peerToRoom.set(hostPeerId, room.id);
    return room;
  }

  public joinRoom(
    peerId: string,
    roomId: string,
    password?: string,
    joinerAuth?: { isGuest?: boolean; isVerified?: boolean; nickname?: string | null; userId?: string | null }
  ): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
    if (room.hostDisconnectedAt != null) {
      return {
        ok: false,
        code: 'HOST_RECONNECTING',
        message: 'El anfitrión está reconectando. Intenta de nuevo en unos segundos.'
      };
    }

    if (this.isBannedFromRoom(roomId, peerId, joinerAuth?.userId)) {
      return {
        ok: false,
        code: 'ROOM_BANNED',
        message: 'Has sido baneado de esta sala y no puedes volver a ingresar.'
      };
    }

    if (room.roomType === 'ranked') {
      const check = canJoinRankedRoom({
        isGuest: joinerAuth?.isGuest ?? true,
        isVerified: joinerAuth?.isVerified ?? false,
        nickname: joinerAuth?.nickname ?? null
      });
      if (!check.allowed) {
        return {
          ok: false,
          code: 'RANKED_ACCOUNT_REQUIRED',
          message: check.error ?? RANKED_GUEST_REJECT_MESSAGE
        };
      }
    }

    const existingRoomId = this.peerToRoom.get(peerId);
    if (existingRoomId) {
      if (existingRoomId === roomId) {
        return { ok: true, room };
      }
      this.leaveRoom(peerId);
    }
    if (room.isLocked) return { ok: false, code: 'ROOM_LOCKED' };
    if (room.currentPlayers >= room.maxPlayers) return { ok: false, code: 'ROOM_FULL' };
    if (room.passwordHash && !verifyPassword(password ?? '', room.passwordHash)) {
      return { ok: false, code: 'INVALID_PASSWORD' };
    }
    room.guests.add(peerId);
    room.currentPlayers = room.guests.size + 1;
    this.peerToRoom.set(peerId, roomId);
    return { ok: true, room };
  }

  /**
   * Saca a un peer de su sala. Si era el host, la sala se destruye de inmediato.
   * Devuelve la sala afectada y los peers a notificar.
   */
  public leaveRoom(peerId: string): { room: Room; notify: string[]; destroyed: boolean } | null {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) return null;
    this.peerToRoom.delete(peerId);
    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (room.hostPeerId === peerId) {
      this.rooms.delete(roomId);
      for (const g of room.guests) this.peerToRoom.delete(g);
      return { room, notify: [...room.guests], destroyed: true };
    }

    room.guests.delete(peerId);
    room.currentPlayers = room.guests.size + 1;
    return { room, notify: [room.hostPeerId], destroyed: false };
  }

  /**
   * Pone la sala en ventana de gracia tras un micro-corte inesperado del Host.
   * Mantiene a los invitados y el estado de la sala hasta que el Host reclame o expire el plazo.
   */
  public markHostDisconnected(
    hostPeerId: string,
    graceMs: number = DEFAULT_HOST_GRACE_MS,
    now: number = Date.now()
  ): { room: Room; notify: string[]; graceMs: number } | null {
    const roomId = this.peerToRoom.get(hostPeerId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room || room.hostPeerId !== hostPeerId) return null;

    this.peerToRoom.delete(hostPeerId);
    const boundedGraceMs = Math.max(100, Math.floor(graceMs));
    room.hostDisconnectedAt = now;
    room.hostGraceExpiresAt = now + boundedGraceMs;
    return { room, notify: [...room.guests], graceMs: boundedGraceMs };
  }

  /**
   * Permite al Host recuperar la propiedad de su sala tras reconectar WebSocket dentro de la ventana de gracia.
   */
  public reclaimRoom(
    roomId: string,
    newHostPeerId: string,
    auth: {
      reclaimToken?: string;
      previousHostPeerId?: string;
      hostUserId?: string;
      hostClientSessionId?: string;
    },
    now: number = Date.now()
  ): ReclaimResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'La sala ya no existe.' };
    }

    if (room.hostGraceExpiresAt != null && now > room.hostGraceExpiresAt) {
      this.deleteRoom(roomId);
      return { ok: false, code: 'GRACE_EXPIRED', message: 'La ventana de recuperación de la sala expiró.' };
    }

    const tokenMatches = Boolean(auth.reclaimToken && safeTokenEquals(auth.reclaimToken, room.reclaimToken));
    const userMatches = Boolean(auth.hostUserId && room.hostUserId && auth.hostUserId === room.hostUserId);
    const sessionMatches = Boolean(
      auth.hostClientSessionId && room.hostClientSessionId && auth.hostClientSessionId === room.hostClientSessionId
    );
    const sameActiveHost = room.hostPeerId === newHostPeerId && room.hostDisconnectedAt == null;

    if (!tokenMatches && !userMatches && !sessionMatches && !sameActiveHost) {
      return {
        ok: false,
        code: 'UNAUTHORIZED_RECLAIM',
        message: 'No tienes autorización para reclamar esta sala.'
      };
    }

    if (room.hostPeerId !== newHostPeerId) {
      this.peerToRoom.delete(room.hostPeerId);
    }
    room.guests.delete(newHostPeerId);
    room.hostPeerId = newHostPeerId;
    room.hostDisconnectedAt = null;
    room.hostGraceExpiresAt = null;
    if (auth.hostClientSessionId) {
      room.hostClientSessionId = auth.hostClientSessionId;
    }
    if (auth.hostUserId && !room.hostUserId) {
      room.hostUserId = auth.hostUserId;
    }
    room.currentPlayers = room.guests.size + 1;
    this.peerToRoom.set(newHostPeerId, room.id);

    return { ok: true, room, guests: [...room.guests] };
  }

  /** Elimina salas cuya ventana de gracia de reconexión del Host haya expirado. */
  public expireDisconnectedHostRooms(now: number = Date.now()): Room[] {
    const expired: Room[] = [];
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.hostGraceExpiresAt != null && now >= room.hostGraceExpiresAt) {
        const deleted = this.deleteRoom(roomId);
        if (deleted) expired.push(deleted);
      }
    }
    return expired;
  }

  public deleteRoom(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    this.rooms.delete(roomId);
    this.peerToRoom.delete(room.hostPeerId);
    for (const g of room.guests) {
      this.peerToRoom.delete(g);
    }
    return room;
  }

  public removeRoom(roomId: string): Room | undefined {
    return this.deleteRoom(roomId);
  }

  public updateRoom(
    roomId: string,
    patch: {
      name?: string;
      stadiumId?: string;
      maxPlayers?: number;
      currentPlayers?: number;
      password?: string | null;
      isPrivate?: boolean;
      isLocked?: boolean;
      roomType?: RoomCategory;
      countryCode?: string;
      hostPingMs?: number;
      activeMatchToken?: string | null;
    }
  ): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    if (patch.name !== undefined) {
      room.name = String(patch.name).slice(0, 50) || room.name;
    }
    if (patch.stadiumId !== undefined) {
      room.stadiumId = String(patch.stadiumId);
    }
    if (patch.maxPlayers !== undefined) {
      room.maxPlayers = Math.max(2, Math.min(MAX_ROOM_PLAYERS, Math.floor(Number(patch.maxPlayers)) || room.maxPlayers));
    }
    if (patch.currentPlayers !== undefined) {
      room.currentPlayers = Math.max(1, Math.floor(Number(patch.currentPlayers)));
    }
    if (patch.isLocked !== undefined) {
      room.isLocked = Boolean(patch.isLocked);
    }
    if (patch.roomType !== undefined) {
      room.roomType = patch.roomType === 'ranked' ? 'ranked' : 'casual';
    }
    if (patch.countryCode !== undefined && /^[A-Za-z]{2}$/.test(patch.countryCode)) {
      room.countryCode = patch.countryCode.toUpperCase();
    }
    if (patch.hostPingMs !== undefined && Number.isFinite(patch.hostPingMs)) {
      room.hostPingMs = Math.max(1, Math.round(patch.hostPingMs));
    }
    if (patch.activeMatchToken !== undefined) {
      room.activeMatchToken = patch.activeMatchToken;
    }
    if (patch.isPrivate === false) {
      room.hasPassword = false;
      room.passwordHash = null;
    } else if (patch.password !== undefined) {
      if (patch.password) {
        room.hasPassword = true;
        room.passwordHash = hashPassword(patch.password);
      } else {
        room.hasPassword = false;
        room.passwordHash = null;
      }
    }
    return room;
  }

  public purgeInactiveRooms(activePeerIds: Set<string>, now: number = Date.now()): void {
    for (const [roomId, room] of this.rooms.entries()) {
      const inGraceWindow = room.hostGraceExpiresAt != null && now < room.hostGraceExpiresAt;
      if (!activePeerIds.has(room.hostPeerId) && !inGraceWindow) {
        this.deleteRoom(roomId);
        continue;
      }
      // Limpieza de estados zombi de invitados desconectados para no bloquear nuevos ingresos
      let removedGuest = false;
      for (const guestId of [...room.guests]) {
        if (!activePeerIds.has(guestId)) {
          room.guests.delete(guestId);
          this.peerToRoom.delete(guestId);
          removedGuest = true;
        }
      }
      if (removedGuest) {
        room.currentPlayers = room.guests.size + 1;
      }
    }
  }

  public getRoomById(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomOfPeer(peerId: string): Room | undefined {
    const id = this.peerToRoom.get(peerId);
    return id ? this.rooms.get(id) : undefined;
  }

  public banPeerInRoom(roomId: string, peerId: string, userId?: string | null): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (peerId && peerId !== room.hostPeerId) {
      room.bannedPeerIds.add(peerId);
    }
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    if (cleanUserId) {
      room.bannedUserIds.add(cleanUserId);
    }
    return true;
  }

  public isBannedFromRoom(roomId: string, peerId: string, userId?: string | null): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (peerId && room.bannedPeerIds.has(peerId)) {
      return true;
    }
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    return Boolean(cleanUserId && room.bannedUserIds.has(cleanUserId));
  }

  public getPublicRooms(activePeerIds?: Set<string>): any[] {
    if (activePeerIds) {
      this.purgeInactiveRooms(activePeerIds);
    }
    return [...this.rooms.values()]
      .filter((r) => !r.isLocked && r.hostDisconnectedAt == null)
      .map(
        ({
          id,
          name,
          stadiumId,
          maxPlayers,
          currentPlayers,
          hasPassword,
          isLocked,
          isDedicated,
          roomType,
          countryCode,
          hostPingMs,
          createdAt
        }) => ({
          id,
          name,
          stadiumId,
          stadium: stadiumId,
          maxPlayers,
          currentPlayers,
          playerCount: currentPlayers,
          playersCount: currentPlayers,
          hasPassword,
          isPrivate: hasPassword,
          isLocked,
          isDedicated,
          roomType,
          countryCode,
          hostPingMs,
          createdAt
        })
      );
  }
}
