import {
  EngineInstance,
  INPUT_FLAG_MOUSE_AIM,
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
  public inputBuffer: BufferedClientInput[] = [];
  public visualOffset: { x: number; y: number } = { x: 0, y: 0 };

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

  public recordInput(input: BufferedClientInput): void;
  public recordInput(tickOrSeq: number, mask: number, aimAngle?: number | null, aimThrottle?: number): void;
  public recordInput(
    inputOrTick: BufferedClientInput | number,
    maskArg?: number,
    aimAngle?: number | null,
    aimThrottle?: number
  ): void {
    if (typeof inputOrTick === 'number') {
      const mask = maskArg ?? 0;
      this.inputBuffer.push({
        seq: inputOrTick,
        tick: inputOrTick,
        mask,
        inputMask: mask,
        aimAngle,
        aimThrottle
      });
    } else {
      const mask = inputOrTick.inputMask ?? inputOrTick.mask ?? 0;
      this.inputBuffer.push({
        ...inputOrTick,
        seq: inputOrTick.seq ?? inputOrTick.tick,
        mask,
        inputMask: mask
      });
    }
    if (this.inputBuffer.length > 120) {
      this.inputBuffer.shift();
    }
  }

  public reset(): void {
    this.inputBuffer.length = 0;
    this.visualOffset.x = 0;
    this.visualOffset.y = 0;
  }

  /**
   * Continuous exponential decay for frame-time decoupling (rAF loop)
   */
  public updateVisualSmoothing(frameDt: number): void {
    const decay = Math.exp(-16 * frameDt);
    this.visualOffset.x *= decay;
    this.visualOffset.y *= decay;
    if (Math.abs(this.visualOffset.x) < 0.05) this.visualOffset.x = 0;
    if (Math.abs(this.visualOffset.y) < 0.05) this.visualOffset.y = 0;
  }

  /**
   * Legacy discrete decay alias for backwards-compatibility with tests
   */
  public decayVisualOffset(decayFactor: number = ClientPredictionReconciler.VISUAL_DECAY): void {
    this.visualOffset.x *= decayFactor;
    this.visualOffset.y *= decayFactor;
    if (Math.abs(this.visualOffset.x) < 0.01) this.visualOffset.x = 0;
    if (Math.abs(this.visualOffset.y) < 0.01) this.visualOffset.y = 0;
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
    if (typeof (engineOrSnapshot as any).step === 'function') {
      const engine = engineOrSnapshot as EngineInstance;
      const authSnapshot = snapshotOrLocalDiscId as GameStateSnapshot;
      const localDiscId = (localDiscIdOrStadium as number) ?? 1;

      const phase = authSnapshot.phase;
      const isFrozenPhase =
        phase === 0 ||
        phase === 0.5 ||
        phase === 0.6 ||
        phase === 2.1 ||
        phase === 2.2 ||
        phase === 5;

      if (isFrozenPhase) {
        engine.setState(authSnapshot);
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.inputBuffer.length = 0;
        return { replayed: false, hardSnapped: true };
      }

      const localDisc = engine.players.get(localDiscId);
      const authDisc = authSnapshot.discs?.find((d) => d.id === localDiscId);

      if (!localDisc || !authDisc) {
        engine.setState(authSnapshot);
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
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

      // Cap pending inputs to MAX_REPLAY_TICKS (45 ticks)
      if (this.inputBuffer.length > ClientPredictionReconciler.MAX_REPLAY_TICKS) {
        this.inputBuffer = this.inputBuffer.slice(-ClientPredictionReconciler.MAX_REPLAY_TICKS);
      }

      // Rewind to authoritative snapshot
      engine.setState(authSnapshot);
      if ((authDisc as any).dashTimer !== undefined || (authDisc as any).dashCooldown !== undefined) {
        const rt = (engine as any).getRuntime?.(localDiscId);
        if (rt) {
          if ((authDisc as any).dashTimer !== undefined) rt.ticksRemaining = (authDisc as any).dashTimer;
          if ((authDisc as any).dashCooldown !== undefined) rt.cooldownTimer = (authDisc as any).dashCooldown / 1000;
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
          return { replayed: true, hardSnapped: true };
        } else {
          // Continuous error absorption: visual position delta is 0.00 px at snapshot arrival!
          this.visualOffset.x = errX;
          this.visualOffset.y = errY;
          return { replayed: true, hardSnapped: false };
        }
      }

      return { replayed: true, hardSnapped: false };
    } else {
      const authSnapshot = engineOrSnapshot as GameStateSnapshot;
      const localDiscId = snapshotOrLocalDiscId as number;
      const stadium = (localDiscIdOrStadium as Stadium) ?? null;

      const authDisc = authSnapshot.discs?.find((d) => d.id === localDiscId);
      if (!authDisc) {
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

      this.predictedState.pos.x = authDisc.x;
      this.predictedState.pos.y = authDisc.y;
      this.predictedState.vel.x = authDisc.vx;
      this.predictedState.vel.y = authDisc.vy;
      this.predictedState.stamina = authDisc.stamina ?? 100;
      this.predictedState.team = authDisc.team === 1 ? 'red' : authDisc.team === 2 ? 'blue' : 'spec';
      this.predictedState.dashTicksRemaining = (authDisc as any).dashTimer ?? 0;
      this.predictedState.dashCooldownTimer = ((authDisc as any).dashCooldown ?? 0) / 1000;
      this.predictedState.isDashing = this.predictedState.dashTicksRemaining > 0;
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
        return { replayed: true, hardSnapped: true };
      } else {
        this.visualOffset.x = errX;
        this.visualOffset.y = errY;
        return { replayed: true, hardSnapped: false };
      }
    }
  }
}
