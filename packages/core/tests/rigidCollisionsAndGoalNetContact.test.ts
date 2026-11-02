import { describe, it, expect } from 'vitest';
import {
  PhysicsWorld,
  Disc,
  GoalNet,
  EngineInstance,
  MatchPhase,
  COLLISION_GROUP_BALL,
  COLLISION_GROUP_RED,
  COLLISION_GROUP_BLUE
} from '../src/index';

describe('Rigid Multi-Pass Collisions and Exact GoalNet Contact', () => {
  it('enforces 100% rigid depenetration between overlapping player discs in 1 tick', () => {
    const world = new PhysicsWorld();
    const d1 = new Disc({
      id: 1,
      x: 0,
      y: 0,
      radius: 15,
      mass: 2,
      bounciness: 0.5,
      cGroup: COLLISION_GROUP_RED,
      cMask: COLLISION_GROUP_BLUE
    });
    const d2 = new Disc({
      id: 2,
      x: 20, // Overlap: r1 + r2 = 30, distance = 20, overlap = 10 px
      y: 0,
      radius: 15,
      mass: 2,
      bounciness: 0.5,
      cGroup: COLLISION_GROUP_BLUE,
      cMask: COLLISION_GROUP_RED
    });

    world.addDisc(d1);
    world.addDisc(d2);

    world.step(1 / 60);

    const finalDist = Math.hypot(d2.pos.x - d1.pos.x, d2.pos.y - d1.pos.y);
    expect(finalDist).toBeGreaterThanOrEqual(29.99); // Depenetrated to contact perimeter!
    expect(d1.pos.x).toBeLessThan(0);
    expect(d2.pos.x).toBeGreaterThan(20);
  });

  it('enforces 100% rigid depenetration between player disc and ball without tunneling or remaining overlap', () => {
    const world = new PhysicsWorld();
    const player = new Disc({
      id: 1,
      x: 0,
      y: 0,
      radius: 15,
      mass: 2,
      bounciness: 0.5,
      cGroup: COLLISION_GROUP_RED,
      cMask: COLLISION_GROUP_BALL
    });
    const ball = new Disc({
      id: 0,
      x: 14, // Overlap: r1 + r2 = 25 (15 + 10), distance = 14, overlap = 11 px
      y: 0,
      radius: 10,
      mass: 1,
      bounciness: 0.5,
      isBall: true,
      cGroup: COLLISION_GROUP_BALL,
      cMask: COLLISION_GROUP_RED
    });

    world.addDisc(player);
    world.addDisc(ball);

    world.step(1 / 60);

    const dist = Math.hypot(ball.pos.x - player.pos.x, ball.pos.y - player.pos.y);
    expect(dist).toBeGreaterThanOrEqual(24.99); // Exactly at or outside 25px perimeter!
  });

  it('runs full rigid physics during 3.0s GOAL and 5.0s CELEBRATION phases in EngineInstance', () => {
    const engine = new EngineInstance('AF 3v3');
    engine.scoreLimit = 2;
    const p1 = engine.addPlayer(1, 'red');
    const p2 = engine.addPlayer(2, 'blue');

    engine.startMatch(false);

    // Score goal to enter 180-tick MatchPhase.GOAL
    engine.ball.pos.set(engine.stadium.halfWidth - 2, 0);
    engine.ball.vel.set(700, 0);
    for (let i = 0; i < 6 && engine.fsm.state !== MatchPhase.GOAL; i++) {
      engine.step(new Map());
    }
    expect(engine.fsm.state).toBe(MatchPhase.GOAL);

    p1.pos.set(0, 0);
    p2.pos.set(20, 0); // 10px overlap (r1 + r2 = 30)
    engine.step(new Map());

    const distGoal = Math.hypot(p2.pos.x - p1.pos.x, p2.pos.y - p1.pos.y);
    expect(distGoal).toBeGreaterThanOrEqual(29.99); // Rigid depenetration during goal celebration!

    // Create engine with goalLimit 1 to enter CELEBRATION upon scoring
    const winEngine = new EngineInstance('AF 3v3');
    winEngine.applyModifiers({ goalLimit: 1 });
    const wp1 = winEngine.addPlayer(1, 'red');
    const wp2 = winEngine.addPlayer(2, 'blue');
    winEngine.startMatch(false);

    wp1.pos.set(-18, 0);
    winEngine.step(new Map([[1, { inputMask: 8 | 16 }]])); // kickoff kick -> PLAYING
    expect(winEngine.fsm.state).toBe(MatchPhase.PLAYING);

    winEngine.ball.pos.set(winEngine.stadium.halfWidth - 2, 0);
    winEngine.ball.vel.set(700, 0);
    for (let i = 0; i < 6 && winEngine.fsm.state !== MatchPhase.CELEBRATION; i++) {
      winEngine.step(new Map());
    }
    expect(winEngine.fsm.state).toBe(MatchPhase.CELEBRATION);

    wp1.pos.set(50, 50);
    wp2.pos.set(65, 50); // 15px overlap (r1+r2=30)
    winEngine.step(new Map());

    const distCelebration = Math.hypot(wp2.pos.x - wp1.pos.x, wp2.pos.y - wp1.pos.y);
    expect(distCelebration).toBeGreaterThanOrEqual(29.99); // Rigid depenetration during victory celebration!
  });

  it('calculates exact GoalNet contact threshold with zero artificial gap and renders Catmull-Rom cubic bezier', () => {
    const net = new GoalNet({
      side: 'right',
      mouthX: 200,
      backX: 260,
      depth: 60,
      topY: -60,
      bottomY: 60,
      nodeCount: 15
    });

    const ball = {
      pos: { x: 260, y: 0 },
      vel: { x: 300, y: 0 },
      radius: 6.0,
      isBall: true
    };

    net.checkBallCollision(ball);

    // Ball should be constrained by the net nodes
    expect(ball.pos.x).toBeLessThanOrEqual(260);

    // Mock canvas context to verify Catmull-Rom bezier spline drawing
    let bezierCalls: any[] = [];
    let moveCalls: any[] = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      stroke: () => {},
      moveTo: (x: number, y: number) => { moveCalls.push({ x, y }); },
      lineTo: () => {},
      bezierCurveTo: (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
        bezierCalls.push({ cp1x, cp1y, cp2x, cp2y, x, y });
      },
      setLineDash: () => {}
    } as any;

    net.render(mockCtx);

    // 14 segments between 15 nodes rendered via bezierCurveTo passing through all physical nodes
    expect(bezierCalls.length).toBe(14);
    expect(moveCalls.length).toBeGreaterThanOrEqual(1);
    // Final endpoint of the last bezier matches the bottom anchor node
    expect(bezierCalls[13].x).toBe(net.posX[14]);
    expect(bezierCalls[13].y).toBe(net.posY[14]);
  });
});
