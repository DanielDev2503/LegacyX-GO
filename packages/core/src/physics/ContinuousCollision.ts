import { Vec2 } from '../math/Vec2';
import { closestPointOnSegment } from '../math/MathUtils';
import { Disc, COLLISION_GROUP_RED, COLLISION_GROUP_BLUE } from '../entities/Disc';
import { Segment } from '../entities/Segment';

export interface KickoffPhysicsContext {
  active: boolean;
  possessingTeam: 'red' | 'blue' | null;
  centerRadius: number;
}

export interface CollisionEvent {
  type: 'disc-disc' | 'disc-segment';
  discA: Disc;
  discB?: Disc;
  segment?: Segment;
  preBallVx?: number | undefined;
  preBallVy?: number | undefined;
}

/**
 * Resolves collision between two circular discs using analytical impulse resolution
 * and inverse mass positional correction to prevent overlap and tunneling.
 */
export function resolveDiscDiscCollision(
  d1: Disc,
  d2: Disc,
  onCollision?: (e: CollisionEvent) => void
): boolean {
  if (!d1.canCollideWith(d2)) return false;

  // Mecánica de Tackle: si un jugador en Dash o Turbo impacta a otro, masa efectiva x1.8 (invMass / 1.8)
  let invMass1 = d1.invMass;
  let invMass2 = d2.invMass;

  if (!d1.isBall && !d2.isBall) {
    if (d1.isDashing) {
      invMass1 /= 1.8;
    } else if (d1.isTurbo) {
      invMass1 /= 2.17; // Impulso de choque incrementado proporcionalmente a velocidad (+75%)
    }
    if (d2.isDashing) {
      invMass2 /= 1.8;
    } else if (d2.isTurbo) {
      invMass2 /= 2.17;
    }
  }

  const totalInvMass = invMass1 + invMass2;
  if (totalInvMass <= 0) return false; // Both are static

  // Distance vector from d2 to d1
  const diff = Vec2.t0.copy(d1.pos).sub(d2.pos);
  const distSq = diff.lenSq();
  const radiusSum = d1.radius + d2.radius;

  if (distSq >= radiusSum * radiusSum) return false;

  const dist = Math.sqrt(distSq);
  const normal = Vec2.t1;

  if (dist > 1e-9) {
    normal.copy(diff).scale(1 / dist);
  } else {
    // Exact center overlap fallback
    normal.set(1, 0);
  }

  // Penetration depth
  const penetration = radiusSum - dist;

  // Positional correction based on effective inverse mass
  const percent = 1.0; // Full separation
  const correctionMagnitude = (penetration / totalInvMass) * percent;

  d1.pos.addScaled(normal, correctionMagnitude * invMass1);
  d2.pos.addScaled(normal, -correctionMagnitude * invMass2);

  // Relative velocity along normal: (v1 - v2) . normal
  const relVel = Vec2.t2.copy(d1.vel).sub(d2.vel);
  const velAlongNormal = relVel.dot(normal);

  // Extinción instantánea de la comba del balón al colisionar con cualquier disco (poste o jugador)
  if (d1.isBall && (d1.isCurving || d1.isCurvingAllowed || d1.spin !== 0 || d1.magnusTimer > 0) && d2.id !== d1.lastKickerDiscId) {
    d1.resetCurve();
  }
  if (d2.isBall && (d2.isCurving || d2.isCurvingAllowed || d2.spin !== 0 || d2.magnusTimer > 0) && d1.id !== d2.lastKickerDiscId) {
    d2.resetCurve();
  }

  const ballDisc = d1.isBall ? d1 : (d2.isBall ? d2 : null);
  const preBallVx = ballDisc ? ballDisc.vel.x : undefined;
  const preBallVy = ballDisc ? ballDisc.vel.y : undefined;

  // Do not resolve if velocities are already separating
  if (velAlongNormal < 0) {
    const restitution = Math.min(d1.bounciness, d2.bounciness);
    const impulseMag = (-(1 + restitution) * velAlongNormal) / totalInvMass;

    d1.vel.addScaled(normal, impulseMag * invMass1);
    d2.vel.addScaled(normal, -impulseMag * invMass2);
  }

  if (onCollision) {
    onCollision({ type: 'disc-disc', discA: d1, discB: d2, preBallVx, preBallVy });
  }

  return true;
}

/**
 * Resolves collision between a circular disc and a static line segment
 * using closest-point projection and inverse mass impulse reflection.
 */
export function resolveDiscSegmentCollision(
  disc: Disc,
  seg: Segment,
  onCollision?: (e: CollisionEvent) => void,
  kickoffContext?: KickoffPhysicsContext | null
): boolean {
  if (disc.invMass === 0) return false;
  if ((disc.cGroup & seg.cMask) === 0 || (seg.cGroup & disc.cMask) === 0) return false;

  const closest = Vec2.t0;
  const t = closestPointOnSegment(disc.pos.x, disc.pos.y, seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y, closest);

  const diff = Vec2.t1.copy(disc.pos).sub(closest);
  const distSq = diff.lenSq();

  if (distSq >= disc.radius * disc.radius) return false;

  const isEndpoint = (t <= 1e-6 || t >= 1 - 1e-6);

  // Eliminación de Impulsos de Vértice Espurios en círculo de saque:
  if (isEndpoint && kickoffContext?.active && kickoffContext.possessingTeam && !disc.isBall) {
    const isPossessing =
      (kickoffContext.possessingTeam === 'red' && (disc.cGroup & COLLISION_GROUP_RED) !== 0) ||
      (kickoffContext.possessingTeam === 'blue' && (disc.cGroup & COLLISION_GROUP_BLUE) !== 0);

    if (isPossessing) {
      const isSeamVertex =
        Math.abs(closest.x) < 0.5 &&
        Math.abs(Math.abs(closest.y) - kickoffContext.centerRadius) < 1.0;
      if (isSeamVertex) {
        return false;
      }
    }
  }

  // Extinción instantánea de la comba al chocar contra segmentos o paredes
  if (disc.isBall && (disc.isCurving || disc.isCurvingAllowed || disc.spin !== 0 || disc.magnusTimer > 0)) {
    disc.resetCurve();
  }

  const dist = Math.sqrt(distSq);
  const normal = Vec2.t2;

  if (dist > 1e-9) {
    normal.copy(diff).scale(1 / dist);
  } else {
    // Normal perpendicular to segment
    const segDir = Vec2.t3.copy(seg.p1).sub(seg.p0).normalize();
    normal.set(-segDir.y, segDir.x);
  }

  const penetration = disc.radius - dist;

  // Positional separation (segment has infinite mass)
  disc.pos.addScaled(normal, penetration);

  // Impulse reflection / velocity resolution along normal
  const velAlongNormal = disc.vel.dot(normal);
  if (velAlongNormal < 0) {
    if (isEndpoint && !disc.isBall) {
      // Extremos de segmento como puntos estáticos con radio 0 (deslizamiento tangencial en esquinas)
      disc.vel.addScaled(normal, -velAlongNormal);
    } else {
      const restitution = Math.min(disc.bounciness, seg.bounciness);
      const impulseMag = -(1 + restitution) * velAlongNormal;
      disc.vel.addScaled(normal, impulseMag);
    }
  }

  if (onCollision) {
    onCollision({ type: 'disc-segment', discA: disc, segment: seg });
  }

  return true;
}

export interface StadiumBoundariesConfig {
  halfWidth?: number;       // default 600
  halfHeight?: number;      // default 270
  goalHalfHeight?: number;  // default 85
  goalDepth?: number;       // default 35 (fondo de red X = ±635)
  runOff?: number;          // default 45 (zona de escape para jugadores)
}

/**
 * Resuelve la delimitación analítica completa del estadio para la predicción local del cliente,
 * permitiendo la zona de escape exterior (run-off) y la libre circulación en el interior de la portería.
 */
export function resolveGoalAndPitchBoundaries(
  pos: { x: number; y: number },
  vel: { x: number; y: number },
  radius: number = 15,
  config: StadiumBoundariesConfig = {}
): void {
  const pitchHw = config.halfWidth ?? 600;
  const pitchHh = config.halfHeight ?? 270;
  const runOff = config.runOff ?? 0;
  const extHw = pitchHw + runOff;
  const extHh = pitchHh + runOff;
  const gh = config.goalHalfHeight ?? 85;
  const gd = config.goalDepth ?? 35;
  const netX = pitchHw + gd;

  // 1. Paredes perimetrales superior e inferior del campo exterior (y = ±extHh)
  if (pos.y < -extHh + radius) {
    pos.y = -extHh + radius;
    if (vel.y < 0) vel.y = 0;
  } else if (pos.y > extHh - radius) {
    pos.y = extHh - radius;
    if (vel.y > 0) vel.y = 0;
  }

  // 2. Paridad Geométrica con Host
  if (runOff === 0) {
    const absX = Math.abs(pos.x);
    if (absX >= pitchHw && absX <= netX + radius) {
      if (pos.y < -gh + radius) {
        pos.y = -gh + radius;
        if (vel.y < 0) vel.y = 0;
      } else if (pos.y > gh - radius) {
        pos.y = gh - radius;
        if (vel.y > 0) vel.y = 0;
      }
    }

    if (Math.abs(pos.y) > gh) {
      if (pos.x < -extHw + radius) {
        pos.x = -extHw + radius;
        if (vel.x < 0) vel.x = 0;
      } else if (pos.x > extHw - radius) {
        pos.x = extHw - radius;
        if (vel.x > 0) vel.x = 0;
      }
    } else {
      if (pos.x < -netX + radius) {
        pos.x = -netX + radius;
        if (vel.x < 0) vel.x = 0;
      } else if (pos.x > netX - radius) {
        pos.x = netX - radius;
        if (vel.x > 0) vel.x = 0;
      }
    }
  } else {
    if (pos.x < -extHw + radius) {
      pos.x = -extHw + radius;
      if (vel.x < 0) vel.x = 0;
    } else if (pos.x > extHw - radius) {
      pos.x = extHw - radius;
      if (vel.x > 0) vel.x = 0;
    }
  }

  // 4. Colisión analítica de los 4 postes en (±pitchHw, ±gh) con radio = 8
  const postR = 8;
  const minPostDist = radius + postR;
  const minPostDistSq = minPostDist * minPostDist;

  const postsX = [-pitchHw, -pitchHw, pitchHw, pitchHw];
  const postsY = [-gh, gh, -gh, gh];

  for (let i = 0; i < 4; i++) {
    const postX = postsX[i];
    const postY = postsY[i];
    const dx = pos.x - postX;
    const dy = pos.y - postY;
    const dSq = dx * dx + dy * dy;

    if (dSq < minPostDistSq && dSq > 1e-6) {
      const dist = Math.sqrt(dSq);
      const nx = dx / dist;
      const ny = dy / dist;
      pos.x = postX + nx * minPostDist;
      pos.y = postY + ny * minPostDist;

      const vDotN = vel.x * nx + vel.y * ny;
      if (vDotN < 0) {
        vel.x -= vDotN * nx;
        vel.y -= vDotN * ny;
      }
    }
  }
}

/**
 * Resuelve la colisión predictiva círculo-círculo no-host en el cliente,
 * erradicando la superposición visual (clipping) antes de la llegada del snapshot.
 */
export function resolvePredictivePlayerCollision(
  localPos: { x: number; y: number },
  localVel: { x: number; y: number },
  localRadius: number,
  otherPos: { x: number; y: number },
  otherVel: { x: number; y: number },
  otherRadius: number,
  restitution: number = 0.5
): boolean {
  const dx = localPos.x - otherPos.x;
  const dy = localPos.y - otherPos.y;
  const distSq = dx * dx + dy * dy;
  const radiusSum = localRadius + otherRadius;

  if (distSq >= radiusSum * radiusSum) return false;

  const dist = Math.sqrt(distSq);
  let nx = 1;
  let ny = 0;
  if (dist > 1e-9) {
    nx = dx / dist;
    ny = dy / dist;
  }

  // Penetración posicional instantánea en el jugador local
  const overlap = radiusSum - dist;
  localPos.x += nx * overlap;
  localPos.y += ny * overlap;

  // Reflexión elástica de la velocidad
  const relVel = (localVel.x - otherVel.x) * nx + (localVel.y - otherVel.y) * ny;
  if (relVel < 0) {
    const impulse = -(1 + restitution) * relVel;
    localVel.x += nx * impulse * 0.5;
    localVel.y += ny * impulse * 0.5;
  }

  return true;
}

/**
 * Resuelve la colisión predictiva analítica entre el jugador local y el balón (No-Host anti-clipping).
 * Aplica ponderación estricta por masa inversa (ratio jugador = 0.25) y atenuación elástica del impulso (e = 0.2)
 * para erradicar el efecto flash/strobing y evitar discrepancias oscilatorias con el Host.
 * Zero GC: utiliza únicamente primitivas escalares.
 */
export function resolvePredictiveBallCollision(
  localPos: { x: number; y: number },
  localVel: { x: number; y: number },
  playerRadius: number,
  ballPos: { x: number; y: number },
  ballRadius: number = 10
): boolean {
  const dx = localPos.x - ballPos.x;
  const dy = localPos.y - ballPos.y;
  const distSq = dx * dx + dy * dy;
  const minDist = playerRadius + ballRadius;

  if (distSq >= minDist * minDist) return false;

  const dist = Math.sqrt(distSq);
  let nx = 1;
  let ny = 0;

  if (dist > 1e-9) {
    nx = dx / dist;
    ny = dy / dist;
  }

  // Ponderación estricta por masa relativa: ratio_player = 0.25 (el 75% restante lo absorbe la pelota en el Host)
  const overlap = minDist - dist;
  const playerDisplacement = overlap * 0.25;
  localPos.x += nx * playerDisplacement;
  localPos.y += ny * playerDisplacement;

  // Atenuación elástica amortiguada del impulso normal (e = 0.2, ratio = 0.25)
  const vn = localVel.x * nx + localVel.y * ny;
  if (vn < 0) {
    const impulse = (1 + 0.2) * vn * 0.25;
    localVel.x -= impulse * nx;
    localVel.y -= impulse * ny;
  }

  return true;
}

const _sepLocalVel = { x: 0, y: 0 };
const _sepOtherVel = { x: 0, y: 0 };

/**
 * Clamps a disc to stadium boundaries while allowing entry into the goal pocket
 * (`|y| <= goalHalfHeight` up to `±(arenaHalfW + goalDepth - r)`) and keeping
 * discs clear of the four goalposts. Zero-GC in-place mutation.
 */
export function clampDiscToGoalAwareBounds(
  disc: { x: number; y: number; vx?: number; vy?: number; radius: number },
  arenaHalfW: number,
  arenaHalfH: number,
  goalHalfHeight: number = 0,
  goalDepth: number = 0
): void {
  const r = disc.radius;

  if (arenaHalfH > 0) {
    const maxY = Math.max(0, arenaHalfH - r);
    if (disc.y < -maxY) {
      disc.y = -maxY;
      if (disc.vy !== undefined && disc.vy < 0) disc.vy = 0;
    } else if (disc.y > maxY) {
      disc.y = maxY;
      if (disc.vy !== undefined && disc.vy > 0) disc.vy = 0;
    }
  }

  if (arenaHalfW > 0) {
    const pitchMaxX = Math.max(0, arenaHalfW - r);
    const hasGoalPocket = goalHalfHeight > 0 && goalDepth > 0;

    if (hasGoalPocket) {
      const clampedGoalHalfH = arenaHalfH > 0 ? Math.min(goalHalfHeight, arenaHalfH) : goalHalfHeight;
      const goalMaxY = Math.max(0, clampedGoalHalfH - r);
      const goalMaxX = Math.max(0, arenaHalfW + goalDepth - r);

      if (Math.abs(disc.y) <= clampedGoalHalfH) {
        if (Math.abs(disc.x) > arenaHalfW) {
          if (disc.y < -goalMaxY) {
            disc.y = -goalMaxY;
            if (disc.vy !== undefined && disc.vy < 0) disc.vy = 0;
          } else if (disc.y > goalMaxY) {
            disc.y = goalMaxY;
            if (disc.vy !== undefined && disc.vy > 0) disc.vy = 0;
          }
        }
        if (disc.x < -goalMaxX) {
          disc.x = -goalMaxX;
          if (disc.vx !== undefined && disc.vx < 0) disc.vx = 0;
        } else if (disc.x > goalMaxX) {
          disc.x = goalMaxX;
          if (disc.vx !== undefined && disc.vx > 0) disc.vx = 0;
        }
      } else {
        if (disc.x < -pitchMaxX) {
          disc.x = -pitchMaxX;
          if (disc.vx !== undefined && disc.vx < 0) disc.vx = 0;
        } else if (disc.x > pitchMaxX) {
          disc.x = pitchMaxX;
          if (disc.vx !== undefined && disc.vx > 0) disc.vx = 0;
        }
      }

      const minPostDist = r + 8;
      const minPostDistSq = minPostDist * minPostDist;
      for (let p = 0; p < 4; p++) {
        const px = p < 2 ? -arenaHalfW : arenaHalfW;
        const py = (p & 1) === 0 ? -clampedGoalHalfH : clampedGoalHalfH;
        const dx = disc.x - px;
        const dy = disc.y - py;
        const dSq = dx * dx + dy * dy;
        if (dSq < minPostDistSq && dSq > 1e-9) {
          const dist = Math.sqrt(dSq);
          const nx = dx / dist;
          const ny = dy / dist;
          disc.x = px + nx * minPostDist;
          disc.y = py + ny * minPostDist;
          if (disc.vx !== undefined && disc.vy !== undefined) {
            const vDotN = disc.vx * nx + disc.vy * ny;
            if (vDotN < 0) {
              disc.vx -= vDotN * nx;
              disc.vy -= vDotN * ny;
            }
          }
        }
      }

      if (arenaHalfH > 0) {
        const maxY = Math.max(0, arenaHalfH - r);
        if (disc.y < -maxY) disc.y = -maxY;
        else if (disc.y > maxY) disc.y = maxY;
      }
      if (disc.x < -goalMaxX) disc.x = -goalMaxX;
      else if (disc.x > goalMaxX) disc.x = goalMaxX;
    } else {
      if (disc.x < -pitchMaxX) {
        disc.x = -pitchMaxX;
        if (disc.vx !== undefined && disc.vx < 0) disc.vx = 0;
      } else if (disc.x > pitchMaxX) {
        disc.x = pitchMaxX;
        if (disc.vx !== undefined && disc.vx > 0) disc.vx = 0;
      }
    }
  }
}

function separateBallAndDisc(
  disc: { x: number; y: number; radius: number; vx?: number; vy?: number },
  ball: { x: number; y: number; radius: number; vx?: number; vy?: number },
  arenaHalfW: number,
  arenaHalfH: number,
  goalHalfHeight: number,
  goalDepth: number,
  localVelForImpulse: { x: number; y: number } | null
): void {
  const dx = ball.x - disc.x;
  const dy = ball.y - disc.y;
  const distSq = dx * dx + dy * dy;
  const minDist = disc.radius + ball.radius;

  if (distSq >= minDist * minDist) return;

  const dist = Math.sqrt(distSq);
  const nx = dist > 1e-9 ? dx / dist : 1;
  const ny = dist > 1e-9 ? dy / dist : 0;
  const overlap = minDist - dist;

  const prevBallX = ball.x;
  const prevBallY = ball.y;
  const ballShare = overlap * 0.75;
  ball.x += nx * ballShare;
  ball.y += ny * ballShare;
  clampDiscToGoalAwareBounds(ball, arenaHalfW, arenaHalfH, goalHalfHeight, goalDepth);

  const actualBallShift = Math.max(0, (ball.x - prevBallX) * nx + (ball.y - prevBallY) * ny);
  const discShare = Math.max(0, overlap - actualBallShift);
  disc.x -= nx * discShare;
  disc.y -= ny * discShare;
  clampDiscToGoalAwareBounds(disc, arenaHalfW, arenaHalfH, goalHalfHeight, goalDepth);

  // If clamping either disc left residual overlap, push the unconstrained side out to ensure 100% separation
  const remDx = ball.x - disc.x;
  const remDy = ball.y - disc.y;
  const remDistSq = remDx * remDx + remDy * remDy;
  if (remDistSq < (minDist - 1e-6) * (minDist - 1e-6)) {
    const remDist = Math.sqrt(remDistSq);
    const rNx = remDist > 1e-9 ? remDx / remDist : nx;
    const rNy = remDist > 1e-9 ? remDy / remDist : ny;
    const remOverlap = minDist - remDist;
    const prevBX2 = ball.x;
    const prevBY2 = ball.y;
    ball.x += rNx * remOverlap;
    ball.y += rNy * remOverlap;
    clampDiscToGoalAwareBounds(ball, arenaHalfW, arenaHalfH, goalHalfHeight, goalDepth);
    const ballMoved2 = Math.max(0, (ball.x - prevBX2) * rNx + (ball.y - prevBY2) * rNy);
    const discRem = Math.max(0, remOverlap - ballMoved2);
    if (discRem > 1e-6) {
      disc.x -= rNx * discRem;
      disc.y -= rNy * discRem;
      clampDiscToGoalAwareBounds(disc, arenaHalfW, arenaHalfH, goalHalfHeight, goalDepth);
    }
  }

  if (localVelForImpulse) {
    const vn = localVelForImpulse.x * nx + localVelForImpulse.y * ny;
    if (vn > 0) {
      const impulse = (1 + 0.2) * vn * 0.25;
      localVelForImpulse.x -= impulse * nx;
      localVelForImpulse.y -= impulse * ny;
    }
  }
}

/**
 * Applies full (100%) client-side predictive render separation between the local predicted disc
 * and remote render discs (ball & other players). Callers must pass cloned/scratch render objects
 * in `otherDiscs` when snapshot immutability is required across frames.
 */
export function applyPredictiveRenderSeparation(
  localDisc: { x: number; y: number; vx: number; vy: number; radius: number },
  otherDiscs: Array<{ id: number; team: number; x: number; y: number; vx: number; vy: number; radius: number }>,
  arenaHalfW: number,
  arenaHalfH: number,
  goalHalfHeight?: number,
  goalDepth?: number
): void {
  const effectiveGoalHalfH =
    goalHalfHeight !== undefined ? goalHalfHeight : (arenaHalfH > 0 ? Math.min(85, arenaHalfH * 0.4) : 0);
  const effectiveGoalDepth =
    goalDepth !== undefined ? goalDepth : (arenaHalfW > 0 ? 36 : 0);

  _sepLocalVel.x = localDisc.vx;
  _sepLocalVel.y = localDisc.vy;

  let ballDisc: { id: number; team: number; x: number; y: number; vx: number; vy: number; radius: number } | null = null;
  for (let i = 0; i < otherDiscs.length; i++) {
    const d = otherDiscs[i]!;
    if (d.id === 0 || d.team === 0) {
      ballDisc = d;
      break;
    }
  }

  // Pass 1: Separate ball vs remote players so remote players never visually clip the ball
  if (ballDisc) {
    for (let i = 0; i < otherDiscs.length; i++) {
      const other = otherDiscs[i]!;
      if (other === ballDisc || other.id === 0 || other.team === 0) continue;
      separateBallAndDisc(other, ballDisc, arenaHalfW, arenaHalfH, effectiveGoalHalfH, effectiveGoalDepth, null);
    }
  }

  // Pass 2: Separate localDisc vs ball (75/25 clamped 100%) and localDisc vs remote players
  for (let i = 0; i < otherDiscs.length; i++) {
    const other = otherDiscs[i]!;
    if (other.id === 0 || other.team === 0) {
      separateBallAndDisc(
        localDisc,
        other,
        arenaHalfW,
        arenaHalfH,
        effectiveGoalHalfH,
        effectiveGoalDepth,
        _sepLocalVel
      );
    } else {
      _sepOtherVel.x = other.vx;
      _sepOtherVel.y = other.vy;
      resolvePredictivePlayerCollision(
        localDisc,
        _sepLocalVel,
        localDisc.radius,
        other,
        _sepOtherVel,
        other.radius
      );
    }
  }

  localDisc.vx = _sepLocalVel.x;
  localDisc.vy = _sepLocalVel.y;
  clampDiscToGoalAwareBounds(localDisc, arenaHalfW, arenaHalfH, effectiveGoalHalfH, effectiveGoalDepth);

  // Pass 3: Reconcile any residual overlap with ball induced by player-player separation or wall clamping
  if (ballDisc) {
    for (let i = 0; i < otherDiscs.length; i++) {
      const other = otherDiscs[i]!;
      if (other === ballDisc || other.id === 0 || other.team === 0) continue;
      separateBallAndDisc(other, ballDisc, arenaHalfW, arenaHalfH, effectiveGoalHalfH, effectiveGoalDepth, null);
    }

    const dx = ballDisc.x - localDisc.x;
    const dy = ballDisc.y - localDisc.y;
    const minDist = localDisc.radius + ballDisc.radius;
    if (dx * dx + dy * dy < (minDist - 1e-6) * (minDist - 1e-6)) {
      separateBallAndDisc(
        localDisc,
        ballDisc,
        arenaHalfW,
        arenaHalfH,
        effectiveGoalHalfH,
        effectiveGoalDepth,
        null
      );
    }
  }
}

/**
 * Continuous Collision Detection (CCD) helper:
 * Computes whether a swept circle starting at p0 and moving by velocity * dt
 * intersects an obstacle circle (e.g. post) within interval [0, 1].
 */
export function sweptCircleCircle(
  p0: Vec2,
  v: Vec2,
  dt: number,
  rA: number,
  centerB: Vec2,
  rB: number
): { hit: boolean; toi: number; normal: Vec2 } {
  const d = Vec2.t0.set(v.x * dt, v.y * dt);
  const m = Vec2.t1.copy(p0).sub(centerB);
  const r = rA + rB;

  const a = d.dot(d);
  const b = 2 * m.dot(d);
  const c = m.dot(m) - r * r;

  // Already overlapping at t = 0
  if (c <= 0) {
    const norm = m.len() > 1e-6 ? m.normalize() : Vec2.t2.set(1, 0);
    return { hit: true, toi: 0, normal: norm.clone() };
  }

  if (a < 1e-9) {
    return { hit: false, toi: 1, normal: new Vec2() };
  }

  const discr = b * b - 4 * a * c;
  if (discr < 0) {
    return { hit: false, toi: 1, normal: new Vec2() };
  }

  const sqrtDiscr = Math.sqrt(discr);
  const t = (-b - sqrtDiscr) / (2 * a);

  if (t >= 0 && t <= 1) {
    const hitPosA = Vec2.t2.copy(p0).addScaled(d, t);
    const norm = Vec2.t3.copy(hitPosA).sub(centerB).normalize();
    return { hit: true, toi: t, normal: norm.clone() };
  }

  return { hit: false, toi: 1, normal: new Vec2() };
}
