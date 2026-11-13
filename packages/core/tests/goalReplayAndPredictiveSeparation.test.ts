import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  GameFSM,
  MatchPhase,
  BinaryProtocol,
  JitterBuffer,
  applyPredictiveRenderSeparation,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_UP,
  INPUT_FLAG_KICK,
  type GameStateSnapshot,
  type PlayerInput
} from '../src/index';

function makeBinarySnapshot(
  tick: number,
  phase: number,
  x: number,
  vx: number,
  y: number = 0,
  vy: number = 0
): GameStateSnapshot {
  return {
    tick,
    phase,
    matchTimer: 60,
    redScore: 1,
    blueScore: 0,
    soundMask: 0,
    discs: [
      { id: 0, team: 0, x, y, vx, vy, flags: 0 },
      { id: 1, team: 1, x: -100, y: 20, vx: 50, vy: 0, flags: 0 }
    ]
  };
}

describe('Goal Replay (4s = 3s pre-goal + 1s post-goal), Skip Auth, Predictive Separation & High-Ping Extrapolation', () => {
  it('GameFSM transitions GOAL (180t) -> GOAL_REPLAY (3.5, 240t) -> KICKOFF or CELEBRATION', () => {
    const fsm = new GameFSM();
    fsm.startMatch(false);
    fsm.startPlaying();

    fsm.registerGoal('red');
    expect(fsm.currentState).toBe(MatchPhase.GOAL);
    expect(fsm.stateTicksRemaining).toBe(180);

    for (let i = 0; i < 180; i++) {
      fsm.updateTick();
    }
    expect(fsm.currentState).toBe(MatchPhase.GOAL_REPLAY);
    expect(fsm.currentState).toBe(3.5);
    expect(fsm.stateTicksRemaining).toBe(240);

    for (let i = 0; i < 239; i++) {
      fsm.updateTick();
      expect(fsm.currentState).toBe(MatchPhase.GOAL_REPLAY);
    }
    fsm.updateTick();
    expect(fsm.currentState).toBe(MatchPhase.KICKOFF);

    // When winningTeam is set during GOAL_REPLAY, exiting transitions to CELEBRATION
    fsm.startPlaying();
    fsm.registerGoal('blue');
    for (let i = 0; i < 180; i++) fsm.updateTick();
    expect(fsm.currentState).toBe(MatchPhase.GOAL_REPLAY);
    fsm.winningTeam = 'blue';
    for (let i = 0; i < 240; i++) fsm.updateTick();
    expect(fsm.currentState).toBe(MatchPhase.CELEBRATION);
  });

  it('BinaryProtocol round-trips MatchPhase.GOAL_REPLAY (3.5 <-> wire 35)', () => {
    const snap = makeBinarySnapshot(420, MatchPhase.GOAL_REPLAY, 12.5, 30, -4, 15);
    const buf = BinaryProtocol.encodeSnapshot(snap);
    const view = new DataView(buf);
    expect(view.getUint8(5)).toBe(35);

    const decoded = BinaryProtocol.decodeSnapshot(buf);
    expect(decoded).not.toBeNull();
    expect(decoded!.phase).toBe(3.5);
    expect(decoded!.phase).toBe(MatchPhase.GOAL_REPLAY);
  });

  it('EngineInstance records 240-tick (3s pre-goal + 1s post-goal) clip, locks inputs during GOAL_REPLAY, and replays deterministically', () => {
    const engine = new EngineInstance('AF 3v3');
    const p1 = engine.addPlayer(1, 'red');
    const p2 = engine.addPlayer(2, 'blue');
    engine.startMatch(false);

    const recordedLive: GameStateSnapshot[] = [];
    const empty = new Map<number, PlayerInput>();

    // Kickoff touch -> PLAYING
    p1.pos.set(-18, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    recordedLive.push(engine.getState());
    expect(engine.fsm.state).toBe(MatchPhase.PLAYING);

    // Run 200 ticks of active play before goal so ring buffer fills past 180 frames
    for (let i = 0; i < 200; i++) {
      const move = new Map<number, PlayerInput>([
        [1, { inputMask: i % 2 === 0 ? INPUT_FLAG_RIGHT : INPUT_FLAG_UP }]
      ]);
      engine.step(move);
      recordedLive.push(engine.getState());
    }

    // Last touch by p1 and launch ball into blue goal
    p1.pos.set(engine.stadium.halfWidth - 32, 0);
    engine.ball.pos.set(engine.stadium.halfWidth - 14, 0);
    engine.ball.vel.set(0, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    if (engine.fsm.state === MatchPhase.PLAYING) {
      recordedLive.push(engine.getState());
    }

    while (engine.fsm.state === MatchPhase.PLAYING) {
      engine.step(empty);
      if (engine.fsm.state === MatchPhase.PLAYING) {
        recordedLive.push(engine.getState());
      }
    }

    expect(engine.fsm.state).toBe(MatchPhase.GOAL);
    expect(engine.lastGoalScorerId).toBe(1);

    // Expected 180 pre-goal frames + 60 post-goal frames
    const expectedPre = recordedLive.slice(-180);
    const expectedPost: GameStateSnapshot[] = [engine.getState()];

    // Step remaining 179 ticks of GOAL celebration (first 59 are post-goal replay frames)
    for (let i = 1; i < 180; i++) {
      const celebInput = new Map<number, PlayerInput>([
        [1, { inputMask: INPUT_FLAG_UP }],
        [2, { inputMask: INPUT_FLAG_RIGHT }]
      ]);
      engine.step(celebInput);
      if (i < 60) {
        expectedPost.push(engine.getState());
      }
    }

    const expectedClip = [...expectedPre, ...expectedPost];
    expect(expectedClip.length).toBe(240);

    // Now in GOAL_REPLAY: frame 0 should already be applied
    expect(engine.fsm.state).toBe(MatchPhase.GOAL_REPLAY);
    expect(engine.ball.pos.x).toBeCloseTo(expectedClip[0]!.discs[0]!.x, 5);
    expect(engine.ball.pos.y).toBeCloseTo(expectedClip[0]!.discs[0]!.y, 5);

    // Step 239 frames of GOAL_REPLAY with aggressive inputs (must be locked and match recorded frames)
    for (let f = 1; f < 240; f++) {
      const aggressive = new Map<number, PlayerInput>([
        [1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_UP | INPUT_FLAG_KICK }],
        [2, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]
      ]);
      engine.step(aggressive);
      expect(engine.fsm.state).toBe(MatchPhase.GOAL_REPLAY);

      const expected = expectedClip[f]!;
      const actual = engine.getState();
      expect(actual.phase).toBe(MatchPhase.GOAL_REPLAY);
      expect(actual.discs[0]!.x).toBeCloseTo(expected.discs[0]!.x, 5);
      expect(actual.discs[0]!.y).toBeCloseTo(expected.discs[0]!.y, 5);
      const actualP1 = actual.discs.find((d) => d.id === 1)!;
      const expectedP1 = expected.discs.find((d) => d.id === 1)!;
      expect(actualP1.x).toBeCloseTo(expectedP1.x, 5);
      expect(actualP1.y).toBeCloseTo(expectedP1.y, 5);
    }

    // 240th tick exits GOAL_REPLAY -> KICKOFF and resets positions
    engine.step(empty);
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);
    expect(engine.ball.pos.x).toBe(0);
    expect(engine.ball.pos.y).toBe(0);
    expect(p1.pos.x).toBe(-engine.stadium.spawnDistance);
    expect(p2.pos.x).toBe(engine.stadium.spawnDistance);
  });

  it('skipGoalReplay enforces scorer-only permission in multiplayer and allows solo/practice/unconditional skip', () => {
    const engine = new EngineInstance('AF 3v3');
    const p1 = engine.addPlayer(1, 'red');
    engine.addPlayer(2, 'blue');
    engine.startMatch(false);

    // Cannot skip before GOAL_REPLAY
    expect(engine.skipGoalReplay(1)).toBe(false);

    p1.pos.set(-18, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    p1.pos.set(engine.stadium.halfWidth - 32, 0);
    engine.ball.pos.set(engine.stadium.halfWidth - 14, 0);
    engine.ball.vel.set(0, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    while (engine.fsm.state === MatchPhase.PLAYING) {
      engine.step(new Map());
    }
    while (engine.fsm.state === MatchPhase.GOAL) {
      engine.step(new Map());
    }
    expect(engine.fsm.state).toBe(MatchPhase.GOAL_REPLAY);
    expect(engine.lastGoalScorerId).toBe(1);

    // Non-scorer (player 2) cannot skip in 2-player match
    expect(engine.skipGoalReplay(2)).toBe(false);
    expect(engine.fsm.state).toBe(MatchPhase.GOAL_REPLAY);

    // Scorer (player 1) CAN skip -> transitions to KICKOFF and resets positions
    expect(engine.skipGoalReplay(1)).toBe(true);
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);
    expect(engine.ball.pos.x).toBe(0);
    expect(engine.ball.pos.y).toBe(0);

    // Practice mode allows any requester to skip
    engine.isPracticeMode = true;
    engine.fsm.transitionTo(MatchPhase.GOAL_REPLAY);
    expect(engine.skipGoalReplay(2)).toBe(true);
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);

    // Solo player (<= 1 player) allows skipping regardless of lastGoalScorerId
    engine.isPracticeMode = false;
    engine.removePlayer(2);
    expect(engine.getPlayersList().length).toBe(1);
    engine.lastGoalScorerId = null;
    engine.fsm.transitionTo(MatchPhase.GOAL_REPLAY);
    expect(engine.skipGoalReplay(99)).toBe(true);
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);

    // winningTeam set -> skip transitions to CELEBRATION
    engine.fsm.winningTeam = 'red';
    engine.fsm.transitionTo(MatchPhase.GOAL_REPLAY);
    expect(engine.skipGoalReplay()).toBe(true);
    expect(engine.fsm.state).toBe(MatchPhase.CELEBRATION);
  });

  it('applyPredictiveRenderSeparation separates local disc from ball and players without mutating otherDiscs and clamps to arena', () => {
    const localDisc = { x: 10, y: 0, vx: 80, vy: 0, radius: 15 };
    const otherDiscs = [
      { id: 0, team: 0, x: 25, y: 0, vx: 0, vy: 0, radius: 10 }, // overlaps by 10 px
      { id: 2, team: 2, x: -5, y: 0, vx: 0, vy: 0, radius: 15 }  // overlaps after or near
    ];
    const origBall = { ...otherDiscs[0]! };
    const origRemote = { ...otherDiscs[1]! };

    applyPredictiveRenderSeparation(localDisc, otherDiscs, 600, 270);

    // Authoritative discs must remain completely untouched
    expect(otherDiscs[0]).toEqual(origBall);
    expect(otherDiscs[1]).toEqual(origRemote);
    // Local disc was displaced away from overlaps
    expect(localDisc.x).not.toBe(10);

    // Boundary clamping test
    const edgeLocal = { x: 598, y: -268, vx: 100, vy: -100, radius: 15 };
    applyPredictiveRenderSeparation(edgeLocal, [], 600, 270);
    expect(edgeLocal.x).toBe(585);
    expect(edgeLocal.y).toBe(-255);
    expect(edgeLocal.vx).toBe(0);
    expect(edgeLocal.vy).toBe(0);
  });

  it('JitterBuffer treats GOAL_REPLAY (3.5) as active motion and supports autoExtrapolationMs up to 200ms with arena clamping', () => {
    const jb = new JitterBuffer<GameStateSnapshot>(20, 30, false);
    // Even if previously marked PAUSED, phase 3.5 GOAL_REPLAY must interpolate actively (non-frozen)
    jb.setMatchState(2.1);

    jb.push(makeBinarySnapshot(100, MatchPhase.GOAL_REPLAY, 10, 120), 1000);
    jb.push(makeBinarySnapshot(101, MatchPhase.GOAL_REPLAY, 12, 120), 1016.67);

    const interp = jb.getInterpolatedSnapshot(1028);
    expect(interp).not.toBeNull();
    expect(interp!.phase).toBe(MatchPhase.GOAL_REPLAY);
    expect(interp!.discs[0]!.vx).toBeCloseTo(120, 1);
    expect(interp!.discs[0]!.x).toBeGreaterThan(10);
    expect(interp!.discs[0]!.x).toBeLessThan(12);

    // Auto-extrapolation up to 200ms with smooth velocity decay & arena clamping
    const jbHighPing = new JitterBuffer<GameStateSnapshot>(0, 30, false);
    jbHighPing.setAutoExtrapolationMs(350); // clamped to 200
    expect(jbHighPing.autoExtrapolationMs).toBe(200);
    jbHighPing.setArenaBounds(420, 200);

    jbHighPing.push(makeBinarySnapshot(1, MatchPhase.PLAYING, 380, 300), 1000);
    jbHighPing.push(makeBinarySnapshot(2, MatchPhase.PLAYING, 385, 300), 1016);

    // 150 ms after latest snapshot -> still smoothly extrapolating with partial velocity decay
    const midExtrap = jbHighPing.getInterpolatedSnapshot(1166);
    expect(midExtrap).not.toBeNull();
    // Clamped to arenaHalfW (420) - ballRadius (10) = 410
    expect(midExtrap!.discs[0]!.x).toBe(410);
    expect(midExtrap!.discs[0]!.vx).toBe(0);

    // Without clamping near center: verify smooth velocity decay between 100ms and 200ms
    const jbCenter = new JitterBuffer<GameStateSnapshot>(0, 30, false);
    jbCenter.setAutoExtrapolationMs(200);
    jbCenter.push(makeBinarySnapshot(1, MatchPhase.PLAYING, 0, 200), 1000);
    jbCenter.push(makeBinarySnapshot(2, MatchPhase.PLAYING, 10, 200), 1016);

    const at150 = jbCenter.getInterpolatedSnapshot(1016 + 150)!;
    const at200 = jbCenter.getInterpolatedSnapshot(1016 + 200)!;
    const at250 = jbCenter.getInterpolatedSnapshot(1016 + 250)!;

    // 150ms: decaying smoothly (vx = 100)
    expect(at150.discs[0]!.vx).toBeCloseTo(100, 1);
    expect(at150.discs[0]!.x).toBeGreaterThan(30);
    // 200ms: reaches 0 velocity smoothly and holds position
    expect(at200.discs[0]!.vx).toBe(0);
    expect(at200.discs[0]!.x).toBeCloseTo(40, 1);
    expect(at250.discs[0]!.x).toBeCloseTo(at200.discs[0]!.x, 5);
  });
});
