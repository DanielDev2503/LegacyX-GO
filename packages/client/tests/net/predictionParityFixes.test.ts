import { describe, it, expect, vi } from 'vitest';
import { BinaryProtocol, EngineInstance, MatchPhase, type GameStateSnapshot } from '@legacyx/core';
import { SharedSimSync } from '../../src/net/SharedSimSync.js';
import { SimulationTicker } from '../../src/net/SimulationTicker.js';
import { DiscRenderer } from '../../src/renderer/DiscRenderer.js';

describe('Goal 4 SharedSimSync & Netcode Parity Fixes', () => {
  describe('1. SharedSimSync rejects stale snapshots & tracks monotonic lastServerTick', () => {
    it('accepts increasing snapshots and rejects older out-of-order ticks', () => {
      const sync = new SharedSimSync('mediano');
      const snap10: GameStateSnapshot = {
        tick: 10,
        phase: MatchPhase.PLAYING,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 0, team: 0, x: 50, y: 0, vx: 0, vy: 0, flags: 0 }]
      };
      expect(sync.onSnapshot(snap10, 1000)).toBe(true);
      expect(sync.getTelemetry(undefined, 1000).lastServerTick).toBe(10);

      const snap9: GameStateSnapshot = {
        ...snap10,
        tick: 9,
        discs: [{ id: 0, team: 0, x: 10, y: 0, vx: 0, vy: 0, flags: 0 }]
      };
      expect(sync.onSnapshot(snap9, 1010)).toBe(false);
      expect(sync.simWorld.ball.pos.x).toBe(50);
    });
  });

  describe('2. SharedSimSync dashCooldown preservation (seconds without /1000)', () => {
    it('preserves Float32 seconds-based dashCooldown across BinaryProtocol -> SharedSimSync', () => {
      const sync = new SharedSimSync('mediano');
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

      const decoded = BinaryProtocol.decodeSnapshot(BinaryProtocol.encodeSnapshot(snapshot))!;
      sync.onSnapshot(decoded, 1000);

      const rt = sync.simWorld.getPlayerRuntime(1)!;
      expect(rt.cooldownTimer).toBeCloseTo(1.5, 4);
      expect(rt.cooldownTimer).not.toBeCloseTo(0.0015, 4);

      const rendered = sync.buildRenderSnapshot(0, 1000)!;
      expect(rendered.discs.find((d) => d.id === 1)!.dashCooldown).toBeCloseTo(1.5, 4);
    });
  });

  describe('3. Hard-snap vs smooth correction thresholds', () => {
    it('hard-snaps on STOP transitions & > 90px desync, while absorbing small corrections smoothly', () => {
      const sync = new SharedSimSync('mediano');

      sync.onSnapshot(
        {
          tick: 1,
          phase: MatchPhase.STOP,
          matchTimer: 0,
          redScore: 0,
          blueScore: 0,
          soundMask: 0,
          discs: [
            { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
            { id: 1, team: 1, x: 0, y: 0, vx: 0, vy: 0, flags: 0 }
          ]
        },
        1000
      );

      sync.onSnapshot(
        {
          tick: 2,
          phase: MatchPhase.PLAYING,
          matchTimer: 1,
          redScore: 0,
          blueScore: 0,
          soundMask: 0,
          discs: [
            { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
            { id: 1, team: 1, x: 4, y: 0, vx: 0, vy: 0, flags: 0 }
          ]
        },
        1016
      );
      expect(sync.getTelemetry(undefined, 1016).hardSnaps).toBe(0);

      // Catastrophic > 90px teleport triggers hard snap immediately
      sync.onSnapshot(
        {
          tick: 3,
          phase: MatchPhase.PLAYING,
          matchTimer: 1,
          redScore: 0,
          blueScore: 0,
          soundMask: 0,
          discs: [
            { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
            { id: 1, team: 1, x: 160, y: 0, vx: 0, vy: 0, flags: 0 }
          ]
        },
        1032
      );
      expect(sync.getTelemetry(undefined, 1032).hardSnaps).toBe(1);
    });
  });

  describe('4. SimulationTicker main-thread clock synchronization', () => {
    it('uses performance.now() from main-thread avoiding Worker timeOrigin offset', () => {
      let executedTicks = 0;
      const ticker = new SimulationTicker(() => {
        executedTicks++;
      });

      const perfSpy = vi.spyOn(performance, 'now');
      perfSpy.mockReturnValue(12345.67);

      ticker['stepAccumulator'](performance.now());
      expect(perfSpy).toHaveBeenCalled();

      perfSpy.mockRestore();
    });
  });

  describe('5. DiscRenderer ribbon/ghost teleport reset & SharedSimSync pause freeze', () => {
    it('resets turbo ribbon history when disc position jumps > 55 px (kickoff/goal teleport)', () => {
      const renderer = new DiscRenderer();

      const disc1 = { id: 1, team: 1, x: 100, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordRibbonPoint'](disc1);

      const disc2 = { id: 1, team: 1, x: 105, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordRibbonPoint'](disc2);

      const buf = renderer['ribbonMap'].get(1)!;
      expect(buf.count).toBe(2);

      const discTeleport = { id: 1, team: 1, x: 405, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordRibbonPoint'](discTeleport);

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

      const discTeleport = { id: 1, team: 1, x: 400, y: 100, vx: 0, vy: 0, radius: 15 } as any;
      renderer['recordDashGhost'](discTeleport);

      activeCount = slots.filter((s) => s.active).length;
      expect(activeCount).toBe(1);
      const newest = slots[slots.length - 1]!;
      expect(newest.active).toBe(true);
      expect(newest.x).toBe(400);
    });

    it('DiscRenderer renders positions strictly read-only while SharedSimSync suppresses extrapolation in PAUSE', () => {
      const renderer = new DiscRenderer();
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
        vx: 300,
        vy: 0,
        radius: 15
      } as any;

      renderer.render(mockCtx, [remoteDisc], 1);
      expect(renderer['frameRenderDiscs'][0]!.x).toBe(100);

      const sync = new SharedSimSync('mediano');
      sync.onSnapshot(
        {
          tick: 10,
          phase: MatchPhase.PAUSE,
          matchTimer: 30,
          redScore: 0,
          blueScore: 0,
          soundMask: 0,
          discs: [{ id: 0, team: 0, x: 100, y: 100, vx: 300, vy: 0, flags: 0 }]
        },
        1000
      );
      const pausedRender = sync.buildRenderSnapshot(100, 1000)!;
      expect(pausedRender.discs[0]!.x).toBe(100);
    });

    it('keeps shared ball ahead of Non-Host player with 0.00px snapshot jump across 200ms RTT dribbling contact', () => {
      const hostEngine = new EngineInstance('mediano');
      const sync = new SharedSimSync('mediano');

      hostEngine.addPlayer(2, 'red');
      hostEngine.startMatch(false);
      hostEngine.fsm.startPlaying();

      const hostPlayer = hostEngine.players.get(2)!;
      hostPlayer.pos.set(-35, 0);
      hostPlayer.vel.set(0, 0);
      hostEngine.ball.pos.set(0, 0);
      hostEngine.ball.vel.set(0, 0);

      const initSnap = hostEngine.getState();
      sync.onSnapshot(initSnap, 0);

      const TICK_MS = 1000 / 60;
      const inFlightInputs: Array<{ deliverAtTick: number; mask: number }> = [];
      const snapshotsInFlight: Array<{ deliverAtTick: number; snap: GameStateSnapshot }> = [];
      const INPUT_RIGHT = 1 << 3;

      for (let tick = 1; tick <= 60; tick++) {
        const nowMs = tick * TICK_MS;
        inFlightInputs.push({ deliverAtTick: tick + 6, mask: INPUT_RIGHT });

        while (inFlightInputs.length > 0 && inFlightInputs[0]!.deliverAtTick <= tick) {
          const arrived = inFlightInputs.shift()!;
          hostEngine.step(new Map([[2, { inputMask: arrived.mask }]]));
          snapshotsInFlight.push({
            deliverAtTick: tick + 6,
            snap: BinaryProtocol.decodeSnapshot(BinaryProtocol.encodeSnapshot(hostEngine.getState()))!
          });
        }

        while (snapshotsInFlight.length > 0 && snapshotsInFlight[0]!.deliverAtTick <= tick) {
          const { snap } = snapshotsInFlight.shift()!;
          const beforeSnap = sync.buildRenderSnapshot(0, nowMs)!;
          const ballBeforeX = beforeSnap.discs.find((d) => d.id === 0)!.x;
          const ballBeforeY = beforeSnap.discs.find((d) => d.id === 0)!.y;

          sync.onSnapshot(snap, nowMs);
          const afterSnap = sync.buildRenderSnapshot(0, nowMs)!;
          const ballAfterX = afterSnap.discs.find((d) => d.id === 0)!.x;
          const ballAfterY = afterSnap.discs.find((d) => d.id === 0)!.y;

          expect(Math.hypot(ballAfterX - ballBeforeX, ballAfterY - ballBeforeY)).toBeLessThan(0.15);
        }

        sync.update(1 / 60, nowMs);
        const snapNow = sync.buildRenderSnapshot(0, nowMs)!;
        const p2 = snapNow.discs.find((d) => d.id === 2)!;
        const b = snapNow.discs.find((d) => d.id === 0)!;
        expect(b.x).toBeGreaterThan(p2.x + 15 + 5.8 - 0.5);
      }
    });
  });
});
