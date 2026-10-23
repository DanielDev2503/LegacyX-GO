import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/GameEngine';
import { Player } from '../src/game/Player';
import { MatchPhase } from '../src/game/GameFSM';

describe('Match Finite State Machine (GameFSM) - 3-Phase Model', () => {
  it('manages match lifecycle: STOPPED -> COUNTDOWN (3s) -> PLAYING, PAUSED and STOPPED reset', () => {
    const engine = new GameEngine({ scoreLimit: 1, timeLimitSeconds: 180 });
    const p1 = new Player({ id: 'p1', name: 'Alice', team: 'red' });
    const p2 = new Player({ id: 'p2', name: 'Bob', team: 'blue' });
    engine.addPlayer(p1);
    engine.addPlayer(p2);

    // Initial state: STOPPED
    expect(engine.fsm.currentState).toBe(MatchPhase.STOPPED);

    // Start match: enters COUNTDOWN
    engine.startMatch();
    expect(engine.fsm.currentState).toBe(MatchPhase.COUNTDOWN);
    expect(engine.fsm.countdownSeconds).toBe(3);

    // During countdown, physics does NOT step
    const inputs = new Map<string, number>();
    for (let i = 0; i < 60; i++) {
      engine.tick(inputs);
    }
    expect(engine.fsm.currentState).toBe(MatchPhase.COUNTDOWN);
    expect(engine.fsm.countdownSeconds).toBe(2);

    // Advance remaining 120 ticks
    for (let i = 0; i < 120; i++) {
      engine.tick(inputs);
    }
    expect(engine.fsm.currentState).toBe(MatchPhase.PLAYING);

    // Test PAUSE: physics freezes, positions and velocities preserved
    engine.ball.pos.set(50, 10);
    engine.ball.vel.set(100, -50);
    engine.togglePause();
    expect(engine.fsm.currentState).toBe(MatchPhase.PAUSED);

    // Advance ticks while paused: nothing moves
    engine.tick(inputs);
    expect(engine.ball.pos.x).toBe(50);
    expect(engine.ball.pos.y).toBe(10);
    expect(engine.ball.vel.x).toBe(100);
    expect(engine.ball.vel.y).toBe(-50);

    // Resume from pause: enters COUNTDOWN (3s) before physics resumes
    engine.togglePause();
    expect(engine.fsm.currentState).toBe(MatchPhase.COUNTDOWN);
    expect(engine.fsm.countdownSeconds).toBe(3);
    expect(engine.ball.vel.x).toBe(100); // Velocities still preserved!

    // Advance countdown to PLAYING
    for (let i = 0; i < 180; i++) {
      engine.tick(inputs);
    }
    expect(engine.fsm.currentState).toBe(MatchPhase.PLAYING);

    // Test STOP: resets time to 0, score to 0 - 0, ball to center (0, 0)
    engine.redScore = 2;
    engine.blueScore = 1;
    engine.stopMatch();
    expect(engine.fsm.currentState).toBe(MatchPhase.STOPPED);
    expect(engine.matchTimerSeconds).toBe(0);
    expect(engine.redScore).toBe(0);
    expect(engine.blueScore).toBe(0);
    expect(engine.ball.pos.x).toBe(0);
    expect(engine.ball.pos.y).toBe(0);
  });

  it('places players at kickoff spawn distance in STOP/KICKOFF and on goal line during live PLAYING', () => {
    const engine = new GameEngine();
    const p1 = new Player({ id: 'p1', name: 'Alice', team: 'spec' });
    engine.addPlayer(p1);

    // In STOP state (not live): should spawn at standard kickoff spawn distance
    engine.setPlayerTeam('p1', 'red');
    const redDisc = engine.playerDiscs.get('p1');
    expect(redDisc).toBeDefined();
    expect(redDisc!.pos.x).toBe(-engine.stadium.spawnDistance);
    expect(redDisc!.pos.y).toBe(0);
    expect(redDisc!.vel.x).toBe(0);
    expect(redDisc!.vel.y).toBe(0);

    // Start match and enter active live play (PLAYING, kickoff resolved)
    engine.startMatch();
    engine.fsm.currentState = MatchPhase.PLAYING;
    engine.kickoffState.active = false;

    // A spectator player2 joins Red mid-game: should spawn on red goal line
    const p2 = new Player({ id: 'p2', name: 'Bob', team: 'spec' });
    engine.addPlayer(p2);
    engine.setPlayerTeam('p2', 'red');
    const liveRed = engine.playerDiscs.get('p2');
    expect(liveRed).toBeDefined();
    expect(liveRed!.pos.x).toBeCloseTo(-engine.stadium.halfWidth + liveRed!.radius + 2, 0);
    expect(liveRed!.pos.y).toBe(0);
    expect(liveRed!.vel.x).toBe(0);
    expect(liveRed!.vel.y).toBe(0);

    // Player 1 changes team to blue during live match: should place on blue goal line
    engine.setPlayerTeam('p1', 'blue');
    const blueDisc = engine.playerDiscs.get('p1');
    expect(blueDisc).toBeDefined();
    expect(blueDisc!.pos.x).toBeCloseTo(engine.stadium.halfWidth - blueDisc!.radius - 2, 0);
    expect(blueDisc!.pos.y).toBe(0);
    expect(blueDisc!.vel.x).toBe(0);
    expect(blueDisc!.vel.y).toBe(0);
  });
});


