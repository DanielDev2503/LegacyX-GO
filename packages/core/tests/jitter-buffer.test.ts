import { describe, it, expect } from 'vitest';
import {
  JitterBuffer,
  type GameStateSnapshot,
  MatchPhase
} from '../src/index';

function createSnapshot(tick: number, x: number, vx: number = 10): GameStateSnapshot {
  return {
    tick,
    phase: MatchPhase.PLAYING,
    matchTimer: 180,
    redScore: 0,
    blueScore: 0,
    soundMask: 0,
    discs: [
      {
        id: 0, // Ball
        team: 0,
        x,
        y: 0,
        vx,
        vy: 0,
        flags: 0
      }
    ]
  };
}

describe('JitterBuffer Resiliency & Interpolation', () => {
  it('filtra duplicados y reordena 20 paquetes desordenados entregando interpolación secuencial suave', () => {
    const jb = new JitterBuffer(50, 30); // 50 ms delay, max 30 items
    const baseTime = 1000; // ms

    // Generar 20 snapshots a 60 Hz (~16.6 ms por tick)
    const snapshots: Array<{ snapshot: GameStateSnapshot; arrivalTime: number }> = [];
    for (let i = 0; i < 20; i++) {
      const tick = 100 + i;
      const expectedTime = baseTime + i * 16.666;
      // Añadir jitter variable de hasta 30 ms
      const arrivalTime = expectedTime + ((i % 3 === 0) ? 25 : (i % 2 === 0 ? -15 : 10));
      snapshots.push({
        snapshot: createSnapshot(tick, i * 10),
        arrivalTime
      });
    }

    // Desordenar deliberadamente algunos paquetes para simular red hostil
    const reordered = [...snapshots];
    // Intercambiar paquete 5 y 6
    const tmp = reordered[5];
    reordered[5] = reordered[6];
    reordered[6] = tmp;
    // Intercambiar paquete 12 y 14
    const tmp2 = reordered[12];
    reordered[12] = reordered[14];
    reordered[14] = tmp2;

    // Insertar paquetes desordenados
    for (const item of reordered) {
      jb.push(item.snapshot, item.arrivalTime);
    }

    // Insertar paquetes duplicados (ej. retransmisiones)
    jb.push(snapshots[4].snapshot, snapshots[4].arrivalTime + 5);
    jb.push(snapshots[10].snapshot, snapshots[10].arrivalTime + 15);

    // 1. Verificar que el búfer interno quedó estrictamente ordenado por tick
    expect(jb.buffer.length).toBe(20); // Duplicados filtrados
    for (let i = 0; i < jb.buffer.length - 1; i++) {
      expect(jb.buffer[i].snapshot.tick).toBeLessThan(jb.buffer[i + 1].snapshot.tick);
      expect(jb.buffer[i + 1].snapshot.tick - jb.buffer[i].snapshot.tick).toBe(1);
    }

    // 2. Probar interpolación secuencial continua sin saltos bruscos
    let previousX = -1;
    for (let t = baseTime + 50; t <= baseTime + 300; t += 16) {
      const state = jb.getInterpolatedSnapshot(t);
      if (state && state.discs.length > 0) {
        const ball = state.discs[0];
        if (previousX >= 0) {
          // La posición debe avanzar monótonamente (x aumenta constantemente hacia adelante)
          expect(ball.x).toBeGreaterThanOrEqual(previousX);
        }
        previousX = ball.x;
      }
    }
  });

  it('extrapola linealmente con velocidades cuando la latencia supera el snapshot más reciente', () => {
    const jb = new JitterBuffer(33, 10);
    const s1 = createSnapshot(50, 100, 20); // x=100, vx=20 px/s
    jb.push(s1, 1000);

    const s2 = createSnapshot(51, 120, 20); // x=120, vx=20 px/s
    jb.push(s2, 1016);

    // Consultar en t=1100 ms (renderTime = 1100 - 33 = 1067 ms > 1016 ms)
    const interpolated = jb.getInterpolatedSnapshot(1100);
    expect(interpolated).not.toBeNull();
    const ball = interpolated!.discs[0];

    // Extrapolado: deltaSec = (1067 - 1016) / 1000 = 0.051 s
    // x = 120 + 20 * 0.051 = 121.02 px
    expect(ball.x).toBeGreaterThan(120);
    expect(ball.x).toBeCloseTo(121.02, 1);
  });
});
