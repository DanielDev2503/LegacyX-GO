import {
  DASH_TICKS,
  DEFAULT_GAMEPLAY_CONFIG,
  EngineInstance,
  INPUT_FLAG_MOUSE_AIM,
  MatchPhase,
  PhysicsWorld,
  type GameStateSnapshot,
  stepPlayerKinematics,
  resolveDiscDiscCollision,
  resolveDiscSegmentCollision,
  resolveGoalAndPitchBoundaries,
  type PlayerKinematicsState,
  type KinematicsConfig,
  type KickoffPhysicsContext,
  type Stadium,
  type StadiumBoundariesConfig,
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
  public static readonly VISUAL_SMOOTHING_RATE = 12;
  public static readonly ERROR_DEADZONE = 0.5;
  public static readonly ERROR_DEADZONE_SQ = 0.25; // 0.5^2 px
  public static readonly CATASTROPHIC_ERROR = 120;
  public static readonly CATASTROPHIC_ERROR_SQ = 14400; // 120^2 px
  public static readonly MAX_REPLAY_TICKS = 30; // Hasta 500 ms RTT (0.2 ms escalar por 30 ticks)
  public static readonly MAX_BUFFER_TICKS = 45; // Retención máx. de inputs sin confirmar (750 ms RTT)

  public inputSeq: number = 0;
  public lastRecordedSeq: number = 0;
  public lastReplayedTicks: number = 0;
  public lastReplayedFullSteps: number = 0;
  public didHardSnapLastReconcile: boolean = false;
  public didBallHardSnapLastReconcile: boolean = false;
  public inputBuffer: BufferedClientInput[] = [];
  public visualOffset: { x: number; y: number } = { x: 0, y: 0 };
  public ballVisualOffset: { x: number; y: number } = { x: 0, y: 0 };

  // Telemetría Zero-GC de reconciliaciones/s (Fase 4)
  public reconciliationsPerSec: number = 0;
  private reconcileWindowCount: number = 0;
  private reconcileWindowStartMs: number = 0;

  private readonly kinematicsInputScratch = {
    inputMask: 0,
    aimAngle: null as number | null | undefined,
    aimThrottle: 0 as number | undefined
  };
  private static readonly SKIP_SUBSTEPS_OPTIONS = { skipSubsteps: true };
  private readonly replayBoundsScratch: StadiumBoundariesConfig = {
    halfWidth: 600,
    halfHeight: 270,
    goalHalfHeight: 85,
    goalDepth: 35,
    runOff: 0,
    postRadius: 8
  };
  private readonly replayKickoffScratch: KickoffPhysicsContext = {
    active: true,
    possessingTeam: null,
    centerRadius: 80
  };
  private readonly fastForwardStateScratch: PlayerKinematicsState = {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    radius: 15,
    stamina: 100,
    staminaIdleTimer: 0,
    staminaRegenUnlocked: false,
    isDashing: false,
    dashTicksRemaining: 0,
    dashCooldownTimer: 0,
    dashSlowdownTimer: 0,
    dashDirX: 0,
    dashDirY: 0,
    isTurbo: false,
    kicking: false,
    prevDashState: false,
    team: 'red'
  };
  private readonly reconcileResultScratch = { replayed: false, hardSnapped: false, replayedTicks: 0 };

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
    this.lastReplayedTicks = 0;
    this.lastReplayedFullSteps = 0;
    this.reconciliationsPerSec = 0;
    this.reconcileWindowCount = 0;
    this.reconcileWindowStartMs = 0;
  }

  private recordReconcileTelemetry(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.reconcileWindowStartMs === 0) {
      this.reconcileWindowStartMs = now;
    }
    this.reconcileWindowCount++;
    const elapsed = now - this.reconcileWindowStartMs;
    if (elapsed >= 1000) {
      this.reconciliationsPerSec = Math.round((this.reconcileWindowCount * 1000) / elapsed);
      this.reconcileWindowCount = 0;
      this.reconcileWindowStartMs = now;
    }
  }

  private static computeRestoredSlowdown(
    isDashing: boolean,
    cdSec: number,
    config?: KinematicsConfig | Record<string, any> | null
  ): number {
    if (isDashing || cdSec <= 0) return 0;
    const slowdownDur = Math.max(0, config?.dashSlowdownDuration ?? DEFAULT_GAMEPLAY_CONFIG.dashSlowdownDuration);
    const dashCooldownCfg = config?.dashCooldown ?? DEFAULT_GAMEPLAY_CONFIG.dashCooldown;
    if (slowdownDur <= 0 || dashCooldownCfg <= 0) return 0;
    const cdAtDashEnd = dashCooldownCfg - DASH_TICKS / 60;
    if (cdSec > cdAtDashEnd + 1e-4) return 0;
    const elapsedSinceDashEnd = Math.max(0, cdAtDashEnd - cdSec);
    return Math.max(0, slowdownDur - elapsedSinceDashEnd);
  }

  private setResult(
    replayed: boolean,
    hardSnapped: boolean,
    replayedTicks: number = 0
  ): { replayed: boolean; hardSnapped: boolean; replayedTicks: number } {
    this.reconcileResultScratch.replayed = replayed;
    this.reconcileResultScratch.hardSnapped = hardSnapped;
    this.reconcileResultScratch.replayedTicks = replayedTicks;
    return this.reconcileResultScratch;
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
   * Continuous exponential decay for frame-time decoupling (rAF loop): Math.exp(-12 * frameDt)
   */
  public updateVisualSmoothing(frameDt: number): void {
    const decay = Math.exp(-ClientPredictionReconciler.VISUAL_SMOOTHING_RATE * frameDt);
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

    this.kinematicsInputScratch.inputMask = inputMask;
    this.kinematicsInputScratch.aimAngle = aimAngle;
    this.kinematicsInputScratch.aimThrottle = aimThrottle;
    stepPlayerKinematics(
      this.predictedState,
      this.kinematicsInputScratch,
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
  ): { replayed: boolean; hardSnapped: boolean; replayedTicks: number } {
    this.didHardSnapLastReconcile = false;
    this.didBallHardSnapLastReconcile = false;
    this.lastReplayedTicks = 0;
    this.lastReplayedFullSteps = 0;

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
        return this.setResult(false, true, 0);
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
        return this.setResult(false, false, 0);
      }

      // Descarte Uint32-safe de inputs ya confirmados por el Host
      const ackSeq = (authDisc as any).lastAckedInputSeq;
      if (typeof ackSeq === 'number' && ackSeq > 0) {
        const ackU32 = ackSeq >>> 0;
        while (this.inputBuffer.length > 0) {
          const first = this.inputBuffer[0]!;
          const seqU32 = (first.seq ?? first.tick) >>> 0;
          if (((ackU32 - seqU32) >>> 0) < 0x80000000) {
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

      if (this.inputBuffer.length > ClientPredictionReconciler.MAX_BUFFER_TICKS) {
        this.inputBuffer.splice(0, this.inputBuffer.length - ClientPredictionReconciler.MAX_BUFFER_TICKS);
      }

      // Posición visual en pantalla antes de reconciliar
      const xVisualBefore = localDisc.pos.x + this.visualOffset.x;
      const yVisualBefore = localDisc.pos.y + this.visualOffset.y;
      const ballXVisualBefore = engine.ball.pos.x + this.ballVisualOffset.x;
      const ballYVisualBefore = engine.ball.pos.y + this.ballVisualOffset.y;

      // Rewind al estado autoritativo preservando timers temporales locales de stamina
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
        const p = engine.players.get(localDiscId);
        const isDashingAuth = Boolean(p?.isDashing || ((authDisc.flags ?? 0) & (1 << 1)));
        rt.slowdownTimer = ClientPredictionReconciler.computeRestoredSlowdown(
          isDashingAuth,
          cdSec,
          engine.modifiers as any
        );
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
        if (p && p.isDashing) {
          const spd = Math.hypot(authDisc.vx, authDisc.vy);
          if (spd > 1e-3) {
            rt.dirX = authDisc.vx / spd;
            rt.dirY = authDisc.vy / spd;
          }
        }
      }

      // Replay puramente escalar con stepPlayerKinematics (Zero-GC, sin GoalNet ni otros jugadores) hasta 30 ticks (500 ms RTT)
      const replayStart = Math.max(0, this.inputBuffer.length - ClientPredictionReconciler.MAX_REPLAY_TICKS);
      let replayedCount = 0;
      const ffPlayer = engine.players.get(localDiscId);
      if (ffPlayer && replayStart < this.inputBuffer.length) {
        const ffState = this.fastForwardStateScratch;
        const ffTeam: 'red' | 'blue' =
          ((engine as any).playerTeams?.get(localDiscId) ?? (authDisc.team === 2 ? 'blue' : 'red')) === 'blue'
            ? 'blue'
            : 'red';
        const dt = 1 / 60;
        const baseKickCfg =
          (engine.modifiers as any).kickStrength !== undefined
            ? ((engine.modifiers as any).kickStrength / 4.545) * 450.0
            : (engine.modifiers.baseKickStrength ?? 450.0);
        const worldSegs = engine.world?.segments;
        const worldDiscs = engine.world?.discs;
        const worldMaxSubsteps = Math.max(4, engine.world?.maxSubsteps ?? 10);

        this.replayBoundsScratch.halfWidth = engine.stadium.halfWidth ?? 600;
        this.replayBoundsScratch.halfHeight = engine.stadium.halfHeight ?? 270;
        this.replayBoundsScratch.goalHalfHeight = engine.stadium.goalHalfHeight ?? 85;
        this.replayBoundsScratch.goalDepth = engine.stadium.goalDepth ?? 35;
        this.replayBoundsScratch.runOff = 0;
        this.replayBoundsScratch.postRadius = engine.stadium.postRadius ?? 8;

        let activeKickoffCtx: KickoffPhysicsContext | null = null;
        if (
          authSnapshot.phase === MatchPhase.KICKOFF &&
          !engine.isPracticeMode &&
          engine.players.size > 1
        ) {
          const isNeutral = Boolean(authSnapshot.isNeutralKickoff ?? (engine as any).isNeutralKickoff);
          const possTeam = (authSnapshot.kickoffPossessingTeam ?? (engine as any).kickoffPossessingTeam ?? 'red') as
            | 'red'
            | 'blue';
          this.replayKickoffScratch.active = true;
          this.replayKickoffScratch.possessingTeam = isNeutral ? null : possTeam;
          this.replayKickoffScratch.centerRadius = engine.stadium.centerRadius ?? 80;
          activeKickoffCtx = this.replayKickoffScratch;
        }

        const solverCtx = activeKickoffCtx && activeKickoffCtx.possessingTeam !== null ? activeKickoffCtx : undefined;

        for (let i = replayStart; i < this.inputBuffer.length; i++) {
          replayedCount++;
          const pending = this.inputBuffer[i]!;
          const m = pending.inputMask ?? pending.mask ?? 0;
          const isMouseActive =
            (m & INPUT_FLAG_MOUSE_AIM) !== 0 &&
            pending.aimAngle !== null &&
            pending.aimAngle !== undefined;

          ffState.pos = ffPlayer.pos;
          ffState.vel = ffPlayer.vel;
          ffState.radius = ffPlayer.radius;
          ffState.stamina = ffPlayer.stamina;
          ffState.staminaIdleTimer = rt?.staminaIdleTimer ?? 0;
          ffState.staminaRegenUnlocked = rt?.staminaRegenUnlocked ?? false;
          ffState.isDashing = ffPlayer.isDashing;
          ffState.dashTicksRemaining = rt?.ticksRemaining ?? 0;
          ffState.dashCooldownTimer = rt?.cooldownTimer ?? 0;
          ffState.dashSlowdownTimer = rt?.slowdownTimer ?? 0;
          ffState.dashDirX = rt?.dirX ?? 0;
          ffState.dashDirY = rt?.dirY ?? 0;
          ffState.isTurbo = ffPlayer.isTurbo;
          ffState.kicking = ffPlayer.kicking;
          ffState.prevDashState = rt?.prevDashDown ?? false;
          ffState.triggerDash = false;
          ffState.team = ffTeam;

          this.kinematicsInputScratch.inputMask = m;
          this.kinematicsInputScratch.aimAngle = isMouseActive ? pending.aimAngle : null;
          this.kinematicsInputScratch.aimThrottle = isMouseActive ? (pending.aimThrottle ?? 0) : 0;

          stepPlayerKinematics(
            ffState,
            this.kinematicsInputScratch,
            engine.stadium,
            activeKickoffCtx,
            engine.modifiers as any,
            dt,
            ClientPredictionReconciler.SKIP_SUBSTEPS_OPTIONS
          );

          ffPlayer.stamina = ffState.stamina;
          ffPlayer.isDashing = ffState.isDashing;
          ffPlayer.isTurbo = ffState.isTurbo;
          ffPlayer.kicking = ffState.kicking ?? false;
          if (rt) {
            rt.staminaIdleTimer = ffState.staminaIdleTimer ?? 0;
            rt.staminaRegenUnlocked = ffState.staminaRegenUnlocked ?? false;
            rt.ticksRemaining = ffState.dashTicksRemaining;
            rt.cooldownTimer = ffState.dashCooldownTimer;
            rt.slowdownTimer = ffState.dashSlowdownTimer ?? 0;
            rt.dirX = ffState.dashDirX;
            rt.dirY = ffState.dashDirY;
            rt.prevDashDown = ffState.prevDashState ?? false;

            if (!ffPlayer.kicking) {
              rt.kickConsumed = false;
            } else if (!rt.kickConsumed && engine.world.isWithinKickDistance(ffPlayer, engine.ball)) {
              const dx = engine.ball.pos.x - ffPlayer.pos.x;
              const dy = engine.ball.pos.y - ffPlayer.pos.y;
              const dist = Math.hypot(dx, dy) || 1;
              const nx = dx / dist;
              const ny = dy / dist;

              const pVelAlongKick = Math.max(0, ffPlayer.vel.x * nx + ffPlayer.vel.y * ny);
              let effectiveKick = baseKickCfg + pVelAlongKick * 0.35;
              if (ffPlayer.isDashing) {
                effectiveKick = Math.max(effectiveKick, baseKickCfg * 1.35 + pVelAlongKick * 0.35);
              } else if (ffPlayer.isTurbo) {
                effectiveKick = Math.max(effectiveKick, baseKickCfg * 1.15 + pVelAlongKick * 0.35);
              }
              const existingBallAlongKick = Math.max(0, engine.ball.vel.x * nx + engine.ball.vel.y * ny);
              engine.ball.vel.x = nx * (effectiveKick + existingBallAlongKick * 0.25);
              engine.ball.vel.y = ny * (effectiveKick + existingBallAlongKick * 0.25);

              const minKickDist = ffPlayer.radius + engine.ball.radius;
              if (dist < minKickDist) {
                engine.ball.pos.x = ffPlayer.pos.x + nx * minKickDist;
                engine.ball.pos.y = ffPlayer.pos.y + ny * minKickDist;
                resolveGoalAndPitchBoundaries(engine.ball.pos, engine.ball.vel, engine.ball.radius, this.replayBoundsScratch);
              }
              rt.kickConsumed = true;
            }
          }

          if (activeKickoffCtx) {
            if (activeKickoffCtx.possessingTeam === null) {
              PhysicsWorld.enforceMidfieldBarrierStatic(ffPlayer.pos, ffPlayer.vel, ffPlayer.radius, ffTeam);
            } else if (activeKickoffCtx.possessingTeam === ffTeam) {
              PhysicsWorld.enforceKickoffPossessionBarrierStatic(
                ffPlayer.pos,
                ffPlayer.vel,
                ffPlayer.radius,
                ffTeam,
                activeKickoffCtx.centerRadius
              );
            } else {
              PhysicsWorld.enforceMidfieldBarrierStatic(ffPlayer.pos, ffPlayer.vel, ffPlayer.radius, ffTeam);
              const limitR = activeKickoffCtx.centerRadius + ffPlayer.radius;
              const px = ffPlayer.pos.x;
              const py = ffPlayer.pos.y;
              const distSq = px * px + py * py;
              if (distSq < limitR * limitR) {
                const dist = Math.sqrt(distSq);
                if (dist > 1e-6) {
                  const nx = px / dist;
                  const ny = py / dist;
                  ffPlayer.pos.x = nx * limitR;
                  ffPlayer.pos.y = ny * limitR;
                  const vDotN = ffPlayer.vel.x * nx + ffPlayer.vel.y * ny;
                  if (vDotN < 0) {
                    ffPlayer.vel.x -= vDotN * nx;
                    ffPlayer.vel.y -= vDotN * ny;
                  }
                }
              }
            }
          }

          const pSpeedSq = ffPlayer.vel.x * ffPlayer.vel.x + ffPlayer.vel.y * ffPlayer.vel.y;
          const bSpeedSq = engine.ball.vel.x * engine.ball.vel.x + engine.ball.vel.y * engine.ball.vel.y;
          const maxSpeedSq = pSpeedSq > bSpeedSq ? pSpeedSq : bSpeedSq;
          const minR = Math.min(10, ffPlayer.radius < engine.ball.radius ? ffPlayer.radius : engine.ball.radius);
          const neededSubsteps = Math.ceil((Math.sqrt(maxSpeedSq) * dt) / (minR * 0.45));
          const substeps = Math.max(PhysicsWorld.MIN_SUBSTEPS, Math.min(worldMaxSubsteps, neededSubsteps));
          const subDt = dt / substeps;
          const pSubDamp = Math.pow(ffPlayer.damping, 1 / substeps);
          const bSubDamp = Math.pow(engine.ball.damping, 1 / substeps);

          for (let s = 0; s < substeps; s++) {
            ffPlayer.pos.x += ffPlayer.vel.x * subDt;
            ffPlayer.pos.y += ffPlayer.vel.y * subDt;
            engine.ball.pos.x += engine.ball.vel.x * subDt;
            engine.ball.pos.y += engine.ball.vel.y * subDt;

            if (activeKickoffCtx) {
              if (activeKickoffCtx.possessingTeam === null) {
                PhysicsWorld.enforceMidfieldBarrierStatic(ffPlayer.pos, ffPlayer.vel, ffPlayer.radius, ffTeam);
              } else if (activeKickoffCtx.possessingTeam === ffTeam) {
                PhysicsWorld.enforceKickoffPossessionBarrierStatic(
                  ffPlayer.pos,
                  ffPlayer.vel,
                  ffPlayer.radius,
                  ffTeam,
                  activeKickoffCtx.centerRadius
                );
              } else {
                PhysicsWorld.enforceMidfieldBarrierStatic(ffPlayer.pos, ffPlayer.vel, ffPlayer.radius, ffTeam);
                const limitR = activeKickoffCtx.centerRadius + ffPlayer.radius;
                const px = ffPlayer.pos.x;
                const py = ffPlayer.pos.y;
                const distSq = px * px + py * py;
                if (distSq < limitR * limitR) {
                  const dist = Math.sqrt(distSq);
                  if (dist > 1e-6) {
                    const nx = px / dist;
                    const ny = py / dist;
                    ffPlayer.pos.x = nx * limitR;
                    ffPlayer.pos.y = ny * limitR;
                    const vDotN = ffPlayer.vel.x * nx + ffPlayer.vel.y * ny;
                    if (vDotN < 0) {
                      ffPlayer.vel.x -= vDotN * nx;
                      ffPlayer.vel.y -= vDotN * ny;
                    }
                  }
                }
              }
            }

            for (let pass = 0; pass < PhysicsWorld.SOLVER_ITERATIONS; pass++) {
              resolveDiscDiscCollision(ffPlayer, engine.ball);

              if (worldDiscs && worldDiscs.length > 0) {
                for (let dIdx = 0; dIdx < worldDiscs.length; dIdx++) {
                  const postDisc = worldDiscs[dIdx]!;
                  if (postDisc.isPost) {
                    resolveDiscDiscCollision(ffPlayer, postDisc);
                    resolveDiscDiscCollision(engine.ball, postDisc);
                  }
                }
              }

              if (worldSegs && worldSegs.length > 0) {
                for (let segIdx = 0; segIdx < worldSegs.length; segIdx++) {
                  const seg = worldSegs[segIdx]!;
                  resolveDiscSegmentCollision(ffPlayer, seg, undefined, solverCtx);
                  resolveDiscSegmentCollision(engine.ball, seg, undefined, solverCtx);
                }
              } else {
                resolveGoalAndPitchBoundaries(ffPlayer.pos, ffPlayer.vel, ffPlayer.radius, this.replayBoundsScratch);
                resolveGoalAndPitchBoundaries(
                  engine.ball.pos,
                  engine.ball.vel,
                  engine.ball.radius,
                  this.replayBoundsScratch
                );
              }
            }

            ffPlayer.vel.x *= pSubDamp;
            ffPlayer.vel.y *= pSubDamp;
            engine.ball.vel.x *= bSubDamp;
            engine.ball.vel.y *= bSubDamp;
          }
        }
      }

      this.lastReplayedTicks = replayedCount;
      this.lastReplayedFullSteps = replayedCount;

      if (engine.currentTick < this.lastRecordedSeq) {
        engine.currentTick = this.lastRecordedSeq;
      }

      // Evaluar snap catastrófico (> 120 px) SOLO DESPUÉS de re-simular pendingInputs (sin vaciar inputBuffer)
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

      const resimDisc = engine.players.get(localDiscId);
      if (resimDisc) {
        const errX = xVisualBefore - resimDisc.pos.x;
        const errY = yVisualBefore - resimDisc.pos.y;
        const distSq = errX * errX + errY * errY;

        if (distSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
          this.visualOffset.x = 0;
          this.visualOffset.y = 0;
          this.didHardSnapLastReconcile = true;
          this.recordReconcileTelemetry();
          return this.setResult(true, true, replayedCount);
        } else if (distSq < ClientPredictionReconciler.ERROR_DEADZONE_SQ) {
          this.visualOffset.x = 0;
          this.visualOffset.y = 0;
          this.didHardSnapLastReconcile = false;
          return this.setResult(true, false, replayedCount);
        } else {
          this.visualOffset.x = errX;
          this.visualOffset.y = errY;
          this.didHardSnapLastReconcile = false;
          this.recordReconcileTelemetry();
          return this.setResult(true, false, replayedCount);
        }
      }

      this.didHardSnapLastReconcile = false;
      return this.setResult(true, false, replayedCount);
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
        return this.setResult(false, true, 0);
      }

      if (!authDisc) {
        this.didHardSnapLastReconcile = false;
        return this.setResult(false, false, 0);
      }

      const ackSeq = (authDisc as any).lastAckedInputSeq;
      if (typeof ackSeq === 'number' && ackSeq > 0) {
        const ackU32 = ackSeq >>> 0;
        while (this.inputBuffer.length > 0) {
          const first = this.inputBuffer[0]!;
          const seqU32 = (first.seq ?? first.tick) >>> 0;
          if (((ackU32 - seqU32) >>> 0) < 0x80000000) {
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

      if (this.inputBuffer.length > ClientPredictionReconciler.MAX_BUFFER_TICKS) {
        this.inputBuffer.splice(0, this.inputBuffer.length - ClientPredictionReconciler.MAX_BUFFER_TICKS);
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
      this.predictedState.prevDashState = Boolean((authDisc.flags ?? 0) & (1 << 1));
      this.predictedState.isDashing = this.predictedState.dashTicksRemaining > 0;
      this.predictedState.dashSlowdownTimer = ClientPredictionReconciler.computeRestoredSlowdown(
        this.predictedState.isDashing,
        cdSec,
        config
      );
      if (this.predictedState.isDashing) {
        const spd = Math.hypot(authDisc.vx, authDisc.vy);
        if (spd > 1e-3) {
          this.predictedState.dashDirX = authDisc.vx / spd;
          this.predictedState.dashDirY = authDisc.vy / spd;
        }
      }
      this.predictedState.isTurbo = false;
      this.predictedState.kicking = false;

      const replayStart = Math.max(0, this.inputBuffer.length - ClientPredictionReconciler.MAX_REPLAY_TICKS);
      let replayedCount = 0;
      for (let i = replayStart; i < this.inputBuffer.length; i++) {
        replayedCount++;
        const pending = this.inputBuffer[i]!;
        const m = pending.inputMask ?? pending.mask ?? 0;
        this.kinematicsInputScratch.inputMask = m;
        this.kinematicsInputScratch.aimAngle = pending.aimAngle ?? null;
        this.kinematicsInputScratch.aimThrottle = pending.aimThrottle ?? 0;
        stepPlayerKinematics(
          this.predictedState,
          this.kinematicsInputScratch,
          stadium,
          kickoffContext ?? null,
          config,
          1 / 60
        );
      }

      this.lastReplayedTicks = replayedCount;
      this.lastReplayedFullSteps = replayedCount;

      const errX = xVisualBefore - this.predictedState.pos.x;
      const errY = yVisualBefore - this.predictedState.pos.y;
      const distSq = errX * errX + errY * errY;

      if (distSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.didHardSnapLastReconcile = true;
        this.recordReconcileTelemetry();
        return this.setResult(true, true, replayedCount);
      } else if (distSq < ClientPredictionReconciler.ERROR_DEADZONE_SQ) {
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.didHardSnapLastReconcile = false;
        return this.setResult(true, false, replayedCount);
      } else {
        this.visualOffset.x = errX;
        this.visualOffset.y = errY;
        this.didHardSnapLastReconcile = false;
        this.recordReconcileTelemetry();
        return this.setResult(true, false, replayedCount);
      }
    }
  }
}
