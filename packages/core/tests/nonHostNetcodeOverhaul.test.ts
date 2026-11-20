import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  JitterBuffer,
  MatchPhase,
  INPUT_FLAG_KICK,
  type GameSnapshot,
  type GameStateSnapshot
} from '../src/index';

function makeBinarySnap(tick: number, x: number, vx: number, y: number = 0, vy: number = 0): GameStateSnapshot {
  return {
    tick,
    phase: MatchPhase.PLAYING,
    matchTimer: 120,
    redScore: 0,
    blueScore: 0,
    soundMask: 0,
    discs: [
      { id: 0, team: 0, x, y, vx, vy, flags: 0, spin: 0 }
    ]
  };
}

function makeFullSnap(tick: number, x: number, vx: number, y: number = 0, vy: number = 0): GameSnapshot {
  return {
    tick,
    matchPhase: MatchPhase.PLAYING,
    matchState: MatchPhase.PLAYING,
    timerSeconds: 120,
    matchTimerSeconds: 120,
    subStateTimer: 0,
    countdownSeconds: 0,
    targetTeam: 0,
    scoreRed: 0,
    redScore: 0,
    scoreBlue: 0,
    blueScore: 0,
    discs: [
      {
        id: 0,
        team: 0,
        x,
        y,
        vx,
        vy,
        radius: 5.8,
        avatar: '',
        kicking: false
      }
    ]
  };
}

describe('Non-Host Netcode Overhaul (Core JitterBuffer & EngineInstance.setState)', () => {
  it('guarantees zero interpolation starvation under good ping (2-5ms jitter) with >= 28ms adaptive floor', () => {
    const jb = new JitterBuffer<GameStateSnapshot>(32, 30, true);
    const TICK_MS = 1000 / 60;
    const baseTime = 2000;

    // Warm up stream with 60 ticks of realistic low-jitter LAN/fiber arrivals (+/- 2.5ms)
    for (let i = 1; i <= 60; i++) {
      const jitter = ((i % 5) - 2) * 1.2; // [-2.4ms, +2.4ms]
      const arrival = baseTime + i * TICK_MS + jitter;
      jb.push(makeBinarySnap(i, i * 6, 360), arrival);
    }

    expect(jb.targetDelay).toBeGreaterThanOrEqual(28);
    expect(jb.interpolationDelayMs).toBeGreaterThanOrEqual(28);

    // Sample rendered timeline once steady-state buffer is filled: every query must interpolate inside a bracket (never extrapolate ahead of latest snapshot)
    let prevX = -1;
    let extrapolatedFrames = 0;
    const latestTick = 60;
    for (let f = 15; f <= 52; f++) {
      const queryNow = baseTime + f * TICK_MS + jb.interpolationDelayMs;
      const snap = jb.getInterpolatedSnapshot(queryNow);
      expect(snap).not.toBeNull();
      const ball = snap!.discs[0]!;
      if (snap!.tick >= latestTick && f < 58) {
        extrapolatedFrames++;
      }
      if (prevX >= 0) {
        expect(ball.x).toBeGreaterThanOrEqual(prevX);
      }
      prevX = ball.x;
    }

    expect(extrapolatedFrames).toBe(0);
  });

  it('keeps timeline monotonic with zero backward teleports after a +100ms latency spike and recovery', () => {
    const jb = new JitterBuffer<GameStateSnapshot>(32, 30, true);
    const TICK_MS = 1000 / 60;
    const baseTime = 5000;
    let prevBallX = -1;

    for (let tick = 1; tick <= 90; tick++) {
      let networkJitter = 0;
      if (tick >= 30 && tick <= 35) {
        networkJitter = 100; // Sudden +100ms Wi-Fi spike
      } else if (tick > 35) {
        networkJitter = (tick % 3) * 1.5; // Sudden recovery back to ~2ms jitter
      }

      const arrival = baseTime + tick * TICK_MS + networkJitter;
      jb.push(makeBinarySnap(tick, tick * 5, 300), arrival);

      // Query render state at steady cadence 3 ticks behind stream head
      if (tick >= 10) {
        const renderNow = baseTime + tick * TICK_MS;
        const interp = jb.getInterpolatedSnapshot(renderNow);
        expect(interp).not.toBeNull();
        const ball = interp!.discs[0]!;
        expect(Number.isFinite(ball.x)).toBe(true);
        if (prevBallX >= 0) {
          expect(ball.x).toBeGreaterThanOrEqual(prevBallX - 1e-6);
        }
        prevBallX = ball.x;
      }
    }
  });

  it('disables Hermite overshoot when velocity reverses on wall/post bounce (falls back to lerp)', () => {
    // Binary GameStateSnapshot path
    const jbBinary = new JitterBuffer<GameStateSnapshot>(28, 30, false);
    const TICK_MS = 1000 / 60;
    jbBinary.push(makeBinarySnap(10, 398, 420, 0, 0), 1000);
    jbBinary.push(makeBinarySnap(11, 400, -420, 0, 0), 1000 + TICK_MS);

    for (const alpha of [0.25, 0.5, 0.75]) {
      // renderTime = t0 + alpha * dt => now = renderTime + delay
      const queryNow = 1000 + alpha * TICK_MS + jbBinary.interpolationDelayMs;
      const snap = jbBinary.getInterpolatedSnapshot(queryNow)!;
      expect(snap.discs[0]!.x).toBeLessThanOrEqual(400 + 1e-6);
    }

    // Full GameSnapshot path
    const jbFull = new JitterBuffer<GameSnapshot>(28, 30, false);
    jbFull.push(makeFullSnap(10, 398, 420, 0, 0), 2000);
    jbFull.push(makeFullSnap(11, 400, -420, 0, 0), 2000 + TICK_MS);

    for (const alpha of [0.25, 0.5, 0.75]) {
      const queryNow = 2000 + alpha * TICK_MS + jbFull.interpolationDelayMs;
      const snap = jbFull.getInterpolatedSnapshot(queryNow)!;
      expect(snap.discs[0]!.x).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('EngineInstance.setState clears rt.kickConsumed when snapshot flags have kick bit = 0', () => {
    const engine = new EngineInstance('mediano');
    engine.isPracticeMode = true;
    engine.startMatch(false);
    engine.fsm.startPlaying();
    const p = engine.addPlayer(2, 'red');
    p.pos.set(-25, 0);
    engine.ball.pos.set(0, 0);

    const rt = (engine as any).getRuntime(2);
    rt.kickConsumed = true;

    const snapNoKick = engine.getState();
    const pDisc = snapNoKick.discs.find((d) => d.id === 2)!;
    pDisc.flags &= ~1; // Ensure kick flag cleared

    engine.setState(snapNoKick);
    expect(rt.kickConsumed).toBe(false);

    // Move within kick reach and assert player can immediately kick
    p.pos.set(-18, 0);
    engine.step(new Map([[2, { inputMask: INPUT_FLAG_KICK, sequence: 10 } as any]]), true);
    expect(engine.ball.vel.x).toBeGreaterThan(100);
  });
});
