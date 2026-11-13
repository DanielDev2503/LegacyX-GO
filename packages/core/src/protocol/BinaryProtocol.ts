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
export const SOUND_MASK_BITS = 0x07;
export const SNAPSHOT_FLAG_KICKOFF_ACTIVE = 1 << 4;
export const SNAPSHOT_FLAG_GOLDEN_GOAL = 1 << 5;
export const SNAPSHOT_FLAG_NEUTRAL_KICKOFF = 1 << 6;
export const SNAPSHOT_FLAG_KICKOFF_BLUE = 1 << 7;

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
export const INPUT_FLAG_MOUSE_AIM = 1 << 10;
export const INPUT_FLAG_MOUSE_ACTIVE = 1 << 10;

export interface PlayerInput {
  tick?: number;
  sequence?: number;
  inputMask?: number;
  aimAngle?: number | null;
  aimThrottle?: number;
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
  lastAckedInputSeq?: number;
  dashTimer?: number;
  dashCooldown?: number;
}

export interface GameStateSnapshot {
  tick: number;
  phase: number;
  matchTimer: number;
  redScore: number;
  blueScore: number;
  soundMask: number;
  kickoffActive?: boolean | undefined;
  isGoldenGoal?: boolean | undefined;
  isNeutralKickoff?: boolean | undefined;
  kickoffPossessingTeam?: 'red' | 'blue' | undefined;
  discs: CompactDiscState[];
}

function encodeWirePhase(phase: number): number {
  if (Math.abs(phase - 0.5) < 0.01) return 15; // PRE_MATCH_VS
  if (Math.abs(phase - 0.6) < 0.01) return 16; // START_COUNTDOWN
  if (Math.abs(phase - 2.1) < 0.01) return 21; // PAUSE
  if (Math.abs(phase - 2.2) < 0.01) return 22; // RESUME_COUNTDOWN
  if (Math.abs(phase - 3.5) < 0.01) return 35; // GOAL_REPLAY
  return Math.round(phase) & 0xff;
}

function decodeWirePhase(wire: number): number {
  if (wire === 15) return 0.5;
  if (wire === 16) return 0.6;
  if (wire === 21) return 2.1;
  if (wire === 22) return 2.2;
  if (wire === 35) return 3.5;
  return wire;
}

/**
 * Protocolo binario de alto rendimiento (Zero-GC) con ArrayBuffer y DataView
 */
export class BinaryProtocol {
  public static readonly PKT_INPUT = OP_INPUT;
  public static readonly PKT_SNAPSHOT = OP_SNAPSHOT;
  public static readonly INPUT_SIZE = 9;
  public static readonly MOUSE_INPUT_SIZE = 12;
  public static readonly SNAPSHOT_HEADER_SIZE = 12;
  public static readonly DISC_RECORD_SIZE = 32;

  public static peekPacketType(buffer: ArrayBuffer | DataView): number {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);
    return view.byteLength > 0 ? view.getUint8(0) : 0;
  }

  public static encodeInput(input: PlayerInput, outBuffer?: ArrayBuffer): ArrayBuffer {
    let mask = input.inputMask || 0;
    const hasMouseAim =
      ((mask & (INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE)) !== 0 ||
       (input.aimAngle !== undefined && input.aimAngle !== null && (input.aimThrottle ?? 0) > 0)) &&
      input.aimAngle !== null &&
      input.aimAngle !== undefined &&
      (input.aimThrottle ?? 0) > 0;

    if (hasMouseAim) {
      mask |= INPUT_FLAG_MOUSE_ACTIVE;
      mask &= ~(INPUT_FLAG_UP | INPUT_FLAG_DOWN | INPUT_FLAG_LEFT | INPUT_FLAG_RIGHT);
    } else {
      mask &= ~(INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE);
      if (input.dirX !== undefined) {
        if (input.dirX < -0.3) mask |= INPUT_FLAG_LEFT;
        if (input.dirX > 0.3) mask |= INPUT_FLAG_RIGHT;
      }
      if (input.dirY !== undefined) {
        if (input.dirY < -0.3) mask |= INPUT_FLAG_UP;
        if (input.dirY > 0.3) mask |= INPUT_FLAG_DOWN;
      }
    }
    if (input.kick) mask |= INPUT_FLAG_KICK;
    if (input.dash) mask |= INPUT_FLAG_DASH;
    if (input.magnusLeft) mask |= INPUT_FLAG_MAGNUS_LEFT;
    if (input.magnusRight) mask |= INPUT_FLAG_MAGNUS_RIGHT;

    const size = hasMouseAim ? this.MOUSE_INPUT_SIZE : this.INPUT_SIZE;
    const buf = outBuffer && outBuffer.byteLength === size ? outBuffer : new ArrayBuffer(size);
    const view = new DataView(buf);

    view.setUint8(0, OP_INPUT);
    view.setUint32(1, input.sequence ?? input.tick ?? (input as any).seq ?? 0, true);
    view.setUint16(5, mask, false);
    view.setUint16(7, (input.clientTimestamp ?? 0) & 0xffff, false);

    if (hasMouseAim) {
      const qAngle = Math.max(-32767, Math.min(32767, Math.round((input.aimAngle ?? 0) * 10000)));
      const qThrottle = Math.max(0, Math.min(254, Math.round((input.aimThrottle ?? 1) * 255)));
      view.setInt16(9, qAngle, false);
      view.setUint8(11, qThrottle);
    }

    return buf;
  }

  public static decodeInput(buffer: ArrayBuffer | DataView): PlayerInput | null {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);
    if (view.byteLength < this.INPUT_SIZE || view.getUint8(0) !== OP_INPUT) {
      return null;
    }

    const sequence = view.getUint32(1, true);
    const inputMask = view.getUint16(5, false);
    const clientTimestamp = view.getUint16(7, false);

    let dirX = 0;
    let dirY = 0;
    let aimAngle: number | null | undefined = undefined;
    let aimThrottle: number | undefined = undefined;

    const hasMouseAim = (inputMask & (INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_MOUSE_ACTIVE)) !== 0 && view.byteLength >= this.MOUSE_INPUT_SIZE;
    if (hasMouseAim) {
      const qAngle = view.getInt16(9, false);
      const qThrottle = view.getUint8(11);
      if (qThrottle === 0xFF || qAngle === 0x7fff || qThrottle === 0) {
        aimAngle = null;
        aimThrottle = 0;
      } else {
        aimAngle = qAngle / 10000;
        aimThrottle = qThrottle / 255;
        dirX = Math.cos(aimAngle) * aimThrottle;
        dirY = Math.sin(aimAngle) * aimThrottle;
      }
    }

    if (!hasMouseAim || aimAngle === null) {
      if (!hasMouseAim) {
        aimAngle = undefined;
        aimThrottle = undefined;
      }
      if (inputMask & INPUT_FLAG_LEFT) dirX -= 1;
      if (inputMask & INPUT_FLAG_RIGHT) dirX += 1;
      if (inputMask & INPUT_FLAG_UP) dirY -= 1;
      if (inputMask & INPUT_FLAG_DOWN) dirY += 1;

      const len = Math.hypot(dirX, dirY);
      if (len > 1.0) {
        dirX /= len;
        dirY /= len;
      }
    }

    return {
      tick: sequence,
      sequence,
      inputMask,
      aimAngle,
      aimThrottle,
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
    view.setUint8(5, encodeWirePhase(snapshot.phase));
    view.setUint16(6, snapshot.matchTimer & 0xffff, false);
    view.setUint8(8, snapshot.redScore & 0xff);
    view.setUint8(9, snapshot.blueScore & 0xff);
    const kickoffActive = snapshot.kickoffActive ?? (snapshot.phase === 1);
    let byte10 = snapshot.soundMask & SOUND_MASK_BITS;
    if (kickoffActive) byte10 |= SNAPSHOT_FLAG_KICKOFF_ACTIVE;
    if (snapshot.isGoldenGoal) byte10 |= SNAPSHOT_FLAG_GOLDEN_GOAL;
    if (snapshot.isNeutralKickoff) byte10 |= SNAPSHOT_FLAG_NEUTRAL_KICKOFF;
    if (snapshot.kickoffPossessingTeam === 'blue') byte10 |= SNAPSHOT_FLAG_KICKOFF_BLUE;
    view.setUint8(10, byte10 & 0xff);
    view.setUint8(11, discCount & 0xff);

    let offset = this.SNAPSHOT_HEADER_SIZE;
    for (let i = 0; i < discCount; i++) {
      const d = snapshot.discs[i];
      view.setUint16(offset, d.id, true);
      view.setUint8(offset + 2, d.team & 0xff);
      view.setUint8(offset + 3, d.flags & 0xff);
      view.setFloat32(offset + 4, d.x, true);
      view.setFloat32(offset + 8, d.y, true);
      view.setFloat32(offset + 12, d.vx, true);
      view.setFloat32(offset + 16, d.vy, true);
      view.setFloat32(offset + 20, d.stamina ?? 100, true);
      view.setUint32(offset + 24, d.lastAckedInputSeq ?? 0, true);
      view.setUint8(offset + 28, Math.max(0, Math.min(255, Math.round(d.dashTimer ?? 0))));
      view.setInt8(offset + 29, Math.max(-128, Math.min(127, Math.round((d.spin ?? 0) * 50))));
      view.setUint16(offset + 30, Math.max(0, Math.min(65535, Math.round((d.dashCooldown ?? 0) * 1000))), true);

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
    const phase = decodeWirePhase(view.getUint8(5));
    const matchTimer = view.getUint16(6, false);
    const redScore = view.getUint8(8);
    const blueScore = view.getUint8(9);
    const metaByte = view.getUint8(10);
    const soundMask = metaByte & SOUND_MASK_BITS;
    const kickoffActive = (metaByte & SNAPSHOT_FLAG_KICKOFF_ACTIVE) !== 0;
    const isGoldenGoal = (metaByte & SNAPSHOT_FLAG_GOLDEN_GOAL) !== 0;
    const isNeutralKickoff = (metaByte & SNAPSHOT_FLAG_NEUTRAL_KICKOFF) !== 0;
    const kickoffPossessingTeam: 'red' | 'blue' =
      (metaByte & SNAPSHOT_FLAG_KICKOFF_BLUE) !== 0 ? 'blue' : 'red';
    const discCount = view.getUint8(11);

    const discs: CompactDiscState[] = [];
    const discStride = discCount > 0 ? Math.floor((view.byteLength - this.SNAPSHOT_HEADER_SIZE) / discCount) : this.DISC_RECORD_SIZE;
    let offset = this.SNAPSHOT_HEADER_SIZE;

    for (let i = 0; i < discCount; i++) {
      if (discStride >= 32 && offset + 32 <= view.byteLength) {
        const id = view.getUint16(offset, true);
        const team = view.getUint8(offset + 2);
        const flags = view.getUint8(offset + 3);
        const x = view.getFloat32(offset + 4, true);
        const y = view.getFloat32(offset + 8, true);
        const vx = view.getFloat32(offset + 12, true);
        const vy = view.getFloat32(offset + 16, true);
        const stamina = view.getFloat32(offset + 20, true);
        const lastAckedInputSeq = view.getUint32(offset + 24, true);
        const dashTimer = view.getUint8(offset + 28);
        const spin = view.getInt8(offset + 29) / 50;
        const dashCooldown = view.getUint16(offset + 30, true) / 1000;

        discs.push({
          id,
          team,
          flags,
          x,
          y,
          vx,
          vy,
          stamina,
          spin,
          lastAckedInputSeq,
          dashTimer,
          dashCooldown
        });
        offset += discStride;
      } else if (offset + 18 <= view.byteLength) {
        // Fallback for legacy 18-byte record (Int16 for vx, vy / 20)
        const id = view.getUint16(offset, false);
        const team = view.getUint8(offset + 2);
        const flags = view.getUint8(offset + 3);
        const x = view.getFloat32(offset + 4, false);
        const y = view.getFloat32(offset + 8, false);
        const vx = view.getInt16(offset + 12, false) / 20;
        const vy = view.getInt16(offset + 14, false) / 20;
        const stamina = view.getUint8(offset + 16);
        const spin = view.getInt8(offset + 17) / 50;

        discs.push({
          id,
          team,
          flags,
          x,
          y,
          vx,
          vy,
          stamina,
          spin,
          lastAckedInputSeq: 0,
          dashTimer: 0,
          dashCooldown: 0
        });
        offset += discStride > 0 ? discStride : 18;
      } else if (offset + 16 <= view.byteLength) {
        // Fallback for legacy 16-byte record
        const id = view.getUint16(offset, false);
        const team = view.getUint8(offset + 2);
        const flags = view.getUint8(offset + 3);
        const x = view.getFloat32(offset + 4, false);
        const y = view.getFloat32(offset + 8, false);
        const vx = view.getInt16(offset + 12, false) / 20;
        const vy = view.getInt16(offset + 14, false) / 20;
        discs.push({ id, team, flags, x, y, vx, vy, stamina: 100, spin: 0, lastAckedInputSeq: 0, dashTimer: 0, dashCooldown: 0 });
        offset += discStride > 0 ? discStride : 16;
      } else {
        break;
      }
    }

    return {
      tick,
      phase,
      matchTimer,
      redScore,
      blueScore,
      soundMask,
      kickoffActive,
      isGoldenGoal,
      isNeutralKickoff,
      kickoffPossessingTeam,
      discs
    };
  }
}
