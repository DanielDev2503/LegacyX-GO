export const OP_INPUT = 0x01;
export const OP_SNAPSHOT = 0x02;
export const OP_CHAT = 0x03;
export const OP_EVENT = 0x04;
export const OP_PING = 0x05;
export const OP_PONG = 0x06;
export const OP_KEEPALIVE = 0xff;

export enum EventType {
  GOAL = 1,
  KICK = 2,
  POST_HIT = 3,
  MATCH_START = 4,
  MATCH_END = 5
}

export enum SoundEvent {
  KICK = 1 << 0,     // 0x01
  POST_HIT = 1 << 1, // 0x02
  GOAL = 1 << 2      // 0x04
}

export const SOUND_KICK = 1 << 0;
export const SOUND_POST_HIT = 1 << 1;
export const SOUND_GOAL = 1 << 2;

export const INPUT_FLAG_UP = 1 << 0;
export const INPUT_FLAG_DOWN = 1 << 1;
export const INPUT_FLAG_LEFT = 1 << 2;
export const INPUT_FLAG_RIGHT = 1 << 3;
export const INPUT_FLAG_KICK = 1 << 4;
export const INPUT_FLAG_TURBO = 1 << 5;
export const INPUT_FLAG_DASH = 1 << 6;
export const INPUT_FLAG_MAGNUS_LEFT = 1 << 7;
export const INPUT_FLAG_MAGNUS_RIGHT = 1 << 8;
export const INPUT_FLAG_TYPING = 1 << 9;

export interface PlayerInput {
  tick?: number;
  sequence?: number;
  inputMask?: number;
  aimAngle?: number;
  clientTimestamp?: number;
  dirX?: number;
  dirY?: number;
  kick?: boolean;
  dash?: boolean;
  magnusLeft?: boolean;
  magnusRight?: boolean;
}

export interface CompactDiscState {
  id: number;
  team: number; // 0 = ball, 1 = red, 2 = blue
  x: number;
  y: number;
  vx: number;
  vy: number;
  flags: number;
  spin?: number;
  stamina?: number;
}

export interface GameStateSnapshot {
  tick: number;
  phase: number;
  matchTimer: number;
  redScore: number;
  blueScore: number;
  soundMask: number;
  discs: CompactDiscState[];
}

/**
 * Protocolo binario de alto rendimiento (Zero-GC) con ArrayBuffer y DataView
 */
export class BinaryProtocol {
  public static readonly PKT_INPUT = OP_INPUT;
  public static readonly PKT_SNAPSHOT = OP_SNAPSHOT;
  public static readonly INPUT_SIZE = 9;
  public static readonly SNAPSHOT_HEADER_SIZE = 12;
  public static readonly DISC_RECORD_SIZE = 18;

  public static peekPacketType(buffer: ArrayBuffer | DataView): number {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);
    return view.byteLength > 0 ? view.getUint8(0) : 0;
  }

  public static encodeInput(input: PlayerInput, outBuffer?: ArrayBuffer): ArrayBuffer {
    const buf = outBuffer && outBuffer.byteLength >= this.INPUT_SIZE ? outBuffer : new ArrayBuffer(this.INPUT_SIZE);
    const view = new DataView(buf);

    let mask = input.inputMask || 0;
    if (input.dirX !== undefined) {
      if (input.dirX < -0.3) mask |= INPUT_FLAG_LEFT;
      if (input.dirX > 0.3) mask |= INPUT_FLAG_RIGHT;
    }
    if (input.dirY !== undefined) {
      if (input.dirY < -0.3) mask |= INPUT_FLAG_UP;
      if (input.dirY > 0.3) mask |= INPUT_FLAG_DOWN;
    }
    if (input.kick) mask |= INPUT_FLAG_KICK;
    if (input.dash) mask |= INPUT_FLAG_DASH;
    if (input.magnusLeft) mask |= INPUT_FLAG_MAGNUS_LEFT;
    if (input.magnusRight) mask |= INPUT_FLAG_MAGNUS_RIGHT;

    view.setUint8(0, OP_INPUT);
    view.setUint32(1, input.sequence ?? input.tick ?? 0, false);
    view.setUint16(5, mask, false);
    view.setUint16(7, (input.clientTimestamp ?? 0) & 0xffff, false);

    return buf;
  }

  public static decodeInput(buffer: ArrayBuffer | DataView): PlayerInput | null {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);
    if (view.byteLength < this.INPUT_SIZE || view.getUint8(0) !== OP_INPUT) {
      return null;
    }

    const sequence = view.getUint32(1, false);
    const inputMask = view.getUint16(5, false);
    const clientTimestamp = view.getUint16(7, false);

    let dirX = 0;
    let dirY = 0;
    if (inputMask & INPUT_FLAG_LEFT) dirX -= 1;
    if (inputMask & INPUT_FLAG_RIGHT) dirX += 1;
    if (inputMask & INPUT_FLAG_UP) dirY -= 1;
    if (inputMask & INPUT_FLAG_DOWN) dirY += 1;

    const len = Math.hypot(dirX, dirY);
    if (len > 1.0) {
      dirX /= len;
      dirY /= len;
    }

    return {
      tick: sequence,
      sequence,
      inputMask,
      clientTimestamp,
      dirX,
      dirY,
      kick: (inputMask & INPUT_FLAG_KICK) !== 0,
      dash: (inputMask & INPUT_FLAG_DASH) !== 0,
      magnusLeft: (inputMask & INPUT_FLAG_MAGNUS_LEFT) !== 0,
      magnusRight: (inputMask & INPUT_FLAG_MAGNUS_RIGHT) !== 0
    };
  }

  public static encodeSnapshot(snapshot: GameStateSnapshot, outBuffer?: ArrayBuffer): ArrayBuffer {
    const discCount = snapshot.discs.length;
    const totalLength = this.SNAPSHOT_HEADER_SIZE + discCount * this.DISC_RECORD_SIZE;
    const buf = outBuffer && outBuffer.byteLength >= totalLength ? outBuffer : new ArrayBuffer(totalLength);
    const view = new DataView(buf);

    view.setUint8(0, OP_SNAPSHOT);
    view.setUint32(1, snapshot.tick, false);
    view.setUint8(5, snapshot.phase & 0xff);
    view.setUint16(6, snapshot.matchTimer & 0xffff, false);
    view.setUint8(8, snapshot.redScore & 0xff);
    view.setUint8(9, snapshot.blueScore & 0xff);
    view.setUint8(10, snapshot.soundMask & 0xff);
    view.setUint8(11, discCount & 0xff);

    let offset = this.SNAPSHOT_HEADER_SIZE;
    for (let i = 0; i < discCount; i++) {
      const d = snapshot.discs[i];
      view.setUint16(offset, d.id, false);
      view.setUint8(offset + 2, d.team & 0xff);
      view.setUint8(offset + 3, d.flags & 0xff);
      view.setFloat32(offset + 4, d.x, false);
      view.setFloat32(offset + 8, d.y, false);

      const qvx = Math.max(-32768, Math.min(32767, Math.round(d.vx * 20)));
      const qvy = Math.max(-32768, Math.min(32767, Math.round(d.vy * 20)));
      view.setInt16(offset + 12, qvx, false);
      view.setInt16(offset + 14, qvy, false);

      const stamina = Math.max(0, Math.min(100, Math.round(d.stamina ?? 100)));
      view.setUint8(offset + 16, stamina);

      const spin = Math.max(-128, Math.min(127, Math.round((d.spin ?? 0) * 50)));
      view.setInt8(offset + 17, spin);

      offset += this.DISC_RECORD_SIZE;
    }

    return buf;
  }

  public static decodeSnapshot(buffer: ArrayBuffer | DataView): GameStateSnapshot | null {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);
    if (view.byteLength < this.SNAPSHOT_HEADER_SIZE || view.getUint8(0) !== OP_SNAPSHOT) {
      return null;
    }

    const tick = view.getUint32(1, false);
    const phase = view.getUint8(5);
    const matchTimer = view.getUint16(6, false);
    const redScore = view.getUint8(8);
    const blueScore = view.getUint8(9);
    const soundMask = view.getUint8(10);
    const discCount = view.getUint8(11);

    const discs: CompactDiscState[] = [];
    let offset = this.SNAPSHOT_HEADER_SIZE;

    for (let i = 0; i < discCount; i++) {
      if (offset + this.DISC_RECORD_SIZE > view.byteLength) {
        if (offset + 16 <= view.byteLength) {
          const id = view.getUint16(offset, false);
          const team = view.getUint8(offset + 2);
          const flags = view.getUint8(offset + 3);
          const x = view.getFloat32(offset + 4, false);
          const y = view.getFloat32(offset + 8, false);
          const vx = view.getInt16(offset + 12, false) / 20;
          const vy = view.getInt16(offset + 14, false) / 20;
          discs.push({ id, team, flags, x, y, vx, vy, stamina: 100, spin: 0 });
          offset += 16;
          continue;
        }
        break;
      }
      const id = view.getUint16(offset, false);
      const team = view.getUint8(offset + 2);
      const flags = view.getUint8(offset + 3);
      const x = view.getFloat32(offset + 4, false);
      const y = view.getFloat32(offset + 8, false);
      const vx = view.getInt16(offset + 12, false) / 20;
      const vy = view.getInt16(offset + 14, false) / 20;
      const stamina = view.getUint8(offset + 16);
      const spin = view.getInt8(offset + 17) / 50;

      discs.push({ id, team, flags, x, y, vx, vy, stamina, spin });
      offset += this.DISC_RECORD_SIZE;
    }

    return {
      tick,
      phase,
      matchTimer,
      redScore,
      blueScore,
      soundMask,
      discs
    };
  }
}
