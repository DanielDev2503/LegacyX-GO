import { describe, it, expect } from 'vitest';
import {
  BinaryProtocol,
  type PlayerInput,
  type GameStateSnapshot,
  MatchPhase,
  SOUND_KICK,
  SOUND_POST_HIT,
  INPUT_FLAG_UP,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_KICK,
  INPUT_FLAG_MAGNUS_LEFT
} from '../src/index';

describe('BinaryProtocol Serialization & Quantization', () => {
  it('serializa y deserializa comandos de input manteniendo banderas y direcciones', () => {
    const input: PlayerInput = {
      dirX: 0.7071,
      dirY: -0.7071,
      kick: true,
      dash: false,
      magnusLeft: true,
      magnusRight: false
    };

    const buffer = BinaryProtocol.encodeInput(input);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBe(BinaryProtocol.INPUT_SIZE); // 9 bytes: opcode (1) + seq (4) + mask (2) + timestamp (2)

    const view = new DataView(buffer);
    const decoded = BinaryProtocol.decodeInput(view);
    expect(decoded).not.toBeNull();

    expect(decoded!.kick).toBe(true);
    expect(decoded!.magnusLeft).toBe(true);
    expect(decoded!.dash).toBe(false);
    expect(decoded!.magnusRight).toBe(false);

    // Precisión de dirección cuantizada en int8 (-127 a 127)
    expect(decoded!.dirX).toBeCloseTo(0.7071, 1);
    expect(decoded!.dirY).toBeCloseTo(-0.7071, 1);
  });

  it('preserva máscaras binarias de input directo con todas las combinaciones de botones', () => {
    const mask = INPUT_FLAG_UP | INPUT_FLAG_RIGHT | INPUT_FLAG_KICK | INPUT_FLAG_MAGNUS_LEFT;
    const input: PlayerInput = { inputMask: mask };

    const buffer = BinaryProtocol.encodeInput(input);
    const decoded = BinaryProtocol.decodeInput(new DataView(buffer));
    expect(decoded).not.toBeNull();

    expect(decoded!.inputMask).toBe(mask);
    expect(decoded!.kick).toBe(true);
    expect(decoded!.magnusLeft).toBe(true);
  });

  it('serializa y deserializa GameStateSnapshot sin truncar coordenadas del estadio AF', () => {
    const originalSnapshot: GameStateSnapshot = {
      tick: 3600,
      phase: MatchPhase.PLAYING,
      matchTimer: 180,
      redScore: 3,
      blueScore: 2,
      soundMask: SOUND_KICK | SOUND_POST_HIT,
      discs: [
        {
          id: 0,
          team: 0,
          x: 420.75,
          y: -180.25,
          vx: 15.6,
          vy: -8.4,
          flags: 6,
          spin: 1.2
        },
        {
          id: 1,
          team: 1, // Red
          x: -550.0,
          y: 75.5,
          vx: 2.4,
          vy: -1.2,
          flags: 2
        },
        {
          id: 2,
          team: 2, // Blue
          x: 610.2,
          y: -45.0,
          vx: -3.1,
          vy: 0.8,
          flags: 0
        }
      ]
    };

    const encoded = BinaryProtocol.encodeSnapshot(originalSnapshot);
    expect(encoded).toBeInstanceOf(ArrayBuffer);

    const decoded = BinaryProtocol.decodeSnapshot(encoded);
    expect(decoded).not.toBeNull();

    expect(decoded!.tick).toBe(originalSnapshot.tick);
    expect(decoded!.phase).toBe(originalSnapshot.phase);
    expect(decoded!.matchTimer).toBe(originalSnapshot.matchTimer);
    expect(decoded!.redScore).toBe(originalSnapshot.redScore);
    expect(decoded!.blueScore).toBe(originalSnapshot.blueScore);
    expect(decoded!.soundMask).toBe(originalSnapshot.soundMask);
    expect(decoded!.discs.length).toBe(3);

    // Verificación de coordenadas con tolerancia de cuantización fija (< 0.1 px)
    for (let i = 0; i < originalSnapshot.discs.length; i++) {
      const orig = originalSnapshot.discs[i];
      const dec = decoded!.discs[i];

      expect(dec.id).toBe(orig.id);
      expect(dec.team).toBe(orig.team);
      expect(dec.x).toBeCloseTo(orig.x, 1);
      expect(dec.y).toBeCloseTo(orig.y, 1);
      expect(dec.vx).toBeCloseTo(orig.vx, 1);
      expect(dec.vy).toBeCloseTo(orig.vy, 1);
      expect(dec.flags).toBe(orig.flags);

      if (orig.spin !== undefined && dec.spin !== undefined) {
        expect(dec.spin).toBeCloseTo(orig.spin, 1);
      }
    }
  });
});
