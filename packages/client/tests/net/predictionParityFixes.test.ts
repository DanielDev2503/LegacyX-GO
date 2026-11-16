import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EngineInstance, MatchPhase, createStadium, type GameStateSnapshot } from '@legacyx/core';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction.js';
import { SimulationTicker } from '../../src/net/SimulationTicker.js';
import { DiscRenderer } from '../../src/renderer/DiscRenderer.js';

describe('Goal 4 Client Prediction & Netcode Parity Fixes', () => {
  describe('1. ClientPrediction.recordInput returns seq & tracks lastRecordedSeq', () => {
    it('returns the assigned sequence number and updates lastRecordedSeq monotonically', () => {
      const reconciler = new ClientPredictionReconciler();

      const seq1 = reconciler.recordInput(1, 0b0001);
      expect(seq1).toBe(1);
      expect(reconciler.lastRecordedSeq).toBe(1);

      const seq2 = reconciler.recordInput(2, 0b0010);
      expect(seq2).toBe(2);
      expect(reconciler.lastRecordedSeq).toBe(2);

      const seq3 = reconciler.recordInput({
        tick: 3,
        mask: 0b0100
      });
      expect(seq3).toBe(3);
      expect(reconciler.lastRecordedSeq).toBe(3);
    });
  });

  describe('2. ClientPrediction dashCooldown bug fix (no double / 1000)', () => {
    it('preserves seconds-based dashCooldown in engine reconciliation without dividing by 1000 again', () => {
      const reconciler = new ClientPredictionReconciler();
      const engine = new EngineInstance();
      const stadium = createStadium('mediano');

      const snapshot: GameStateSnapshot = {
        tick: 50,
        phase: MatchPhase.PLAYING,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
          {
            id: 1,
            team: 1,
            x: 10,
            y: 10,
            vx: 0,
            vy: 0,
            flags: 0,
            dashTimer: 0,
            dashCooldown: 1.5, // Decoded already in seconds (1.5s)
            lastAckedInputSeq: 50
          }
        ]
      };

      reconciler.reconcile(engine, snapshot, 1);

      const rt = (engine as any).getRuntime(1);
      expect(rt.cooldownTimer).toBeCloseTo(1.5, 4);
      expect(rt.cooldownTimer).not.toBeCloseTo(0.0015, 4);
    });

    it('preserves seconds-based dashCooldown in snapshot-only reconciliation', () => {
      const reconciler = new ClientPredictionReconciler();
      const stadium = createStadium('mediano');

      const snapshot: GameStateSnapshot = {
        tick: 50,
        phase: MatchPhase.PLAYING,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
          {
            id: 1,
            team: 1,
            x: 10,
            y: 10,
            vx: 0,
            vy: 0,
            flags: 0,
            dashTimer: 0,
            dashCooldown: 1.5,
            lastAckedInputSeq: 50
          }
        ]
      };

      reconciler.reconcile(snapshot, 1, stadium);
      expect(reconciler.predictedState.dashCooldownTimer).toBeCloseTo(1.5, 4);
    });
  });

  describe('3. didHardSnapLastReconcile telemetry flag', () => {
    it('sets didHardSnapLastReconcile true on snapshot-driven phases and false on smooth error corrections', () => {
      const reconciler = new ClientPredictionReconciler();
      const engine = new EngineInstance();

      // Snapshot in STOPPED phase (snapshot-driven)
      const stopSnapshot: GameStateSnapshot = {
        tick: 1,
        phase: MatchPhase.STOP,
        matchTimer: 0,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 1, team: 1, x: 0, y: 0, vx: 0, vy: 0, flags: 0 }]
      };

      const res1 = reconciler.reconcile(engine, stopSnapshot, 1);
      expect(res1.hardSnapped).toBe(true);
      expect(reconciler.didHardSnapLastReconcile).toBe(true);

      // Subsequent snapshot in PLAYING phase with negligible error
      const playSnapshot: GameStateSnapshot = {
        tick: 2,
        phase: MatchPhase.PLAYING,
        matchTimer: 1,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 1, team: 1, x: 0, y: 0, vx: 0, vy: 0, flags: 0 }]
      };

      const res2 = reconciler.reconcile(engine, playSnapshot, 1);
      expect(res2.hardSnapped).toBe(false);
      expect(reconciler.didHardSnapLastReconcile).toBe(false);

      // Huge catastrophic error > 90px
      reconciler.visualOffset.x = 100;
      const res3 = reconciler.reconcile(engine, playSnapshot, 1);
      expect(res3.hardSnapped).toBe(true);
      expect(reconciler.didHardSnapLastReconcile).toBe(true);
    });
  });

  describe('4. SimulationTicker main-thread clock synchronization', () => {
    it('uses performance.now() from main-thread avoiding Worker timeOrigin offset', () => {
      let executedTicks = 0;
      const ticker = new SimulationTicker(() => {
        executedTicks++;
      });

      // Spy on performance.now()
      const perfSpy = vi.spyOn(performance, 'now');
      perfSpy.mockReturnValue(12345.67);

      // Call internal stepAccumulator directly as worker onmessage does
      ticker['stepAccumulator'](performance.now());
      expect(perfSpy).toHaveBeenCalled();

      perfSpy.mockRestore();
    });
  });

  describe('5. DiscRenderer ribbon/ghost teleport reset & skipNextFrameExtrapolation', () => {
    it('resets turbo ribbon history when disc position jumps > 55 px (kickoff/goal teleport)', () => {
      const renderer = new DiscRenderer();

      const disc1 = { id: 1, team: 1, x: 100, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordRibbonPoint'](disc1);

      const disc2 = { id: 1, team: 1, x: 105, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordRibbonPoint'](disc2);

      const buf = renderer['ribbonMap'].get(1)!;
      expect(buf.count).toBe(2);

      // Teleport across the field: dx = 300px > 55px
      const discTeleport = { id: 1, team: 1, x: 405, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordRibbonPoint'](discTeleport);

      // Count must reset to 1 instead of continuing the ribbon streak across the pitch
      expect(buf.count).toBe(1);
      expect(buf.posX[buf.head]).toBe(405);
    });

    it('resets dash ghost history when disc position jumps > 70 px', () => {
      const renderer = new DiscRenderer();

      const disc1 = { id: 1, team: 1, x: 100, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordDashGhost'](disc1);

      const disc2 = { id: 1, team: 1, x: 110, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordDashGhost'](disc2);

      const slots = renderer['ghostMap'].get(1)!;
      let activeCount = slots.filter((s) => s.active).length;
      expect(activeCount).toBe(2);

      // Teleport across the field: dx = 290px > 70px
      const discTeleport = { id: 1, team: 1, x: 400, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordDashGhost'](discTeleport);

      // Previous ghosts deactivated, only the new one is active
      activeCount = slots.filter((s) => s.active).length;
      expect(activeCount).toBe(1);
      const newest = slots[slots.length - 1]!;
      expect(newest.active).toBe(true);
      expect(newest.x).toBe(400);
    });

    it('skipNextFrameExtrapolation bypasses extrapolation for one frame and resets automatically', () => {
      const renderer = new DiscRenderer();
      renderer.setExtrapolation(100);

      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn()
      } as unknown as CanvasRenderingContext2D;

      const remoteDisc = {
        id: 2,
        team: 2,
        x: 100,
        y: 100,
        vx: 300, // Extrapolation would move it forward significantly
        vy: 0,
        radius: 15
      } as any;

      // Enable skipNextFrameExtrapolation
      renderer.skipNextFrameExtrapolation = true;
      renderer.render(mockCtx, [remoteDisc], 1);

      // Rendered disc must match raw input position without extrapolation
      const renderedSlot = renderer['frameRenderDiscs'][0]!;
      expect(renderedSlot.x).toBe(100);

      // Flag must be automatically reset to false
      expect(renderer.skipNextFrameExtrapolation).toBe(false);

      // Next frame without the flag: extrapolation should apply
      renderer.render(mockCtx, [remoteDisc], 1);
      const extrapolatedSlot = renderer['frameRenderDiscs'][0]!;
      expect(extrapolatedSlot.x).toBeGreaterThan(100);
    });
  });
});
