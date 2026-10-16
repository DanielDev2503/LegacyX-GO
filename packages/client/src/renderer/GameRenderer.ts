import {
  type GameStateSnapshot,
  type CompactDiscState,
  type Stadium,
  createStadium,
  DEFAULT_STADIUM_ID,
  lerp,
  SOUND_POST_HIT,
  SOUND_GOAL,
  MatchPhase
} from '@legacyx/core';

import { Camera } from './Camera.js';
import { StadiumRenderer } from './StadiumRenderer.js';
import { NetRenderer } from './NetRenderer.js';
import { DiscRenderer, type PlayerVisualInfo } from './DiscRenderer.js';
import { VFXManager } from './VFXManager.js';

export interface GameRendererOptions {
  stadium?: Stadium;
  playerInfos?: Map<number, PlayerVisualInfo>;
}

export class GameRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly camera: Camera;
  public readonly stadiumRenderer: StadiumRenderer;
  public readonly netRenderer: NetRenderer;
  public readonly discRenderer: DiscRenderer;
  public readonly vfx: VFXManager;

  public stadium: Stadium;
  public playerInfos: Map<number, PlayerVisualInfo> = new Map();

  private lastRenderTimestamp: number = 0;
  private lastPhase: number = -1;
  private lastProcessedSoundMask: number = 0;
  private isDestroyed: boolean = false;

  constructor(canvas: HTMLCanvasElement, options?: GameRendererOptions) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('No se pudo inicializar CanvasRenderingContext2D');
    }
    this.ctx = context;

    this.stadium = options?.stadium ?? createStadium(DEFAULT_STADIUM_ID);
    if (options?.playerInfos) {
      this.playerInfos = options.playerInfos;
    }

    this.camera = new Camera(canvas.width, canvas.height);
    this.camera.setBounds(this.stadium.halfWidth, this.stadium.halfHeight);

    this.stadiumRenderer = new StadiumRenderer(this.stadium);
    this.netRenderer = new NetRenderer();
    this.discRenderer = new DiscRenderer();
    this.vfx = new VFXManager();

    this.resize(canvas.width, canvas.height);
  }

  public setStadium(stadium: Stadium): void {
    this.stadium = stadium;
    this.camera.setBounds(stadium.halfWidth, stadium.halfHeight);
    this.stadiumRenderer.setStadium(stadium);
    this.resize(this.canvas.width, this.canvas.height);
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.resize(width, height, this.stadium.width, this.stadium.height);
  }

  public triggerShake(intensity: number, durationMs: number = 250): void {
    this.camera.triggerShake(intensity, durationMs);
  }

  /**
   * Ciclo principal de renderizado ejecutado en requestAnimationFrame.
   * Interpola linealmente (lerp) los estados físicos desacoplados a cualquier tasa de refresco.
   */
  public render(
    prevSnapshot: GameStateSnapshot | null,
    currSnapshot: GameStateSnapshot | null,
    alpha: number = 1.0,
    localPlayerId?: number
  ): void {
    if (this.isDestroyed || (!prevSnapshot && !currSnapshot)) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this.lastRenderTimestamp > 0 ? Math.min(0.1, (now - this.lastRenderTimestamp) / 1000) : 1 / 60;
    this.lastRenderTimestamp = now;

    const s0 = prevSnapshot ?? currSnapshot!;
    const s1 = currSnapshot ?? prevSnapshot!;
    const clampedAlpha = Math.max(0, Math.min(1.0, alpha));

    // 1. Mapeo de discos previos y actuales para interpolación lineal (Lerp)
    const prevDiscs = new Map<number, CompactDiscState>();
    for (let i = 0; i < s0.discs.length; i++) {
      prevDiscs.set(s0.discs[i].id, s0.discs[i]);
    }

    let ballX = 0;
    let ballY = 0;
    let ballVx = 0;
    let ballVy = 0;
    let ballFlags = 0;
    let ballSpin = 0;
    let hasBall = false;

    let localPlayerX = 0;
    let localPlayerY = 0;
    let hasLocalPlayer = false;

    // Discos interpolados para este fotograma visual
    const renderDiscs: Array<{
      disc: CompactDiscState;
      x: number;
      y: number;
      vx: number;
      vy: number;
      isLocal: boolean;
    }> = [];

    for (let i = 0; i < s1.discs.length; i++) {
      const d1 = s1.discs[i];
      const d0 = prevDiscs.get(d1.id) ?? d1;

      const ix = lerp(d0.x, d1.x, clampedAlpha);
      const iy = lerp(d0.y, d1.y, clampedAlpha);
      const ivx = lerp(d0.vx, d1.vx, clampedAlpha);
      const ivy = lerp(d0.vy, d1.vy, clampedAlpha);

      const isLocal = localPlayerId !== undefined && d1.id === localPlayerId;

      if (d1.team === 0) {
        // Balón
        ballX = ix;
        ballY = iy;
        ballVx = ivx;
        ballVy = ivy;
        ballFlags = d1.flags;
        ballSpin = d1.spin ?? 0;
        hasBall = true;
      } else {
        // Jugador
        if (isLocal) {
          localPlayerX = ix;
          localPlayerY = iy;
          hasLocalPlayer = true;
        }
      }

      renderDiscs.push({
        disc: d1,
        x: ix,
        y: iy,
        vx: ivx,
        vy: ivy,
        isLocal
      });
    }

    // 2. Punto focal de cámara: promedio ponderado entre balón y jugador local
    let focusX = 0;
    let focusY = 0;
    if (hasBall && hasLocalPlayer) {
      focusX = ballX * 0.65 + localPlayerX * 0.35;
      focusY = ballY * 0.65 + localPlayerY * 0.35;
    } else if (hasBall) {
      focusX = ballX;
      focusY = ballY;
    } else if (hasLocalPlayer) {
      focusX = localPlayerX;
      focusY = localPlayerY;
    }

    // 3. Game Feel: Detección de eventos acústicos/físicos en el snapshot
    if (s1.soundMask !== this.lastProcessedSoundMask) {
      if ((s1.soundMask & SOUND_POST_HIT) !== 0) {
        this.triggerShake(9, 280);
        this.vfx.emitPostSparks(ballX, ballY, 12);
      }
      if ((s1.soundMask & SOUND_GOAL) !== 0) {
        this.triggerShake(16, 500);
        this.vfx.showFloatingText('¡GOL!', '#ffd32a', 0, -80, 2.2);
      }
      this.lastProcessedSoundMask = s1.soundMask;
    }

    // 4. Game Feel: Detección de cambios de fase en GameFSM
    if (s1.phase !== this.lastPhase) {
      if (s1.phase === MatchPhase.KICKOFF) {
        this.vfx.showFloatingText('KICKOFF', '#ffffff', 0, -60, 1.5);
      } else if (s1.phase === MatchPhase.PAUSE) {
        this.vfx.showFloatingText('PAUSA', '#ff9f43', 0, -60, 2.0);
      } else if (s1.phase === MatchPhase.STATS || s1.phase === MatchPhase.MATCH_ENDED) {
        this.vfx.showFloatingText('FIN DEL PARTIDO', '#2ed573', 0, -80, 3.0);
      }
      this.lastPhase = s1.phase;
    }

    // 5. Game Feel: Emisión de estelas en el balón (Magnus y Fuego)
    if (hasBall) {
      const ballSpeed = Math.hypot(ballVx, ballVy);
      // Efecto Magnus (neón curvado si hay rotación/spin)
      if (Math.abs(ballSpin) > 0.1 || (ballFlags & 2) !== 0) {
        const magnusColor = ballSpin > 0 ? '#3498db' : '#e74c3c';
        this.vfx.emitMagnusTrail(ballX, ballY, magnusColor, this.discRenderer.ballRadius);
      }
      // Efecto Fuego si la velocidad supera el umbral terminal (> 950 px/s ≈ 15.8 px/tick)
      if (ballSpeed > 15.8 || (ballFlags & (1 << 3)) !== 0) {
        this.vfx.emitFireTrail(ballX, ballY, ballVx, ballVy);
      }
    }

    // 6. Actualización de cámara y partículas
    this.camera.update(dt, focusX, focusY);
    this.vfx.update(dt);

    // 7. Renderizado en el Canvas
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Aplicar transformación de cámara (Zoom, Posición, Screen Shake)
    this.camera.applyTransform(ctx);

    // A. Terreno de juego optimizado en OffscreenCanvas
    this.stadiumRenderer.render(ctx);

    // B. Mallas elásticas de porterías (NetRenderer)
    this.netRenderer.render(ctx, this.stadium, null, null, ballX, ballY);

    // C. Jugadores
    for (let i = 0; i < renderDiscs.length; i++) {
      const item = renderDiscs[i];
      if (item.disc.team !== 0) {
        const info = this.playerInfos.get(item.disc.id);
        this.discRenderer.renderPlayer(ctx, item.disc, item.isLocal, info);
      }
    }

    // D. Balón
    if (hasBall) {
      this.discRenderer.renderBall(ctx, ballX, ballY, ballVx, ballVy, ballFlags, ballSpin, dt);
    }

    // E. Partículas y textos flotantes (VFX)
    this.vfx.render(ctx);

    // Restaurar transformación de cámara
    this.camera.restoreTransform(ctx);
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.vfx.clear();
  }
}
