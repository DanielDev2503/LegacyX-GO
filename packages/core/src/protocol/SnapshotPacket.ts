import { OP_SNAPSHOT, AIM_ANGLE_BYTE_NONE, getCachedDataView } from './BinaryProtocol';
import { GameSnapshot, DiscSnapshot } from '../game/GameState';
import { MatchPhase, toMatchPhase } from '../game/GameFSM';

import { DEFAULT_GAMEPLAY_CONFIG } from '../game/GameConfig';

export interface ActiveRadiusConfig {
  ballRadius?: number;
  playerRadius?: number;
}

export class SnapshotPacket {
  public static readonly HEADER_LENGTH = 17;
  public static readonly DISC_LENGTH = 34;
  public static activeConfig: ActiveRadiusConfig | (() => ActiveRadiusConfig | undefined) | null = null;

  public static encode(snapshot: GameSnapshot, outBuffer?: ArrayBuffer): ArrayBuffer {
    const discCount = snapshot.discs.length;
    const totalLength = SnapshotPacket.HEADER_LENGTH + discCount * SnapshotPacket.DISC_LENGTH;
    const buffer = outBuffer && outBuffer.byteLength === totalLength
      ? outBuffer
      : new ArrayBuffer(totalLength);
    const view = getCachedDataView(buffer);

    const phase = snapshot.matchPhase !== undefined
      ? snapshot.matchPhase
      : (typeof snapshot.matchState === 'number' ? snapshot.matchState : toMatchPhase(snapshot.matchState));

    const timer = snapshot.timerSeconds !== undefined ? snapshot.timerSeconds : (snapshot.matchTimerSeconds ?? 0);
    const subTimer = snapshot.subStateTimer !== undefined ? snapshot.subStateTimer : (snapshot.countdownSeconds ?? 0);
    const red = snapshot.scoreRed !== undefined ? snapshot.scoreRed : (snapshot.redScore ?? 0);
    const blue = snapshot.scoreBlue !== undefined ? snapshot.scoreBlue : (snapshot.blueScore ?? 0);
    let targetByte = (snapshot.targetTeam ?? 0) & 0x03;
    if (snapshot.kickoffActive) targetByte |= 0x80;
    if (snapshot.kickoffMode === 'TEAM_KICKOFF') targetByte |= 0x40;
    if (snapshot.possessingTeam === 'blue') targetByte |= 0x20;
    else if (snapshot.possessingTeam === 'red') targetByte |= 0x10;
    if (snapshot.isGoldenGoal) targetByte |= 0x08;

    const soundMask = snapshot.soundMask ?? 0;

    // Header (17 bytes)
    view.setUint8(0, OP_SNAPSHOT);
    view.setUint32(1, snapshot.tick >>> 0, false);
    view.setUint8(5, phase);
    view.setUint16(6, timer, false);
    view.setFloat32(8, subTimer, false);
    view.setUint8(12, targetByte);
    view.setUint8(13, red);
    view.setUint8(14, blue);
    view.setUint8(15, soundMask);
    view.setUint8(16, discCount);

    // Disc records (34 bytes per disc: Float32 vx/vy + inputMask + aimAngleByte)
    let offset = SnapshotPacket.HEADER_LENGTH;
    for (let i = 0; i < discCount; i++) {
      const disc = snapshot.discs[i]!;
      view.setUint16(offset, disc.id, false);
      view.setUint8(offset + 2, disc.team);

      let flags = 0;
      if (disc.kicking) flags |= 1 << 0;
      if (disc.team === 0) {
        if (disc.isSpinActive || (disc.spin !== undefined && disc.spin !== 0)) flags |= 1 << 1;
        if (disc.isCurvingAllowed) flags |= 1 << 2;
        if (disc.isPowerShot) flags |= 1 << 3;
      } else {
        if (disc.isDashing) flags |= 1 << 1;
        if (disc.isTurbo) flags |= 1 << 2;
        if (disc.isTyping) flags |= 1 << 3;
      }
      view.setUint8(offset + 3, flags);

      view.setFloat32(offset + 4, disc.x, false);
      view.setFloat32(offset + 8, disc.y, false);
      view.setFloat32(offset + 12, disc.vx, false);
      view.setFloat32(offset + 16, disc.vy, false);

      if (disc.team === 0) {
        const kickerIdNum = typeof disc.lastKickerId === 'number' ? disc.lastKickerId : 0;
        view.setUint16(offset + 20, kickerIdNum, false);
      } else {
        const c1 = disc.avatar.charCodeAt(0) || 32;
        const c2 = disc.avatar.charCodeAt(1) || 32;
        view.setUint16(offset + 20, (c1 << 8) | c2, false);
      }

      const staminaVal = disc.team !== 0 ? Math.max(0, Math.min(100, Math.round(disc.stamina ?? 100))) : 0;
      const curveFactorVal = disc.team === 0
        ? Math.max(-128, Math.min(127, Math.round(disc.spin !== undefined ? disc.spin * 10 : (disc.curveFactor ?? 0))))
        : 0;
      view.setUint8(offset + 22, staminaVal);
      view.setInt8(offset + 23, curveFactorVal);
      view.setUint32(offset + 24, disc.lastAckedInputSeq ?? 0, true);
      view.setUint8(offset + 28, Math.max(0, Math.min(255, Math.round(disc.dashTimer ?? 0))));
      view.setUint16(offset + 29, Math.max(0, Math.min(65535, Math.round((disc.dashCooldown ?? 0) * 1000))), true);
      view.setUint16(offset + 31, disc.team !== 0 ? ((disc.inputMask ?? 0) & 0xffff) : 0, true);
      view.setUint8(offset + 33, disc.team !== 0 ? ((disc.aimAngleByte ?? AIM_ANGLE_BYTE_NONE) & 0xff) : AIM_ANGLE_BYTE_NONE);

      offset += SnapshotPacket.DISC_LENGTH;
    }

    return buffer;
  }

  /** Decodifica OP_SNAPSHOT directamente en un `GameSnapshot` preasignado (Zero-Allocation). */
  public static decodeInto(buffer: ArrayBuffer | DataView, target: GameSnapshot): boolean {
    const view = getCachedDataView(buffer);

    if (view.byteLength < SnapshotPacket.HEADER_LENGTH) return false;
    if (view.getUint8(0) !== OP_SNAPSHOT) return false;

    const tick = view.getUint32(1, false);
    const phaseNum = view.getUint8(5);
    const matchPhase: MatchPhase = (phaseNum in MatchPhase) ? (phaseNum as MatchPhase) : MatchPhase.STOPPED;
    const timerSeconds = view.getUint16(6, false);
    const subStateTimer = view.getFloat32(8, false);
    const rawTarget = view.getUint8(12);
    const targetTeam = rawTarget & 0x03;
    const isGoldenGoal = (rawTarget & 0x08) !== 0;
    const kickoffActive = (rawTarget & 0x80) !== 0;
    const isTeamKickoff = (rawTarget & 0x40) !== 0;
    const kickoffMode: 'NEUTRAL' | 'TEAM_KICKOFF' = isTeamKickoff ? 'TEAM_KICKOFF' : 'NEUTRAL';
    let possessingTeam: 'red' | 'blue' | null = null;
    if (isTeamKickoff) {
      if ((rawTarget & 0x20) !== 0) possessingTeam = 'blue';
      else if ((rawTarget & 0x10) !== 0) possessingTeam = 'red';
    }

    const scoreRed = view.getUint8(13);
    const scoreBlue = view.getUint8(14);
    const soundMask = view.getUint8(15);
    const discCount = view.getUint8(16);

    const discStride = discCount > 0
      ? Math.floor((view.byteLength - SnapshotPacket.HEADER_LENGTH) / discCount)
      : SnapshotPacket.DISC_LENGTH;

    if (discStride < 18) return false;
    const expectedMinLength = SnapshotPacket.HEADER_LENGTH + discCount * discStride;
    if (view.byteLength < expectedMinLength) return false;

    target.tick = tick;
    target.matchPhase = matchPhase;
    target.timerSeconds = timerSeconds;
    target.subStateTimer = subStateTimer;
    target.targetTeam = targetTeam;
    target.scoreRed = scoreRed;
    target.scoreBlue = scoreBlue;
    target.soundMask = soundMask;
    target.kickoffActive = kickoffActive;
    target.kickoffMode = kickoffMode;
    target.possessingTeam = possessingTeam;
    target.isGoldenGoal = isGoldenGoal;
    target.matchState = matchPhase;
    target.matchTimerSeconds = timerSeconds;
    target.redScore = scoreRed;
    target.blueScore = scoreBlue;
    target.countdownSeconds = Math.ceil(subStateTimer);

    const activeCfg = typeof SnapshotPacket.activeConfig === 'function'
      ? SnapshotPacket.activeConfig()
      : SnapshotPacket.activeConfig;
    const ballRadius = activeCfg?.ballRadius ?? DEFAULT_GAMEPLAY_CONFIG.ballRadius;
    const playerRadius = activeCfg?.playerRadius ?? DEFAULT_GAMEPLAY_CONFIG.playerRadius;

    const discs = target.discs;
    let offset = SnapshotPacket.HEADER_LENGTH;

    for (let i = 0; i < discCount; i++) {
      const id = view.getUint16(offset, false);
      const team = view.getUint8(offset + 2) as 0 | 1 | 2;
      const flags = view.getUint8(offset + 3);
      const kicking = (flags & (1 << 0)) !== 0;
      const isDashing = team !== 0 && (flags & (1 << 1)) !== 0;
      const isTurbo = team !== 0 && (flags & (1 << 2)) !== 0;
      const isTyping = team !== 0 && (flags & (1 << 3)) !== 0;
      const isSpinActive = team === 0 && (flags & (1 << 1)) !== 0;
      const isCurvingAllowed = team === 0 && (flags & (1 << 2)) !== 0;
      const isPowerShot = team === 0 && (flags & (1 << 3)) !== 0;

      const x = view.getFloat32(offset + 4, false);
      const y = view.getFloat32(offset + 8, false);
      const isV2 = discStride >= 34;
      const vx = isV2 ? view.getFloat32(offset + 12, false) : view.getInt16(offset + 12, false) / 20;
      const vy = isV2 ? view.getFloat32(offset + 16, false) : view.getInt16(offset + 14, false) / 20;

      let avatar = '';
      let lastKickerId: number | undefined = undefined;
      const avatarOffset = isV2 ? offset + 20 : offset + 16;

      if (team === 0) {
        const rawKickerId = view.getUint16(avatarOffset, false);
        if (rawKickerId > 0 && rawKickerId !== 0x2020) {
          lastKickerId = rawKickerId;
        }
      } else {
        const avatarChars = view.getUint16(avatarOffset, false);
        const c1 = String.fromCharCode((avatarChars >> 8) & 0xff);
        const c2 = String.fromCharCode(avatarChars & 0xff);
        avatar = (c1 + c2).trim();
      }

      let stamina = 100;
      let curveFactor = 0;
      let lastAckedInputSeq: number | undefined = undefined;
      let dashTimer: number | undefined = undefined;
      let dashCooldown: number | undefined = undefined;
      let inputMask: number | undefined = undefined;
      let aimAngleByte: number | undefined = undefined;

      if (isV2) {
        stamina = view.getUint8(offset + 22);
        curveFactor = view.getInt8(offset + 23);
        lastAckedInputSeq = view.getUint32(offset + 24, true);
        dashTimer = view.getUint8(offset + 28);
        dashCooldown = view.getUint16(offset + 29, true) / 1000;
        inputMask = team !== 0 ? view.getUint16(offset + 31, true) : 0;
        aimAngleByte = team !== 0 ? view.getUint8(offset + 33) : AIM_ANGLE_BYTE_NONE;
      } else {
        if (discStride >= 20) {
          stamina = view.getUint8(offset + 18);
          curveFactor = view.getInt8(offset + 19);
        }
        if (discStride >= 26) {
          lastAckedInputSeq = view.getUint32(offset + 20, true);
          dashTimer = view.getUint8(offset + 24);
          dashCooldown = view.getUint8(offset + 25) / 100;
        }
      }

      let slot = discs[i];
      if (!slot) {
        slot = { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, radius: ballRadius, kicking: false, avatar: '' };
        discs[i] = slot;
      }

      slot.id = id;
      slot.team = team;
      slot.x = x;
      slot.y = y;
      slot.vx = vx;
      slot.vy = vy;
      slot.radius = team === 0 ? ballRadius : playerRadius;
      slot.kicking = kicking;
      slot.avatar = avatar;
      slot.stamina = team !== 0 ? stamina : undefined;
      slot.isDashing = team !== 0 ? isDashing : undefined;
      slot.isTurbo = team !== 0 ? isTurbo : undefined;
      slot.isTyping = team !== 0 ? isTyping : undefined;
      slot.isSpinActive = team === 0 ? isSpinActive : undefined;
      slot.isCurvingAllowed = team === 0 ? isCurvingAllowed : undefined;
      slot.isPowerShot = team === 0 ? isPowerShot : undefined;
      slot.lastKickerId = team === 0 ? lastKickerId : undefined;
      slot.curveFactor = team === 0 ? curveFactor : undefined;
      slot.spin = team === 0 ? (curveFactor / 10) : undefined;
      slot.lastAckedInputSeq = team !== 0 ? lastAckedInputSeq : undefined;
      slot.dashTimer = team !== 0 ? dashTimer : undefined;
      slot.dashCooldown = team !== 0 ? dashCooldown : undefined;
      slot.inputMask = team !== 0 ? inputMask : undefined;
      slot.aimAngleByte = team !== 0 ? aimAngleByte : undefined;

      offset += discStride;
    }

    discs.length = discCount;
    return true;
  }

  public static decode(buffer: ArrayBuffer | DataView): GameSnapshot | null {
    const out: GameSnapshot = {
      tick: 0,
      matchPhase: MatchPhase.STOPPED,
      timerSeconds: 0,
      subStateTimer: 0,
      targetTeam: 0,
      scoreRed: 0,
      scoreBlue: 0,
      discs: [],
      matchState: MatchPhase.STOPPED,
      matchTimerSeconds: 0,
      redScore: 0,
      blueScore: 0
    };
    return SnapshotPacket.decodeInto(buffer, out) ? out : null;
  }
}
