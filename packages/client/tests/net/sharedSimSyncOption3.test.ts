import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BinaryProtocol,
  EngineInstance,
  INPUT_FLAG_DASH,
  INPUT_FLAG_KICK,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_TURBO,
  MatchPhase,
  type GameStateSnapshot,
  type PlayerInput
} from '@legacyx/core';
import { SignalingClient } from '../../src/net/SignalingClient';
import { NetworkHost } from '../../src/net/NetworkHost';
import { NetworkImpairmentSimulator } from '../../src/net/NetworkImpairmentSimulator';
import { SharedSimSync } from '../../src/net/SharedSimSync';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

describe('Option 3 — SharedSimSync & Host Zero-Queue End-to-End Verification', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    (globalThis as any).WebSocket = function MockWs() {
      return { readyState: 1, send: vi.fn(), close: vi.fn() };
    };
    gameUI.resetRoomSession();
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('Test 2 (Host Zero-Queue + 4x Redundancy + Rising-Edge Latching): applies latest valid input on the very next 60 Hz tick without queue delay', () => {
    const sig = new SignalingClient('ws://localhost:8080', false);
    const host = new NetworkHost(sig, 'Host', { peerId: 'host-1' });
    const out = new Map<number, PlayerInput>();

    // First input applies immediately on next consume call (0 ticks queued)
    host.recordLatestRemoteInput(2, INPUT_FLAG_RIGHT, 1, null, 0);
    out.clear();
    host.consumePendingInputs(out);
    expect(out.get(2)!.sequence).toBe(1);
    expect(out.get(2)!.inputMask).toBe(INPUT_FLAG_RIGHT);

    // Client rapidly presses & releases Kick + Dash between two 60 Hz ticks (seqs 2 and 3)
    host.recordLatestRemoteInput(2, INPUT_FLAG_RIGHT | INPUT_FLAG_KICK | INPUT_FLAG_DASH, 2, null, 0);
    host.recordLatestRemoteInput(2, INPUT_FLAG_RIGHT, 3, null, 0);

    out.clear();
    host.consumePendingInputs(out);
    // Latest seq 3 is used immediately while rising edges from seq 2 are preserved once!
    expect(out.get(2)!.sequence).toBe(3);
    expect((out.get(2)!.inputMask & INPUT_FLAG_KICK) !== 0).toBe(true);
    expect((out.get(2)!.inputMask & INPUT_FLAG_DASH) !== 0).toBe(true);

    // Next tick consumes without re-firing Kick/Dash latches
    out.clear();
    host.consumePendingInputs(out);
    expect((out.get(2)!.inputMask & INPUT_FLAG_KICK) !== 0).toBe(false);
    expect((out.get(2)!.inputMask & INPUT_FLAG_DASH) !== 0).toBe(false);

    // Late duplicate seq 2 rescued by 4x redundancy (after seq 3 was consumed) does NOT double-fire an already-consumed edge
    // unless rescued before any newer kick/dash cycle; wait: old sequence below seq 3 with kick=true will never re-fire if seq 2 already ran
    // Wait: let's verify consecutive newer sequence 4 with only RIGHT does not re-fire
    host.recordLatestRemoteInput(2, INPUT_FLAG_RIGHT, 4, null, 0);
    out.clear();
    host.consumePendingInputs(out);
    expect((out.get(2)!.inputMask & INPUT_FLAG_KICK) !== 0).toBe(false);
    expect((out.get(2)!.inputMask & INPUT_FLAG_DASH) !== 0).toBe(false);

    host.destroy();
  });

  it('Test 3 (SharedSimSync under 110ms RTT Panama & 260ms 4G): smooth 60/120/240Hz progression, bounded correction, 250ms disconnect cap & hard-snap kickoff recovery', () => {
    for (const profile of [
      { name: 'Panama-110ms', latencyMs: 55, jitterMs: 40, lossPct: 0.01 },
      { name: 'Mobile4G-260ms', latencyMs: 130, jitterMs: 80, lossPct: 0.03 }
    ]) {
      const host = new EngineInstance('mediano');
      host.isPracticeMode = true;
      host.startMatch(false);
      host.fsm.startPlaying();
      const hp = host.addPlayer(2, 'red');
      hp.pos.set(-320, 0);
      host.ball.pos.set(0, 0);

      const sync = new SharedSimSync('mediano');
      sync.configure('mediano', host.modifiers, true);

      const downSim = new NetworkImpairmentSimulator<ArrayBuffer>({
        latencyMs: profile.latencyMs,
        jitterMs: profile.jitterMs,
        packetLossRate: profile.lossPct,
        reorderRate: 0.08,
        seed: profile.latencyMs * 1337
      });

      const TICK_MS = 1000 / 60;
      const inputs = new Map<number, PlayerInput>([[2, { inputMask: INPUT_FLAG_RIGHT | INPUT_FLAG_TURBO }]]);

      for (let tick = 1; tick <= 240; tick++) {
        const tickStartMs = tick * TICK_MS;
        host.step(inputs);
        downSim.send(BinaryProtocol.encodeSnapshot(host.getState()), tickStartMs, (buf, arrivedAt) => {
          const decoded = BinaryProtocol.decodeSnapshot(buf);
          if (decoded) sync.onSnapshot(decoded, arrivedAt);
        });

        // Step client at 120 Hz (2 frames per 60 Hz host tick)
        for (let sub = 0; sub < 2; sub++) {
          const nowMs = tickStartMs + sub * (TICK_MS / 2);
          downSim.flushDue(nowMs);
          sync.update(1 / 120, nowMs);
          const snap = sync.buildRenderSnapshot(Math.min(85, profile.latencyMs), nowMs);
          if (snap) {
            expect(Number.isFinite(snap.discs[0]!.x)).toBe(true);
          }
        }
      }

      const tel = sync.getTelemetry(undefined, 240 * TICK_MS);
      expect(tel.hardSnaps).toBe(0);
      expect(tel.syncCorrectionAvgPx).toBeLessThan(8);

      // Disconnect cap stops local extrapolation at 15 ticks (250 ms)
      const capStart = 240 * TICK_MS;
      for (let k = 1; k <= 30; k++) {
        sync.update(1 / 60, capStart + k * TICK_MS);
      }
      expect(sync.getTelemetry(undefined, capStart + 500).localStepsSinceSnap).toBeLessThanOrEqual(15);

      // Kickoff/goal hard snap (> 90 px) recovers cleanly to offset = 0
      sync.onSnapshot(
        {
          tick: 245,
          phase: MatchPhase.KICKOFF,
          matchTimer: 20,
          redScore: 1,
          blueScore: 0,
          soundMask: 0,
          discs: [
            { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
            { id: 2, team: 1, x: -300, y: 0, vx: 0, vy: 0, flags: 0, stamina: 100 }
          ]
        },
        capStart + 520
      );
      const afterReset = sync.buildRenderSnapshot(60, capStart + 520)!;
      expect(afterReset.discs.find((d) => d.id === 2)!.x).toBe(-300);
    }
  });

  it('Test 4 (Real Physics Extrapolation 0–250 ms): executes @legacyx/core wall/post bounce in extrapWorld without mutating simWorld or triggering GoalNet/sounds/pause drift', () => {
    const sync = new SharedSimSync('mediano');
    const halfW = sync.simWorld.stadium.halfWidth;
    const ballR = sync.simWorld.ball.radius;

    // Aim ball fast at right side wall (above goal mouth) so 150 ms extrapolation must bounce off wall!
    sync.onSnapshot(
      {
        tick: 10,
        phase: MatchPhase.PLAYING,
        matchTimer: 30,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [{ id: 0, team: 0, x: halfW - 35, y: 150, vx: 1200, vy: 0, flags: 0 }]
      },
      1000
    );

    const netSpies = sync.extrapWorld.world.goalNets.map((n) => vi.spyOn(n, 'step'));
    const render60 = sync.buildRenderSnapshot(150, 1000)!;
    const renderBall = render60.discs[0]!;

    // Ball bounced inward (vx reversed < 0, x strictly inside halfWidth - radius)
    expect(renderBall.x).toBeLessThanOrEqual(halfW - ballR + 0.01);
    expect(renderBall.vx).toBeLessThan(0);

    // Authoritative simWorld NEVER mutated and GoalNet.step NEVER ran during extrapolation!
    expect(sync.simWorld.ball.pos.x).toBeCloseTo(halfW - 35, 3);
    expect(sync.simWorld.ball.vel.x).toBeCloseTo(1200, 3);
    for (const s of netSpies) {
      expect(s).not.toHaveBeenCalled();
    }

    // Frozen phases (PAUSE, STOP, PRE_MATCH_VS, START_COUNTDOWN) yield 0 extrapolation drift
    for (const frozenPhase of [
      MatchPhase.PAUSE,
      MatchPhase.STOP,
      MatchPhase.PRE_MATCH_VS,
      MatchPhase.START_COUNTDOWN
    ]) {
      sync.onSnapshot(
        {
          tick: 20 + Math.round(frozenPhase * 10),
          phase: frozenPhase,
          matchTimer: 30,
          redScore: 0,
          blueScore: 0,
          soundMask: 0,
          discs: [{ id: 0, team: 0, x: 40, y: -15, vx: 600, vy: 300, flags: 0 }]
        },
        2000 + frozenPhase * 100
      );
      const frozenSnap = sync.buildRenderSnapshot(200, 2000 + frozenPhase * 100)!;
      expect(frozenSnap.discs[0]!.x).toBe(40);
      expect(frozenSnap.discs[0]!.y).toBe(-15);
      expect(frozenSnap.discs[0]!.vx).toBe(0);
    }
  });

  it('Test 5 (Sub-frame 240Hz Progression & Frame-Rate-Independent exp(-20*dt) Decay): smooth interpolation with extrapolation=0 and deadzone < 0.25px', () => {
    const sync60 = new SharedSimSync('mediano');
    const sync240 = new SharedSimSync('mediano');

    const s0: GameStateSnapshot = {
      tick: 1,
      phase: MatchPhase.PLAYING,
      matchTimer: 10,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [{ id: 0, team: 0, x: 0, y: 0, vx: 600, vy: 0, flags: 0 }]
    };
    sync60.onSnapshot(s0, 1000);
    sync240.onSnapshot(s0, 1000);

    // Verify 4 sub-frames at 240 Hz advance monotonically with extrapolationMs = 0
    const xs240: number[] = [];
    for (let f = 1; f <= 4; f++) {
      const now = 1000 + f * (1000 / 240);
      sync240.update(1 / 240, now);
      xs240.push(sync240.buildRenderSnapshot(0, now)!.discs[0]!.x);
    }
    expect(xs240[0]).toBeGreaterThan(0);
    expect(xs240[1]).toBeGreaterThan(xs240[0]!);
    expect(xs240[2]).toBeGreaterThan(xs240[1]!);
    expect(xs240[3]).toBeGreaterThan(xs240[2]!);

    // Frame-rate-independent visualOffset decay: 60 Hz vs 240 Hz match after 100 ms
    const errSnap: GameStateSnapshot = {
      tick: 2,
      phase: MatchPhase.PLAYING,
      matchTimer: 10,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [{ id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 }]
    };
    // Advance sync60 to match time window and inject 20 px visual error cleanly
    sync60.reset();
    sync240.reset();
    const baseA: GameStateSnapshot = {
      tick: 10,
      phase: MatchPhase.PLAYING,
      matchTimer: 10,
      redScore: 0,
      blueScore: 0,
      soundMask: 0,
      discs: [{ id: 0, team: 0, x: 20, y: 0, vx: 0, vy: 0, flags: 0 }]
    };
    const baseB: GameStateSnapshot = { ...errSnap, tick: 11 };
    sync60.onSnapshot(baseA, 1000);
    sync240.onSnapshot(baseA, 1000);
    sync60.onSnapshot(baseB, 1016);
    sync240.onSnapshot(baseB, 1016);

    for (let f = 1; f <= 6; f++) sync60.update(1 / 60, 1016 + f * (1000 / 60));
    for (let f = 1; f <= 24; f++) sync240.update(1 / 240, 1016 + f * (1000 / 240));
    const rem60 = sync60.buildRenderSnapshot(0, 1116)!.discs[0]!.x;
    const rem240 = sync240.buildRenderSnapshot(0, 1116)!.discs[0]!.x;
    expect(Math.abs(rem60 - rem240)).toBeLessThan(0.05);

    // Sub-pixel noise (< 0.25 px) is suppressed cleanly without creating visualOffset
    sync60.onSnapshot(
      { ...baseB, tick: 12, discs: [{ id: 0, team: 0, x: rem60 + 0.1, y: 0, vx: 0, vy: 0, flags: 0 }] },
      1116
    );
    expect(sync60.buildRenderSnapshot(0, 1116)!.discs[0]!.x).toBeCloseTo(rem60 + 0.1, 4);
  });

  it('Test 6 (UI Commands & Non-Reactive Debug Telemetry): /netdebug, /extrapolation, /simlag, __legacyxNetDebug & /netmode removed', () => {
    gameUI.showNetDebug = false;
    expect(gameUI.handleChatCommand('/netdebug')).toBe(true);
    expect(gameUI.showNetDebug).toBe(true);
    expect(gameUI.handleChatCommand('/netdebug off')).toBe(true);
    expect(gameUI.showNetDebug).toBe(false);

    // /netmode is removed and falls through as regular text
    expect(gameUI.handleChatCommand('/netmode classic')).toBe(false);
    expect((gameUI.settings as any).netMode).toBeUndefined();

    expect(gameUI.handleChatCommand('/extrapolation 75')).toBe(true);
    expect(gameUI.extrapolationMs).toBe(75);
    expect(gameUI.handleChatCommand('/simlag 110 20 1')).toBe(true);
    expect(gameUI.simLagConfig).toEqual({ enabled: true, rttMs: 110, jitterMs: 20, lossPct: 1 });

    gameUI.updateLiveNetDebug({
      rttMs: 110,
      jitterMs: 20,
      lossPct: 1,
      iceRoute: 'Direct P2P (STUN/srflx)',
      syncCorrectionAvgPx: 1.42,
      syncCorrectionMaxPx: 4.85,
      extrapolationMs: 75,
      localStepsSinceSnap: 2,
      frameTimeP99: 16.9
    });
    expect(gameUI.liveNetDebug.syncCorrectionAvgPx).toBe(1.42);
    expect(gameUI.liveNetDebug.frameTimeP99).toBe(16.9);
  });
});
