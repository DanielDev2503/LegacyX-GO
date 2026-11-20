import {
  EngineInstance,
  INPUT_FLAG_MOUSE_AIM,
  MatchPhase,
  type GameStateSnapshot,
  stepPlayerKinematics,
  type PlayerKinematicsState,
  type KinematicsConfig,
  type KickoffPhysicsContext,
  type Stadium,
  Vec2
} from '@legacyx/core';

export interface BufferedClientInput {
  seq?: number;
  tick: number;
  mask: number;
  inputMask?: number;
  aimAngle?: number | null;
  aimThrottle?: number;
  curve?: { x: number; y: number };
  isTurbo?: boolean;
  triggerDash?: boolean;
}

export function canChangeTeam(
  senderPeerId: string,
  targetPlayerId: string,
  teamsLocked: boolean,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (senderPeerId === targetPlayerId && !teamsLocked) return true;
  return false;
}

export class ClientPredictionReconciler {
  public static readonly VISUAL_DECAY = 0.82;
  public static readonly CATASTROPHIC_ERROR = 90;
  public static readonly CATASTROPHIC_ERROR_SQ = 8100; // 90^2 px
  public static readonly MAX_REPLAY_TICKS = 45; // 750 ms limit

  public inputSeq: number = 0;
  public lastRecordedSeq: number = 0;
  public didHardSnapLastReconcile: boolean = false;
  public didBallHardSnapLastReconcile: boolean = false;
  public inputBuffer: BufferedClientInput[] = [];
  public visualOffset: { x: number; y: number } = { x: 0, y: 0 };
  public ballVisualOffset: { x: number; y: number } = { x: 0, y: 0 };

  public predictedState: PlayerKinematicsState = {
    pos: new Vec2(0, 0),
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

  private readonly replayMap = new Map<
    number,
    { inputMask: number; aimAngle?: number | null; aimThrottle?: number; sequence?: number }
  >();

  public get pendingInputs(): BufferedClientInput[] {
    return this.inputBuffer;
  }

  public set pendingInputs(val: BufferedClientInput[]) {
    this.inputBuffer = val;
  }

  public get visualErrorOffset(): { x: number; y: number } {
    return this.visualOffset;
  }

  /**
   * Avanza el contador monotónico de secuencia incluso durante fases no movibles
   * (GOAL_REPLAY, conteos) para que al volver a KICKOFF el Host nunca descarte inputs.
   */
  public allocateNextSeq(candidate?: number): number {
    const safeCandidate =
      typeof candidate === 'number' && Number.isFinite(candidate) ? Math.floor(candidate) : 0;
    const next = Math.max(this.lastRecordedSeq + 1, this.inputSeq + 1, safeCandidate) >>> 0;
    this.lastRecordedSeq = next;
    this.inputSeq = next;
    return next;
  }

  public recordInput(input: BufferedClientInput): number;
  public recordInput(tickOrSeq: number, mask: number, aimAngle?: number | null, aimThrottle?: number): number;
  public recordInput(
    inputOrTick: BufferedClientInput | number,
    maskArg?: number,
    aimAngle?: number | null,
    aimThrottle?: number
  ): number {
    const rawSeq =
      typeof inputOrTick === 'number'
        ? inputOrTick
        : (inputOrTick.seq ?? inputOrTick.tick);
    const safeRaw = Number.isFinite(rawSeq) ? Math.floor(rawSeq) : 0;
    const seq = safeRaw > this.lastRecordedSeq ? safeRaw : (this.lastRecordedSeq + 1) >>> 0;
    this.lastRecordedSeq = seq;
    if (seq > this.inputSeq) {
      this.inputSeq = seq;
    }

    if (typeof inputOrTick === 'number') {
      const mask = maskArg ?? 0;
      this.inputBuffer.push({
        seq,
        tick: seq,
        mask,
        inputMask: mask,
        aimAngle,
        aimThrottle
      });
    } else {
      const mask = inputOrTick.inputMask ?? inputOrTick.mask ?? 0;
      const tick = seq !== safeRaw ? seq : (inputOrTick.tick ?? seq);
      this.inputBuffer.push({
        ...inputOrTick,
        seq,
        tick,
        mask,
        inputMask: mask
      });
    }
    if (this.inputBuffer.length > 120) {
      this.inputBuffer.shift();
    }
    return seq;
  }

  public reset(): void {
    this.inputBuffer.length = 0;
    this.visualOffset.x = 0;
    this.visualOffset.y = 0;
    this.ballVisualOffset.x = 0;
    this.ballVisualOffset.y = 0;
    this.inputSeq = 0;
    this.lastRecordedSeq = 0;
    this.didHardSnapLastReconcile = false;
    this.didBallHardSnapLastReconcile = false;
  }

  private isSnapshotDrivenPhase(phase: number | undefined): boolean {
    return (
      phase === 0 ||
      phase === 0.5 ||
      phase === 0.6 ||
      phase === 2.1 ||
      phase === 2.2 ||
      phase === 3.5 ||
      phase === 5
    );
  }

  /**
   * Continuous exponential decay for frame-time decoupling (rAF loop)
   */
  public updateVisualSmoothing(frameDt: number): void {
    const decay = Math.exp(-16 * frameDt);
    this.visualOffset.x *= decay;
    this.visualOffset.y *= decay;
    this.ballVisualOffset.x *= decay;
    this.ballVisualOffset.y *= decay;
    if (Math.abs(this.visualOffset.x) < 0.05) this.visualOffset.x = 0;
    if (Math.abs(this.visualOffset.y) < 0.05) this.visualOffset.y = 0;
    if (Math.abs(this.ballVisualOffset.x) < 0.05) this.ballVisualOffset.x = 0;
    if (Math.abs(this.ballVisualOffset.y) < 0.05) this.ballVisualOffset.y = 0;
  }

  /**
   * Legacy discrete decay alias for backwards-compatibility with tests
   */
  public decayVisualOffset(decayFactor: number = ClientPredictionReconciler.VISUAL_DECAY): void {
    this.visualOffset.x *= decayFactor;
    this.visualOffset.y *= decayFactor;
    this.ballVisualOffset.x *= decayFactor;
    this.ballVisualOffset.y *= decayFactor;
    if (Math.abs(this.visualOffset.x) < 0.01) this.visualOffset.x = 0;
    if (Math.abs(this.visualOffset.y) < 0.01) this.visualOffset.y = 0;
    if (Math.abs(this.ballVisualOffset.x) < 0.01) this.ballVisualOffset.x = 0;
    if (Math.abs(this.ballVisualOffset.y) < 0.01) this.ballVisualOffset.y = 0;
  }

  public predictStep(
    inputMask: number,
    aimAngle?: number | null,
    aimThrottle?: number,
    stadium?: Stadium | null,
    kickoffContext?: KickoffPhysicsContext | null,
    config?: KinematicsConfig,
    dt: number = 1 / 60
  ): number {
    this.inputSeq = Math.max(this.inputSeq, this.lastRecordedSeq);
    this.inputSeq = (this.inputSeq + 1) >>> 0;
    this.recordInput({
      seq: this.inputSeq,
      tick: this.inputSeq,
      mask: inputMask,
      inputMask,
      aimAngle,
      aimThrottle
    });

    stepPlayerKinematics(
      this.predictedState,
      { inputMask, aimAngle, aimThrottle },
      stadium ?? null,
      kickoffContext ?? null,
      config,
      dt
    );

    return this.inputSeq;
  }

  public getRenderPosition(): { x: number; y: number } {
    return {
      x: this.predictedState.pos.x + this.visualOffset.x,
      y: this.predictedState.pos.y + this.visualOffset.y
    };
  }

  public reconcile(
    engineOrSnapshot: EngineInstance | GameStateSnapshot,
    snapshotOrLocalDiscId: GameStateSnapshot | number,
    localDiscIdOrStadium?: number | Stadium | null,
    kickoffContext?: KickoffPhysicsContext | null,
    config?: KinematicsConfig
  ): { replayed: boolean; hardSnapped: boolean } {
    this.didHardSnapLastReconcile = false;
    this.didBallHardSnapLastReconcile = false;

    if (typeof (engineOrSnapshot as any).step === 'function') {
      const engine = engineOrSnapshot as EngineInstance;
      const authSnapshot = snapshotOrLocalDiscId as GameStateSnapshot;
      const localDiscId = (localDiscIdOrStadium as number) ?? 1;

      const phase = authSnapshot.phase;
      if (this.isSnapshotDrivenPhase(phase)) {
        engine.setState(authSnapshot);
        if (phase !== 0 && engine.currentTick < this.lastRecordedSeq) {
          engine.currentTick = this.lastRecordedSeq;
        }
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.ballVisualOffset.x = 0;
        this.ballVisualOffset.y = 0;
        this.inputBuffer.length = 0;
        this.didHardSnapLastReconcile = true;
        this.didBallHardSnapLastReconcile = true;
        return { replayed: false, hardSnapped: true };
      }

      const localDisc = engine.players.get(localDiscId);
      const authDisc = authSnapshot.discs?.find((d) => d.id === localDiscId);

      if (!localDisc || !authDisc) {
        engine.setState(authSnapshot);
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.ballVisualOffset.x = 0;
        this.ballVisualOffset.y = 0;
        this.didHardSnapLastReconcile = false;
        this.didBallHardSnapLastReconcile = true;
        return { replayed: false, hardSnapped: false };
      }

      // Discard acknowledged inputs
      const ackSeq = (authDisc as any).lastAckedInputSeq;
      if (typeof ackSeq === 'number' && ackSeq > 0) {
        while (this.inputBuffer.length > 0) {
          const first = this.inputBuffer[0]!;
          const seq = first.seq ?? first.tick;
          if (seq <= ackSeq) {
            this.inputBuffer.shift();
          } else {
            break;
          }
        }
      } else {
        while (this.inputBuffer.length > 0 && this.inputBuffer[0]!.tick <= authSnapshot.tick) {
          this.inputBuffer.shift();
        }
      }

      // Visual position on screen before reconciliation
      const xVisualBefore = localDisc.pos.x + this.visualOffset.x;
      const yVisualBefore = localDisc.pos.y + this.visualOffset.y;
      const ballXVisualBefore = engine.ball.pos.x + this.ballVisualOffset.x;
      const ballYVisualBefore = engine.ball.pos.y + this.ballVisualOffset.y;

      // Cap pending inputs to MAX_REPLAY_TICKS (45 ticks)
      if (this.inputBuffer.length > ClientPredictionReconciler.MAX_REPLAY_TICKS) {
        this.inputBuffer = this.inputBuffer.slice(-ClientPredictionReconciler.MAX_REPLAY_TICKS);
      }

      // Rewind to authoritative snapshot preservando el estado temporal local de recarga de estamina
      const prevRt = (engine as any).getRuntime?.(localDiscId);
      const prevIdleTimer = prevRt?.staminaIdleTimer ?? 0;
      const prevRegenUnlocked = prevRt?.staminaRegenUnlocked ?? false;
      const prevPredStamina = localDisc.stamina;

      engine.setState(authSnapshot);
      const rawCd = (authDisc as any).dashCooldown ?? 0;
      const cdSec = rawCd > 60 ? rawCd / 1000 : rawCd;
      const rt = (engine as any).getRuntime?.(localDiscId);
      if (rt) {
        if ((authDisc as any).dashTimer !== undefined) {
          rt.ticksRemaining = (authDisc as any).dashTimer;
        }
        rt.cooldownTimer = cdSec;
        rt.prevDashDown = Boolean((authDisc.flags ?? 0) & (1 << 1));
        const authStamina = authDisc.stamina ?? 100;
        if (authStamina >= 100 || (authDisc.flags ?? 0) & ((1 << 1) | (1 << 4))) {
          rt.staminaIdleTimer = 0;
          rt.staminaRegenUnlocked = false;
        } else if (authStamina > prevPredStamina + 0.01) {
          rt.staminaRegenUnlocked = true;
          rt.staminaIdleTimer = prevIdleTimer;
        } else {
          rt.staminaIdleTimer = prevIdleTimer;
          rt.staminaRegenUnlocked = prevRegenUnlocked;
        }
        const p = engine.players.get(localDiscId);
        if (p && p.isDashing) {
          const spd = Math.hypot(authDisc.vx, authDisc.vy);
          if (spd > 1e-3) {
            rt.dirX = authDisc.vx / spd;
            rt.dirY = authDisc.vy / spd;
          }
        }
      }

      // Replay all pending inputs
      this.replayMap.clear();
      for (let i = 0; i < this.inputBuffer.length; i++) {
        const pending = this.inputBuffer[i]!;
        const m = pending.inputMask ?? pending.mask ?? 0;
        const isMouseActive =
          (m & INPUT_FLAG_MOUSE_AIM) !== 0 &&
          pending.aimAngle !== null &&
          pending.aimAngle !== undefined;
        this.replayMap.set(localDiscId, {
          inputMask: m,
          aimAngle: isMouseActive ? pending.aimAngle : null,
          aimThrottle: isMouseActive ? (pending.aimThrottle ?? 0) : 0,
          sequence: pending.seq ?? pending.tick
        });
        engine.step(this.replayMap, true);
        if (
          authSnapshot.phase !== undefined &&
          !(authSnapshot.phase === MatchPhase.KICKOFF && engine.fsm.currentState === MatchPhase.PLAYING)
        ) {
          engine.fsm.currentState = authSnapshot.phase as MatchPhase;
        }
        if (authSnapshot.isNeutralKickoff !== undefined) {
          (engine as any).isNeutralKickoff = authSnapshot.isNeutralKickoff;
        }
        if (authSnapshot.kickoffPossessingTeam !== undefined) {
          (engine as any).kickoffPossessingTeam = authSnapshot.kickoffPossessingTeam;
        }
      }

      if (engine.currentTick < this.lastRecordedSeq) {
        engine.currentTick = this.lastRecordedSeq;
      }

      const ballErrX = ballXVisualBefore - engine.ball.pos.x;
      const ballErrY = ballYVisualBefore - engine.ball.pos.y;
      const ballDistSq = ballErrX * ballErrX + ballErrY * ballErrY;
      if (ballDistSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
        this.ballVisualOffset.x = 0;
        this.ballVisualOffset.y = 0;
        this.didBallHardSnapLastReconcile = true;
      } else {
        this.ballVisualOffset.x = ballErrX;
        this.ballVisualOffset.y = ballErrY;
        this.didBallHardSnapLastReconcile = false;
      }

      // Compute residual error against pre-reconciliation visual position
      const resimDisc = engine.players.get(localDiscId);
      if (resimDisc) {
        const errX = xVisualBefore - resimDisc.pos.x;
        const errY = yVisualBefore - resimDisc.pos.y;
        const distSq = errX * errX + errY * errY;

        if (distSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
          // Hard snap: reset visualOffset to (0,0)
          this.visualOffset.x = 0;
          this.visualOffset.y = 0;
          this.didHardSnapLastReconcile = true;
          return { replayed: true, hardSnapped: true };
        } else {
          // Continuous error absorption: visual position delta is 0.00 px at snapshot arrival!
          this.visualOffset.x = errX;
          this.visualOffset.y = errY;
          this.didHardSnapLastReconcile = false;
          return { replayed: true, hardSnapped: false };
        }
      }

      this.didHardSnapLastReconcile = false;
      return { replayed: true, hardSnapped: false };
    } else {
      const authSnapshot = engineOrSnapshot as GameStateSnapshot;
      const localDiscId = snapshotOrLocalDiscId as number;
      const stadium = (localDiscIdOrStadium as Stadium) ?? null;

      const authDisc = authSnapshot.discs?.find((d) => d.id === localDiscId);
      if (this.isSnapshotDrivenPhase(authSnapshot.phase)) {
        if (authDisc) {
          this.predictedState.pos.x = authDisc.x;
          this.predictedState.pos.y = authDisc.y;
          this.predictedState.vel.x = authDisc.vx;
          this.predictedState.vel.y = authDisc.vy;
          this.predictedState.stamina = authDisc.stamina ?? 100;
          this.predictedState.team = authDisc.team === 1 ? 'red' : authDisc.team === 2 ? 'blue' : 'spec';
          this.predictedState.isTurbo = false;
          this.predictedState.kicking = false;
        }
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.inputBuffer.length = 0;
        this.didHardSnapLastReconcile = true;
        return { replayed: false, hardSnapped: true };
      }

      if (!authDisc) {
        this.didHardSnapLastReconcile = false;
        return { replayed: false, hardSnapped: false };
      }

      const ackSeq = (authDisc as any).lastAckedInputSeq;
      if (typeof ackSeq === 'number' && ackSeq > 0) {
        while (this.inputBuffer.length > 0) {
          const first = this.inputBuffer[0]!;
          const seq = first.seq ?? first.tick;
          if (seq <= ackSeq) {
            this.inputBuffer.shift();
          } else {
            break;
          }
        }
      } else {
        while (this.inputBuffer.length > 0 && this.inputBuffer[0]!.tick <= authSnapshot.tick) {
          this.inputBuffer.shift();
        }
      }

      const xVisualBefore = this.predictedState.pos.x + this.visualOffset.x;
      const yVisualBefore = this.predictedState.pos.y + this.visualOffset.y;

      if (this.inputBuffer.length > ClientPredictionReconciler.MAX_REPLAY_TICKS) {
        this.inputBuffer = this.inputBuffer.slice(-ClientPredictionReconciler.MAX_REPLAY_TICKS);
      }

      const rawCd = (authDisc as any).dashCooldown ?? 0;
      const cdSec = rawCd > 60 ? rawCd / 1000 : rawCd;

      this.predictedState.pos.x = authDisc.x;
      this.predictedState.pos.y = authDisc.y;
      this.predictedState.vel.x = authDisc.vx;
      this.predictedState.vel.y = authDisc.vy;
      this.predictedState.stamina = authDisc.stamina ?? 100;
      this.predictedState.team = authDisc.team === 1 ? 'red' : authDisc.team === 2 ? 'blue' : 'spec';
      this.predictedState.dashTicksRemaining = (authDisc as any).dashTimer ?? 0;
      this.predictedState.dashCooldownTimer = cdSec;
      this.predictedState.prevDashState = Boolean(((authDisc.flags ?? 0) & (1 << 1)));
      this.predictedState.isDashing = this.predictedState.dashTicksRemaining > 0;
      if (this.predictedState.isDashing) {
        const spd = Math.hypot(authDisc.vx, authDisc.vy);
        if (spd > 1e-3) {
          this.predictedState.dashDirX = authDisc.vx / spd;
          this.predictedState.dashDirY = authDisc.vy / spd;
        }
      }
      this.predictedState.isTurbo = false;
      this.predictedState.kicking = false;

      for (let i = 0; i < this.inputBuffer.length; i++) {
        const pending = this.inputBuffer[i]!;
        const m = pending.inputMask ?? pending.mask ?? 0;
        stepPlayerKinematics(
          this.predictedState,
          {
            inputMask: m,
            aimAngle: pending.aimAngle ?? null,
            aimThrottle: pending.aimThrottle ?? 0
          },
          stadium,
          kickoffContext ?? null,
          config,
          1 / 60
        );
      }

      const errX = xVisualBefore - this.predictedState.pos.x;
      const errY = yVisualBefore - this.predictedState.pos.y;
      const distSq = errX * errX + errY * errY;

      if (distSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.didHardSnapLastReconcile = true;
        return { replayed: true, hardSnapped: true };
      } else {
        this.visualOffset.x = errX;
        this.visualOffset.y = errY;
        this.didHardSnapLastReconcile = false;
        return { replayed: true, hardSnapped: false };
      }
    }
  }
}
