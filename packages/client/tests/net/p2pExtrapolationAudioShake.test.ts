import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EngineInstance,
  INPUT_FLAG_RIGHT,
  MatchPhase
} from '@legacyx/core';
import { DiscRenderer, type DiscSnapshot } from '../../src/renderer/DiscRenderer.js';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction.js';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';
import { gameApp } from '../../src/net/GameApp.js';
import { soundFX } from '../../src/audio/SoundFX.js';

describe('P2P Extrapolation (0-250ms), Client Prediction Replay & Non-Host Audio/Screen Shake Parity', () => {
  beforeEach(() => {
    gameUI.setExtrapolationMs(0);
    gameUI.chatMessages = [];
    gameUI.screenShake = true;
    vi.restoreAllMocks();
  });

  it('extrapolates player and ball render positions (0..250ms) with friction damping and wall clamping without mutating authoritative state, and disables when paused', () => {
    const dr = new DiscRenderer();
    dr.dampingBall = 0.99;
    dr.dampingPlayer = 0.96;
    dr.setStadiumBounds({
      halfWidth: 420,
      halfHeight: 200,
      goalDepth: 36,
      goalHalfHeight: 64
    });

    const authBall: DiscSnapshot = {
      id: 0,
      x: 100,
      y: 20,
      vx: 360, // 6 px/tick
      vy: -120,
      radius: 5.8,
      team: 0,
      avatar: ''
    };
    const authPlayer: DiscSnapshot = {
      id: 2,
      x: -50,
      y: 10,
      vx: 240, // 4 px/tick
      vy: 60,
      radius: 15,
      team: 2,
      avatar: '7'
    };

    // 1. 0 ms -> exact unmodified positions
    dr.setExtrapolation(0);
    expect(dr.getRenderDisc(authBall, true).x).toBe(100);
    expect(dr.getRenderDisc(authPlayer, true).x).toBe(-50);

    // 2. 150 ms (k = 9 ticks) -> geometric damping formula factor = (1 - d^k) / (1 - d)
    dr.setExtrapolation(150);
    const k = (150 / 1000) * 60; // 9
    const expectedBallFactor = (1 - Math.pow(0.99, k)) / (1 - 0.99);
    const expectedPlayerFactor = (1 - Math.pow(0.96, k)) / (1 - 0.96);

    const rBall = dr.getRenderDisc(authBall, true);
    expect(rBall.x).toBeCloseTo(100 + (360 / 60) * expectedBallFactor, 3);
    expect(rBall.y).toBeCloseTo(20 + (-120 / 60) * expectedBallFactor, 3);
    // Authoritative snapshot object must NEVER be mutated
    expect(authBall.x).toBe(100);
    expect(authBall.y).toBe(20);

    const rPlayer = dr.getRenderDisc(authPlayer, true);
    expect(rPlayer.x).toBeCloseTo(-50 + (240 / 60) * expectedPlayerFactor, 3);
    expect(authPlayer.x).toBe(-50);

    // 3. Clamps extrapolation range to [0, 250] ms and clamps render coordinates to stadium walls
    dr.setExtrapolation(400);
    expect(dr.extrapolationMs).toBe(250);
    const wallBall: DiscSnapshot = {
      id: 0,
      x: 412,
      y: 195, // outside goal mouth (|y| > 64), must clamp to halfWidth - radius & halfHeight - radius
      vx: 1500,
      vy: 900,
      radius: 5.8,
      team: 0,
      avatar: ''
    };
    const clamped = dr.getRenderDisc(wallBall, true);
    expect(clamped.x).toBeLessThanOrEqual(420 - 5.8);
    expect(clamped.y).toBeLessThanOrEqual(200 - 5.8);

    // 4. Disabled completely when paused
    dr.isPaused = true;
    const pausedRender = dr.getRenderDisc(authBall, true);
    expect(pausedRender.x).toBe(100);
    expect(pausedRender.y).toBe(20);
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

  it('replays pending inputs on authoritative snapshot reconciliation, smooths small errors via visualOffset (0.82 decay), and hard-snaps above 60 px', () => {
    const hostEngine = new EngineInstance('AF 3v3');
    const predEngine = new EngineInstance('AF 3v3');
    const reconciler = new ClientPredictionReconciler();

    hostEngine.addPlayer(2, 'blue');
    predEngine.addPlayer(2, 'blue');
    hostEngine.startMatch(false);
    predEngine.setState(hostEngine.getState());
    expect(predEngine.fsm.state).toBe(MatchPhase.KICKOFF);

    // Host advances to tick 5 while client predicts up to tick 8 with RIGHT input
    const rightMap = new Map([[2, { inputMask: INPUT_FLAG_RIGHT }]]);
    for (let t = 1; t <= 8; t++) {
      reconciler.recordInput(t, INPUT_FLAG_RIGHT);
      predEngine.step(rightMap);
      if (t <= 5) {
        hostEngine.step(rightMap);
      }
    }

    const authAtTick5 = hostEngine.getState();
    expect(authAtTick5.tick).toBe(5);

    // Reconcile at tick 5: ticks <= 5 discarded, ticks 6..8 replayed seamlessly with ~0 error!
    const res1 = reconciler.reconcile(predEngine, authAtTick5, 2);
    expect(res1.hardSnapped).toBe(false);
    expect(reconciler.pendingInputs.map((i) => i.tick)).toEqual([6, 7, 8]);
    expect(Math.hypot(reconciler.visualOffset.x, reconciler.visualOffset.y)).toBeLessThan(0.5);

    // Simulate a moderate 18 px collision discrepancy (< 60 px): absorbed into visualOffset and decays *= 0.82
    const p2 = predEngine.players.get(2)!;
    p2.pos.x += 18;
    const res2 = reconciler.reconcile(predEngine, authAtTick5, 2);
    expect(res2.hardSnapped).toBe(false);
    const initialOffsetX = reconciler.visualOffset.x;
    expect(Math.abs(initialOffsetX - 18)).toBeLessThan(1.0);

    reconciler.decayVisualOffset();
    expect(reconciler.visualOffset.x).toBeCloseTo(initialOffsetX * 0.82, 4);

    // Simulate a catastrophic > 60 px desync (e.g. kickoff reset): hard-snaps and clears visualOffset to 0
    p2.pos.x += 120;
    const res3 = reconciler.reconcile(predEngine, authAtTick5, 2);
    expect(res3.hardSnapped).toBe(true);
    expect(reconciler.visualOffset.x).toBe(0);
    expect(reconciler.visualOffset.y).toBe(0);
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
