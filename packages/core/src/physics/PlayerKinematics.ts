import {
  INPUT_UP,
  INPUT_DOWN,
  INPUT_LEFT,
  INPUT_RIGHT,
  INPUT_KICK,
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MOUSE_AIM,
  INPUT_MOUSE_ACTIVE,
  DASH_TICKS
} from '../game/Player';
import {
  resolveGoalAndPitchBoundaries,
  resolveDiscSegmentCollision,
  resolveDiscDiscCollision,
  KickoffPhysicsContext,
  StadiumBoundariesConfig
} from './ContinuousCollision';
import { PhysicsWorld } from './PhysicsWorld';
import { Stadium } from '../stadiums/Stadium';
import { Disc, COLLISION_GROUP_RED, COLLISION_GROUP_BLUE, COLLISION_GROUP_ALL } from '../entities/Disc';

export interface KinematicsConfig {
  playerAcceleration?: number;
  kickingAcceleration?: number;
  playerMaxSpeed?: number;
  boostMultiplier?: number;
  turboMultiplier?: number;
  dashDistance?: number;
  dashCooldown?: number;
  dashesPerFullBar?: number;
  staminaRechargeRate?: number;
  staminaRegenMoving?: boolean;
  staminaRegenMovingRate?: number;
  playerFriction?: number;
  dashEnabled?: boolean;
  turboEnabled?: boolean;
}

export interface PlayerKinematicsInput {
  inputMask?: number;
  aimAngle?: number | null;
  aimThrottle?: number;
}

export interface PlayerKinematicsState {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  radius: number;
  stamina: number;
  isDashing: boolean;
  dashTicksRemaining: number;
  dashCooldownTimer: number;
  dashDirX: number;
  dashDirY: number;
  isTurbo: boolean;
  kicking?: boolean;
  prevDashState?: boolean;
  triggerDash?: boolean;
  team: 'red' | 'blue' | 'spec' | number;
}

export interface StepKinematicsOptions {
  skipSubsteps?: boolean;
}

/**
 * Deterministic, Zero-GC isomorphic player kinematics step.
 * Executes exactly 1 tick (dt = 1/60s, SUBSTEPS = 4) identically on Host and Client.
 */
export function stepPlayerKinematics(
  player: PlayerKinematicsState,
  input: PlayerKinematicsInput,
  stadium?: Stadium | StadiumBoundariesConfig | null,
  kickoff?: KickoffPhysicsContext | null,
  config?: KinematicsConfig,
  dt: number = 1 / 60,
  options?: StepKinematicsOptions
): void {
  // 1. Dash cooldown decay
  if (player.dashCooldownTimer > 0) {
    player.dashCooldownTimer = Math.max(0, player.dashCooldownTimer - dt);
  }

  // 2. Parse input mask & continuous 360° aim
  const mask = input.inputMask ?? 0;
  let uMoveX = 0;
  let uMoveY = 0;
  let moveThrottle = 0;

  const isMouseActive =
    ((mask & INPUT_MOUSE_ACTIVE) !== 0 || (mask & INPUT_MOUSE_AIM) !== 0) &&
    input.aimAngle !== null &&
    input.aimAngle !== undefined &&
    input.aimAngle !== 0xFF &&
    (input.aimThrottle ?? 0) > 0;

  if (isMouseActive && typeof input.aimAngle === 'number') {
    moveThrottle = Math.max(0, Math.min(1, input.aimThrottle ?? 1));
    uMoveX = Math.cos(input.aimAngle);
    uMoveY = Math.sin(input.aimAngle);
  } else {
    let dirX = 0;
    let dirY = 0;
    if (mask & INPUT_UP) dirY -= 1;
    if (mask & INPUT_DOWN) dirY += 1;
    if (mask & INPUT_LEFT) dirX -= 1;
    if (mask & INPUT_RIGHT) dirX += 1;

    if (dirX !== 0 || dirY !== 0) {
      const len = Math.hypot(dirX, dirY);
      uMoveX = dirX / len;
      uMoveY = dirY / len;
      moveThrottle = 1.0;
    }
  }

  const hasMoveInput = moveThrottle > 0;
  const vSpeed = Math.hypot(player.vel.x, player.vel.y);

  // 3. Dash evaluation (Rising edge trigger or triggerDash flag)
  const isDashKeyDown = (mask & INPUT_DASH) !== 0;
  const wantsDash = Boolean(player.triggerDash || (isDashKeyDown && !player.prevDashState));
  const dashesPerFullBar = config?.dashesPerFullBar ?? 4;
  const dashCost = 100 / Math.max(1, Math.min(6, dashesPerFullBar));
  const canDash = config?.dashEnabled !== false;
  const dashCooldownCfg = config?.dashCooldown ?? 1.0;

  if (
    canDash &&
    wantsDash &&
    !player.prevDashState &&
    player.stamina >= dashCost &&
    !player.isDashing &&
    player.dashCooldownTimer <= 1e-6
  ) {
    player.stamina = Math.max(0, player.stamina - dashCost);
    player.isDashing = true;
    player.dashTicksRemaining = DASH_TICKS; // 7 ticks
    player.dashCooldownTimer = dashCooldownCfg;

    if (vSpeed > 0.05) {
      player.dashDirX = player.vel.x / vSpeed;
      player.dashDirY = player.vel.y / vSpeed;
    } else if (hasMoveInput) {
      player.dashDirX = uMoveX;
      player.dashDirY = uMoveY;
    } else {
      player.dashDirX = (player.team === 'red' || player.team === 1) ? 1 : -1;
      player.dashDirY = 0;
    }
  }
  player.prevDashState = isDashKeyDown;
  player.triggerDash = false;

  // 4. Kicking state & Acceleration calculation
  const isKicking = (mask & INPUT_KICK) !== 0;
  player.kicking = isKicking;

  const pAccel = config?.playerAcceleration ?? 0.14;
  const pKickAccel = config?.kickingAcceleration ?? (pAccel * (0.108 / 0.14));
  const accel = (pAccel / 0.11) * 7.5;
  const kickAccelRatio = pAccel > 0 ? pKickAccel / pAccel : (0.108 / 0.14);
  const effectiveAccel = (isKicking ? accel * kickAccelRatio : accel) * (hasMoveInput ? moveThrottle : 1.0);

  const wasDashing = player.isDashing;

  if (player.isDashing) {
    player.dashTicksRemaining--;
    const dashDistance = config?.dashDistance ?? 37.5;
    const dashSpeed = (dashDistance / DASH_TICKS) * 60;
    player.vel.x = player.dashDirX * dashSpeed;
    player.vel.y = player.dashDirY * dashSpeed;

    if (player.dashTicksRemaining <= 0) {
      player.isDashing = false;
    }
  } else {
    const pMaxSpeed = config?.playerMaxSpeed ?? 3.5;
    const baseMaxSpeed = (pMaxSpeed / 2.8) * 168.0 * (hasMoveInput ? moveThrottle : 1.0);
    const kSpeedTurbo = config?.boostMultiplier ?? config?.turboMultiplier ?? 2.0;
    const turboMaxSpeed = baseMaxSpeed * kSpeedTurbo;
    const kAccelTurbo = Math.max(2.8, kSpeedTurbo * 1.5);
    const turboAccel = effectiveAccel * kAccelTurbo;

    const canTurbo = config?.turboEnabled !== false;
    const wantsTurbo = canTurbo && ((mask & INPUT_TURBO) !== 0);

    if (wantsTurbo && hasMoveInput && player.stamina > 0) {
      player.isTurbo = true;
      player.stamina = Math.max(0, player.stamina - 40 * dt);
      if (player.stamina <= 0) {
        player.isTurbo = false;
      }

      player.vel.x += uMoveX * turboAccel;
      player.vel.y += uMoveY * turboAccel;

      const curSpeed = Math.hypot(player.vel.x, player.vel.y);
      if (curSpeed > turboMaxSpeed) {
        player.vel.x = (player.vel.x / curSpeed) * turboMaxSpeed;
        player.vel.y = (player.vel.y / curSpeed) * turboMaxSpeed;
      }
    } else {
      player.isTurbo = false;
      if (hasMoveInput) {
        const curSpeed = Math.hypot(player.vel.x, player.vel.y);
        if (curSpeed < baseMaxSpeed) {
          player.vel.x += uMoveX * effectiveAccel;
          player.vel.y += uMoveY * effectiveAccel;
          const postSpeed = Math.hypot(player.vel.x, player.vel.y);
          if (postSpeed > baseMaxSpeed) {
            player.vel.x = (player.vel.x / postSpeed) * baseMaxSpeed;
            player.vel.y = (player.vel.y / postSpeed) * baseMaxSpeed;
          }
        }
      }
    }
  }

  // 5. Stamina regeneration
  if (!player.isDashing && !wasDashing && !player.isTurbo && player.stamina < 100) {
    const staminaRechargeRate = config?.staminaRechargeRate ?? 25.0;
    if (!hasMoveInput) {
      player.stamina = Math.min(100, player.stamina + staminaRechargeRate * dt);
    } else if (config?.staminaRegenMoving === true) {
      const movingFactor = Math.max(0, Math.min(200, config?.staminaRegenMovingRate ?? 25)) / 100;
      if (movingFactor > 0) {
        player.stamina = Math.min(
          100,
          player.stamina + staminaRechargeRate * movingFactor * dt
        );
      }
    }
  }

  // If caller requested forces/accel only (e.g. Host inside PhysicsWorld), stop here
  if (options?.skipSubsteps) {
    return;
  }

  // 6. Substepping: Integration, stadium boundaries, kickoff barriers and friction damping
  const SUBSTEPS = 4;
  const subDt = dt / SUBSTEPS;
  const playerFriction = config?.playerFriction ?? 0.96;
  const subDamping = Math.pow(playerFriction, 1 / SUBSTEPS);

  const teamStr: 'red' | 'blue' = (player.team === 'blue' || player.team === 2) ? 'blue' : 'red';
  const boundariesConfig: StadiumBoundariesConfig = {
    halfWidth: (stadium as any)?.halfWidth ?? 600,
    halfHeight: (stadium as any)?.halfHeight ?? 270,
    goalHalfHeight: (stadium as any)?.goalHalfHeight ?? 85,
    goalDepth: (stadium as any)?.goalDepth ?? 35,
    runOff: (stadium as any)?.runOff ?? 0
  };

  const centerRadius = kickoff?.centerRadius ?? ((stadium as any)?.centerRadius ?? 80);

  // Scratch Disc for segment/post resolution if stadium has explicit segments
  let scratchDisc: Disc | null = null;
  const stadiumSegments = (stadium && 'segments' in stadium && Array.isArray((stadium as any).segments))
    ? (stadium as any).segments
    : null;
  const stadiumPosts = (stadium && 'posts' in stadium && Array.isArray((stadium as any).posts))
    ? (stadium as any).posts
    : null;

  if (stadiumSegments && stadiumSegments.length > 0) {
    scratchDisc = new Disc({
      id: 99999,
      x: player.pos.x,
      y: player.pos.y,
      radius: player.radius,
      mass: 2,
      damping: playerFriction,
      bounciness: 0.5,
      cGroup: teamStr === 'red' ? COLLISION_GROUP_RED : COLLISION_GROUP_BLUE,
      cMask: COLLISION_GROUP_ALL,
      isBall: false
    });
  }

  for (let s = 0; s < SUBSTEPS; s++) {
    // 6a. Numerical integration
    player.pos.x += player.vel.x * subDt;
    player.pos.y += player.vel.y * subDt;

    // 6b. Stadium boundary resolution: use explicit segments & posts if present, fallback to box boundaries
    if (scratchDisc && stadiumSegments && stadiumSegments.length > 0) {
      scratchDisc.pos.x = player.pos.x;
      scratchDisc.pos.y = player.pos.y;
      scratchDisc.vel.x = player.vel.x;
      scratchDisc.vel.y = player.vel.y;

      for (let k = 0; k < stadiumSegments.length; k++) {
        resolveDiscSegmentCollision(scratchDisc, stadiumSegments[k], undefined, kickoff);
      }

      if (stadiumPosts && stadiumPosts.length > 0) {
        for (let p = 0; p < stadiumPosts.length; p++) {
          resolveDiscDiscCollision(scratchDisc, stadiumPosts[p]);
        }
      }

      player.pos.x = scratchDisc.pos.x;
      player.pos.y = scratchDisc.pos.y;
      player.vel.x = scratchDisc.vel.x;
      player.vel.y = scratchDisc.vel.y;
    } else {
      resolveGoalAndPitchBoundaries(player.pos, player.vel, player.radius, boundariesConfig);
    }

    // 6d. Kickoff barrier enforcement
    if (kickoff && kickoff.active) {
      const isPossessing = kickoff.possessingTeam === teamStr;
      if (kickoff.possessingTeam === null) {
        PhysicsWorld.enforceMidfieldBarrierStatic(player.pos, player.vel, player.radius, teamStr);
      } else if (isPossessing) {
        PhysicsWorld.enforceKickoffPossessionBarrierStatic(player.pos, player.vel, player.radius, teamStr, centerRadius);
      } else {
        // Defending team: Midfield barrier + Center circle exclusion
        if (teamStr === 'red') {
          if (player.pos.x > -player.radius) {
            player.pos.x = -player.radius;
            if (player.vel.x > 0) player.vel.x = 0;
          }
        } else if (teamStr === 'blue') {
          if (player.pos.x < player.radius) {
            player.pos.x = player.radius;
            if (player.vel.x < 0) player.vel.x = 0;
          }
        }

        const limitR = centerRadius + player.radius;
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
          } else {
            const dirX = teamStr === 'red' ? -1 : 1;
            player.pos.x = dirX * limitR;
            player.pos.y = 0;
            if (teamStr === 'red' && player.vel.x > 0) player.vel.x = 0;
            if (teamStr === 'blue' && player.vel.x < 0) player.vel.x = 0;
          }

          if (teamStr === 'red' && player.pos.x > -player.radius) {
            player.pos.x = -player.radius;
            if (player.vel.x > 0) player.vel.x = 0;
          } else if (teamStr === 'blue' && player.pos.x < player.radius) {
            player.pos.x = player.radius;
            if (player.vel.x < 0) player.vel.x = 0;
          }
        }
      }
    }

    // 6e. Substep friction damping
    player.vel.x *= subDamping;
    player.vel.y *= subDamping;
  }
}
