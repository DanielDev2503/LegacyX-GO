import type { Stadium } from '@legacyx/core';

export class StadiumRenderer {
  private stadium: Stadium | null = null;
  public cacheCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  public get cachedCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
    return this.cacheCanvas;
  }
  public set cachedCanvas(canvas: HTMLCanvasElement | OffscreenCanvas | null) {
    this.cacheCanvas = canvas;
  }

  public cachedStadium: Stadium | null = null;
  private cachedTheme: 'dark' | 'light' | null = null;
  private cachedWidth: number = 0;
  private cachedHeight: number = 0;
  private cachedGoalSize: number = 0;
  public theme: 'dark' | 'light' = 'dark';

  constructor(stadium?: Stadium) {
    if (stadium) {
      this.setStadium(stadium);
    }
  }

  public setStadium(stadium: Stadium): void {
    this.stadium = stadium;
    this.invalidateCache();
    this.rebuildCache();
  }

  public invalidateCache(): void {
    this.cacheCanvas = null;
    this.cachedStadium = null;
  }

  public resize(): void {
    this.invalidateCache();
  }

  public rebuildCache(): void {
    if (!this.stadium) return;
    const width = this.stadium.width ?? this.stadium.halfWidth * 2;
    const height = this.stadium.height ?? this.stadium.halfHeight * 2;
    this.buildCachedCanvas(this.stadium, width, height, this.theme === 'dark');
  }

  private buildCachedCanvas(stadium: Stadium, width: number, height: number, isDark: boolean): void {
    if (typeof document !== 'undefined') {
      if (!this.cacheCanvas || !('style' in this.cacheCanvas)) {
        this.cacheCanvas = document.createElement('canvas');
      }
      this.cacheCanvas.width = width;
      this.cacheCanvas.height = height;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      this.cacheCanvas = new OffscreenCanvas(width, height);
    } else {
      return;
    }

    const ctx = this.cacheCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx || typeof ctx.translate !== 'function' || typeof ctx.fillRect !== 'function') return;

    const hw = width / 2;
    const hh = height / 2;
    const goalSize = stadium.goals?.[0]?.size ?? stadium.goalSize ?? stadium.goalHalfHeight * 2;
    const gh = goalSize / 2;
    const cr = stadium.centerRadius;
    const penaltyAreaWidth = width * 0.075;
    const penaltyAreaHeight = gh * 3;

    ctx.save();
    ctx.translate(hw, hh);

    // 1. Pitch surface gradient (Dark Mode Navy #070F1E vs Light Mode Pearl #F8FAFC)
    const pitchGrad = ctx.createLinearGradient(0, -hh, 0, hh);
    if (isDark) {
      pitchGrad.addColorStop(0, '#0B111E');
      pitchGrad.addColorStop(0.5, '#070F1E');
      pitchGrad.addColorStop(1, '#050811');
    } else {
      pitchGrad.addColorStop(0, '#FFFFFF');
      pitchGrad.addColorStop(0.5, '#F8FAFC');
      pitchGrad.addColorStop(1, '#F1F5F9');
    }
    ctx.fillStyle = pitchGrad;
    ctx.fillRect(-hw, -hh, width, height);

    // 2. Translucent Cyber-Aero Grid
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(0, 229, 255, 0.04)' : 'rgba(14, 165, 233, 0.07)';
    ctx.lineWidth = 1;
    const gridSize = 28;

    ctx.beginPath();
    for (let x = -hw; x <= hw; x += gridSize) {
      ctx.moveTo(x, -hh);
      ctx.lineTo(x, hh);
    }
    for (let y = -hh; y <= hh; y += gridSize) {
      ctx.moveTo(-hw, y);
      ctx.lineTo(hw, y);
    }
    ctx.stroke();
    ctx.restore();

    // 3. Penalty Areas with Team Identity
    // Left Penalty Area (Red #FF0055)
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(255, 0, 85, 0.06)' : 'rgba(255, 0, 85, 0.03)';
    ctx.fillRect(-hw, -penaltyAreaHeight / 2, penaltyAreaWidth, penaltyAreaHeight);
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hw, -penaltyAreaHeight / 2);
    ctx.lineTo(-hw + penaltyAreaWidth, -penaltyAreaHeight / 2);
    ctx.lineTo(-hw + penaltyAreaWidth, penaltyAreaHeight / 2);
    ctx.lineTo(-hw, penaltyAreaHeight / 2);
    ctx.stroke();
    ctx.restore();

    // Right Penalty Area (Blue #00E5FF)
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(0, 229, 255, 0.06)' : 'rgba(0, 229, 255, 0.03)';
    ctx.fillRect(hw - penaltyAreaWidth, -penaltyAreaHeight / 2, penaltyAreaWidth, penaltyAreaHeight);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hw, -penaltyAreaHeight / 2);
    ctx.lineTo(hw - penaltyAreaWidth, -penaltyAreaHeight / 2);
    ctx.lineTo(hw - penaltyAreaWidth, penaltyAreaHeight / 2);
    ctx.lineTo(hw, penaltyAreaHeight / 2);
    ctx.stroke();
    ctx.restore();

    // 4. Pitch Markings (concentric strokes, zero CPU shadowBlur)
    ctx.save();
    const lineColor = isDark ? 'rgba(0, 229, 255, 0.45)' : '#0EA5E9';
    const dotColor = isDark ? '#00E5FF' : '#0EA5E9';
    const dashLineColor = isDark ? 'rgba(0, 229, 255, 0.45)' : 'rgba(14, 165, 233, 0.5)';

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-hw, -hh);
    ctx.lineTo(hw, -hh);
    ctx.lineTo(hw, -gh);
    ctx.moveTo(hw, gh);
    ctx.lineTo(hw, hh);
    ctx.lineTo(-hw, hh);
    ctx.lineTo(-hw, gh);
    ctx.moveTo(-hw, -gh);
    ctx.lineTo(-hw, -hh);
    ctx.stroke();

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(0, hh);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, cr, 0, Math.PI * 2);
    ctx.stroke();

    // Center crosshairs
    ctx.beginPath();
    const tick = 8;
    ctx.moveTo(-tick, 0);
    ctx.lineTo(tick, 0);
    ctx.moveTo(0, -tick);
    ctx.lineTo(0, tick);
    ctx.stroke();

    // Center spot
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Dashed goal lines
    ctx.strokeStyle = dashLineColor;
    ctx.lineWidth = 2;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([4, 4]);
    }
    ctx.beginPath();
    ctx.moveTo(-hw, -gh);
    ctx.lineTo(-hw, gh);
    ctx.moveTo(hw, -gh);
    ctx.lineTo(hw, gh);
    ctx.stroke();

    ctx.restore();
    ctx.restore();

    this.cachedStadium = stadium;
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.cachedGoalSize = goalSize;
    this.cachedTheme = isDark ? 'dark' : 'light';
  }

  public renderPitch(ctx: CanvasRenderingContext2D, stadium?: Stadium): void {
    const activeStadium = stadium ?? this.stadium;
    if (!activeStadium) return;

    const isDark = this.theme === 'dark';
    const width = activeStadium.width ?? activeStadium.halfWidth * 2;
    const height = activeStadium.height ?? activeStadium.halfHeight * 2;
    const goalSize = activeStadium.goals?.[0]?.size ?? activeStadium.goalSize ?? activeStadium.goalHalfHeight * 2;
    const hw = width / 2;
    const hh = height / 2;

    if (
      !this.cacheCanvas ||
      this.cachedStadium !== activeStadium ||
      this.cachedWidth !== width ||
      this.cachedHeight !== height ||
      this.cachedGoalSize !== goalSize ||
      this.cachedTheme !== this.theme
    ) {
      this.buildCachedCanvas(activeStadium, width, height, isDark);
    }

    if (this.cacheCanvas && typeof ctx.drawImage === 'function') {
      ctx.drawImage(this.cacheCanvas as CanvasImageSource, -hw, -hh);
    }
  }

  public renderPosts(ctx: CanvasRenderingContext2D, stadium?: Stadium): void {
    const activeStadium = stadium ?? this.stadium;
    if (!activeStadium || !activeStadium.posts) return;
    for (const post of activeStadium.posts) {
      this.renderPost(ctx, post.pos.x, post.pos.y, post.radius);
    }
  }

  public draw(ctx: CanvasRenderingContext2D, stadium: Stadium): void {
    this.render(ctx, stadium);
  }

  public render(ctx: CanvasRenderingContext2D, stadium?: Stadium): void {
    const currentStadium = stadium ?? this.stadium ?? this.cachedStadium;
    if (currentStadium) {
      this.renderPitch(ctx, currentStadium);
      this.renderPosts(ctx, currentStadium);
    } else if (this.cacheCanvas && typeof ctx.drawImage === 'function') {
      ctx.drawImage(this.cacheCanvas as CanvasImageSource, 0, 0);
    }
  }

  private renderPost(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.save();
    const isLeft = x < 0;
    const haloColor = isLeft ? 'rgba(255, 0, 85, 0.4)' : 'rgba(0, 229, 255, 0.4)';

    // Drop shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, r, 0, Math.PI * 2);
    ctx.fill();

    // Concentric halo stroke (zero shadowBlur)
    ctx.strokeStyle = haloColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.stroke();

    if (typeof ctx.createRadialGradient === 'function') {
      const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.45, '#E2E8F0');
      grad.addColorStop(0.8, '#94A3B8');
      grad.addColorStop(1, '#475569');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#E2E8F0';
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isLeft ? '#FF0055' : '#0EA5E9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

export { StadiumRenderer as PitchRenderer };
