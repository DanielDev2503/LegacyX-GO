import { WebSocket } from 'ws';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EngineInstance,
  MatchPhase,
  type PhysicsModifiers,
  DEFAULT_PHYSICS_MODIFIERS,
  type PlayerInput,
  CORE_TICK_RATE,
  CORE_DT,
  INPUT_FLAG_UP,
  INPUT_FLAG_DOWN,
  INPUT_FLAG_LEFT,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_KICK,
  INPUT_FLAG_DASH,
  INPUT_FLAG_MAGNUS_LEFT,
  INPUT_FLAG_MAGNUS_RIGHT,
  type ServerSignalMessage,
  type ClientSignalMessage
} from '@legacyx/core';

export type DedicatedPhysicsModifiers = PhysicsModifiers & {
  staminaRegenMoving?: boolean;
  staminaRegenMovingRate?: number;
};

export interface DedicatedGoalBanner {
  kind: 'GOAL';
  scoringTeam: 'red' | 'blue';
  scorerName: string | null;
  assisterName: string | null;
  isOwnGoal: boolean;
  redScore: number;
  blueScore: number;
  speedKmh?: number;
  isPower?: boolean;
  isCurve?: boolean;
}

export interface DedicatedScoreEvent {
  type: 'SCORE_EVENT';
  playerId: string;
  playerName: string;
  team: 'red' | 'blue' | 'spec';
  text: string;
  points: number;
  x: number;
  y: number;
  color?: string;
  category?: string;
}

export interface DedicatedHostConfig {
  signalingUrl: string;
  roomName: string;
  stadiumId: string;
  password?: string;
  maxPlayers: number;
  autoBalance: boolean;
  autoRestartDelayMs: number;
  modifiers: DedicatedPhysicsModifiers;
}

export const DEFAULT_DEDICATED_CONFIG: DedicatedHostConfig = {
  signalingUrl: process.env.PUBLIC_SIGNALING_URL || process.env.SIGNALING_URL || `ws://localhost:${process.env.PORT || 8080}`,
  roomName: 'LegacyX 24/7 Community VPS',
  stadiumId: 'AF 3v3',
  password: '',
  maxPlayers: 6,
  autoBalance: true,
  autoRestartDelayMs: 5000,
  modifiers: {
    ...DEFAULT_PHYSICS_MODIFIERS,
    staminaRegenMoving: false,
    staminaRegenMovingRate: 25
  }
};

export class DedicatedHost {
  public config: DedicatedHostConfig;
  public engine: EngineInstance;
  public ws: WebSocket | null = null;
  public hostPeerId: string | null = null;
  public roomId: string | null = null;
  public lastGoalBanner: DedicatedGoalBanner | null = null;
  public lastScoreEvent: DedicatedScoreEvent | null = null;
  public onGoalBanner?: (banner: DedicatedGoalBanner) => void;
  public onScoreEvent?: (event: DedicatedScoreEvent) => void;

  private isRunning: boolean = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private restartTimeout: NodeJS.Timeout | null = null;
  private peerToIdMap = new Map<string, number>();
  private nextPlayerId: number = 1;
  private pendingInputs = new Map<number, PlayerInput>();

  constructor(partialConfig?: Partial<DedicatedHostConfig>) {
    this.config = {
      ...DEFAULT_DEDICATED_CONFIG,
      ...partialConfig,
      modifiers: {
        ...DEFAULT_DEDICATED_CONFIG.modifiers,
        ...(partialConfig?.modifiers ?? {})
      }
    };

    this.engine = new EngineInstance(this.config.stadiumId, {
      stadiumId: this.config.stadiumId,
      modifiers: this.config.modifiers
    });

    this.setupEngineHooks();
  }

  private setupEngineHooks(): void {
    this.engine.on('goal', (payload: any) => {
      const details = this.engine.lastGoalDetails as any;
      const speedKmh =
        typeof payload?.speedKmh === 'number'
          ? payload.speedKmh
          : typeof details?.speedKmh === 'number'
            ? details.speedKmh
            : undefined;
      const isPower =
        typeof payload?.isPower === 'boolean'
          ? payload.isPower
          : typeof details?.isPower === 'boolean'
            ? details.isPower
            : undefined;
      const isCurve =
        typeof payload?.isCurve === 'boolean'
          ? payload.isCurve
          : typeof details?.isCurve === 'boolean'
            ? details.isCurve
            : undefined;

      const banner: DedicatedGoalBanner = {
        kind: 'GOAL',
        scoringTeam: payload.scoringTeam,
        scorerName: payload.scorerName ?? details?.scorerName ?? null,
        assisterName: payload.assisterName ?? details?.assisterName ?? null,
        isOwnGoal: Boolean(payload.isOwnGoal ?? details?.isOwnGoal),
        redScore: Number(payload.redScore ?? 0),
        blueScore: Number(payload.blueScore ?? 0),
        ...(speedKmh !== undefined ? { speedKmh } : {}),
        ...(isPower !== undefined ? { isPower } : {}),
        ...(isCurve !== undefined ? { isCurve } : {})
      };
      this.lastGoalBanner = banner;
      this.onGoalBanner?.(banner);
      console.log(
        `[DedicatedHost] ¡GOL del equipo ${String(payload.scoringTeam).toUpperCase()}! Marcador: ROJO ${payload.redScore} - ${payload.blueScore} AZUL`
      );
    });

    this.engine.on('score_event', (payload: any) => {
      const pidNum = Number(payload?.playerId);
      const fallbackName = Number.isFinite(pidNum) ? this.engine.playerNames.get(pidNum) : undefined;
      const fallbackTeam = Number.isFinite(pidNum) ? this.engine.playerTeams.get(pidNum) : undefined;
      const eventPacket: DedicatedScoreEvent = {
        type: 'SCORE_EVENT',
        playerId: String(payload?.playerId ?? ''),
        playerName:
          typeof payload?.playerName === 'string' && payload.playerName
            ? payload.playerName
            : (fallbackName ?? ''),
        team: (payload?.team ?? fallbackTeam ?? 'spec') as 'red' | 'blue' | 'spec',
        text: String(payload?.text ?? ''),
        points: Number(payload?.points ?? 0),
        x: Number(payload?.x ?? 0),
        y: Number(payload?.y ?? 0),
        ...(payload?.color !== undefined ? { color: payload.color } : {}),
        ...(payload?.category !== undefined ? { category: payload.category } : {})
      };
      this.lastScoreEvent = eventPacket;
      this.onScoreEvent?.(eventPacket);
    });

    this.engine.on('state_change', ({ newState, prevState }) => {
      console.log(`[DedicatedHost] Transición de Fase: ${MatchPhase[prevState] ?? prevState} -> ${MatchPhase[newState] ?? newState}`);

      // Al terminar el partido (STATS), programar auto-reinicio tras 5 segundos
      if (newState === MatchPhase.STATS) {
        console.log(`[DedicatedHost] Fin del partido. Reinicio automático en ${this.config.autoRestartDelayMs / 1000}s...`);
        this.scheduleAutoRestart();
      }
    });

    this.engine.on('match_end', ({ winner }) => {
      console.log(`[DedicatedHost] Partido finalizado. Ganador: ${winner ? winner.toUpperCase() : 'EMPATE'}`);
    });
  }

  private scheduleAutoRestart(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    this.restartTimeout = setTimeout(() => {
      if (!this.isRunning) return;
      console.log('[DedicatedHost] Reiniciando partido y posiciones a KICKOFF...');
      this.engine.startMatch();
      this.restartTimeout = null;
    }, this.config.autoRestartDelayMs);
  }

  /**
   * Ejecuta un paso temporal invariante (60 Hz) en el motor determinista.
   */
  public tick(): void {
    this.engine.step(this.pendingInputs);
    // Limpiar inputs transitorios (patadas, dashes)
    for (const [id, input] of this.pendingInputs.entries()) {
      const hasTransientMask =
        typeof input.inputMask === 'number' && (input.inputMask & (INPUT_FLAG_KICK | INPUT_FLAG_DASH)) !== 0;
      if (input.kick || input.dash || hasTransientMask) {
        this.pendingInputs.set(id, {
          ...input,
          kick: false,
          dash: false,
          ...(typeof input.inputMask === 'number'
            ? { inputMask: input.inputMask & ~(INPUT_FLAG_KICK | INPUT_FLAG_DASH) }
            : {})
        });
      }
    }
  }

  /**
   * Balancea y asigna un equipo al nuevo peer conectado
   */
  public registerPlayer(peerId: string): { id: number; team: 'red' | 'blue' } {
    let playerId = this.peerToIdMap.get(peerId);
    if (playerId !== undefined) {
      const existingTeam = this.engine.playerTeams.get(playerId) as 'red' | 'blue';
      return { id: playerId, team: existingTeam ?? 'red' };
    }

    playerId = this.nextPlayerId++;
    this.peerToIdMap.set(peerId, playerId);

    // Contar miembros por equipo para balanceo automático
    let redCount = 0;
    let blueCount = 0;
    for (const team of this.engine.playerTeams.values()) {
      if (team === 'red') redCount++;
      if (team === 'blue') blueCount++;
    }

    const assignedTeam: 'red' | 'blue' = redCount <= blueCount ? 'red' : 'blue';
    this.engine.addPlayer(playerId, assignedTeam);

    console.log(`[DedicatedHost] Jugador ${peerId} (ID: ${playerId}) asignado al equipo ${assignedTeam.toUpperCase()} (Rojo: ${assignedTeam === 'red' ? redCount + 1 : redCount}, Azul: ${assignedTeam === 'blue' ? blueCount + 1 : blueCount})`);

    // Iniciar partido si estábamos en STOP y hay al menos un jugador
    if (this.engine.fsm.state === MatchPhase.STOP) {
      console.log('[DedicatedHost] Iniciando primer partido...');
      this.engine.startMatch();
    }

    return { id: playerId, team: assignedTeam };
  }

  /**
   * Retira a un jugador cuando se desconecta
   */
  public unregisterPlayer(peerId: string): void {
    const playerId = this.peerToIdMap.get(peerId);
    if (playerId !== undefined) {
      this.engine.removePlayer(playerId);
      this.peerToIdMap.delete(peerId);
      this.pendingInputs.delete(playerId);
      console.log(`[DedicatedHost] Jugador ${peerId} (ID: ${playerId}) eliminado de la simulación.`);
    }
  }

  /**
   * Recibe y encola inputs de un jugador
   */
  public receiveInput(peerId: string, input: PlayerInput): void {
    const playerId = this.peerToIdMap.get(peerId);
    if (playerId !== undefined) {
      let normalized = input;
      if (input.inputMask === undefined) {
        let mask = 0;
        if ((input.dirX ?? 0) < -0.3) mask |= INPUT_FLAG_LEFT;
        if ((input.dirX ?? 0) > 0.3) mask |= INPUT_FLAG_RIGHT;
        if ((input.dirY ?? 0) < -0.3) mask |= INPUT_FLAG_UP;
        if ((input.dirY ?? 0) > 0.3) mask |= INPUT_FLAG_DOWN;
        if (input.kick) mask |= INPUT_FLAG_KICK;
        if (input.dash) mask |= INPUT_FLAG_DASH;
        if (input.magnusLeft) mask |= INPUT_FLAG_MAGNUS_LEFT;
        if (input.magnusRight) mask |= INPUT_FLAG_MAGNUS_RIGHT;
        normalized = { ...input, inputMask: mask };
      }
      this.pendingInputs.set(playerId, normalized);
    }
  }

  /**
   * Conecta al servidor de señalización e inicia el bucle a 60 Hz
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[DedicatedHost] Arrancando sala dedicada "${this.config.roomName}" (${this.config.stadiumId}) a ${CORE_TICK_RATE} Hz...`);

    // Iniciar bucle físico a 60 Hz exactos
    const tickIntervalMs = 1000 / CORE_TICK_RATE;
    this.tickInterval = setInterval(() => {
      this.tick();
    }, tickIntervalMs);

    // Conectar a señalización si se configuró una URL
    if (this.config.signalingUrl) {
      this.connectSignaling();
    }
  }

  private connectSignaling(): void {
    try {
      console.log(`[DedicatedHost] Conectando al servidor de señalización: ${this.config.signalingUrl}`);
      this.ws = new WebSocket(this.config.signalingUrl);

      this.ws.on('open', () => {
        console.log('[DedicatedHost] Conexión establecida con el servidor de señalización.');
      });

      this.ws.on('message', (data: Buffer | string) => {
        let msg: ServerSignalMessage | Record<string, any>;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        switch ((msg as any).type) {
          case 'WELCOME': {
            this.hostPeerId = (msg as any).peerId;
            console.log(`[DedicatedHost] Asignado PeerID de anfitrión: ${this.hostPeerId}`);

            // Crear sala dedicada en el registro público
            const createMsg: ClientSignalMessage = {
              type: 'ROOM_CREATE',
              name: this.config.roomName,
              stadiumId: this.config.stadiumId,
              password: this.config.password || undefined,
              maxPlayers: this.config.maxPlayers,
              isDedicated: true
            };
            this.ws?.send(JSON.stringify(createMsg));
            break;
          }

          case 'ROOM_CREATED': {
            this.roomId = (msg as any).roomId;
            console.log(`[DedicatedHost] ¡SALA DEDICADA REGISTRADA EXITOSAMENTE! ID: ${this.roomId}`);
            break;
          }

          case 'PING_PROBE': {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(
                JSON.stringify({
                  type: 'PONG_PROBE',
                  roomId: (msg as any).roomId ?? this.roomId,
                  requesterId: (msg as any).requesterId,
                  clientSentAt: (msg as any).clientSentAt,
                  probeId: (msg as any).probeId
                })
              );
            }
            break;
          }

          case 'PEER_JOINED': {
            this.registerPlayer((msg as any).peerId);
            break;
          }

          case 'PEER_DISCONNECT': {
            this.unregisterPlayer((msg as any).peerId);
            break;
          }

          default:
            break;
        }
      });

      this.ws.on('close', () => {
        console.warn('[DedicatedHost] Desconectado del servidor de señalización.');
        // Reintento de reconexión si el runner sigue activo
        if (this.isRunning) {
          setTimeout(() => {
            if (this.isRunning) this.connectSignaling();
          }, 3000);
        }
      });

      this.ws.on('error', (err) => {
        console.warn('[DedicatedHost] Error en socket de señalización:', err.message);
      });
    } catch (err: any) {
      console.error('[DedicatedHost] Fallo al iniciar conexión WebSocket:', err.message);
    }
  }

  /**
   * Detiene el bucle de simulación y cierra conexiones
   */
  public stop(): void {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.close();
      } catch {
        // Ignorar
      }
      this.ws = null;
    }
    console.log('[DedicatedHost] Servidor dedicado detenido.');
  }

  public getStats() {
    return {
      ticks: this.engine.currentTick,
      phase: this.engine.fsm.state,
      redScore: this.engine.fsm.redScore,
      blueScore: this.engine.fsm.blueScore,
      playersCount: this.engine.players.size,
      roomId: this.roomId,
      hostPeerId: this.hostPeerId
    };
  }
}

// ==========================================
// CLI Entrypoint
// ==========================================
function parseCliArgs(): Partial<DedicatedHostConfig> {
  const args = process.argv.slice(2);
  const result: Partial<DedicatedHostConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' && i + 1 < args.length) {
      const configPath = path.resolve(process.cwd(), args[++i]);
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf-8');
          const parsed = JSON.parse(raw);
          Object.assign(result, parsed);
          console.log(`[DedicatedHost] Configuración cargada desde ${configPath}`);
        } catch (e: any) {
          console.error(`[DedicatedHost] Error al leer archivo de configuración ${configPath}:`, e.message);
        }
      }
    } else if (arg === '--name' && i + 1 < args.length) {
      result.roomName = args[++i];
    } else if (arg === '--stadium' && i + 1 < args.length) {
      result.stadiumId = args[++i];
    } else if (arg === '--password' && i + 1 < args.length) {
      result.password = args[++i];
    } else if (arg === '--max-players' && i + 1 < args.length) {
      result.maxPlayers = parseInt(args[++i], 10);
    } else if (arg === '--signaling' && i + 1 < args.length) {
      result.signalingUrl = args[++i];
    }
  }

  return result;
}

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('DedicatedHost.ts') || 
  process.argv[1].endsWith('DedicatedHost.js')
);

if (isDirectExecution) {
  const cliConfig = parseCliArgs();
  const host = new DedicatedHost(cliConfig);

  const shutdown = () => {
    console.log('\n[DedicatedHost] Señal de terminación recibida. Cerrando limpiamente...');
    host.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  host.start().catch((err) => {
    console.error('[DedicatedHost] Error crítico al arrancar host dedicado:', err);
    process.exit(1);
  });
}
