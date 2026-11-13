/**
 * kitPatterns.ts
 * Pure helpers for crisp team jersey patterns across Svelte UI (CSS / SVG data URI)
 * and Canvas 2D (ReplayHudCompositor, thumbnails).
 * ZERO soft faded gradients: all color transitions use sharp geometric edges.
 */

export type KitPatternId =
  | 'solid'
  | 'vertical'
  | 'hoop'
  | 'vertical_stripe'
  | 'diagonal_right'
  | 'diagonal_left'
  | 'halves'
  | 'checkerboard'
  | 'diagonal'
  | 'diagonal_checks'
  | 'cross'
  | 'chevrons';

export interface KitPatternInput {
  primaryColor?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  pattern?: KitPatternId | string;
  hasOutline?: boolean;
  outline?: boolean;
  outlineColor?: string;
  tag?: string;
  name?: string;
}

export interface ResolvedKitStyle {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  pattern: KitPatternId;
  hasOutline: boolean;
}

const KNOWN_PATTERNS = new Set<KitPatternId>([
  'solid',
  'vertical',
  'hoop',
  'vertical_stripe',
  'diagonal_right',
  'diagonal_left',
  'halves',
  'checkerboard',
  'diagonal',
  'diagonal_checks',
  'cross',
  'chevrons'
]);

export function normalizeKitPattern(pattern?: string | null): KitPatternId {
  if (pattern && KNOWN_PATTERNS.has(pattern as KitPatternId)) {
    return pattern as KitPatternId;
  }
  return 'solid';
}

export function resolveKitStyle(
  kit?: KitPatternInput | null,
  fallbackPrimary: string = '#e74c3c'
): ResolvedKitStyle {
  const primaryColor = kit?.primaryColor || fallbackPrimary;
  const secondaryColor = kit?.secondaryColor || '#ffffff';
  const tertiaryColor = kit?.tertiaryColor || '#ffffff';
  const pattern = normalizeKitPattern(kit?.pattern);

  let hasOutline = false;
  if (kit?.hasOutline !== undefined) {
    hasOutline = Boolean(kit.hasOutline);
  } else if (kit?.outline !== undefined) {
    hasOutline = Boolean(kit.outline);
  } else if (kit?.outlineColor !== undefined) {
    hasOutline =
      kit.outlineColor !== 'none' &&
      kit.outlineColor !== 'transparent' &&
      kit.outlineColor !== '';
  }

  return {
    primaryColor,
    secondaryColor,
    tertiaryColor,
    pattern,
    hasOutline
  };
}

/**
 * Returns a crisp CSS background value with hard color stops (no soft faded linear blending).
 */
export function getKitPatternCss(
  kit?: KitPatternInput | null,
  fallbackPrimary: string = '#e74c3c'
): string {
  const { primaryColor: c1, secondaryColor: c2, pattern } = resolveKitStyle(kit, fallbackPrimary);

  switch (pattern) {
    case 'vertical':
      return `linear-gradient(90deg, ${c1} 0%, ${c1} 25%, ${c2} 25%, ${c2} 50%, ${c1} 50%, ${c1} 75%, ${c2} 75%, ${c2} 100%)`;
    case 'hoop':
      return `linear-gradient(180deg, ${c1} 0%, ${c1} 30%, ${c2} 30%, ${c2} 70%, ${c1} 70%, ${c1} 100%)`;
    case 'vertical_stripe':
      return `linear-gradient(90deg, ${c1} 0%, ${c1} 32%, ${c2} 32%, ${c2} 68%, ${c1} 68%, ${c1} 100%)`;
    case 'diagonal_right':
      return `linear-gradient(45deg, ${c1} 0%, ${c1} 34%, ${c2} 34%, ${c2} 66%, ${c1} 66%, ${c1} 100%)`;
    case 'diagonal_left':
      return `linear-gradient(135deg, ${c1} 0%, ${c1} 34%, ${c2} 34%, ${c2} 66%, ${c1} 66%, ${c1} 100%)`;
    case 'halves':
      return `linear-gradient(90deg, ${c1} 0%, ${c1} 50%, ${c2} 50%, ${c2} 100%)`;
    case 'diagonal':
      return `linear-gradient(45deg, ${c1} 0%, ${c1} 50%, ${c2} 50%, ${c2} 100%)`;
    case 'checkerboard':
      return `repeating-conic-gradient(${c1} 0deg 90deg, ${c2} 90deg 180deg) 0 0 / 16px 16px`;
    case 'diagonal_checks':
      return `repeating-linear-gradient(45deg, ${c1} 0px, ${c1} 8px, ${c2} 8px, ${c2} 16px)`;
    case 'cross':
      return `linear-gradient(90deg, transparent 0%, transparent 36%, ${c2} 36%, ${c2} 64%, transparent 64%, transparent 100%), linear-gradient(180deg, ${c1} 0%, ${c1} 36%, ${c2} 36%, ${c2} 64%, ${c1} 64%, ${c1} 100%)`;
    case 'chevrons':
      return `repeating-linear-gradient(135deg, ${c1} 0px, ${c1} 8px, ${c2} 8px, ${c2} 16px)`;
    case 'solid':
    default:
      return c1;
  }
}

function buildPatternSvgShapes(c1: string, c2: string, pattern: KitPatternId): string {
  switch (pattern) {
    case 'vertical':
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/><rect x="16" y="0" width="16" height="36" fill="${c2}"/><rect x="48" y="0" width="16" height="36" fill="${c2}"/>`;
    case 'hoop':
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/><rect x="0" y="11" width="64" height="14" fill="${c2}"/>`;
    case 'vertical_stripe':
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/><rect x="21" y="0" width="22" height="36" fill="${c2}"/>`;
    case 'diagonal_right':
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/><polygon points="0,36 22,36 64,0 42,0" fill="${c2}"/>`;
    case 'diagonal_left':
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/><polygon points="0,0 22,0 64,36 42,36" fill="${c2}"/>`;
    case 'halves':
      return `<rect x="0" y="0" width="32" height="36" fill="${c1}"/><rect x="32" y="0" width="32" height="36" fill="${c2}"/>`;
    case 'diagonal':
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/><polygon points="0,36 64,0 64,36" fill="${c2}"/>`;
    case 'checkerboard':
      return [
        `<rect x="0" y="0" width="64" height="36" fill="${c1}"/>`,
        `<rect x="16" y="0" width="16" height="18" fill="${c2}"/>`,
        `<rect x="48" y="0" width="16" height="18" fill="${c2}"/>`,
        `<rect x="0" y="18" width="16" height="18" fill="${c2}"/>`,
        `<rect x="32" y="18" width="16" height="18" fill="${c2}"/>`
      ].join('');
    case 'diagonal_checks':
      return [
        `<rect x="0" y="0" width="64" height="36" fill="${c1}"/>`,
        `<polygon points="-16,36 0,36 36,0 20,0" fill="${c2}"/>`,
        `<polygon points="16,36 32,36 68,0 52,0" fill="${c2}"/>`,
        `<polygon points="48,36 64,36 100,0 84,0" fill="${c2}"/>`
      ].join('');
    case 'cross':
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/><rect x="23" y="0" width="18" height="36" fill="${c2}"/><rect x="0" y="12" width="64" height="12" fill="${c2}"/>`;
    case 'chevrons':
      return [
        `<rect x="0" y="0" width="64" height="36" fill="${c1}"/>`,
        `<polygon points="0,0 16,0 52,36 36,36" fill="${c2}"/>`,
        `<polygon points="32,0 48,0 84,36 68,36" fill="${c2}"/>`
      ].join('');
    case 'solid':
    default:
      return `<rect x="0" y="0" width="64" height="36" fill="${c1}"/>`;
  }
}

/**
 * Generates an inline SVG data URI rendering the crisp team kit pattern.
 */
export function getKitPatternSvgDataUri(
  kit?: KitPatternInput | null,
  fallbackPrimary: string = '#e74c3c'
): string {
  const { primaryColor, secondaryColor, pattern } = resolveKitStyle(kit, fallbackPrimary);
  const shapes = buildPatternSvgShapes(primaryColor, secondaryColor, pattern);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 36" preserveAspectRatio="none">${shapes}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (r > 0 && typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Draws the crisp jersey pattern inside a Canvas 2D rectangle (with optional corner radius and black outline).
 */
export function drawKitPatternCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kit?: KitPatternInput | null,
  radius: number = 0,
  fallbackPrimary: string = '#e74c3c'
): void {
  const { primaryColor: c1, secondaryColor: c2, pattern, hasOutline } = resolveKitStyle(
    kit,
    fallbackPrimary
  );

  ctx.save();
  traceRoundedRect(ctx, x, y, w, h, radius);
  if (typeof ctx.clip === 'function') {
    ctx.clip();
  }

  ctx.fillStyle = c1;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = c2;
  switch (pattern) {
    case 'vertical': {
      const colW = w / 4;
      ctx.fillRect(x + colW, y, colW, h);
      ctx.fillRect(x + colW * 3, y, colW, h);
      break;
    }
    case 'hoop': {
      ctx.fillRect(x, y + h * 0.3, w, h * 0.4);
      break;
    }
    case 'vertical_stripe': {
      ctx.fillRect(x + w * 0.32, y, w * 0.36, h);
      break;
    }
    case 'diagonal_right': {
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w * 0.34, y + h);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w * 0.66, y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'diagonal_left': {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.34, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w * 0.66, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'halves': {
      ctx.fillRect(x + w * 0.5, y, w * 0.5, h);
      break;
    }
    case 'diagonal': {
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'checkerboard': {
      const cols = 4;
      const rows = 2;
      const cw = w / cols;
      const ch = h / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r + c) % 2 === 1) {
            ctx.fillRect(x + c * cw, y + r * ch, cw, ch);
          }
        }
      }
      break;
    }
    case 'diagonal_checks': {
      const step = Math.max(8, Math.min(w, h) * 0.45);
      for (let ox = -h; ox < w + h; ox += step * 2) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + h);
        ctx.lineTo(x + ox + step, y + h);
        ctx.lineTo(x + ox + h + step, y);
        ctx.lineTo(x + ox + h, y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'cross': {
      ctx.fillRect(x + w * 0.36, y, w * 0.28, h);
      ctx.fillRect(x, y + h * 0.34, w, h * 0.32);
      break;
    }
    case 'chevrons': {
      const step = Math.max(8, Math.min(w, h) * 0.45);
      for (let ox = -h; ox < w + h; ox += step * 2) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y);
        ctx.lineTo(x + ox + step, y);
        ctx.lineTo(x + ox + h + step, y + h);
        ctx.lineTo(x + ox + h, y + h);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'solid':
    default:
      break;
  }
  ctx.restore();

  if (hasOutline) {
    ctx.save();
    traceRoundedRect(ctx, x, y, w, h, radius);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Convenience Canvas 2D helper drawing both the crisp kit pattern and the acronym/label
 * with tertiaryColor + optional black text outline.
 */
export function drawKitBadgeCanvas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kit: KitPatternInput | null | undefined,
  label: string,
  radius: number = 6,
  fallbackPrimary: string = '#e74c3c'
): void {
  const { tertiaryColor, hasOutline } = resolveKitStyle(kit, fallbackPrimary);
  drawKitPatternCanvas(ctx, x, y, w, h, kit, radius, fallbackPrimary);

  const cleanLabel = (label || '').trim();
  if (!cleanLabel || typeof ctx.fillText !== 'function') return;

  ctx.save();
  ctx.font = `900 ${Math.max(10, Math.round(h * 0.42))}px "Space Grotesk", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tx = x + w / 2;
  const ty = y + h / 2;
  if (hasOutline && typeof ctx.strokeText === 'function') {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(cleanLabel, tx, ty);
  }
  ctx.fillStyle = tertiaryColor;
  ctx.fillText(cleanLabel, tx, ty);
  ctx.restore();
}
