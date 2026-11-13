import { describe, it, expect, beforeEach } from 'vitest';
import {
  GameEngine,
  SHOT_ON_GOAL_COOLDOWN_TICKS,
  COMPLETED_PASS_COOLDOWN_TICKS,
  MIN_PASS_DISTANCE_PX
} from '../src/game/GameEngine';
import {
  Player,
  DASH_TICKS,
  INPUT_RIGHT,
  INPUT_KICK,
  INPUT_DASH,
  INPUT_MOUSE_AIM
} from '../src/game/Player';
import { MatchPhase } from '../src/game/GameFSM';
import { BinaryProtocol, INPUT_FLAG_MOUSE_AIM, INPUT_FLAG_KICK } from '../src/protocol/BinaryProtocol';

describe('Gates 3, 4, 5 & BinaryProtocol 12-Byte Mouse Aim', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine();
  });

  describe('Gate 3: Practice Mode Kickoff Unlock & Match Limits (0 = Unlimited)', () => {
    it('bypasses center-circle and midfield barriers in isPracticeMode after a solo goal', () => {
      engine.isPracticeMode = true;
      engine.setTimeLimit(0);
      engine.setScoreLimit(0);

      const soloRed = new Player({ id: 'r1', name: 'SoloTrainer', team: 'red', isHost: true });
      engine.addPlayer(soloRed);
      engine.fsm.currentState = MatchPhase.PLAYING;

      // Simulate post-goal state where Blue would normally have kickoff possession
      engine.kickoffState = {
        active: true,
        mode: 'TEAM_KICKOFF',
        possessingTeam: 'blue'
      };
      engine.updatePhysicsKickoffContext();

      const disc = engine.playerDiscs.get('r1')!;
      engine.ball.pos.set(0, 0);
      disc.pos.set(-15, 0);
      disc.vel.set(220, 0);

      const inputs = new Map<string, number>([['r1', INPUT_RIGHT]]);
      for (let i = 0; i < 12; i++) {
        engine.tick(inputs);
      }

      // Red player entered the center circle and crossed x > 0 freely without barrier repulsion
      expect(disc.pos.x).toBeGreaterThan(0);
      expect(engine.physicsWorld.kickoffContext).toBeNull();
    });

    it('keeps kickoff barriers enforced in normal matches even if possessingTeam has 0 players on pitch', () => {
      engine.isPracticeMode = false;
      const soloRed = new Player({ id: 'r1', name: 'RedAlone', team: 'red', isHost: true });
      engine.addPlayer(soloRed);
      engine.fsm.currentState = MatchPhase.PLAYING;

      engine.kickoffState = {
        active: true,
        mode: 'TEAM_KICKOFF',
        possessingTeam: 'blue'
      };
      engine.updatePhysicsKickoffContext();

      const disc = engine.playerDiscs.get('r1')!;
      engine.ball.pos.set(300, 0);
      disc.pos.set(-120, 0);
      disc.vel.set(240, 0);

      const inputs = new Map<string, number>([['r1', INPUT_RIGHT]]);
      for (let i = 0; i < 30; i++) {
        engine.tick(inputs);
      }

      expect(disc.pos.x).toBeLessThanOrEqual(-disc.radius + 0.01);
    });

    it('respects unlimited timeLimit=0 / scoreLimit=0 vs explicit scoreLimit=2 victory trigger', () => {
      const pRed = new Player({ id: 'r1', name: 'Red', team: 'red', isHost: true });
      const pBlue = new Player({ id: 'b1', name: 'Blue', team: 'blue' });
      engine.addPlayer(pRed);
      engine.addPlayer(pBlue);

      engine.setTimeLimit(0);
      engine.setScoreLimit(0);
      engine.fsm.currentState = MatchPhase.PLAYING;

      // Score 5 goals for Red with scoreLimit = 0 -> match never ends
      const rightGoalX = engine.stadium.halfWidth + engine.ball.radius + 6;
      for (let g = 0; g < 5; g++) {
        engine.fsm.currentState = MatchPhase.PLAYING;
        engine.kickoffState.active = false;
        engine.ball.pos.set(rightGoalX, 0);
        engine.ball.vel.set(120, 0);
        engine.tick(new Map());
      }
      expect(engine.redScore).toBe(5);
      expect(engine.fsm.currentState).not.toBe(MatchPhase.VICTORY_CELEBRATION);
      expect(engine.fsm.currentState).not.toBe(MatchPhase.MATCH_ENDED);

      // Now set scoreLimit = 2 on a fresh match and verify 2nd goal triggers VICTORY_CELEBRATION
      engine.stopMatch();
      engine.setScoreLimit(2);
      engine.startMatch();
      engine.fsm.currentState = MatchPhase.PLAYING;
      engine.kickoffState.active = false;

      engine.ball.pos.set(rightGoalX, 0);
      engine.ball.vel.set(120, 0);
      engine.tick(new Map());
      expect(engine.redScore).toBe(1);
      expect(engine.fsm.currentState).toBe(MatchPhase.GOAL_CELEBRATION);

      engine.fsm.currentState = MatchPhase.PLAYING;
      engine.kickoffState.active = false;
      engine.ball.pos.set(rightGoalX, 0);
      engine.ball.vel.set(120, 0);
      engine.tick(new Map());
      expect(engine.redScore).toBe(2);
      expect(engine.fsm.currentState).toBe(MatchPhase.VICTORY_CELEBRATION);
    });
  });

  describe('Gate 4: 7-Tick Dash Cooldown (1.0s) & Moving Stamina Regen (0% - 200%)', () => {
    it('runs Dash for 7 ticks, enforces 60-tick (1.0s) cooldown, and allows re-dash after cooldown expires', () => {
      const pRed = new Player({ id: 'r1', name: 'Sprinter', team: 'red', isHost: true });
      engine.addPlayer(pRed);
      engine.setGameplayConfig({ dashCooldown: 1.0, staminaRegenMoving: false });
      engine.fsm.currentState = MatchPhase.PLAYING;
      engine.ball.pos.set(0, 250);

      expect(DASH_TICKS).toBe(7);

      const inputs = new Map<string, number>([['r1', INPUT_RIGHT | INPUT_DASH]]);
      engine.tick(inputs);
      expect(pRed.isDashing).toBe(true);
      expect(pRed.dashCooldownTimer).toBeCloseTo(1.0, 2);

      // Complete remaining 6 ticks of dash
      inputs.set('r1', INPUT_RIGHT);
      for (let i = 0; i < 6; i++) {
        engine.tick(inputs);
      }
      expect(pRed.isDashing).toBe(false);

      // Attempt re-dash at tick 30 (still ~0.5s remaining on cooldown) -> blocked
      for (let i = 0; i < 22; i++) {
        engine.tick(inputs);
      }
      inputs.set('r1', INPUT_RIGHT | INPUT_DASH);
      engine.tick(inputs);
      expect(pRed.isDashing).toBe(false);

      // Release and advance past tick 61 -> cooldown hits 0 and rising edge triggers Dash
      inputs.set('r1', INPUT_RIGHT);
      for (let i = 0; i < 32; i++) {
        engine.tick(inputs);
      }
      expect(pRed.dashCooldownTimer).toBe(0);

      inputs.set('r1', INPUT_RIGHT | INPUT_DASH);
      engine.tick(inputs);
      expect(pRed.isDashing).toBe(true);
    });

    it('scales moving stamina regeneration accurately at 0%, 100%, and 200%', () => {
      const pRed = new Player({ id: 'r1', name: 'Runner', team: 'red', isHost: true });
      engine.addPlayer(pRed);
      engine.fsm.currentState = MatchPhase.PLAYING;
      engine.ball.pos.set(0, 250);

      const moveInputs = new Map<string, number>([['r1', INPUT_RIGHT]]);

      // 0% moving rate -> 0 recharge over 1 second (60 ticks) while moving
      pRed.stamina = 40;
      engine.setGameplayConfig({ staminaRechargeRate: 25, staminaRegenMoving: true, staminaRegenMovingRate: 0 });
      for (let i = 0; i < 60; i++) engine.tick(moveInputs);
      expect(pRed.stamina).toBeCloseTo(40, 2);

      // 100% moving rate -> +25 stamina over 60 ticks while moving
      pRed.stamina = 40;
      engine.setGameplayConfig({ staminaRechargeRate: 25, staminaRegenMoving: true, staminaRegenMovingRate: 100 });
      for (let i = 0; i < 60; i++) engine.tick(moveInputs);
      expect(pRed.stamina).toBeCloseTo(65, 1);

      // 200% moving rate -> +50 stamina over 60 ticks while moving
      pRed.stamina = 40;
      engine.setGameplayConfig({ staminaRechargeRate: 25, staminaRegenMoving: true, staminaRegenMovingRate: 200 });
      for (let i = 0; i < 60; i++) engine.tick(moveInputs);
      expect(pRed.stamina).toBeCloseTo(90, 1);
    });
  });

  describe('Gate 5: Rebalanced Scoring & Anti-Spam Cooldowns', () => {
    it('awards 0 pts per touch, +20 pts ONLY on explicit kick towards rival posts with 4s cooldown (reset on rival touch)', () => {
      const pRed = new Player({ id: 'r1', name: 'Striker', team: 'red', isHost: true });
      const pBlue = new Player({ id: 'b1', name: 'Defender', team: 'blue' });
      engine.addPlayer(pRed);
      engine.addPlayer(pBlue);
      engine.fsm.currentState = MatchPhase.PLAYING;

      expect(SHOT_ON_GOAL_COOLDOWN_TICKS).toBe(240);

      const redDisc = engine.playerDiscs.get('r1')!;
      const blueDisc = engine.playerDiscs.get('b1')!;
      blueDisc.pos.set(0, 240); // Move defender out of line of fire

      // 1) Dribble collision WITHOUT INPUT_KICK -> touches++, 0 pts, 0 shots
      redDisc.pos.set(100, 0);
      redDisc.vel.set(260, 0);
      engine.ball.pos.set(123, 0);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_RIGHT]]));

      const statsAfterDribble = engine.matchStats.get('r1');
      expect(statsAfterDribble?.touches ?? 0).toBeGreaterThanOrEqual(1);
      expect(statsAfterDribble?.points ?? 0).toBe(0);
      expect(statsAfterDribble?.shots ?? 0).toBe(0);

      // 2) Explicit INPUT_KICK aimed between rival posts -> +20 pts, shots = 1
      redDisc.pos.set(120, 0);
      redDisc.vel.set(0, 0);
      engine.ball.pos.set(144, 0);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_KICK]]));

      expect(engine.matchStats.get('r1')!.shots).toBe(1);
      expect(engine.matchStats.get('r1')!.points).toBe(20);

      // 3) Immediate second explicit kick within 4.0s (240 ticks) -> blocked by anti-spam
      redDisc.pos.set(120, 0);
      engine.ball.pos.set(144, 0);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_KICK]]));
      expect(engine.matchStats.get('r1')!.shots).toBe(1);
      expect(engine.matchStats.get('r1')!.points).toBe(20);

      // 4) Rival defender touching the ball MUST NOT reset Striker's 240t shot cooldown
      blueDisc.pos.set(200, 0);
      engine.ball.pos.set(176, 0);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['b1', INPUT_KICK]]));

      // Striker shoots immediately within 240 ticks -> still blocked by anti-spam
      blueDisc.pos.set(0, 240);
      redDisc.pos.set(120, 0);
      engine.ball.pos.set(144, 0);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_KICK]]));

      expect(engine.matchStats.get('r1')!.shots).toBe(1);
      expect(engine.matchStats.get('r1')!.points).toBe(20);

      // Advance past remaining 240 ticks with ball stopped away from goal -> Striker can shoot again
      engine.ball.pos.set(0, 200);
      engine.ball.vel.set(0, 0);
      for (let i = 0; i < 245; i++) {
        engine.tick(new Map());
      }
      redDisc.pos.set(120, 0);
      engine.ball.pos.set(144, 0);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_KICK]]));

      expect(engine.matchStats.get('r1')!.shots).toBe(2);
      expect(engine.matchStats.get('r1')!.points).toBe(40);
    });

    it('awards +10 pts for completed pass only when >= 140 px and enforces 3.0s (180 ticks) cooldown', () => {
      const pRed1 = new Player({ id: 'r1', name: 'Passer', team: 'red', isHost: true });
      const pRed2 = new Player({ id: 'r2', name: 'Receiver', team: 'red' });
      const pBlue = new Player({ id: 'b1', name: 'Defender', team: 'blue' });
      engine.addPlayer(pRed1);
      engine.addPlayer(pRed2);
      engine.addPlayer(pBlue);
      engine.fsm.currentState = MatchPhase.PLAYING;

      expect(MIN_PASS_DISTANCE_PX).toBe(140);
      expect(COMPLETED_PASS_COOLDOWN_TICKS).toBe(180);

      const d1 = engine.playerDiscs.get('r1')!;
      const d2 = engine.playerDiscs.get('r2')!;

      // Short pass (70 px < 140 px) -> 0 pts
      d1.pos.set(-100, -100);
      d2.pos.set(-30, -100);
      engine.ball.pos.set(-76, -100);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_KICK]]));
      for (let i = 0; i < 15; i++) engine.tick(new Map());
      expect(engine.matchStats.get('r1')?.passes ?? 0).toBe(0);
      expect(engine.matchStats.get('r1')?.points ?? 0).toBe(0);

      // Valid pass (>= 140 px, aimed vertically away from goal posts) -> +10 pts
      d1.pos.set(-150, -120);
      d1.vel.set(0, 0);
      d2.pos.set(-150, 70);
      d2.vel.set(0, 0);
      engine.ball.pos.set(-150, -96);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_KICK]]));
      for (let i = 0; i < 40; i++) {
        engine.tick(new Map());
      }

      expect(engine.matchStats.get('r1')?.passes).toBe(1);
      expect(engine.matchStats.get('r1')?.points).toBe(10);

      // Immediate second pass within 180 ticks -> cooldown prevents extra +10 pts
      d1.pos.set(-150, -120);
      d1.vel.set(0, 0);
      d2.pos.set(-150, 70);
      d2.vel.set(0, 0);
      engine.ball.pos.set(-150, -96);
      engine.ball.vel.set(0, 0);
      engine.tick(new Map([['r1', INPUT_KICK]]));
      for (let i = 0; i < 40; i++) {
        engine.tick(new Map());
      }

      expect(engine.matchStats.get('r1')?.passes).toBe(1);
      expect(engine.matchStats.get('r1')?.points).toBe(10);
    });

    it('emits score events and awards stats in GameEngine for both isPracticeMode=true and 1v0 during PLAYING while blocking PAUSED/STOPPED/KICKOFF/CELEBRATION', () => {
      const pRed = new Player({ id: 'r1', name: 'SoloTrainer', team: 'red', isHost: true });
      engine.addPlayer(pRed);
      engine.isPracticeMode = true;

      const emitted: Array<{ playerId: string; text: string; points: number; category?: string }> = [];
      engine.onScoreEvent = (playerId, text, points, _x, _y, _color, category) => {
        emitted.push({ playerId, text, points, category });
      };

      // Blocked outside PLAYING
      for (const nonPlay of [
        MatchPhase.STOPPED,
        MatchPhase.PAUSED,
        MatchPhase.KICKOFF,
        MatchPhase.GOAL_CELEBRATION,
        MatchPhase.VICTORY_CELEBRATION
      ]) {
        engine.fsm.currentState = nonPlay;
        expect(engine.canAwardPoints()).toBe(false);
      }

      // Allowed in PLAYING for practice mode (1v0)
      engine.fsm.currentState = MatchPhase.PLAYING;
      expect(engine.canAwardPoints()).toBe(true);
      expect(engine.shouldBypassKickoffBarriers()).toBe(true);

      const d1 = engine.playerDiscs.get('r1')!;
      d1.pos.set(engine.stadium.halfWidth - 35, 0);
      engine.ball.pos.set(engine.stadium.halfWidth - 15, 0);
      engine.ball.vel.set(420, 0);
      engine.registerBallTouch('r1', true);

      engine.ball.pos.set(engine.stadium.halfWidth + engine.ball.radius + 5, 0);
      engine.tick(new Map());

      expect(emitted.some((e) => e.category === 'shot' && e.points === 20)).toBe(true);
      const goalEv = emitted.find((e) => e.category === 'goal');
      expect(goalEv).toBeDefined();
      expect(goalEv!.points).toBeGreaterThanOrEqual(100);
      expect(goalEv!.text).not.toMatch(/km\/h/i);
      expect(engine.matchStats.get('r1')!.goals).toBe(1);
      expect(engine.matchStats.get('r1')!.points).toBeGreaterThanOrEqual(120);

      // Also works in 1v0 when isPracticeMode=false while kickoff barriers remain enforced
      engine.isPracticeMode = false;
      expect(engine.shouldBypassKickoffBarriers()).toBe(false);
      engine.fsm.currentState = MatchPhase.PLAYING;
      expect(engine.canAwardPoints()).toBe(true);
    });
  });

  describe('360-Degree Mouse Movement Vector & 12-Byte BinaryProtocol', () => {
    it('encodes keyboard inputs in 9 bytes and mouse-aim inputs in 12 bytes with accurate angle/throttle quantization', () => {
      const kbBuf = BinaryProtocol.encodeInput({
        sequence: 42,
        inputMask: INPUT_FLAG_KICK,
        clientTimestamp: 1234
      });
      expect(kbBuf.byteLength).toBe(BinaryProtocol.INPUT_SIZE);
      expect(kbBuf.byteLength).toBe(9);

      const kbDecoded = BinaryProtocol.decodeInput(kbBuf);
      expect(kbDecoded.sequence).toBe(42);
      expect(kbDecoded.inputMask).toBe(INPUT_FLAG_KICK);
      expect(kbDecoded.aimAngle).toBeUndefined();

      const targetAngle = Math.PI / 3; // 60 degrees
      const targetThrottle = 0.65;
      const mouseBuf = BinaryProtocol.encodeInput({
        sequence: 99,
        inputMask: INPUT_FLAG_MOUSE_AIM | INPUT_FLAG_KICK,
        aimAngle: targetAngle,
        aimThrottle: targetThrottle,
        clientTimestamp: 4321
      });
      expect(mouseBuf.byteLength).toBe(BinaryProtocol.MOUSE_INPUT_SIZE);
      expect(mouseBuf.byteLength).toBe(12);

      const mouseDecoded = BinaryProtocol.decodeInput(mouseBuf);
      expect(mouseDecoded.sequence).toBe(99);
      expect((mouseDecoded.inputMask! & INPUT_FLAG_MOUSE_AIM) !== 0).toBe(true);
      expect((mouseDecoded.inputMask! & INPUT_FLAG_KICK) !== 0).toBe(true);
      expect(mouseDecoded.aimAngle).toBeCloseTo(targetAngle, 3);
      expect(mouseDecoded.aimThrottle).toBeCloseTo(targetThrottle, 2);
    });

    it('accelerates player along an arbitrary non-cardinal 360° angle in GameEngine', () => {
      const pRed = new Player({ id: 'r1', name: 'MousePro', team: 'red', isHost: true });
      engine.addPlayer(pRed);
      engine.fsm.currentState = MatchPhase.PLAYING;
      engine.ball.pos.set(0, 260);

      const disc = engine.playerDiscs.get('r1')!;
      disc.pos.set(0, 0);
      disc.vel.set(0, 0);

      const angle = Math.PI / 6; // 30 degrees (non-WASD angle!)
      const inputs = new Map([
        [
          'r1',
          {
            inputMask: INPUT_MOUSE_AIM,
            aimAngle: angle,
            aimThrottle: 1.0
          }
        ]
      ]);

      for (let i = 0; i < 15; i++) {
        engine.tick(inputs);
      }

      const movedAngle = Math.atan2(disc.pos.y, disc.pos.x);
      expect(Math.hypot(disc.pos.x, disc.pos.y)).toBeGreaterThan(8);
      expect(movedAngle).toBeCloseTo(angle, 2);
    });
  });
});
