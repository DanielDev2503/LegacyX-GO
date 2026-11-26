import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EngineInstance,
  INPUT_FLAG_RIGHT,
  MatchPhase
} from '@legacyx/core';
import { SharedSimSync } from '../../src/net/SharedSimSync.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';
import { gameApp } from '../../src/net/GameApp.js';
import { soundFX } from '../../src/audio/SoundFX.js';

describe('P2P SharedSimSync Real Extrapolation (0-250ms), Smoothing & Non-Host Audio/Screen Shake Parity', () => {
  beforeEach(() => {
    gameUI.setExtrapolationMs(0);
    gameUI.chatMessages = [];
    gameUI.screenShake = true;
    vi.restoreAllMocks();
  });

  it('extrapolates player and ball with real @legacyx/core wall bouncing without mutating simWorld, and disables when paused', () => {
    const sync = new SharedSimSync('mediano');
    const authSnap = {
      tick: 10,
      phase: MatchPhase.PLAYING,
      matchTimer: 30,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [
        { id: 0, team: 0, x: 100, y: 20, vx: 360, vy: -120, flags: 0 },
        {
          id: 2,
          team: 2,
          x: -50,
          y: 10,
          vx: 240,
          vy: 60,
          flags: 0,
          stamina: 100,
          inputMask: INPUT_FLAG_RIGHT
        }
      ]
    };
    sync.onSnapshot(authSnap, 1000);

    // 1. 0 ms at exact arrival -> exact unmodified coordinates
    const zeroSnap = sync.buildRenderSnapshot(0, 1000)!;
    expect(zeroSnap.discs.find((d) => d.id === 0)!.x).toBe(100);
    expect(zeroSnap.discs.find((d) => d.id === 2)!.x).toBe(-50);

    // 2. 150 ms real physics extrapolation forward without mutating simWorld
    const extrapSnap = sync.buildRenderSnapshot(150, 1000)!;
    expect(extrapSnap.discs.find((d) => d.id === 0)!.x).toBeGreaterThan(100);
    expect(extrapSnap.discs.find((d) => d.id === 2)!.x).toBeGreaterThan(-50);
    expect(sync.simWorld.ball.pos.x).toBe(100);
    expect(sync.simWorld.players.get(2)!.pos.x).toBe(-50);

    // 3. Real wall bounce + clamp <= 250 ms near stadium wall
    sync.setExtrapolationMs(400);
    expect(sync.extrapolationMs).toBe(250);
    sync.onSnapshot(
      {
        tick: 11,
        phase: MatchPhase.PLAYING,
        matchTimer: 30,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          {
            id: 0,
            team: 0,
            x: sync.simWorld.stadium.halfWidth - 15,
            y: 150,
            vx: 1500,
            vy: 0,
            flags: 0
          },
          { id: 2, team: 2, x: -50, y: 10, vx: 0, vy: 0, flags: 0, stamina: 100 }
        ]
      },
      1016
    );
    const bounced = sync.buildRenderSnapshot(250, 1016)!;
    const bouncedBall = bounced.discs.find((d) => d.id === 0)!;
    expect(bouncedBall.x).toBeLessThanOrEqual(sync.simWorld.stadium.halfWidth - sync.simWorld.ball.radius + 0.01);
    expect(bouncedBall.vx).toBeLessThan(0);

    // 4. Disabled completely during MatchPhase.PAUSE
    sync.onSnapshot(
      {
        tick: 12,
        phase: MatchPhase.PAUSE,
        matchTimer: 30,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 0, team: 0, x: 100, y: 20, vx: 360, vy: 0, flags: 0 }]
      },
      1032
    );
    const pausedSnap = sync.buildRenderSnapshot(150, 1032)!;
    expect(pausedSnap.discs[0]!.x).toBe(100);
    expect(pausedSnap.discs[0]!.vx).toBe(0);
  });

  it('handles /extrapolation <0-250> locally with system confirmation, localStorage persistence, and zero network broadcast', () => {
    const sentOverNetwork: string[] = [];
    gameUI.onChatSent = (msg) => sentOverNetwork.push(msg);

    const handled = gameUI.handleChatCommand('/extrapolation 125');
    expect(handled).toBe(true);
    expect(gameUI.extrapolationMs).toBe(125);
    expect(gameUI.settings.extrapolationMs).toBe(125);
    expect(sentOverNetwork).toHaveLength(0);

    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('legacyx_extrapolation_ms')).toBe('125');
      expect(localStorage.getItem('haxball_extrapolation_ms')).toBe('125');
    }

    const lastNotice = gameUI.chatMessages[gameUI.chatMessages.length - 1];
    expect(lastNotice).toBeDefined();
    expect(lastNotice?.isSystem).toBe(true);
    expect(lastNotice?.text).toBe('Extrapolación establecida en 125 ms');

    // Values > 250 clamp cleanly to 250 ms; non-numeric input leaves extrapolationMs untouched
    const clampedHigh = gameUI.handleChatCommand('/extrapolation 300');
    expect(clampedHigh).toBe(true);
    expect(gameUI.extrapolationMs).toBe(250);
    const invalid = gameUI.handleChatCommand('/extrapolation invalid');
    expect(invalid).toBe(true);
    expect(gameUI.extrapolationMs).toBe(250);
    expect(sentOverNetwork).toHaveLength(0);

    // Normal chat still routes to onChatSent
    gameUI.sendChatMessage('buen pase!');
    expect(sentOverNetwork).toEqual(['buen pase!']);
  });

  it('absorbs small errors via exponential visualOffset decay and hard-snaps above 90 px in SharedSimSync', () => {
    const hostEngine = new EngineInstance('AF 3v3');
    const sync = new SharedSimSync('AF 3v3');

    hostEngine.addPlayer(2, 'blue');
    hostEngine.startMatch(false);
    const initSnap = hostEngine.getState();
    sync.onSnapshot(initSnap, 1000);
    expect(sync.simWorld.fsm.state).toBe(MatchPhase.KICKOFF);

    // Both host and SharedSimSync simulate 5 ticks with RIGHT input -> ~0 error!
    const rightMap = new Map([[2, { inputMask: INPUT_FLAG_RIGHT }]]);
    for (let t = 1; t <= 5; t++) {
      hostEngine.step(rightMap);
      sync.update(1 / 60, 1000 + t * (1000 / 60));
    }

    const authAtTick5 = hostEngine.getState();
    const basePlayer = authAtTick5.discs.find((d) => d.id === 2)!;

    // Simulate moderate 18 px discrepancy (< 90 px): absorbed into visualOffset, decays by exp(-20 * dt)
    sync.onSnapshot(
      {
        ...authAtTick5,
        tick: authAtTick5.tick + 1,
        discs: authAtTick5.discs.map((d) => (d.id === 2 ? { ...d, x: basePlayer.x - 18 } : d))
      },
      1100
    );
    const tel1 = sync.getTelemetry(undefined, 1100);
    expect(tel1.hardSnaps).toBe(0);
    expect(Math.abs(tel1.lastCorrectionPx - 18)).toBeLessThan(3.0);

    // Catastrophic > 90 px desync: triggers hard snap immediately
    sync.onSnapshot(
      {
        ...authAtTick5,
        tick: authAtTick5.tick + 2,
        discs: authAtTick5.discs.map((d) => (d.id === 2 ? { ...d, x: basePlayer.x + 150 } : d))
      },
      1116
    );
    const tel2 = sync.getTelemetry(undefined, 1116);
    expect(tel2.hardSnaps).toBe(1);
    expect(sync.buildRenderSnapshot(0, 1116)!.discs.find((d) => d.id === 2)!.x).toBeCloseTo(
      basePlayer.x + 150,
      2
    );
  });

  it('triggers procedural SoundFX and Screen Shake on Non-Host GAME_FX_EVENT and respects Sacudida de pantalla toggle', () => {
    const kickSpy = vi.spyOn(soundFX, 'playKick').mockImplementation(() => {});
    const postSpy = vi.spyOn(soundFX, 'playPostHit').mockImplementation(() => {});
    const wallSpy = vi.spyOn(soundFX, 'playBounce').mockImplementation(() => {});
    const hornSpy = vi.spyOn(soundFX, 'playGoalHorn').mockImplementation(() => {});
    const whistleSpy = vi.spyOn(soundFX, 'playWhistle').mockImplementation(() => {});
    const countdownSpy = vi.spyOn(soundFX, 'playCountdown').mockImplementation(() => {});

    const shakes: Array<{ intensity: number; durationMs: number }> = [];
    gameUI.onTriggerShake = (intensity, durationMs) => {
      shakes.push({ intensity, durationMs });
    };

    gameUI.screenShake = true;
    gameApp.playAndApplyGameFx('kick', 1.0);
    gameApp.playAndApplyGameFx('power_shot', 1.8);
    gameApp.playAndApplyGameFx('wall');
    gameApp.playAndApplyGameFx('post');
    gameApp.playAndApplyGameFx('goal');
    gameApp.playAndApplyGameFx('countdown_tick', undefined, 3);
    gameApp.playAndApplyGameFx('countdown_tick', undefined, 0);

    expect(kickSpy).toHaveBeenCalledTimes(2);
    expect(wallSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(hornSpy).toHaveBeenCalledTimes(1);
    expect(whistleSpy).toHaveBeenCalledTimes(1);
    expect(countdownSpy).toHaveBeenNthCalledWith(1, false);
    expect(countdownSpy).toHaveBeenNthCalledWith(2, true);
    expect(shakes).toEqual([
      { intensity: 7, durationMs: 220 },
      { intensity: 15, durationMs: 500 }
    ]);

    // Disable "Sacudida de pantalla" -> audio still plays, camera shake suppressed
    shakes.length = 0;
    gameUI.screenShake = false;
    gameApp.playAndApplyGameFx('post');
    gameApp.playAndApplyGameFx('goal');
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(hornSpy).toHaveBeenCalledTimes(2);
    expect(shakes).toHaveLength(0);
  });
});
