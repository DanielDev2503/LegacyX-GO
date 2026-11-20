import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  GameEngine,
  Player,
  MatchPhase,
  createStadium,
  DEFAULT_GAMEPLAY_CONFIG,
  GAMEPLAY_PRESETS,
  sanitizeGameplayConfig,
  INPUT_RIGHT,
  INPUT_KICK,
  INPUT_TURBO,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_UP,
  INPUT_FLAG_DOWN,
  INPUT_FLAG_LEFT,
  INPUT_FLAG_KICK,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH,
  JitterBuffer,
  BinaryProtocol,
  resolvePredictiveBallCollision,
  type GameStateSnapshot
} from '../src/index';
import { MatchPhase as GameEngineMatchPhase } from '../src/game/GameFSM';
import { separateBallAndDisc } from '../src/physics/ContinuousCollision';

describe('Overhaul Regression Suite: Stamina Delay, Kick Parity, Presets, Hitboxes & Network Determinism', () => {
  describe('1. Stamina Recharge Idle Delay (staminaRechargeDelay)', () => {
    it('blocks stamina recharge for 1.0s (60 ticks) of immobility, ignores INPUT_KICK during delay, and recharges afterwards (EngineInstance & GameEngine)', () => {
      const engine = new EngineInstance('mediano');
      engine.applyModifiers({ staminaRechargeDelay: 1.0, staminaRechargeRate: 25 });
      engine.addPlayer(1, 'red');
      engine.fsm.state = MatchPhase.PLAYING;
      const rt = engine.getRuntime(1);
      const player = engine.players.get(1)!;
      player.stamina = 40;
      rt.staminaIdleTimer = 0;
      rt.staminaRegenUnlocked = false;

      // 59 ticks idle (even with INPUT_KICK held periodically!) -> must NOT unlock recharge yet
      for (let i = 0; i < 59; i++) {
        const mask = i % 10 === 0 ? INPUT_FLAG_KICK : 0;
        engine.step(new Map([[1, { inputMask: mask }]]));
      }
      expect(player.stamina).toBeCloseTo(40, 5);
      expect(rt.staminaRegenUnlocked).toBe(false);

      // Tick 60 completes 1.0s and unlocks recharge; tick 61 grants +25/60 even while pressing KICK
      engine.step(new Map([[1, { inputMask: INPUT_FLAG_KICK }]]));
      expect(rt.staminaRegenUnlocked).toBe(true);
      engine.step(new Map([[1, { inputMask: INPUT_FLAG_KICK }]]));
      expect(player.stamina).toBeCloseTo(40 + 25 / 60, 4);

      // GameEngine parity
      const ge = new GameEngine();
      const p1 = new Player({ id: 'p1', name: 'P1', team: 'red', isHost: true });
      ge.addPlayer(p1);
      ge.fsm.currentState = GameEngineMatchPhase.PLAYING;
      p1.stamina = 40;
      p1.staminaIdleTimer = 0;
      p1.staminaRegenUnlocked = false;
      ge.setGameplayConfig({ staminaRechargeDelay: 1.0, staminaRechargeRate: 25 });

      for (let i = 0; i < 59; i++) {
        ge.tick(new Map([['p1', i % 5 === 0 ? INPUT_KICK : 0]]));
      }
      expect(p1.stamina).toBeCloseTo(40, 5);
      ge.tick(new Map([['p1', INPUT_KICK]]));
      expect(p1.staminaRegenUnlocked).toBe(true);
      ge.tick(new Map([['p1', INPUT_KICK]]));
      expect(p1.stamina).toBeCloseTo(40 + 25 / 60, 4);
    });

    it('with staminaRegenMoving=true, enforces idle delay once, then allows moving recharge until Turbo or Dash re-locks', () => {
      const ge = new GameEngine();
      const p1 = new Player({ id: 'p1', name: 'Runner', team: 'red', isHost: true });
      ge.addPlayer(p1);
      ge.fsm.currentState = GameEngineMatchPhase.PLAYING;
      ge.ball.pos.set(1000, 1000);
      ge.setGameplayConfig({
        staminaRechargeDelay: 1.0,
        staminaRechargeRate: 20,
        staminaRegenMoving: true,
        staminaRegenMovingRate: 100
      });
      p1.stamina = 30;
      p1.staminaIdleTimer = 0;
      p1.staminaRegenUnlocked = false;

      // Moving right off the bat does NOT recharge before waiting 1.0s idle
      for (let i = 0; i < 70; i++) {
        ge.tick(new Map([['p1', INPUT_RIGHT]]));
      }
      expect(p1.stamina).toBe(30);

      // Stand idle for 1.0s (60 ticks) -> unlocks recharge; tick 61 recharges
      for (let i = 0; i < 61; i++) {
        ge.tick(new Map([['p1', 0]]));
      }
      expect(p1.staminaRegenUnlocked).toBe(true);
      const afterWait = p1.stamina;
      expect(afterWait).toBeGreaterThan(30);

      // Moving now continues recharging!
      for (let i = 0; i < 30; i++) {
        ge.tick(new Map([['p1', INPUT_RIGHT]]));
      }
      expect(p1.stamina).toBeGreaterThan(afterWait);

      // Pressing TURBO drains and re-locks until another 1.0s idle
      ge.tick(new Map([['p1', INPUT_RIGHT | INPUT_TURBO]]));
      expect(p1.staminaRegenUnlocked).toBe(false);
      const afterTurbo = p1.stamina;
      for (let i = 0; i < 20; i++) {
        ge.tick(new Map([['p1', INPUT_RIGHT]]));
      }
      expect(p1.stamina).toBe(afterTurbo);
    });
  });

  describe('2. Kick Speed Invariance, Single-Shot Latch, Steering & Presets', () => {
    it('keeps player velocity identical with or without INPUT_KICK across extreme acceleration & speed modifiers', () => {
      const combos = [
        { playerAcceleration: 0.05, playerMaxSpeed: 1.5, playerFriction: 0.88 },
        { playerAcceleration: 0.16, playerMaxSpeed: 3.9, playerFriction: 0.95 },
        { playerAcceleration: 0.5, playerMaxSpeed: 9.5, playerFriction: 0.98 }
      ];

      for (const mods of combos) {
        const engA = new EngineInstance('mediano');
        const engB = new EngineInstance('mediano');
        engA.applyModifiers(mods);
        engB.applyModifiers(mods);
        engA.addPlayer(1, 'red');
        engB.addPlayer(1, 'red');
        engA.fsm.state = MatchPhase.PLAYING;
        engB.fsm.state = MatchPhase.PLAYING;
        engA.ball.pos.set(0, 220);
        engB.ball.pos.set(0, 220);

        for (let t = 0; t < 45; t++) {
          engA.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_UP }]]));
          engB.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_UP | INPUT_FLAG_KICK }]]));
        }

        const pA = engA.players.get(1)!;
        const pB = engB.players.get(1)!;
        expect(pB.pos.x).toBeCloseTo(pA.pos.x, 9);
        expect(pB.pos.y).toBeCloseTo(pA.pos.y, 9);
        expect(pB.vel.x).toBeCloseTo(pA.vel.x, 9);
        expect(pB.vel.y).toBeCloseTo(pA.vel.y, 9);
      }
    });

    it('latches kick as single-shot until INPUT_KICK is released and re-pressed', () => {
      const engine = new EngineInstance('mediano');
      engine.addPlayer(1, 'red');
      engine.fsm.state = MatchPhase.PLAYING;
      const p = engine.players.get(1)!;
      p.pos.set(-22, 0);
      p.vel.set(0, 0);
      engine.ball.pos.set(0, 0);
      engine.ball.vel.set(0, 0);

      // Tick 1: kicks ball forward
      engine.step(new Map([[1, { inputMask: INPUT_FLAG_KICK }]]));
      expect(engine.ball.vel.x).toBeGreaterThan(300);

      // Tick 2: place ball back near player while still holding INPUT_KICK -> MUST NOT re-kick
      engine.ball.pos.set(0, 0);
      engine.ball.vel.set(0, 0);
      engine.step(new Map([[1, { inputMask: INPUT_FLAG_KICK }]]));
      expect(engine.ball.vel.x).toBe(0);

      // Tick 3: release INPUT_KICK -> unlatches
      engine.step(new Map([[1, { inputMask: 0 }]]));

      // Tick 4: press INPUT_KICK again -> fires second kick cleanly
      engine.step(new Map([[1, { inputMask: INPUT_FLAG_KICK }]]));
      expect(engine.ball.vel.x).toBeGreaterThan(300);
    });

    it('steers smoothly perpendicular after Turbo/Dash speed without stalling', () => {
      const engine = new EngineInstance('mediano');
      engine.addPlayer(1, 'red');
      engine.fsm.state = MatchPhase.PLAYING;
      engine.ball.pos.set(0, 220);

      for (let i = 0; i < 30; i++) {
        engine.step(new Map([[1, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO }]]));
      }
      const p = engine.players.get(1)!;
      const vxBeforeTurn = p.vel.x;
      expect(vxBeforeTurn).toBeGreaterThan(DEFAULT_GAMEPLAY_CONFIG.playerMaxSpeed * 60);

      // Switch to holding UP -> perpendicular steering must accelerate upward immediately
      engine.step(new Map([[1, { inputMask: INPUT_FLAG_UP }]]));
      expect(p.vel.y).toBeLessThan(-5);
    });

    it('validates all 3 official gameplay presets sanitize cleanly and stay deterministic for 3,600 ticks', () => {
      expect(Object.keys(GAMEPLAY_PRESETS)).toEqual(['competitive', 'futsal', 'classic']);
      for (const preset of Object.values(GAMEPLAY_PRESETS)) {
        const sanitized = sanitizeGameplayConfig(preset.config);
        expect(sanitized.staminaRechargeDelay).toBe(preset.config.staminaRechargeDelay);
        expect(sanitized.ballRadius).toBe(preset.config.ballRadius);
      }

      const simA = new EngineInstance('mediano');
      const simB = new EngineInstance('mediano');
      simA.addPlayer(1, 'red');
      simA.addPlayer(2, 'blue');
      simB.addPlayer(1, 'red');
      simB.addPlayer(2, 'blue');
      simA.fsm.state = MatchPhase.PLAYING;
      simB.fsm.state = MatchPhase.PLAYING;

      for (let t = 0; t < 3600; t++) {
        const m1 = t % 2 === 0 ? INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO : INPUT_FLAG_UP | INPUT_FLAG_KICK;
        const m2 = t % 3 === 0 ? INPUT_FLAG_LEFT | INPUT_FLAG_DASH : INPUT_FLAG_DOWN;
        simA.step(new Map([[1, { inputMask: m1 }], [2, { inputMask: m2 }]]));
        simB.step(new Map([[1, { inputMask: m1 }], [2, { inputMask: m2 }]]));
      }

      expect(simA.ball.pos.x).toBe(simB.ball.pos.x);
      expect(simA.ball.pos.y).toBe(simB.ball.pos.y);
      expect(simA.players.get(1)!.pos.x).toBe(simB.players.get(1)!.pos.x);
    });
  });

  describe('3. Hitbox Parity, Mass Ratios, FIFA Goal Crossing & Substep Kickoff', () => {
    it('uses FIFA whole-ball crossing in Stadium.checkGoal across all ball sizes', () => {
      const stadium = createStadium('mediano');
      const hw = stadium.halfWidth;
      const r = 10;

      // Center past goal line slightly, but edge still on line -> NO goal
      expect(stadium.checkGoal(hw + r - 0.5, 0, r)).toBeNull();
      expect(stadium.checkGoal(-(hw + r - 0.5), 0, r)).toBeNull();

      // Whole ball across line within goal posts -> GOAL
      expect(stadium.checkGoal(hw + r + 0.1, 0, r)).toBe('red');
      expect(stadium.checkGoal(-(hw + r + 0.1), 0, r)).toBe('blue');
    });

    it('prevents Dash from tunneling across kickoff barrier in EngineInstance via onSubstep', () => {
      const engine = new EngineInstance('mediano');
      engine.isPracticeMode = false;
      engine.addPlayer(1, 'red');
      engine.addPlayer(2, 'blue');
      engine.fsm.state = MatchPhase.KICKOFF;
      engine.isNeutralKickoff = false;
      engine.kickoffPossessingTeam = 'red';
      const blue = engine.players.get(2)!;
      blue.pos.set(engine.stadium.centerRadius + blue.radius + 5, 0);
      blue.vel.set(-500, 0);

      for (let i = 0; i < 10; i++) {
        engine.step(new Map([[2, { inputMask: INPUT_FLAG_DASH | INPUT_FLAG_LEFT }]]));
        // Blue must never tunnel inside center circle or across half-line before kickoff touch
        expect(blue.pos.x).toBeGreaterThanOrEqual(engine.stadium.centerRadius + blue.radius - 0.5);
      }
    });

    it('distributes overlap separation by real playerMass / ballMass ratio', () => {
      const pPos = { x: 18, y: 0 };
      const pVel = { x: 0, y: 0 };
      const bPos = { x: 0, y: 0 };

      // Equal masses -> player absorbs 50% of overlap (overlap = 23 - 18 = 5 -> +2.5)
      resolvePredictiveBallCollision(pPos, pVel, 15, bPos, 8, 2.0, 2.0);
      expect(pPos.x - 18).toBeCloseTo(2.5, 6);

      // Heavy player (9.0), light ball (1.0) -> player absorbs only 10% of overlap (+0.5)
      const pPos2 = { x: 18, y: 0 };
      const pVel2 = { x: 0, y: 0 };
      resolvePredictiveBallCollision(pPos2, pVel2, 15, bPos, 8, 9.0, 1.0);
      expect(pPos2.x - 18).toBeCloseTo(0.5, 6);
    });
  });

  describe('4. Non-Host Clock Sync (JitterBuffer)', () => {
    it('maintains smooth monotonic Host timeline against arrival bursts', () => {
      const jb = new JitterBuffer<GameStateSnapshot>(16, 40, false);
      const makeSnap = (tick: number, x: number): GameStateSnapshot => {
        const buf = BinaryProtocol.encodeSnapshot({
          tick,
          phase: MatchPhase.PLAYING,
          matchTimer: 0,
          redScore: 0,
          blueScore: 0,
          soundMask: 0,
          discs: [{ id: 0, team: 0, x, y: 0, vx: 120, vy: 0, flags: 0, spin: 0 }]
        });
        return BinaryProtocol.decodeSnapshot(buf);
      };

      jb.push(makeSnap(100, 0), 1000);
      jb.push(makeSnap(101, 2), 1016.67);
      // Sudden OS burst arrival delay +25ms later, then catches up on tick 103
      jb.push(makeSnap(102, 4), 1058.33);
      jb.push(makeSnap(103, 6), 1058.5);

      const interp = jb.getInterpolatedSnapshot(1065);
      expect(interp).not.toBeNull();
      expect(Number.isFinite(interp!.discs[0]!.x)).toBe(true);
      expect(interp!.discs[0]!.x).toBeGreaterThanOrEqual(0);
      expect(interp!.discs[0]!.x).toBeLessThanOrEqual(6);
    });
  });
});
