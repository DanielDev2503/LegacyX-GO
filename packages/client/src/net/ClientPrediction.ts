import { EngineInstance, type GameStateSnapshot } from '@legacyx/core';

export interface BufferedClientInput {
  tick: number;
  mask: number;
  curve: { x: number; y: number };
  isTurbo: boolean;
  triggerDash: boolean;
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
  public static readonly CATASTROPHIC_ERROR_SQ = 2500; // 50 px hard snap
  public static readonly MAX_REPLAY_TICKS = 5;
  public static readonly VISUAL_DECAY = 0.82;

  public inputBuffer: BufferedClientInput[] = [];
  public visualOffset: { x: number; y: number } = { x: 0, y: 0 };

  public recordInput(input: BufferedClientInput): void {
    this.inputBuffer.push(input);
    if (this.inputBuffer.length > 120) {
      this.inputBuffer.shift();
    }
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

    const localDisc = engine.players.get(localDiscId);
    const authDisc = authSnapshot.discs.find((d) => d.id === localDiscId);

    if (!localDisc || !authDisc) {
      engine.setState(authSnapshot);
      return { replayed: false, hardSnapped: false };
    }

    const prevPredictedX = localDisc.pos.x;
    const prevPredictedY = localDisc.pos.y;

    const dx = prevPredictedX - authDisc.x;
    const dy = prevPredictedY - authDisc.y;
    const distSq = dx * dx + dy * dy;

    // 2. Deadband check (<= 0.25 px^2)
    if (distSq <= ClientPredictionReconciler.ERROR_THRESHOLD_SQ) {
      return { replayed: false, hardSnapped: false };
    }

    // 3. Catastrophic error (> 2500 px^2 / 50 px): flush and snap immediately
    if (distSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
      engine.setState(authSnapshot);
      this.visualOffset.x = 0;
      this.visualOffset.y = 0;
      this.inputBuffer.length = 0;
      return { replayed: false, hardSnapped: true };
    }

    // 4. Cap pending inputs to MAX_REPLAY_TICKS (5)
    if (this.inputBuffer.length > ClientPredictionReconciler.MAX_REPLAY_TICKS) {
      this.inputBuffer = this.inputBuffer.slice(-ClientPredictionReconciler.MAX_REPLAY_TICKS);
    }

    // 5. Rewind to authoritative snapshot and replay with isReplay = true (skips GoalNet springs)
    engine.setState(authSnapshot);
    const replayMap = new Map<number, { inputMask: number }>();
    for (let i = 0; i < this.inputBuffer.length; i++) {
      const pending = this.inputBuffer[i]!;
      replayMap.set(localDiscId, { inputMask: pending.mask });
      engine.step(replayMap, true);
    }

    // 6. Compute post-replay residual error and absorb into visualOffset
    const resimDisc = engine.players.get(localDiscId);
    if (resimDisc) {
      const errX = prevPredictedX - resimDisc.pos.x;
      const errY = prevPredictedY - resimDisc.pos.y;
      const postDistSq = errX * errX + errY * errY;
      if (postDistSq > ClientPredictionReconciler.CATASTROPHIC_ERROR_SQ) {
        this.visualOffset.x = 0;
        this.visualOffset.y = 0;
      } else {
        this.visualOffset.x += errX;
        this.visualOffset.y += errY;
      }
    }

    return { replayed: true, hardSnapped: false };
  }
}
