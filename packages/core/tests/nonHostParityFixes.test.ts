import { describe, it, expect } from 'vitest';
import { createStadium, STADIUM_PRESETS, STADIUM_AF_3V3 } from '../src/stadiums/StadiumRegistry';
import { clampDiscToGoalAwareBounds, applyPredictiveRenderSeparation } from '../src/physics/ContinuousCollision';
import { JitterBuffer } from '../src/protocol/JitterBuffer';
import { EngineInstance } from '../src/index';

describe('Goal 4 Core Physics & Netcode Parity Tests', () => {
  describe('1. Stadium AF 3v3 Preset Resolution', () => {
    it('maps af_3v3, af3v3, AF 3v3 and AF 3v3 Official consistently to STADIUM_AF_3V3', () => {
      expect(STADIUM_PRESETS['af_3v3']).toBe(STADIUM_AF_3V3);
      expect(STADIUM_PRESETS['af3v3']).toBe(STADIUM_AF_3V3);
      expect(STADIUM_PRESETS['AF 3v3']).toBe(STADIUM_AF_3V3);
      expect(STADIUM_PRESETS['AF 3v3 Official']).toBe(STADIUM_AF_3V3);

      const s1 = createStadium('af_3v3');
      const s2 = createStadium('af3v3');
      const s3 = createStadium('AF 3v3');
      const s4 = createStadium('AF 3v3 Official');

      expect(s1.name).toBe(STADIUM_AF_3V3.name);
      expect(s2.name).toBe(STADIUM_AF_3V3.name);
      expect(s3.name).toBe(STADIUM_AF_3V3.name);
      expect(s4.name).toBe(STADIUM_AF_3V3.name);
      expect(s4.width).toBe(STADIUM_AF_3V3.width);
      expect(s4.height).toBe(STADIUM_AF_3V3.height);
    });
  });

  describe('2. Goal-Aware Clamping & Predictive Render Separation with runOff', () => {
    it('allows player discs to exit white line up to (halfWidth + runOff - r) when runOff > 0', () => {
      const arenaHalfW = 500;
      const arenaHalfH = 250;
      const runOff = 45;
      const playerRadius = 15;

      const playerDisc = { x: 600, y: 150, vx: 50, vy: 0, radius: playerRadius };
      clampDiscToGoalAwareBounds(playerDisc, arenaHalfW, arenaHalfH, 80, 40, runOff);

      const expectedMaxX = arenaHalfW + runOff - playerRadius; // 530
      expect(playerDisc.x).toBe(expectedMaxX);
      expect(playerDisc.vx).toBe(0);
    });

    it('keeps ball disc strictly inside white pitch lines when runOff is 0', () => {
      const arenaHalfW = 500;
      const arenaHalfH = 250;
      const ballRadius = 5.8;

      const ballDisc = { x: 600, y: 150, vx: 50, vy: 0, radius: ballRadius };
      clampDiscToGoalAwareBounds(ballDisc, arenaHalfW, arenaHalfH, 80, 40, 0);

      const expectedMaxX = arenaHalfW - ballRadius; // 494.2
      expect(ballDisc.x).toBeCloseTo(expectedMaxX, 3);
      expect(ballDisc.vx).toBe(0);
    });

    it('resolves circular overlap with goalposts (radius 8) when runOff > 0', () => {
      const arenaHalfW = 500;
      const arenaHalfH = 250;
      const goalHalfH = 80;
      const runOff = 45;
      const playerRadius = 15;
      const minPostDist = playerRadius + 8; // 23

      // Place player right at top-right post (500, -80)
      const playerDisc = { x: 500, y: -80, vx: 10, vy: -10, radius: playerRadius };
      clampDiscToGoalAwareBounds(playerDisc, arenaHalfW, arenaHalfH, goalHalfH, 40, runOff);

      const dist = Math.hypot(playerDisc.x - 500, playerDisc.y - (-80));
      expect(dist).toBeGreaterThanOrEqual(minPostDist - 1e-4);
    });

    it('applyPredictiveRenderSeparation separates player and ball respecting runOff for player and 0 for ball', () => {
      const arenaHalfW = 500;
      const arenaHalfH = 250;
      const runOff = 45;

      const localPlayer = { id: 1, team: 1, x: 488, y: 100, vx: 20, vy: 0, radius: 15 };
      const ball = { id: 0, team: 0, x: 485, y: 100, vx: 0, vy: 0, radius: 5.8 };
      const remotePlayer = { id: 2, team: 2, x: 520, y: 100, vx: 0, vy: 0, radius: 15 };

      applyPredictiveRenderSeparation(localPlayer, [ball, remotePlayer], arenaHalfW, arenaHalfH, 80, 40, runOff);

      // Ball must not be pushed past pitch lines
      expect(ball.x).toBeLessThanOrEqual(arenaHalfW - ball.radius + 1e-4);
      // Local player and ball must be separated
      const bDist = Math.hypot(ball.x - localPlayer.x, ball.y - localPlayer.y);
      expect(bDist).toBeGreaterThanOrEqual(ball.radius + localPlayer.radius - 1e-3);

      // Local player is pushed rightwards and permitted into runOff area beyond white line (485)
      expect(localPlayer.x).toBeGreaterThan(arenaHalfW - localPlayer.radius);
      expect(localPlayer.x).toBeLessThanOrEqual(arenaHalfW + runOff - localPlayer.radius);

      // Remote player stays clamped to player runOff exterior wall
      expect(remotePlayer.x).toBeLessThanOrEqual(arenaHalfW + runOff - remotePlayer.radius);
    });
  });

  describe('3. JitterBuffer Arena Bounds with runOff', () => {
    it('setArenaBounds stores runOff and extrapolation clamps players to runOff and ball to pitch lines', () => {
      const jb = new JitterBuffer<any>(25, 30, false);
      jb.setArenaBounds(500, 250, 45, 80, 40);

      expect(jb.arenaBounds).toEqual({
        halfWidth: 500,
        halfHeight: 250,
        runOff: 45,
        goalHalfHeight: 80,
        goalDepth: 40
      });

      const now = 1000;
      jb.push({
        tick: 1,
        phase: 1,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 470, y: 150, vx: 1000, vy: 0, radius: 10 },
          { id: 1, team: 1, x: 490, y: 150, vx: 1000, vy: 0, radius: 15 }
        ]
      }, now);
      jb.push({
        tick: 2,
        phase: 1,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 490, y: 150, vx: 1000, vy: 0, radius: 10 },
          { id: 1, team: 1, x: 510, y: 150, vx: 1000, vy: 0, radius: 15 }
        ]
      }, now + 16);

      // Force extrapolation
      const state = jb.getInterpolatedSnapshot(now + 100);
      expect(state).not.toBeNull();
      const ballDisc = state!.discs.find((d: any) => d.id === 0);
      const playerDisc = state!.discs.find((d: any) => d.id === 1);

      // Ball clamped to pitch line: 500 - 10 = 490
      expect(ballDisc.x).toBe(490);
      // Player clamped to runOff: 500 + 45 - 15 = 530
      expect(playerDisc.x).toBe(530);
    });
  });

  describe('4. EngineInstance.setState Runtime Synchronization', () => {
    it('synchronizes getRuntime dash timers, cooldowns, input seq, prevDashDown and normalized dash direction', () => {
      const engine = new EngineInstance();
      const snapshot = {
        tick: 120,
        phase: 1,
        matchTimer: 2,
        redScore: 1,
        blueScore: 0,
        soundMask: 0,
        isNeutralKickoff: false,
        kickoffPossessingTeam: 'red' as const,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
          {
            id: 1,
            team: 1,
            x: -50,
            y: 20,
            vx: 300,
            vy: 400,
            flags: 1 << 1, // isDashing
            dashTimer: 4,
            dashCooldown: 1.5,
            lastAckedInputSeq: 88
          }
        ]
      };

      engine.setState(snapshot as any);

      const rt = (engine as any).getRuntime(1);
      expect(rt).toBeDefined();
      expect(rt.ticksRemaining).toBe(4);
      expect(rt.cooldownTimer).toBe(1.5);
      expect(rt.lastProcessedInputSeq).toBe(88);
      expect(rt.prevDashDown).toBe(true);

      // Direction should be normalized from (300, 400) -> (0.6, 0.8)
      expect(rt.dirX).toBeCloseTo(0.6, 4);
      expect(rt.dirY).toBeCloseTo(0.8, 4);
    });
  });
});
