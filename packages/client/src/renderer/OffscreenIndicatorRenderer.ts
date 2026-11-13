import type { DiscSnapshot, CompactDiscState } from '@legacyx/core';

export interface EdgeProjectionResult {
  ex: number;
  ey: number;
  theta: number;
}

export interface OffscreenDrawOptions {
  zoom?: number;
  chatWidth?: number;
  redColor?: string;
  blueColor?: string;
}

export class OffscreenIndicatorRenderer {
  public static readonly MARGIN: number = 22;
  public static readonly HUD_TOP_MARGIN: number = 50;
  public static readonly BASE_WIDTH: number = 14;
  public static readonly HEIGHT: number = 16;

  public static projectToEdge(
    sx: number,
    sy: number,
    cx: number,
    cy: number,
    xmin: number,
    ymin: number,
    xmax: number,
    ymax: number
  ): EdgeProjectionResult {
    const dx = sx - cx;
    const dy = sy - cy;
    const theta = Math.atan2(dy, dx);

    let t = 1.0;

    if (dx > 1e-6) {
      const tx = (xmax - cx) / dx;
      if (tx < t) t = tx;
    } else if (dx < -1e-6) {
      const tx = (xmin - cx) / dx;
      if (tx < t) t = tx;
    }

    if (dy > 1e-6) {
      const ty = (ymax - cy) / dy;
      if (ty < t) t = ty;
    } else if (dy < -1e-6) {
      const ty = (ymin - cy) / dy;
      if (ty < t) t = ty;
    }

    const ex = Math.max(xmin, Math.min(xmax, cx + t * dx));
    const ey = Math.max(ymin, Math.min(ymax, cy + t * dy));

    return { ex, ey, theta };
  }

  public draw(
    ctx: CanvasRenderingContext2D,
    discs: Array<DiscSnapshot | CompactDiscState>,
    localDiscId: number | null | undefined,
    camX: number,
    camY: number,
    cx: number,
    cy: number,
    viewportWidth: number,
    viewportHeight: number,
    chatHeight: number,
    options?: OffscreenDrawOptions
  ): void {
    const m = OffscreenIndicatorRenderer.MARGIN;
    const xmin = m;
    const xmax = viewportWidth - m;
    const ymin = m + OffscreenIndicatorRenderer.HUD_TOP_MARGIN;
    const ymax = viewportHeight - m;

    if (xmax <= xmin || ymax <= ymin) return;

    const zoom = options?.zoom && options.zoom > 0 ? options.zoom : 1.0;
    const chatWidth = options?.chatWidth ?? 340;
    const hasChat = chatHeight > 0 && chatWidth > 0;
    const chatTopY = viewportHeight - chatHeight;
    const sbLeft = viewportWidth / 2 - 180;
    const sbRight = viewportWidth / 2 + 180;
    const sbBottom = 56;
    const redColor = options?.redColor || '#FF0055';
    const blueColor = options?.blueColor || '#00E5FF';

    const count = discs.length;

    for (let i = 0; i < count; i++) {
      const disc = discs[i]!;

      if (localDiscId !== null && localDiscId !== undefined && disc.id === localDiscId) {
        continue;
      }

      let color = '';
      let isBall = false;
      if (disc.team === 0) {
        color = '#FFCC00';
        isBall = true;
      } else if (disc.team === 1) {
        color = redColor;
      } else if (disc.team === 2) {
        color = blueColor;
      } else {
        continue;
      }

      const sx = (disc.x - camX) * zoom + cx;
      const sy = (disc.y - camY) * zoom + cy;
      const discRadius = 'radius' in disc && typeof disc.radius === 'number' ? disc.radius : 15;
      const rScreen = discRadius * zoom;

      const onScreen =
        sx + rScreen >= 0 &&
        sx - rScreen <= viewportWidth &&
        sy + rScreen >= 0 &&
        sy - rScreen <= viewportHeight;
      const inScoreboard = sx >= sbLeft && sx <= sbRight && sy <= sbBottom;
      const inChat = hasChat && sx <= chatWidth && sy >= chatTopY;

      if (onScreen && !inScoreboard && !inChat) {
        continue;
      }

      const dx = sx - cx;
      const dy = sy - cy;
      const theta = Math.atan2(dy, dx);

      // Compute ray clamp factor t along P(t) = (cx, cy) + t*(dx, dy) against safe outer bounds.
      let t = 1.0;
      if (dx > 1e-6) {
        t = Math.min(t, (xmax - cx) / dx);
      } else if (dx < -1e-6) {
        t = Math.min(t, (xmin - cx) / dx);
      }
      if (dy > 1e-6) {
        t = Math.min(t, (ymax - cy) / dy);
      } else if (dy < -1e-6) {
        t = Math.min(t, (ymin - cy) / dy);
      }

      // Clip against bottom-left chat slab so chat-occluded arrows sit just outside chat bounds.
      if (hasChat) {
        const chatRight = Math.min(xmax, chatWidth + m);
        const chatTop = Math.max(ymin, chatTopY - m);
        if (cx > chatRight || cy < chatTop) {
          let tEnter = 0;
          let tExit = t;
          if (Math.abs(dx) <= 1e-6) {
            if (cx > chatRight) tEnter = Infinity;
          } else {
            const tx = (chatRight - cx) / dx;
            if (dx < 0) tEnter = Math.max(tEnter, tx);
            else tExit = Math.min(tExit, tx);
          }
          if (Math.abs(dy) <= 1e-6) {
            if (cy < chatTop) tEnter = Infinity;
          } else {
            const ty = (chatTop - cy) / dy;
            if (dy > 0) tEnter = Math.max(tEnter, ty);
            else tExit = Math.min(tExit, ty);
          }
          if (tEnter > 0 && tEnter < tExit) {
            t = tEnter;
          }
        }
      }

      const ex = Math.max(xmin, Math.min(xmax, cx + t * dx));
      const ey = Math.max(ymin, Math.min(ymax, cy + t * dy));

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(theta + Math.PI / 2);

      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-7, 8);
      ctx.lineTo(7, 8);
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = isBall ? 1.5 : 1.0;
      ctx.stroke();

      ctx.restore();
    }
  }
}
