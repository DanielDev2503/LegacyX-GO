import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  GameEngine,
  PhysicsWorld,
  Player,
  MatchPhase,
  GameMatchPhase,
  DEFAULT_GAMEPLAY_CONFIG,
  stepPlayerKinematics,
  BinaryProtocol,
  SOUND_KICK,
  SOUND_POST_HIT,
  SOUND_GOAL,
  SOUND_MASK_BITS,
  SNAPSHOT_FLAG_KICKOFF_ACTIVE,
  SNAPSHOT_FLAG_GOLDEN_GOAL,
  SNAPSHOT_FLAG_NEUTRAL_KICKOFF,
  SNAPSHOT_FLAG_KICKOFF_BLUE,
  POWER_SHOT_SPEED_THRESHOLD,
  SHOT_ON_GOAL_COOLDOWN_TICKS,
  COMPLETED_PASS_COOLDOWN_TICKS,
  MIN_PASS_DISTANCE_PX,
  SAVE_COOLDOWN_TICKS,
  INPUT_RIGHT,
  INPUT_LEFT,
  INPUT_TURBO,
  INPUT_KICK,
  CORE_DT,
  type PlayerKinematicsState,
  type ScoreEventEmitPayload,
  type GoalBannerDetails,
  type MatchBannerPayload,
  type ScoreEventPayload
} from '../src';

function createKinematicsPlayer(overrides: Partial<PlayerKinematicsState> = {}): PlayerKinematicsState {
  return {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    radius: 15,
    stamina: 50,
    isDashing: false,
    dashTicksRemaining: 0,
    dashCooldownTimer: 0,
    dashDirX: 0,
    dashDirY: 0,
    isTurbo: false,
    kicking: false,
    prevDashState: false,
    team: 'red',
    ...overrides
  };
}

function setupCompetitiveEngine(): EngineInstance {
  const engine = new EngineInstance('classic');
  engine.addPlayer(1, 'red');
  engine.addPlayer(2, 'red');
  engine.addPlayer(3, 'red');
  engine.addPlayer(4, 'blue');
  engine.addPlayer(5, 'blue');
  engine.playerNames.set(1, 'RedOne');
  engine.playerNames.set(2, 'RedTwo');
  engine.playerNames.set(3, 'RedThree');
  engine.playerNames.set(4, 'BlueOne');
  engine.playerNames.set(5, 'BlueTwo');
  engine.startMatch(false);
  engine.fsm.startPlaying();
  return engine;
}

describe('Core Task 1 Fixes & Anti-Cheat Hardening', () => {
  describe('Item 3: Stamina Moving Regen Defaults', () => {
    it('sets DEFAULT_GAMEPLAY_CONFIG staminaRegenMoving=false and staminaRegenMovingRate=25', () => {
      expect(DEFAULT_GAMEPLAY_CONFIG.staminaRegenMoving).toBe(false);
      expect(DEFAULT_GAMEPLAY_CONFIG.staminaRegenMovingRate).toBe(25);
    });

    it('does NOT regen stamina while moving when config is omitted, and falls back to rate 25 when enabled', () => {
      const pOmitted = createKinematicsPlayer({ stamina: 50 });
      for (let i = 0; i < 60; i++) {
        stepPlayerKinematics(pOmitted, { inputMask: INPUT_RIGHT }, null, null, undefined, CORE_DT, { skipSubsteps: true });
      }
      expect(pOmitted.stamina).toBe(50);

      const pStationary = createKinematicsPlayer({ stamina: 50 });
      for (let i = 0; i < 60; i++) {
        stepPlayerKinematics(pStationary, { inputMask: 0 }, null, null, undefined, CORE_DT, { skipSubsteps: true });
      }
      expect(pStationary.stamina).toBeCloseTo(75, 5);

      const pEnabledRateOmitted = createKinematicsPlayer({ stamina: 50 });
      for (let i = 0; i < 60; i++) {
        stepPlayerKinematics(
          pEnabledRateOmitted,
          { inputMask: INPUT_RIGHT },
          null,
          null,
          { staminaRegenMoving: true },
          CORE_DT,
          { skipSubsteps: true }
        );
      }
      // 25%/s * 25% moving factor = 6.25%/s over 60 ticks
      expect(pEnabledRateOmitted.stamina).toBeCloseTo(56.25, 4);
    });
  });

  describe('Item 4: Turbo Active Only While Held & Non-Sticky setState', () => {
    it('clears player.isTurbo immediately on the first tick INPUT_TURBO is released', () => {
      const p = createKinematicsPlayer({ stamina: 100, isTurbo: false });
      stepPlayerKinematics(
        p,
        { inputMask: INPUT_RIGHT | INPUT_TURBO },
        null,
        null,
        { staminaRegenMoving: false },
        CORE_DT,
        { skipSubsteps: true }
      );
      expect(p.isTurbo).toBe(true);
      const staminaAfterTurbo = p.stamina;

      // Release INPUT_TURBO while still holding INPUT_RIGHT
      stepPlayerKinematics(
        p,
        { inputMask: INPUT_RIGHT },
        null,
        null,
        { staminaRegenMoving: false },
        CORE_DT,
        { skipSubsteps: true }
      );
      expect(p.isTurbo).toBe(false);
      expect(p.stamina).toBe(staminaAfterTurbo);
    });

    it('does NOT latch player.isTurbo across non-input ticks in EngineInstance.setState', () => {
      const engine = new EngineInstance('classic');
      engine.addPlayer(1, 'red');
      engine.addPlayer(2, 'blue');
      engine.startMatch(false);
      engine.fsm.startPlaying();

      const snap = engine.getState();
      const redDisc = snap.discs.find((d) => d.id === 1)!;
      redDisc.flags |= 1 << 4; // remote snapshot had turbo flag

      engine.setState(snap);
      expect(engine.players.get(1)!.isTurbo).toBe(false);

      engine.step(new Map([[1, { inputMask: INPUT_RIGHT }]]));
      expect(engine.players.get(1)!.isTurbo).toBe(false);
    });
  });

  describe('Item 5: Kickoff Barriers Isolated Exclusively to Practice Mode', () => {
    it('PhysicsWorld.shouldBypassKickoffBarrier returns true ONLY when isPracticeMode is true', () => {
      const world = new PhysicsWorld({ fixedDt: CORE_DT, isPracticeMode: false });
      expect(world.shouldBypassKickoffBarrier('blue', 0)).toBe(false);
      expect(world.shouldBypassKickoffBarrier('red', 0)).toBe(false);

      world.isPracticeMode = true;
      expect(world.shouldBypassKickoffBarrier('blue', 0)).toBe(true);
    });

    it('GameEngine.shouldBypassKickoffBarriers does NOT bypass 1v0 when isPracticeMode is false', () => {
      const ge = new GameEngine('classic');
      ge.isPracticeMode = false;
      ge.addPlayer(new Player({ id: 'r1', name: 'Solo', team: 'red', isHost: true }));
      ge.kickoffState = { active: true, mode: 'TEAM_KICKOFF', possessingTeam: 'blue' };
      expect(ge.shouldBypassKickoffBarriers()).toBe(false);

      ge.isPracticeMode = true;
      expect(ge.shouldBypassKickoffBarriers()).toBe(true);
    });

    it('EngineInstance blocks 1v0 kickoff barrier bypass in non-practice mode and bypasses in practice mode', () => {
      const engine = new EngineInstance('classic');
      engine.isPracticeMode = false;
      engine.addPlayer(1, 'red');
      engine.startMatch(false);
      engine.isNeutralKickoff = false;
      engine.kickoffPossessingTeam = 'blue';
      expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);
      expect(engine.shouldBypassKickoffBarriers()).toBe(false);

      const red = engine.players.get(1)!;
      red.pos.set(-120, 0);
      for (let i = 0; i < 60; i++) {
        engine.step(new Map([[1, { inputMask: INPUT_RIGHT }]]));
      }
      expect(red.pos.x).toBeLessThanOrEqual(-red.radius + 0.01);
      const centerR = engine.stadium.centerRadius ?? 80;
      expect(Math.hypot(red.pos.x, red.pos.y)).toBeGreaterThanOrEqual(centerR + red.radius - 0.5);

      // Practice mode explicitly bypasses
      engine.isPracticeMode = true;
      expect(engine.shouldBypassKickoffBarriers()).toBe(true);
      for (let i = 0; i < 60; i++) {
        engine.step(new Map([[1, { inputMask: INPUT_RIGHT }]]));
      }
      expect(red.pos.x).toBeGreaterThan(-red.radius);
    });
  });

  describe('Item 5 + 9: BinaryProtocol Header Bit-Packing & Snapshot State Parity', () => {
    it('packs bits 4..7 in byte 10 cleanly while masking soundMask with 0x07', () => {
      expect(SOUND_MASK_BITS).toBe(0x07);
      expect(SNAPSHOT_FLAG_KICKOFF_ACTIVE).toBe(1 << 4);
      expect(SNAPSHOT_FLAG_GOLDEN_GOAL).toBe(1 << 5);
      expect(SNAPSHOT_FLAG_NEUTRAL_KICKOFF).toBe(1 << 6);
      expect(SNAPSHOT_FLAG_KICKOFF_BLUE).toBe(1 << 7);

      const encoded = BinaryProtocol.encodeSnapshot({
        tick: 120,
        phase: MatchPhase.KICKOFF,
        matchTimer: 95,
        redScore: 2,
        blueScore: 2,
        soundMask: SOUND_KICK | SOUND_POST_HIT | SOUND_GOAL | 0xf0,
        kickoffActive: true,
        isGoldenGoal: true,
        isNeutralKickoff: false,
        kickoffPossessingTeam: 'blue',
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0, spin: 0 }
        ]
      });

      const view = new DataView(encoded);
      const rawByte10 = view.getUint8(10);
      expect(rawByte10 & 0x07).toBe(0x07);
      expect((rawByte10 & SNAPSHOT_FLAG_KICKOFF_ACTIVE) !== 0).toBe(true);
      expect((rawByte10 & SNAPSHOT_FLAG_GOLDEN_GOAL) !== 0).toBe(true);
      expect((rawByte10 & SNAPSHOT_FLAG_NEUTRAL_KICKOFF) !== 0).toBe(false);
      expect((rawByte10 & SNAPSHOT_FLAG_KICKOFF_BLUE) !== 0).toBe(true);

      const decoded = BinaryProtocol.decodeSnapshot(encoded)!;
      expect(decoded).not.toBeNull();
      expect(decoded.soundMask).toBe(0x07);
      expect(decoded.kickoffActive).toBe(true);
      expect(decoded.isGoldenGoal).toBe(true);
      expect(decoded.isNeutralKickoff).toBe(false);
      expect(decoded.kickoffPossessingTeam).toBe('blue');
    });

    it('syncs overtime/kickoff metadata end-to-end across EngineInstance getSnapshot -> decode -> setState', () => {
      const host = setupCompetitiveEngine();
      host.fsm.currentState = MatchPhase.KICKOFF;
      host.fsm.isOvertime = true;
      host.isNeutralKickoff = false;
      host.kickoffPossessingTeam = 'blue';
      host.soundMask = SOUND_POST_HIT;

      const exported = host.getState();
      expect(exported.kickoffActive).toBe(true);
      expect(exported.isGoldenGoal).toBe(true);
      expect(exported.isNeutralKickoff).toBe(false);
      expect(exported.kickoffPossessingTeam).toBe('blue');

      const packet = host.getSnapshot();
      const decoded = BinaryProtocol.decodeSnapshot(packet)!;

      const client = new EngineInstance('classic');
      client.setState(decoded);

      expect(client.soundMask).toBe(SOUND_POST_HIT);
      expect(client.fsm.isOvertime).toBe(true);
      expect(client.isNeutralKickoff).toBe(false);
      expect(client.kickoffPossessingTeam).toBe('blue');
    });

    it('supports playerName/team on ScoreEventPayload and speedKmh/isPower/isCurve on MatchBannerPayload GOAL', () => {
      const scoreMsg: ScoreEventPayload = {
        type: 'SCORE_EVENT',
        playerId: '1',
        playerName: 'RedOne',
        team: 'red',
        text: '¡Golazo!',
        points: 160,
        x: 100,
        y: 0,
        category: 'goal'
      };
      const banner: MatchBannerPayload = {
        kind: 'GOAL',
        scoringTeam: 'red',
        scorerName: 'RedOne',
        assisterName: 'RedTwo',
        isOwnGoal: false,
        redScore: 1,
        blueScore: 0,
        speedKmh: 185,
        isPower: true,
        isCurve: true
      };
      expect(scoreMsg.playerName).toBe('RedOne');
      expect(scoreMsg.team).toBe('red');
      expect(banner.kind).toBe('GOAL');
      if (banner.kind === 'GOAL') {
        expect(banner.speedKmh).toBe(185);
        expect(banner.isPower).toBe(true);
        expect(banner.isCurve).toBe(true);
      }
    });
  });

  describe('Item 6-payload & Item 26: Pre-Net Goal Speed & Score Event Identity', () => {
    it('captures peak/crossing ball speed BEFORE GoalNet damping and propagates speedKmh/isPower/isCurve and ScoreEvent playerName/team', () => {
      const engine = setupCompetitiveEngine();
      const events: ScoreEventEmitPayload[] = [];
      const goals: GoalBannerDetails[] = [];

      engine.on('score_event', (ev: ScoreEventEmitPayload) => events.push(ev));
      engine.on('goal', (g: GoalBannerDetails) => goals.push(g));

      // Place red striker 1 right near right goal and drive ball cleanly into net at high speed (>= POWER_SHOT_SPEED_THRESHOLD)
      const hw = engine.stadium.halfWidth;
      engine.players.get(1)!.pos.set(hw - 40, 0);
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(1000, 0);
      engine.ball.isPowerShot = true;
      engine.recordTouch(1, true);

      // Step enough ticks so ball crosses goal line and interacts with GoalNet damping
      for (let i = 0; i < 6 && goals.length === 0; i++) {
        engine.step(new Map());
      }

      expect(goals.length).toBe(1);
      expect(goals[0].speedKmh).toBeGreaterThanOrEqual(150);
      expect(goals[0].isPower).toBe(true);
      expect(goals[0].isCurve).toBe(false);
      expect(engine.lastGoalDetails?.speedKmh).toBe(goals[0].speedKmh);

      const goalEv = events.find((e) => e.category === 'goal')!;
      expect(goalEv).toBeDefined();
      expect(goalEv.playerName).toBe('RedOne');
      expect(goalEv.team).toBe('red');
    });

    it('floors low-speed goal speedKmh at 20 km/h', () => {
      const engine = setupCompetitiveEngine();
      const goals: GoalBannerDetails[] = [];
      engine.on('goal', (g: GoalBannerDetails) => goals.push(g));

      const hw = engine.stadium.halfWidth;
      engine.ball.pos.set(hw - 2, 0);
      engine.ball.vel.set(40, 0);
      engine.recordTouch(1, false);
      // Step until ball crosses hw + ball.radius slowly or force crossing speed
      engine.ball.pos.set(hw + engine.ball.radius + 1, 0);
      engine.handleGoalScored('red');

      expect(goals.length).toBe(1);
      expect(goals[0].speedKmh).toBe(20);
    });
  });

  describe('Item 11 + 12 + Parity Item 1 & 5: Anti-Exploit Guards, Solo/Practice Parity & Exact Scoring Arithmetic', () => {
    it('emits score_event and awards match points/stats in practice mode (isPracticeMode=true) and 1v0 solo rooms during PLAYING, without km/h in score_event text', () => {
      // 1) Practice mode via step() from KICKOFF -> PLAYING -> Goal
      const practice = new EngineInstance('classic');
      practice.isPracticeMode = true;
      practice.addPlayer(1, 'red');
      practice.playerNames.set(1, 'SoloTrainer');
      const practiceEvents: ScoreEventEmitPayload[] = [];
      const practiceGoals: GoalBannerDetails[] = [];
      practice.on('score_event', (e) => practiceEvents.push(e));
      practice.on('goal', (g) => practiceGoals.push(g));

      practice.startMatch(false);
      expect(practice.fsm.state).toBe(MatchPhase.KICKOFF);
      expect(practice.canAwardMatchPoints()).toBe(false);

      // Kick near right goal from KICKOFF -> transitions to PLAYING before recordTouch & handleGoalScored
      const hw = practice.stadium.halfWidth;
      practice.players.get(1)!.pos.set(hw - 35, 0);
      practice.ball.pos.set(hw - 15, 0);
      practice.ball.vel.set(500, 0);
      practice.step(new Map([[1, { inputMask: INPUT_RIGHT | INPUT_KICK }]]));
      for (let i = 0; i < 6 && practiceGoals.length === 0; i++) {
        practice.step(new Map());
      }

      expect(practiceGoals.length).toBe(1);
      expect(practiceGoals[0].speedKmh).toBeGreaterThanOrEqual(20);
      const practiceShot = practiceEvents.find((e) => e.category === 'shot');
      const practiceGoalEv = practiceEvents.find((e) => e.category === 'goal');
      expect(practiceShot).toBeDefined();
      expect(practiceShot?.points).toBe(20);
      expect(practiceGoalEv).toBeDefined();
      expect(practiceGoalEv?.points).toBeGreaterThanOrEqual(100);
      expect(practiceGoalEv?.text).not.toMatch(/km\/h/i);
      const practiceStats = practice.getMatchStats().find((s) => s.playerId === '1')!;
      expect(practiceStats.goals).toBe(1);
      expect(practiceStats.shots).toBe(1);
      expect(practiceStats.points).toBeGreaterThanOrEqual(120);

      // 2) 1v0 solo room (isPracticeMode=false, blue=0) during PLAYING
      const solo = new EngineInstance('classic');
      const soloEvents: ScoreEventEmitPayload[] = [];
      solo.on('score_event', (e) => soloEvents.push(e));
      solo.addPlayer(1, 'red');
      solo.playerNames.set(1, 'SoloCasual');
      solo.startMatch(false);
      solo.fsm.startPlaying();
      expect(solo.canAwardMatchPoints()).toBe(true);

      solo.players.get(1)!.pos.set(hw - 35, 0);
      solo.ball.pos.set(hw - 15, 0);
      solo.ball.vel.set(450, 0);
      solo.recordTouch(1, true);
      solo.ball.pos.set(hw + solo.ball.radius + 2, 0);
      solo.handleGoalScored('red');

      expect(soloEvents.some((e) => e.category === 'shot' && e.points === 20)).toBe(true);
      const soloGoalEv = soloEvents.find((e) => e.category === 'goal');
      expect(soloGoalEv).toBeDefined();
      expect(soloGoalEv?.text).toBe('¡Gol! +100');
      expect(soloGoalEv?.text).not.toMatch(/km\/h/i);
      const soloStats = solo.getMatchStats().find((s) => s.playerId === '1')!;
      expect(soloStats.goals).toBe(1);
      expect(soloStats.shots).toBe(1);
      expect(soloStats.points).toBe(120);

      // 3) GameEngine parity: canAwardPoints() true in PLAYING for both practice & 1v0
      const ge = new GameEngine('classic');
      ge.isPracticeMode = true;
      ge.addPlayer(new Player({ id: 'r1', name: 'Trainer', team: 'red', isHost: true }));
      ge.fsm.currentState = GameMatchPhase.PLAYING;
      expect(ge.canAwardPoints()).toBe(true);

      const geEvents: Array<{ playerId: string; text: string; points: number; category?: string }> = [];
      ge.onScoreEvent = (playerId, text, points, _x, _y, _color, category) => {
        geEvents.push({ playerId, text, points, category });
      };
      ge.ball.pos.set(ge.stadium.halfWidth - 15, 0);
      ge.ball.vel.set(400, 0);
      ge.playerDiscs.get('r1')!.pos.set(ge.stadium.halfWidth - 35, 0);
      ge.registerBallTouch('r1', true);
      ge.ball.pos.set(ge.stadium.halfWidth + ge.ball.radius + 4, 0);
      ge.tick(new Map());
      expect(geEvents.some((e) => e.category === 'shot' && e.points === 20)).toBe(true);
      expect(geEvents.some((e) => e.category === 'goal' && e.points >= 100 && !/km\/h/i.test(e.text))).toBe(true);
    });

    it('awards ZERO points and emits ZERO score_event outside MatchPhase.PLAYING (STOP, KICKOFF, PAUSED, GOAL, CELEBRATION)', () => {
      const blockedPhases = [
        MatchPhase.STOP,
        MatchPhase.KICKOFF,
        MatchPhase.PAUSE,
        MatchPhase.GOAL,
        MatchPhase.CELEBRATION
      ];

      for (const phase of blockedPhases) {
        const engine = setupCompetitiveEngine();
        const events: ScoreEventEmitPayload[] = [];
        engine.on('score_event', (e) => events.push(e));
        engine.fsm.currentState = phase;

        expect(engine.canAwardMatchPoints()).toBe(false);
        engine.ball.pos.set(100, 0);
        engine.ball.vel.set(450, 0);
        engine.recordTouch(1, true);
        engine.ball.pos.set(engine.stadium.halfWidth + 20, 0);
        engine.handleGoalScored('red');

        expect(events.length).toBe(0);
        expect(engine.getMatchStats().every((s) => s.points === 0)).toBe(true);
      }

      const ge = new GameEngine('classic');
      ge.addPlayer(new Player({ id: 'r1', name: 'Red', team: 'red', isHost: true }));
      ge.addPlayer(new Player({ id: 'b1', name: 'Blue', team: 'blue' }));
      for (const gePhase of [
        GameMatchPhase.STOPPED,
        GameMatchPhase.PAUSED,
        GameMatchPhase.KICKOFF,
        GameMatchPhase.GOAL_CELEBRATION,
        GameMatchPhase.MATCH_ENDED,
        GameMatchPhase.VICTORY_CELEBRATION
      ]) {
        ge.fsm.currentState = gePhase;
        expect(ge.canAwardPoints()).toBe(false);
      }
    });

    it('keeps goal bonus score_event text free of km/h speed across Power, Curve, and Power+Curve goals', () => {
      const engine = setupCompetitiveEngine();
      const events: ScoreEventEmitPayload[] = [];
      engine.on('score_event', (e) => events.push(e));
      const hw = engine.stadium.halfWidth;

      // Power only
      engine.currentTick = 100;
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(950, 0);
      engine.ball.isPowerShot = true;
      engine.ball.isCurving = false;
      engine.ball.spin = 0;
      engine.recordTouch(1, false);
      engine.ball.pos.set(hw + 20, 0);
      engine.handleGoalScored('red');

      // Curve only
      engine.fsm.startPlaying();
      engine.currentTick = 200;
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(400, 0);
      engine.ball.isPowerShot = false;
      engine.ball.isCurving = true;
      engine.ball.spin = 0.25;
      engine.recordTouch(2, false);
      engine.ball.pos.set(hw + 20, 0);
      engine.handleGoalScored('red');

      // Power + Curve
      engine.fsm.startPlaying();
      engine.currentTick = 300;
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(950, 0);
      engine.ball.isPowerShot = true;
      engine.ball.isCurving = true;
      engine.ball.spin = 0.25;
      engine.recordTouch(3, false);
      engine.ball.pos.set(hw + 20, 0);
      engine.handleGoalScored('red');

      const goalTexts = events.filter((e) => e.category === 'goal').map((e) => e.text);
      expect(goalTexts).toEqual([
        '¡Gol de Potencia! +130',
        '¡Gol con Efecto! +130',
        '¡Golazo Potencia y Efecto! +160'
      ]);
      expect(goalTexts.every((t) => !/km\/h/i.test(t))).toBe(true);
      expect(engine.lastGoalDetails?.speedKmh).toBeGreaterThanOrEqual(150);
    });

    it('blocks rival touch reset of shot cooldown, low-speed kicks (<220 px/s), and self-shots toward own goal', () => {
      const engine = setupCompetitiveEngine();
      const events: ScoreEventEmitPayload[] = [];
      engine.on('score_event', (e) => events.push(e));

      // Slow kick (<220 px/s) -> no shot
      engine.players.get(1)!.pos.set(100, 0);
      engine.ball.pos.set(130, 0);
      engine.ball.vel.set(180, 0);
      engine.recordTouch(1, true);
      expect(engine.getOrCreateStats(1).shots).toBe(0);

      // Self-shot toward own left goal -> no shot
      engine.players.get(1)!.pos.set(0, 0);
      engine.ball.pos.set(-30, 0);
      engine.ball.vel.set(-500, 0);
      engine.recordTouch(1, true);
      expect(engine.getOrCreateStats(1).shots).toBe(0);

      // Valid shot >= 220 px/s -> +20
      engine.currentTick = 300;
      engine.players.get(1)!.pos.set(100, 0);
      engine.ball.pos.set(130, 0);
      engine.ball.vel.set(450, 0);
      engine.recordTouch(1, true);
      expect(engine.getOrCreateStats(1).shots).toBe(1);
      expect(engine.getOrCreateStats(1).points).toBe(20);

      // Rival touches at tick 320 -> MUST NOT reset shooter 1 cooldown
      engine.currentTick = 320;
      engine.players.get(4)!.pos.set(350, 0);
      engine.ball.pos.set(330, 0);
      engine.ball.vel.set(-200, 0);
      engine.recordTouch(4, false);

      // Shooter 1 tries another shot at tick 350 (< 240 ticks cooldown) -> MUST be blocked
      engine.currentTick = 350;
      engine.players.get(1)!.pos.set(100, 0);
      engine.ball.pos.set(130, 0);
      engine.ball.vel.set(450, 0);
      engine.recordTouch(1, true);
      expect(engine.getOrCreateStats(1).shots).toBe(1);

      // After 240 ticks cooldown (tick 300 + 240 = 540) -> allowed
      engine.currentTick = 300 + SHOT_ON_GOAL_COOLDOWN_TICKS;
      engine.recordTouch(1, true);
      expect(engine.getOrCreateStats(1).shots).toBe(2);
    });

    it('enforces SAVE_COOLDOWN_TICKS=360, point-blank collusion guard (<50px travel), single pendingShot consumption, and stale/off-target rejection', () => {
      expect(SAVE_COOLDOWN_TICKS).toBe(360);
      const engine = setupCompetitiveEngine();
      const hw = engine.stadium.halfWidth;

      // 1) Point-blank zero-flight-distance collision (<50 px from shot origin) -> NO fake save
      engine.currentTick = 100;
      engine.players.get(1)!.pos.set(200, 0);
      engine.ball.pos.set(220, 0);
      engine.ball.vel.set(450, 0);
      engine.recordTouch(1, true);
      engine.currentTick = 101;
      engine.players.get(4)!.pos.set(240, 0);
      engine.ball.pos.set(230, 0); // only 10 px traveled from 220!
      engine.recordTouch(4, false);
      expect(engine.getOrCreateStats(4).saves).toBe(0);

      // 2) Legitimate save (ball flew >= 50 px on goal corridor, <= 120 ticks, speed >= 120) -> +100
      engine.currentTick = 400;
      engine.players.get(1)!.pos.set(100, 0);
      engine.ball.pos.set(130, 0);
      engine.ball.vel.set(500, 0);
      engine.recordTouch(1, true);

      engine.currentTick = 425; // 25 ticks later (normal box/midfield shot flight)
      engine.players.get(4)!.pos.set(hw - 40, 0);
      engine.ball.pos.set(hw - 60, 0); // > 200px traveled toward blue goal
      engine.ball.vel.set(420, 0);
      engine.recordTouch(4, false);
      expect(engine.getOrCreateStats(4).saves).toBe(1);
      expect(engine.getOrCreateStats(4).points).toBe(100);

      // Rebound touch by second defender blue #5 right after -> pendingShot already consumed -> 0 saves!
      engine.currentTick = 430;
      engine.players.get(5)!.pos.set(hw - 80, 10);
      engine.ball.pos.set(hw - 70, 10);
      engine.recordTouch(5, false);
      expect(engine.getOrCreateStats(5).saves).toBe(0);

      // 3) Same defender #4 within SAVE_COOLDOWN_TICKS (<360) from a new red shooter -> blocked
      engine.currentTick = 500;
      engine.players.get(2)!.pos.set(100, 0);
      engine.ball.pos.set(130, 0);
      engine.ball.vel.set(500, 0);
      engine.recordTouch(2, true);

      engine.currentTick = 525;
      engine.players.get(4)!.pos.set(hw - 40, 0);
      engine.ball.pos.set(hw - 60, 0);
      engine.ball.vel.set(420, 0);
      engine.recordTouch(4, false);
      expect(engine.getOrCreateStats(4).saves).toBe(1);

      // 4) Stale pendingShot (>120 ticks) -> blocked for fresh defender #5
      engine.currentTick = 1000;
      engine.players.get(1)!.pos.set(-100, 0);
      engine.ball.pos.set(-70, 0);
      engine.ball.vel.set(450, 0);
      engine.recordTouch(1, true);

      engine.currentTick = 1125; // 125 > 120 ticks
      engine.players.get(5)!.pos.set(hw - 40, 0);
      engine.ball.pos.set(hw - 60, 0);
      engine.ball.vel.set(300, 0);
      engine.recordTouch(5, false);
      expect(engine.getOrCreateStats(5).saves).toBe(0);

      // 5) Reversed / off-corridor ball -> blocked
      engine.currentTick = 1300;
      engine.players.get(2)!.pos.set(100, 0);
      engine.ball.pos.set(130, 0);
      engine.ball.vel.set(450, 0);
      engine.recordTouch(2, true);

      engine.currentTick = 1315;
      engine.players.get(5)!.pos.set(hw - 40, 0);
      engine.ball.pos.set(hw - 60, 0);
      engine.ball.vel.set(-300, 0); // reversed away from goal
      engine.recordTouch(5, false);
      expect(engine.getOrCreateStats(5).saves).toBe(0);
    });

    it('enforces pass speed >= 90 px/s, distance >= 140px, 180t cooldown, and max 2 consecutive duo passes until broken by 3rd player/shot/goal', () => {
      expect(MIN_PASS_DISTANCE_PX).toBe(140);
      expect(COMPLETED_PASS_COOLDOWN_TICKS).toBe(180);

      const engine = setupCompetitiveEngine();

      // Speed < 90 px/s -> 0 pass pts
      engine.currentTick = 10;
      engine.players.get(1)!.pos.set(-200, -100);
      engine.ball.pos.set(-200, -100);
      engine.recordTouch(1, false);
      engine.currentTick = 30;
      engine.players.get(2)!.pos.set(-20, -100);
      engine.ball.pos.set(-20, -100);
      engine.ball.vel.set(50, 0); // < 90 px/s
      engine.recordTouch(2, false);
      expect(engine.getOrCreateStats(1).passes).toBe(0);

      // Duo pass #1 (1 -> 2)
      engine.currentTick = 100;
      engine.players.get(1)!.pos.set(-200, -120);
      engine.ball.pos.set(-200, -120);
      engine.recordTouch(1, true);
      engine.currentTick = 120;
      engine.players.get(2)!.pos.set(-200, 60); // 180 px >= 140
      engine.ball.pos.set(-200, 60);
      engine.ball.vel.set(0, 200);
      engine.recordTouch(2, false);
      expect(engine.getOrCreateStats(1).passes).toBe(1);

      // Duo pass #2 (2 -> 1) after cooldown
      engine.currentTick = 320;
      engine.players.get(1)!.pos.set(-200, -120);
      engine.ball.pos.set(-200, -120);
      engine.ball.vel.set(0, -200);
      engine.recordTouch(1, false);
      expect(engine.getOrCreateStats(2).passes).toBe(1);

      // Duo pass #3 (1 -> 2) even after cooldown -> capped at 2 consecutive between (1 <-> 2)!
      engine.currentTick = 540;
      engine.players.get(2)!.pos.set(-200, 60);
      engine.ball.pos.set(-200, 60);
      engine.ball.vel.set(0, 200);
      engine.recordTouch(2, false);
      expect(engine.getOrCreateStats(1).passes).toBe(1);

      // 3rd teammate (3) touches/receives -> breaks duo streak, then 1 -> 2 works again
      engine.currentTick = 750;
      engine.players.get(3)!.pos.set(0, 60);
      engine.ball.pos.set(0, 60);
      engine.ball.vel.set(200, 0);
      engine.recordTouch(3, false);
      expect(engine.getOrCreateStats(2).passes).toBe(2);

      engine.currentTick = 960;
      engine.players.get(1)!.pos.set(-200, -120);
      engine.ball.pos.set(-200, -120);
      engine.ball.vel.set(-200, -200);
      engine.recordTouch(1, false);
      expect(engine.getOrCreateStats(3).passes).toBe(1);
    });

    it('invalidates assists after 420t or opponent touch, and computes exact Power/Curve/Assist/Hattrick/OwnGoal points matching stats total', () => {
      const engine = setupCompetitiveEngine();
      const hw = engine.stadium.halfWidth;

      // 1) Assist invalidated after > 420 ticks
      engine.currentTick = 10;
      engine.ball.pos.set(0, 0);
      engine.recordTouch(2, true);
      engine.currentTick = 435; // 425t > 420t
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(300, 0);
      engine.recordTouch(1, false);
      engine.ball.pos.set(hw + 20, 0);
      engine.handleGoalScored('red');
      expect(engine.getOrCreateStats(2).assists).toBe(0);
      expect(engine.getOrCreateStats(1).goals).toBe(1);
      expect(engine.getOrCreateStats(1).points).toBe(100);

      // Return to PLAYING for goal #2
      engine.fsm.startPlaying();

      // 2) Assist invalidated on rival touch between pass and goal
      engine.currentTick = 500;
      engine.ball.pos.set(-100, -100);
      engine.recordTouch(2, true);
      engine.currentTick = 520;
      engine.ball.pos.set(50, 0);
      engine.recordTouch(4, false); // rival interrupts!
      engine.currentTick = 540;
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(1000, 0);
      engine.ball.isPowerShot = true; // Power Goal (+130)
      engine.recordTouch(1, true);
      engine.ball.pos.set(hw + 20, 0);
      engine.handleGoalScored('red');
      expect(engine.getOrCreateStats(2).assists).toBe(0);
      expect(engine.getOrCreateStats(1).powerGoals).toBe(1);
      expect(engine.getOrCreateStats(1).goals).toBe(2);
      expect(engine.getOrCreateStats(1).points).toBe(100 + 130 + 20); // +20 for shot #2 at tick 540 (note cooldown 240 from earlier? Wait: tick 10 was non-kick, so first shot was tick 540 = +20)

      engine.fsm.startPlaying();

      // 3) Power + Curve Goal (+160) + Curve Assist (+70) + Hattrick (+100 on 3rd goal for RedOne)
      engine.currentTick = 900;
      engine.ball.pos.set(0, -100);
      engine.ball.isCurving = true;
      engine.ball.spin = 0.25;
      engine.recordTouch(3, true); // RedThree curve touch -> assist later

      engine.currentTick = 930;
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(960, 0);
      engine.ball.isPowerShot = true;
      engine.ball.isCurving = true;
      engine.ball.spin = 0.2;
      engine.recordTouch(1, false); // non-kick tap-in / volley or kick after 360t -> here tick 930 > 540+240, and isKick=false so pure goal test
      engine.ball.pos.set(hw + 20, 0);
      engine.handleGoalScored('red');

      const s1 = engine.getOrCreateStats(1);
      const s3 = engine.getOrCreateStats(3);
      expect(s1.goals).toBe(3);
      expect(s1.powerGoals).toBe(2);
      expect(s1.curveGoals).toBe(1);
      expect(s1.hasHattrickBonus).toBe(true);
      expect(s1.hattrickBonus).toBe(100);
      // s1 exact sum: 100 (goal1) + 130 (power goal2) + 20 (shot tick 540) + 160 (power+curve goal3) + 100 (hattrick) = 510
      expect(s1.points).toBe(510);

      expect(s3.assists).toBe(1);
      expect(s3.curveAssists).toBe(1);
      expect(s3.assistsCurve).toBe(1);
      // s3 exact sum: 70 (curve assist) (+ check if 900 -> 930 was >= 140px pass? (hw-10, 0) from (0,-100) is >140px, wait!)
      // Distance (0,-100) to (410,0) = 422 px >= 140, vel = 960 >= 90 -> +10 pass + 70 curve assist = 80!
      expect(s3.points).toBe(s3.passes * 10 + 70);

      engine.fsm.startPlaying();

      // 4) Own Goal (-50, ownGoals=1, never awards assist)
      engine.currentTick = 1200;
      engine.ball.pos.set(-100, 0);
      engine.recordTouch(2, false);
      engine.currentTick = 1210;
      engine.ball.pos.set(-hw - 20, 0);
      engine.ball.vel.set(-300, 0);
      engine.recordTouch(5, false); // blue player #5 puts ball in blue goal? Wait: blue defends +hw, red defends -hw. Blue scoring into red's goal is normal goal! Red touching last into -hw is red own goal (scoringTeam='blue').
      // Test Red player #2 scoring into own left goal (-hw):
      engine.currentTick = 1220;
      engine.ball.pos.set(-hw + 10, 0);
      engine.ball.vel.set(-300, 0);
      engine.recordTouch(2, false);
      engine.ball.pos.set(-hw - 20, 0);
      engine.handleGoalScored('blue');

      const s2 = engine.getOrCreateStats(2);
      expect(s2.ownGoals).toBe(1);
      expect(s2.points).toBe(s2.passes * 10 - 50);
    });

    it('also validates Curve-only Goal (+130, curveGoals=1) cleanly', () => {
      const engine = setupCompetitiveEngine();
      const hw = engine.stadium.halfWidth;
      engine.currentTick = 100;
      engine.ball.pos.set(hw - 10, 0);
      engine.ball.vel.set(400, 0);
      engine.ball.isPowerShot = false;
      engine.ball.isCurving = true;
      engine.ball.spin = 0.25;
      engine.recordTouch(1, false);
      engine.ball.pos.set(hw + 20, 0);
      engine.handleGoalScored('red');

      const s1 = engine.getOrCreateStats(1);
      expect(s1.goals).toBe(1);
      expect(s1.curveGoals).toBe(1);
      expect(s1.powerGoals ?? 0).toBe(0);
      expect(s1.points).toBe(130);
    });
  });
});
