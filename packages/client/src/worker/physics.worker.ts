import {
  EngineInstance,
  CORE_TICK_RATE,
  CORE_DT,
  type PlayerInput,
  type PhysicsModifiers,
  type GameConfig,
  MatchPhase,
  BinaryProtocol
} from '@legacyx/core';

export type WorkerInMessage =
  | { type: 'START_SIMULATION'; stadiumId?: string; config?: Partial<GameConfig> }
  | { type: 'STOP_SIMULATION' }
  | { type: 'PLAYER_INPUT'; playerId: number; input: PlayerInput | number }
  | { type: 'APPLY_MODIFIERS'; modifiers: Partial<PhysicsModifiers> }
  | { type: 'FSM_COMMAND'; command: 'START_MATCH' | 'PAUSE_MATCH' | 'RESUME_MATCH' | 'RESET_KICKOFF' }
  | { type: 'ADD_PLAYER'; playerId: number; team: 'red' | 'blue' | 'spec' }
  | { type: 'REMOVE_PLAYER'; playerId: number }
  | { type: 'LOAD_STADIUM'; stadiumId: string };

export type WorkerOutMessage =
  | { type: 'READY' }
  | { type: 'SNAPSHOT'; snapshot: ArrayBuffer; tick: number; soundMask: number }
  | { type: 'EVENT'; event: string; payload: unknown };

let engine: EngineInstance | null = null;
let isRunning = false;
let nextTickTime = 0;
let loopTimer: ReturnType<typeof setTimeout> | null = null;

const TICK_INTERVAL_MS = 1000 / CORE_TICK_RATE;
const pendingInputs = new Map<number, PlayerInput>();

function setupEngineEvents(eng: EngineInstance): void {
  eng.on('goal', (payload) => {
    self.postMessage({ type: 'EVENT', event: 'goal', payload });
  });

  eng.on('match_end', (payload) => {
    self.postMessage({ type: 'EVENT', event: 'match_end', payload });
  });

  eng.on('state_change', (payload) => {
    self.postMessage({ type: 'EVENT', event: 'state_change', payload });
  });

  eng.on('kick', (payload) => {
    self.postMessage({ type: 'EVENT', event: 'kick', payload: { kickerId: payload.player?.id } });
  });

  eng.on('post_hit', (payload) => {
    self.postMessage({ type: 'EVENT', event: 'post_hit', payload });
  });
}

function runPhysicsTick(): void {
  if (!isRunning || !engine) return;

  // 1. Ejecutar tick secuencial determinista a 60 Hz
  engine.step(pendingInputs);

  // 2. Extraer snapshot binario compacto
  const snapshotBuffer = engine.getSnapshot();
  const tickNumber = engine.currentTick;
  const soundMask = engine.soundMask;

  // 3. Transferencia de memoria Zero-Copy mediante Transferable Objects
  (self as any).postMessage(
    {
      type: 'SNAPSHOT',
      snapshot: snapshotBuffer,
      tick: tickNumber,
      soundMask
    },
    [snapshotBuffer]
  );

  // 4. Programación de alta precisión con compensación de deriva temporal
  nextTickTime += TICK_INTERVAL_MS;
  const now = performance.now();
  if (now - nextTickTime > 100) {
    nextTickTime = now;
  }
  const delay = Math.max(0, nextTickTime - now);
  loopTimer = setTimeout(runPhysicsTick, delay);
}

function startLoop(): void {
  if (isRunning) return;
  isRunning = true;
  nextTickTime = performance.now();
  runPhysicsTick();
}

function stopLoop(): void {
  isRunning = false;
  if (loopTimer !== null) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'START_SIMULATION': {
      stopLoop();
      engine = new EngineInstance(msg.stadiumId, msg.config);
      setupEngineEvents(engine);
      pendingInputs.clear();
      startLoop();
      self.postMessage({ type: 'READY' });
      break;
    }

    case 'STOP_SIMULATION': {
      stopLoop();
      break;
    }

    case 'PLAYER_INPUT': {
      if (typeof msg.input === 'number') {
        // Máscara compacta de 16 bits
        pendingInputs.set(msg.playerId, { inputMask: msg.input });
      } else {
        pendingInputs.set(msg.playerId, msg.input);
      }
      break;
    }

    case 'APPLY_MODIFIERS': {
      if (engine) {
        engine.applyModifiers(msg.modifiers);
      }
      break;
    }

    case 'FSM_COMMAND': {
      if (!engine) break;
      if (msg.command === 'START_MATCH') {
        engine.startMatch();
      } else if (msg.command === 'PAUSE_MATCH') {
        engine.fsm.pause();
      } else if (msg.command === 'RESUME_MATCH') {
        engine.fsm.resume();
      } else if (msg.command === 'RESET_KICKOFF') {
        engine.resetPositions();
        engine.fsm.startMatch();
      }
      break;
    }

    case 'ADD_PLAYER': {
      if (engine) {
        engine.addPlayer(msg.playerId, msg.team);
      }
      break;
    }

    case 'REMOVE_PLAYER': {
      if (engine) {
        engine.removePlayer(msg.playerId);
        pendingInputs.delete(msg.playerId);
      }
      break;
    }

    case 'LOAD_STADIUM': {
      if (engine) {
        engine.loadStadium(msg.stadiumId);
      }
      break;
    }
  }
};
