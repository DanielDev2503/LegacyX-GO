import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  GameEngine,
  Player,
  MatchPhase,
  GameMatchPhase,
  applyPredictiveRenderSeparation,
  clampDiscToGoalAwareBounds,
  type GoalBannerDetails
} from '../src/index';

function createStartedEngine(): EngineInstance {
  const engine = new EngineInstance('classic');
  engine.addPlayer(1, 'red');
  engine.addPlayer(2, 'blue');
  engine.playerNames.set(1, 'Striker');
  engine.playerNames.set(2, 'Keeper');
  engine.startMatch(false);
  engine.fsm.startPlaying();
  return engine;
}

describe('Wave 4 Core Physics Fixes', () => {
  describe('Entregable 1: applyPredictiveRenderSeparation 100% ball separation', () => {
    it('separates 100% of ball-player overlap using 75%/25% split in open field', () => {
      const localDisc = { x: 0, y: 0, vx: 120, vy: 0, radius: 15 };
      const ball = { id: 0, team: 0, x: 15, y: 0, vx: 0, vy: 0, radius: 10 }; // overlap = 10

      applyPredictiveRenderSeparation(localDisc, [ball], 600, 270);

      expect(ball.x).toBeCloseTo(22.5, 5); // +7.5
      expect(localDisc.x).toBeCloseTo(-2.5, 5); // -2.5
      expect(Math.hypot(ball.x - localDisc.x, ball.y - localDisc.y)).toBeGreaterThanOrEqual(
        ball.radius + localDisc.radius - 1e-6
      );
    });

    it('pushes remaining overlap onto localDisc when ball hits stadium wall', () => {
      // Ball pinned against right sideline wall (x = 590 is max for r=10 when outside goal mouth)
      const localDisc = { x: 575, y: -180, vx: 200, vy: 0, radius: 15 };
      const ball = { id: 0, team: 0, x: 590, y: -180, vx: 0, vy: 0, radius: 10 }; // dist = 15, minDist = 25

      applyPredictiveRenderSeparation(localDisc, [ball], 600, 270, 80, 36);

      expect(ball.x).toBeLessThanOrEqual(590 + 1e-6);
      expect(localDisc.x).toBeLessThanOrEqual(565 + 1e-6);
      expect(Math.hypot(ball.x - localDisc.x, ball.y - localDisc.y)).toBeGreaterThanOrEqual(
        ball.radius + localDisc.radius - 1e-6
      );
    });

    it('separates ball from overlapping remote players and respects goal-pocket bounds', () => {
      const localDisc = { x: 100, y: 0, vx: 0, vy: 0, radius: 15 };
      const ball = { id: 0, team: 0, x: 618, y: 0, vx: 50, vy: 0, radius: 10 }; // inside right goal pocket
      const remotePlayer = { id: 2, team: 2, x: 604, y: 0, vx: 0, vy: 0, radius: 15 };

      applyPredictiveRenderSeparation(localDisc, [ball, remotePlayer], 600, 270, 80, 36);

      // Ball moves deeper into goal pocket up to halfW + goalDepth - rBall = 626
      expect(ball.x).toBeLessThanOrEqual(626 + 1e-6);
      expect(ball.x).toBeGreaterThan(618);
      expect(Math.hypot(ball.x - remotePlayer.x, ball.y - remotePlayer.y)).toBeGreaterThanOrEqual(
        ball.radius + remotePlayer.radius - 1e-6
      );

      // Explicit clampDiscToGoalAwareBounds outside goal pocket clamps to pitch edge
      const outsideCornerBall = { x: 625, y: 200, vx: 100, vy: 0, radius: 10 };
      clampDiscToGoalAwareBounds(outsideCornerBall, 600, 270, 80, 36);
      expect(outsideCornerBall.x).toBe(590);
      expect(outsideCornerBall.vx).toBe(0);
    });
  });

  describe('Entregable 3: Real goal entry speed without artificial 20 km/h floor', () => {
    it('EngineInstance computes slow goal speeds accurately down to 1 km/h', () => {
      const engine = createStartedEngine();

      const goals: GoalBannerDetails[] = [];
      engine.on('goal', (g: GoalBannerDetails) => goals.push(g));

      // Ultra-slow dribble at 25 px/s -> Math.round(25 * 0.18) = 5 km/h
      engine.ball.pos.set(engine.stadium.halfWidth + engine.ball.radius + 1, 0);
      engine.ball.vel.set(25, 0);
      engine.handleGoalScored('red');
      expect(goals[0]?.speedKmh).toBe(5);

      // Nearly stationary crawl (1 px/s) -> floored at 1 km/h (not 0 or 20)
      engine.resetPositions();
      engine.fsm.startPlaying();
      engine.ball.pos.set(engine.stadium.halfWidth + engine.ball.radius + 1, 0);
      engine.ball.vel.set(1, 0);
      engine.handleGoalScored('red');
      expect(goals[1]?.speedKmh).toBe(1);
    });

    it('GameEngine computes slow goal speeds accurately down to 1 km/h', () => {
      const gameEngine = new GameEngine({}, {}, 'classic');
      gameEngine.addPlayer(new Player({ id: 'p1', name: 'Scorer', team: 'red' }));
      gameEngine.startMatch();
      gameEngine.fsm.state = GameMatchPhase.PLAYING;

      let goalCount = 0;
      gameEngine.onGoal = () => {
        goalCount++;
      };

      const hw = gameEngine.stadium.halfWidth;
      gameEngine.ball.pos.set(hw + gameEngine.ball.radius + 2, 0);
      gameEngine.ball.vel.set(30, 0); // Math.round(30 * 0.18) = 5 km/h
      gameEngine.step(new Map());

      expect(goalCount).toBe(1);
      expect(gameEngine.lastGoalInfo?.speedKmh).toBe(5);
    });
  });

  describe('Entregable 5: GoalNet Verlet physics resets and deforms during GOAL_REPLAY', () => {
    function maxNetDisplacement(net: EngineInstance['world']['goalNets'][number]): number {
      let maxDisp = 0;
      for (let i = 0; i < net.nodeCount; i++) {
        const disp = Math.hypot(net.posX[i]! - net.restPosX[i]!, net.posY[i]! - net.restPosY[i]!);
        if (disp > maxDisp) maxDisp = disp;
      }
      return maxDisp;
    }

    it('resets nets flat when entering GOAL_REPLAY and steps net deformation as replay plays', () => {
      const engine = createStartedEngine();
      const emptyInputs = new Map();

      const hw = engine.stadium.halfWidth;
      // Kick ball across right goal line and deeper into net during GOAL celebration capture
      engine.ball.pos.set(hw - 12, 0);
      engine.ball.vel.set(420, 0);

      for (let i = 0; i < 90 && engine.fsm.state === MatchPhase.PLAYING; i++) {
        engine.step(emptyInputs);
      }
      expect(engine.fsm.state).toBe(MatchPhase.GOAL);

      // Wait for GOAL celebration to finish and transition into GOAL_REPLAY
      for (let i = 0; i < 360 && engine.fsm.state === MatchPhase.GOAL; i++) {
        engine.step(emptyInputs);
      }
      expect(engine.fsm.state).toBe(MatchPhase.GOAL_REPLAY);

      // Right net was reset flat at entry of GOAL_REPLAY (ball is at start of pre-goal clip)
      const rightNet = engine.world.goalNets[1]!;
      expect(maxNetDisplacement(rightNet)).toBeLessThan(0.5);

      // Step through GOAL_REPLAY frames until ball strikes net and verify net deforms
      let maxReplayDisp = 0;
      for (let i = 0; i < 260 && engine.fsm.state === MatchPhase.GOAL_REPLAY; i++) {
        engine.step(emptyInputs);
        const disp = maxNetDisplacement(rightNet);
        if (disp > maxReplayDisp) maxReplayDisp = disp;
      }

      expect(maxReplayDisp).toBeGreaterThan(1.0);
    });
  });
});
