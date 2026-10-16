import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Disc, COLLISION_GROUP_BALL, COLLISION_GROUP_ALL, COLLISION_GROUP_WALL } from '../src/entities/Disc';
import { Segment } from '../src/entities/Segment';

describe('Continuous Collision Detection (CCD) and Anti-Tunneling', () => {
  it('prevents ball tunneling through a thin post at 1,200 px/s in a single tick', () => {
    const world = new PhysicsWorld({ fixedDt: 1 / 60, maxSubsteps: 16 });

    // Poste estático de radio 5 px en (40, 0)
    const post = new Disc({
      id: 99,
      x: 40,
      y: 0,
      radius: 5,
      mass: 0, // Inercia infinita (estático)
      bounciness: 0.85,
      cGroup: COLLISION_GROUP_WALL,
      cMask: COLLISION_GROUP_ALL,
      isPost: true
    });

    // Balón de radio 10 px lanzado a 1,200 px/s hacia el poste desde (15, 0)
    // Desplazamiento en 1 tick = 1200 * (1/60) = 20 px -> Sin CCD saltaría a x = 35 (atravesando el contacto a x = 25)
    const ball = new Disc({
      id: 0,
      x: 15,
      y: 0,
      radius: 10,
      mass: 0.2,
      damping: 1.0, // Sin fricción para aislar la prueba de impulso
      bounciness: 0.80,
      cGroup: COLLISION_GROUP_BALL,
      cMask: COLLISION_GROUP_ALL,
      isBall: true
    });
    ball.vel.set(1200, 0);

    world.addDisc(post);
    world.addDisc(ball);

    // Ejecutar un único tick físico de 1/60s
    world.step(1 / 60);

    // La superficie de contacto ocurre cuando dist = r_ball (10) + r_post (5) = 15 px (x_ball = 40 - 15 = 25 px)
    // El balón no debe haber cruzado el centro del poste (x <= 40) y debe haber rebotado con velocidad negativa
    expect(ball.pos.x).toBeLessThanOrEqual(25.1);
    expect(ball.vel.x).toBeLessThan(0); // Rebote confirmado
  });

  it('prevents ball tunneling through a thin vertical segment wall at 1,200 px/s', () => {
    const world = new PhysicsWorld({ fixedDt: 1 / 60, maxSubsteps: 16 });

    // Muro vertical delgado en x = 60
    const wall = new Segment({
      id: 1,
      x0: 60,
      y0: -100,
      x1: 60,
      y1: 100,
      bounciness: 0.80,
      cGroup: COLLISION_GROUP_WALL,
      cMask: COLLISION_GROUP_BALL
    });

    // Balón en x = 45 lanzado a 1,200 px/s (en 1 tick avanzaría 20 px hasta x = 65, cruzando el muro)
    const ball = new Disc({
      id: 0,
      x: 45,
      y: 0,
      radius: 10,
      mass: 0.2,
      damping: 1.0,
      bounciness: 0.80,
      cGroup: COLLISION_GROUP_BALL,
      cMask: COLLISION_GROUP_ALL,
      isBall: true
    });
    ball.vel.set(1200, 0);

    world.addSegment(wall);
    world.addDisc(ball);

    world.step(1 / 60);

    // El balón debe rebotar antes de penetrar la pared (x <= 60 - 10 = 50) y tener velocidad hacia la izquierda
    expect(ball.pos.x).toBeLessThanOrEqual(50.1);
    expect(ball.vel.x).toBeLessThan(0);
  });
});
