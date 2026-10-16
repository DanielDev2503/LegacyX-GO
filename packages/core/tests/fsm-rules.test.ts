import { describe, it, expect } from 'vitest';
import { EngineInstance, MatchPhase } from '../src/index';
import { PlayerInput, INPUT_FLAG_KICK, INPUT_FLAG_RIGHT } from '../src/protocol/BinaryProtocol';

describe('FSM Rules and Match Transitions', () => {
  it('transitions from PLAYING to GOAL on goal line crossing, freezes inputs and resets to KICKOFF after 180 ticks', () => {
    const engine = new EngineInstance('AF 3v3');
    const p1 = engine.addPlayer(1, 'red');
    const p2 = engine.addPlayer(2, 'blue');

    engine.startMatch();
    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);

    // 1. Toque inicial para comenzar el juego activo (PLAYING)
    // Ubicar al jugador 1 en posición de patada hacia el balón
    p1.pos.set(-18, 0);
    const kickInputs = new Map<number, PlayerInput>();
    kickInputs.set(1, {
      sequence: 1,
      inputMask: INPUT_FLAG_KICK | INPUT_FLAG_RIGHT,
      clientTimestamp: 16
    });

    engine.step(kickInputs);
    expect(engine.fsm.state).toBe(MatchPhase.PLAYING);
    expect(engine.ball.vel.x).toBeGreaterThan(0);

    // 2. Colocar el balón a las puertas del arco derecho (Azul, x = 420) viajando a gran velocidad
    engine.ball.pos.set(415, 0);
    engine.ball.vel.set(600, 0);

    const emptyInputs = new Map<number, PlayerInput>();

    // Avanzar ticks hasta que cruce la línea de gol
    let goalDetected = false;
    for (let t = 0; t < 10; t++) {
      engine.step(emptyInputs);
      if (engine.fsm.state === MatchPhase.GOAL) {
        goalDetected = true;
        break;
      }
    }

    expect(goalDetected).toBe(true);
    expect(engine.fsm.state).toBe(MatchPhase.GOAL);
    expect(engine.fsm.redScore).toBe(1);
    expect(engine.fsm.blueScore).toBe(0);

    // 3. Durante el estado GOAL, las entradas de los jugadores deben estar congeladas
    const p1OldX = p1.pos.x;
    const movingInputs = new Map<number, PlayerInput>();
    movingInputs.set(1, {
      sequence: 99,
      inputMask: INPUT_FLAG_RIGHT,
      clientTimestamp: 999
    });

    engine.step(movingInputs);
    // En GOAL, los jugadores no deben avanzar con inputs
    expect(p1.pos.x).toBe(p1OldX);

    // 4. Tras los 180 ticks de celebración canónicos (3.0s a 60 Hz), transiciona a KICKOFF y resetea posiciones
    // Ya consumimos 1 tick en el paso anterior, restan 179
    const remainingTicks = engine.fsm.stateTicksRemaining;
    for (let t = 0; t < remainingTicks; t++) {
      engine.step(emptyInputs);
    }

    expect(engine.fsm.state).toBe(MatchPhase.KICKOFF);
    // Verificación de reseteo de posiciones
    expect(engine.ball.pos.x).toBe(0);
    expect(engine.ball.pos.y).toBe(0);
    expect(engine.ball.vel.x).toBe(0);
    expect(engine.ball.vel.y).toBe(0);

    // Jugadores de vuelta a sus posiciones de spawn
    expect(p1.pos.x).toBe(-engine.stadium.spawnDistance);
    expect(p2.pos.x).toBe(engine.stadium.spawnDistance);
  });
});
