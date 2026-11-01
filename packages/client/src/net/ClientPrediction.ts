import { EngineInstance, type GameStateSnapshot } from '@legacyx/core';

export interface BufferedClientInput {
  tick: number;
  mask: number;
  inputMask?: number;
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
  public static readonly ERROR_THRESHOLD_SQ = 0.25; // 0.5 px deadband
  public static readonly CATASTROPHIC_ERROR_SQ = 3600; // 60 px hard snap threshold
  public static readonly MAX_REPLAY_TICKS = 60;
  public static readonly VISUAL_DECAY = 0.82;

  public inputBuffer: BufferedClientInput[] = [];
  public visualOffset: { x: number; y: number } = { x: 0, y: 0 };
  private readonly replayMap = new Map<number, { inputMask: number }>();

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
  public recordInput(tick: number, mask: number): void;
  public recordInput(inputOrTick: BufferedClientInput | number, maskArg?: number): void {
    if (typeof inputOrTick === 'number') {
      const mask = maskArg ?? 0;
      this.inputBuffer.push({
        tick: inputOrTick,
        mask,
        inputMask: mask
      });
    } else {
      const mask = inputOrTick.inputMask ?? inputOrTick.mask ?? 0;
      this.inputBuffer.push({
        ...inputOrTick,
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

  public decayVisualOffset(): void {
    this.visualOffset.x *= ClientPredictionReconciler.VISUAL_DECAY;
    this.visualOffset.y *= ClientPredictionReconciler.VISUAL_DECAY;
    if (Math.abs(this.visualOffset.x) < 0.01) this.visualOffset.x = 0;
    if (Math.abs(this.visualOffset.y) < 0.01) this.visualOffset.y = 0;
  }

  public reconcile(
    engine: EngineInstance,
    authSnapshot: GameStateSnapshot,
    localDiscId: number
  ): { replayed: boolean; hardSnapped: boolean } {
    // 1. Discard obsolete inputs with tick <= authSnapshot.tick
    while (this.inputBuffer.length > 0 && this.inputBuffer[0]!.tick <= authSnapshot.tick) {
      this.inputBuffer.shift();
    }

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
    const authDisc = authSnapshot.discs.find((d) => d.id === localDiscId);

    if (!localDisc || !authDisc) {
      engine.setState(authSnapshot);
      this.visualOffset.x = 0;
      this.visualOffset.y = 0;
      return { replayed: false, hardSnapped: false };
    }

    const prevPredictedX = localDisc.pos.x;
    const prevPredictedY = localDisc.pos.y;

    // 2. Cap pending inputs to MAX_REPLAY_TICKS (60 ticks = 1.0s)
    if (this.inputBuffer.length > ClientPredictionReconciler.MAX_REPLAY_TICKS) {
      this.inputBuffer = this.inputBuffer.slice(-ClientPredictionReconciler.MAX_REPLAY_TICKS);
    }

    // 3. Rewind to authoritative snapshot at serverTick and replay all subsequent pending inputs
    engine.setState(authSnapshot);
    this.replayMap.clear();
    for (let i = 0; i < this.inputBuffer.length; i++) {
      const pending = this.inputBuffer[i]!;
      this.replayMap.set(localDiscId, { inputMask: pending.inputMask ?? pending.mask ?? 0 });
      engine.step(this.replayMap, true);
    }

    // 4. Compute post-replay residual error at current client tick and absorb into visualOffset
    const resimDisc = engine.players.get(localDiscId);
    if (resimDisc) {
      const errX = prevPredictedX - resimDisc.pos.x;
      const errY = prevPredictedY - resimDisc.pos.y;
      const postDistSq = errX * errX + errY * errY;

      if (postDistSq <= ClientPredictionReconciler.ERROR_THRESHOLD_SQ) {
        return { replayed: this.inputBuffer.length > 0, hardSnapped: false };
      }

      if (postDistSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
        return { replayed: true, hardSnapped: true };
      }

      this.visualOffset.x += errX;
      this.visualOffset.y += errY;
      const totalOffsetSq =
        this.visualOffset.x * this.visualOffset.x + this.visualOffset.y * this.visualOffset.y;
      if (totalOffsetSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
        const scale = Math.sqrt(ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ / totalOffsetSq);
        this.visualOffset.x *= scale;
        this.visualOffset.y *= scale;
      }
    }

    return { replayed: true, hardSnapped: false };
  }
}
