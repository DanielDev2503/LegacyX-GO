import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  MatchPhase,
  BinaryProtocol,
  COLLISION_GROUP_BALL,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_KICK,
  type PlayerInput
} from '../src/index';

describe('Celebrations (3s/5s), Elastic GoalNet, Pause/Resume Countdown & Match Banners/Attribution', () => {
  it('runs active 60 Hz physics and player movement during 180-tick (3.0s) MatchPhase.GOAL while pausing clock and suppressing duplicate goals', () => {
    const engine = new EngineInstance('AF 3v3');
    const p1 = engine.addPlayer(1, 'red');
    engine.addPlayer(2, 'blue');
    engine.playerNames.set(1, 'StrikerRed');
    engine.playerNames.set(2, 'DefenderBlue');

    engine.startMatch(false);
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);

    // Kickoff touch -> PLAYING
    p1.pos.set(-18, 0);
    const kickInputs = new Map<number, PlayerInput>([
      [1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]
    ]);
    engine.step(kickInputs);
    expect(engine.fsm.state).toBe(MatchPhase.PLAYING);

    // Advance 30 ticks so matchTicksElapsed > 0
    const empty = new Map<number, PlayerInput>();
    for (let i = 0; i < 30; i++) {
      engine.step(empty);
    }
    const ticksBeforeGoal = engine.fsm.matchTicksElapsed;
    expect(ticksBeforeGoal).toBeGreaterThan(0);

    let goalPayloads: any[] = [];
    engine.on('goal', (payload) => goalPayloads.push(payload));

    // Score goal into Blue net (right side)
    engine.ball.pos.set(engine.stadium.halfWidth - 2, 0);
    engine.ball.vel.set(700, 0);
    for (let i = 0; i < 6 && engine.fsm.state !== MatchPhase.GOAL; i++) {
      engine.step(empty);
    }

    expect(engine.fsm.state).toBe(MatchPhase.GOAL);
    expect(engine.fsm.redScore).toBe(1);
    expect(goalPayloads).toHaveLength(1);
    const frozenClockTicks = engine.fsm.matchTicksElapsed;

    // During GOAL (180 ticks), player movement & kicks remain 100% fluid while clock is paused and extra goals are suppressed
    const p1StartX = p1.pos.x;
    const moveInputs = new Map<number, PlayerInput>([
      [1, { inputMask: INPUT_FLAG_RIGHT }]
    ]);
    for (let i = 0; i < 20; i++) {
      // Force ball across goal line repeatedly to verify duplicate goal immunity
      engine.ball.pos.set(engine.stadium.halfWidth + 15, 0);
      engine.ball.vel.set(200, 0);
      engine.step(moveInputs);
    }

    expect(p1.pos.x).toBeGreaterThan(p1StartX + 5);
    expect(engine.fsm.matchTicksElapsed).toBe(frozenClockTicks);
    expect(engine.fsm.redScore).toBe(1);
    expect(goalPayloads).toHaveLength(1);

    // Finish remaining ticks of the 180-tick celebration -> resets to KICKOFF
    const rem = engine.fsm.stateTicksRemaining;
    for (let i = 0; i < rem; i++) {
      engine.step(empty);
    }
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);
    expect(engine.ball.pos.x).toBe(0);
    expect(engine.ball.pos.y).toBe(0);
  });

  it('freezes victory stats snapshot immediately and runs 300 ticks (5.0s) of active MatchPhase.CELEBRATION before match_end -> STOP', () => {
    const engine = new EngineInstance('AF 3v3');
    engine.applyModifiers({ goalLimit: 1 });
    const p1 = engine.addPlayer(1, 'red');
    engine.addPlayer(2, 'blue');
    engine.playerNames.set(1, 'CaptainRed');

    let celebrationSnapshot: any = null;
    let matchEndPayload: any = null;
    engine.on('victory_celebration', (payload) => {
      celebrationSnapshot = payload;
    });
    engine.on('match_end', (payload) => {
      matchEndPayload = payload;
    });

    engine.startMatch(false);
    p1.pos.set(-18, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    expect(engine.fsm.state).toBe(MatchPhase.PLAYING);

    // Winning goal (goalLimit = 1)
    engine.ball.pos.set(engine.stadium.halfWidth - 2, 0);
    engine.ball.vel.set(700, 0);
    const empty = new Map<number, PlayerInput>();
    for (let i = 0; i < 6 && engine.fsm.state !== MatchPhase.CELEBRATION; i++) {
      engine.step(empty);
    }

    expect(engine.fsm.state).toBe(MatchPhase.CELEBRATION);
    expect(celebrationSnapshot).not.toBeNull();
    expect(celebrationSnapshot.winner).toBe('red');
    expect(celebrationSnapshot.redScore).toBe(1);
    expect(matchEndPayload).toBeNull();

    const p1StatsAtWin = celebrationSnapshot.stats.find((s: any) => String(s.playerId) === '1');
    expect(p1StatsAtWin).toBeDefined();
    expect(p1StatsAtWin.goals).toBe(1);
    const touchesAtWin = p1StatsAtWin.touches;

    // During 300 ticks of CELEBRATION, players move and kick freely without inflating match stats or score
    p1.pos.set(0, 0);
    p1.vel.set(0, 0);
    engine.ball.pos.set(22, 0);
    engine.ball.vel.set(0, 0);
    const startX = p1.pos.x;
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    expect(p1.pos.x).toBeGreaterThan(startX);
    expect(engine.ball.vel.x).toBeGreaterThan(0);

    // Advance remaining ticks (still in CELEBRATION), then final tick transitions to STOP
    const rem = engine.fsm.stateTicksRemaining;
    for (let i = 0; i < rem - 1; i++) {
      engine.step(empty);
      expect(engine.fsm.state).toBe(MatchPhase.CELEBRATION);
    }
    engine.step(empty);

    expect(engine.fsm.state).toBe(MatchPhase.STATS);
    expect(matchEndPayload).not.toBeNull();
    expect(matchEndPayload.winner).toBe('red');
    const p1FinalStats = engine.getMatchStats().find((s) => String(s.playerId) === '1')!;
    expect(p1FinalStats.touches).toBe(touchesAtWin);

    engine.stopMatch();
    expect(engine.fsm.state).toBe(MatchPhase.STOP);
  });

  it('purges rear rigid goal wall for ball, deforms Verlet GoalNet elastically to retain ball, and keeps 100% player permeability', () => {
    const engine = new EngineInstance('AF 3v3');
    const hw = engine.stadium.halfWidth;
    const gh = engine.stadium.goalHalfHeight;

    // Rear goal segments must NOT block COLLISION_GROUP_BALL
    for (const seg of engine.world.segments) {
      const minX = Math.min(seg.p0.x, seg.p1.x);
      const maxY = Math.max(Math.abs(seg.p0.y), Math.abs(seg.p1.y));
      if (minX > hw - 1 && maxY <= gh + 30) {
        expect(seg.cMask & COLLISION_GROUP_BALL).toBe(0);
      }
    }

    const rightNet = engine.world.goalNetRight!;
    expect(rightNet).toBeDefined();

    // Shoot ball deep into right goal net during celebration physics
    const p1 = engine.addPlayer(1, 'red');
    engine.startMatch(false);
    p1.pos.set(-18, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));

    engine.ball.pos.set(hw - 4, 0);
    engine.ball.vel.set(780, 0);
    const empty = new Map<number, PlayerInput>();
    let maxNetDeformation = 0;

    for (let t = 0; t < 35; t++) {
      engine.step(empty);
      const dev = rightNet.maxDeviation();
      if (dev > maxNetDeformation) maxNetDeformation = dev;
    }

    // Ball penetrated past goal line, deformed elastic Verlet net, and stayed contained (no tunneling to infinity)
    expect(maxNetDeformation).toBeGreaterThan(2.0);
    expect(engine.ball.pos.x).toBeLessThan(rightNet.backX + 35);

    // 100% player permeability across GoalNet: player disc crosses net line with zero GoalNet impulse
    engine.world.resetNets(false);
    p1.damping = 1.0;
    p1.pos.set(rightNet.backX - 2, 0);
    p1.vel.set(300, 0);
    rightNet.step(p1, 1 / 60);
    rightNet.resolveDiscCollision(p1);
    expect(p1.vel.x).toBe(300);
    expect(p1.vel.y).toBe(0);
    expect(rightNet.maxDeviation()).toBe(0);
  });

  it('freezes exact positions and velocities on pauseMatch() and runs 180-tick (3.0s) RESUME_COUNTDOWN before restoring exact pre-pause velocity', () => {
    const engine = new EngineInstance('AF 3v3');
    const p1 = engine.addPlayer(1, 'red');
    engine.startMatch(false);

    // Kickoff -> PLAYING
    p1.pos.set(-18, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    expect(engine.fsm.state).toBe(MatchPhase.PLAYING);

    // Give ball & player non-trivial velocity vectors
    engine.ball.pos.set(64.5, -23.25);
    engine.ball.vel.set(412.5, -188.0);
    p1.pos.set(-110.0, 42.0);
    p1.vel.set(145.0, 60.0);
    const savedClock = engine.fsm.matchTicksElapsed;

    // Pause match
    engine.pauseMatch();
    expect(engine.fsm.state).toBe(MatchPhase.PAUSE);

    // Step 30 ticks while paused with aggressive inputs -> strictly frozen
    const aggressive = new Map<number, PlayerInput>([
      [1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]
    ]);
    for (let i = 0; i < 30; i++) {
      engine.step(aggressive);
    }
    expect(engine.ball.pos.x).toBe(64.5);
    expect(engine.ball.pos.y).toBe(-23.25);
    expect(engine.ball.vel.x).toBe(412.5);
    expect(engine.ball.vel.y).toBe(-188.0);
    expect(p1.pos.x).toBe(-110.0);
    expect(p1.pos.y).toBe(42.0);
    expect(p1.vel.x).toBe(145.0);
    expect(p1.vel.y).toBe(60.0);
    expect(engine.fsm.matchTicksElapsed).toBe(savedClock);

    // Resume match -> 180-tick RESUME_COUNTDOWN (3, 2, 1, ¡JUEGUEN!)
    const countdownEvents: Array<{ count: number; isResume: boolean }> = [];
    engine.on('countdown_tick', (ev) => countdownEvents.push(ev));

    engine.resumeMatch();
    expect(engine.fsm.state).toBe(MatchPhase.RESUME_COUNTDOWN);
    expect(countdownEvents[0]).toEqual({ count: 3, isResume: true });

    // Step 179 ticks -> still in RESUME_COUNTDOWN and vectors remain strictly frozen
    for (let i = 0; i < 179; i++) {
      engine.step(aggressive);
      expect(engine.fsm.state).toBe(MatchPhase.RESUME_COUNTDOWN);
      expect(engine.ball.pos.x).toBe(64.5);
      expect(engine.ball.vel.x).toBe(412.5);
      expect(p1.pos.x).toBe(-110.0);
    }

    // 180th tick -> countdown reaches 0 (¡JUEGUEN!), returns to PLAYING, next step integrates preserved velocity!
    const empty = new Map<number, PlayerInput>();
    engine.step(empty);
    expect(engine.fsm.state).toBe(MatchPhase.PLAYING);
    expect(countdownEvents.map((e) => e.count)).toEqual([3, 2, 1, 0]);
    expect(engine.ball.vel.x).toBe(412.5);
    expect(engine.ball.vel.y).toBe(-188.0);

    engine.step(empty);
    expect(engine.ball.pos.x).toBeGreaterThan(64.5);
    expect(engine.ball.pos.y).toBeLessThan(-23.25);
  });

  it('runs 108-tick (1.8s) PRE_MATCH_VS -> 180-tick (3.0s) START_COUNTDOWN -> KICKOFF whistle on startMatchWithIntro()', () => {
    const engine = new EngineInstance('AF 3v3');
    engine.addPlayer(1, 'red');
    const countdownCounts: number[] = [];
    let whistles = 0;

    engine.on('countdown_tick', ({ count, isResume }) => {
      expect(isResume).toBe(false);
      countdownCounts.push(count);
    });
    engine.on('whistle', () => {
      whistles++;
    });

    engine.startMatchWithIntro();
    expect(engine.fsm.state).toBe(MatchPhase.PRE_MATCH_VS);

    const empty = new Map<number, PlayerInput>();
    for (let i = 0; i < 107; i++) {
      engine.step(empty);
      expect(engine.fsm.state).toBe(MatchPhase.PRE_MATCH_VS);
    }

    // Tick 108 transitions PRE_MATCH_VS -> START_COUNTDOWN (emits 3)
    engine.step(empty);
    expect(engine.fsm.state).toBe(MatchPhase.START_COUNTDOWN);
    expect(countdownCounts).toEqual([3]);

    for (let i = 0; i < 179; i++) {
      engine.step(empty);
      expect(engine.fsm.state).toBe(MatchPhase.START_COUNTDOWN);
    }

    // Tick 180 of START_COUNTDOWN transitions -> KICKOFF, emits 0 + whistle
    engine.step(empty);
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);
    expect(countdownCounts).toEqual([3, 2, 1, 0]);
    expect(whistles).toBe(1);
  });

  it('tracks scorer, assister, and own-goal attribution accurately and encodes float MatchPhases losslessly in BinaryProtocol', () => {
    const engine = new EngineInstance('AF 3v3');
    const p1 = engine.addPlayer(1, 'red');
    const p2 = engine.addPlayer(2, 'red');
    const p3 = engine.addPlayer(3, 'blue');
    engine.playerNames.set(1, 'Playmaker');
    engine.playerNames.set(2, 'Finisher');
    engine.playerNames.set(3, 'UnluckyDefender');

    const goals: any[] = [];
    engine.on('goal', (g) => goals.push(g));

    engine.startMatch(false);
    const empty = new Map<number, PlayerInput>();

    // 1. Playmaker (1) passes to Finisher (2), who scores into Blue net
    p1.pos.set(-18, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    p2.pos.set(engine.ball.pos.x - 16, 0);
    engine.step(new Map([[2, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));

    engine.ball.pos.set(engine.stadium.halfWidth - 2, 0);
    engine.ball.vel.set(700, 0);
    for (let i = 0; i < 6 && engine.fsm.state !== MatchPhase.GOAL; i++) {
      engine.step(empty);
    }

    expect(goals).toHaveLength(1);
    expect(goals[0].scorerName).toBe('Finisher');
    expect(goals[0].assisterName).toBe('Playmaker');
    expect(goals[0].isOwnGoal).toBe(false);

    // Advance past celebration back to KICKOFF
    const rem = engine.fsm.stateTicksRemaining;
    for (let i = 0; i < rem; i++) engine.step(empty);
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);

    // 2. UnluckyDefender (3, blue) touches ball into Blue's own net -> Own Goal!
    p3.pos.set(18, 0);
    engine.ball.pos.set(0, 0);
    // Kickoff -> PLAYING via p1 first, then p3 kicks into own net
    p1.pos.set(-18, 0);
    engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));
    engine.ball.pos.set(engine.stadium.halfWidth - 30, 0);
    engine.ball.vel.set(0, 0);
    p3.pos.set(engine.stadium.halfWidth - 46, 0);
    engine.step(new Map([[3, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_KICK }]]));

    engine.ball.pos.set(engine.stadium.halfWidth - 2, 0);
    engine.ball.vel.set(650, 0);
    for (let i = 0; i < 6 && engine.fsm.state !== MatchPhase.GOAL; i++) {
      engine.step(empty);
    }

    expect(goals).toHaveLength(2);
    expect(goals[1].scoringTeam).toBe('red');
    expect(goals[1].scorerName).toBe('UnluckyDefender');
    expect(goals[1].assisterName).toBeNull();
    expect(goals[1].isOwnGoal).toBe(true);

    // 3. BinaryProtocol float phase round-trip verification
    for (const phase of [
      MatchPhase.STOP,
      MatchPhase.PRE_MATCH_VS,
      MatchPhase.START_COUNTDOWN,
      MatchPhase.KICKOFF,
      MatchPhase.PLAYING,
      MatchPhase.PAUSE,
      MatchPhase.RESUME_COUNTDOWN,
      MatchPhase.GOAL,
      MatchPhase.CELEBRATION
    ]) {
      const snap = { ...engine.getState(), phase };
      const decoded = BinaryProtocol.decodeSnapshot(BinaryProtocol.encodeSnapshot(snap));
      expect(decoded.phase).toBe(phase);
    }
  });
});
