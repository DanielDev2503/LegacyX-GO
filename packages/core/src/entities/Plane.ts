import { Vec2 } from '../math/Vec2';
import { Disc, COLLISION_GROUP_ALL, COLLISION_GROUP_WALL } from './Disc';

export interface PlaneOptions {
  normalX: number;
  normalY: number;
  dist: number;
  bounciness?: number;
  cGroup?: number;
  cMask?: number;
}

/**
 * Plano delimitador 2D infinito (n.x * x + n.y * y = dist).
 * Normal apunta hacia el interior del campo activo.
 */
export class Plane {
  public normal: Vec2;
  public dist: number;
  public bounciness: number;
  public cGroup: number;
  public cMask: number;

  constructor(options: PlaneOptions) {
    const len = Math.hypot(options.normalX, options.normalY);
    if (len > 1e-9) {
      this.normal = new Vec2(options.normalX / len, options.normalY / len);
    } else {
      this.normal = new Vec2(0, 1);
    }
    this.dist = options.dist;
    this.bounciness = options.bounciness ?? 0.8;
    this.cGroup = options.cGroup ?? COLLISION_GROUP_WALL;
    this.cMask = options.cMask ?? COLLISION_GROUP_ALL;
  }

  /**
   * Distancia con signo desde el punto al plano: d = n · p - dist
   */
  public distanceToPoint(x: number, y: number): number {
    return this.normal.x * x + this.normal.y * y - this.dist;
  }

  /**
   * Resuelve la colisión contra un disco si penetra la región negativa del plano.
   */
  public resolveDisc(disc: Disc): boolean {
    if ((this.cGroup & disc.cMask) === 0 || (disc.cGroup & this.cMask) === 0) {
      return false;
    }

    const dist = this.distanceToPoint(disc.pos.x, disc.pos.y);
    if (dist < disc.radius) {
      const penetration = disc.radius - dist;
      disc.pos.x += this.normal.x * penetration;
      disc.pos.y += this.normal.y * penetration;

      const velAlongNormal = disc.vel.x * this.normal.x + disc.vel.y * this.normal.y;
      if (velAlongNormal < 0) {
        const restitution = Math.min(this.bounciness, disc.bounciness);
        const impulse = -(1 + restitution) * velAlongNormal;
        disc.vel.x += this.normal.x * impulse;
        disc.vel.y += this.normal.y * impulse;
      }
      return true;
    }
    return false;
  }
}
