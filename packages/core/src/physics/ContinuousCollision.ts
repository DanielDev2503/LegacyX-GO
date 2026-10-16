import { Vec2 } from '../math/Vec2';
import { closestPointOnSegment, clamp } from '../math/MathUtils';
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

  let invMass1 = d1.invMass;
  let invMass2 = d2.invMass;

  // Mecánica de Tackle cinemático
  if (!d1.isBall && !d2.isBall) {
    if (d1.isDashing) {
      invMass1 /= 1.8;
    } else if (d1.isTurbo) {
      invMass1 /= 2.17;
    }
    if (d2.isDashing) {
      invMass2 /= 1.8;
    } else if (d2.isTurbo) {
      invMass2 /= 2.17;
    }
  }

  const totalInvMass = invMass1 + invMass2;
  if (totalInvMass <= 0) return false;

  // Vector de distancia de d2 a d1
  const diff = Vec2.t0.copy(d1.pos).sub(d2.pos);
  const distSq = diff.lenSq();
  const radiusSum = d1.radius + d2.radius;

  if (distSq >= radiusSum * radiusSum) return false;

  const dist = Math.sqrt(distSq);
  const normal = Vec2.t1;

  if (dist > 1e-9) {
    normal.copy(diff).scale(1 / dist);
  } else {
    normal.set(1, 0);
  }

  // Penetración y separación proporcional a masas inversas
  const penetration = radiusSum - dist;
  const correctionMagnitude = penetration / totalInvMass;

  d1.pos.addScaled(normal, correctionMagnitude * invMass1);
  d2.pos.addScaled(normal, -correctionMagnitude * invMass2);

  // Velocidad relativa a lo largo de la normal
  const relVel = Vec2.t2.copy(d1.vel).sub(d2.vel);
  const velAlongNormal = relVel.dot(normal);

  if (velAlongNormal < 0) {
    // Extinción de comba si colisiona con un objeto distinto al pateador
    if (d1.isBall && (d1.isCurving || d1.isCurvingAllowed) && d2.id !== d1.lastKickerDiscId) {
      d1.resetCurve();
    }
    if (d2.isBall && (d2.isCurving || d2.isCurvingAllowed) && d1.id !== d2.lastKickerDiscId) {
      d2.resetCurve();
    }

    const restitution = Math.min(d1.bounciness, d2.bounciness);
    const impulseMag = (-(1 + restitution) * velAlongNormal) / totalInvMass;

    d1.vel.addScaled(normal, impulseMag * invMass1);
    d2.vel.addScaled(normal, -impulseMag * invMass2);
  }

  if (onCollision) {
    onCollision({ type: 'disc-disc', discA: d1, discB: d2 });
  }

  return true;
}

/**
 * Resolves collision between a circular disc and a static line segment.
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

  if (disc.isBall && (disc.isCurving || disc.isCurvingAllowed)) {
    disc.resetCurve();
  }

  const dist = Math.sqrt(distSq);
  const normal = Vec2.t2;

  if (dist > 1e-9) {
    normal.copy(diff).scale(1 / dist);
  } else {
    const segDir = Vec2.t3.copy(seg.p1).sub(seg.p0).normalize();
    normal.set(-segDir.y, segDir.x);
  }

  const penetration = disc.radius - dist;
  disc.pos.addScaled(normal, penetration);

  const velAlongNormal = disc.vel.dot(normal);
  if (velAlongNormal < 0) {
    if (isEndpoint && !disc.isBall) {
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
