import type { DiscSnapshot, CompactDiscState } from '@legacyx/core';

export interface EdgeProjectionResult {
  ex: number;
  ey: number;
  theta: number;
}

export interface ExclusionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OffscreenDrawOptions {
  zoom?: number;
  chatWidth?: number;
  redColor?: string;
  blueColor?: string;
  exclusionZones?: ExclusionRect[];
}

interface PaddedZone {
  x: number;
  y: number;
  right: number;
  bottom: number;
  zLeft: number;
  zRight: number;
  zTop: number;
  zBottom: number;
}

interface RayInterval {
  start: number;
  end: number;
}

export class OffscreenIndicatorRenderer {
  public static readonly MARGIN: number = 22;
  public static readonly HUD_TOP_MARGIN: number = 50;
  public static readonly BASE_WIDTH: number = 14;
  public static readonly HEIGHT: number = 16;
  public static readonly EXCLUSION_PADDING: number = 12;

  private scratchPaddedZones: PaddedZone[] = [];
  private scratchIntervals: RayInterval[] = [];

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
    const exclusionZones = options?.exclusionZones;
    const pad = OffscreenIndicatorRenderer.EXCLUSION_PADDING;
    const paddedZones = this.scratchPaddedZones;
    paddedZones.length = 0;
    if (exclusionZones && exclusionZones.length > 0) {
      for (let z = 0; z < exclusionZones.length; z++) {
        const rect = exclusionZones[z];
        if (
          !rect ||
          !Number.isFinite(rect.x) ||
          !Number.isFinite(rect.y) ||
          !Number.isFinite(rect.width) ||
          !Number.isFinite(rect.height) ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          continue;
        }
        paddedZones.push({
          x: rect.x,
          y: rect.y,
          right: rect.x + rect.width,
          bottom: rect.y + rect.height,
          zLeft: rect.x - pad,
          zRight: rect.x + rect.width + pad,
          zTop: rect.y - pad,
          zBottom: rect.y + rect.height + pad
        });
      }
    }
    const zoneCount = paddedZones.length;

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
      let inExclusionZone = false;
      for (let z = 0; z < zoneCount; z++) {
        const zone = paddedZones[z]!;
        if (sx >= zone.x && sx <= zone.right && sy >= zone.y && sy <= zone.bottom) {
          inExclusionZone = true;
          break;
        }
      }

      if (onScreen && !inScoreboard && !inChat && !inExclusionZone) {
        continue;
      }

      const dx = sx - cx;
      const dy = sy - cy;
      let rayDx = dx;
      let rayDy = dy;
      let theta = Math.atan2(dy, dx);
      let t = 1.0;

      if (Math.hypot(dx, dy) <= 1e-6) {
        const cardinals: ReadonlyArray<readonly [number, number]> = [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0]
        ];
        let bestDir: readonly [number, number] = cardinals[0]!;
        let bestDist = Infinity;
        for (let d = 0; d < cardinals.length; d++) {
          const [ux, uy] = cardinals[d]!;
          const dirOuter = this.computeOuterT(cx, cy, ux, uy, xmin, ymin, xmax, ymax);
          if (dirOuter <= 1e-6) continue;
          const dirEsc = zoneCount > 0 ? this.computeRayZoneBounds(cx, cy, ux, uy, paddedZones).tEsc : 0;
          if (dirEsc > 0) {
            if (dirEsc <= dirOuter + 1e-6 && dirEsc < bestDist) {
              bestDist = dirEsc;
              bestDir = cardinals[d]!;
            }
          } else if (bestDist === Infinity) {
            bestDist = Math.min(pad, dirOuter);
            bestDir = cardinals[d]!;
          }
        }
        rayDx = bestDir[0];
        rayDy = bestDir[1];
        theta = Math.atan2(rayDy, rayDx);
        const dirOuter = this.computeOuterT(cx, cy, rayDx, rayDy, xmin, ymin, xmax, ymax);
        t = Math.min(pad, dirOuter);
      }

      const outerT = this.computeOuterT(cx, cy, rayDx, rayDy, xmin, ymin, xmax, ymax);
      t = Math.min(t, outerT);

      // Clip against bottom-left chat slab so chat-occluded arrows sit just outside chat bounds.
      if (hasChat) {
        const chatRight = Math.min(xmax, chatWidth + m);
        const chatTop = Math.max(ymin, chatTopY - m);
        if (cx > chatRight || cy < chatTop) {
          let tEnter = 0;
          let tExit = t;
          if (Math.abs(rayDx) <= 1e-6) {
            if (cx > chatRight) tEnter = Infinity;
          } else {
            const tx = (chatRight - cx) / rayDx;
            if (rayDx < 0) tEnter = Math.max(tEnter, tx);
            else tExit = Math.min(tExit, tx);
          }
          if (Math.abs(rayDy) <= 1e-6) {
            if (cy < chatTop) tEnter = Infinity;
          } else {
            const ty = (chatTop - cy) / rayDy;
            if (rayDy > 0) tEnter = Math.max(tEnter, ty);
            else tExit = Math.min(tExit, ty);
          }
          if (tEnter > 0 && tEnter < tExit) {
            t = tEnter;
          }
        }
      }

      if (zoneCount > 0) {
        const { tEsc, nextEnter } = this.computeRayZoneBounds(cx, cy, rayDx, rayDy, paddedZones);
        if (tEsc > 0 && t <= tEsc) {
          t = tEsc;
        } else if (nextEnter < t) {
          t = nextEnter;
        }
        t = Math.min(t, outerT);
      }

      let ex = Math.max(xmin, Math.min(xmax, cx + t * rayDx));
      let ey = Math.max(ymin, Math.min(ymax, cy + t * rayDy));

      if (zoneCount > 0 && this.isInsideAnyPaddedZone(ex, ey, paddedZones)) {
        const escaped = this.escapePaddedZones(ex, ey, xmin, ymin, xmax, ymax, paddedZones);
        ex = escaped.x;
        ey = escaped.y;
      }

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

  private computeOuterT(
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    xmin: number,
    ymin: number,
    xmax: number,
    ymax: number
  ): number {
    let tOuter = Infinity;
    if (dx > 1e-6) {
      tOuter = Math.min(tOuter, (xmax - cx) / dx);
    } else if (dx < -1e-6) {
      tOuter = Math.min(tOuter, (xmin - cx) / dx);
    }
    if (dy > 1e-6) {
      tOuter = Math.min(tOuter, (ymax - cy) / dy);
    } else if (dy < -1e-6) {
      tOuter = Math.min(tOuter, (ymin - cy) / dy);
    }
    return Number.isFinite(tOuter) ? Math.max(0, tOuter) : 0;
  }

  private computeRayZoneBounds(
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    paddedZones: PaddedZone[]
  ): { tEsc: number; nextEnter: number } {
    const intervals = this.scratchIntervals;
    intervals.length = 0;

    for (let z = 0; z < paddedZones.length; z++) {
      const zone = paddedZones[z]!;
      let tMin = 0;
      let tMax = Infinity;
      let intersects = true;

      if (Math.abs(dx) <= 1e-6) {
        if (cx <= zone.zLeft + 1e-6 || cx >= zone.zRight - 1e-6) {
          intersects = false;
        }
      } else {
        const invDx = 1 / dx;
        const tx1 = (zone.zLeft - cx) * invDx;
        const tx2 = (zone.zRight - cx) * invDx;
        tMin = Math.max(tMin, Math.min(tx1, tx2));
        tMax = Math.min(tMax, Math.max(tx1, tx2));
        if (tMin >= tMax - 1e-9) {
          intersects = false;
        }
      }

      if (intersects) {
        if (Math.abs(dy) <= 1e-6) {
          if (cy <= zone.zTop + 1e-6 || cy >= zone.zBottom - 1e-6) {
            intersects = false;
          }
        } else {
          const invDy = 1 / dy;
          const ty1 = (zone.zTop - cy) * invDy;
          const ty2 = (zone.zBottom - cy) * invDy;
          tMin = Math.max(tMin, Math.min(ty1, ty2));
          tMax = Math.min(tMax, Math.max(ty1, ty2));
          if (tMin >= tMax - 1e-9) {
            intersects = false;
          }
        }
      }

      if (intersects && tMax > 1e-9 && tMin < tMax - 1e-9) {
        intervals.push({ start: tMin, end: tMax });
      }
    }

    if (intervals.length === 0) {
      return { tEsc: 0, nextEnter: Infinity };
    }

    intervals.sort((a, b) => a.start - b.start || a.end - b.end);

    let tEsc = 0;
    let nextEnter = Infinity;
    for (let i = 0; i < intervals.length; i++) {
      const iv = intervals[i]!;
      if (iv.start <= tEsc + 1e-9) {
        if (iv.end > tEsc) {
          tEsc = iv.end;
        }
      } else {
        nextEnter = iv.start;
        break;
      }
    }

    return { tEsc, nextEnter };
  }

  private isInsideAnyPaddedZone(x: number, y: number, paddedZones: PaddedZone[]): boolean {
    for (let z = 0; z < paddedZones.length; z++) {
      const zone = paddedZones[z]!;
      if (x > zone.zLeft && x < zone.zRight && y > zone.zTop && y < zone.zBottom) {
        return true;
      }
    }
    return false;
  }

  private escapePaddedZones(
    px: number,
    py: number,
    xmin: number,
    ymin: number,
    xmax: number,
    ymax: number,
    paddedZones: PaddedZone[]
  ): { x: number; y: number } {
    let bestX = px;
    let bestY = py;
    let bestDistSq = Infinity;

    const consider = (cxCand: number, cyCand: number): void => {
      if (cxCand < xmin || cxCand > xmax || cyCand < ymin || cyCand > ymax) return;
      if (this.isInsideAnyPaddedZone(cxCand, cyCand, paddedZones)) return;
      const dx = cxCand - px;
      const dy = cyCand - py;
      const distSq = dx * dx + dy * dy;
      if (
        distSq < bestDistSq - 1e-9 ||
        (Math.abs(distSq - bestDistSq) <= 1e-9 &&
          (cyCand < bestY - 1e-9 || (Math.abs(cyCand - bestY) <= 1e-9 && cxCand < bestX)))
      ) {
        bestDistSq = distSq;
        bestX = cxCand;
        bestY = cyCand;
      }
    };

    for (let z = 0; z < paddedZones.length; z++) {
      const zone = paddedZones[z]!;
      consider(zone.zLeft, py);
      consider(zone.zRight, py);
      consider(px, zone.zTop);
      consider(px, zone.zBottom);
      consider(zone.zLeft, zone.zTop);
      consider(zone.zRight, zone.zTop);
      consider(zone.zLeft, zone.zBottom);
      consider(zone.zRight, zone.zBottom);
      consider(xmin, zone.zTop);
      consider(xmax, zone.zTop);
      consider(xmin, zone.zBottom);
      consider(xmax, zone.zBottom);
      consider(zone.zLeft, ymin);
      consider(zone.zLeft, ymax);
      consider(zone.zRight, ymin);
      consider(zone.zRight, ymax);
    }

    return { x: bestX, y: bestY };
  }
}
