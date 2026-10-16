import { Vec2 } from '../math/Vec2';
import { COLLISION_GROUP_ALL, COLLISION_GROUP_WALL } from './Disc';

export interface SegmentOptions {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bounciness?: number;
  cGroup?: number;
  cMask?: number;
  color?: string;
  visible?: boolean;
}

export class Segment {
  public id: number;
  public p0: Vec2;
  public p1: Vec2;
  public bounciness: number;
  public cGroup: number;
  public cMask: number;
  public color: string;
  public visible: boolean;

  // Normal unitaria orientada a 90 grados a la izquierda de p0 -> p1
  public normal: Vec2;

  constructor(options: SegmentOptions) {
    this.id = options.id;
    this.p0 = new Vec2(options.x0, options.y0);
    this.p1 = new Vec2(options.x1, options.y1);
    this.bounciness = options.bounciness ?? 0.8;
    this.cGroup = options.cGroup ?? COLLISION_GROUP_WALL;
    this.cMask = options.cMask ?? COLLISION_GROUP_ALL;
    this.color = options.color ?? '#64748b';
    this.visible = options.visible ?? true;

    // Calcular normal ortogonal normalizada
    const dx = this.p1.x - this.p0.x;
    const dy = this.p1.y - this.p0.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      this.normal = new Vec2(-dy / len, dx / len);
    } else {
      this.normal = new Vec2(0, 1);
    }
  }

  public length(): number {
    return this.p0.dist(this.p1);
  }
}
