import type { GoalNet, Stadium } from '@legacyx/core';

export class NetRenderer {
  public render(
    ctx: CanvasRenderingContext2D,
    stadium: Stadium,
    leftNet?: GoalNet | null,
    rightNet?: GoalNet | null,
    ballX?: number,
    ballY?: number
  ): void {
    const hw = stadium.halfWidth;
    const gh = stadium.goalHalfHeight;
    const gd = stadium.goalDepth;

    this.drawGoalNet(ctx, 'left', -hw, -hw - gd, -gh, gh, leftNet, ballX, ballY);
    this.drawGoalNet(ctx, 'right', hw, hw + gd, -gh, gh, rightNet, ballX, ballY);
  }

  private drawGoalNet(
    ctx: CanvasRenderingContext2D,
    side: 'left' | 'right',
    mouthX: number,
    backX: number,
    topY: number,
    bottomY: number,
    net?: GoalNet | null,
    ballX?: number,
    ballY?: number
  ): void {
    ctx.save();

    // 1. Malla elástica de fondo
    if (net && net.posX && net.posY && net.nodeCount > 0) {
      // Dibujar cortina de masa-resorte física calculada por el motor
      ctx.strokeStyle = 'rgba(200, 225, 255, 0.45)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(net.sTopX, net.sTopY);
      for (let i = 0; i < net.nodeCount; i++) {
        ctx.lineTo(net.posX[i], net.posY[i]);
      }
      ctx.lineTo(net.sBottomX, net.sBottomY);
      ctx.stroke();

      // Líneas transversales de tensión hacia la boca de la portería
      ctx.strokeStyle = 'rgba(200, 225, 255, 0.20)';
      ctx.lineWidth = 1;
      const step = Math.max(1, Math.floor(net.nodeCount / 5));
      for (let i = 0; i < net.nodeCount; i += step) {
        ctx.beginPath();
        ctx.moveTo(mouthX, net.posY[i]);
        ctx.lineTo(net.posX[i], net.posY[i]);
        ctx.stroke();
      }
    } else {
      // Renderizado procedimental estético con micro-deformación ante la cercanía del balón
      let curtainMidX = backX;
      if (ballX !== undefined && ballY !== undefined) {
        const isNearLeft = side === 'left' && ballX < mouthX + 20 && ballX > backX - 30 && Math.abs(ballY) < bottomY + 10;
        const isNearRight = side === 'right' && ballX > mouthX - 20 && ballX < backX + 30 && Math.abs(ballY) < bottomY + 10;
        if (isNearLeft) {
          curtainMidX = Math.min(backX, ballX - 8);
        } else if (isNearRight) {
          curtainMidX = Math.max(backX, ballX + 8);
        }
      }

      // Rejilla de malla (Grid)
      ctx.strokeStyle = 'rgba(200, 225, 255, 0.35)';
      ctx.lineWidth = 1;

      // Líneas horizontales
      const rows = 8;
      const rowStep = (bottomY - topY) / rows;
      for (let r = 0; r <= rows; r++) {
        const y = topY + r * rowStep;
        ctx.beginPath();
        ctx.moveTo(mouthX, y);
        ctx.lineTo(curtainMidX, y);
        ctx.stroke();
      }

      // Líneas verticales
      const cols = 4;
      const colStep = (curtainMidX - mouthX) / cols;
      for (let c = 0; c <= cols; c++) {
        const x = mouthX + c * colStep;
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.stroke();
      }
    }

    // 2. Tensores exteriores y estructura de la portería
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.50)';
    ctx.lineWidth = 2;

    // Tensor superior
    ctx.beginPath();
    ctx.moveTo(mouthX, topY);
    ctx.lineTo(backX, topY);
    ctx.stroke();

    // Tensor inferior
    ctx.beginPath();
    ctx.moveTo(mouthX, bottomY);
    ctx.lineTo(backX, bottomY);
    ctx.stroke();

    // Viga trasera
    ctx.beginPath();
    ctx.moveTo(backX, topY);
    ctx.lineTo(backX, bottomY);
    ctx.stroke();

    ctx.restore();
  }
}
