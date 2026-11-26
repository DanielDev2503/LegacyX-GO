import {
  AIM_ANGLE_BYTE_NONE,
  DEFAULT_PHYSICS_MODIFIERS,
  EngineInstance,
  MatchPhase,
  POWER_SHOT_SPEED_THRESHOLD,
  decodeAimAngleByte,
  isFrozenMatchPhase,
  type CompactDiscState,
  type GameStateSnapshot,
  type PhysicsModifiers,
  type PlayerInput
} from '@legacyx/core';

export interface SharedSimSyncTelemetry {
  lastServerTick: number;
  lastPhase: number;
  jitterMs: number;
  syncCorrectionAvgPx: number;
  syncCorrectionMaxPx: number;
  lastCorrectionPx: number;
  localStepsSinceSnap: number;
  hardSnaps: number;
  extrapolationMs: number;
  networkStalled: boolean;
}

interface EntityVisualSlot {
  id: number;
  team: number;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  offsetX: number;
  offsetY: number;
  stepAX: number;
  stepAY: number;
  stepBX: number;
  stepBY: number;
  hasRendered: boolean;
}

/**
 * Opción 3 — Simulación Determinista Compartida (Único Dueño del Estado No-Host).
 * Mantiene dos mundos preasignados (`simWorld` + `extrapWorld`) con cero alocaciones a 60–240 Hz.
 */
export class SharedSimSync {
  public static readonly FIXED_DT = 1 / 60;
  public static readonly TICK_MS = 1000 / 60;
  public static readonly MAX_STEPS_PER_FRAME = 4;
  public static readonly MAX_RAW_DELTA_SEC = 0.1;
  public static readonly DISCONNECT_SAFETY_CAP_MS = 250;
  public static readonly MAX_LOCAL_STEPS_SINCE_SNAP = 15; // 250 ms a 60 Hz
  public static readonly OFFSET_DECAY_RATE = 20;
  public static readonly HARD_SNAP_DIST_PX = 90;
  public static readonly DEADZONE_DIST_PX = 0.25;

  public simWorld: EngineInstance;
  public extrapWorld: EngineInstance;
  private currentStadiumId: string;
  private currentModifiers: PhysicsModifiers;

  private readonly entitySlots = new Map<number, EntityVisualSlot>();
  private readonly freeSlots: EntityVisualSlot[] = [];
  private readonly seenDiscIds = new Set<number>();
  private readonly staleSlotIds: number[] = [];
  private readonly scratchInputMap = new Map<number, PlayerInput>();
  private readonly reusablePlayerInputs = new Map<number, PlayerInput>();

  private readonly renderDiscPool: CompactDiscState[] = [];
  private readonly renderSnapshot: GameStateSnapshot = {
    tick: 0,
    phase: MatchPhase.STOP,
    matchTimer: 0,
    redScore: 0,
    blueScore: 0,
    soundMask: 0,
    kickoffActive: false,
    isGoldenGoal: false,
    isNeutralKickoff: true,
    kickoffPossessingTeam: 'red',
    discs: []
  };

  private readonly correctionSamples = new Float32Array(60);
  private correctionHead = 0;
  private correctionCount = 0;
  private lastCorrectionPx = 0;
  private hardSnaps = 0;

  private hasAppliedSnapshot = false;
  private lastAppliedServerTick = 0;
  private lastPhase: number = MatchPhase.STOP;
  private lastMatchTimer = 0;
  private lastRedScore = 0;
  private lastBlueScore = 0;
  private lastKickoffActive = false;
  private lastIsGoldenGoal = false;
  private lastIsNeutralKickoff = true;
  private lastKickoffPossessingTeam: 'red' | 'blue' = 'red';
  private lastSnapshotArrivalMs = 0;
  private prevSnapshotArrivalMs = 0;
  private prevServerTickForJitter = 0;
  private jitterMs = 0;

  private accumulatorSec = 0;
  private localStepsSinceSnap = 0;
  public extrapolationMs = 0;

  constructor(stadiumId: string = 'mediano', modifiers: Partial<PhysicsModifiers> = {}) {
    this.currentStadiumId = stadiumId;
    this.currentModifiers = { ...DEFAULT_PHYSICS_MODIFIERS, ...modifiers };
    this.simWorld = new EngineInstance(stadiumId, { modifiers: this.currentModifiers });
    this.extrapWorld = new EngineInstance(stadiumId, { modifiers: this.currentModifiers });
  }

  public configure(
    stadiumId: string,
    modifiers?: Partial<PhysicsModifiers>,
    isPracticeMode: boolean = false
  ): void {
    const stadiumChanged = Boolean(stadiumId && stadiumId !== this.currentStadiumId);
    if (stadiumChanged) {
      this.currentStadiumId = stadiumId;
      this.simWorld.loadStadium(stadiumId);
      this.extrapWorld.loadStadium(stadiumId);
      this.reset();
    }
    let modifiersChanged = stadiumChanged;
    if (modifiers && !modifiersChanged) {
      for (const key in modifiers) {
        const k = key as keyof PhysicsModifiers;
        if (modifiers[k] !== undefined && this.currentModifiers[k] !== modifiers[k]) {
          modifiersChanged = true;
          break;
        }
      }
    }
    if (modifiers && modifiersChanged) {
      this.currentModifiers = { ...this.currentModifiers, ...modifiers };
      this.simWorld.applyModifiers(this.currentModifiers);
      this.extrapWorld.applyModifiers(this.currentModifiers);
    }
    this.simWorld.isPracticeMode = isPracticeMode;
    this.extrapWorld.isPracticeMode = isPracticeMode;
  }

  public setExtrapolationMs(ms: number): number {
    const clamped = Number.isFinite(ms) ? Math.max(0, Math.min(250, Math.round(ms))) : 0;
    this.extrapolationMs = clamped;
    return clamped;
  }

  public reset(): void {
    for (const slot of this.entitySlots.values()) {
      slot.hasRendered = false;
      this.freeSlots.push(slot);
    }
    this.entitySlots.clear();
    this.seenDiscIds.clear();
    this.staleSlotIds.length = 0;
    this.hasAppliedSnapshot = false;
    this.lastAppliedServerTick = 0;
    this.lastPhase = MatchPhase.STOP;
    this.lastMatchTimer = 0;
    this.lastRedScore = 0;
    this.lastBlueScore = 0;
    this.lastKickoffActive = false;
    this.lastIsGoldenGoal = false;
    this.lastIsNeutralKickoff = true;
    this.lastKickoffPossessingTeam = 'red';
    this.lastSnapshotArrivalMs = 0;
    this.prevSnapshotArrivalMs = 0;
    this.prevServerTickForJitter = 0;
    this.jitterMs = 0;
    this.accumulatorSec = 0;
    this.localStepsSinceSnap = 0;
    this.correctionHead = 0;
    this.correctionCount = 0;
    this.lastCorrectionPx = 0;
    this.hardSnaps = 0;
    this.correctionSamples.fill(0);
    this.simWorld.stopMatch();
    this.extrapWorld.stopMatch();
  }

  private acquireSlot(id: number, team: number): EntityVisualSlot {
    let slot = this.entitySlots.get(id);
    if (slot) {
      slot.team = team;
      return slot;
    }
    slot = this.freeSlots.pop() ?? {
      id,
      team,
      prevX: 0,
      prevY: 0,
      currX: 0,
      currY: 0,
      offsetX: 0,
      offsetY: 0,
      stepAX: 0,
      stepAY: 0,
      stepBX: 0,
      stepBY: 0,
      hasRendered: false
    };
    slot.id = id;
    slot.team = team;
    slot.offsetX = 0;
    slot.offsetY = 0;
    slot.hasRendered = false;
    this.entitySlots.set(id, slot);
    return slot;
  }

  private pushCorrectionSample(dist: number): void {
    this.lastCorrectionPx = dist;
    this.correctionSamples[this.correctionHead] = dist;
    this.correctionHead = (this.correctionHead + 1) % this.correctionSamples.length;
    if (this.correctionCount < this.correctionSamples.length) {
      this.correctionCount++;
    }
  }

  /**
   * Ingesta autoritativa sin buffer artificial (40–140 ms eliminado).
   * Descarta paquetes viejos/desordenados y absorbe discrepancias en `visualOffset`.
   */
  public onSnapshot(snapshot: GameStateSnapshot, nowMs: number = performance.now()): boolean {
    const isTickReset =
      this.hasAppliedSnapshot &&
      this.lastAppliedServerTick > 120 &&
      snapshot.tick + 120 < this.lastAppliedServerTick;
    const isCriticalPhaseChange =
      !this.hasAppliedSnapshot ||
      (snapshot.phase !== this.lastPhase &&
        (snapshot.phase === MatchPhase.STOP ||
          snapshot.phase === MatchPhase.KICKOFF ||
          snapshot.phase === MatchPhase.GOAL_REPLAY));

    if (
      this.hasAppliedSnapshot &&
      snapshot.tick <= this.lastAppliedServerTick &&
      !isTickReset &&
      !isCriticalPhaseChange
    ) {
      return false;
    }

    if (this.hasAppliedSnapshot && snapshot.tick > this.lastAppliedServerTick && this.prevSnapshotArrivalMs > 0) {
      const arrivalDelta = nowMs - this.prevSnapshotArrivalMs;
      const tickDeltaMs = (snapshot.tick - this.prevServerTickForJitter) * SharedSimSync.TICK_MS;
      const instantJitter = Math.abs(arrivalDelta - tickDeltaMs);
      if (Number.isFinite(instantJitter) && instantJitter < 1000) {
        this.jitterMs += (instantJitter - this.jitterMs) * (1 / 16);
      }
    }
    this.prevSnapshotArrivalMs = nowMs;
    this.prevServerTickForJitter = snapshot.tick;

    const prevPhase = this.lastPhase;
    const isGoalReplay = snapshot.phase === MatchPhase.GOAL_REPLAY;
    const wasGoalReplay = prevPhase === MatchPhase.GOAL_REPLAY;
    const isHardSnapPhase =
      isTickReset ||
      (isGoalReplay && !wasGoalReplay) ||
      (snapshot.phase === MatchPhase.KICKOFF &&
        prevPhase !== MatchPhase.KICKOFF &&
        prevPhase !== MatchPhase.START_COUNTDOWN) ||
      (snapshot.phase === MatchPhase.PAUSE && prevPhase !== MatchPhase.PAUSE) ||
      (snapshot.phase === MatchPhase.STOP && prevPhase !== MatchPhase.STOP);

    const alphaNow = isFrozenMatchPhase(prevPhase)
      ? 1
      : Math.max(0, Math.min(1, this.accumulatorSec / SharedSimSync.FIXED_DT));
    const decayNow = 1;

    this.simWorld.setState(snapshot);

    this.seenDiscIds.clear();
    const discs = snapshot.discs;
    for (let i = 0; i < discs.length; i++) {
      const d = discs[i]!;
      this.seenDiscIds.add(d.id);
      const slot = this.acquireSlot(d.id, d.team);

      if (isGoalReplay && wasGoalReplay && slot.hasRendered) {
        const jumpDist = Math.hypot(d.x - slot.currX, d.y - slot.currY);
        if (jumpDist <= SharedSimSync.HARD_SNAP_DIST_PX) {
          slot.prevX = slot.currX;
          slot.prevY = slot.currY;
          slot.currX = d.x;
          slot.currY = d.y;
          slot.offsetX = 0;
          slot.offsetY = 0;
          continue;
        }
      }

      if (slot.hasRendered && !isGoalReplay) {
        const predVisX =
          slot.prevX + (slot.currX - slot.prevX) * alphaNow + slot.offsetX * decayNow;
        const predVisY =
          slot.prevY + (slot.currY - slot.prevY) * alphaNow + slot.offsetY * decayNow;
        const dx = predVisX - d.x;
        const dy = predVisY - d.y;
        const dist = Math.hypot(dx, dy);
        this.pushCorrectionSample(dist);

        if (isHardSnapPhase || dist > SharedSimSync.HARD_SNAP_DIST_PX) {
          slot.offsetX = 0;
          slot.offsetY = 0;
          if (dist > SharedSimSync.HARD_SNAP_DIST_PX) {
            this.hardSnaps++;
          }
        } else if (dist < SharedSimSync.DEADZONE_DIST_PX) {
          slot.offsetX = 0;
          slot.offsetY = 0;
        } else {
          slot.offsetX = dx;
          slot.offsetY = dy;
        }
      } else {
        slot.offsetX = 0;
        slot.offsetY = 0;
        slot.hasRendered = true;
      }

      slot.prevX = d.x;
      slot.prevY = d.y;
      slot.currX = d.x;
      slot.currY = d.y;
    }

    this.staleSlotIds.length = 0;
    for (const id of this.entitySlots.keys()) {
      if (!this.seenDiscIds.has(id)) {
        this.staleSlotIds.push(id);
      }
    }
    for (let i = 0; i < this.staleSlotIds.length; i++) {
      const staleId = this.staleSlotIds[i]!;
      const staleSlot = this.entitySlots.get(staleId);
      if (staleSlot) {
        staleSlot.hasRendered = false;
        this.freeSlots.push(staleSlot);
        this.entitySlots.delete(staleId);
      }
    }

    this.hasAppliedSnapshot = true;
    this.lastAppliedServerTick = snapshot.tick;
    this.lastPhase = snapshot.phase;
    this.lastMatchTimer = snapshot.matchTimer;
    this.lastRedScore = snapshot.redScore;
    this.lastBlueScore = snapshot.blueScore;
    this.lastKickoffActive = Boolean(snapshot.kickoffActive ?? (snapshot.phase === MatchPhase.KICKOFF));
    this.lastIsGoldenGoal = Boolean(snapshot.isGoldenGoal);
    this.lastIsNeutralKickoff = snapshot.isNeutralKickoff !== false;
    this.lastKickoffPossessingTeam = snapshot.kickoffPossessingTeam ?? 'red';
    this.lastSnapshotArrivalMs = nowMs;
    this.localStepsSinceSnap = 0;
    this.accumulatorSec = 0;

    if (!isGoalReplay) {
      this.populateLookaheadCurr();
    }

    return true;
  }

  private populateLookaheadCurr(): void {
    const ballSlot = this.entitySlots.get(this.simWorld.ball.id);
    if (isFrozenMatchPhase(this.lastPhase)) {
      if (ballSlot) {
        ballSlot.currX = ballSlot.prevX;
        ballSlot.currY = ballSlot.prevY;
      }
      for (const id of this.simWorld.players.keys()) {
        const slot = this.entitySlots.get(id);
        if (slot) {
          slot.currX = slot.prevX;
          slot.currY = slot.prevY;
        }
      }
      return;
    }

    this.simWorld.copyStateTo(this.extrapWorld);
    this.fillInputMapFromSimWorld();
    this.extrapWorld.step(this.scratchInputMap, true);

    if (ballSlot) {
      ballSlot.currX = this.extrapWorld.ball.pos.x;
      ballSlot.currY = this.extrapWorld.ball.pos.y;
    }
    for (const [id, eDisc] of this.extrapWorld.players.entries()) {
      const slot = this.entitySlots.get(id);
      if (slot) {
        slot.currX = eDisc.pos.x;
        slot.currY = eDisc.pos.y;
      }
    }
  }

  private fillInputMapFromSimWorld(): void {
    this.scratchInputMap.clear();
    for (const [id] of this.simWorld.players.entries()) {
      const rt = this.simWorld.getPlayerRuntime(id);
      const mask = rt ? rt.activeInputMask : 0;
      const aimByte = rt ? rt.activeAimAngleByte : AIM_ANGLE_BYTE_NONE;
      const aimAngle = decodeAimAngleByte(aimByte);

      let entry = this.reusablePlayerInputs.get(id);
      if (!entry) {
        entry = { inputMask: 0, aimAngle: null, aimThrottle: 0 };
        this.reusablePlayerInputs.set(id, entry);
      }
      entry.inputMask = mask;
      entry.aimAngle = aimAngle;
      entry.aimThrottle = aimAngle !== null ? 1.0 : 0;
      this.scratchInputMap.set(id, entry);
    }
  }

  /**
   * Avanza `simWorld` exactamente 1 tick de 60 Hz usando los inputs activos conocidos
   * de TODOS los jugadores, y actualiza el horizonte `[prev = K+1, curr = K+2]`.
   */
  public stepLocal(): void {
    this.fillInputMapFromSimWorld();
    this.simWorld.step(this.scratchInputMap, true);

    const ballSlot = this.entitySlots.get(this.simWorld.ball.id);
    if (ballSlot) {
      ballSlot.prevX = this.simWorld.ball.pos.x;
      ballSlot.prevY = this.simWorld.ball.pos.y;
    }
    for (const [id, disc] of this.simWorld.players.entries()) {
      const slot = this.entitySlots.get(id);
      if (slot) {
        slot.prevX = disc.pos.x;
        slot.prevY = disc.pos.y;
      }
    }

    this.lastPhase = this.simWorld.fsm.state;
    this.localStepsSinceSnap++;
    this.populateLookaheadCurr();
  }

  /**
   * Avance continuo del frame: decae `visualOffset` independiente de Hz y ejecuta el
   * acumulador fijo de 60 Hz (`MAX_STEPS_PER_FRAME = 4`, cap de corte de red = 250 ms).
   */
  public update(rawFrameDtSec: number, nowMs: number = performance.now()): void {
    const frameDt = Math.max(0, Math.min(SharedSimSync.MAX_RAW_DELTA_SEC, Number.isFinite(rawFrameDtSec) ? rawFrameDtSec : 0));

    const decay = frameDt > 0 ? Math.exp(-SharedSimSync.OFFSET_DECAY_RATE * frameDt) : 1;
    if (decay < 1) {
      for (const slot of this.entitySlots.values()) {
        if (slot.offsetX !== 0) {
          slot.offsetX *= decay;
          if (Math.abs(slot.offsetX) < 0.005) slot.offsetX = 0;
        }
        if (slot.offsetY !== 0) {
          slot.offsetY *= decay;
          if (Math.abs(slot.offsetY) < 0.005) slot.offsetY = 0;
        }
      }
    }

    if (!this.hasAppliedSnapshot) {
      return;
    }

    const elapsedSinceSnapMs = nowMs - this.lastSnapshotArrivalMs;
    if (
      isFrozenMatchPhase(this.lastPhase) ||
      elapsedSinceSnapMs > SharedSimSync.DISCONNECT_SAFETY_CAP_MS
    ) {
      this.accumulatorSec = 0;
      return;
    }

    this.accumulatorSec += frameDt;
    let steps = 0;
    while (
      this.accumulatorSec >= SharedSimSync.FIXED_DT &&
      steps < SharedSimSync.MAX_STEPS_PER_FRAME &&
      this.localStepsSinceSnap < SharedSimSync.MAX_LOCAL_STEPS_SINCE_SNAP
    ) {
      this.stepLocal();
      this.accumulatorSec -= SharedSimSync.FIXED_DT;
      steps++;
    }

    if (steps >= SharedSimSync.MAX_STEPS_PER_FRAME && this.accumulatorSec >= SharedSimSync.FIXED_DT) {
      this.accumulatorSec = 0;
    }
  }

  private ensureRenderDiscSlot(index: number): CompactDiscState {
    let slot = this.renderDiscPool[index];
    if (!slot) {
      slot = {
        id: 0,
        team: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        flags: 0,
        spin: 0,
        stamina: 100,
        lastAckedInputSeq: 0,
        dashTimer: 0,
        dashCooldown: 0,
        inputMask: 0,
        aimAngleByte: AIM_ANGLE_BYTE_NONE
      };
      this.renderDiscPool[index] = slot;
    }
    return slot;
  }

  /**
   * Construye el snapshot de solo lectura para `GameRenderer` (Zero-Allocation):
   * aplica interpolación sub-frame alpha para 60/120/144/240 Hz y, cuando
   * `extrapolationMs > 0` en fases activas, simula `extrapWorld` en modo silencioso.
   */
  public buildRenderSnapshot(
    extrapolationMsOverride?: number,
    nowMs: number = performance.now()
  ): GameStateSnapshot | null {
    if (!this.hasAppliedSnapshot) return null;

    const phase = this.lastPhase;
    const isFrozenPhase = isFrozenMatchPhase(phase);
    const isFrozenVel = isFrozenPhase;

    const alpha =
      phase === MatchPhase.GOAL_REPLAY
        ? Math.max(0, Math.min(1, (nowMs - this.lastSnapshotArrivalMs) / SharedSimSync.TICK_MS))
        : isFrozenPhase
          ? 1
          : Math.max(0, Math.min(1, this.accumulatorSec / SharedSimSync.FIXED_DT));

    const effExtrapMs = Math.max(
      0,
      Math.min(250, Math.round(extrapolationMsOverride ?? this.extrapolationMs))
    );
    this.extrapolationMs = effExtrapMs;

    const elapsedSinceSnapMs = nowMs - this.lastSnapshotArrivalMs;
    const canExtrapolate =
      effExtrapMs > 0 &&
      !isFrozenPhase &&
      elapsedSinceSnapMs <= SharedSimSync.DISCONNECT_SAFETY_CAP_MS;

    const ball = this.simWorld.ball;
    const ballSlot = this.entitySlots.get(ball.id);

    // Extrapolación física real en scratch `extrapWorld` (Zero-Allocation, nunca muta `simWorld`)
    const targetTicks = alpha + (canExtrapolate ? (effExtrapMs / 1000) * 60 : 0);
    const useMultiStepExtrap = canExtrapolate && targetTicks > 1.0;
    const singleTickFraction = Math.max(0, Math.min(1, targetTicks));
    let frac = 0;
    if (useMultiStepExtrap) {
      const wholeSteps = Math.floor(targetTicks);
      frac = targetTicks - wholeSteps;

      this.simWorld.copyStateTo(this.extrapWorld);
      this.fillInputMapFromSimWorld();

      for (let s = 0; s < wholeSteps; s++) {
        this.extrapWorld.step(this.scratchInputMap, true);
      }

      if (ballSlot) {
        ballSlot.stepAX = this.extrapWorld.ball.pos.x;
        ballSlot.stepAY = this.extrapWorld.ball.pos.y;
      }
      for (const [id, eDisc] of this.extrapWorld.players.entries()) {
        const pSlot = this.entitySlots.get(id);
        if (pSlot) {
          pSlot.stepAX = eDisc.pos.x;
          pSlot.stepAY = eDisc.pos.y;
        }
      }

      if (frac > 1e-5) {
        this.extrapWorld.step(this.scratchInputMap, true);
        if (ballSlot) {
          ballSlot.stepBX = this.extrapWorld.ball.pos.x;
          ballSlot.stepBY = this.extrapWorld.ball.pos.y;
        }
        for (const [id, eDisc] of this.extrapWorld.players.entries()) {
          const pSlot = this.entitySlots.get(id);
          if (pSlot) {
            pSlot.stepBX = eDisc.pos.x;
            pSlot.stepBY = eDisc.pos.y;
          }
        }
      } else {
        if (ballSlot) {
          ballSlot.stepBX = ballSlot.stepAX;
          ballSlot.stepBY = ballSlot.stepAY;
        }
        for (const [id] of this.extrapWorld.players.entries()) {
          const pSlot = this.entitySlots.get(id);
          if (pSlot) {
            pSlot.stepBX = pSlot.stepAX;
            pSlot.stepBY = pSlot.stepAY;
          }
        }
      }
    }

    // 3. Emitir discs al renderSnapshot preasignado
    let outIdx = 0;
    const activeBall = useMultiStepExtrap ? this.extrapWorld.ball : ball;
    const outBall = this.ensureRenderDiscSlot(outIdx++);
    outBall.id = ball.id;
    outBall.team = 0;
    if (ballSlot) {
      const renderBaseX = useMultiStepExtrap
        ? ballSlot.stepAX + (ballSlot.stepBX - ballSlot.stepAX) * frac
        : ballSlot.prevX + (ballSlot.currX - ballSlot.prevX) * singleTickFraction;
      const renderBaseY = useMultiStepExtrap
        ? ballSlot.stepAY + (ballSlot.stepBY - ballSlot.stepAY) * frac
        : ballSlot.prevY + (ballSlot.currY - ballSlot.prevY) * singleTickFraction;
      const offX = Math.max(-SharedSimSync.HARD_SNAP_DIST_PX, Math.min(SharedSimSync.HARD_SNAP_DIST_PX, ballSlot.offsetX));
      const offY = Math.max(-SharedSimSync.HARD_SNAP_DIST_PX, Math.min(SharedSimSync.HARD_SNAP_DIST_PX, ballSlot.offsetY));
      outBall.x = renderBaseX + offX;
      outBall.y = renderBaseY + offY;
    } else {
      outBall.x = activeBall.pos.x;
      outBall.y = activeBall.pos.y;
    }
    outBall.vx = isFrozenVel ? 0 : activeBall.vel.x;
    outBall.vy = isFrozenVel ? 0 : activeBall.vel.y;
    let ballFlags = 0;
    if (Math.abs(activeBall.spin) > 0.001) ballFlags |= (1 << 1) | (1 << 2);
    if (activeBall.isPowerShot || activeBall.vel.len() >= POWER_SHOT_SPEED_THRESHOLD) ballFlags |= 1 << 3;
    outBall.flags = ballFlags;
    outBall.spin = activeBall.spin;
    outBall.stamina = 100;
    outBall.inputMask = 0;
    outBall.aimAngleByte = AIM_ANGLE_BYTE_NONE;

    for (const [id, simDisc] of this.simWorld.players.entries()) {
      const slot = this.entitySlots.get(id);
      const extrapDisc = useMultiStepExtrap ? this.extrapWorld.players.get(id) : undefined;
      const srcDisc = extrapDisc ?? simDisc;
      const teamStr = this.simWorld.playerTeams.get(id);
      const rt = this.simWorld.getPlayerRuntime(id);
      const outP = this.ensureRenderDiscSlot(outIdx++);

      outP.id = id;
      outP.team = teamStr === 'red' ? 1 : teamStr === 'blue' ? 2 : 3;

      if (slot) {
        const renderBaseX = useMultiStepExtrap
          ? slot.stepAX + (slot.stepBX - slot.stepAX) * frac
          : slot.prevX + (slot.currX - slot.prevX) * singleTickFraction;
        const renderBaseY = useMultiStepExtrap
          ? slot.stepAY + (slot.stepBY - slot.stepAY) * frac
          : slot.prevY + (slot.currY - slot.prevY) * singleTickFraction;
        const offX = Math.max(-SharedSimSync.HARD_SNAP_DIST_PX, Math.min(SharedSimSync.HARD_SNAP_DIST_PX, slot.offsetX));
        const offY = Math.max(-SharedSimSync.HARD_SNAP_DIST_PX, Math.min(SharedSimSync.HARD_SNAP_DIST_PX, slot.offsetY));
        outP.x = renderBaseX + offX;
        outP.y = renderBaseY + offY;
      } else {
        outP.x = srcDisc.pos.x;
        outP.y = srcDisc.pos.y;
      }

      outP.vx = isFrozenVel ? 0 : srcDisc.vel.x;
      outP.vy = isFrozenVel ? 0 : srcDisc.vel.y;
      let pFlags = 0;
      if (srcDisc.kicking) pFlags |= 1 << 0;
      if (srcDisc.isDashing) pFlags |= 1 << 1;
      if (srcDisc.isTurbo) pFlags |= 1 << 4;
      if (srcDisc.isTyping) pFlags |= 1 << 5;
      outP.flags = pFlags;
      outP.stamina = srcDisc.stamina;
      const activeRt = useMultiStepExtrap ? (this.extrapWorld.getPlayerRuntime(id) ?? rt) : rt;
      outP.dashTimer = activeRt ? activeRt.ticksRemaining : 0;
      outP.dashCooldown = activeRt ? activeRt.cooldownTimer : 0;
      outP.lastAckedInputSeq = rt ? rt.lastProcessedInputSeq : 0;
      outP.inputMask = rt ? rt.activeInputMask : 0;
      outP.aimAngleByte = rt ? rt.activeAimAngleByte : AIM_ANGLE_BYTE_NONE;
      outP.spin = 0;
    }

    this.renderDiscPool.length = outIdx;
    this.renderSnapshot.tick = this.lastAppliedServerTick + this.localStepsSinceSnap;
    this.renderSnapshot.phase = phase;
    this.renderSnapshot.matchTimer = this.lastMatchTimer;
    this.renderSnapshot.redScore = this.lastRedScore;
    this.renderSnapshot.blueScore = this.lastBlueScore;
    this.renderSnapshot.soundMask = 0;
    this.renderSnapshot.kickoffActive = this.simWorld.fsm.state === MatchPhase.KICKOFF && this.lastKickoffActive;
    this.renderSnapshot.isGoldenGoal = this.lastIsGoldenGoal;
    this.renderSnapshot.isNeutralKickoff = this.lastIsNeutralKickoff;
    this.renderSnapshot.kickoffPossessingTeam = this.lastKickoffPossessingTeam;
    this.renderSnapshot.discs = this.renderDiscPool;

    return this.renderSnapshot;
  }

  public getTelemetry(out?: SharedSimSyncTelemetry, nowMs: number = performance.now()): SharedSimSyncTelemetry {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < this.correctionCount; i++) {
      const val = this.correctionSamples[i] ?? 0;
      sum += val;
      if (val > max) max = val;
    }
    const avg = this.correctionCount > 0 ? sum / this.correctionCount : 0;
    const stalled =
      this.hasAppliedSnapshot &&
      !isFrozenMatchPhase(this.lastPhase) &&
      nowMs - this.lastSnapshotArrivalMs > SharedSimSync.DISCONNECT_SAFETY_CAP_MS;

    const target = out ?? {
      lastServerTick: 0,
      lastPhase: 0,
      jitterMs: 0,
      syncCorrectionAvgPx: 0,
      syncCorrectionMaxPx: 0,
      lastCorrectionPx: 0,
      localStepsSinceSnap: 0,
      hardSnaps: 0,
      extrapolationMs: 0,
      networkStalled: false
    };

    target.lastServerTick = this.lastAppliedServerTick;
    target.lastPhase = this.lastPhase;
    target.jitterMs = Math.round(this.jitterMs * 10) / 10;
    target.syncCorrectionAvgPx = Math.round(avg * 100) / 100;
    target.syncCorrectionMaxPx = Math.round(max * 100) / 100;
    target.lastCorrectionPx = Math.round(this.lastCorrectionPx * 100) / 100;
    target.localStepsSinceSnap = this.localStepsSinceSnap;
    target.hardSnaps = this.hardSnaps;
    target.extrapolationMs = this.extrapolationMs;
    target.networkStalled = stalled;
    return target;
  }
}
