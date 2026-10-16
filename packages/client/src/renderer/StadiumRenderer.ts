import type { Stadium } from '@legacyx/core';

export class StadiumRenderer {
  private stadium: Stadium | null = null;
  private cacheCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private cacheWidth: number = 0;
  private cacheHeight: number = 0;
  private cacheOriginX: number = 0;
  private cacheOriginY: number = 0;

  constructor(stadium?: Stadium) {
    if (stadium) {
      this.setStadium(stadium);
    }
  }

  public setStadium(stadium: Stadium): void {
    this.stadium = stadium;
    this.rebuildCache();
  }

  /**
   * Pre-renderiza la geometría estática del terreno en un buffer fuera de pantalla (OffscreenCanvas)
   * para erradicar el sobrecoste de dibujo (Overdraw) en cada fotograma.
   */
  public rebuildCache(): void {
    if (!this.stadium) return;

    const s = this.stadium;
    const padding = s.runOff + 60;
    this.cacheWidth = Math.ceil((s.halfWidth + padding) * 2);
    this.cacheHeight = Math.ceil((s.halfHeight + padding) * 2);
    this.cacheOriginX = this.cacheWidth / 2;
    this.cacheOriginY = this.cacheHeight / 2;

    if (typeof OffscreenCanvas !== 'undefined') {
      this.cacheCanvas = new OffscreenCanvas(this.cacheWidth, this.cacheHeight);
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = this.cacheWidth;
      c.height = this.cacheHeight;
      this.cacheCanvas = c;
    } else {
      return;
    }

    const ctx = this.cacheCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return;

    ctx.save();
    ctx.translate(this.cacheOriginX, this.cacheOriginY);

    // 1. Fondo exterior / Zona de escape (Run-off)
    const runW = s.halfWidth + s.runOff;
    const runH = s.halfHeight + s.runOff;
    ctx.fillStyle = '#0f1724'; // Color de grada / exterior oscuro
    ctx.beginPath();
    ctx.roundRect(-runW, -runH, runW * 2, runH * 2, 24);
    ctx.fill();

    // 2. Terreno de juego principal (Césped Cibernético con franjas alternadas)
    ctx.save();
    ctx.beginPath();
    ctx.rect(-s.halfWidth, -s.halfHeight, s.halfWidth * 2, s.halfHeight * 2);
    ctx.clip();

    ctx.fillStyle = '#172236'; // Base césped Cyber-Pitch
    ctx.fillRect(-s.halfWidth, -s.halfHeight, s.halfWidth * 2, s.halfHeight * 2);

    // Franjas de corte de césped
    const stripeWidth = 60;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let x = -s.halfWidth; x < s.halfWidth; x += stripeWidth * 2) {
      ctx.fillRect(x, -s.halfHeight, stripeWidth, s.halfHeight * 2);
    }
    ctx.restore();

    // 3. Estructura de arcos exteriores (cajas metálicas)
    const gd = s.goalDepth;
    const gh = s.goalHalfHeight;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;

    // Arco Izquierdo
    ctx.strokeRect(-s.halfWidth - gd, -gh, gd, gh * 2);
    // Arco Derecho
    ctx.strokeRect(s.halfWidth, -gh, gd, gh * 2);

    // 4. Marcaciones reglamentarias de cal
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Línea perimetral
    ctx.strokeRect(-s.halfWidth, -s.halfHeight, s.halfWidth * 2, s.halfHeight * 2);

    // Línea de medio campo
    ctx.beginPath();
    ctx.moveTo(0, -s.halfHeight);
    ctx.lineTo(0, s.halfHeight);
    ctx.stroke();

    // Círculo central y punto de saque
    ctx.beginPath();
    ctx.arc(0, 0, s.centerRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Áreas de portería
    const areaW = 80;
    const areaH = gh + 35;
    ctx.strokeRect(-s.halfWidth, -areaH, areaW, areaH * 2);
    ctx.strokeRect(s.halfWidth - areaW, -areaH, areaW, areaH * 2);

    // Semicírculos de área
    ctx.beginPath();
    ctx.arc(-s.halfWidth + areaW, 0, 30, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s.halfWidth - areaW, 0, 30, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();

    // Arcos de esquina (Córners)
    const cornerR = 15;
    ctx.beginPath();
    ctx.arc(-s.halfWidth, -s.halfHeight, cornerR, 0, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s.halfWidth, -s.halfHeight, cornerR, Math.PI / 2, Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-s.halfWidth, s.halfHeight, cornerR, -Math.PI / 2, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s.halfWidth, s.halfHeight, cornerR, Math.PI, (3 * Math.PI) / 2);
    ctx.stroke();

    // 5. Postes de portería con iluminación metálica simulada
    const pr = s.postRadius;
    const posts = [
      { x: -s.halfWidth, y: -gh },
      { x: -s.halfWidth, y: gh },
      { x: s.halfWidth, y: -gh },
      { x: s.halfWidth, y: gh }
    ];

    for (const post of posts) {
      // Sombra del poste
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(post.x + 2, post.y + 2, pr, 0, Math.PI * 2);
      ctx.fill();

      // Cilindro metálico
      const grad = ctx.createLinearGradient(post.x - pr, post.y - pr, post.x + pr, post.y + pr);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#b0bec5');
      grad.addColorStop(1, '#546e7a');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(post.x, post.y, pr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.cacheCanvas) {
      this.rebuildCache();
    }

    if (this.cacheCanvas) {
      // Dibujado en una sola orden de GPU
      ctx.drawImage(
        this.cacheCanvas as any,
        -this.cacheOriginX,
        -this.cacheOriginY
      );
    }
  }
}
