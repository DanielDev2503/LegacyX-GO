import { Disc, COLLISION_GROUP_BALL } from '../entities/Disc';
import { Segment } from '../entities/Segment';
import { GoalNet } from './GoalNet';
import { Stadium } from '../stadiums/Stadium';
import {
  resolveDiscDiscCollision,
  resolveDiscSegmentCollision,
  CollisionEvent,
  KickoffPhysicsContext
} from './ContinuousCollision';
import { clamp } from '../math/MathUtils';

export interface PhysicsWorldConfig {
  gravityX?: number;
  gravityY?: number;
  fixedDt?: number;
  maxSubsteps?: number;
  kickMargin?: number;
  magnusCoefficient?: number;
}

export class PhysicsWorld {
  public discs: Disc[] = [];
  public segments: Segment[] = [];
  public goalNets: GoalNet[] = [];
  public readonly fixedDt: number = 1 / 60; // 60 Hz estricto e invariable
  public maxSubsteps: number;
  public kickMargin: number;
  public magnusCoefficient: number;
  public onCollision?: (event: CollisionEvent) => void;
  public onSubstep?: (subDt: number) => void;
  public kickoffContext?: KickoffPhysicsContext | null = null;

  constructor(config: PhysicsWorldConfig = {}) {
    this.fixedDt = 1 / 60; // Invariable
    this.maxSubsteps = config.maxSubsteps ?? 8;
    this.kickMargin = config.kickMargin ?? 4.0;
    this.magnusCoefficient = config.magnusCoefficient ?? 0;
  }

  public addDisc(disc: Disc): void {
    if (!this.discs.includes(disc)) {
      this.discs.push(disc);
    }
  }

  public removeDisc(disc: Disc): void {
    const idx = this.discs.indexOf(disc);
    if (idx !== -1) {
      this.discs.splice(idx, 1);
    }
  }

  public addSegment(segment: Segment): void {
    if (!this.segments.includes(segment)) {
      this.segments.push(segment);
    }
  }

  public removeSegment(segment: Segment): void {
    const idx = this.segments.indexOf(segment);
    if (idx !== -1) {
      this.segments.splice(idx, 1);
    }
  }

  public clearSegments(): void {
    this.segments = [];
  }

  /**
   * Carga un estadio en el mundo físico purgando muros rígidos de fondo de arco
   * e instanciando automáticamente la física elástica subamortiguada (GoalNet).
   */
  public loadStadium(stadium: Stadium): void {
    this.clearSegments();
    if (this.discs.length > 0) {
      this.discs = this.discs.filter(d => !d.isPost);
    }

    let leftXPost = -stadium.halfWidth;
    let rightXPost = stadium.halfWidth;
    let leftYPost = stadium.goalHalfHeight;
    let rightYPost = stadium.goalHalfHeight;

    if (stadium.goals && stadium.goals.length >= 2) {
      const gRed = stadium.goals.find(g => g.team === 'red') || stadium.goals[0];
      const gBlue = stadium.goals.find(g => g.team === 'blue') || stadium.goals[1];
      leftXPost = Math.min(gRed.p0.x, gRed.p1.x);
      leftYPost = Math.max(Math.abs(gRed.p0.y), Math.abs(gRed.p1.y));
      rightXPost = Math.max(gBlue.p0.x, gBlue.p1.x);
      rightYPost = Math.max(Math.abs(gBlue.p0.y), Math.abs(gBlue.p1.y));
    }

    // Filtrar segmentos rígidos detrás de la línea de gol para permitir penetración del balón en red
    for (const seg of stadium.segments) {
      const minX = Math.min(seg.p0.x, seg.p1.x);
      const maxX = Math.max(seg.p0.x, seg.p1.x);
      const maxY = Math.max(Math.abs(seg.p0.y), Math.abs(seg.p1.y));

      const isLeftGoalArea = maxX < (leftXPost + 1) && maxY <= (leftYPost + 15);
      const isRightGoalArea = minX > (rightXPost - 1) && maxY <= (rightYPost + 15);

      if (isLeftGoalArea || isRightGoalArea) {
        seg.cMask = seg.cMask & ~COLLISION_GROUP_BALL;
      }
      this.addSegment(seg);
    }

    // Agregar postes físicos
    for (const post of stadium.posts) {
      post.isPost = true;
      this.addDisc(post);
    }

    // Instanciar GoalNet de caja con red elástica subamortiguada (N = 15 partículas, profundidad = 36 px)
    const depth = 36;
    const leftNet = new GoalNet({
      side: 'left',
      mouthX: leftXPost,
      backX: leftXPost - depth,
      depth,
      topY: -leftYPost,
      bottomY: leftYPost,
      nodeCount: 15
    });

    const rightNet = new GoalNet({
      side: 'right',
      mouthX: rightXPost,
      backX: rightXPost + depth,
      depth,
      topY: -rightYPost,
      bottomY: rightYPost,
      nodeCount: 15
    });

    this.goalNets = [leftNet, rightNet];
  }

  public get goalNetLeft(): GoalNet | undefined {
    return this.goalNets[0];
  }

  public get goalNetRight(): GoalNet | undefined {
    return this.goalNets[1];
  }

  /**
   * Ejecuta el avance determinista del tick físico a 60 Hz.
   * Realiza Continuous Collision Detection (CCD) y substepping adaptativo
   * si la velocidad proyectada del balón supera su propio radio (evitando tunelización > 900 px/s).
   * Cuando isReplay === true, omite la simulación de malla elástica GoalNet.
   */
  public step(dt: number = this.fixedDt, isReplay: boolean = false): void {
    const actualDt = this.fixedDt; // Garantía de invariabilidad temporal 60 Hz
    const discCount = this.discs.length;
    const segCount = this.segments.length;

    // 1. Detección de velocidad máxima y cálculo de substepping CCD
    let maxSpeedSq = 0;
    let minRadius = 10;
    let hasDashingDisc = false;
    let ball: Disc | undefined;

    for (let i = 0; i < discCount; i++) {
      const d = this.discs[i];
      if (d.isBall) {
        ball = d;
      }
      if (d.invMass > 0) {
        if (d.isDashing) {
          hasDashingDisc = true;
        }
        const speedSq = d.vel.lenSq();
        if (speedSq > maxSpeedSq) {
          maxSpeedSq = speedSq;
        }
        if (d.radius < minRadius) {
          minRadius = d.radius;
        }
      }
    }

    const maxSpeed = Math.sqrt(maxSpeedSq);
    const maxDisplacement = maxSpeed * actualDt;

    // Umbral crítico: ningún desplazamiento de tick debe ser superior a 0.45 veces el radio menor (CCD)
    const criticalThreshold = minRadius * 0.45;
    const neededSubsteps = Math.ceil(maxDisplacement / criticalThreshold);
    const minSubsteps = hasDashingDisc ? 4 : 1;
    const substeps = clamp(neededSubsteps, minSubsteps, Math.max(this.maxSubsteps, minSubsteps));
    const subDt = actualDt / substeps;

    // 2. Substepping de integración y resolución de colisiones
    for (let s = 0; s < substeps; s++) {
      // Guardar posición previa y avanzar posiciones
      for (let i = 0; i < discCount; i++) {
        const d = this.discs[i];
        if (d.invMass > 0) {
          d.prevPos.copy(d.pos);
          d.pos.x += d.vel.x * subDt;
          d.pos.y += d.vel.y * subDt;
        }
      }

      this.onSubstep?.(subDt);

      // Colisiones Disco vs Disco
      for (let i = 0; i < discCount; i++) {
        const d1 = this.discs[i];
        for (let j = i + 1; j < discCount; j++) {
          const d2 = this.discs[j];
          resolveDiscDiscCollision(d1, d2, this.onCollision);
        }
      }

      // Colisiones Disco vs Segmento
      for (let i = 0; i < discCount; i++) {
        const d = this.discs[i];
        if (d.invMass > 0) {
          for (let k = 0; k < segCount; k++) {
            resolveDiscSegmentCollision(d, this.segments[k], this.onCollision, this.kickoffContext);
          }
        }
      }

      // Amortiguamiento lineal (fricción proporcional por substep)
      for (let i = 0; i < discCount; i++) {
        const d = this.discs[i];
        if (d.invMass > 0) {
          const subDamping = Math.pow(d.damping, 1 / substeps);
          d.vel.x *= subDamping;
          d.vel.y *= subDamping;
        }
      }
    }

    // 3. Aplicación de aceleración lateral continua por efecto Magnus pasivo (para EngineInstance)
    if (this.magnusCoefficient > 0 && ball && ball.spin !== 0 && !ball.isCurving) {
      const speed = ball.vel.len();
      if (speed > 1.0) {
        const ax = -ball.vel.y * ball.spin * this.magnusCoefficient;
        const ay = ball.vel.x * ball.spin * this.magnusCoefficient;
        ball.vel.x += ax * actualDt;
        ball.vel.y += ay * actualDt;
      }
      ball.spin *= 0.985;
      if (Math.abs(ball.spin) < 0.01) ball.spin = 0;
    }

    // 4. Resolución física de redes elásticas de porterías (omitida si isReplay === true)
    if (!isReplay) {
      if (this.goalNetLeft) {
        this.goalNetLeft.step(actualDt);
        if (ball) this.goalNetLeft.checkBallCollision(ball);
      }
      if (this.goalNetRight) {
        this.goalNetRight.step(actualDt);
        if (ball) this.goalNetRight.checkBallCollision(ball);
      }
    }
  }

  public isWithinKickDistance(player: Disc, ball: Disc, margin: number = this.kickMargin): boolean {
    const maxDist = player.radius + ball.radius + margin;
    const dx = ball.pos.x - player.pos.x;
    const dy = ball.pos.y - player.pos.y;
    return (dx * dx + dy * dy) <= maxDist * maxDist;
  }

  public resetNets(smooth: boolean = false): void {
    for (let i = 0; i < this.goalNets.length; i++) {
      this.goalNets[i].resetShape(smooth);
    }
  }

  public stepNets(dt: number = 1 / 60): void {
    for (let i = 0; i < this.goalNets.length; i++) {
      this.goalNets[i].step(dt);
    }
  }

  public enforceMidfieldBarrier(disc: Disc, team: 'red' | 'blue'): void {
    PhysicsWorld.enforceMidfieldBarrierStatic(disc.pos, disc.vel, disc.radius, team);
  }

  public enforceKickoffPossessionBarrier(disc: Disc, team: 'red' | 'blue', centerRadius: number): void {
    PhysicsWorld.enforceKickoffPossessionBarrierStatic(disc.pos, disc.vel, disc.radius, team, centerRadius);
  }

  public static enforceMidfieldBarrierStatic(
    pos: { x: number; y: number },
    vel: { x: number; y: number },
    r: number,
    team: 'red' | 'blue'
  ): void {
    if (team === 'red') {
      if (pos.x + r > 0) {
        pos.x = -r;
        if (vel.x > 0) vel.x = 0;
      }
    } else if (team === 'blue') {
      if (pos.x - r < 0) {
        pos.x = r;
        if (vel.x < 0) vel.x = 0;
      }
    }
  }

  public static enforceKickoffPossessionBarrierStatic(
    pos: { x: number; y: number },
    vel: { x: number; y: number },
    r: number,
    team: 'red' | 'blue',
    centerRadius: number
  ): void {
    const rInner = centerRadius - r;
    if (rInner <= 0) return;
    const ySeam = Math.sqrt(Math.max(0, rInner * rInner - r * r));
    const absY = Math.abs(pos.y);

    if (team === 'red') {
      if (absY >= ySeam) {
        if (pos.x > -r) {
          pos.x = -r;
          if (vel.x > 0) vel.x = 0;
        }
      } else {
        if (pos.x > -r) {
          const dist = Math.hypot(pos.x, pos.y);
          if (dist > rInner) {
            const factor = rInner / dist;
            pos.x *= factor;
            pos.y *= factor;
            const nx = pos.x / rInner;
            const ny = pos.y / rInner;
            const vDotN = vel.x * nx + vel.y * ny;
            if (vDotN > 0) {
              vel.x -= vDotN * nx;
              vel.y -= vDotN * ny;
            }
          }
        }
      }
    } else if (team === 'blue') {
      if (absY >= ySeam) {
        if (pos.x < r) {
          pos.x = r;
          if (vel.x < 0) vel.x = 0;
        }
      } else {
        if (pos.x < r) {
          const dist = Math.hypot(pos.x, pos.y);
          if (dist > rInner) {
            const factor = rInner / dist;
            pos.x *= factor;
            pos.y *= factor;
            const nx = pos.x / rInner;
            const ny = pos.y / rInner;
            const vDotN = vel.x * nx + vel.y * ny;
            if (vDotN > 0) {
              vel.x -= vDotN * nx;
              vel.y -= vDotN * ny;
            }
          }
        }
      }
    }
  }
}
