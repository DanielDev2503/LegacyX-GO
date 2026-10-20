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
  public modifiers: PhysicsModifiers;
  public currentTick: number = 0;
  public soundMask: number = 0;

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
      kickMargin: 4.0,
      magnusCoefficient: this.modifiers.magnusCoefficient
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
      damping: this.modifiers.pitchFriction,
      bounciness: 0.80,
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
          if (other?.isPost) {
            this.soundMask |= SOUND_POST_HIT;
            this.emit('post_hit', { ball: this.ball, post: other });
          }
        }
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
      this.emit('match_end', { winner });
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
      damping: 0.92,
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

  public resetPositions(): void {
    this.ball.pos.set(0, 0);
    this.ball.prevPos.set(0, 0);
    this.ball.vel.set(0, 0);
    this.ball.resetCurve();

    for (const [id, player] of this.players.entries()) {
      const team = this.playerTeams.get(id);
      const isRed = team === 'red';
      const spawnX = isRed ? -this.stadium.spawnDistance : this.stadium.spawnDistance;
      player.pos.set(spawnX, 0);
      player.prevPos.set(spawnX, 0);
      player.vel.set(0, 0);
      player.stamina = 100;
    }

    this.world.resetNets(false);
  }

  public startMatch(): void {
    this.resetPositions();
    this.fsm.startMatch();
  }

  public stopMatch(): void {
    this.resetPositions();
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
      for (const [id, player] of this.players.entries()) {
        const input = inputs.get(id);
        if (!input) continue;

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

        const accel = 2.4;
        player.vel.x += ix * accel;
        player.vel.y += iy * accel;

        const isDashRequested = Boolean(input.dash || (input.inputMask && (input.inputMask & INPUT_FLAG_DASH)));
        if (isDashRequested && player.stamina >= 25) {
          player.stamina -= 25;
          const dashDirX = inputLen > 0.1 ? ix : (player.vel.len() > 0.1 ? player.vel.x / player.vel.len() : 1);
          const dashDirY = inputLen > 0.1 ? iy : (player.vel.len() > 0.1 ? player.vel.y / player.vel.len() : 0);
          player.vel.x += dashDirX * this.modifiers.dashPower;
          player.vel.y += dashDirY * this.modifiers.dashPower;
          player.isDashing = true;
        } else {
          player.isDashing = false;
        }

        if (player.stamina < 100) {
          player.stamina = Math.min(100, player.stamina + 0.35);
        }

        const isKickRequested = Boolean(input.kick || (input.inputMask && (input.inputMask & INPUT_FLAG_KICK)));
        if (isKickRequested && this.world.isWithinKickDistance(player, this.ball)) {
          const dx = this.ball.pos.x - player.pos.x;
          const dy = this.ball.pos.y - player.pos.y;
          const dist = Math.hypot(dx, dy) || 1;
          const nx = dx / dist;
          const ny = dy / dist;

          this.ball.vel.x = nx * this.modifiers.baseKickStrength;
          this.ball.vel.y = ny * this.modifiers.baseKickStrength;
          this.ball.lastKickerDiscId = player.id;
          this.ball.isCurvingAllowed = true;

          if (input.magnusLeft || (input.inputMask && (input.inputMask & INPUT_FLAG_MAGNUS_LEFT))) {
            this.ball.spin = -1.2;
          } else if (input.magnusRight || (input.inputMask && (input.inputMask & INPUT_FLAG_MAGNUS_RIGHT))) {
            this.ball.spin = 1.2;
          }

          this.soundMask |= SOUND_KICK;
          this.emit('kick', { player, ball: this.ball });

          if (this.fsm.state === MatchPhase.KICKOFF) {
            this.fsm.startPlaying();
          }
        }

        if (this.fsm.state === MatchPhase.KICKOFF) {
          const team = this.playerTeams.get(id);
          if (team === 'red' || team === 'blue') {
            this.world.enforceMidfieldBarrier(player, team);
          }
        }
      }

      this.world.step(CORE_DT, isReplay);

      const hw = this.stadium.halfWidth;
      const gh = this.stadium.goalHalfHeight;
      const bx = this.ball.pos.x;
      const by = this.ball.pos.y;

      if (Math.abs(by) <= gh) {
        if (bx < -hw - this.ball.radius) {
          this.fsm.registerGoal('blue');
        } else if (bx > hw + this.ball.radius) {
          this.fsm.registerGoal('red');
        }
      }
    }

    this.fsm.updateTick();
    this.currentTick++;
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
        if (d.spin !== undefined) this.ball.spin = d.spin;
      } else {
        let p = this.players.get(d.id);
        if (!p) {
          p = this.addPlayer(d.id, d.team === 1 ? 'red' : d.team === 2 ? 'blue' : 'spec');
        }
        p.pos.set(d.x, d.y);
        p.vel.set(d.vx, d.vy);
        if (d.stamina !== undefined) p.stamina = d.stamina;
      }
    }
  }

  public getState(): GameStateSnapshot {
    const discStates: CompactDiscState[] = [];

    let ballFlags = 0;
    if (this.ball.isCurving || this.ball.spin !== 0) ballFlags |= 1 << 1;
    if (this.ball.isCurvingAllowed) ballFlags |= 1 << 2;
    if (this.ball.vel.len() >= POWER_SHOT_SPEED_THRESHOLD) ballFlags |= 1 << 3;

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
      if (p.isDashing) flags |= 1 << 1;

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

    return {
      tick: this.currentTick,
      phase: this.fsm.state,
      matchTimer: Math.max(0, Math.round((this.fsm.matchTimeLimitTicks - this.fsm.matchTicksElapsed) / 60)),
      redScore: this.fsm.redScore,
      blueScore: this.fsm.blueScore,
      soundMask: this.soundMask,
      discs: discStates
    };
  }

  public getSnapshot(): ArrayBuffer {
    return BinaryProtocol.encodeSnapshot(this.getState());
  }

  public applyModifiers(modifiers: Partial<PhysicsModifiers>): void {
    this.modifiers = { ...this.modifiers, ...modifiers };

    this.ball.radius = this.modifiers.ballRadius;
    this.ball.setMass(this.modifiers.ballMass);
    this.ball.damping = this.modifiers.pitchFriction;
    this.world.magnusCoefficient = this.modifiers.magnusCoefficient;
    this.fsm.celebrationDurationTicks = Math.round(this.modifiers.goalCelebrationDuration * 60);
    this.fsm.scoreLimit = this.modifiers.goalLimit;
    this.fsm.goldenGoal = this.modifiers.goldenGoalOvertime;
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
