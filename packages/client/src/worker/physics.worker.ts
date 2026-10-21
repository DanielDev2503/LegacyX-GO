import {
  EngineInstance,
  BinaryProtocol,
  createClassicStadium,
  createStadium,
  type PlayerInput,
  type GameStateSnapshot,
  type PhysicsModifiers
} from '@legacyx/core';
import { ClientPredictionReconciler } from '../net/ClientPrediction';

export type WorkerCommand =
  | { type: 'INIT'; stadiumId?: string }
  | { type: 'SET_STADIUM'; stadiumId: string }
  | { type: 'ADD_PLAYER'; id: number; team: 'red' | 'blue' }
  | { type: 'REMOVE_PLAYER'; id: number }
  | { type: 'START_MATCH' }
  | { type: 'STOP_MATCH' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'INPUT'; id: number; inputMask: number; tick?: number }
  | { type: 'APPLY_SNAPSHOT'; buffer: ArrayBuffer; localDiscId?: number }
  | { type: 'SET_MODIFIERS'; modifiers: Partial<PhysicsModifiers> }
  | { type: 'UPDATE_CONFIG'; config: Partial<PhysicsModifiers> };

export type WorkerEvent =
  | {
      type: 'SNAPSHOT';
      buffer: ArrayBuffer;
      tick: number;
      visualOffsetX: number;
      visualOffsetY: number;
    }
  | { type: 'ENGINE_EVENT'; event: string; payload: unknown };

const engine = new EngineInstance(createClassicStadium());
const currentInputs = new Map<number, PlayerInput>();
const reconciler = new ClientPredictionReconciler();

const FIXED_DT_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;
let lastTime = performance.now();
let accumulator = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

// Pre-allocated reusable ArrayBuffer for 60Hz worker -> main thread transfer
let reusableSnapshotBuffer = new ArrayBuffer(1024);

// Forward engine events (goals, state changes, post hits, kicks) to UI thread
engine.on('goal', (payload) => {
  self.postMessage({ type: 'ENGINE_EVENT', event: 'goal', payload } satisfies WorkerEvent);
});

engine.on('state_change', (payload) => {
  self.postMessage({ type: 'ENGINE_EVENT', event: 'state_change', payload } satisfies WorkerEvent);
});

engine.on('post_hit', (payload) => {
  self.postMessage({ type: 'ENGINE_EVENT', event: 'post_hit', payload } satisfies WorkerEvent);
});

engine.on('kick', (payload) => {
  self.postMessage({ type: 'ENGINE_EVENT', event: 'kick', payload } satisfies WorkerEvent);
});

function broadcastSnapshot(): void {
  const snapshot: GameStateSnapshot = engine.getState();
  const requiredBytes = 18 + snapshot.discs.length * 16;
  if (reusableSnapshotBuffer.byteLength < requiredBytes) {
    reusableSnapshotBuffer = new ArrayBuffer(requiredBytes * 2);
  }
  const encoded = BinaryProtocol.encodeSnapshot(snapshot, reusableSnapshotBuffer);
  // Copy slice for transferable postMessage while keeping internal reusable buffer intact
  const transferBuffer = encoded.slice(0);

  self.postMessage(
    {
      type: 'SNAPSHOT',
      buffer: transferBuffer,
      tick: snapshot.tick,
      visualOffsetX: reconciler.visualOffset.x,
      visualOffsetY: reconciler.visualOffset.y
    } satisfies WorkerEvent,
    { transfer: [transferBuffer] }
  );
}

function startLoop(): void {
  if (intervalId !== null) return;
  lastTime = performance.now();
  accumulator = 0;

  intervalId = setInterval(() => {
    const now = performance.now();
    const frameDelta = now - lastTime;
    lastTime = now;
    accumulator += frameDelta;

    let stepped = false;
    let steps = 0;

    while (accumulator >= FIXED_DT_MS && steps < MAX_STEPS_PER_FRAME) {
      engine.step(currentInputs, false);
      reconciler.decayVisualOffset();
      accumulator -= FIXED_DT_MS;
      steps++;
      stepped = true;
    }

    // Prevent spiral of death if tab was backgrounded
    if (accumulator >= FIXED_DT_MS) {
      accumulator = accumulator % FIXED_DT_MS;
    }

    if (stepped) {
      broadcastSnapshot();
    }
  }, 4);
}

function stopLoop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

self.onmessage = (e: MessageEvent<WorkerCommand>) => {
  const cmd = e.data;

  switch (cmd.type) {
    case 'INIT': {
      if (cmd.stadiumId) {
        engine.stadium = createStadium(cmd.stadiumId);
      }
      startLoop();
      broadcastSnapshot();
      break;
    }

    case 'SET_STADIUM': {
      engine.stadium = createStadium(cmd.stadiumId);
      broadcastSnapshot();
      break;
    }

    case 'ADD_PLAYER': {
      engine.addPlayer(cmd.id, cmd.team);
      broadcastSnapshot();
      break;
    }

    case 'REMOVE_PLAYER': {
      engine.removePlayer(cmd.id);
      currentInputs.delete(cmd.id);
      broadcastSnapshot();
      break;
    }

    case 'START_MATCH': {
      engine.startMatch();
      startLoop();
      broadcastSnapshot();
      break;
    }

    case 'STOP_MATCH': {
      stopLoop();
      break;
    }

    case 'TOGGLE_PAUSE': {
      engine.fsm.togglePause();
      broadcastSnapshot();
      break;
    }

    case 'INPUT': {
      currentInputs.set(cmd.id, { inputMask: cmd.inputMask });
      reconciler.recordInput({
        tick: cmd.tick ?? engine.currentTick,
        mask: cmd.inputMask,
        curve: { x: 0, y: 0 },
        isTurbo: (cmd.inputMask & (1 << 5)) !== 0,
        triggerDash: (cmd.inputMask & (1 << 6)) !== 0
      });
      break;
    }

    case 'APPLY_SNAPSHOT': {
      const snapshot = BinaryProtocol.decodeSnapshot(cmd.buffer);
      if (!snapshot) break;
      if (cmd.localDiscId !== undefined) {
        reconciler.reconcile(engine, snapshot, cmd.localDiscId);
      } else {
        engine.setState(snapshot);
      }
      broadcastSnapshot();
      break;
    }

    case 'SET_MODIFIERS': {
      engine.applyModifiers(cmd.modifiers);
      break;
    }

    case 'UPDATE_CONFIG': {
      engine.applyModifiers(cmd.config);
      broadcastSnapshot();
      break;
    }
  }
};
