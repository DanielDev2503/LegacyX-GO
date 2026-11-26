import {
  EngineInstance,
  INPUT_FLAG_MOUSE_AIM,
  MatchPhase,
  type GameStateSnapshot,
  stepPlayerKinematics,
  resolveDiscDiscCollision,
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
  public static readonly ERROR_DEADZONE = 0.5;
  public static readonly ERROR_DEADZONE_SQ = 0.25; // 0.5^2 px
  public static readonly CATASTROPHIC_ERROR = 80;
  public static readonly CATASTROPHIC_ERROR_SQ = 6400; // 80^2 px
  public static readonly MAX_REPLAY_TICKS = 5; // Máx. pasos completos de engine.step() por frame
  public static readonly MAX_BUFFER_TICKS = 45; // Retención máx. de inputs sin confirmar (750 ms RTT)

  public inputSeq: number = 0;
  public lastRecordedSeq: number = 0;
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

  private readonly replayInputScratch = {
    inputMask: 0,
    aimAngle: null as number | null | undefined,
    aimThrottle: 0 as number | undefined,
    sequence: 0 as number | undefined
  };
  private readonly kinematicsInputScratch = {
    inputMask: 0,
    aimAngle: null as number | null | undefined,
    aimThrottle: 0 as number | undefined
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
  private readonly reconcileResultScratch = { replayed: false, hardSnapped: false };

  // Anillo Zero-GC de estados predichos (64 ticks = >1s) para saltar rewind si el Host coincide (< 0.5 px)
  private readonly predHistoryRing = Array.from({ length: 64 }, () => ({
    seq: -1,
    px: 0,
    py: 0,
    bx: 0,
    by: 0
  }));

  public capturePredictionSample(seq: number, engine: EngineInstance, localDiscId: number): void {
    const p = engine.players.get(localDiscId);
    if (!p) return;
    const slot = this.predHistoryRing[seq & 63]!;
    slot.seq = seq;
    slot.px = p.pos.x;
    slot.py = p.pos.y;
    slot.bx = engine.ball.pos.x;
    slot.by = engine.ball.pos.y;
  }

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
    this.lastReplayedFullSteps = 0;
    this.reconciliationsPerSec = 0;
    this.reconcileWindowCount = 0;
    this.reconcileWindowStartMs = 0;
    for (let i = 0; i < this.predHistoryRing.length; i++) {
      this.predHistoryRing[i]!.seq = -1;
    }
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

  private setResult(replayed: boolean, hardSnapped: boolean): { replayed: boolean; hardSnapped: boolean } {
    this.reconcileResultScratch.replayed = replayed;
    this.reconcileResultScratch.hardSnapped = hardSnapped;
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
   * Continuous exponential decay for frame-time decoupling (rAF loop): Math.exp(-18 * frameDt)
   */
  public updateVisualSmoothing(frameDt: number): void {
    const decay = Math.exp(-18 * frameDt);
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

      // Fast-path Zero-Rewind: si la predicción histórica en ackSeq ya coincide (< 0.5 px) en jugador y balón, omitir rewind/replay
      this.lastReplayedFullSteps = 0;
      if (this.inputBuffer.length > ClientPredictionReconciler.MAX_BUFFER_TICKS) {
        this.inputBuffer.splice(0, this.inputBuffer.length - ClientPredictionReconciler.MAX_BUFFER_TICKS);
      }

      if (typeof ackSeq === 'number' && ackSeq > 0) {
        const hist = this.predHistoryRing[ackSeq & 63]!;
        if (hist.seq === ackSeq) {
          const authBall = authSnapshot.discs?.find((d) => d.id === 0 || d.team === 0);
          const pDx = authDisc.x - hist.px;
          const pDy = authDisc.y - hist.py;
          const bDx = authBall ? authBall.x - hist.bx : 0;
          const bDy = authBall ? authBall.y - hist.by : 0;
          if (
            pDx * pDx + pDy * pDy < ClientPredictionReconciler.ERROR_DEADZONE_SQ &&
            bDx * bDx + bDy * bDy < ClientPredictionReconciler.ERROR_DEADZONE_SQ
          ) {
            this.didHardSnapLastReconcile = false;
            this.didBallHardSnapLastReconcile = false;
            return this.setResult(false, false);
          }
        }
      }

      // Visual position on screen before reconciliation
      const xVisualBefore = localDisc.pos.x + this.visualOffset.x;
      const yVisualBefore = localDisc.pos.y + this.visualOffset.y;
      const ballXVisualBefore = engine.ball.pos.x + this.ballVisualOffset.x;
      const ballYVisualBefore = engine.ball.pos.y + this.ballVisualOffset.y;

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

      // En RTT alto (> 5 ticks, p. ej. 160–200 ms), avanzar los ticks anteriores con cinemática
      // ligera Zero-GC sin descartar inputs sin confirmar y acotar engine.step() a MAX_REPLAY_TICKS = 5 por frame
      const fullReplayStart = Math.max(0, this.inputBuffer.length - ClientPredictionReconciler.MAX_REPLAY_TICKS);
      if (fullReplayStart > 0) {
        const ffPlayer = engine.players.get(localDiscId);
        if (ffPlayer) {
          const ffState = this.fastForwardStateScratch;
          const ffTeam = (engine as any).playerTeams?.get(localDiscId) ?? (authDisc.team === 2 ? 'blue' : 'red');
          const ballDamp = engine.ball.damping ?? 0.99;
          const dt = 1 / 60;
          for (let i = 0; i < fullReplayStart; i++) {
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
              engine.world.kickoffContext ?? null,
              engine.modifiers as any,
              dt
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
            }

            engine.ball.pos.x += engine.ball.vel.x * dt;
            engine.ball.pos.y += engine.ball.vel.y * dt;
            resolveDiscDiscCollision(ffPlayer, engine.ball);
            engine.ball.vel.x *= ballDamp;
            engine.ball.vel.y *= ballDamp;
          }
        }
      }

      // Replay pending inputs (máximo MAX_REPLAY_TICKS = 5 pasos completos de engine.step con isReplay = true)
      this.replayMap.clear();
      for (let i = fullReplayStart; i < this.inputBuffer.length; i++) {
        this.lastReplayedFullSteps++;
        const pending = this.inputBuffer[i]!;
        const m = pending.inputMask ?? pending.mask ?? 0;
        const isMouseActive =
          (m & INPUT_FLAG_MOUSE_AIM) !== 0 &&
          pending.aimAngle !== null &&
          pending.aimAngle !== undefined;
        this.replayInputScratch.inputMask = m;
        this.replayInputScratch.aimAngle = isMouseActive ? pending.aimAngle : null;
        this.replayInputScratch.aimThrottle = isMouseActive ? (pending.aimThrottle ?? 0) : 0;
        this.replayInputScratch.sequence = pending.seq ?? pending.tick;
        this.replayMap.set(localDiscId, this.replayInputScratch);
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
        // Absorción continua exacta (0.00 px de salto instantáneo en el balón al llegar snapshot)
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
          // Hard snap (> 80 px): teleports / goles
          this.visualOffset.x = 0;
          this.visualOffset.y = 0;
          this.didHardSnapLastReconcile = true;
          this.recordReconcileTelemetry();
          return this.setResult(true, true);
        } else if (distSq < ClientPredictionReconciler.ERROR_DEADZONE_SQ) {
          // Deadzone (< 0.5 px): ignorar ruido de cuantización
          this.visualOffset.x = 0;
          this.visualOffset.y = 0;
          this.didHardSnapLastReconcile = false;
          return this.setResult(true, false);
        } else {
          // Absorción continua 0.5–80 px
          this.visualOffset.x = errX;
          this.visualOffset.y = errY;
          this.didHardSnapLastReconcile = false;
          this.recordReconcileTelemetry();
          return this.setResult(true, false);
        }
      }

      this.didHardSnapLastReconcile = false;
      return this.setResult(true, false);
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
        this.inputBuffer.splice(0, this.inputBuffer.length - ClientPredictionReconciler.MAX_REPLAY_TICKS);
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

      const errX = xVisualBefore - this.predictedState.pos.x;
      const errY = yVisualBefore - this.predictedState.pos.y;
      const distSq = errX * errX + errY * errY;

      if (distSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.didHardSnapLastReconcile = true;
        this.recordReconcileTelemetry();
        return this.setResult(true, true);
      } else if (distSq < ClientPredictionReconciler.ERROR_DEADZONE_SQ) {
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        this.didHardSnapLastReconcile = false;
        return this.setResult(true, false);
      } else {
        this.visualOffset.x = errX;
        this.visualOffset.y = errY;
        this.didHardSnapLastReconcile = false;
        this.recordReconcileTelemetry();
        return this.setResult(true, false);
      }
    }
  }
}
