import type { Stadium, GameSnapshot, GameStateSnapshot } from '@legacyx/core';
import { Camera, type CameraViewportBounds } from './Camera';

export interface MinimapSettings {
  minimapEnabled: boolean;
  minimapOpacity: number;
  minimapSize: number; // 160 | 200 | 240
  minimapCameraFrustum: boolean;
}

export const DEFAULT_MINIMAP_SETTINGS: MinimapSettings = {
  minimapEnabled: true,
  minimapOpacity: 0.6,
  minimapSize: 200,
  minimapCameraFrustum: true
};

const COLOR_RED_FILL = '#e74c3c';
const COLOR_RED_STROKE = '#c0392b';
const COLOR_BLUE_FILL = '#3498db';
const COLOR_BLUE_STROKE = '#2980b9';
const COLOR_BALL = '#ffffff';
const COLOR_LOCAL_RING = '#ffffff';
const COLOR_FRUSTUM = 'rgba(255, 255, 255, 0.35)';
const COLOR_BORDER = 'rgba(255, 255, 255, 0.2)';
const COLOR_PITCH_MARKINGS = 'rgba(255, 255, 255, 0.25)';
const COLOR_CARD_BG = 'rgba(7, 15, 30, 0.85)';
const COLOR_CENTER_SPOT = 'rgba(255, 255, 255, 0.35)';

export class MinimapRenderer {
  public static readonly DEFAULT_BASE_WIDTH: number = 200;
  public static readonly DEFAULT_MARGIN: number = 16;
  public static readonly CORNER_RADIUS: number = 8;
  public static readonly PLAYER_RADIUS: number = 3.75;
  public static readonly LOCAL_PLAYER_RING_RADIUS: number = 6;
  public static readonly BALL_RADIUS: number = 3;

  public stadium: Stadium;
  public width: number = MinimapRenderer.DEFAULT_BASE_WIDTH;
  public height: number = 90;
  public x: number = 0;
  public y: number = 0;

  public enabled: boolean = true;
  public opacity: number = 0.6;
  public cameraFrustum: boolean = true;

  public cachedCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private cachedStadium: Stadium | null = null;
  private cachedWidth: number = 0;
  private cachedHeight: number = 0;

  private scratchPoint = { x: 0, y: 0 };
  private scratchFrustum: CameraViewportBounds = {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    width: 0,
    height: 0
  };

  constructor(stadium: Stadium, initialSettings?: Partial<MinimapSettings>) {
    this.stadium = stadium;
    if (initialSettings) {
      this.setSettings(initialSettings);
    } else {
      this.updateDimensions();
    }
    this.cachePitch();
  }

  public updateDimensions(): void {
    const aspect = this.stadium.height / (this.stadium.width || 1);
    this.height = Math.round(this.width * aspect);
  }

  public setStadium(stadium: Stadium): void {
    if (this.stadium !== stadium) {
      this.stadium = stadium;
      this.updateDimensions();
      this.invalidateCache();
    }
  }

  public setSize(baseWidth: number): void {
    if (this.width !== baseWidth && baseWidth > 0) {
      this.width = baseWidth;
      this.updateDimensions();
      this.invalidateCache();
    }
  }

  public setSettings(settings: Partial<MinimapSettings>): void {
    if (settings.minimapEnabled !== undefined) {
      this.enabled = settings.minimapEnabled;
    }
    if (settings.minimapOpacity !== undefined) {
      this.opacity = settings.minimapOpacity;
    }
    if (settings.minimapSize !== undefined && settings.minimapSize > 0) {
      this.setSize(settings.minimapSize);
    }
    if (settings.minimapCameraFrustum !== undefined) {
      this.cameraFrustum = settings.minimapCameraFrustum;
    }
  }

  public invalidateCache(): void {
    this.cachedCanvas = null;
    this.cachedStadium = null;
    this.cachedWidth = 0;
    this.cachedHeight = 0;
  }

  public static projectCoordinates(
    worldX: number,
    worldY: number,
    stadiumWidth: number,
    stadiumHeight: number,
    minimapWidth: number,
    minimapHeight: number
  ): { x: number; y: number } {
    const halfW = stadiumWidth / 2;
    const halfH = stadiumHeight / 2;
    const u = (worldX + halfW) / (stadiumWidth || 1);
    const v = (worldY + halfH) / (stadiumHeight || 1);
    return {
      x: u * minimapWidth,
      y: v * minimapHeight
    };
  }

  public worldToMinimap(worldX: number, worldY: number, absolute: boolean = false): { x: number; y: number } {
    const rel = MinimapRenderer.projectCoordinates(
      worldX,
      worldY,
      this.stadium.width,
      this.stadium.height,
      this.width,
      this.height
    );
    if (absolute) {
      return {
        x: this.x + rel.x,
        y: this.y + rel.y
      };
    }
    return rel;
  }

  public project(worldX: number, worldY: number, absolute: boolean = false): { x: number; y: number } {
    return this.worldToMinimap(worldX, worldY, absolute);
  }

  private projectScratch(worldX: number, worldY: number, absolute: boolean = false): { x: number; y: number } {
    const halfW = this.stadium.halfWidth;
    const halfH = this.stadium.halfHeight;
    const u = (worldX + halfW) / (this.stadium.width || 1);
    const v = (worldY + halfH) / (this.stadium.height || 1);
    const relX = u * this.width;
    const relY = v * this.height;

    this.scratchPoint.x = absolute ? this.x + relX : relX;
    this.scratchPoint.y = absolute ? this.y + relY : relY;
    return this.scratchPoint;
  }

  public worldToMinimapClamped(worldX: number, worldY: number, absolute: boolean = false): { x: number; y: number } {
    const p = this.worldToMinimap(worldX, worldY, absolute);
    const minX = absolute ? this.x : 0;
    const maxX = absolute ? this.x + this.width : this.width;
    const minY = absolute ? this.y : 0;
    const maxY = absolute ? this.y + this.height : this.height;
    return {
      x: Math.max(minX, Math.min(maxX, p.x)),
      y: Math.max(minY, Math.min(maxY, p.y))
    };
  }

  public cachePitch(): void {
    if (
      this.cachedCanvas &&
      this.cachedStadium === this.stadium &&
      this.cachedWidth === this.width &&
      this.cachedHeight === this.height
    ) {
      return;
    }

    const w = this.width;
    const h = this.height;

    let canvas: HTMLCanvasElement | OffscreenCanvas;
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(w, h);
    } else {
      return;
    }

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.fillStyle = COLOR_CARD_BG;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(0, 0, w, h, MinimapRenderer.CORNER_RADIUS);
    } else {
      ctx.rect(0, 0, w, h);
    }
    ctx.fill();

    ctx.strokeStyle = COLOR_PITCH_MARKINGS;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    const centerRadiusPx = this.stadium.centerRadius * (w / (this.stadium.width || 1));
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.max(4, centerRadiusPx), 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_CENTER_SPOT;
    ctx.fill();

    const penaltyAreaW = Math.max(6, Math.round(w * 0.08));
    const penaltyAreaH = Math.max(12, Math.round(h * 0.45));
    const penaltyY = Math.round((h - penaltyAreaH) / 2);

    ctx.beginPath();
    ctx.strokeRect(0.5, penaltyY + 0.5, penaltyAreaW, penaltyAreaH);

    ctx.beginPath();
    ctx.strokeRect(w - penaltyAreaW - 0.5, penaltyY + 0.5, penaltyAreaW, penaltyAreaH);

    const goalSize = this.stadium.goalHalfHeight * 2;
    const goalMouthH = Math.max(8, Math.round(goalSize * (h / (this.stadium.height || 1))));
    const goalDepthPx = Math.max(3, Math.round(this.stadium.goalDepth * (w / (this.stadium.width || 1))));
    const goalY = Math.round((h - goalMouthH) / 2);

    ctx.beginPath();
    ctx.strokeRect(0.5, goalY + 0.5, goalDepthPx, goalMouthH);

    ctx.beginPath();
    ctx.strokeRect(w - goalDepthPx - 0.5, goalY + 0.5, goalDepthPx, goalMouthH);

    ctx.restore();

    this.cachedCanvas = canvas;
    this.cachedStadium = this.stadium;
    this.cachedWidth = w;
    this.cachedHeight = h;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    gameState: GameSnapshot | GameStateSnapshot,
    camera: Camera,
    localPlayerId?: number | null,
    settings?: Partial<MinimapSettings>,
    viewportWidth?: number,
    viewportHeight?: number
  ): void {
    const isEnabled = settings?.minimapEnabled !== undefined ? settings.minimapEnabled : this.enabled;
    if (!isEnabled) return;

    if (settings?.minimapSize !== undefined && settings.minimapSize !== this.width && settings.minimapSize > 0) {
      this.setSize(settings.minimapSize);
    }

    if (!this.cachedCanvas || this.cachedStadium !== this.stadium || this.cachedWidth !== this.width) {
      this.cachePitch();
    }

    const currentOpacity = settings?.minimapOpacity !== undefined ? settings.minimapOpacity : this.opacity;
    const showFrustum = settings?.minimapCameraFrustum !== undefined ? settings.minimapCameraFrustum : this.cameraFrustum;

    const screenW = viewportWidth !== undefined ? viewportWidth : (ctx.canvas ? ctx.canvas.width : 800);
    const screenH = viewportHeight !== undefined ? viewportHeight : (ctx.canvas ? ctx.canvas.height : 600);
    this.x = screenW - this.width - MinimapRenderer.DEFAULT_MARGIN;
    this.y = screenH - this.height - MinimapRenderer.DEFAULT_MARGIN;

    if (this.cachedCanvas && typeof ctx.drawImage === 'function') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, currentOpacity));
      ctx.drawImage(this.cachedCanvas as CanvasImageSource, this.x, this.y);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(this.x, this.y, this.width, this.height, MinimapRenderer.CORNER_RADIUS);
    } else {
      ctx.rect(this.x, this.y, this.width, this.height);
    }
    if (typeof ctx.clip === 'function') {
      ctx.clip();
    }

    if (showFrustum && camera) {
      const vW = viewportWidth !== undefined ? viewportWidth : screenW;
      const vH = viewportHeight !== undefined ? viewportHeight : screenH;
      camera.getViewportBounds(vW, vH, vW / 2, vH / 2, this.scratchFrustum);

      const fMinX = this.scratchFrustum.minX;
      const fMinY = this.scratchFrustum.minY;
      const fMaxX = this.scratchFrustum.maxX;
      const fMaxY = this.scratchFrustum.maxY;

      const p1 = this.projectScratch(fMinX, fMinY, true);
      const fx1 = p1.x;
      const fy1 = p1.y;

      const p2 = this.projectScratch(fMaxX, fMaxY, true);
      const fx2 = p2.x;
      const fy2 = p2.y;

      const fw = fx2 - fx1;
      const fh = fy2 - fy1;

      ctx.save();
      ctx.strokeStyle = COLOR_FRUSTUM;
      ctx.lineWidth = 1;
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([3, 2]);
      }
      if (typeof ctx.strokeRect === 'function') {
        ctx.strokeRect(fx1, fy1, fw, fh);
      }
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    const discs = gameState.discs;
    if (discs && discs.length > 0) {
      let ballX = 0;
      let ballY = 0;
      let hasBall = false;
      const count = discs.length;

      for (let i = 0; i < count; i++) {
        const disc = discs[i]!;
        if (disc.team === 0) {
          ballX = disc.x;
          ballY = disc.y;
          hasBall = true;
          continue;
        }

        if (disc.team !== 1 && disc.team !== 2) {
          continue;
        }

        const p = this.projectScratch(disc.x, disc.y, true);
        const px = Math.max(this.x + 2, Math.min(this.x + this.width - 2, p.x));
        const py = Math.max(this.y + 2, Math.min(this.y + this.height - 2, p.y));

        const isLocal = localPlayerId !== null && localPlayerId !== undefined && disc.id === localPlayerId;

        if (isLocal) {
          ctx.save();
          ctx.strokeStyle = COLOR_LOCAL_RING;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, MinimapRenderer.LOCAL_PLAYER_RING_RADIUS, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = disc.team === 1 ? COLOR_RED_FILL : COLOR_BLUE_FILL;
        ctx.strokeStyle = disc.team === 1 ? COLOR_RED_STROKE : COLOR_BLUE_STROKE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, MinimapRenderer.PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (hasBall) {
        const bp = this.projectScratch(ballX, ballY, true);
        const bx = Math.max(this.x + 2, Math.min(this.x + this.width - 2, bp.x));
        const by = Math.max(this.y + 2, Math.min(this.y + this.height - 2, bp.y));

        ctx.save();
        ctx.shadowColor = COLOR_BALL;
        ctx.shadowBlur = 4;
        ctx.fillStyle = COLOR_BALL;
        ctx.beginPath();
        ctx.arc(bx, by, MinimapRenderer.BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(this.x, this.y, this.width, this.height, MinimapRenderer.CORNER_RADIUS);
    } else {
      ctx.rect(this.x, this.y, this.width, this.height);
    }
    ctx.stroke();
    ctx.restore();
  }
}
