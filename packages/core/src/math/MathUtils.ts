import { Vec2 } from './Vec2';

export const EPSILON = 1e-6;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Projects a point (px, py) onto line segment AB and sets result into outVec.
 * Returns projection factor t clamped to [0, 1].
 */
export function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  outVec: Vec2
): number {
  const abX = bx - ax;
  const abY = by - ay;
  const abLenSq = abX * abX + abY * abY;

  if (abLenSq < EPSILON) {
    outVec.set(ax, ay);
    return 0;
  }

  const apX = px - ax;
  const apY = py - ay;
  const t = clamp((apX * abX + apY * abY) / abLenSq, 0, 1);

  outVec.set(ax + abX * t, ay + abY * t);
  return t;
}

/**
 * Quantizes a float value to the nearest step.
 */
export function quantize(value: number, step: number = 0.01): number {
  return Math.round(value / step) * step;
}

/**
 * Quantizes coordinate to integer fixed-point for compact network protocol (e.g., int16 with 1/10th or 1/100th px precision).
 */
export function quantizeCoord(value: number, precision: number = 10): number {
  return Math.round(value * precision);
}

/**
 * Dequantizes integer back to float coordinate.
 */
export function dequantizeCoord(value: number, precision: number = 10): number {
  return value / precision;
}

/**
 * Normalizes an angle into the [-PI, PI] range.
 */
export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
