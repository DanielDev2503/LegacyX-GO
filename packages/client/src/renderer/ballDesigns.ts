/**
 * ballDesigns.ts
 * Canonical renderer for all ball skins in LegacyX-GO:
 * 'classic' | 'retro' | 'neon' | 'cyber' | 'gold' | 'solid' |
 * 'wc2006' | 'wc2010' | 'wc2014' | 'wc2018' | 'wc2022' | 'wc2026'
 * Used identically in-game (DiscRenderer), UI previews (SettingsModal), and ReplayHudCompositor.
 */

export const WORLD_CUP_BALL_SKINS = [
  'wc2006',
  'wc2010',
  'wc2014',
  'wc2018',
  'wc2022',
  'wc2026'
] as const;

export type WorldCupBallSkin = (typeof WORLD_CUP_BALL_SKINS)[number];

export type BallSkin =
  | 'classic'
  | 'retro'
  | 'neon'
  | 'cyber'
  | 'gold'
  | 'solid'
  | 'champions'
  | WorldCupBallSkin;

export function isBallSkin(value: string): value is BallSkin {
  return (
    value === 'classic' ||
    value === 'retro' ||
    value === 'neon' ||
    value === 'cyber' ||
    value === 'gold' ||
    value === 'solid' ||
    value === 'champions' ||
    (WORLD_CUP_BALL_SKINS as readonly string[]).includes(value)
  );
}

export interface DrawBallDesignOptions {
  x: number;
  y: number;
  radius: number;
  skin: BallSkin;
  ballMode?: 'texture' | 'color';
  customColor?: string;
  rotX?: number;
  rotY?: number;
  isPowerShot?: boolean;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_NORM = 1 / Math.sqrt(1 + PHI * PHI);

const ICOSA_X = new Float32Array([
  -1 * INV_NORM,  1 * INV_NORM, -1 * INV_NORM,  1 * INV_NORM,
   0,             0,             0,             0,
  -PHI * INV_NORM, PHI * INV_NORM, -PHI * INV_NORM, PHI * INV_NORM
]);

const ICOSA_Y = new Float32Array([
  -PHI * INV_NORM, -PHI * INV_NORM,  PHI * INV_NORM,  PHI * INV_NORM,
  -1 * INV_NORM,   1 * INV_NORM, -1 * INV_NORM,   1 * INV_NORM,
   0,              0,             0,              0
]);

const ICOSA_Z = new Float32Array([
   0,              0,             0,              0,
  -PHI * INV_NORM, -PHI * INV_NORM,  PHI * INV_NORM,  PHI * INV_NORM,
  -1 * INV_NORM,  -1 * INV_NORM,  1 * INV_NORM,   1 * INV_NORM
]);

type Vec3 = [number, number, number];

function normalize3(vx: number, vy: number, vz: number): Vec3 {
  const len = Math.hypot(vx, vy, vz) || 1;
  return [vx / len, vy / len, vz / len];
}

function rotatePoint(
  vx: number,
  vy: number,
  vz: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): Vec3 {
  const x1 = vx * cosX + vz * sinX;
  const z1 = -vx * sinX + vz * cosX;
  const y2 = vy * cosY - z1 * sinY;
  const z2 = vy * sinY + z1 * cosY;
  return [x1, y2, z2];
}

function buildTangentBasis(n: Vec3): { u: Vec3; v: Vec3 } {
  const [nx, ny, nz] = n;
  const rx = Math.abs(ny) < 0.9 ? 0 : 1;
  const ry = Math.abs(ny) < 0.9 ? 1 : 0;
  const rz = 0;
  // u = normalize(ref x n)
  const ux = ry * nz - rz * ny;
  const uy = rz * nx - rx * nz;
  const uz = rx * ny - ry * nx;
  const u = normalize3(ux, uy, uz);
  // v = n x u
  const v: Vec3 = [
    ny * u[2] - nz * u[1],
    nz * u[0] - nx * u[2],
    nx * u[1] - ny * u[0]
  ];
  return { u, v };
}

function fillPearlWhiteBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  edgeStop: string = '#CBD5E1'
): void {
  if (typeof ctx.createRadialGradient === 'function') {
    const baseGrad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
    baseGrad.addColorStop(0, '#FFFFFF');
    baseGrad.addColorStop(0.38, '#F8FAFC');
    baseGrad.addColorStop(0.75, '#E2E8F0');
    baseGrad.addColorStop(1, edgeStop);
    ctx.fillStyle = baseGrad;
  } else {
    ctx.fillStyle = '#FFFFFF';
  }
  ctx.fill();
}

/**
 * Projects a 2D polygon defined in the tangent plane of unit normal `normal` onto the rotating sphere.
 * Subdivides each edge so panels curve smoothly around the spherical surface.
 */
function drawSphericalPatch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  normal: Vec3,
  localPoly: ReadonlyArray<[number, number]>,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number,
  fillStyle: string,
  strokeStyle?: string,
  lineWidth: number = 1,
  subdivisions: number = 3,
  minCenterZ: number = -0.22
): void {
  const n = normalize3(normal[0], normal[1], normal[2]);
  const centerRot = rotatePoint(n[0], n[1], n[2], cosX, sinX, cosY, sinY);
  if (centerRot[2] < minCenterZ) return;

  const { u, v } = buildTangentBasis(n);
  const pts: Array<[number, number]> = [];
  let hasFrontVertex = false;

  for (let i = 0; i < localPoly.length; i++) {
    const [u0, v0] = localPoly[i]!;
    const [u1, v1] = localPoly[(i + 1) % localPoly.length]!;
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const lu = u0 + (u1 - u0) * t;
      const lv = v0 + (v1 - v0) * t;
      const sp = normalize3(
        n[0] + lu * u[0] + lv * v[0],
        n[1] + lu * u[1] + lv * v[1],
        n[2] + lu * u[2] + lv * v[2]
      );
      const rp = rotatePoint(sp[0], sp[1], sp[2], cosX, sinX, cosY, sinY);
      let sx = rp[0];
      let sy = rp[1];
      if (rp[2] > 0.01) {
        hasFrontVertex = true;
      } else if (rp[2] < 0) {
        const xyLen = Math.hypot(sx, sy) || 1;
        sx /= xyLen;
        sy /= xyLen;
      }
      pts.push([cx + sx * radius, cy + sy * radius]);
    }
  }

  if (pts.length < 3 || !hasFrontVertex) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]![0], pts[i]![1]);
  }
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/**
 * Strokes a 3D curve sampled parametrically on the unit sphere (front hemisphere with clean horizon crossing).
 */
function strokeSphericalCurve(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  steps: number,
  sampleFn: (t: number) => Vec3,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number,
  strokeStyle: string,
  lineWidth: number
): void {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  let prevRp: Vec3 | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const raw = sampleFn(t);
    const sp = normalize3(raw[0], raw[1], raw[2]);
    const rp = rotatePoint(sp[0], sp[1], sp[2], cosX, sinX, cosY, sinY);
    if (rp[2] >= 0) {
      if (!started && prevRp && prevRp[2] < 0) {
        // Interpolate the exact horizon crossing so curves run smoothly to the sphere silhouette
        const frac = -prevRp[2] / (rp[2] - prevRp[2]);
        const hx = prevRp[0] + (rp[0] - prevRp[0]) * frac;
        const hy = prevRp[1] + (rp[1] - prevRp[1]) * frac;
        ctx.moveTo(cx + hx * radius, cy + hy * radius);
        started = true;
      }
      const sx = cx + rp[0] * radius;
      const sy = cy + rp[1] * radius;
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
    } else {
      if (started && prevRp && prevRp[2] >= 0) {
        const frac = prevRp[2] / (prevRp[2] - rp[2]);
        const hx = prevRp[0] + (rp[0] - prevRp[0]) * frac;
        const hy = prevRp[1] + (rp[1] - prevRp[1]) * frac;
        ctx.lineTo(cx + hx * radius, cy + hy * radius);
      }
      started = false;
    }
    prevRp = rp;
  }
  ctx.stroke();
}

function drawMeridianLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  count: number,
  stepRad: number,
  minZ: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  for (let m = 0; m < count; m++) {
    const phi = (m * Math.PI) / count;
    ctx.beginPath();
    let started = false;
    for (let s = -Math.PI; s <= Math.PI; s += stepRad) {
      const pX0 = Math.sin(s) * Math.cos(phi);
      const pY0 = Math.cos(s);
      const pZ0 = Math.sin(s) * Math.sin(phi);
      const [pX2, pY2, pZ2] = rotatePoint(pX0, pY0, pZ0, cosX, sinX, cosY, sinY);
      if (pZ2 >= minZ) {
        const sx = x + pX2 * radius;
        const sy = y + pY2 * radius;
        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();
  }
}

function drawIcosaPatches(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  patchScale: number,
  fillColor: string | null,
  strokeColor: string,
  lineWidth: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;

  for (let k = 0; k < 12; k++) {
    const [vX2, vY2, vZ2] = rotatePoint(ICOSA_X[k]!, ICOSA_Y[k]!, ICOSA_Z[k]!, cosX, sinX, cosY, sinY);
    if (vZ2 > 0.05 && fillColor) {
      const px = x + vX2 * radius;
      const py = y + vY2 * radius;
      const patchR = radius * patchScale * Math.sqrt(vZ2);
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(px, py, patchR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      const dx = ICOSA_X[a]! - ICOSA_X[b]!;
      const dy = ICOSA_Y[a]! - ICOSA_Y[b]!;
      const dz = ICOSA_Z[a]! - ICOSA_Z[b]!;
      if (dx * dx + dy * dy + dz * dz < 1.15) {
        const [vX2a, vY2a, vZ2a] = rotatePoint(ICOSA_X[a]!, ICOSA_Y[a]!, ICOSA_Z[a]!, cosX, sinX, cosY, sinY);
        const [vX2b, vY2b, vZ2b] = rotatePoint(ICOSA_X[b]!, ICOSA_Y[b]!, ICOSA_Z[b]!, cosX, sinX, cosY, sinY);
        if (vZ2a > -0.1 && vZ2b > -0.1) {
          ctx.beginPath();
          ctx.moveTo(x + vX2a * radius, y + vY2a * radius);
          ctx.lineTo(x + vX2b * radius, y + vY2b * radius);
          ctx.stroke();
        }
      }
    }
  }
}

const CUBE_NORMALS: ReadonlyArray<Vec3> = [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0]
];

const OCTANT_NORMALS: ReadonlyArray<Vec3> = [
  [1, 1, 1],
  [-1, 1, 1],
  [1, -1, 1],
  [-1, -1, 1],
  [1, 1, -1],
  [-1, 1, -1],
  [1, -1, -1],
  [-1, -1, -1]
];

const TETRA_NORMALS: ReadonlyArray<Vec3> = [
  [0, 0, 1],
  [0.942809, 0, -0.333333],
  [-0.471405, 0.816497, -0.333333],
  [-0.471405, -0.816497, -0.333333]
];

function rotatePoly2D(poly: ReadonlyArray<[number, number]>, rad: number): Array<[number, number]> {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return poly.map(([u, v]) => [u * c - v * s, u * s + v * c]);
}

function scalePoly2D(poly: ReadonlyArray<[number, number]>, scale: number): Array<[number, number]> {
  return poly.map(([u, v]) => [u * scale, v * scale]);
}

function rectPoly(u0: number, v0: number, u1: number, v1: number): ReadonlyArray<[number, number]> {
  return [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1]
  ];
}

function buildReuleauxRing(baseR: number, lobiness: number, steps: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const r = baseR * (1 + lobiness * Math.cos(3 * (theta + Math.PI / 6)));
    pts.push([Math.cos(theta) * r, Math.sin(theta) * r]);
  }
  return pts;
}

// --- Precomputed World Cup Panel Geometry (zero per-frame allocation) ---

const TEAMGEIST_PROPELLER: ReadonlyArray<[number, number]> = [
  [0, -0.56],
  [0.16, -0.52],
  [0.29, -0.39],
  [0.27, -0.24],
  [0.14, -0.11],
  [0.105, 0],
  [0.14, 0.11],
  [0.27, 0.24],
  [0.29, 0.39],
  [0.16, 0.52],
  [0, 0.56],
  [-0.16, 0.52],
  [-0.29, 0.39],
  [-0.27, 0.24],
  [-0.14, 0.11],
  [-0.105, 0],
  [-0.14, -0.11],
  [-0.27, -0.24],
  [-0.29, -0.39],
  [-0.16, -0.52]
];
const TEAMGEIST_PROPELLER_90 = rotatePoly2D(TEAMGEIST_PROPELLER, Math.PI / 2);
const TEAMGEIST_INNER_GOLD = scalePoly2D(TEAMGEIST_PROPELLER, 0.72);
const TEAMGEIST_INNER_GOLD_90 = scalePoly2D(TEAMGEIST_PROPELLER_90, 0.72);
const TEAMGEIST_CREST: ReadonlyArray<[number, number]> = [
  [0, -0.43],
  [0.09, -0.35],
  [0.06, -0.25],
  [-0.06, -0.25],
  [-0.09, -0.35]
];

const JABULANI_RING_BLACK = buildReuleauxRing(0.57, 0.22, 24);
const JABULANI_RING_RED = buildReuleauxRing(0.47, 0.22, 24);
const JABULANI_RING_GREEN = buildReuleauxRing(0.37, 0.22, 24);
const JABULANI_RING_YELLOW = buildReuleauxRing(0.27, 0.22, 24);
const JABULANI_CORE_WHITE = buildReuleauxRing(0.18, 0.2, 18);
const JABULANI_CREST: ReadonlyArray<[number, number]> = [
  [0, -0.075],
  [0.065, 0.05],
  [-0.065, 0.05]
];

const BRAZUCA_STAR: ReadonlyArray<[number, number]> = [
  [0, -0.15],
  [0.036, -0.036],
  [0.15, 0],
  [0.036, 0.036],
  [0, 0.15],
  [-0.036, 0.036],
  [-0.15, 0],
  [-0.036, -0.036]
];

const TELSTAR_TRAP_CORE: ReadonlyArray<[number, number]> = [
  [-0.18, -0.28],
  [0.18, -0.28],
  [0.28, 0.2],
  [-0.28, 0.2]
];
const TELSTAR_PIXELS_MID_DARK: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  rectPoly(-0.27, -0.28, -0.18, -0.02),
  rectPoly(0.18, -0.28, 0.27, -0.02),
  rectPoly(-0.34, 0.02, -0.24, 0.22),
  rectPoly(0.24, 0.02, 0.34, 0.22),
  rectPoly(-0.14, -0.37, 0.14, -0.28)
];
const TELSTAR_PIXELS_SLATE: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  rectPoly(-0.36, -0.18, -0.27, -0.06),
  rectPoly(0.27, -0.18, 0.36, -0.06),
  rectPoly(-0.42, 0.06, -0.34, 0.18),
  rectPoly(0.34, 0.06, 0.42, 0.18),
  rectPoly(-0.24, 0.2, -0.08, 0.29),
  rectPoly(0.08, 0.2, 0.24, 0.29)
];
const TELSTAR_PIXELS_LIGHT: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  rectPoly(-0.44, -0.08, -0.36, 0.02),
  rectPoly(0.36, -0.08, 0.44, 0.02),
  rectPoly(-0.24, -0.37, -0.15, -0.29),
  rectPoly(0.15, -0.37, 0.24, -0.29)
];
const TELSTAR_TRAP_CORE_90 = rotatePoly2D(TELSTAR_TRAP_CORE, Math.PI / 2);
const TELSTAR_PIXELS_MID_DARK_90 = TELSTAR_PIXELS_MID_DARK.map((p) => rotatePoly2D(p, Math.PI / 2));
const TELSTAR_PIXELS_SLATE_90 = TELSTAR_PIXELS_SLATE.map((p) => rotatePoly2D(p, Math.PI / 2));
const TELSTAR_PIXELS_LIGHT_90 = TELSTAR_PIXELS_LIGHT.map((p) => rotatePoly2D(p, Math.PI / 2));
const TELSTAR_COPPER_BARS: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  rectPoly(-0.08, 0.1, -0.035, 0.17),
  rectPoly(-0.02, 0.06, 0.025, 0.17),
  rectPoly(0.04, 0.02, 0.085, 0.17)
];
const TELSTAR_GOLD_TRIM: ReadonlyArray<[number, number]> = rectPoly(-0.085, 0.18, 0.085, 0.225);

const AL_RIHLA_FACET_A: ReadonlyArray<[number, number]> = [
  [0, 0],
  [0.52, -0.28],
  [0.14, -0.56]
];
const AL_RIHLA_FACET_B: ReadonlyArray<[number, number]> = [
  [0, 0],
  [-0.48, -0.32],
  [-0.24, 0.46]
];
const AL_RIHLA_SAIL_A: ReadonlyArray<[number, number]> = [
  [-0.46, -0.36],
  [-0.14, -0.44],
  [0.24, -0.22],
  [0.06, -0.08],
  [-0.16, 0.06],
  [-0.26, 0.36],
  [-0.38, 0.08]
];
const AL_RIHLA_STRIPE_A: ReadonlyArray<[number, number]> = [
  [-0.36, -0.28],
  [-0.12, -0.34],
  [0.14, -0.18],
  [-0.08, -0.08],
  [-0.24, 0.22]
];
const AL_RIHLA_SAIL_B: ReadonlyArray<[number, number]> = [
  [0.04, -0.46],
  [0.42, -0.14],
  [0.5, 0.14],
  [0.24, 0.12],
  [0.02, 0.28],
  [-0.12, 0.12],
  [0.12, -0.06]
];
const AL_RIHLA_STRIPE_B: ReadonlyArray<[number, number]> = [
  [0.1, -0.34],
  [0.36, -0.08],
  [0.4, 0.08],
  [0.16, 0.08],
  [0.02, 0.18]
];
const AL_RIHLA_SAIL_C: ReadonlyArray<[number, number]> = [
  [-0.24, 0.14],
  [0.08, 0.16],
  [0.42, 0.22],
  [0.14, 0.46],
  [-0.1, 0.48],
  [-0.16, 0.28]
];
const AL_RIHLA_CENTER_MARK: ReadonlyArray<[number, number]> = [
  [0, -0.1],
  [0.09, 0.07],
  [-0.09, 0.07]
];

const TRIONDA_LOBE_RED: ReadonlyArray<[number, number]> = [
  [-0.04, -0.05],
  [-0.04, -0.32],
  [-0.14, -0.58],
  [-0.38, -0.64],
  [-0.62, -0.44],
  [-0.68, -0.16],
  [-0.48, 0.06],
  [-0.22, 0.05]
];
const TRIONDA_WAVE_RED: ReadonlyArray<[number, number]> = [
  [-0.14, -0.12],
  [-0.22, -0.42],
  [-0.44, -0.48],
  [-0.52, -0.24],
  [-0.34, -0.08]
];
const TRIONDA_MAPLE_HIGHLIGHT: ReadonlyArray<[number, number]> = [
  [-0.34, -0.36],
  [-0.28, -0.28],
  [-0.34, -0.2],
  [-0.4, -0.28]
];

const TRIONDA_LOBE_BLUE: ReadonlyArray<[number, number]> = [
  [0.04, -0.05],
  [0.22, 0.05],
  [0.48, 0.06],
  [0.68, -0.16],
  [0.62, -0.44],
  [0.38, -0.64],
  [0.14, -0.58],
  [0.04, -0.32]
];
const TRIONDA_WAVE_BLUE: ReadonlyArray<[number, number]> = [
  [0.14, -0.12],
  [0.34, -0.08],
  [0.52, -0.24],
  [0.44, -0.48],
  [0.22, -0.42]
];
const TRIONDA_STAR_HIGHLIGHT: ReadonlyArray<[number, number]> = [
  [0.34, -0.37],
  [0.39, -0.28],
  [0.34, -0.2],
  [0.29, -0.28]
];

const TRIONDA_LOBE_GREEN: ReadonlyArray<[number, number]> = [
  [0, 0.05],
  [0.22, 0.14],
  [0.36, 0.36],
  [0.24, 0.62],
  [0, 0.7],
  [-0.24, 0.62],
  [-0.36, 0.36],
  [-0.22, 0.14]
];
const TRIONDA_WAVE_GREEN: ReadonlyArray<[number, number]> = [
  [0, 0.16],
  [0.18, 0.28],
  [0.14, 0.5],
  [-0.14, 0.5],
  [-0.18, 0.28]
];
const TRIONDA_EAGLE_HIGHLIGHT: ReadonlyArray<[number, number]> = [
  [0, 0.28],
  [0.08, 0.37],
  [0, 0.43],
  [-0.08, 0.37]
];

const TRIONDA_CENTER_HUB: ReadonlyArray<[number, number]> = [
  [0, -0.16],
  [0.06, -0.04],
  [0.17, 0.06],
  [0, 0.08],
  [-0.17, 0.06],
  [-0.06, -0.04]
];

function drawWc2006Teamgeist(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  // Teamgeist (Alemania 2006): pearl white with curved black propeller panels + metallic gold borders & crest
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const seamW = Math.max(0.75, radius * 0.052);
  for (let axis = 0; axis < 3; axis++) {
    strokeSphericalCurve(
      ctx,
      x,
      y,
      radius,
      44,
      (t) => {
        const a = t * Math.PI * 2;
        const wave = 0.28 * Math.sin(a * 2);
        if (axis === 0) return [Math.cos(a), Math.sin(a), wave];
        if (axis === 1) return [wave, Math.cos(a), Math.sin(a)];
        return [Math.sin(a), wave, Math.cos(a)];
      },
      cosX,
      sinX,
      cosY,
      sinY,
      '#94A3B8',
      seamW
    );
  }

  const goldW = Math.max(1.05, radius * 0.085);
  const innerGoldW = Math.max(0.55, radius * 0.032);
  for (let i = 0; i < CUBE_NORMALS.length; i++) {
    const n = CUBE_NORMALS[i]!;
    const prop = i % 2 === 0 ? TEAMGEIST_PROPELLER : TEAMGEIST_PROPELLER_90;
    const innerProp = i % 2 === 0 ? TEAMGEIST_INNER_GOLD : TEAMGEIST_INNER_GOLD_90;
    drawSphericalPatch(ctx, x, y, radius, n, prop, cosX, sinX, cosY, sinY, '#111827', '#D4AF37', goldW, 2);
    drawSphericalPatch(ctx, x, y, radius, n, innerProp, cosX, sinX, cosY, sinY, '', '#D4AF37', innerGoldW, 2);
    if (i < 2) {
      drawSphericalPatch(
        ctx,
        x,
        y,
        radius,
        n,
        TEAMGEIST_CREST,
        cosX,
        sinX,
        cosY,
        sinY,
        '#111827',
        '#D4AF37',
        innerGoldW,
        1
      );
    }
  }
}

function drawWc2010Jabulani(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  // Jabulani (Sudáfrica 2010): crisp white sphere with 4 sweeping multi-color South African triangular ring loops
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const seamW = Math.max(0.7, radius * 0.048);
  for (let axis = 0; axis < 3; axis++) {
    strokeSphericalCurve(
      ctx,
      x,
      y,
      radius,
      36,
      (t) => {
        const a = t * Math.PI * 2;
        if (axis === 0) return [Math.cos(a), Math.sin(a), 0.18 * Math.cos(a * 3)];
        if (axis === 1) return [0.18 * Math.cos(a * 3), Math.cos(a), Math.sin(a)];
        return [Math.sin(a), 0.18 * Math.cos(a * 3), Math.cos(a)];
      },
      cosX,
      sinX,
      cosY,
      sinY,
      '#CBD5E1',
      seamW
    );
  }

  for (let i = 0; i < TETRA_NORMALS.length; i++) {
    const n = TETRA_NORMALS[i]!;
    drawSphericalPatch(ctx, x, y, radius, n, JABULANI_RING_BLACK, cosX, sinX, cosY, sinY, '#141414', '#94A3B8', seamW * 0.7, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, JABULANI_RING_RED, cosX, sinX, cosY, sinY, '#D62828', undefined, 0, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, JABULANI_RING_GREEN, cosX, sinX, cosY, sinY, '#16A34A', undefined, 0, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, JABULANI_RING_YELLOW, cosX, sinX, cosY, sinY, '#FACC15', undefined, 0, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, JABULANI_CORE_WHITE, cosX, sinX, cosY, sinY, '#FFFFFF', '#CBD5E1', seamW * 0.6, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, JABULANI_CREST, cosX, sinX, cosY, sinY, '#141414', '#FACC15', seamW * 0.6, 1, -0.45);
  }
}

function drawWc2014Brazuca(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  // Brazuca (Brasil 2014): white with dark-navy meandering S-ribbons enclosing multi-track colored cores + 4-point stars
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const seamW = Math.max(0.65, radius * 0.045);
  strokeSphericalCurve(
    ctx,
    x,
    y,
    radius,
    36,
    (t) => {
      const a = t * Math.PI * 2;
      return [Math.cos(a), 0.25 * Math.cos(a * 2), Math.sin(a)];
    },
    cosX,
    sinX,
    cosY,
    sinY,
    '#CBD5E1',
    seamW
  );

  const navyW = Math.max(2.6, radius * 0.27);
  const coreW = Math.max(1.6, radius * 0.16);
  const glowW = Math.max(0.7, radius * 0.065);

  const ribbons: ReadonlyArray<{ core: string; glow: string; fn: (t: number) => Vec3 }> = [
    {
      core: '#0284C7',
      glow: '#38BDF8',
      fn: (t) => {
        const a = t * Math.PI * 2;
        return [Math.cos(a), 0.62 * Math.sin(a * 2), Math.sin(a)];
      }
    },
    {
      core: '#F97316',
      glow: '#FACC15',
      fn: (t) => {
        const a = t * Math.PI * 2;
        return [0.62 * Math.sin(a * 2 + 0.7), Math.cos(a), Math.sin(a)];
      }
    },
    {
      core: '#10B981',
      glow: '#6EE7B7',
      fn: (t) => {
        const a = t * Math.PI * 2;
        return [Math.sin(a), Math.cos(a), 0.62 * Math.sin(a * 2 - 0.7)];
      }
    }
  ];

  for (let i = 0; i < ribbons.length; i++) {
    const r = ribbons[i]!;
    strokeSphericalCurve(ctx, x, y, radius, 48, r.fn, cosX, sinX, cosY, sinY, '#0B1B34', navyW);
    strokeSphericalCurve(ctx, x, y, radius, 48, r.fn, cosX, sinX, cosY, sinY, r.core, coreW);
    strokeSphericalCurve(ctx, x, y, radius, 48, r.fn, cosX, sinX, cosY, sinY, r.glow, glowW);
  }

  const starBorderW = Math.max(0.55, radius * 0.036);
  for (let i = 0; i < CUBE_NORMALS.length; i++) {
    drawSphericalPatch(ctx, x, y, radius, CUBE_NORMALS[i]!, BRAZUCA_STAR, cosX, sinX, cosY, sinY, '#FFFFFF', '#0B1B34', starBorderW, 1);
  }
}

function drawWc2018Telstar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  // Telstar 18 (Rusia 2018): crisp white with stepped halftone metallic black-to-slate pixel blocks + copper-gold accent
  fillPearlWhiteBase(ctx, x, y, radius, '#94A3B8');

  const seamW = Math.max(0.65, radius * 0.042);
  for (let axis = 0; axis < 2; axis++) {
    strokeSphericalCurve(
      ctx,
      x,
      y,
      radius,
      32,
      (t) => {
        const a = t * Math.PI * 2;
        return axis === 0 ? [Math.cos(a), Math.sin(a), 0] : [0, Math.cos(a), Math.sin(a)];
      },
      cosX,
      sinX,
      cosY,
      sinY,
      '#CBD5E1',
      seamW
    );
  }

  for (let i = 0; i < CUBE_NORMALS.length; i++) {
    const n = CUBE_NORMALS[i]!;
    const rotated = i % 2 === 1;
    const lightPixels = rotated ? TELSTAR_PIXELS_LIGHT_90 : TELSTAR_PIXELS_LIGHT;
    const slatePixels = rotated ? TELSTAR_PIXELS_SLATE_90 : TELSTAR_PIXELS_SLATE;
    const midDarkPixels = rotated ? TELSTAR_PIXELS_MID_DARK_90 : TELSTAR_PIXELS_MID_DARK;
    const corePoly = rotated ? TELSTAR_TRAP_CORE_90 : TELSTAR_TRAP_CORE;

    for (let p = 0; p < lightPixels.length; p++) {
      drawSphericalPatch(ctx, x, y, radius, n, lightPixels[p]!, cosX, sinX, cosY, sinY, '#64748B', undefined, 0, 1);
    }
    for (let p = 0; p < slatePixels.length; p++) {
      drawSphericalPatch(ctx, x, y, radius, n, slatePixels[p]!, cosX, sinX, cosY, sinY, '#334155', undefined, 0, 1);
    }
    for (let p = 0; p < midDarkPixels.length; p++) {
      drawSphericalPatch(ctx, x, y, radius, n, midDarkPixels[p]!, cosX, sinX, cosY, sinY, '#1E293B', undefined, 0, 1);
    }
    drawSphericalPatch(ctx, x, y, radius, n, corePoly, cosX, sinX, cosY, sinY, '#0F172A', '#475569', seamW, 1);

    if (i % 2 === 0) {
      for (let b = 0; b < TELSTAR_COPPER_BARS.length; b++) {
        drawSphericalPatch(ctx, x, y, radius, n, TELSTAR_COPPER_BARS[b]!, cosX, sinX, cosY, sinY, '#E85D04', undefined, 0, 1);
      }
      drawSphericalPatch(ctx, x, y, radius, n, TELSTAR_GOLD_TRIM, cosX, sinX, cosY, sinY, '#EAB308', undefined, 0, 1);
    }
  }
}

function drawWc2022AlRihla(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  // Al Rihla (Qatar 2022): pearl white Speedshell facets with swept dhow-sail boomerang panels in azure, cyan, magenta, amber
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const creaseW = Math.max(0.55, radius * 0.032);
  const trimW = Math.max(0.65, radius * 0.044);

  const palettes: ReadonlyArray<[string, string, string, string, string]> = [
    ['#0077B6', '#06B6D4', '#E11D48', '#F4A261', '#06B6D4'],
    ['#E11D48', '#F4A261', '#0077B6', '#06B6D4', '#E11D48'],
    ['#06B6D4', '#0077B6', '#F4A261', '#E11D48', '#0077B6'],
    ['#0077B6', '#F4A261', '#E11D48', '#06B6D4', '#F4A261']
  ];

  for (let i = 0; i < OCTANT_NORMALS.length; i++) {
    const n = OCTANT_NORMALS[i]!;
    const p = palettes[i % palettes.length]!;
    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_FACET_A, cosX, sinX, cosY, sinY, '', '#CBD5E1', creaseW, 1, -0.25);
    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_FACET_B, cosX, sinX, cosY, sinY, '', '#CBD5E1', creaseW, 1, -0.25);

    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_SAIL_A, cosX, sinX, cosY, sinY, p[0], '#023047', trimW, 1, -0.28);
    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_STRIPE_A, cosX, sinX, cosY, sinY, p[1], undefined, 0, 1, -0.28);
    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_SAIL_B, cosX, sinX, cosY, sinY, p[2], '#023047', trimW, 1, -0.28);
    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_STRIPE_B, cosX, sinX, cosY, sinY, p[3], undefined, 0, 1, -0.28);
    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_SAIL_C, cosX, sinX, cosY, sinY, p[4], '#FFFFFF', trimW * 0.85, 1, -0.28);
    drawSphericalPatch(ctx, x, y, radius, n, AL_RIHLA_CENTER_MARK, cosX, sinX, cosY, sinY, '#023047', undefined, 0, 1, -0.28);
  }
}

function drawWc2026Trionda(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): void {
  // Trionda (Copa 2026): crisp white sphere with 3 bold sweeping wave lobes (red, blue, green) & clean white Y-star hub
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const seamW = Math.max(0.85, radius * 0.052);
  for (let i = 0; i < TETRA_NORMALS.length; i++) {
    const n = TETRA_NORMALS[i]!;
    // Scarlet red upper-left wave lobe + internal white wave & maple-diamond accent
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_LOBE_RED, cosX, sinX, cosY, sinY, '#EF4444', '#0F172A', seamW, 2, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_WAVE_RED, cosX, sinX, cosY, sinY, '#FFFFFF', undefined, 0, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_MAPLE_HIGHLIGHT, cosX, sinX, cosY, sinY, '#EF4444', undefined, 0, 1, -0.45);

    // Royal blue upper-right wave lobe + internal white wave & star-diamond accent
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_LOBE_BLUE, cosX, sinX, cosY, sinY, '#2563EB', '#0F172A', seamW, 2, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_WAVE_BLUE, cosX, sinX, cosY, sinY, '#FFFFFF', undefined, 0, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_STAR_HIGHLIGHT, cosX, sinX, cosY, sinY, '#2563EB', undefined, 0, 1, -0.45);

    // Emerald green lower-center wave lobe + internal white wave & eagle-chevron accent
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_LOBE_GREEN, cosX, sinX, cosY, sinY, '#10B981', '#0F172A', seamW, 2, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_WAVE_GREEN, cosX, sinX, cosY, sinY, '#FFFFFF', undefined, 0, 1, -0.45);
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_EAGLE_HIGHLIGHT, cosX, sinX, cosY, sinY, '#10B981', undefined, 0, 1, -0.45);

    // Clean white central Y-junction star hub
    drawSphericalPatch(ctx, x, y, radius, n, TRIONDA_CENTER_HUB, cosX, sinX, cosY, sinY, '#FFFFFF', '#0F172A', seamW * 0.75, 1, -0.45);
  }
}

function getRimColor(skin: BallSkin): string {
  switch (skin) {
    case 'neon':
      return '#EA580C';
    case 'retro':
      return '#451A03';
    case 'cyber':
      return '#00E5FF';
    case 'gold':
      return '#CA8A04';
    case 'champions':
      return '#1D4ED8';
    case 'wc2006':
      return '#D4AF37';
    case 'wc2010':
      return '#16A34A';
    case 'wc2014':
      return '#0284C7';
    case 'wc2018':
      return '#334155';
    case 'wc2022':
      return '#E11D48';
    case 'wc2026':
      return '#2563EB';
    default:
      return '#0284C7';
  }
}

export function drawBallDesign(ctx: CanvasRenderingContext2D, opts: DrawBallDesignOptions): void {
  const {
    x,
    y,
    radius,
    skin = 'classic',
    ballMode = 'texture',
    customColor = '#ffffff',
    rotX = 0,
    rotY = 0,
    isPowerShot = false
  } = opts;

  ctx.save();

  // 1. Power Shot Aura
  if (isPowerShot && typeof ctx.createRadialGradient === 'function') {
    ctx.save();
    const auraGrad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 3.2);
    auraGrad.addColorStop(0, 'rgba(255, 215, 0, 0.85)');
    auraGrad.addColorStop(0.45, 'rgba(255, 107, 0, 0.45)');
    auraGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Soft ground shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(x + 1.5, y + radius * 0.45, radius * 0.95, radius * 0.55, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(x + 1.5, y + 3, radius, 0, Math.PI * 2);
  }
  ctx.fill();

  // 3. Spherical clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (typeof ctx.clip === 'function') {
    ctx.clip();
  }

  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);

  if (ballMode === 'color' || skin === 'solid') {
    ctx.fillStyle = customColor || '#ffffff';
    ctx.fill();
    if (typeof ctx.createRadialGradient === 'function') {
      const shine = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
      shine.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      shine.addColorStop(0.35, 'rgba(255, 255, 255, 0.20)');
      shine.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)');
      shine.addColorStop(1, 'rgba(0, 0, 0, 0.40)');
      ctx.fillStyle = shine;
      ctx.fill();
    }
  } else if (skin === 'retro') {
    if (typeof ctx.createRadialGradient === 'function') {
      const baseGrad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
      baseGrad.addColorStop(0, '#D97706');
      baseGrad.addColorStop(0.3, '#B45309');
      baseGrad.addColorStop(0.7, '#78350F');
      baseGrad.addColorStop(1, '#451A03');
      ctx.fillStyle = baseGrad;
    } else {
      ctx.fillStyle = '#B45309';
    }
    ctx.fill();
    ctx.strokeStyle = '#291507';
    ctx.lineWidth = Math.max(1.1, radius * 0.09);
    ctx.lineCap = 'round';
    drawMeridianLines(ctx, x, y, radius, 3, 0.2, -0.15, cosX, sinX, cosY, sinY);
  } else if (skin === 'neon') {
    if (typeof ctx.createRadialGradient === 'function') {
      const baseGrad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
      baseGrad.addColorStop(0, '#FEF08A');
      baseGrad.addColorStop(0.35, '#FACC15');
      baseGrad.addColorStop(0.7, '#FB923C');
      baseGrad.addColorStop(1, '#EA580C');
      ctx.fillStyle = baseGrad;
    } else {
      ctx.fillStyle = '#FACC15';
    }
    ctx.fill();
    ctx.strokeStyle = '#C2410C';
    ctx.lineWidth = Math.max(1.2, radius * 0.1);
    drawMeridianLines(ctx, x, y, radius, 4, 0.25, -0.1, cosX, sinX, cosY, sinY);
  } else if (skin === 'cyber') {
    if (typeof ctx.createRadialGradient === 'function') {
      const baseGrad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
      baseGrad.addColorStop(0, '#38BDF8');
      baseGrad.addColorStop(0.25, '#0284C7');
      baseGrad.addColorStop(0.65, '#0369A1');
      baseGrad.addColorStop(1, '#082F49');
      ctx.fillStyle = baseGrad;
    } else {
      ctx.fillStyle = '#0284C7';
    }
    ctx.fill();
    drawIcosaPatches(
      ctx,
      x,
      y,
      radius,
      0.132,
      '#00F0FF',
      '#00E5FF',
      Math.max(1.1, radius * 0.08),
      cosX,
      sinX,
      cosY,
      sinY
    );
  } else if (skin === 'gold') {
    if (typeof ctx.createRadialGradient === 'function') {
      const baseGrad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
      baseGrad.addColorStop(0, '#FEF9C3');
      baseGrad.addColorStop(0.3, '#FACC15');
      baseGrad.addColorStop(0.65, '#CA8A04');
      baseGrad.addColorStop(1, '#713F12');
      ctx.fillStyle = baseGrad;
    } else {
      ctx.fillStyle = '#EAB308';
    }
    ctx.fill();
    drawIcosaPatches(
      ctx,
      x,
      y,
      radius,
      0.26,
      '#451A03',
      '#854D0E',
      Math.max(1.0, radius * 0.08),
      cosX,
      sinX,
      cosY,
      sinY
    );
  } else if (skin === 'champions') {
    // UEFA Champions League Starball: pearl silver sphere + 3D midnight-navy stars & cyan trim
    fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = Math.max(0.8, radius * 0.05);
    for (let i = 0; i < 12; i++) {
      const [rx, ry, rz] = rotatePoint(ICOSA_X[i], ICOSA_Y[i], ICOSA_Z[i], cosX, sinX, cosY, sinY);
      if (rz <= -0.15) continue;
      const sx = x + rx * radius;
      const sy = y + ry * radius;
      const starR = radius * 0.34 * (0.65 + 0.35 * Math.max(0, rz));
      ctx.save();
      ctx.translate?.(sx, sy);
      ctx.rotate?.(Math.atan2(ry, rx));
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const angle = (p * Math.PI) / 5 - Math.PI / 2;
        const rPt = p % 2 === 0 ? starR : starR * 0.44;
        const px = Math.cos(angle) * rPt;
        const py = Math.sin(angle) * rPt;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = rz > 0.45 ? '#0B1F52' : '#1E3A8A';
      ctx.fill();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = Math.max(0.7, radius * 0.045);
      ctx.stroke();
      ctx.restore();
    }
  } else if (skin === 'wc2006') {
    drawWc2006Teamgeist(ctx, x, y, radius, cosX, sinX, cosY, sinY);
  } else if (skin === 'wc2010') {
    drawWc2010Jabulani(ctx, x, y, radius, cosX, sinX, cosY, sinY);
  } else if (skin === 'wc2014') {
    drawWc2014Brazuca(ctx, x, y, radius, cosX, sinX, cosY, sinY);
  } else if (skin === 'wc2018') {
    drawWc2018Telstar(ctx, x, y, radius, cosX, sinX, cosY, sinY);
  } else if (skin === 'wc2022') {
    drawWc2022AlRihla(ctx, x, y, radius, cosX, sinX, cosY, sinY);
  } else if (skin === 'wc2026') {
    drawWc2026Trionda(ctx, x, y, radius, cosX, sinX, cosY, sinY);
  } else {
    fillPearlWhiteBase(ctx, x, y, radius, '#94A3B8');
    drawIcosaPatches(
      ctx,
      x,
      y,
      radius,
      0.28,
      '#0F172A',
      '#334155',
      Math.max(1.0, radius * 0.08),
      cosX,
      sinX,
      cosY,
      sinY
    );
  }

  // 4. Specular 3D spherical highlight
  if (typeof ctx.createRadialGradient === 'function') {
    const highlightGrad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 0, x, y, radius);
    highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    highlightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    highlightGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = highlightGrad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.restore(); // remove clip

  // 5. Outer perimeter stroke (inward so visual edge equals physical hitbox)
  const rimWidth = 1.4;
  ctx.strokeStyle = getRimColor(skin);
  ctx.lineWidth = rimWidth;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, radius - rimWidth * 0.5), 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
