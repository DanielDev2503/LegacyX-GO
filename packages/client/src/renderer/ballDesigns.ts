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
  | WorldCupBallSkin;

export function isBallSkin(value: string): value is BallSkin {
  return (
    value === 'classic' ||
    value === 'retro' ||
    value === 'neon' ||
    value === 'cyber' ||
    value === 'gold' ||
    value === 'solid' ||
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
  subdivisions: number = 3
): void {
  const n = normalize3(normal[0], normal[1], normal[2]);
  const centerRot = rotatePoint(n[0], n[1], n[2], cosX, sinX, cosY, sinY);
  if (centerRot[2] < -0.18) return;

  const { u, v } = buildTangentBasis(n);
  const pts: Array<[number, number]> = [];

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
      if (rp[2] < 0) {
        const xyLen = Math.hypot(sx, sy) || 1;
        sx /= xyLen;
        sy /= xyLen;
      }
      pts.push([cx + sx * radius, cy + sy * radius]);
    }
  }

  if (pts.length < 3) return;
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
 * Strokes a 3D curve sampled parametrically on the unit sphere (front hemisphere only).
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
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const raw = sampleFn(t);
    const sp = normalize3(raw[0], raw[1], raw[2]);
    const rp = rotatePoint(sp[0], sp[1], sp[2], cosX, sinX, cosY, sinY);
    if (rp[2] >= -0.06) {
      const sx = cx + rp[0] * radius;
      const sy = cy + rp[1] * radius;
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
  // Teamgeist (Alemania 2006): pearl white with curved black propeller/figure-8 panels + gold metallic edge trim
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const seamW = Math.max(0.8, radius * 0.06);
  // Subtle silver figure-8 panel seams
  for (let axis = 0; axis < 3; axis++) {
    strokeSphericalCurve(
      ctx,
      x,
      y,
      radius,
      40,
      (t) => {
        const a = t * Math.PI * 2;
        const wave = 0.24 * Math.sin(a * 2);
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

  // Curved black propeller / hourglass panels with metallic gold trim
  const propellerPoly: ReadonlyArray<[number, number]> = [
    [0, -0.52],
    [0.24, -0.34],
    [0.14, 0],
    [0.24, 0.34],
    [0, 0.52],
    [-0.24, 0.34],
    [-0.14, 0],
    [-0.24, -0.34]
  ];
  const goldW = Math.max(1.0, radius * 0.08);
  for (let i = 0; i < CUBE_NORMALS.length; i++) {
    drawSphericalPatch(
      ctx,
      x,
      y,
      radius,
      CUBE_NORMALS[i]!,
      propellerPoly,
      cosX,
      sinX,
      cosY,
      sinY,
      '#111827',
      '#D4AF37',
      goldW,
      3
    );
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
  // Jabulani (Sudáfrica 2010): crisp white with multi-color curved triangular bands in green, yellow, black, red
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const bands: ReadonlyArray<{ normal: Vec3; colors: [string, string] }> = [
    { normal: [0.45, -0.35, 0.82], colors: ['#16A34A', '#FACC15'] },
    { normal: [-0.6, 0.3, 0.74], colors: ['#111827', '#DC2626'] },
    { normal: [0.25, 0.78, -0.57], colors: ['#DC2626', '#FACC15'] },
    { normal: [-0.72, -0.45, -0.52], colors: ['#16A34A', '#111827'] },
    { normal: [0.85, 0.25, -0.46], colors: ['#FACC15', '#2563EB'] },
    { normal: [-0.25, -0.82, 0.51], colors: ['#DC2626', '#16A34A'] }
  ];

  const outerArc: ReadonlyArray<[number, number]> = [
    [0.0, -0.62],
    [0.54, 0.32],
    [0.32, 0.48],
    [0.0, -0.22],
    [-0.32, 0.48],
    [-0.54, 0.32]
  ];
  const innerTriangle: ReadonlyArray<[number, number]> = [
    [0.0, -0.28],
    [0.32, 0.34],
    [-0.32, 0.34]
  ];
  const seamW = Math.max(0.8, radius * 0.055);

  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    drawSphericalPatch(
      ctx,
      x,
      y,
      radius,
      b.normal,
      outerArc,
      cosX,
      sinX,
      cosY,
      sinY,
      b.colors[0],
      '#94A3B8',
      seamW,
      2
    );
    drawSphericalPatch(
      ctx,
      x,
      y,
      radius,
      b.normal,
      innerTriangle,
      cosX,
      sinX,
      cosY,
      sinY,
      b.colors[1],
      '#E2E8F0',
      seamW * 0.8,
      2
    );
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
  // Brazuca (Brasil 2014): white with interlocking ribbon swirls in azure blue, orange, emerald green, navy
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const outerRibbonW = Math.max(2.2, radius * 0.22);
  const innerRibbonW = Math.max(1.2, radius * 0.12);

  const ribbons: ReadonlyArray<{ outer: string; inner: string; fn: (t: number) => Vec3 }> = [
    {
      outer: '#1E3A8A',
      inner: '#0284C7',
      fn: (t) => {
        const a = t * Math.PI * 2;
        return [Math.cos(a), 0.55 * Math.sin(a * 2), Math.sin(a)];
      }
    },
    {
      outer: '#0284C7',
      inner: '#F97316',
      fn: (t) => {
        const a = t * Math.PI * 2;
        return [0.55 * Math.sin(a * 2), Math.cos(a), Math.sin(a)];
      }
    },
    {
      outer: '#1E3A8A',
      inner: '#10B981',
      fn: (t) => {
        const a = t * Math.PI * 2;
        return [Math.sin(a), Math.cos(a), 0.55 * Math.sin(a * 2)];
      }
    }
  ];

  for (let i = 0; i < ribbons.length; i++) {
    const r = ribbons[i]!;
    strokeSphericalCurve(ctx, x, y, radius, 44, r.fn, cosX, sinX, cosY, sinY, r.outer, outerRibbonW);
    strokeSphericalCurve(ctx, x, y, radius, 44, r.fn, cosX, sinX, cosY, sinY, r.inner, innerRibbonW);
  }

  // White star accents at interlocking intersections
  const starDiamond: ReadonlyArray<[number, number]> = [
    [0, -0.14],
    [0.14, 0],
    [0, 0.14],
    [-0.14, 0]
  ];
  for (let i = 0; i < CUBE_NORMALS.length; i++) {
    drawSphericalPatch(
      ctx,
      x,
      y,
      radius,
      CUBE_NORMALS[i]!,
      starDiamond,
      cosX,
      sinX,
      cosY,
      sinY,
      '#FFFFFF',
      '#1E3A8A',
      Math.max(0.6, radius * 0.04),
      1
    );
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
  // Telstar 18 (Rusia 2018): white with pixelated dark charcoal/black trapezoidal block panels + subtle gold accent
  fillPearlWhiteBase(ctx, x, y, radius, '#94A3B8');

  const trapPanel: ReadonlyArray<[number, number]> = [
    [-0.24, -0.34],
    [0.24, -0.34],
    [0.36, 0.28],
    [-0.36, 0.28]
  ];
  const pixelStepA: ReadonlyArray<[number, number]> = [
    [-0.44, -0.12],
    [-0.22, -0.12],
    [-0.22, 0.14],
    [-0.44, 0.14]
  ];
  const pixelStepB: ReadonlyArray<[number, number]> = [
    [0.22, -0.22],
    [0.44, -0.22],
    [0.44, 0.08],
    [0.22, 0.08]
  ];
  const goldAccent: ReadonlyArray<[number, number]> = [
    [-0.1, 0.14],
    [0.1, 0.14],
    [0.1, 0.24],
    [-0.1, 0.24]
  ];

  for (let i = 0; i < CUBE_NORMALS.length; i++) {
    const n = CUBE_NORMALS[i]!;
    drawSphericalPatch(ctx, x, y, radius, n, pixelStepA, cosX, sinX, cosY, sinY, '#475569', undefined, 0, 1);
    drawSphericalPatch(ctx, x, y, radius, n, pixelStepB, cosX, sinX, cosY, sinY, '#334155', undefined, 0, 1);
    drawSphericalPatch(
      ctx,
      x,
      y,
      radius,
      n,
      trapPanel,
      cosX,
      sinX,
      cosY,
      sinY,
      '#0F172A',
      '#64748B',
      Math.max(0.7, radius * 0.05),
      2
    );
    if (i % 2 === 0) {
      drawSphericalPatch(ctx, x, y, radius, n, goldAccent, cosX, sinX, cosY, sinY, '#EAB308', undefined, 0, 1);
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
  // Al Rihla (Qatar 2022): pearl white with vibrant angled geometric speed triangles in cyan, crimson/orange, magenta/gold
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const shardA: ReadonlyArray<[number, number]> = [
    [-0.42, -0.34],
    [0.18, -0.18],
    [-0.16, 0.36]
  ];
  const shardB: ReadonlyArray<[number, number]> = [
    [0.12, -0.4],
    [0.46, 0.08],
    [-0.08, 0.16]
  ];
  const shardC: ReadonlyArray<[number, number]> = [
    [-0.22, 0.12],
    [0.36, 0.18],
    [0.06, 0.46]
  ];

  const palettes: ReadonlyArray<[string, string, string]> = [
    ['#06B6D4', '#E11D48', '#F59E0B'],
    ['#9D174D', '#06B6D4', '#F97316'],
    ['#E11D48', '#F59E0B', '#06B6D4'],
    ['#F97316', '#9D174D', '#06B6D4']
  ];
  const trimW = Math.max(0.7, radius * 0.05);

  for (let i = 0; i < OCTANT_NORMALS.length; i++) {
    const n = OCTANT_NORMALS[i]!;
    const p = palettes[i % palettes.length]!;
    drawSphericalPatch(ctx, x, y, radius, n, shardA, cosX, sinX, cosY, sinY, p[0], '#FFFFFF', trimW, 2);
    drawSphericalPatch(ctx, x, y, radius, n, shardB, cosX, sinX, cosY, sinY, p[1], '#FFFFFF', trimW, 2);
    drawSphericalPatch(ctx, x, y, radius, n, shardC, cosX, sinX, cosY, sinY, p[2], '#FFFFFF', trimW, 2);
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
  // Trionda (Copa 2026): white with bold sweeping tri-color wave-blade panels in red, emerald green, royal blue
  fillPearlWhiteBase(ctx, x, y, radius, '#CBD5E1');

  const bladeRed: ReadonlyArray<[number, number]> = [
    [0.0, 0.0],
    [0.14, -0.48],
    [0.52, -0.32],
    [0.26, -0.06]
  ];
  const bladeGreen: ReadonlyArray<[number, number]> = [
    [0.0, 0.0],
    [-0.5, -0.18],
    [-0.32, -0.52],
    [-0.08, -0.22]
  ];
  const bladeBlue: ReadonlyArray<[number, number]> = [
    [0.0, 0.0],
    [0.34, 0.42],
    [-0.12, 0.54],
    [-0.16, 0.16]
  ];
  const centerHub: ReadonlyArray<[number, number]> = [
    [0, -0.12],
    [0.11, 0.07],
    [-0.11, 0.07]
  ];

  const trimW = Math.max(0.8, radius * 0.055);
  for (let i = 0; i < CUBE_NORMALS.length; i++) {
    const n = CUBE_NORMALS[i]!;
    drawSphericalPatch(ctx, x, y, radius, n, bladeRed, cosX, sinX, cosY, sinY, '#EF4444', '#F8FAFC', trimW, 2);
    drawSphericalPatch(ctx, x, y, radius, n, bladeGreen, cosX, sinX, cosY, sinY, '#10B981', '#F8FAFC', trimW, 2);
    drawSphericalPatch(ctx, x, y, radius, n, bladeBlue, cosX, sinX, cosY, sinY, '#2563EB', '#F8FAFC', trimW, 2);
    drawSphericalPatch(ctx, x, y, radius, n, centerHub, cosX, sinX, cosY, sinY, '#FACC15', '#0F172A', trimW * 0.7, 1);
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

  // 5. Outer perimeter stroke
  ctx.strokeStyle = getRimColor(skin);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
