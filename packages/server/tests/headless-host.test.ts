import { describe, it, expect } from 'vitest';
import { DedicatedHost } from '../src/headless/DedicatedHost.js';
import { MatchPhase } from '@legacyx/core';

describe('DedicatedHost - Headless VPS Smoke Test', () => {
  it('debe ejecutar 120 ticks físicos (2.0 segundos canónicos a 60 Hz) sin entorno DOM, balanceando equipos e integrando física determinista', () => {
    // 1. Instanciar host dedicado en memoria sin URL de señalización remota
    const host = new DedicatedHost({
      roomName: 'VPS Headless Test Arena',
      stadiumId: 'AF 3v3',
      signalingUrl: '', // Modo en memoria sin socket externo para el test de ticks
      autoBalance: true,
      autoRestartDelayMs: 200 // Rápido para test
    });

    expect(host.engine).toBeDefined();
    expect(host.engine.stadium).toBeDefined();

    // 2. Registrar jugadores y certificar balanceo automático Rojo / Azul
    const p1 = host.registerPlayer('peer-alpha');
    const p2 = host.registerPlayer('peer-bravo');

    expect(p1.team).toBe('red');
    expect(p2.team).toBe('blue');
    expect(host.engine.players.size).toBe(2);

    // Al haber entrado jugadores, el partido arranca en KICKOFF
    expect(host.engine.fsm.state).toBe(MatchPhase.KICKOFF);

    // 3. Encolar inputs simulados para los jugadores
    host.receiveInput('peer-alpha', {
      sequence: 1,
      dirX: 1,
      dirY: 0,
      kick: false,
      dash: false
    });

    host.receiveInput('peer-bravo', {
      sequence: 1,
      dirX: -1,
      dirY: 0,
      kick: false,
      dash: false
    });

    // 4. Ejecutar 120 ticks físicos consecutivos (2.0s de simulación a 60 Hz)
    const initialBallX = host.engine.ball.pos.x;
    const initialPlayer1X = host.engine.players.get(p1.id)!.pos.x;

    for (let tick = 0; tick < 120; tick++) {
      // En el tick 30, forzamos un kick de prueba sobre el balón
      if (tick === 30) {
        host.engine.ball.vel.x = 250; // Chut hacia portería azul
      }
      host.tick();
    }

    const stats = host.getStats();
    expect(stats.ticks).toBe(120);

    // 5. Verificar que la física evolucionó de forma determinista y sin fallos
    const p1Disc = host.engine.players.get(p1.id);
    expect(p1Disc).toBeDefined();
    // Player 1 aceleró hacia la derecha (dirX: 1)
    expect(p1Disc!.pos.x).toBeGreaterThan(initialPlayer1X);

    // El balón se desplazó con la velocidad aplicada
    expect(host.engine.ball.pos.x).not.toBe(initialBallX);

    // 6. Retirar a un jugador y verificar limpieza
    host.unregisterPlayer('peer-alpha');
    expect(host.engine.players.size).toBe(1);
    expect(host.engine.playerTeams.has(p1.id)).toBe(false);

    // 7. Cierre limpio
    host.stop();
  });

  it('debe iniciar el bucle temporizado autónomo de 60 Hz mediante start() y detenerse limpiamente con stop()', async () => {
    const host = new DedicatedHost({
      roomName: 'Autonomous Ticker Test',
      signalingUrl: ''
    });

    await host.start();

    // Esperar 250 ms (al menos varios ticks a 60 Hz)
    await new Promise((r) => setTimeout(r, 250));

    const stats = host.getStats();
    expect(stats.ticks).toBeGreaterThanOrEqual(5);

    host.stop();
    const ticksAfterStop = host.getStats().ticks;

    // Verificar que el temporizador se detuvo
    await new Promise((r) => setTimeout(r, 100));
    expect(host.getStats().ticks).toBe(ticksAfterStop);
  });
});
