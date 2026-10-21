import { clamp } from '@legacyx/core';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CameraViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export class Camera {
  public x: number = 0;
  public y: number = 0;
  public targetX: number = 0;
  public targetY: number = 0;
  public zoom: number = 1.0;
  public scale: number = 1.0;
  public minScale: number = 0.7;
  public maxScale: number = 1.5;

  public setZoom(z: number): void {
    this.zoom = clamp(z, 0.7, 1.5);
    this.scale = this.zoom;
  }
  public readonly lerpFactor: number = 0.12;
  public smoothing: number = 0.12;

  public viewportWidth: number = 800;
  public viewportHeight: number = 600;

  private bounds: CameraBounds = {
    minX: -600,
    maxX: 600,
    minY: -300,
    maxY: 300
  };

  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private shakeElapsed: number = 0;
  public shakeOffsetX: number = 0;
  public shakeOffsetY: number = 0;

  private scratchViewportBounds: CameraViewportBounds = {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    width: 0,
    height: 0
  };

  constructor(initialX: number = 0, initialY: number = 0) {
    this.x = initialX;
    this.y = initialY;
    this.targetX = initialX;
    this.targetY = initialY;
  }

  public follow(targetX: number, targetY: number): void {
    this.targetX = targetX;
    this.targetY = targetY;
    this.x += (this.targetX - this.x) * this.lerpFactor;
    this.y += (this.targetY - this.y) * this.lerpFactor;
  }

  public calculateDualTarget(
    playerX: number,
    playerY: number,
    ballX: number,
    ballY: number,
    wBall: number = 0.25,
    maxDistance: number = 180
  ): { x: number; y: number } {
    const dx = ballX - playerX;
    const dy = ballY - playerY;
    const distSq = dx * dx + dy * dy;

    if (distSq <= 1e-6) {
      return { x: playerX, y: playerY };
    }

    const dist = Math.sqrt(distSq);
    if (!Number.isFinite(dist) || isNaN(dist)) {
      return { x: playerX, y: playerY };
    }

    const offset = Math.min(dist * wBall, maxDistance);
    const ratio = offset / dist;

    return {
      x: playerX + dx * ratio,
      y: playerY + dy * ratio
    };
  }

  public followDual(
    playerX: number,
    playerY: number,
    ballX: number,
    ballY: number,
    wBall: number = 0.25,
    maxDistance: number = 180
  ): void {
    const dx = ballX - playerX;
    const dy = ballY - playerY;
    const distSq = dx * dx + dy * dy;

    if (distSq <= 1e-6) {
      this.targetX = playerX;
      this.targetY = playerY;
    } else {
      const dist = Math.sqrt(distSq);
      if (!Number.isFinite(dist) || isNaN(dist)) {
        this.targetX = playerX;
        this.targetY = playerY;
      } else {
        const offset = Math.min(dist * wBall, maxDistance);
        const ratio = offset / dist;
        this.targetX = playerX + dx * ratio;
        this.targetY = playerY + dy * ratio;
      }
    }

    this.x += (this.targetX - this.x) * this.lerpFactor;
    this.y += (this.targetY - this.y) * this.lerpFactor;
  }

  public clamp(wExt: number, hExt: number, vWidth: number, vHeight: number, safeAreaBottom: number = 0): void {
    const z = Math.max(0.1, this.zoom || 1.0);
    const effectiveVWidth = vWidth / z;
    const boundX = (wExt - effectiveVWidth) / 2;
    if (boundX <= 0) {
      this.x = 0;
    } else {
      this.x = clamp(this.x, -boundX, boundX);
    }

    const usableHeight = (vHeight - safeAreaBottom) / z;
    const boundY = (hExt - usableHeight) / 2;
    if (boundY <= 0) {
      this.y = 0;
    } else {
      this.y = clamp(this.y, -boundY, boundY);
    }
  }

  public reset(x: number = 0, y: number = 0): void {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
  }

  public getViewportBounds(
    vWidth: number,
    vHeight: number,
    offsetX?: number,
    offsetY?: number,
    out?: CameraViewportBounds
  ): CameraViewportBounds {
    const z = Math.max(0.1, this.zoom || 1.0);
    const ox = offsetX !== undefined ? offsetX : vWidth / 2;
    const oy = offsetY !== undefined ? offsetY : vHeight / 2;

    const minX = this.x - ox / z;
    const maxX = this.x + (vWidth - ox) / z;
    const minY = this.y - oy / z;
    const maxY = this.y + (vHeight - oy) / z;

    const target = out || this.scratchViewportBounds;
    target.minX = minX;
    target.maxX = maxX;
    target.minY = minY;
    target.maxY = maxY;
    target.width = maxX - minX;
    target.height = maxY - minY;
    return target;
  }

  public setBounds(halfWidth: number, halfHeight: number, margin: number = 60): void {
    this.bounds = {
      minX: -halfWidth - margin,
      maxX: halfWidth + margin,
      minY: -halfHeight - margin,
      maxY: halfHeight + margin
    };
  }

  public resize(width: number, height: number, _stadiumWidth: number = 1200, _stadiumHeight: number = 540): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    // Strict 1:1 scale invariance on resize
    this.scale = 1.0;
    this.zoom = 1.0;
  }

  public triggerShake(intensity: number, durationMs: number = 150): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = durationMs / 1000;
    this.shakeElapsed = 0;
  }

  public update(dt: number, focusX: number, focusY: number): void {
    this.targetX = focusX;
    this.targetY = focusY;

    const t = 1 - Math.pow(1 - this.smoothing, dt * 60);
    this.x += (this.targetX - this.x) * t;
    this.y += (this.targetY - this.y) * t;

    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));

    if (this.shakeElapsed < this.shakeDuration) {
      this.shakeElapsed += dt;
      const progress = Math.min(1.0, this.shakeElapsed / this.shakeDuration);
      const decay = Math.pow(1.0 - progress, 2);
      const currentIntensity = this.shakeIntensity * decay;

      const angle = Math.random() * Math.PI * 2;
      this.shakeOffsetX = Math.cos(angle) * currentIntensity;
      this.shakeOffsetY = Math.sin(angle) * currentIntensity;
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  public applyTransform(ctx: CanvasRenderingContext2D, safeAreaBottom: number = 0): void {
    ctx.save();
    const usableH = Math.max(100, this.viewportHeight - safeAreaBottom);
    ctx.translate(this.viewportWidth / 2, usableH / 2);
    ctx.scale(this.scale * this.zoom, this.scale * this.zoom);
    ctx.translate(-this.x - this.shakeOffsetX, -this.y - this.shakeOffsetY);
  }

  public restoreTransform(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const sx = (worldX - this.x - this.shakeOffsetX) * this.scale + this.viewportWidth / 2;
    const sy = (worldY - this.y - this.shakeOffsetY) * this.scale + this.viewportHeight / 2;
    return { x: sx, y: sy };
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const wx = (screenX - this.viewportWidth / 2) / this.scale + this.x + this.shakeOffsetX;
    const wy = (screenY - this.viewportHeight / 2) / this.scale + this.y + this.shakeOffsetY;
    return { x: wx, y: wy };
  }
}
