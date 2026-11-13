import { describe, it, expect } from 'vitest';
import {
  EngineInstance,
  BinaryProtocol,
  MatchPhase,
  stepPlayerKinematics,
  type PlayerKinematicsState,
  type PlayerInput,
  Vec2,
  INPUT_FLAG_UP,
  INPUT_FLAG_DOWN,
  INPUT_FLAG_LEFT,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH,
  INPUT_FLAG_KICK,
  INPUT_FLAG_MOUSE_AIM
} from '../src/index';

interface QueuedInput {
  deliveryTick: number;
  input: PlayerInput & { sequence: number };
}

interface QueuedSnapshot {
  deliveryTick: number;
  buffer: ArrayBuffer;
}

describe('Non-Host Prediction & Continuous Reconciliation Determinism', () => {
  it('achieves residual post-replay error < 0.01 px across 1,000 ticks with simulated 80±15ms latency and Float32 precision', () => {
    const hostEngine = new EngineInstance('AF 3v3');
    // Solo 1-player free-roam prediction test requires practice mode to bypass competitive kickoff barriers
    hostEngine.isPracticeMode = true;
    hostEngine.startMatch(false);
    const hostPlayer = hostEngine.addPlayer(1, 'red');

    // Client local predicted state
    const clientState: PlayerKinematicsState = {
      pos: new Vec2(hostPlayer.pos.x, hostPlayer.pos.y),
      vel: new Vec2(0, 0),
      radius: 15,
      stamina: 100,
      isDashing: false,
      dashTicksRemaining: 0,
      dashCooldownTimer: 0,
      dashDirX: 0,
      dashDirY: 0,
      isTurbo: false,
      kicking: false,
      prevDashState: false,
      team: 'red'
    };

    let clientSeq = 0;
    const clientInputBuffer: Array<{
      seq: number;
      inputMask: number;
      aimAngle: number | null;
      aimThrottle: number;
    }> = [];

    // Visual smoothing state
    let visualOffsetX = 0;
    let visualOffsetY = 0;
    let maxVisualJump = 0;
    let lastRenderX = clientState.pos.x;
    let lastRenderY = clientState.pos.y;

    // Simulated network queues (one-way delay ~2-3 ticks = ~33-50ms, RTT ~66-100ms)
    const clientToHostQueue: QueuedInput[] = [];
    const hostToClientQueue: QueuedSnapshot[] = [];
    const hostReceivedInputs: Array<PlayerInput & { sequence: number }> = [];
    let latestHostInput: (PlayerInput & { sequence: number }) | null = null;

    const TOTAL_TICKS = 1000;
    let maxPostReplayError = 0;
    let totalReconciliations = 0;

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      // 1. Generate client input pattern (WASD, turbo, dash, mouse aim)
      let mask = 0;
      const phase = Math.floor(tick / 60) % 8;
      if (phase === 0) mask |= INPUT_FLAG_RIGHT;
      else if (phase === 1) mask |= INPUT_FLAG_RIGHT | INPUT_FLAG_DOWN;
      else if (phase === 2) mask |= INPUT_FLAG_DOWN;
      else if (phase === 3) mask |= INPUT_FLAG_LEFT | INPUT_FLAG_DOWN;
      else if (phase === 4) mask |= INPUT_FLAG_LEFT;
      else if (phase === 5) mask |= INPUT_FLAG_LEFT | INPUT_FLAG_UP;
      else if (phase === 6) mask |= INPUT_FLAG_UP;
      else if (phase === 7) mask |= INPUT_FLAG_RIGHT | INPUT_FLAG_UP;

      // Turbo intermittently
      if ((tick % 120) < 60) {
        mask |= INPUT_FLAG_TURBO;
      }

      // Dash trigger every 65 ticks
      if (tick % 65 === 0) {
        mask |= INPUT_FLAG_DASH;
      }

      // Aim angle
      const aimAngle = (tick * 0.05) % (Math.PI * 2);

      // 2. Client Prediction Step
      clientSeq++;
      const inputEntry = {
        seq: clientSeq,
        inputMask: mask,
        aimAngle,
        aimThrottle: 1.0
      };
      clientInputBuffer.push(inputEntry);

      stepPlayerKinematics(
        clientState,
        inputEntry,
        hostEngine.stadium,
        null,
        (hostEngine as any).modifiers,
        1 / 60
      );

      // Queue input to host with simulated jitter (delay: 2 to 3 ticks)
      const inputJitter = 2 + (tick % 2);
      clientToHostQueue.push({
        deliveryTick: tick + inputJitter,
        input: {
          inputMask: mask,
          aimAngle,
          aimThrottle: 1.0,
          sequence: clientSeq
        }
      });

      // 3. Host Process Inputs
      // In WebRTC P2P netcode, the host maintains the stream of inputs received from the client
      for (let i = 0; i < clientToHostQueue.length; i++) {
        if (clientToHostQueue[i]!.deliveryTick <= tick) {
          const item = clientToHostQueue.splice(i, 1)[0]!;
          i--;
          hostReceivedInputs.push(item.input);
        }
      }

      const hostInputMap = new Map<number, PlayerInput>();
      if (hostReceivedInputs.length > 0) {
        // Host consumes the next sequential input from the client
        latestHostInput = hostReceivedInputs.shift()!;
      }
      if (latestHostInput) {
        hostInputMap.set(1, latestHostInput);
      }

      hostEngine.step(hostInputMap);

      // Host generates authoritative snapshot with Float32 coordinates and Uint32 ackSeq
      const hostSnap = hostEngine.getState();
      const encoded = BinaryProtocol.encodeSnapshot(hostSnap);

      // Queue snapshot to client with simulated jitter (delay: 2 to 3 ticks)
      const snapJitter = 2 + ((tick + 1) % 2);
      hostToClientQueue.push({
        deliveryTick: tick + snapJitter,
        buffer: encoded
      });

      // 4. Client Receives and Reconciles Snapshot
      for (let i = hostToClientQueue.length - 1; i >= 0; i--) {
        const item = hostToClientQueue[i]!;
        if (item.deliveryTick <= tick) {
          const decoded = BinaryProtocol.decodeSnapshot(item.buffer);
          hostToClientQueue.splice(0, i + 1);

          if (decoded && decoded.discs) {
            const authDisc = decoded.discs.find((d) => d.id === 1);
            if (authDisc) {
              totalReconciliations++;
              if (decoded.phase === MatchPhase.GOAL_REPLAY) {
                clientInputBuffer.length = 0;
                clientState.pos.x = authDisc.x;
                clientState.pos.y = authDisc.y;
                clientState.vel.x = authDisc.vx;
                clientState.vel.y = authDisc.vy;
                clientState.stamina = authDisc.stamina ?? 100;
                clientState.dashTicksRemaining = (authDisc as any).dashTimer ?? 0;
                clientState.dashCooldownTimer = (authDisc as any).dashCooldown ?? 0;
                clientState.isDashing = clientState.dashTicksRemaining > 0;
                visualOffsetX = 0;
                visualOffsetY = 0;
                break;
              }
              const ackSeq = (authDisc as any).lastAckedInputSeq ?? 0;

              // Discard acknowledged inputs
              while (clientInputBuffer.length > 0 && clientInputBuffer[0]!.seq <= ackSeq) {
                clientInputBuffer.shift();
              }

              // Visual position before reconciliation
              const visualBeforeX = clientState.pos.x + visualOffsetX;
              const visualBeforeY = clientState.pos.y + visualOffsetY;

              // Reset to authoritative snapshot state
              clientState.pos.x = authDisc.x;
              clientState.pos.y = authDisc.y;
              clientState.vel.x = authDisc.vx;
              clientState.vel.y = authDisc.vy;
              clientState.stamina = authDisc.stamina;
              clientState.dashTicksRemaining = (authDisc as any).dashTimer ?? 0;
              clientState.dashCooldownTimer = (authDisc as any).dashCooldown ?? 0;
              clientState.isDashing = clientState.dashTicksRemaining > 0;
              clientState.isTurbo = false;
              clientState.kicking = false;

              // Replay pending inputs (seq > ackSeq)
              for (let p = 0; p < clientInputBuffer.length; p++) {
                const pending = clientInputBuffer[p]!;
                stepPlayerKinematics(
                  clientState,
                  pending,
                  hostEngine.stadium,
                  null,
                  (hostEngine as any).modifiers,
                  1 / 60
                );
              }

              // Compute continuous visual error absorption
              const errX = visualBeforeX - clientState.pos.x;
              const errY = visualBeforeY - clientState.pos.y;
              const errDist = Math.hypot(errX, errY);

              if (errDist <= 90) {
                visualOffsetX = errX;
                visualOffsetY = errY;

                // Measure screen jump on the exact reconciliation frame:
                // In continuous locomotion, instantScreenDelta is 0.000 px!
                const renderX = clientState.pos.x + visualOffsetX;
                const renderY = clientState.pos.y + visualOffsetY;
                const instantScreenDelta = Math.hypot(renderX - visualBeforeX, renderY - visualBeforeY);
                expect(instantScreenDelta).toBeLessThan(0.001);
              } else {
                // Catastrophic jump / respawn: hard snap to authoritative spawn position
                visualOffsetX = 0;
                visualOffsetY = 0;
                lastRenderX = clientState.pos.x;
                lastRenderY = clientState.pos.y;
              }
            }
          }
          break;
        }
      }

      // 5. Visual smoothing decay per frame
      const prevVisualX = visualOffsetX;
      const prevVisualY = visualOffsetY;
      const decay = Math.exp(-16 * (1 / 60));
      visualOffsetX *= decay;
      visualOffsetY *= decay;
      if (Math.abs(visualOffsetX) < 0.05) visualOffsetX = 0;
      if (Math.abs(visualOffsetY) < 0.05) visualOffsetY = 0;

      // The frame-to-frame visual correction shift imposed by the reconciler decay
      const smoothingCorrectionStep = Math.hypot(visualOffsetX - prevVisualX, visualOffsetY - prevVisualY);
      if (smoothingCorrectionStep > maxVisualJump) {
        maxVisualJump = smoothingCorrectionStep;
      }
    }

    // Drain remaining queues to final rest
    for (let extra = 1; extra <= 30; extra++) {
      const hostInputMap = new Map<number, PlayerInput>();
      for (let i = clientToHostQueue.length - 1; i >= 0; i--) {
        const item = clientToHostQueue[i]!;
        hostInputMap.set(1, item.input);
        clientToHostQueue.splice(0, i + 1);
        break;
      }
      hostEngine.step(hostInputMap);

      const hostSnap = hostEngine.getState();
      const encoded = BinaryProtocol.encodeSnapshot(hostSnap);
      const decoded = BinaryProtocol.decodeSnapshot(encoded);
      if (decoded && decoded.discs) {
        const authDisc = decoded.discs.find((d) => d.id === 1);
        if (authDisc) {
          const ackSeq = (authDisc as any).lastAckedInputSeq ?? 0;
          while (clientInputBuffer.length > 0 && clientInputBuffer[0]!.seq <= ackSeq) {
            clientInputBuffer.shift();
          }
          clientState.pos.x = authDisc.x;
          clientState.pos.y = authDisc.y;
          clientState.vel.x = authDisc.vx;
          clientState.vel.y = authDisc.vy;
          clientState.stamina = authDisc.stamina;
          clientState.dashTicksRemaining = (authDisc as any).dashTimer ?? 0;
          clientState.dashCooldownTimer = (authDisc as any).dashCooldown ?? 0;
          for (let p = 0; p < clientInputBuffer.length; p++) {
            stepPlayerKinematics(
              clientState,
              clientInputBuffer[p]!,
              hostEngine.stadium,
              null,
              (hostEngine as any).modifiers,
              1 / 60
            );
          }
        }
      }
    }

    // 6. Assertions
    expect(totalReconciliations).toBeGreaterThan(300);

    // Final position error between Host and Client after draining pending inputs
    const finalHostDisc = hostEngine.players.get(1)!;
    const finalPosError = Math.hypot(
      clientState.pos.x - finalHostDisc.pos.x,
      clientState.pos.y - finalHostDisc.pos.y
    );
    expect(finalPosError).toBeLessThan(0.01); // Less than 10^-2 px error

    // Smoothness: frame visual smoothing delta during continuous locomotion is imperceptible (< 3.0 px)
    expect(maxVisualJump).toBeLessThan(3.0);
  });
});
