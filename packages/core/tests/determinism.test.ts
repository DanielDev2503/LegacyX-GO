import { describe, it, expect } from 'vitest';
import { EngineInstance } from '../src/index';
import { PlayerInput, INPUT_FLAG_UP, INPUT_FLAG_DOWN, INPUT_FLAG_LEFT, INPUT_FLAG_RIGHT, INPUT_FLAG_KICK, INPUT_FLAG_DASH } from '../src/protocol/BinaryProtocol';

describe('Deterministic 60 Hz Physics Benchmark', () => {
  it('reproduces bit-for-bit identical state across 3,600 ticks for 6 players (3v3)', () => {
    // Generador pseudoaleatorio determinista LCG (semilla fija 1337)
    function createPseudoRandom(seed: number) {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    const TICKS = 3600; // 60 segundos completos a 60 Hz
    const rng = createPseudoRandom(1337);

    // Pre-generar matriz de inputs deterministas [tick][playerId]
    const precomputedInputs: Array<Map<number, PlayerInput>> = [];
    const playerIds = [1, 2, 3, 4, 5, 6];

    for (let t = 0; t < TICKS; t++) {
      const tickInputs = new Map<number, PlayerInput>();
      for (const id of playerIds) {
        let mask = 0;
        const r = rng();
        if (r < 0.25) mask |= INPUT_FLAG_LEFT;
        else if (r < 0.50) mask |= INPUT_FLAG_RIGHT;
        if (r > 0.40 && r < 0.65) mask |= INPUT_FLAG_UP;
        else if (r > 0.65 && r < 0.90) mask |= INPUT_FLAG_DOWN;
        if (r > 0.85) mask |= INPUT_FLAG_KICK;
        if (r > 0.92) mask |= INPUT_FLAG_DASH;

        tickInputs.set(id, {
          sequence: t,
          inputMask: mask,
          clientTimestamp: t * 16
        });
      }
      precomputedInputs.push(tickInputs);
    }

    // Ejecución 1
    const engine1 = new EngineInstance('AF 3v3');
    engine1.addPlayer(1, 'red');
    engine1.addPlayer(2, 'red');
    engine1.addPlayer(3, 'red');
    engine1.addPlayer(4, 'blue');
    engine1.addPlayer(5, 'blue');
    engine1.addPlayer(6, 'blue');
    engine1.startMatch();

    for (let t = 0; t < TICKS; t++) {
      engine1.step(precomputedInputs[t]);
    }

    const state1 = engine1.getState();
    const snapshot1 = new Uint8Array(engine1.getSnapshot());

    // Ejecución 2 (desde cero con idéntica configuración e inputs)
    const engine2 = new EngineInstance('AF 3v3');
    engine2.addPlayer(1, 'red');
    engine2.addPlayer(2, 'red');
    engine2.addPlayer(3, 'red');
    engine2.addPlayer(4, 'blue');
    engine2.addPlayer(5, 'blue');
    engine2.addPlayer(6, 'blue');
    engine2.startMatch();

    for (let t = 0; t < TICKS; t++) {
      engine2.step(precomputedInputs[t]);
    }

    const state2 = engine2.getState();
    const snapshot2 = new Uint8Array(engine2.getSnapshot());

    // Verificaciones exactas
    expect(state1.tick).toBe(TICKS);
    expect(state2.tick).toBe(TICKS);
    expect(state1.phase).toBe(state2.phase);
    expect(state1.redScore).toBe(state2.redScore);
    expect(state1.blueScore).toBe(state2.blueScore);

    // Comparación entidad por entidad
    expect(state1.discs.length).toBe(state2.discs.length);
    for (let i = 0; i < state1.discs.length; i++) {
      const d1 = state1.discs[i];
      const d2 = state2.discs[i];
      expect(d1.id).toBe(d2.id);
      expect(d1.x).toBe(d2.x);
      expect(d1.y).toBe(d2.y);
      expect(d1.vx).toBe(d2.vx);
      expect(d1.vy).toBe(d2.vy);
      expect(d1.flags).toBe(d2.flags);
    }

    // Comparación binaria byte a byte del snapshot WebRTC
    expect(snapshot1).toEqual(snapshot2);
  });
});
