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
import {
  stepPlayerKinematics,
  type KinematicsConfig,
  type PlayerKinematicsInput,
  type PlayerKinematicsState,
  type StepKinematicsOptions
} from './physics/PlayerKinematics';
import { PhysicsTicker } from './physics/PhysicsTicker';
import { GoalNet, GoalNetOptions, NetBall } from './physics/GoalNet';
import { Stadium, StadiumOptions, GoalDefinition, StadiumBallPhysics, StadiumPlayerPhysics } from './stadiums/Stadium';
import {
  StadiumId,
  StadiumPreset,
  StadiumRegistryMap,
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
  INPUT_TYPING,
  INPUT_MOUSE_AIM
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
import {
  GameEngine,
  SHOT_ON_GOAL_COOLDOWN_TICKS,
  COMPLETED_PASS_COOLDOWN_TICKS,
  MIN_PASS_DISTANCE_PX
} from './game/GameEngine';
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
  INPUT_FLAG_TYPING,
  INPUT_FLAG_MOUSE_AIM,
  INPUT_FLAG_MOUSE_ACTIVE
} from './protocol/BinaryProtocol';
import { InputPacket, InputData } from './protocol/InputPacket';
import { SnapshotPacket, ActiveRadiusConfig } from './protocol/SnapshotPacket';
import { ScoreEventCategory } from './protocol/ControlMessages';
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
  return 'LegacyX Core Engine ready (60 Hz tick-rate)';
}

export type GameEvent =
  | 'goal'
  | 'kick'
  | 'post_hit'
  | 'wall_hit'
  | 'countdown_tick'
  | 'whistle'
  | 'victory_celebration'
  | 'state_change'
  | 'match_end'
  | 'score_event';

export interface ScoreEventEmitPayload {
  playerId: string;
  text: string;
  points: number;
  x: number;
  y: number;
  color?: string;
  category: ScoreEventCategory;
}

export interface TouchPlayerRecord {
  id: number;
  name: string;
  team: 'red' | 'blue';
  tick: number;
  wasCurve?: boolean;
}

export interface GoalBannerDetails {
  scoringTeam: 'red' | 'blue';
  scorerName: string;
  assisterName: string | null;
  isOwnGoal: boolean;
}

interface EngineDashState {
  ticksRemaining: number;
  cooldownTimer: number;
  dirX: number;
  dirY: number;
  prevDashDown: boolean;
  lastShotTick: number;
  lastPassTick: number;
  lastTouchTick: number;
  lastProcessedInputSeq: number;
}

export class EngineInstance {
  public world: PhysicsWorld;
  public fsm: GameFSM;
  public stadium: Stadium;
  public ball: Disc;
  public players: Map<number, Disc> = new Map();
  public playerTeams: Map<number, 'red' | 'blue' | 'spec'> = new Map();
  public playerNames: Map<number, string> = new Map();
  public matchStats: Map<number, PlayerMatchStats> = new Map();
  private playerRuntime: Map<number, EngineDashState> = new Map();
  private touchHistory: Array<{
    playerId: number;
    team: 'red' | 'blue';
    tick: number;
    isKick: boolean;
    ballX: number;
    ballY: number;
    wasCurve: boolean;
  }> = [];
  private pendingShot: { shooterId: number; shooterTeam: 'red' | 'blue'; tick: number } | null = null;
  public lastTouchPlayer: TouchPlayerRecord | null = null;
  public previousTouchPlayer: TouchPlayerRecord | null = null;
  public lastGoalDetails: GoalBannerDetails | null = null;
  private frozenVictoryStats: PlayerMatchStats[] | null = null;
  private frozenVictoryMvp: PlayerMatchStats | null = null;
  private lastWallSoundTick: number = -10;
  public modifiers: PhysicsModifiers;
  public currentTick: number = 0;
  public soundMask: number = 0;
  public kickoffPossessingTeam: 'red' | 'blue' = 'red';
  public isNeutralKickoff: boolean = true;
  public isPracticeMode: boolean = false;

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
      const isCompetitivePhase =
        this.fsm.state === MatchPhase.PLAYING || this.fsm.state === MatchPhase.KICKOFF;
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
            if (isCompetitivePhase) {
              this.recordTouch(other.id, false);
            }
            if (this.fsm.state === MatchPhase.KICKOFF) {
              this.fsm.startPlaying();
            }
          }
        }
      } else if (e.type === 'disc-segment' && e.discA.isBall) {
        this.ball.resetCurve();
        const bSpeed = Math.hypot(this.ball.vel.x, this.ball.vel.y);
        if (bSpeed > 25 && this.currentTick - this.lastWallSoundTick >= 4) {
          this.lastWallSoundTick = this.currentTick;
          this.emit('wall_hit', { ball: this.ball, speed: bSpeed });
        }
      }
    };

    this.fsm.onGoalScored = (team, redScore, blueScore) => {
      this.soundMask |= SOUND_GOAL;
      const details = this.lastGoalDetails;
      this.emit('goal', {
        scoringTeam: team,
        redScore,
        blueScore,
        scorerName: details?.scorerName ?? (team === 'red' ? 'Equipo Rojo' : 'Equipo Azul'),
        assisterName: details?.assisterName ?? null,
        isOwnGoal: details?.isOwnGoal ?? false
      });
    };

    this.fsm.onVictoryCelebrationStart = (winner, redScore, blueScore) => {
      this.frozenVictoryStats = this.getMatchStats().map((s) => ({ ...s }));
      const mvp = this.getMVP();
      this.frozenVictoryMvp = mvp ? { ...mvp } : null;
      this.emit('victory_celebration', {
        winner,
        redScore,
        blueScore,
        stats: this.frozenVictoryStats,
        mvp: this.frozenVictoryMvp,
        lastGoal: this.lastGoalDetails
      });
    };

    this.fsm.onCountdownTick = (count, isResume) => {
      this.emit('countdown_tick', { count, isResume });
      if (count === 0) {
        this.emit('whistle', { kind: isResume ? 'resume' : 'kickoff' });
      }
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
        stats: this.frozenVictoryStats ?? this.getMatchStats(),
        mvp: this.frozenVictoryMvp ?? this.getMVP()
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

  private emitScoreEvent(payload: ScoreEventEmitPayload): void {
    this.emit('score_event', payload);
  }

  private getRuntime(id: number): EngineDashState {
    let rt = this.playerRuntime.get(id);
    if (!rt) {
      rt = {
        ticksRemaining: 0,
        cooldownTimer: 0,
        dirX: 0,
        dirY: 0,
        prevDashDown: false,
        lastShotTick: -9999,
        lastPassTick: -9999,
        lastTouchTick: -9999,
        lastProcessedInputSeq: 0
      };
      this.playerRuntime.set(id, rt);
    }
    return rt;
  }

  public setTimeLimit(seconds: number): void {
    const cleanSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
    this.modifiers.matchTimeMinutes = cleanSeconds / 60;
    this.fsm.matchTimeLimitTicks = cleanSeconds * 60;
    if (cleanSeconds === 0) {
      this.fsm.isOvertime = false;
    }
  }

  public setScoreLimit(goals: number): void {
    const cleanGoals = Math.max(0, Math.round(Number.isFinite(goals) ? goals : 0));
    this.modifiers.goalLimit = cleanGoals;
    this.fsm.scoreLimit = cleanGoals;
  }

  public getTeamPlayerCount(team: 'red' | 'blue'): number {
    let count = 0;
    for (const t of this.playerTeams.values()) {
      if (t === team) count++;
    }
    return count;
  }

  public shouldBypassKickoffBarriers(): boolean {
    if (this.isPracticeMode) return true;
    if (!this.isNeutralKickoff && this.getTeamPlayerCount(this.kickoffPossessingTeam) === 0) {
      return true;
    }
    return false;
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
    this.getRuntime(id);
    this.world.addDisc(playerDisc);
    return playerDisc;
  }

  public removePlayer(id: number): void {
    const player = this.players.get(id);
    if (player) {
      this.world.removeDisc(player);
      this.players.delete(id);
      this.playerTeams.delete(id);
      this.playerRuntime.delete(id);
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
      player.isDashing = false;
      player.isTurbo = false;
      const rt = this.getRuntime(id);
      rt.ticksRemaining = 0;
      rt.cooldownTimer = 0;
      rt.prevDashDown = false;
      if (isRed) redIndex++; else blueIndex++;
    }

    this.world.resetNets(false);
  }

  public startMatch(withIntro: boolean = false): void {
    this.kickoffPossessingTeam = 'red';
    this.isNeutralKickoff = true;
    this.resetPositions();
    this.resetMatchStats();
    this.fsm.startMatch(withIntro);
  }

  public startMatchWithIntro(): void {
    this.startMatch(true);
  }

  public stopMatch(): void {
    this.resetPositions();
    this.resetMatchStats();
    this.fsm.stopMatch();
  }

  public pauseMatch(): void {
    this.fsm.pauseMatch();
  }

  public resumeMatch(immediate: boolean = false): void {
    this.fsm.resumeMatch(immediate);
  }

  public togglePause(): void {
    this.fsm.togglePause();
  }

  public step(inputs: Map<number, PlayerInput>, isReplay: boolean = false): void {
    this.soundMask = 0;
    this.world.isPracticeMode = this.isPracticeMode;
    const isCelebration =
      this.fsm.state === MatchPhase.GOAL || this.fsm.state === MatchPhase.CELEBRATION;
    const isGameActive =
      this.fsm.state === MatchPhase.PLAYING ||
      this.fsm.state === MatchPhase.KICKOFF ||
      isCelebration;

    if (isGameActive) {
      const baseKickCfg = (this.modifiers as any).kickStrength !== undefined
        ? ((this.modifiers as any).kickStrength / 4.545) * 450.0
        : (this.modifiers.baseKickStrength ?? 450.0);
      const rechargePerTick = ((this.modifiers as any).staminaRechargeRate ?? 25.0) / 60;
      const regenMovingEnabled = (this.modifiers as any).staminaRegenMoving !== false;
      const regenMovingFactor = ((this.modifiers as any).staminaRegenMovingRate ?? 100) / 100;
      const dashCooldownCfg = (this.modifiers as any).dashCooldown ?? 1.0;

      for (const [id, player] of this.players.entries()) {
        const rt = this.getRuntime(id);
        const input = inputs.get(id);

        if (input) {
          const seq = (input as any).sequence ?? (input as any).seq ?? (input as any).tick;
          if (typeof seq === 'number') {
            rt.lastProcessedInputSeq = seq >>> 0;
          }
        }

        const mask = input ? (input.inputMask ?? 0) : 0;
        player.isTyping = Boolean(mask & INPUT_FLAG_TYPING);

        const pState: PlayerKinematicsState = {
          pos: player.pos,
          vel: player.vel,
          radius: player.radius,
          stamina: player.stamina,
          isDashing: player.isDashing,
          dashTicksRemaining: rt.ticksRemaining,
          dashCooldownTimer: rt.cooldownTimer,
          dashDirX: rt.dirX,
          dashDirY: rt.dirY,
          isTurbo: player.isTurbo,
          kicking: player.kicking,
          prevDashState: rt.prevDashDown,
          team: this.playerTeams.get(id) ?? 'spec'
        };

        stepPlayerKinematics(
          pState,
          {
            inputMask: mask,
            aimAngle: input ? input.aimAngle : null,
            aimThrottle: input ? input.aimThrottle : 0
          },
          this.stadium,
          null,
          this.modifiers as any,
          CORE_DT,
          { skipSubsteps: true }
        );

        player.stamina = pState.stamina;
        player.isDashing = pState.isDashing;
        player.isTurbo = pState.isTurbo;
        player.kicking = pState.kicking ?? false;
        rt.ticksRemaining = pState.dashTicksRemaining;
        rt.cooldownTimer = pState.dashCooldownTimer;
        rt.dirX = pState.dashDirX;
        rt.dirY = pState.dashDirY;
        rt.prevDashDown = pState.prevDashState ?? false;

        const isKickRequested = player.kicking;

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

            const minKickDist = player.radius + this.ball.radius;
            if (dist < minKickDist) {
              this.ball.pos.x = player.pos.x + nx * minKickDist;
              this.ball.pos.y = player.pos.y + ny * minKickDist;
            }

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
            if (!isCelebration) {
              this.recordTouch(player.id, true);
            }
            this.emit('kick', {
              player,
              ball: this.ball,
              isPowerShot: this.ball.isPowerShot,
              strength: this.ball.isPowerShot ? 1.8 : 1.0
            });

            if (this.fsm.state === MatchPhase.KICKOFF) {
              this.fsm.startPlaying();
            }
          }

        if (this.fsm.state === MatchPhase.KICKOFF) {
          const ballVelSq = this.ball.vel.x * this.ball.vel.x + this.ball.vel.y * this.ball.vel.y;
          const touchDist = this.ball.radius + player.radius;
          const bdx = this.ball.pos.x - player.pos.x;
          const bdy = this.ball.pos.y - player.pos.y;
          if (ballVelSq > 0.0225 || (bdx * bdx + bdy * bdy <= touchDist * touchDist + 1.0)) {
            this.fsm.startPlaying();
          }
        }

        // Restricciones de saque central (desactivadas automáticamente en Modo Entrenamiento o equipo rival vacío)
        if (this.fsm.state === MatchPhase.KICKOFF && !this.shouldBypassKickoffBarriers()) {
          const team = this.playerTeams.get(id);
          const centerR = this.stadium.centerRadius ?? 80;
          if (this.isNeutralKickoff) {
            if (team === 'red' || team === 'blue') {
              this.world.enforceMidfieldBarrier(player, team);
            }
          } else if (team === this.kickoffPossessingTeam) {
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
          if (this.lastTouchPlayer && this.lastTouchPlayer.id === controllerIdNum) {
            this.lastTouchPlayer.wasCurve = true;
          }
        } else if (desiredDir === 1 && this.ball.magnusTimer > 0 && this.ball.isCurvingAllowed) {
          this.ball.applyMagnusCurve(false, true, kMagnus);
          if (this.lastTouchPlayer && this.lastTouchPlayer.id === controllerIdNum) {
            this.lastTouchPlayer.wasCurve = true;
          }
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

      if (!isCelebration) {
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

  private checkEngineHattrick(id: number, stats: PlayerMatchStats): void {
    if (stats.hasHattrickBonus) return;
    if (stats.goals >= 3 || stats.assists >= 3 || stats.saves >= 3) {
      stats.hasHattrickBonus = true;
      stats.hattrickBonus = 100;
      stats.points += 100;
      const pDisc = this.players.get(id);
      this.emitScoreEvent({
        playerId: String(id),
        text: '¡Hattrick Bonus +100!',
        points: 100,
        x: pDisc ? pDisc.pos.x : 0,
        y: pDisc ? pDisc.pos.y : 0,
        color: '#ffd700',
        category: 'hattrick'
      });
    }
  }

  public recordTouch(id: number, isKick: boolean): void {
    const team = this.playerTeams.get(id);
    if (team !== 'red' && team !== 'blue') return;

    const rt = this.getRuntime(id);
    const hasTouchCooldownPassed = (this.currentTick - rt.lastTouchTick) >= 15;

    // Resetear cooldown de tiro al arco a los jugadores del equipo rival
    for (const [otherId, otherTeam] of this.playerTeams.entries()) {
      if ((otherTeam === 'red' || otherTeam === 'blue') && otherTeam !== team) {
        this.getRuntime(otherId).lastShotTick = -9999;
      }
    }

    const playerName = this.playerNames.get(id) || `Jugador ${id}`;
    if (!this.lastTouchPlayer || this.lastTouchPlayer.id !== id) {
      this.previousTouchPlayer = this.lastTouchPlayer;
      this.lastTouchPlayer = { id, name: playerName, team, tick: this.currentTick, wasCurve: false };
    } else {
      this.lastTouchPlayer.name = playerName;
      this.lastTouchPlayer.team = team;
      this.lastTouchPlayer.tick = this.currentTick;
    }

    const stats = this.getOrCreateStats(id);
    const player = this.players.get(id);
    const px = player ? player.pos.x : this.ball.pos.x;
    const py = player ? player.pos.y : this.ball.pos.y;

    if (hasTouchCooldownPassed) {
      rt.lastTouchTick = this.currentTick;
      stats.touches++;
      // 0 puntos por toque
    }

    if (hasTouchCooldownPassed || isKick) {
      const lastTouch = this.touchHistory.length > 0 ? this.touchHistory[this.touchHistory.length - 1] : null;

      // Pase completado (+10 pts): distancia >= 90 px entre compañeros distintos y cooldown de 3.0s (180 ticks)
      if (lastTouch && lastTouch.playerId !== id && lastTouch.team === team) {
        const travelDist = Math.hypot(this.ball.pos.x - lastTouch.ballX, this.ball.pos.y - lastTouch.ballY);
        const passerRt = this.getRuntime(lastTouch.playerId);
        if (travelDist >= MIN_PASS_DISTANCE_PX && (this.currentTick - passerRt.lastPassTick) >= COMPLETED_PASS_COOLDOWN_TICKS) {
          passerRt.lastPassTick = this.currentTick;
          const prevStats = this.getOrCreateStats(lastTouch.playerId);
          prevStats.passes++;
          prevStats.points += 10;
          const passerDisc = this.players.get(lastTouch.playerId);
          this.emitScoreEvent({
            playerId: String(lastTouch.playerId),
            text: 'Pase completado +10',
            points: 10,
            x: passerDisc ? passerDisc.pos.x : px,
            y: passerDisc ? passerDisc.pos.y : py,
            color: '#00e5ff',
            category: 'pass'
          });
        }
      }

      // Atajada (+100 pts): interceptar tiro rival en campo propio
      if (this.pendingShot && this.pendingShot.shooterTeam !== team) {
        const inOwnHalf = (team === 'red' && px <= 0) || (team === 'blue' && px >= 0);
        if (inOwnHalf) {
          stats.saves++;
          stats.points += 100;
          this.emitScoreEvent({
            playerId: String(id),
            text: 'Atajada +100',
            points: 100,
            x: px,
            y: py,
            color: '#00e676',
            category: 'save'
          });
          this.checkEngineHattrick(id, stats);
        }
        this.pendingShot = null;
      }
    }

    // Tiro al arco (+20 pts): SOLO en patada explícita (isKick) dirigida entre los tres palos rivales con cooldown de 4.0s
    if (isKick) {
      const hw = this.stadium.halfWidth;
      const gh = this.stadium.goalHalfHeight;
      let isShotOnGoal = false;

      if (team === 'red' && this.ball.vel.x > 50 && this.ball.pos.x < hw) {
        const t = (hw - this.ball.pos.x) / this.ball.vel.x;
        const yPred = this.ball.pos.y + this.ball.vel.y * t;
        if (Math.abs(yPred) <= gh) isShotOnGoal = true;
      } else if (team === 'blue' && this.ball.vel.x < -50 && this.ball.pos.x > -hw) {
        const t = (-hw - this.ball.pos.x) / this.ball.vel.x;
        const yPred = this.ball.pos.y + this.ball.vel.y * t;
        if (Math.abs(yPred) <= gh) isShotOnGoal = true;
      }

      if (isShotOnGoal && (this.currentTick - rt.lastShotTick) >= SHOT_ON_GOAL_COOLDOWN_TICKS) {
        rt.lastShotTick = this.currentTick;
        stats.shots++;
        stats.shotsNormal = (stats.shotsNormal || 0) + 1;
        stats.points += 20;
        this.pendingShot = { shooterId: id, shooterTeam: team, tick: this.currentTick };
        this.emitScoreEvent({
          playerId: String(id),
          text: 'Tiro al arco +20',
          points: 20,
          x: px,
          y: py,
          color: '#ffbe0b',
          category: 'shot'
        });
      }
    }

    const wasCurve = Boolean(this.ball.isCurving || Math.abs(this.ball.spin) > 0.001);
    this.touchHistory.push({
      playerId: id,
      team,
      tick: this.currentTick,
      isKick,
      ballX: this.ball.pos.x,
      ballY: this.ball.pos.y,
      wasCurve
    });
    if (this.touchHistory.length > 50) {
      this.touchHistory.shift();
    }
  }

  public handleGoalScored(scoringTeam: 'red' | 'blue'): void {
    let scorerId: number | null = null;
    let assisterId: number | null = null;
    let scorerName = scoringTeam === 'red' ? 'Equipo Rojo' : 'Equipo Azul';
    let assisterName: string | null = null;
    let isOwnGoal = false;

    const lastTouch = this.lastTouchPlayer;
    const prevTouch = this.previousTouchPlayer;

    if (lastTouch) {
      if (lastTouch.team === scoringTeam) {
        isOwnGoal = false;
        scorerId = lastTouch.id;
        scorerName = this.playerNames.get(lastTouch.id) || lastTouch.name;

        if (prevTouch && prevTouch.team === scoringTeam && prevTouch.id !== lastTouch.id) {
          assisterId = prevTouch.id;
          assisterName = this.playerNames.get(prevTouch.id) || prevTouch.name;
        }
      } else {
        isOwnGoal = true;
        scorerId = lastTouch.id;
        assisterId = null;
        scorerName = this.playerNames.get(lastTouch.id) || lastTouch.name;
        assisterName = null;
      }
    }

    if (isOwnGoal && scorerId !== null) {
      const ogStats = this.getOrCreateStats(scorerId);
      ogStats.points -= 50;
      const ogDisc = this.players.get(scorerId);
      this.emitScoreEvent({
        playerId: String(scorerId),
        text: 'Autogol -50',
        points: -50,
        x: ogDisc ? ogDisc.pos.x : this.ball.pos.x,
        y: ogDisc ? ogDisc.pos.y : this.ball.pos.y,
        color: '#ff4757',
        category: 'ownGoal'
      });
    } else if (scorerId !== null && !isOwnGoal) {
      const sStats = this.getOrCreateStats(scorerId);
      sStats.goals++;
      const isCurveGoal = Boolean(this.ball.isCurving || Math.abs(this.ball.spin) > 0.001 || lastTouch?.wasCurve);
      const goalPts = isCurveGoal ? 120 : 100;
      sStats.points += goalPts;
      const scDisc = this.players.get(scorerId);
      this.emitScoreEvent({
        playerId: String(scorerId),
        text: isCurveGoal ? '¡Gol con efecto! +120' : '¡Gol! +100',
        points: goalPts,
        x: scDisc ? scDisc.pos.x : this.ball.pos.x,
        y: scDisc ? scDisc.pos.y : this.ball.pos.y,
        color: '#ffd700',
        category: 'goal'
      });
      this.checkEngineHattrick(scorerId, sStats);
    }

    if (assisterId !== null && !isOwnGoal) {
      const aStats = this.getOrCreateStats(assisterId);
      aStats.assists++;
      const isCurveAssist = Boolean(prevTouch?.wasCurve);
      const assistPts = isCurveAssist ? 70 : 50;
      if (isCurveAssist) {
        aStats.assistsCurve = (aStats.assistsCurve || 0) + 1;
      } else {
        aStats.assistsNormal = (aStats.assistsNormal || 0) + 1;
      }
      aStats.points += assistPts;
      const asDisc = this.players.get(assisterId);
      this.emitScoreEvent({
        playerId: String(assisterId),
        text: isCurveAssist ? 'Asistencia con efecto +70' : 'Asistencia +50',
        points: assistPts,
        x: asDisc ? asDisc.pos.x : this.ball.pos.x,
        y: asDisc ? asDisc.pos.y : this.ball.pos.y,
        color: '#00e5ff',
        category: 'assist'
      });
      this.checkEngineHattrick(assisterId, aStats);
    }

    this.lastGoalDetails = {
      scoringTeam,
      scorerName,
      assisterName,
      isOwnGoal
    };

    this.touchHistory = [];
    this.pendingShot = null;
    this.lastTouchPlayer = null;
    this.previousTouchPlayer = null;
    this.isNeutralKickoff = false;
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
    this.pendingShot = null;
    this.lastTouchPlayer = null;
    this.previousTouchPlayer = null;
    this.lastGoalDetails = null;
    this.frozenVictoryStats = null;
    this.frozenVictoryMvp = null;
    for (const rt of this.playerRuntime.values()) {
      rt.lastShotTick = -9999;
      rt.lastPassTick = -9999;
      rt.lastTouchTick = -9999;
      rt.cooldownTimer = 0;
      rt.ticksRemaining = 0;
    }
  }

  public setState(snapshot: GameStateSnapshot): void {
    this.currentTick = snapshot.tick;
    this.fsm.currentState = snapshot.phase as MatchPhase;
    this.fsm.redScore = snapshot.redScore;
    this.fsm.blueScore = snapshot.blueScore;
    this.soundMask = snapshot.soundMask;

    const seenPlayerIds = new Set<number>();
    for (let i = 0; i < snapshot.discs.length; i++) {
      const d = snapshot.discs[i]!;
      if (d.id === 0 || d.team === 0) {
        this.ball.pos.set(d.x, d.y);
        this.ball.prevPos.set(d.x, d.y);
        this.ball.vel.set(d.vx, d.vy);
        this.ball.spin = d.spin ?? 0;
        this.ball.isCurving = Math.abs(this.ball.spin) > 0.001;
        this.ball.isPowerShot = ((d.flags ?? 0) & (1 << 3)) !== 0;
      } else {
        seenPlayerIds.add(d.id);
        const teamStr: 'red' | 'blue' | 'spec' = d.team === 1 ? 'red' : d.team === 2 ? 'blue' : 'spec';
        let p = this.players.get(d.id);
        if (!p) {
          p = this.addPlayer(d.id, teamStr);
        } else if (this.playerTeams.get(d.id) !== teamStr) {
          this.playerTeams.set(d.id, teamStr);
          p.cGroup = teamStr === 'red' ? COLLISION_GROUP_RED : COLLISION_GROUP_BLUE;
        }
        p.pos.set(d.x, d.y);
        p.prevPos.set(d.x, d.y);
        p.vel.set(d.vx, d.vy);
        if (d.stamina !== undefined) p.stamina = d.stamina;
        p.kicking = ((d.flags ?? 0) & (1 << 0)) !== 0;
        p.isDashing = ((d.flags ?? 0) & (1 << 1)) !== 0;
        p.isTurbo = ((d.flags ?? 0) & (1 << 4)) !== 0;
        p.isTyping = ((d.flags ?? 0) & (1 << 5)) !== 0;
      }
    }
    for (const existingId of Array.from(this.players.keys())) {
      if (!seenPlayerIds.has(existingId)) {
        this.removePlayer(existingId);
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
      const rt = this.playerRuntime.get(id);
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
        stamina: p.stamina,
        dashTimer: rt ? rt.ticksRemaining : (p.isDashing ? 1 : 0),
        dashCooldown: rt ? rt.cooldownTimer : 0,
        lastAckedInputSeq: rt ? rt.lastProcessedInputSeq : 0
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
    if (this.modifiers.goalCelebrationDuration !== undefined) {
      this.fsm.celebrationDurationTicks = Math.round(this.modifiers.goalCelebrationDuration * 60);
    }
    if (this.modifiers.goalLimit !== undefined) {
      this.fsm.scoreLimit = Math.max(0, Math.round(this.modifiers.goalLimit));
    }
    if (this.modifiers.matchTimeMinutes !== undefined && Number.isFinite(this.modifiers.matchTimeMinutes)) {
      this.fsm.matchTimeLimitTicks = Math.max(0, Math.round(this.modifiers.matchTimeMinutes * 3600));
    }
    if (this.modifiers.goldenGoalOvertime !== undefined) {
      this.fsm.goldenGoal = this.modifiers.goldenGoalOvertime;
    }

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
  INPUT_MOUSE_AIM,
  GameEngine,
  SHOT_ON_GOAL_COOLDOWN_TICKS,
  COMPLETED_PASS_COOLDOWN_TICKS,
  MIN_PASS_DISTANCE_PX,
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
  INPUT_FLAG_MOUSE_AIM,
  INPUT_FLAG_MOUSE_ACTIVE,
  DEFAULT_PHYSICS_MODIFIERS,
  DEFAULT_GAME_CONFIG,
  DEFAULT_GAMEPLAY_CONFIG,
  GAMEPLAY_CONFIG_LIMITS,
  sanitizeGameplayConfig,
  defaultStadium,
  stepPlayerKinematics
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
  StadiumRegistryMap,
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
  ConfigLimits,
  KinematicsConfig,
  PlayerKinematicsInput,
  PlayerKinematicsState,
  StepKinematicsOptions
};
