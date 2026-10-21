import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RoomSummary } from '@legacyx/core';

export interface Room {
  id: string;
  name: string;
  stadiumId: string;
  hostPeerId: string;
  maxPlayers: number;
  currentPlayers: number;
  hasPassword: boolean;
  passwordHash: string | null; // "salt:hash" (scrypt), nunca la contraseña en claro
  isLocked: boolean;
  isDedicated?: boolean;
  createdAt: number;
  guests: Set<string>;
}

export type JoinResult =
  | { ok: true; room: Room }
  | { ok: false; code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROOM_LOCKED' | 'INVALID_PASSWORD' | 'ALREADY_IN_ROOM' };

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

  public createRoom(hostPeerId: string, opts: { name: string; stadiumId: string; maxPlayers: number; password?: string; isDedicated?: boolean }): Room {
    this.leaveRoom(hostPeerId);
    const room: Room = {
      id: randomUUID().slice(0, 6).toUpperCase(),
      name: opts.name.slice(0, 50) || 'LegacyX Room',
      stadiumId: opts.stadiumId,
      hostPeerId,
      maxPlayers: Math.max(2, Math.min(20, Math.floor(opts.maxPlayers) || 6)),
      currentPlayers: 1,
      hasPassword: Boolean(opts.password),
      passwordHash: opts.password ? hashPassword(opts.password) : null,
      isLocked: false,
      isDedicated: Boolean(opts.isDedicated),
      createdAt: Date.now(),
      guests: new Set()
    };
    this.rooms.set(room.id, room);
    this.peerToRoom.set(hostPeerId, room.id);
    return room;
  }

  public joinRoom(peerId: string, roomId: string, password?: string): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
    if (this.peerToRoom.has(peerId)) return { ok: false, code: 'ALREADY_IN_ROOM' };
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

  public purgeInactiveRooms(activePeerIds: Set<string>): void {
    for (const [roomId, room] of this.rooms.entries()) {
      if (!activePeerIds.has(room.hostPeerId)) {
        this.deleteRoom(roomId);
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

  public getPublicRooms(activePeerIds?: Set<string>): any[] {
    if (activePeerIds) {
      this.purgeInactiveRooms(activePeerIds);
    }
    return [...this.rooms.values()]
      .filter((r) => !r.isLocked)
      .map(({ id, name, stadiumId, maxPlayers, currentPlayers, hasPassword, isLocked, isDedicated, createdAt }) => ({
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
        createdAt
      }));
  }
}
