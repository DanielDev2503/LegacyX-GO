/**
 * ballDesigns.ts
 * Canonical renderer for all 6 ball skins in LegacyX-GO:
 * 'classic' | 'retro' | 'neon' | 'cyber' | 'gold' | 'solid'
 * Used identically in-game (DiscRenderer) and in UI previews (SettingsModal).
 */

export type BallSkin = 'classic' | 'retro' | 'neon' | 'cyber' | 'gold' | 'solid';

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

  // Handle 'color' mode override or 'solid' skin
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
    // Retro: vintage leather brown gradient with curved seams
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

    for (let m = 0; m < 3; m++) {
      const phi = (m * Math.PI) / 3;
      ctx.beginPath();
      let started = false;
      for (let s = -Math.PI; s <= Math.PI; s += 0.2) {
        const pX0 = Math.sin(s) * Math.cos(phi);
        const pY0 = Math.cos(s);
        const pZ0 = Math.sin(s) * Math.sin(phi);

        const pX1 = pX0 * cosX + pZ0 * sinX;
        const pZ1 = -pX0 * sinX + pZ0 * cosX;
        const pX2 = pX1;
        const pY2 = pY0 * cosY - pZ1 * sinY;
        const pZ2 = pY0 * sinY + pZ1 * cosY;

        if (pZ2 >= -0.15) {
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
  } else if (skin === 'neon') {
    // Neon: vibrant cyber-yellow / orange gradient with high-vis rings
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
    for (let m = 0; m < 4; m++) {
      const phi = (m * Math.PI) / 4;
      ctx.beginPath();
      let started = false;
      for (let s = -Math.PI; s <= Math.PI; s += 0.25) {
        const pX0 = Math.sin(s) * Math.cos(phi);
        const pY0 = Math.cos(s);
        const pZ0 = Math.sin(s) * Math.sin(phi);

        const pX1 = pX0 * cosX + pZ0 * sinX;
        const pZ1 = -pX0 * sinX + pZ0 * cosX;
        const pX2 = pX1;
        const pY2 = pY0 * cosY - pZ1 * sinY;
        const pZ2 = pY0 * sinY + pZ1 * cosY;

        if (pZ2 >= -0.1) {
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
  } else if (skin === 'cyber') {
    // Cyber: futuristic dark cyan/navy gradient with glowing cyan circuitry/hex grid
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

    // Circuit grid lines
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = Math.max(1.1, radius * 0.08);

    for (let k = 0; k < 12; k++) {
      const vX0 = ICOSA_X[k]!;
      const vY0 = ICOSA_Y[k]!;
      const vZ0 = ICOSA_Z[k]!;

      const vX1 = vX0 * cosX + vZ0 * sinX;
      const vZ1 = -vX0 * sinX + vZ0 * cosX;
      const vX2 = vX1;
      const vY2 = vY0 * cosY - vZ1 * sinY;
      const vZ2 = vY0 * sinY + vZ1 * cosY;

      if (vZ2 > 0.05) {
        const px = x + vX2 * radius;
        const py = y + vY2 * radius;
        const patchR = radius * 0.22 * Math.sqrt(vZ2);

        ctx.fillStyle = '#00F0FF';
        ctx.beginPath();
        ctx.arc(px, py, patchR * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let a = 0; a < 12; a++) {
      for (let b = a + 1; b < 12; b++) {
        const dx = ICOSA_X[a]! - ICOSA_X[b]!;
        const dy = ICOSA_Y[a]! - ICOSA_Y[b]!;
        const dz = ICOSA_Z[a]! - ICOSA_Z[b]!;
        if (dx * dx + dy * dy + dz * dz < 1.15) {
          const vX1a = ICOSA_X[a]! * cosX + ICOSA_Z[a]! * sinX;
          const vZ1a = -ICOSA_X[a]! * sinX + ICOSA_Z[a]! * cosX;
          const vY2a = ICOSA_Y[a]! * cosY - vZ1a * sinY;
          const vZ2a = ICOSA_Y[a]! * sinY + vZ1a * cosY;

          const vX1b = ICOSA_X[b]! * cosX + ICOSA_Z[b]! * sinX;
          const vZ1b = -ICOSA_X[b]! * sinX + ICOSA_Z[b]! * cosX;
          const vY2b = ICOSA_Y[b]! * cosY - vZ1b * sinY;
          const vZ2b = ICOSA_Y[b]! * sinY + vZ1b * cosY;

          if (vZ2a > -0.1 && vZ2b > -0.1) {
            ctx.beginPath();
            ctx.moveTo(x + vX1a * radius, y + vY2a * radius);
            ctx.lineTo(x + vX1b * radius, y + vY2b * radius);
            ctx.stroke();
          }
        }
      }
    }
  } else if (skin === 'gold') {
    // Gold: championship metallic gold gradient with dark bronze patches
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

    ctx.fillStyle = '#451A03';
    ctx.strokeStyle = '#854D0E';
    ctx.lineWidth = Math.max(1.0, radius * 0.08);

    for (let k = 0; k < 12; k++) {
      const vX0 = ICOSA_X[k]!;
      const vY0 = ICOSA_Y[k]!;
      const vZ0 = ICOSA_Z[k]!;

      const vX1 = vX0 * cosX + vZ0 * sinX;
      const vZ1 = -vX0 * sinX + vZ0 * cosX;
      const vX2 = vX1;
      const vY2 = vY0 * cosY - vZ1 * sinY;
      const vZ2 = vY0 * sinY + vZ1 * cosY;

      if (vZ2 > 0.05) {
        const px = x + vX2 * radius;
        const py = y + vY2 * radius;
        const patchR = radius * 0.26 * Math.sqrt(vZ2);

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
          const vX1a = ICOSA_X[a]! * cosX + ICOSA_Z[a]! * sinX;
          const vZ1a = -ICOSA_X[a]! * sinX + ICOSA_Z[a]! * cosX;
          const vY2a = ICOSA_Y[a]! * cosY - vZ1a * sinY;
          const vZ2a = ICOSA_Y[a]! * sinY + vZ1a * cosY;

          const vX1b = ICOSA_X[b]! * cosX + ICOSA_Z[b]! * sinX;
          const vZ1b = -ICOSA_X[b]! * sinX + ICOSA_Z[b]! * cosX;
          const vY2b = ICOSA_Y[b]! * cosY - vZ1b * sinY;
          const vZ2b = ICOSA_Y[b]! * sinY + vZ1b * cosY;

          if (vZ2a > -0.1 && vZ2b > -0.1) {
            ctx.beginPath();
            ctx.moveTo(x + vX1a * radius, y + vY2a * radius);
            ctx.lineTo(x + vX1b * radius, y + vY2b * radius);
            ctx.stroke();
          }
        }
      }
    }
  } else {
    // Classic: white / slate base with black icosahedron patches
    if (typeof ctx.createRadialGradient === 'function') {
      const baseGrad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
      baseGrad.addColorStop(0, '#FFFFFF');
      baseGrad.addColorStop(0.35, '#F8FAFC');
      baseGrad.addColorStop(0.7, '#CBD5E1');
      baseGrad.addColorStop(1, '#94A3B8');
      ctx.fillStyle = baseGrad;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = Math.max(1.0, radius * 0.08);

    for (let k = 0; k < 12; k++) {
      const vX0 = ICOSA_X[k]!;
      const vY0 = ICOSA_Y[k]!;
      const vZ0 = ICOSA_Z[k]!;

      const vX1 = vX0 * cosX + vZ0 * sinX;
      const vZ1 = -vX0 * sinX + vZ0 * cosX;
      const vX2 = vX1;
      const vY2 = vY0 * cosY - vZ1 * sinY;
      const vZ2 = vY0 * sinY + vZ1 * cosY;

      if (vZ2 > 0.05) {
        const px = x + vX2 * radius;
        const py = y + vY2 * radius;
        const patchR = radius * 0.28 * Math.sqrt(vZ2);

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
          const vX1a = ICOSA_X[a]! * cosX + ICOSA_Z[a]! * sinX;
          const vZ1a = -ICOSA_X[a]! * sinX + ICOSA_Z[a]! * cosX;
          const vY2a = ICOSA_Y[a]! * cosY - vZ1a * sinY;
          const vZ2a = ICOSA_Y[a]! * sinY + vZ1a * cosY;

          const vX1b = ICOSA_X[b]! * cosX + ICOSA_Z[b]! * sinX;
          const vZ1b = -ICOSA_X[b]! * sinX + ICOSA_Z[b]! * cosX;
          const vY2b = ICOSA_Y[b]! * cosY - vZ1b * sinY;
          const vZ2b = ICOSA_Y[b]! * sinY + vZ1b * cosY;

          if (vZ2a > -0.1 && vZ2b > -0.1) {
            ctx.beginPath();
            ctx.moveTo(x + vX1a * radius, y + vY2a * radius);
            ctx.lineTo(x + vX1b * radius, y + vY2b * radius);
            ctx.stroke();
          }
        }
      }
    }
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
  const rimColor =
    skin === 'neon'
      ? '#EA580C'
      : skin === 'retro'
        ? '#451A03'
        : skin === 'cyber'
          ? '#00E5FF'
          : skin === 'gold'
            ? '#CA8A04'
            : '#0284C7';
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
