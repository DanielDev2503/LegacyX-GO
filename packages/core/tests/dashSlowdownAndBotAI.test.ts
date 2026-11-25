import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  computeBotInput,
  DEFAULT_GAMEPLAY_CONFIG,
  GAMEPLAY_CONFIG_LIMITS,
  INPUT_DASH,
  INPUT_RIGHT,
  MatchPhase
} from '../src/index.js';

describe('Post-dash temporary slowdown & Smart Bot AI', () => {
  it('exposes dashSlowdownDuration (default 1.0s) and dashSlowdownPercent (default 35%) in config limits', () => {
    expect(DEFAULT_GAMEPLAY_CONFIG.dashSlowdownDuration).toBe(1.0);
    expect(DEFAULT_GAMEPLAY_CONFIG.dashSlowdownPercent).toBe(35);
    expect(GAMEPLAY_CONFIG_LIMITS.dashSlowdownDuration.min).toBe(0);
    expect(GAMEPLAY_CONFIG_LIMITS.dashSlowdownDuration.max).toBeGreaterThanOrEqual(3);
    expect(GAMEPLAY_CONFIG_LIMITS.dashSlowdownPercent.min).toBe(0);
    expect(GAMEPLAY_CONFIG_LIMITS.dashSlowdownPercent.max).toBeGreaterThanOrEqual(70);
  });

  it('reduces movement velocity temporarily after a dash finishes and restores full speed afterward', () => {
    const withSlowdown = new EngineInstance('mediano');
    withSlowdown.isPracticeMode = true;
    withSlowdown.setPlayerTeam(1, 'red');
    withSlowdown.applyModifiers({
      dashCooldown: 0.4,
      dashStaminaCost: 20,
      dashSlowdownDuration: 1.0,
      dashSlowdownPercent: 50
    });
    withSlowdown.startMatch(false);
    withSlowdown.fsm.startPlaying();

    const noSlowdown = new EngineInstance('mediano');
    noSlowdown.isPracticeMode = true;
    noSlowdown.setPlayerTeam(1, 'red');
    noSlowdown.applyModifiers({
      dashCooldown: 0.4,
      dashStaminaCost: 20,
      dashSlowdownDuration: 0,
      dashSlowdownPercent: 0
    });
    noSlowdown.startMatch(false);
    noSlowdown.fsm.startPlaying();

    // Tick 1: trigger dash moving right
    const dashInput = new Map([[1, { inputMask: INPUT_RIGHT | INPUT_DASH }]]);
    withSlowdown.step(dashInput);
    noSlowdown.step(dashInput);

    // Step 12 ticks (beyond 7-tick dash burst -> inside post-dash slowdown window)
    const walkRight = new Map([[1, { inputMask: INPUT_RIGHT }]]);
    for (let i = 0; i < 12; i++) {
      withSlowdown.step(walkRight);
      noSlowdown.step(walkRight);
    }

    const pSlow = withSlowdown.players.get(1)!;
    const pFast = noSlowdown.players.get(1)!;
    expect(withSlowdown.getPlayerSlowdownTimer(1)).toBeGreaterThan(0);
    expect(Math.abs(pSlow.vel.x)).toBeLessThan(Math.abs(pFast.vel.x));

    // Step 75 ticks (~1.25s) until slowdown expires completely
    for (let i = 0; i < 75; i++) {
      withSlowdown.step(walkRight);
    }
    expect(withSlowdown.getPlayerSlowdownTimer(1)).toBe(0);
  });

  it('computes deterministic, role-aware bot decisions for GK and ST across difficulties', () => {
    const gkBot = {
      id: 2,
      team: 'red' as const,
      x: -200,
      y: 80,
      vx: 0,
      vy: 0,
      radius: 15,
      position: 'GK' as const
    };
    const gkCfg = {
      id: 2,
      team: 'red' as const,
      position: 'GK' as const,
      difficulty: 'hard' as const
    };
    const gkCtx = {
      ballX: 180,
      ballY: 0,
      ballVx: 0,
      ballVy: 0,
      ballRadius: 10,
      halfWidth: 420,
      halfHeight: 200,
      goalHalfHeight: 70,
      kickMargin: 4,
      currentTick: 10,
      isKickoff: false,
      players: [gkBot]
    };
    const gkOutA = computeBotInput(gkBot, gkCfg, 100, gkCtx);
    const gkOutB = computeBotInput(gkBot, gkCfg, 100, gkCtx);
    expect(gkOutA).toEqual(gkOutB);
    expect(gkOutA.aimAngle).not.toBeNull();

    // ST with ball ahead attacks toward blue goal (+X)
    const stBot = {
      id: 3,
      team: 'red' as const,
      x: -50,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 15,
      position: 'ST' as const
    };
    const stCfg = {
      id: 3,
      team: 'red' as const,
      position: 'ST' as const,
      difficulty: 'hard' as const
    };
    const stCtx = {
      ...gkCtx,
      ballX: 120,
      ballY: 0,
      players: [stBot]
    };
    const stOut = computeBotInput(stBot, stCfg, 100, stCtx);
    expect(Math.cos(stOut.aimAngle ?? Math.PI)).toBeGreaterThan(0);
  });

  it('steps EngineInstance bots automatically and initializes matchStats for all team players even when Host spectates', () => {
    const engine = new EngineInstance('mediano');
    // Host (id: 1) stays spectator; red id:2 human + red id:3 bot vs blue id:4 bot
    engine.setPlayerTeam(2, 'red');
    engine.setPlayerPosition(2, 'GK');
    engine.setPlayerTeam(3, 'red');
    engine.setPlayerPosition(3, 'ST');
    engine.setBot(3, { id: 3, team: 'red', position: 'ST', difficulty: 'hard' });
    engine.setPlayerTeam(4, 'blue');
    engine.setPlayerPosition(4, 'MC');
    engine.setBot(4, { id: 4, team: 'blue', position: 'MC', difficulty: 'medium' });

    engine.startMatch(false);
    engine.fsm.startPlaying();
    expect(engine.fsm.state).toBe(MatchPhase.PLAYING);

    const botBefore = { ...engine.players.get(3)!.pos };
    for (let i = 0; i < 30; i++) {
      engine.step(new Map());
    }
    const botAfter = engine.players.get(3)!.pos;
    expect(Number.isFinite(botAfter.x)).toBe(true);
    expect(Math.hypot(botAfter.x - botBefore.x, botAfter.y - botBefore.y)).toBeGreaterThan(5);

    const stats = engine.getMatchStats();
    const statIds = stats.map((s) => String(s.playerId));
    expect(statIds).toContain('2');
    expect(statIds).toContain('3');
    expect(statIds).toContain('4');
    expect(statIds).not.toContain('1');
  });
});
