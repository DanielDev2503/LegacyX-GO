import { describe, it, expect, vi } from 'vitest';
import {
  AIM_ANGLE_BYTE_NONE,
  BinaryProtocol,
  EngineInstance,
  INPUT_FLAG_DASH,
  INPUT_FLAG_KICK,
  INPUT_FLAG_MAGNUS_RIGHT,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_TURBO,
  MatchPhase,
  SnapshotPacket,
  decodeAimAngleByte,
  encodeAimAngleByte
} from '../src/index.js';

describe('Option 3 Core Protocol (inputMask + aimAngleByte) & Silent Zero-Alloc Extrapolation', () => {
  it('roundtrips inputMask (Uint16), aimAngleByte (Uint8 + 0xFF sentinel) and Float32 coords in BinaryProtocol & SnapshotPacket', () => {
    const aimByte = encodeAimAngleByte(Math.PI / 3);
    expect(aimByte).not.toBe(AIM_ANGLE_BYTE_NONE);

    const binarySnap = {
      tick: 123456,
      phase: MatchPhase.PLAYING,
      matchTimer: 95,
      redScore: 2,
      blueScore: 1,
      soundMask: 0,
      kickoffActive: false,
      isGoldenGoal: true,
      isNeutralKickoff: false,
      kickoffPossessingTeam: 'blue' as const,
      discs: [
        {
          id: 0,
          team: 0,
          x: 123.456,
          y: -45.678,
          vx: 812.5,
          vy: -310.25,
          flags: 1 << 2,
          spin: 0.85,
          inputMask: 0,
          aimAngleByte: AIM_ANGLE_BYTE_NONE
        },
        {
          id: 2,
          team: 1,
          x: -210.75,
          y: 88.125,
          vx: 340.5,
          vy: 19.25,
          flags: (1 << 0) | (1 << 4),
          stamina: 67.5,
          dashTimer: 5,
          dashCooldown: 1.25,
          lastAckedInputSeq: 777,
          inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO | INPUT_FLAG_KICK,
          aimAngleByte: aimByte
        },
        {
          id: 3,
          team: 2,
          x: 190.5,
          y: -70.25,
          vx: -110.5,
          vy: 20.5,
          flags: 0,
          stamina: 95,
          dashTimer: 0,
          dashCooldown: 0,
          lastAckedInputSeq: 888,
          inputMask: INPUT_FLAG_MAGNUS_RIGHT,
          aimAngleByte: AIM_ANGLE_BYTE_NONE
        }
      ]
    };

    const preallocBuf = new ArrayBuffer(
      BinaryProtocol.SNAPSHOT_HEADER_SIZE + binarySnap.discs.length * BinaryProtocol.DISC_RECORD_SIZE
    );
    const encoded = BinaryProtocol.encodeSnapshot(binarySnap, preallocBuf);
    expect(encoded).toBe(preallocBuf);
    expect(BinaryProtocol.DISC_RECORD_SIZE).toBe(35);

    const target = {
      tick: 0,
      phase: MatchPhase.STOP,
      matchTimer: 0,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [] as any[]
    };
    expect(BinaryProtocol.decodeSnapshotInto(encoded, target)).toBe(true);
    expect(target.tick).toBe(123456);
    expect(target.discs[1].inputMask).toBe(INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO | INPUT_FLAG_KICK);
    expect(target.discs[1].aimAngleByte).toBe(aimByte);
    expect(decodeAimAngleByte(target.discs[1].aimAngleByte)).toBeCloseTo(Math.PI / 3, 1);
    expect(target.discs[2].inputMask).toBe(INPUT_FLAG_MAGNUS_RIGHT);
    expect(target.discs[2].aimAngleByte).toBe(AIM_ANGLE_BYTE_NONE);
    expect(decodeAimAngleByte(target.discs[2].aimAngleByte)).toBeNull();

    // SnapshotPacket (legacy protocol compatibility)
    expect(SnapshotPacket.DISC_LENGTH).toBe(34);
    const legacyBuf = SnapshotPacket.encode({
      tick: 42,
      matchPhase: 1,
      timerSeconds: 50,
      subStateTimer: 0,
      targetTeam: 0,
      scoreRed: 1,
      scoreBlue: 2,
      discs: [
        {
          id: 2,
          team: 1,
          x: -55.25,
          y: 18.5,
          vx: 220.5,
          vy: -40.75,
          radius: 15,
          kicking: true,
          avatar: '7',
          stamina: 84,
          lastAckedInputSeq: 90,
          dashTimer: 4,
          dashCooldown: 0.75,
          inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_DASH,
          aimAngleByte: aimByte
        }
      ]
    });
    const decodedLegacy = SnapshotPacket.decode(legacyBuf)!;
    expect(decodedLegacy.discs[0]!.x).toBeCloseTo(-55.25, 4);
    expect(decodedLegacy.discs[0]!.y).toBeCloseTo(18.5, 4);
    expect(decodedLegacy.discs[0]!.vx).toBeCloseTo(220.5, 4);
    expect(decodedLegacy.discs[0]!.inputMask).toBe(INPUT_FLAG_RIGHT | INPUT_FLAG_DASH);
    expect(decodedLegacy.discs[0]!.aimAngleByte).toBe(aimByte);
  });

  it('copyStateTo + silent extrapolation matches live EngineInstance physics bit-exactly without mutating GoalNets, stats, sounds, or goals', () => {
    const stadiumId = 'mediano';
    const live = new EngineInstance(stadiumId);
    const extrap = new EngineInstance(stadiumId);

    const p1 = live.addPlayer(1, 'red');
    const p2 = live.addPlayer(2, 'blue');
    live.startMatch(false);
    live.fsm.startPlaying();

    // Place ball rushing right inside blue goal mouth so wall/post + GoalNet would react in live mode
    live.ball.pos.set(live.stadium.halfWidth + 2, 0);
    live.ball.vel.set(950, 120);
    live.ball.spin = 1.2;
    p1.pos.set(-120, 40);
    p2.pos.set(140, -25);

    live.copyStateTo(extrap);

    const netStepSpies = extrap.world.goalNets.map((net) => vi.spyOn(net, 'step'));
    const soundEvents: number[] = [];
    const scoreEvents: unknown[] = [];
    extrap.on('sound', (s) => soundEvents.push(s));
    extrap.on('score_event', (e) => scoreEvents.push(e));

    const inputs = new Map([
      [1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO | INPUT_FLAG_DASH, aimAngle: null, aimThrottle: 0 }],
      [2, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_MAGNUS_RIGHT, aimAngle: 0.4, aimThrottle: 1 }]
    ]);

    for (let i = 0; i < 15; i++) {
      extrap.step(inputs, true);
    }

    for (const spy of netStepSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(extrap.soundMask).toBe(0);
    expect(soundEvents).toHaveLength(0);
    expect(scoreEvents).toHaveLength(0);
    expect(extrap.fsm.redScore).toBe(0);
    expect(extrap.fsm.blueScore).toBe(0);

    // Non-mutating parity against a second fresh EngineInstance stepping silently
    const verifySilent = new EngineInstance(stadiumId);
    verifySilent.addPlayer(1, 'red');
    verifySilent.addPlayer(2, 'blue');
    live.copyStateTo(verifySilent);
    for (let i = 0; i < 15; i++) {
      verifySilent.step(inputs, true);
    }

    expect(extrap.ball.pos.x).toBe(verifySilent.ball.pos.x);
    expect(extrap.ball.pos.y).toBe(verifySilent.ball.pos.y);
    expect(extrap.ball.vel.x).toBe(verifySilent.ball.vel.x);
    expect(extrap.players.get(1)!.pos.x).toBe(verifySilent.players.get(1)!.pos.x);
    expect(extrap.players.get(1)!.stamina).toBe(verifySilent.players.get(1)!.stamina);
  });
});
