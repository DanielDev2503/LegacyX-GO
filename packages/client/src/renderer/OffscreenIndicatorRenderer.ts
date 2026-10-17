import type { DiscSnapshot, CompactDiscState } from '@legacyx/core';

export interface EdgeProjectionResult {
  ex: number;
  ey: number;
  theta: number;
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
    chatHeight: number
  ): void {
    const m = OffscreenIndicatorRenderer.MARGIN;
    const xmin = m;
    const xmax = viewportWidth - m;
    const ymin = m + OffscreenIndicatorRenderer.HUD_TOP_MARGIN;
    const ymax = viewportHeight - chatHeight - m;

    if (xmax <= xmin || ymax <= ymin) return;

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
        color = '#FF0055';
      } else if (disc.team === 2) {
        color = '#00E5FF';
      } else {
        continue;
      }

      const sx = disc.x - camX + cx;
      const sy = disc.y - camY + cy;

      if (sx >= xmin && sx <= xmax && sy >= ymin && sy <= ymax) {
        continue;
      }

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

      let ex = cx + t * dx;
      let ey = cy + t * dy;

      if (ex < xmin) ex = xmin;
      else if (ex > xmax) ex = xmax;
      if (ey < ymin) ey = ymin;
      else if (ey > ymax) ey = ymax;

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
