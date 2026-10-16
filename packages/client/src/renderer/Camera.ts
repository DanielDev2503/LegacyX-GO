export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class Camera {
  public x: number = 0;
  public y: number = 0;
  public targetX: number = 0;
  public targetY: number = 0;
  public scale: number = 1.0;
  public minScale: number = 0.6;
  public maxScale: number = 1.4;

  public viewportWidth: number = 800;
  public viewportHeight: number = 600;

  private bounds: CameraBounds = {
    minX: -450,
    maxX: 450,
    minY: -250,
    maxY: 250
  };

  // Parámetros de Screen Shake (micro-sacudida direccional)
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private shakeElapsed: number = 0;
  public shakeOffsetX: number = 0;
  public shakeOffsetY: number = 0;

  // Factor de suavizado (lerp exponencial)
  public smoothing: number = 0.08;

  constructor(viewportWidth: number = 800, viewportHeight: number = 600) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  public setBounds(halfWidth: number, halfHeight: number, margin: number = 60): void {
    this.bounds = {
      minX: -halfWidth - margin,
      maxX: halfWidth + margin,
      minY: -halfHeight - margin,
      maxY: halfHeight + margin
    };
  }

  public resize(width: number, height: number, stadiumWidth: number = 840, stadiumHeight: number = 400): void {
    this.viewportWidth = width;
    this.viewportHeight = height;

    // Ajuste dinámico de escala para mantener el campo en foco óptimo
    const desiredVisibleWidth = stadiumWidth + 180;
    const desiredVisibleHeight = stadiumHeight + 140;
    const scaleX = width / desiredVisibleWidth;
    const scaleY = height / desiredVisibleHeight;
    const calculatedScale = Math.min(scaleX, scaleY);

    this.scale = Math.max(this.minScale, Math.min(this.maxScale, calculatedScale));
  }

  public triggerShake(intensity: number, durationMs: number = 250): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = durationMs / 1000;
    this.shakeElapsed = 0;
  }

  public update(dt: number, focusX: number, focusY: number): void {
    // 1. Seguimiento suavizado del punto focal (lerp exponencial)
    this.targetX = focusX;
    this.targetY = focusY;

    const t = 1 - Math.pow(1 - this.smoothing, dt * 60);
    this.x += (this.targetX - this.x) * t;
    this.y += (this.targetY - this.y) * t;

    // 2. Confinamiento dentro de los límites del estadio
    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));

    // 3. Cálculo de sacudida elástica con decaimiento cuadrático
    if (this.shakeElapsed < this.shakeDuration) {
      this.shakeElapsed += dt;
      const progress = Math.min(1.0, this.shakeElapsed / this.shakeDuration);
      const decay = Math.pow(1.0 - progress, 2); // Decaimiento elástico cuadrático
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

  public applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // Centrar en el viewport
    ctx.translate(this.viewportWidth / 2, this.viewportHeight / 2);
    // Aplicar escala responsiva
    ctx.scale(this.scale, this.scale);
    // Desplazar por posición de cámara y screen shake
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
