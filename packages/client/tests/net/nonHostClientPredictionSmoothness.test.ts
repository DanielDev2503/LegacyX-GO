import { describe, it, expect } from 'vitest';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction';
import {
  EngineInstance,
  BinaryProtocol,
  type PlayerInput,
  type GameStateSnapshot,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_UP,
  INPUT_FLAG_DOWN,
  INPUT_FLAG_LEFT,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH
} from '@legacyx/core';

describe('ClientPredictionReconciler Smoothness & Zero-Pop Determinism', () => {
  it('guarantees 0.000 px screen jump upon receiving authoritative snapshots with Float32 and Uint32 sequences', () => {
    const reconciler = new ClientPredictionReconciler();
    const engine = new EngineInstance('AF 3v3');
    engine.startMatch(false);
    const p = engine.addPlayer(1, 'red');

    // Simulate 10 local client prediction ticks
    for (let t = 1; t <= 10; t++) {
      reconciler.recordInput(t, INPUT_FLAG_RIGHT | (t > 5 ? INPUT_FLAG_TURBO : 0));
    }

    // Capture visual position before snapshot reconciliation
    const visualBeforeX = p.pos.x + reconciler.visualOffset.x;
    const visualBeforeY = p.pos.y + reconciler.visualOffset.y;

    // Authoritative snapshot arriving from host acknowledging tick 6
    const snap: GameStateSnapshot = {
      tick: 6,
      phase: 1, // PLAYING
      discs: [
        {
          id: 1,
          team: 1,
          x: p.pos.x - 3.25, // Slight divergence due to latency/substep
          y: p.pos.y,
          vx: p.vel.x,
          vy: p.vel.y,
          radius: 15,
          flags: 0,
          stamina: 95,
          lastAckedInputSeq: 6
        }
      ]
    };

    const res = reconciler.reconcile(engine, snap, 1);
    expect(res.replayed).toBe(true);
    expect(res.hardSnapped).toBe(false);

    // Pending inputs 7..10 remain
    expect(reconciler.pendingInputs.map((i) => i.seq ?? i.tick)).toEqual([7, 8, 9, 10]);

    // Screen position is exactly preserved (0.000 px pop!)
    const replayedPlayer = engine.players.get(1)!;
    const visualAfterX = replayedPlayer.pos.x + reconciler.visualOffset.x;
    const visualAfterY = replayedPlayer.pos.y + reconciler.visualOffset.y;

    expect(Math.hypot(visualAfterX - visualBeforeX, visualAfterY - visualBeforeY)).toBeLessThan(0.001);

    // After 10 rAF frames (~160 ms), visualOffset smoothly decays towards 0
    for (let f = 0; f < 10; f++) {
      reconciler.updateVisualSmoothing(1 / 60);
    }
    expect(Math.abs(reconciler.visualOffset.x)).toBeLessThan(1.0);
  });

  it('triggers hard snap when discrepancy exceeds 90 px catastrophic threshold (e.g. goal scored / respawn)', () => {
    const reconciler = new ClientPredictionReconciler();
    const engine = new EngineInstance('AF 3v3');
    engine.startMatch(false);
    const p = engine.addPlayer(1, 'red');
    p.pos.set(200, 100);

    const snapRespawn: GameStateSnapshot = {
      tick: 20,
      phase: 1,
      discs: [
        {
          id: 1,
          team: 1,
          x: -250, // Respawned at red base
          y: 0,
          vx: 0,
          vy: 0,
          radius: 15,
          flags: 0,
          stamina: 100,
          lastAckedInputSeq: 20
        }
      ]
    };

    const res = reconciler.reconcile(engine, snapRespawn, 1);
    expect(res.hardSnapped).toBe(true);
    expect(reconciler.visualOffset.x).toBe(0);
    expect(reconciler.visualOffset.y).toBe(0);
    expect(engine.players.get(1)!.pos.x).toBe(-250);
  });
});
