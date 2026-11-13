import type { Stadium } from '@legacyx/core';

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || typeof hex !== 'string') return `rgba(255, 255, 255, ${alpha})`;
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(255, 255, 255, ${alpha})`;
}

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
  private cachedRedColor: string | null = null;
  private cachedBlueColor: string | null = null;
  public theme: 'dark' | 'light' = 'dark';
  public redTeamColor: string = '#FF0055';
  public blueTeamColor: string = '#00E5FF';

  public setTeamColors(red: string, blue: string): void {
    let changed = false;
    if (red && red !== this.redTeamColor) {
      this.redTeamColor = red;
      changed = true;
    }
    if (blue && blue !== this.blueTeamColor) {
      this.blueTeamColor = blue;
      changed = true;
    }
    if (changed) {
      this.invalidateCache();
      this.rebuildCache();
    }
  }

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
    this.cachedRedColor = null;
    this.cachedBlueColor = null;
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
    // Left Penalty Area (Red captain kit tint)
    ctx.save();
    ctx.fillStyle = hexToRgba(this.redTeamColor, isDark ? 0.06 : 0.03);
    ctx.fillRect(-hw, -penaltyAreaHeight / 2, penaltyAreaWidth, penaltyAreaHeight);
    ctx.strokeStyle = hexToRgba(this.redTeamColor, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hw, -penaltyAreaHeight / 2);
    ctx.lineTo(-hw + penaltyAreaWidth, -penaltyAreaHeight / 2);
    ctx.lineTo(-hw + penaltyAreaWidth, penaltyAreaHeight / 2);
    ctx.lineTo(-hw, penaltyAreaHeight / 2);
    ctx.stroke();
    ctx.restore();

    // Right Penalty Area (Blue captain kit tint)
    ctx.save();
    ctx.fillStyle = hexToRgba(this.blueTeamColor, isDark ? 0.06 : 0.03);
    ctx.fillRect(hw - penaltyAreaWidth, -penaltyAreaHeight / 2, penaltyAreaWidth, penaltyAreaHeight);
    ctx.strokeStyle = hexToRgba(this.blueTeamColor, 0.35);
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
    const goalLineAlpha = isDark ? 0.45 : 0.5;

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

    // Dashed goal lines (adopt captain primary kit colors)
    ctx.lineWidth = 2;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([4, 4]);
    }
    ctx.strokeStyle = hexToRgba(this.redTeamColor, goalLineAlpha);
    ctx.beginPath();
    ctx.moveTo(-hw, -gh);
    ctx.lineTo(-hw, gh);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba(this.blueTeamColor, goalLineAlpha);
    ctx.beginPath();
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
    this.cachedRedColor = this.redTeamColor;
    this.cachedBlueColor = this.blueTeamColor;
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
      this.cachedTheme !== this.theme ||
      this.cachedRedColor !== this.redTeamColor ||
      this.cachedBlueColor !== this.blueTeamColor
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
    const haloColor = isLeft
      ? hexToRgba(this.redTeamColor, 0.4)
      : hexToRgba(this.blueTeamColor, 0.4);

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

    ctx.strokeStyle = isLeft ? this.redTeamColor : this.blueTeamColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

export { StadiumRenderer as PitchRenderer };
