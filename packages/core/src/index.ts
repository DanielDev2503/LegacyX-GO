import { Vec2 } from './math/Vec2';
import { clamp, lerp, closestPointOnSegment, quantizeCoord, dequantizeCoord, normalizeAngle } from './math/MathUtils';
import {
  Disc,
  DiscOptions,
  COLLISION_GROUP_BALL,
  COLLISION_GROUP_RED,
  COLLISION_GROUP_BLUE,
  COLLISION_GROUP_WALL,
  COLLISION_GROUP_RED_GOAL,
  COLLISION_GROUP_BLUE_GOAL,
  COLLISION_GROUP_ALL,
  POWER_SHOT_SPEED_THRESHOLD
} from './entities/Disc';
import { Segment, SegmentOptions } from './entities/Segment';
import { Plane, PlaneOptions } from './entities/Plane';
import {
  PhysicsWorld,
  PhysicsWorldConfig
} from './physics/PhysicsWorld';
import {
  resolveDiscDiscCollision,
  resolveDiscSegmentCollision,
  resolveGoalAndPitchBoundaries,
  resolvePredictivePlayerCollision,
  resolvePredictiveBallCollision,
  sweptCircleCircle,
  CollisionEvent,
  KickoffPhysicsContext,
  StadiumBoundariesConfig
} from './physics/ContinuousCollision';
import { PhysicsTicker } from './physics/PhysicsTicker';
import { GoalNet, GoalNetOptions, NetBall } from './physics/GoalNet';
import { Stadium, StadiumOptions, GoalDefinition, StadiumBallPhysics, StadiumPlayerPhysics } from './stadiums/Stadium';
import {
  StadiumId,
  StadiumPreset,
  STADIUM_PRESETS,
  StadiumRegistry,
  DEFAULT_STADIUM_ID,
  createStadium
} from './stadiums/StadiumRegistry';
import { GameFSM, MatchPhase, MatchState } from './fsm/GameFSM';
import {
  GameFSM as GameMatchFSM,
  MatchPhase as GameMatchPhase,
  MatchState as GameMatchState,
  toMatchPhase
} from './game/GameFSM';
import {
  Player,
  PlayerData,
  TeamType,
  getDashStaminaCost,
  DASH_STAMINA_COST,
  DASH_TICKS,
  DEFAULT_DASH_DISTANCE,
  INPUT_UP,
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_KICK,
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MAGNUS_LEFT,
  INPUT_MAGNUS_RIGHT,
  INPUT_TYPING
} from './game/Player';
import {
  GameSnapshot,
  DiscSnapshot,
  TouchHistoryEntry,
  PlayerMatchStats,
  GoalInfo,
  KickoffState,
  MatchConfig
} from './game/GameState';
import { GameEngine } from './game/GameEngine';
import {
  BinaryProtocol,
  PlayerInput,
  CompactDiscState,
  GameStateSnapshot,
  EventType,
  SoundEvent,
  OP_INPUT,
  OP_SNAPSHOT,
  OP_CHAT,
  OP_EVENT,
  OP_PING,
  OP_PONG,
  OP_KEEPALIVE,
  SOUND_KICK,
  SOUND_POST_HIT,
  SOUND_GOAL,
  INPUT_FLAG_UP,
  INPUT_FLAG_DOWN,
  INPUT_FLAG_LEFT,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_KICK,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH,
  INPUT_FLAG_MAGNUS_LEFT,
  INPUT_FLAG_MAGNUS_RIGHT,
  INPUT_FLAG_TYPING
} from './protocol/BinaryProtocol';
import { InputPacket, InputData } from './protocol/InputPacket';
import { SnapshotPacket, ActiveRadiusConfig } from './protocol/SnapshotPacket';
import {
  PhysicsModifiers,
  DEFAULT_PHYSICS_MODIFIERS,
  GameConfig,
  DEFAULT_GAME_CONFIG,
  GameplayConfig,
  DEFAULT_GAMEPLAY_CONFIG,
  GAMEPLAY_CONFIG_LIMITS,
  ConfigLimits,
  sanitizeGameplayConfig,
  defaultStadium
} from './game/GameConfig';

export type * from './protocol/Signaling';
export type * from './protocol/ControlMessages';
export { JitterBuffer, hermite, type BufferedSnapshot, type AnySnapshot, type InterpolationMode } from './protocol/JitterBuffer';

export const CORE_TICK_RATE = 60;
export const CORE_DT = 1 / 60;

export function createClassicStadium(): Stadium {
  return createStadium('classic');
}

export function pingCore(): string {
  return "LegacyX Core Engine ready (60 Hz tick-rate)";
}

export type GameEvent = 'goal' | 'kick' | 'post_hit' | 'state_change' | 'match_end';

export class EngineInstance {
  public world: PhysicsWorld;
  public fsm: GameFSM;
  public stadium: Stadium;
  public ball: Disc;
  public players: Map<number, Disc> = new Map();
  public playerTeams: Map<number, 'red' | 'blue' | 'spec'> = new Map();
  public playerNames: Map<number, string> = new Map();
  public matchStats: Map<number, PlayerMatchStats> = new Map();
  private touchHistory: Array<{ playerId: number; team: 'red' | 'blue'; tick: number; isKick: boolean }> = [];
  public modifiers: PhysicsModifiers;
  public currentTick: number = 0;
  public soundMask: number = 0;
  public kickoffPossessingTeam: 'red' | 'blue' = 'red';

  private eventListeners: Map<string, Array<(payload: any) => void>> = new Map();

  constructor(stadiumIdOrStadium?: string | Stadium, config?: Partial<GameConfig>) {
    this.modifiers = { ...DEFAULT_PHYSICS_MODIFIERS, ...(config?.modifiers ?? {}) };
    if (typeof stadiumIdOrStadium === 'object' && stadiumIdOrStadium !== null) {
      this.stadium = stadiumIdOrStadium;
    } else {
      const selectedStadium = stadiumIdOrStadium ?? config?.stadiumId ?? DEFAULT_STADIUM_ID;
      this.stadium = createStadium(selectedStadium);
    }

    this.world = new PhysicsWorld({
      fixedDt: CORE_DT,
      maxSubsteps: 10,
      kickMargin: (this.modifiers as any).kickMargin ?? 4.0,
      magnusCoefficient: 0
    });

    this.fsm = new GameFSM({
      goalCelebrationTicks: Math.round(this.modifiers.goalCelebrationDuration * 60),
      matchTimeMinutes: this.modifiers.matchTimeMinutes,
      scoreLimit: this.modifiers.goalLimit,
      goldenGoal: this.modifiers.goldenGoalOvertime
    });

    this.ball = new Disc({
      id: 0,
      x: 0,
      y: 0,
      radius: this.modifiers.ballRadius,
      mass: this.modifiers.ballMass,
      damping: (this.modifiers as any).ballFriction ?? this.modifiers.pitchFriction ?? 0.99,
      bounciness: (this.modifiers as any).ballRestitution ?? 0.412,
      cGroup: COLLISION_GROUP_BALL,
      cMask: COLLISION_GROUP_ALL,
      isBall: true,
      color: '#ffffff'
    });

    this.world.addDisc(this.ball);
    this.world.loadStadium(this.stadium);

    this.world.onCollision = (e) => {
      if (e.type === 'disc-disc') {
        if (e.discA.isBall || e.discB?.isBall) {
          const other = e.discA.isBall ? e.discB : e.discA;
          if (other && other.id !== this.ball.lastKickerDiscId) {
            this.ball.resetCurve();
          }
          if (other?.isPost) {
            this.soundMask |= SOUND_POST_HIT;
            this.emit('post_hit', { ball: this.ball, post: other });
          } else if (other && !other.isBall) {
            this.recordTouch(other.id, false);
            if (this.fsm.state === MatchPhase.KICKOFF) {
              this.fsm.startPlaying();
            }
          }
        }
      } else if (e.type === 'disc-segment' && e.discA.isBall) {
        this.ball.resetCurve();
      }
    };

    this.fsm.onGoalScored = (team, redScore, blueScore) => {
      this.soundMask |= SOUND_GOAL;
      this.emit('goal', { scoringTeam: team, redScore, blueScore });
    };

    this.fsm.onStateChange = (newState, prevState) => {
      if (newState === MatchPhase.KICKOFF && prevState === MatchPhase.GOAL) {
        this.resetPositions();
      }
      this.emit('state_change', { newState, prevState });
    };

    this.fsm.onMatchEnd = (winner) => {
      this.emit('match_end', {
        winner,
        stats: this.getMatchStats(),
        mvp: this.getMVP()
      });
    };
  }

  public on<E extends GameEvent>(event: E, callback: (payload: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  private emit(event: string, payload: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i](payload);
      }
    }
  }

  public addPlayer(id: number, team: 'red' | 'blue' | 'spec'): Disc {
    const isRed = team === 'red';
    const spawnX = isRed ? -this.stadium.spawnDistance : this.stadium.spawnDistance;
    const playerDisc = new Disc({
      id,
      x: spawnX,
      y: 0,
      radius: this.modifiers.playerRadius,
      mass: this.modifiers.playerMass,
      damping: (this.modifiers as any).playerFriction ?? 0.96,
      bounciness: 0.50,
      cGroup: isRed ? COLLISION_GROUP_RED : COLLISION_GROUP_BLUE,
      cMask: COLLISION_GROUP_ALL,
      isBall: false,
      color: isRed ? '#e74c3c' : '#3498db'
    });

    this.players.set(id, playerDisc);
    this.playerTeams.set(id, team);
    this.world.addDisc(playerDisc);
    return playerDisc;
  }

  public removePlayer(id: number): void {
    const player = this.players.get(id);
    if (player) {
      this.world.removeDisc(player);
      this.players.delete(id);
      this.playerTeams.delete(id);
    }
  }

  public setPlayerTeam(id: number, team: 'red' | 'blue' | 'spec' | 'spectator'): void {
    if (team === 'spec' || team === 'spectator') {
      this.removePlayer(id);
      return;
    }
    const isRed = team === 'red';
    let player = this.players.get(id);
    const prevTeam = this.playerTeams.get(id);
    const teamChanged = prevTeam !== team;

    if (player) {
      this.playerTeams.set(id, team);
      player.cGroup = isRed ? COLLISION_GROUP_RED : COLLISION_GROUP_BLUE;
      player.color = isRed ? '#e74c3c' : '#3498db';
      if (!teamChanged) {
        return;
      }
    } else {
      player = this.addPlayer(id, team);
    }

    // Spawn en línea de meta estrictamente cuando el partido está en juego activo (PLAYING)
    const isMatchLive = this.fsm.state === MatchPhase.PLAYING;

    if (isMatchLive) {
      const goalLineX = isRed
        ? -this.stadium.halfWidth + player.radius + 2
        : this.stadium.halfWidth - player.radius - 2;
      let goalY = 0;
      const maxOffset = this.stadium.goalHalfHeight ? this.stadium.goalHalfHeight * 0.8 : 40;
      for (const [otherId, otherPlayer] of this.players.entries()) {
        if (otherId !== id && Math.hypot(otherPlayer.pos.x - goalLineX, otherPlayer.pos.y - goalY) < otherPlayer.radius * 2) {
          goalY = goalY === 0 ? 25 : (goalY > 0 ? -goalY : Math.min(maxOffset, Math.abs(goalY) + 25));
        }
      }
      player.pos.set(goalLineX, goalY);
      player.prevPos.set(goalLineX, goalY);
      player.vel.set(0, 0);
      player.stamina = 100;
    } else {
      // Posición estándar canónica de saque inicial junto a sus compañeros
      const spawnDist = this.stadium.spawnDistance ?? 250;
      const spawnX = isRed ? -spawnDist : spawnDist;
      let spawnY = 0;
      for (const [otherId, otherPlayer] of this.players.entries()) {
        if (otherId !== id && this.playerTeams.get(otherId) === team) {
          if (Math.hypot(otherPlayer.pos.x - spawnX, otherPlayer.pos.y - spawnY) < otherPlayer.radius * 2) {
            spawnY = spawnY === 0 ? 30 : (spawnY > 0 ? -spawnY : Math.abs(spawnY) + 30);
          }
        }
      }
      player.pos.set(spawnX, spawnY);
      player.prevPos.set(spawnX, spawnY);
      player.vel.set(0, 0);
      player.stamina = 100;
    }
  }

  public resetPositions(): void {
    this.ball.pos.set(0, 0);
    this.ball.prevPos.set(0, 0);
    this.ball.vel.set(0, 0);
    this.ball.resetCurve();

    let redIndex = 0;
    let blueIndex = 0;

    for (const [id, player] of this.players.entries()) {
      const team = this.playerTeams.get(id);
      if (team !== 'red' && team !== 'blue') continue;
      const isRed = team === 'red';
      const spawnDist = this.stadium.spawnDistance ?? 250;
      const spawnX = isRed ? -spawnDist : spawnDist;
      const offset = (isRed ? redIndex : blueIndex) * 40 - 20 * (isRed ? redIndex : blueIndex);
      player.pos.set(spawnX, offset);
      player.prevPos.set(spawnX, offset);
      player.vel.set(0, 0);
      player.stamina = 100;
      if (isRed) redIndex++; else blueIndex++;
    }

    this.world.resetNets(false);
  }

  public startMatch(): void {
    this.kickoffPossessingTeam = 'red';
    this.resetPositions();
    this.resetMatchStats();
    this.fsm.startMatch();
  }

  public stopMatch(): void {
    this.resetPositions();
    this.resetMatchStats();
    this.fsm.stopMatch();
  }

  public pauseMatch(): void {
    this.fsm.pauseMatch();
  }

  public resumeMatch(): void {
    this.fsm.resumeMatch();
  }

  public togglePause(): void {
    this.fsm.togglePause();
  }

  public step(inputs: Map<number, PlayerInput>, isReplay: boolean = false): void {
    this.soundMask = 0;
    const isGameActive = this.fsm.state === MatchPhase.PLAYING || this.fsm.state === MatchPhase.KICKOFF;

    if (isGameActive) {
      const baseKickCfg = (this.modifiers as any).kickStrength !== undefined
        ? ((this.modifiers as any).kickStrength / 4.545) * 450.0
        : (this.modifiers.baseKickStrength ?? 450.0);
      const rechargePerTick = ((this.modifiers as any).staminaRechargeRate ?? 20.0) / 60;

      for (const [id, player] of this.players.entries()) {
        const input = inputs.get(id);

        if (input) {
          let ix = input.dirX ?? 0;
          let iy = input.dirY ?? 0;

          if (input.inputMask) {
            if (input.inputMask & INPUT_FLAG_LEFT) ix -= 1;
            if (input.inputMask & INPUT_FLAG_RIGHT) ix += 1;
            if (input.inputMask & INPUT_FLAG_UP) iy -= 1;
            if (input.inputMask & INPUT_FLAG_DOWN) iy += 1;
          }

          const inputLen = Math.hypot(ix, iy);
          if (inputLen > 1.0) {
            ix /= inputLen;
            iy /= inputLen;
          }

          const isKickRequested = Boolean(input.kick || (input.inputMask && (input.inputMask & INPUT_FLAG_KICK)));
          player.kicking = isKickRequested;
          player.isTyping = Boolean(input.inputMask && (input.inputMask & INPUT_FLAG_TYPING));

          const accelBase = (this.modifiers as any).playerAcceleration !== undefined
            ? ((this.modifiers as any).playerAcceleration / 0.11) * 2.4
            : 2.4;
          const canTurbo = (this.modifiers as any).turboEnabled !== false;
          const isTurboRequested = canTurbo && Boolean(input.inputMask && (input.inputMask & INPUT_FLAG_TURBO));
          const turboMultiplier = (this.modifiers as any).boostMultiplier ?? (this.modifiers as any).turboMultiplier ?? 2.0;
          let accel = isKickRequested ? accelBase * (0.083 / 0.11) : accelBase;

          if (isTurboRequested && inputLen > 0.1 && player.stamina > 0) {
            accel *= Math.max(1.8, turboMultiplier * 1.2);
            player.stamina = Math.max(0, player.stamina - 0.6); // Gasto continuo de estamina
            player.isTurbo = true;
          } else {
            player.isTurbo = false;
          }

          player.vel.x += ix * accel;
          player.vel.y += iy * accel;

          const pMaxSpeedCfg = (this.modifiers as any).playerMaxSpeed ?? (this.modifiers as any).playerSpeed ?? 2.8;
          const maxSpeedBase = (pMaxSpeedCfg / 2.8) * 168.0;
          const currentMaxSpeed = player.isTurbo ? maxSpeedBase * turboMultiplier : maxSpeedBase;
          const curSpeed = player.vel.len();
          if (curSpeed > currentMaxSpeed) {
            player.vel.x = (player.vel.x / curSpeed) * currentMaxSpeed;
            player.vel.y = (player.vel.y / curSpeed) * currentMaxSpeed;
          }

          const canDash = (this.modifiers as any).dashEnabled !== false;
          const isDashRequested = canDash && Boolean(input.dash || (input.inputMask && (input.inputMask & INPUT_FLAG_DASH)));
          const dashesPerFullBar = (this.modifiers as any).dashesPerFullBar ?? 4;
          const dashCost = 100 / Math.max(1, Math.min(6, dashesPerFullBar));

          if (isDashRequested && !player.isDashing && player.stamina >= dashCost) {
            player.stamina = Math.max(0, player.stamina - dashCost);
            const dashDirX = inputLen > 0.1 ? ix : (curSpeed > 0.1 ? player.vel.x / curSpeed : 1);
            const dashDirY = inputLen > 0.1 ? iy : (curSpeed > 0.1 ? player.vel.y / curSpeed : 0);
            const power = (this.modifiers as any).dashDistance !== undefined
              ? ((this.modifiers as any).dashDistance / 11.3) * 280
              : (this.modifiers.dashPower ?? 280);
            player.vel.x += dashDirX * power;
            player.vel.y += dashDirY * power;
            player.isDashing = true;
          } else if (!isDashRequested) {
            player.isDashing = false;
          }

          if (inputLen === 0 && !player.isTurbo && !player.isDashing && player.stamina < 100) {
            player.stamina = Math.min(100, player.stamina + rechargePerTick);
          }

          if (isKickRequested && this.world.isWithinKickDistance(player, this.ball)) {
            const dx = this.ball.pos.x - player.pos.x;
            const dy = this.ball.pos.y - player.pos.y;
            const dist = Math.hypot(dx, dy) || 1;
            const nx = dx / dist;
            const ny = dy / dist;

            const pVelAlongKick = Math.max(0, player.vel.x * nx + player.vel.y * ny);
            let effectiveKick = baseKickCfg + pVelAlongKick * 0.35;
            if (player.isDashing) {
              effectiveKick = Math.max(effectiveKick, baseKickCfg * 1.35 + pVelAlongKick * 0.35);
            } else if (player.isTurbo) {
              effectiveKick = Math.max(effectiveKick, baseKickCfg * 1.15 + pVelAlongKick * 0.35);
            }
            const existingBallAlongKick = Math.max(0, this.ball.vel.x * nx + this.ball.vel.y * ny);

            this.ball.vel.x = nx * (effectiveKick + existingBallAlongKick * 0.25);
            this.ball.vel.y = ny * (effectiveKick + existingBallAlongKick * 0.25);

            const bSpeedAfterKick = Math.hypot(this.ball.vel.x, this.ball.vel.y);
            this.ball.isPowerShot = bSpeedAfterKick >= baseKickCfg * 1.12;

            this.ball.lastKickerDiscId = player.id;
            this.ball.lastKickerId = String(player.id);
            this.ball.magnusControllerId = String(player.id);
            this.ball.magnusPressesRemaining = 2;
            this.ball.magnusTimer = 3.0;
            this.ball.lastCurveDir = 0;
            this.ball.isCurvingAllowed = true;
            this.ball.isCurving = false;
            this.ball.curvePerp = 0;
            this.ball.spin = 0;

            this.soundMask |= SOUND_KICK;
            this.recordTouch(player.id, true);
            this.emit('kick', { player, ball: this.ball });

            if (this.fsm.state === MatchPhase.KICKOFF) {
              this.fsm.startPlaying();
            }
          }
        } else {
          player.isTurbo = false;
          player.isDashing = false;
          player.kicking = false;
          if (player.stamina < 100) {
            player.stamina = Math.min(100, player.stamina + rechargePerTick);
          }
        }

        // Si el balón entra en movimiento durante saque por contacto o patada (|v| > 0.15), liberar barrera
        if (this.fsm.state === MatchPhase.KICKOFF) {
          const ballVelSq = this.ball.vel.x * this.ball.vel.x + this.ball.vel.y * this.ball.vel.y;
          const touchDist = this.ball.radius + player.radius;
          const bdx = this.ball.pos.x - player.pos.x;
          const bdy = this.ball.pos.y - player.pos.y;
          if (ballVelSq > 0.0225 || (bdx * bdx + bdy * bdy <= touchDist * touchDist + 1.0)) {
            this.fsm.startPlaying();
          }
        }

        if (this.fsm.state === MatchPhase.KICKOFF) {
          const team = this.playerTeams.get(id);
          const centerR = this.stadium.centerRadius ?? 80;
          if (team === this.kickoffPossessingTeam) {
            this.world.enforceKickoffPossessionBarrier(player, team, centerR);
          } else if (team === 'red' || team === 'blue') {
            const r = player.radius;
            if (team === 'red') {
              if (player.pos.x > -r) {
                player.pos.x = -r;
                if (player.vel.x > 0) player.vel.x = 0;
              }
            } else if (team === 'blue') {
              if (player.pos.x < r) {
                player.pos.x = r;
                if (player.vel.x < 0) player.vel.x = 0;
              }
            }

            const limitR = centerR + r;
            const px = player.pos.x;
            const py = player.pos.y;
            const distSq = px * px + py * py;
            if (distSq < limitR * limitR) {
              const dist = Math.sqrt(distSq);
              if (dist > 1e-6) {
                const nx = px / dist;
                const ny = py / dist;
                player.pos.x = nx * limitR;
                player.pos.y = ny * limitR;
                const vDotN = player.vel.x * nx + player.vel.y * ny;
                if (vDotN < 0) {
                  player.vel.x -= vDotN * nx;
                  player.vel.y -= vDotN * ny;
                }
              }
              if (team === 'red' && player.pos.x > -r) {
                player.pos.x = -r;
                if (player.vel.x > 0) player.vel.x = 0;
              } else if (team === 'blue' && player.pos.x < r) {
                player.pos.x = r;
                if (player.vel.x < 0) player.vel.x = 0;
              }
            }
          }
        }
      }

      // Máquina de estados de Efecto Magnus Dirigido (ventana de 3.0s y máximo 2 pulsaciones)
      if (this.ball.magnusTimer > 0) {
        this.ball.magnusTimer -= CORE_DT;
        if (this.ball.magnusTimer <= 0) {
          this.ball.magnusTimer = 0;
          this.ball.isCurvingAllowed = false;
          this.ball.isCurving = false;
          this.ball.curvePerp = 0;
          this.ball.spin = 0;
          this.ball.magnusControllerId = null;
        }
      }

      const canMagnus = (this.modifiers as any).magnusEnabled !== false;
      const controllerIdNum = this.ball.magnusControllerId !== null ? Number(this.ball.magnusControllerId) : -1;
      const controllerInput = controllerIdNum !== -1 ? inputs.get(controllerIdNum) : undefined;
      const bSpeed = Math.hypot(this.ball.vel.x, this.ball.vel.y);

      if (canMagnus && this.ball.isCurvingAllowed && this.ball.magnusTimer > 0 && bSpeed > 0.05 && this.players.has(controllerIdNum)) {
        const kMagnus = ((this.modifiers as any).magnusCurveStrength ?? this.modifiers.magnusCoefficient ?? 1.2) * 5.0;
        const hasLeft = Boolean(controllerInput?.magnusLeft || (controllerInput?.inputMask && (controllerInput.inputMask & INPUT_FLAG_MAGNUS_LEFT)));
        const hasRight = Boolean(controllerInput?.magnusRight || (controllerInput?.inputMask && (controllerInput.inputMask & INPUT_FLAG_MAGNUS_RIGHT)));

        let desiredDir = 0;
        if (hasLeft && !hasRight) desiredDir = -1;
        else if (hasRight && !hasLeft) desiredDir = 1;

        if (desiredDir !== 0) {
          if (desiredDir !== this.ball.lastCurveDir) {
            if (this.ball.magnusPressesRemaining > 0 && this.ball.magnusTimer > 0) {
              this.ball.magnusPressesRemaining--;
              this.ball.lastCurveDir = desiredDir;
            } else {
              desiredDir = 0;
            }
          }
        } else {
          if (this.ball.lastCurveDir !== 0 && this.ball.magnusPressesRemaining <= 0) {
            this.ball.isCurvingAllowed = false;
            this.ball.magnusControllerId = null;
            this.ball.magnusTimer = 0;
          }
          this.ball.lastCurveDir = 0;
        }

        if (desiredDir === -1 && this.ball.magnusTimer > 0 && this.ball.isCurvingAllowed) {
          this.ball.applyMagnusCurve(true, false, kMagnus);
        } else if (desiredDir === 1 && this.ball.magnusTimer > 0 && this.ball.isCurvingAllowed) {
          this.ball.applyMagnusCurve(false, true, kMagnus);
        } else {
          this.ball.isCurving = false;
          this.ball.curvePerp = 0;
          this.ball.spin = 0;
        }
      } else {
        if (bSpeed <= 0.05 && this.ball.isCurvingAllowed) {
          this.ball.resetCurve();
        } else if (this.ball.isCurving || this.ball.spin !== 0) {
          this.ball.isCurving = false;
          this.ball.curvePerp = 0;
          this.ball.spin = 0;
        }
      }

      if (this.ball.isPowerShot && bSpeed < baseKickCfg * 0.65) {
        this.ball.isPowerShot = false;
      }

      this.world.step(CORE_DT, isReplay);

      if (this.ball.lastKickerDiscId !== -1) {
        this.ball.lastKickerDiscId = -1;
      }

      if (this.fsm.state === MatchPhase.KICKOFF) {
        const ballVelSq = this.ball.vel.x * this.ball.vel.x + this.ball.vel.y * this.ball.vel.y;
        if (ballVelSq > 0.0225) {
          this.fsm.startPlaying();
        }
      }

      const hw = this.stadium.halfWidth;
      const gh = this.stadium.goalHalfHeight;
      const bx = this.ball.pos.x;
      const by = this.ball.pos.y;

      if (Math.abs(by) <= gh) {
        if (bx < -hw - this.ball.radius) {
          this.handleGoalScored('blue');
        } else if (bx > hw + this.ball.radius) {
          this.handleGoalScored('red');
        }
      }
    }

    this.fsm.updateTick();
    this.currentTick++;
  }

  public getOrCreateStats(id: number): PlayerMatchStats {
    let s = this.matchStats.get(id);
    if (!s) {
      const team = (this.playerTeams.get(id) ?? 'spec') as 'red' | 'blue' | 'spec';
      const name = this.playerNames.get(id) || `Jugador ${id}`;
      s = {
        playerId: String(id),
        playerName: name,
        nickname: name,
        team,
        points: 0,
        totalPoints: 0,
        goals: 0,
        assists: 0,
        passes: 0,
        saves: 0,
        shots: 0,
        touches: 0,
        hasHattrickBonus: false,
        shotsNormal: 0,
        shotsPowerCurve: 0,
        assistsNormal: 0,
        assistsCurve: 0,
        hattrickBonus: 0
      };
      this.matchStats.set(id, s);
    }
    return s;
  }

  public recordTouch(id: number, isKick: boolean): void {
    const team = this.playerTeams.get(id);
    if (team !== 'red' && team !== 'blue') return;

    const stats = this.getOrCreateStats(id);
    stats.touches++;

    const lastTouch = this.touchHistory.length > 0 ? this.touchHistory[this.touchHistory.length - 1] : null;

    // Detectar pase entre compañeros de equipo
    if (lastTouch && lastTouch.playerId !== id && lastTouch.team === team) {
      const prevStats = this.getOrCreateStats(lastTouch.playerId);
      prevStats.passes++;
      prevStats.points += 5;
    }

    if (isKick) {
      stats.shots++;
      stats.points += 10;
    }

    // Detectar parada defensiva en área propia
    const hw = this.stadium.halfWidth;
    const gh = this.stadium.goalHalfHeight;
    const player = this.players.get(id);
    if (player) {
      const inOwnHalf = (team === 'red' && player.pos.x < -hw * 0.6) || (team === 'blue' && player.pos.x > hw * 0.6);
      if (inOwnHalf && Math.abs(player.pos.y) < gh * 2.2) {
        stats.saves++;
        stats.points += 25;
      }
    }

    this.touchHistory.push({ playerId: id, team, tick: this.currentTick, isKick });
    if (this.touchHistory.length > 50) {
      this.touchHistory.shift();
    }
  }

  public handleGoalScored(scoringTeam: 'red' | 'blue'): void {
    let scorerId: number | null = null;
    let assisterId: number | null = null;

    for (let i = this.touchHistory.length - 1; i >= 0; i--) {
      const entry = this.touchHistory[i];
      if (entry.team === scoringTeam) {
        if (scorerId === null) {
          scorerId = entry.playerId;
        } else if (assisterId === null && entry.playerId !== scorerId) {
          if (this.currentTick - entry.tick <= 600) {
            assisterId = entry.playerId;
          }
          break;
        }
      } else if (scorerId !== null) {
        break;
      }
    }

    if (scorerId !== null) {
      const sStats = this.getOrCreateStats(scorerId);
      sStats.goals++;
      sStats.points += 100;

      if (sStats.goals >= 3 && !sStats.hasHattrickBonus) {
        sStats.hasHattrickBonus = true;
        sStats.hattrickBonus = 100;
        sStats.points += 100;
      }
    }

    if (assisterId !== null) {
      const aStats = this.getOrCreateStats(assisterId);
      aStats.assists++;
      aStats.points += 50;
    }

    this.touchHistory = [];
    this.kickoffPossessingTeam = scoringTeam === 'red' ? 'blue' : 'red';
    this.fsm.registerGoal(scoringTeam);
  }

  public getMatchStats(): PlayerMatchStats[] {
    for (const [id, team] of this.playerTeams.entries()) {
      const s = this.getOrCreateStats(id);
      s.team = team as 'red' | 'blue' | 'spec';
      const name = this.playerNames.get(id);
      if (name) {
        s.playerName = name;
        s.nickname = name;
      }
      s.totalPoints = s.points;
    }
    return Array.from(this.matchStats.values());
  }

  public getMVP(): PlayerMatchStats | null {
    const all = this.getMatchStats();
    let mvp: PlayerMatchStats | null = null;
    for (const s of all) {
      if (s.team === 'spec') continue;
      if (!mvp || s.points > mvp.points || (s.points === mvp.points && s.goals > mvp.goals)) {
        mvp = s;
      }
    }
    return mvp;
  }

  public resetMatchStats(): void {
    this.matchStats.clear();
    this.touchHistory = [];
  }

  public setState(snapshot: GameStateSnapshot): void {
    this.currentTick = snapshot.tick;
    this.fsm.currentState = snapshot.phase as MatchPhase;
    this.fsm.redScore = snapshot.redScore;
    this.fsm.blueScore = snapshot.blueScore;
    this.soundMask = snapshot.soundMask;

    for (let i = 0; i < snapshot.discs.length; i++) {
      const d = snapshot.discs[i]!;
      if (d.id === 0 || d.team === 0) {
        this.ball.pos.set(d.x, d.y);
        this.ball.vel.set(d.vx, d.vy);
        this.ball.spin = d.spin ?? 0;
        this.ball.isCurving = Math.abs(this.ball.spin) > 0.001;
        this.ball.isPowerShot = ((d.flags ?? 0) & (1 << 3)) !== 0;
      } else {
        let p = this.players.get(d.id);
        if (!p) {
          p = this.addPlayer(d.id, d.team === 1 ? 'red' : d.team === 2 ? 'blue' : 'spec');
        }
        p.pos.set(d.x, d.y);
        p.vel.set(d.vx, d.vy);
        if (d.stamina !== undefined) p.stamina = d.stamina;
        p.kicking = ((d.flags ?? 0) & (1 << 0)) !== 0;
        p.isDashing = ((d.flags ?? 0) & (1 << 1)) !== 0;
        p.isTurbo = ((d.flags ?? 0) & (1 << 4)) !== 0;
        p.isTyping = ((d.flags ?? 0) & (1 << 5)) !== 0;
      }
    }
  }

  public getState(): GameStateSnapshot {
    const discStates: CompactDiscState[] = [];

    let ballFlags = 0;
    if (Math.abs(this.ball.spin) > 0.001) {
      ballFlags |= (1 << 1) | (1 << 2);
    }
    if (this.ball.isPowerShot || this.ball.vel.len() >= POWER_SHOT_SPEED_THRESHOLD) {
      ballFlags |= 1 << 3;
    }

    discStates.push({
      id: this.ball.id,
      team: 0,
      x: this.ball.pos.x,
      y: this.ball.pos.y,
      vx: this.ball.vel.x,
      vy: this.ball.vel.y,
      flags: ballFlags,
      spin: this.ball.spin
    });

    for (const [id, p] of this.players.entries()) {
      const team = this.playerTeams.get(id);
      let flags = 0;
      if (p.kicking) flags |= 1 << 0;
      if (p.isDashing) flags |= 1 << 1;
      if (p.isTurbo) flags |= 1 << 4;
      if (p.isTyping) flags |= 1 << 5;

      discStates.push({
        id: p.id,
        team: team === 'red' ? 1 : (team === 'blue' ? 2 : 3),
        x: p.pos.x,
        y: p.pos.y,
        vx: p.vel.x,
        vy: p.vel.y,
        flags,
        stamina: p.stamina
      });
    }

    const elapsedSeconds = this.fsm.state === MatchPhase.STOP
      ? 0
      : Math.floor(this.fsm.matchTicksElapsed / 60);

    return {
      tick: this.currentTick,
      phase: this.fsm.state,
      matchTimer: elapsedSeconds,
      redScore: this.fsm.redScore,
      blueScore: this.fsm.blueScore,
      soundMask: this.soundMask,
      discs: discStates
    };
  }

  public getSnapshot(): ArrayBuffer {
    return BinaryProtocol.encodeSnapshot(this.getState());
  }

  public applyModifiers(modifiers: Partial<PhysicsModifiers> | any): void {
    this.modifiers = { ...this.modifiers, ...modifiers };

    if (this.modifiers.ballRadius !== undefined) this.ball.radius = this.modifiers.ballRadius;
    if (this.modifiers.ballMass !== undefined) this.ball.setMass(this.modifiers.ballMass);
    const ballDamping = (this.modifiers as any).ballFriction ?? this.modifiers.pitchFriction;
    if (ballDamping !== undefined) this.ball.damping = ballDamping;
    if ((this.modifiers as any).ballRestitution !== undefined) this.ball.bounciness = (this.modifiers as any).ballRestitution;
    if ((this.modifiers as any).kickMargin !== undefined) this.world.kickMargin = (this.modifiers as any).kickMargin;
    if (this.modifiers.goalCelebrationDuration !== undefined) this.fsm.celebrationDurationTicks = Math.round(this.modifiers.goalCelebrationDuration * 60);
    if (this.modifiers.goalLimit !== undefined) this.fsm.scoreLimit = this.modifiers.goalLimit;
    if (this.modifiers.goldenGoalOvertime !== undefined) this.fsm.goldenGoal = this.modifiers.goldenGoalOvertime;

    for (const player of this.players.values()) {
      if (this.modifiers.playerRadius !== undefined) player.radius = this.modifiers.playerRadius;
      if (this.modifiers.playerMass !== undefined) player.setMass(this.modifiers.playerMass);
      const pDamping = (this.modifiers as any).playerFriction ?? this.modifiers.pitchFriction;
      if (pDamping !== undefined) player.damping = pDamping;
    }
  }

  public loadStadium(stadiumId: string): void {
    this.stadium = createStadium(stadiumId);
    this.world.loadStadium(this.stadium);
    this.resetPositions();
  }
}

export {
  Vec2,
  clamp,
  lerp,
  closestPointOnSegment,
  quantizeCoord,
  dequantizeCoord,
  normalizeAngle,
  Disc,
  COLLISION_GROUP_BALL,
  COLLISION_GROUP_RED,
  COLLISION_GROUP_BLUE,
  COLLISION_GROUP_WALL,
  COLLISION_GROUP_RED_GOAL,
  COLLISION_GROUP_BLUE_GOAL,
  COLLISION_GROUP_ALL,
  POWER_SHOT_SPEED_THRESHOLD,
  Segment,
  Plane,
  PhysicsWorld,
  PhysicsTicker,
  resolveDiscDiscCollision,
  resolveDiscSegmentCollision,
  resolveGoalAndPitchBoundaries,
  resolvePredictivePlayerCollision,
  resolvePredictiveBallCollision,
  sweptCircleCircle,
  GoalNet,
  Stadium,
  STADIUM_PRESETS,
  StadiumRegistry,
  DEFAULT_STADIUM_ID,
  createStadium,
  GameFSM,
  MatchPhase,
  GameMatchFSM,
  GameMatchPhase,
  GameMatchState,
  toMatchPhase,
  Player,
  getDashStaminaCost,
  DASH_STAMINA_COST,
  DASH_TICKS,
  DEFAULT_DASH_DISTANCE,
  INPUT_UP,
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_KICK,
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MAGNUS_LEFT,
  INPUT_MAGNUS_RIGHT,
  INPUT_TYPING,
  GameEngine,
  BinaryProtocol,
  EventType,
  SoundEvent,
  InputPacket,
  SnapshotPacket,
  OP_INPUT,
  OP_SNAPSHOT,
  OP_CHAT,
  OP_EVENT,
  OP_PING,
  OP_PONG,
  OP_KEEPALIVE,
  SOUND_KICK,
  SOUND_POST_HIT,
  SOUND_GOAL,
  INPUT_FLAG_UP,
  INPUT_FLAG_DOWN,
  INPUT_FLAG_LEFT,
  INPUT_FLAG_RIGHT,
  INPUT_FLAG_KICK,
  INPUT_FLAG_TURBO,
  INPUT_FLAG_DASH,
  INPUT_FLAG_MAGNUS_LEFT,
  INPUT_FLAG_MAGNUS_RIGHT,
  INPUT_FLAG_TYPING,
  DEFAULT_PHYSICS_MODIFIERS,
  DEFAULT_GAME_CONFIG,
  DEFAULT_GAMEPLAY_CONFIG,
  GAMEPLAY_CONFIG_LIMITS,
  sanitizeGameplayConfig,
  defaultStadium
};

export type {
  DiscOptions,
  SegmentOptions,
  PlaneOptions,
  PhysicsWorldConfig,
  CollisionEvent,
  KickoffPhysicsContext,
  StadiumBoundariesConfig,
  GoalNetOptions,
  NetBall,
  StadiumOptions,
  GoalDefinition,
  StadiumBallPhysics,
  StadiumPlayerPhysics,
  StadiumId,
  StadiumPreset,
  MatchState,
  PlayerData,
  TeamType,
  GameSnapshot,
  DiscSnapshot,
  TouchHistoryEntry,
  PlayerMatchStats,
  GoalInfo,
  KickoffState,
  MatchConfig,
  PlayerInput,
  CompactDiscState,
  GameStateSnapshot,
  InputData,
  ActiveRadiusConfig,
  PhysicsModifiers,
  GameConfig,
  GameplayConfig,
  ConfigLimits
};
