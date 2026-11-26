import { describe, it, expect } from 'vitest';
import { SharedSimSync } from '../../src/net/SharedSimSync';
import { MatchPhase, type GameStateSnapshot } from '@legacyx/core';

describe('SharedSimSync Smoothness & Hard-Snap Determinism', () => {
  it('guarantees 0.00 px screen jump on minor snapshot discrepancy and decays exponentially', () => {
    const sync = new SharedSimSync('AF 3v3');
    const snap1: GameStateSnapshot = {
      tick: 5,
      phase: MatchPhase.PLAYING,
      matchTimer: 10,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [
        { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
        { id: 1, team: 1, x: -100, y: 0, vx: 0, vy: 0, flags: 0, stamina: 95 }
      ]
    };
    sync.onSnapshot(snap1, 1000);
    const visualBefore = sync.buildRenderSnapshot(0, 1000)!.discs.find((d) => d.id === 1)!.x;

    // Next snapshot diverges by 3.25 px -> absorbed into visualOffset
    const snap2: GameStateSnapshot = {
      tick: 6,
      phase: MatchPhase.PLAYING,
      matchTimer: 10,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [
        { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
        { id: 1, team: 1, x: -103.25, y: 0, vx: 0, vy: 0, flags: 0, stamina: 95 }
      ]
    };
    sync.onSnapshot(snap2, 1016);
    const visualAfter = sync.buildRenderSnapshot(0, 1016)!.discs.find((d) => d.id === 1)!.x;
    expect(Math.abs(visualAfter - visualBefore)).toBeLessThan(0.01);
    expect(sync.getTelemetry(undefined, 1016).hardSnaps).toBe(0);

    // After 10 rAF frames (~166 ms), exp(-20 * dt) converges close to authoritative -103.25
    for (let f = 1; f <= 10; f++) {
      sync.update(1 / 60, 1016 + f * (1000 / 60));
    }
    const settled = sync.buildRenderSnapshot(0, 1183)!.discs.find((d) => d.id === 1)!.x;
    expect(Math.abs(settled - -103.25)).toBeLessThan(0.25);
  });

  it('triggers clean hard snap when discrepancy exceeds 90 px threshold (e.g. kickoff / respawn)', () => {
    const sync = new SharedSimSync('AF 3v3');
    sync.onSnapshot(
      {
        tick: 19,
        phase: MatchPhase.PLAYING,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
          { id: 1, team: 1, x: 200, y: 100, vx: 0, vy: 0, flags: 0, stamina: 100 }
        ]
      },
      1000
    );

    sync.onSnapshot(
      {
        tick: 20,
        phase: MatchPhase.PLAYING,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
          { id: 1, team: 1, x: -250, y: 0, vx: 0, vy: 0, flags: 0, stamina: 100 }
        ]
      },
      1016
    );

    const rendered = sync.buildRenderSnapshot(0, 1016)!;
    expect(sync.getTelemetry(undefined, 1016).hardSnaps).toBe(1);
    expect(rendered.discs.find((d) => d.id === 1)!.x).toBe(-250);
    expect(rendered.discs.find((d) => d.id === 1)!.y).toBe(0);
  });
});
