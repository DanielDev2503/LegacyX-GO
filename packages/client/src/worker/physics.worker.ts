import {
  EngineInstance,
  BinaryProtocol,
  createClassicStadium,
  createStadium,
  type PlayerInput,
  type GameStateSnapshot,
  type PhysicsModifiers
} from '@legacyx/core';
import { SharedSimSync } from '../net/SharedSimSync';

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
  | { type: 'RECYCLE_BUFFER'; buffer: ArrayBuffer }
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
const sharedSimSync = new SharedSimSync('clasico');
const scratchApplySnapshot: GameStateSnapshot = {
  tick: 0,
  phase: 0,
  matchTimer: 0,
  redScore: 0,
  blueScore: 0,
  soundMask: 0,
  discs: []
};

const FIXED_DT_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 100;
const MAX_STEPS_PER_FRAME = 4;
const POLL_STEP_MS = 4;
let lastTime = performance.now();
let accumulator = 0;
let nextPollAt = 0;
let isLoopRunning = false;
let timerId: ReturnType<typeof setTimeout> | null = null;

// Pool de Transferables por tamaño exacto para transferencia zero-copy sin realocación
const recycledBufferPool = new Map<number, ArrayBuffer[]>();

function acquireTransferBuffer(byteLength: number): ArrayBuffer {
  const bucket = recycledBufferPool.get(byteLength);
  if (bucket && bucket.length > 0) {
    return bucket.pop()!;
  }
  return new ArrayBuffer(byteLength);
}

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
  const requiredBytes =
    BinaryProtocol.SNAPSHOT_HEADER_SIZE + snapshot.discs.length * BinaryProtocol.DISC_RECORD_SIZE;
  const transferBuffer = acquireTransferBuffer(requiredBytes);
  BinaryProtocol.encodeSnapshot(snapshot, transferBuffer);

  self.postMessage(
    {
      type: 'SNAPSHOT',
      buffer: transferBuffer,
      tick: snapshot.tick,
      visualOffsetX: 0,
      visualOffsetY: 0
    } satisfies WorkerEvent,
    { transfer: [transferBuffer] }
  );
}

function pumpWorkerTick(): void {
  if (!isLoopRunning) return;
  const now = performance.now();
  const rawDelta = Math.min(Math.max(0, now - lastTime), MAX_FRAME_DELTA_MS);
  lastTime = now;
  accumulator += rawDelta;

  let stepped = false;
  let steps = 0;

  while (accumulator >= FIXED_DT_MS && steps < MAX_STEPS_PER_FRAME) {
    engine.step(currentInputs, false);
    accumulator -= FIXED_DT_MS;
    steps++;
    stepped = true;
  }

  if (accumulator >= FIXED_DT_MS) {
    accumulator %= FIXED_DT_MS;
  }

  if (stepped) {
    broadcastSnapshot();
  }

  nextPollAt += POLL_STEP_MS;
  if (now - nextPollAt > MAX_FRAME_DELTA_MS) {
    nextPollAt = now + POLL_STEP_MS;
  }
  const delay = Math.max(1, nextPollAt - performance.now());
  timerId = setTimeout(pumpWorkerTick, delay);
}

function startLoop(): void {
  if (isLoopRunning) return;
  isLoopRunning = true;
  lastTime = performance.now();
  accumulator = 0;
  nextPollAt = lastTime + POLL_STEP_MS;
  timerId = setTimeout(pumpWorkerTick, POLL_STEP_MS);
}

function stopLoop(): void {
  isLoopRunning = false;
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

self.onmessage = (e: MessageEvent<WorkerCommand>) => {
  const cmd = e.data;

  switch (cmd.type) {
    case 'INIT': {
      if (cmd.stadiumId) {
        engine.stadium = createStadium(cmd.stadiumId);
        sharedSimSync.configure(cmd.stadiumId);
      }
      startLoop();
      broadcastSnapshot();
      break;
    }

    case 'SET_STADIUM': {
      engine.stadium = createStadium(cmd.stadiumId);
      sharedSimSync.configure(cmd.stadiumId);
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
      currentInputs.set(cmd.id, { inputMask: cmd.inputMask, tick: cmd.tick ?? engine.currentTick });
      break;
    }

    case 'APPLY_SNAPSHOT': {
      if (!BinaryProtocol.decodeSnapshotInto(cmd.buffer, scratchApplySnapshot)) break;
      sharedSimSync.onSnapshot(scratchApplySnapshot);
      engine.setState(scratchApplySnapshot);
      broadcastSnapshot();
      break;
    }

    case 'RECYCLE_BUFFER': {
      const buf = cmd.buffer;
      if (buf && buf.byteLength > 0) {
        let bucket = recycledBufferPool.get(buf.byteLength);
        if (!bucket) {
          bucket = [];
          recycledBufferPool.set(buf.byteLength, bucket);
        }
        if (bucket.length < 4) {
          bucket.push(buf);
        }
      }
      break;
    }

    case 'SET_MODIFIERS': {
      engine.applyModifiers(cmd.modifiers);
      sharedSimSync.configure('', cmd.modifiers);
      break;
    }

    case 'UPDATE_CONFIG': {
      engine.applyModifiers(cmd.config);
      sharedSimSync.configure('', cmd.config);
      broadcastSnapshot();
      break;
    }
  }
};
