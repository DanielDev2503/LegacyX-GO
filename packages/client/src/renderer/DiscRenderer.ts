import type { CompactDiscState } from '@legacyx/core';

export interface PlayerVisualInfo {
  nickname?: string;
  number?: number | string;
}

export class DiscRenderer {
  public ballRadius: number = 10;
  public playerRadius: number = 15;
  private ballRotation: number = 0;

  public renderBall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    vx: number,
    vy: number,
    flags: number = 0,
    spin: number = 0,
    dt: number = 1 / 60
  ): void {
    const r = this.ballRadius;
    const speed = Math.hypot(vx, vy);

    // 1. Acumulación angular de rotación física
    if (spin !== 0) {
      this.ballRotation += spin * dt * 12;
    } else if (speed > 0.1) {
      this.ballRotation += (vx / r) * dt * 4;
    }

    ctx.save();

    // 2. Sombra proyectada suavemente sobre el césped
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, r * 1.05, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Halo térmico si supera el umbral de disparo potente (> 950 px/s o bandera de powershot)
    const isPowerShot = (flags & (1 << 3)) !== 0 || speed > 15.8; // 15.8 px/tick ≈ 950 px/s
    if (isPowerShot) {
      const gradient = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.2);
      gradient.addColorStop(0, 'rgba(255, 140, 0, 0.7)');
      gradient.addColorStop(0.5, 'rgba(255, 69, 0, 0.4)');
      gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Disco del balón
    ctx.translate(x, y);
    ctx.rotate(this.ballRotation);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Textura geométrica clásica (pentágono / costuras)
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    const sides = 5;
    const innerR = r * 0.48;
    for (let i = 0; i < sides; i++) {
      const ang = (i * 2 * Math.PI) / sides;
      const px = Math.cos(ang) * innerR;
      const py = Math.sin(ang) * innerR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#1e272e';
    ctx.fill();
    ctx.stroke();

    // Costuras radiales del balón
    for (let i = 0; i < sides; i++) {
      const ang = (i * 2 * Math.PI) / sides;
      const innerX = Math.cos(ang) * innerR;
      const innerY = Math.sin(ang) * innerR;
      const outerX = Math.cos(ang) * r;
      const outerY = Math.sin(ang) * r;
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.stroke();
    }

    // Borde exterior del balón
    ctx.strokeStyle = '#1e272e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  public renderPlayer(
    ctx: CanvasRenderingContext2D,
    player: CompactDiscState,
    isLocalPlayer: boolean = false,
    playerInfo?: PlayerVisualInfo
  ): void {
    const x = player.x;
    const y = player.y;
    const r = this.playerRadius;
    const isRed = player.team === 1;
    const isBlue = player.team === 2;
    const isDashing = (player.flags & 2) !== 0;

    ctx.save();

    // 1. Sombra del jugador
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, r * 1.1, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Halo de Dash o selección local
    if (isDashing) {
      ctx.strokeStyle = isRed ? 'rgba(255, 107, 107, 0.8)' : 'rgba(77, 208, 225, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (isLocalPlayer) {
      ctx.strokeStyle = '#f1c40f'; // Anillo dorado identificador de jugador local
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Cuerpo principal del disco del jugador
    const baseColor = isRed ? '#e74c3c' : (isBlue ? '#3498db' : '#95a5a6');
    const darkAccent = isRed ? '#c0392b' : (isBlue ? '#2980b9' : '#7f8c8d');

    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, baseColor);
    grad.addColorStop(1, darkAccent);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Borde blanco perimetral nítido
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 4. Dorsal o identificador numérico en el centro
    const dorsal = playerInfo?.number ?? player.id;
    ctx.font = `bold ${Math.round(r * 0.85)}px 'JetBrains Mono', 'Consolas', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(dorsal), x, y + 0.5);

    // 5. Flecha indicadora de dirección si se mueve
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > 0.5) {
      const angle = Math.atan2(player.vy, player.vx);
      const arrowDist = r + 7;
      const ax = x + Math.cos(angle) * arrowDist;
      const ay = y + Math.sin(angle) * arrowDist;

      ctx.fillStyle = isRed ? '#ff7979' : '#70a1ff';
      ctx.beginPath();
      ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Nombre del jugador flotante sobre la cabeza
    const name = playerInfo?.nickname ?? `Player ${player.id}`;
    ctx.font = "11px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Contorno oscuro para legibilidad
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(name, x, y - r - 5);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, x, y - r - 5);

    ctx.restore();
  }
}
