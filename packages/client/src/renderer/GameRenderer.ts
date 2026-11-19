import {
  type GameStateSnapshot,
  type GameSnapshot,
  type CompactDiscState,
  type DiscSnapshot,
  type Stadium,
  GoalNet,
  createStadium,
  DEFAULT_STADIUM_ID,
  lerp,
  SOUND_POST_HIT,
  SOUND_GOAL,
  MatchPhase,
  GameMatchPhase,
  toMatchPhase
} from '@legacyx/core';

import { Camera } from './Camera';
import { StadiumRenderer } from './StadiumRenderer';
import { NetRenderer } from './NetRenderer';
import { DiscRenderer, type PlayerVisualInfo } from './DiscRenderer';
import { VFXManager } from './VFXManager';
import { MinimapRenderer, type MinimapSettings } from './MinimapRenderer';
import {
  OffscreenIndicatorRenderer,
  type OffscreenDrawOptions,
  type ExclusionRect
} from './OffscreenIndicatorRenderer';

export interface FloatingScoreText {
  text: string;
  x: number;
  y: number;
  startY: number;
  life: number;
  maxLife: number;
  active: boolean;
  color?: string | undefined;
}

export interface GameRendererOptions {
  stadium?: Stadium;
  playerInfos?: Map<number, PlayerVisualInfo>;
  overrideDpr?: number;
  theme?: 'dark' | 'light';
}

export class GameRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly camera: Camera;
  public readonly stadiumRenderer: StadiumRenderer;
  public readonly pitchRenderer: StadiumRenderer;
  public readonly netRenderer: NetRenderer;
  public readonly discRenderer: DiscRenderer;
  public readonly vfx: VFXManager;
  public readonly minimapRenderer: MinimapRenderer;
  public readonly offscreenRenderer: OffscreenIndicatorRenderer;

  public stadium: Stadium;
  public playerInfos: Map<number, PlayerVisualInfo> = new Map();
  public floatingScores: FloatingScoreText[] = [];
  public goalNets: GoalNet[] | null = null;
  private localGoalNets: GoalNet[] = [];
  public extrapolationMs: number = 0;

  public scale: number = 1.0;
  public offsetX: number = 0;
  public offsetY: number = 0;
  private _desktopSafeAreaBottom: number = 160;
  private _isMobileLayout: boolean = false;
  public mobileExclusionZones: ExclusionRect[] = [];
  public chatHeight: number = 130;
  public chatWidth: number = 340;
  public theme: 'dark' | 'light' = 'dark';
  public overrideDpr?: number;
  public focusBallOnly: boolean = false;

  public get isMobileLayout(): boolean {
    return this._isMobileLayout;
  }

  public set isMobileLayout(value: boolean) {
    const next = Boolean(value);
    if (this._isMobileLayout === next) return;
    this._isMobileLayout = next;
    this.camera.isMobileLayout = next;
    this.minimapRenderer.positionMode = next ? 'bottom-center' : 'bottom-right';
    const hasCanvasDims =
      !!this.canvas &&
      ((this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) ||
        (this.canvas.width > 0 && this.canvas.height > 0));
    if (hasCanvasDims) {
      this.handleResize();
    } else if (next) {
      const vHeight = this.camera.viewportHeight;
      if (typeof vHeight === 'number' && Number.isFinite(vHeight) && vHeight > 0) {
        const autoZoom = this.getMobileAutoZoom(vHeight);
        this.camera.setZoom(autoZoom);
        this.scale = this.camera.zoom;
      }
    } else {
      this.camera.setZoom(1.0);
      this.scale = 1.0;
    }
  }

  public get safeAreaBottom(): number {
    return this.getEffectiveSafeAreaBottom();
  }

  public set safeAreaBottom(value: number) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      this._desktopSafeAreaBottom = value;
    }
  }

  // Visual toggles
  public netDeformationEnabled: boolean = true;
  public offscreenIndicatorsEnabled: boolean = true;
  public goalShakeEnabled: boolean = true;
  public screenShakeEnabled: boolean = true;

  // Minimap settings
  public minimapEnabled: boolean = true;
  public minimapOpacity: number = 0.6;
  public minimapSize: number = 200;
  public minimapCameraFrustum: boolean = true;

  public cameraOffset: { x: number; y: number } = { x: 0, y: 0 };

  private lastRenderTimestamp: number = 0;
  private lastPhase: number = -1;
  private lastReplayTick: number = -1;
  private prevReplayBallX: number | null = null;
  private prevReplayBallY: number | null = null;
  private lastProcessedSoundMask: number = 0;
  private isDestroyed: boolean = false;

  // Scratch buffers for Zero-GC interpolation
  private scratchBall = {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    radius: 5.8
  };
  private scratchDiscSnapshots: DiscSnapshot[] = [];

  constructor(canvas: HTMLCanvasElement, optionsOrStadium?: GameRendererOptions | Stadium) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('No se pudo inicializar CanvasRenderingContext2D');
    }
    this.ctx = context;

    if (optionsOrStadium && 'halfWidth' in optionsOrStadium) {
      this.stadium = optionsOrStadium;
    } else {
      const opts = optionsOrStadium as GameRendererOptions | undefined;
      this.stadium = opts?.stadium ?? createStadium(DEFAULT_STADIUM_ID);
      if (opts?.playerInfos) {
        this.playerInfos = opts.playerInfos;
      }
      if (typeof opts?.overrideDpr === 'number' && Number.isFinite(opts.overrideDpr) && opts.overrideDpr > 0) {
        this.overrideDpr = opts.overrideDpr;
      }
      if (opts?.theme === 'dark' || opts?.theme === 'light') {
        this.theme = opts.theme;
      }
    }

    this.camera = new Camera(0, 0);
    this.camera.topHudHeightPx = 62;
    this.camera.setBounds(this.stadium.halfWidth, this.stadium.halfHeight);

    this.stadiumRenderer = new StadiumRenderer(this.stadium);
    this.stadiumRenderer.theme = this.theme;
    this.pitchRenderer = this.stadiumRenderer;
    this.netRenderer = new NetRenderer();
    this.discRenderer = new DiscRenderer();
    this.discRenderer.theme = this.theme;
    this.discRenderer.setStadiumBounds({ ...this.stadium.bounds, runOff: this.stadium.runOff });
    this.vfx = new VFXManager();
    this.minimapRenderer = new MinimapRenderer(this.stadium);
    this.offscreenRenderer = new OffscreenIndicatorRenderer();

    this.initLocalGoalNets();
    this.handleResize();
  }

  private initLocalGoalNets(): void {
    let leftXPost = -this.stadium.halfWidth;
    let rightXPost = this.stadium.halfWidth;
    let leftYPost = this.stadium.goalHalfHeight;
    let rightYPost = this.stadium.goalHalfHeight;

    if (this.stadium.goals && this.stadium.goals.length >= 2) {
      const gRed = this.stadium.goals.find((g) => g.team === 'red') || this.stadium.goals[0]!;
      const gBlue = this.stadium.goals.find((g) => g.team === 'blue') || this.stadium.goals[1]!;
      leftXPost = Math.min(gRed.p0.x, gRed.p1.x);
      leftYPost = Math.max(Math.abs(gRed.p0.y), Math.abs(gRed.p1.y));
      rightXPost = Math.max(gBlue.p0.x, gBlue.p1.x);
      rightYPost = Math.max(Math.abs(gBlue.p0.y), Math.abs(gBlue.p1.y));
    }

    const depth = this.stadium.goalDepth || 36;
    this.localGoalNets = [
      new GoalNet({
        side: 'left',
        mouthX: leftXPost,
        backX: leftXPost - depth,
        depth,
        topY: -leftYPost,
        bottomY: leftYPost,
        nodeCount: 15
      }),
      new GoalNet({
        side: 'right',
        mouthX: rightXPost,
        backX: rightXPost + depth,
        depth,
        topY: -rightYPost,
        bottomY: rightYPost,
        nodeCount: 15
      })
    ];
  }

  public setGoalNets(nets: GoalNet[] | null): void {
    this.goalNets = nets;
  }

  public setExtrapolation(ms: number): void {
    this.extrapolationMs = Math.max(0, Math.min(250, ms));
    this.discRenderer.setExtrapolation(this.extrapolationMs);
  }

  public setChatHeight(height: number): void {
    if (height >= 0) {
      this.chatHeight = height;
    }
  }

  public getChatHeight(): number {
    return this.chatHeight;
  }

  public setChatWidth(width: number): void {
    if (width >= 0) {
      this.chatWidth = width;
    }
  }

  public getChatWidth(): number {
    return this.chatWidth;
  }

  public setChatBounds(width: number, height: number): void {
    this.setChatWidth(width);
    this.setChatHeight(height);
  }

  public setChatSafeArea(bottom: number): void {
    if (bottom >= 0) {
      this.safeAreaBottom = bottom;
    }
  }

  public getChatSafeArea(): number {
    return this.safeAreaBottom;
  }

  public getEffectiveSafeAreaBottom(
    minimapEnabledOverride?: boolean,
    minimapSizeOverride?: number
  ): number {
    if (!this._isMobileLayout) {
      return this._desktopSafeAreaBottom;
    }
    const isMinimapOn =
      minimapEnabledOverride !== undefined ? minimapEnabledOverride : this.minimapEnabled;
    const rawMargin = this.minimapRenderer.mobileBottomMargin;
    const margin =
      typeof rawMargin === 'number' && Number.isFinite(rawMargin) && rawMargin >= 0 ? rawMargin : 8;
    if (!isMinimapOn) {
      return Math.max(8, margin);
    }
    const targetSize =
      typeof minimapSizeOverride === 'number' &&
      Number.isFinite(minimapSizeOverride) &&
      minimapSizeOverride > 0
        ? minimapSizeOverride
        : this.minimapSize;
    if (targetSize > 0 && this.minimapRenderer.width !== targetSize) {
      this.minimapRenderer.setSize(targetSize);
    }
    return this.minimapRenderer.height + margin * 2;
  }

  public getMobileAutoZoom(viewportHeight?: number): number {
    if (!this._isMobileLayout) {
      return 1.0;
    }
    const dpr = this.getEffectiveDpr();
    const vHeight =
      viewportHeight !== undefined
        ? viewportHeight
        : this.canvas.height > 0
          ? this.canvas.height / dpr
          : this.camera.viewportHeight || 600;
    this.camera.isMobileLayout = true;
    return this.camera.getMobileAutoZoom(vHeight);
  }

  public setStadium(stadium: Stadium): void {
    this.stadium = stadium;
    this.camera.setBounds(stadium.halfWidth, stadium.halfHeight);
    this.stadiumRenderer.setStadium(stadium);
    this.discRenderer.setStadiumBounds({ ...stadium.bounds, runOff: stadium.runOff });
    this.minimapRenderer.setStadium(stadium);
    this.initLocalGoalNets();
    this.handleResize();
  }

  private getEffectiveDpr(): number {
    if (typeof this.overrideDpr === 'number' && Number.isFinite(this.overrideDpr) && this.overrideDpr > 0) {
      return this.overrideDpr;
    }
    return typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  }

  public setTheme(theme: 'dark' | 'light'): void {
    const nextTheme: 'dark' | 'light' = theme === 'light' ? 'light' : 'dark';
    this.theme = nextTheme;
    this.stadiumRenderer.theme = nextTheme;
    this.discRenderer.theme = nextTheme;
    this.stadiumRenderer.invalidateCache();
  }

  public setTeamKits(redKit?: any, blueKit?: any): void {
    if (redKit) {
      this.discRenderer.redKit = redKit;
    }
    if (blueKit) {
      this.discRenderer.blueKit = blueKit;
    }
    const redColor = redKit?.primaryColor || this.stadiumRenderer.redTeamColor;
    const blueColor = blueKit?.primaryColor || this.stadiumRenderer.blueTeamColor;
    this.stadiumRenderer.setTeamColors(redColor, blueColor);
  }

  private getEffectiveZoom(): number {
    if (this.camera.scale !== 1.0) return this.camera.scale;
    if (this.camera.zoom !== 1.0) return this.camera.zoom;
    return this.scale || 1.0;
  }

  private getOffscreenOptions(
    zoom: number,
    viewportWidth?: number,
    viewportHeight?: number,
    minimapActive: boolean = this.minimapEnabled,
    minimapSizeOverride?: number
  ): OffscreenDrawOptions {
    if (!this._isMobileLayout) {
      return {
        zoom,
        chatWidth: this.chatWidth,
        redColor: this.stadiumRenderer.redTeamColor,
        blueColor: this.stadiumRenderer.blueTeamColor
      };
    }

    const opts: OffscreenDrawOptions = {
      zoom,
      chatWidth: 0,
      redColor: this.stadiumRenderer.redTeamColor,
      blueColor: this.stadiumRenderer.blueTeamColor
    };

    const zones: ExclusionRect[] = [];
    for (let i = 0; i < this.mobileExclusionZones.length; i++) {
      const r = this.mobileExclusionZones[i];
      if (
        r &&
        Number.isFinite(r.x) &&
        Number.isFinite(r.y) &&
        Number.isFinite(r.width) &&
        Number.isFinite(r.height) &&
        r.width > 0 &&
        r.height > 0
      ) {
        zones.push(r);
      }
    }

    if (minimapActive && viewportWidth && viewportHeight && viewportWidth > 0 && viewportHeight > 0) {
      const targetSize =
        minimapSizeOverride !== undefined && minimapSizeOverride > 0 ? minimapSizeOverride : this.minimapSize;
      if (targetSize > 0) {
        this.minimapRenderer.setSize(targetSize);
      }
      const minimapRect = this.minimapRenderer.computeRect(viewportWidth, viewportHeight);
      if (minimapRect.width > 0 && minimapRect.height > 0) {
        zones.push(minimapRect);
      }
    }

    if (zones.length > 0) {
      opts.exclusionZones = zones;
    }

    return opts;
  }

  public resize(width?: number, height?: number): void {
    if (width !== undefined && height !== undefined && width > 0 && height > 0) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.handleResize();
  }

  public handleResize(): void {
    const dpr = this.getEffectiveDpr();
    const displayWidth =
      this.canvas.clientWidth || this.canvas.width || (typeof window !== 'undefined' ? window.innerWidth : 800);
    const displayHeight =
      this.canvas.clientHeight || this.canvas.height || (typeof window !== 'undefined' ? window.innerHeight : 600);

    if (this.canvas.clientWidth && this.canvas.clientHeight) {
      this.canvas.width = Math.round(displayWidth * dpr);
      this.canvas.height = Math.round(displayHeight * dpr);
    }

    const vWidth = this.canvas.width / dpr;
    const vHeight = this.canvas.height / dpr;
    const effectiveSafeBottom = this.getEffectiveSafeAreaBottom();
    const topHud = this._isMobileLayout ? (this.camera.topHudHeightPx || 0) : 0;

    this.offsetX = vWidth / 2;
    if (this._isMobileLayout) {
      const usableHeight = Math.max(100, vHeight - topHud - effectiveSafeBottom);
      this.offsetY = topHud + usableHeight / 2;
    } else {
      const usableHeight = vHeight - effectiveSafeBottom;
      this.offsetY = Math.max(usableHeight / 2, vHeight / 4);
    }

    this.camera.resize(vWidth, vHeight, this.stadium.width, this.stadium.height);
    if (this._isMobileLayout) {
      const autoZoom = this.getMobileAutoZoom(vHeight);
      this.camera.setZoom(autoZoom);
      this.scale = this.camera.zoom;
    } else {
      // Strict 1:1 scale invariance
      this.scale = 1.0;
    }
  }

  public triggerShake(intensity: number, durationMs: number = 220): void {
    if (!this.goalShakeEnabled || !this.screenShakeEnabled) {
      this.camera.resetShake();
      return;
    }
    this.camera.triggerShake(intensity, durationMs);
  }

  public triggerPostHitShake(): void {
    this.triggerShake(7, 220);
  }

  public clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const dpr = this.getEffectiveDpr();
    const fallbackW =
      this.canvas.clientWidth ||
      this.camera.viewportWidth ||
      (this.canvas.width ? this.canvas.width / dpr : 800);
    const fallbackH =
      this.canvas.clientHeight ||
      this.camera.viewportHeight ||
      (this.canvas.height ? this.canvas.height / dpr : 600);
    const rect =
      typeof this.canvas.getBoundingClientRect === 'function'
        ? this.canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: fallbackW, height: fallbackH };
    const cssW = rect.width > 0 ? rect.width : fallbackW;
    const cssH = rect.height > 0 ? rect.height : fallbackH;
    const viewW = this.camera.viewportWidth > 0 ? this.camera.viewportWidth : cssW;
    const viewH = this.camera.viewportHeight > 0 ? this.camera.viewportHeight : cssH;

    const screenX = (clientX - rect.left) * (viewW / cssW);
    const screenY = (clientY - rect.top) * (viewH / cssH);

    return this.camera.screenToWorld(screenX, screenY, this.safeAreaBottom);
  }

  public addFloatingScore(text: string, x: number, y: number, color?: string): void {
    let slot = this.floatingScores.find((f) => !f.active);
    if (!slot) {
      if (this.floatingScores.length < 32) {
        slot = { text, x, y, startY: y, life: 1.2, maxLife: 1.2, active: true, color };
        this.floatingScores.push(slot);
        return;
      }
      slot = this.floatingScores[0]!;
    }
    slot.text = text;
    slot.x = x;
    slot.y = y;
    slot.startY = y;
    slot.life = 1.2;
    slot.maxLife = 1.2;
    slot.active = true;
    slot.color = color;
  }

  public renderFloatingScores(ctx: CanvasRenderingContext2D, dt: number = 1 / 60): void {
    for (let i = 0; i < this.floatingScores.length; i++) {
      const ft = this.floatingScores[i]!;
      if (!ft.active) continue;

      ft.life -= dt;
      if (ft.life <= 0) {
        ft.active = false;
        continue;
      }

      if (this.vfx && this.vfx.floatingPointsEnabled === false) {
        continue;
      }

      const progress = 1 - ft.life / ft.maxLife;
      const eased = 1 - Math.pow(1 - progress, 2);
      const currentY = ft.startY - 18 - eased * 30;
      const alpha = Math.max(0, Math.min(1, ft.life / (ft.maxLife * 0.65)));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '800 13px "Space Grotesk", "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (typeof ctx.strokeText === 'function') {
        ctx.strokeStyle = 'rgba(5, 8, 17, 0.92)';
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeText(ft.text, ft.x, currentY);
      }

      ctx.fillStyle = ft.color || '#ffd700';
      if (typeof ctx.fillText === 'function') {
        ctx.fillText(ft.text, ft.x, currentY);
      }
      ctx.restore();
    }
  }

  /**
   * Dual-mode render:
   * - Single snapshot mode: render(snapshot: GameSnapshot, localDiscId?: number | null, settings?: Partial<MinimapSettings>)
   * - Lerp pair mode: render(prevSnapshot: GameStateSnapshot | null, currSnapshot: GameStateSnapshot | null, alpha?: number, localPlayerId?: number)
   */
  public render(
    prevOrSnapshot: GameStateSnapshot | GameSnapshot | null,
    currOrLocalId?: GameStateSnapshot | number | null,
    alphaOrSettings?: number | Partial<MinimapSettings>,
    localPlayerId?: number
  ): void {
    if (this.isDestroyed || !prevOrSnapshot) return;

    // Detect single-snapshot CanvasRenderer call signature
    if (currOrLocalId === undefined || currOrLocalId === null || typeof currOrLocalId === 'number') {
      const snap = prevOrSnapshot as GameSnapshot;
      const localId = typeof currOrLocalId === 'number' ? currOrLocalId : null;
      const settings = typeof alphaOrSettings === 'object' ? alphaOrSettings : undefined;
      this.renderSingleSnapshot(snap, localId, settings);
      return;
    }

    const prevSnapshot = prevOrSnapshot as GameStateSnapshot;
    const currSnapshot = currOrLocalId as GameStateSnapshot;
    const alpha = typeof alphaOrSettings === 'number' ? alphaOrSettings : 1.0;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this.lastRenderTimestamp > 0 ? Math.min(0.1, (now - this.lastRenderTimestamp) / 1000) : 1 / 60;
    this.lastRenderTimestamp = now;

    this.renderInterpolatedSnapshots(prevSnapshot, currSnapshot, alpha, localPlayerId, dt);
  }

  /**
   * Deterministic fixed-timestep render for offscreen replay & WebM export.
   * Steps camera/shake/VFX/nets strictly by `dtSec` without reading wall-clock time.
   */
  public renderAtFixedStep(
    s0: GameStateSnapshot | null,
    s1: GameStateSnapshot | null,
    alpha: number = 1.0,
    focusId?: number | null,
    dtSec: number = 1 / 60
  ): void {
    if (this.isDestroyed || (!s0 && !s1)) return;
    const prevSnapshot = (s0 ?? s1)!;
    const currSnapshot = (s1 ?? s0)!;
    const fixedDt = typeof dtSec === 'number' && Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 1 / 60;
    this.renderInterpolatedSnapshots(
      prevSnapshot,
      currSnapshot,
      alpha,
      focusId ?? undefined,
      fixedDt
    );
  }

  private renderInterpolatedSnapshots(
    prevSnapshot: GameStateSnapshot,
    currSnapshot: GameStateSnapshot,
    alpha: number,
    localPlayerId: number | undefined,
    dt: number
  ): void {
    this.stadiumRenderer.theme = this.theme;
    this.discRenderer.theme = this.theme;

    const s0 = prevSnapshot ?? currSnapshot;
    const s1 = currSnapshot ?? prevSnapshot;
    const clampedAlpha = Math.max(0, Math.min(1.0, alpha));
    const skipReplayBoundaryLerp =
      s0.phase !== s1.phase &&
      (s1.phase === MatchPhase.GOAL_REPLAY || s0.phase === MatchPhase.GOAL_REPLAY);
    const effectiveAlpha = skipReplayBoundaryLerp ? 1 : clampedAlpha;

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

    while (this.scratchDiscSnapshots.length < s1.discs.length) {
      this.scratchDiscSnapshots.push({
        id: 0,
        team: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 15,
        kicking: false,
        avatar: ''
      });
    }
    this.scratchDiscSnapshots.length = s1.discs.length;

    for (let i = 0; i < s1.discs.length; i++) {
      const d1 = s1.discs[i]!;
      let d0: CompactDiscState = d1;
      for (let j = 0; j < s0.discs.length; j++) {
        if (s0.discs[j]!.id === d1.id) {
          d0 = s0.discs[j]!;
          break;
        }
      }

      const ix = lerp(d0.x, d1.x, effectiveAlpha);
      const iy = lerp(d0.y, d1.y, effectiveAlpha);
      const ivx = lerp(d0.vx, d1.vx, effectiveAlpha);
      const ivy = lerp(d0.vy, d1.vy, effectiveAlpha);

      const isLocal = localPlayerId !== undefined && d1.id === localPlayerId;
      const flags = d1.flags ?? 0;

      if (d1.team === 0) {
        ballX = ix;
        ballY = iy;
        ballVx = ivx;
        ballVy = ivy;
        ballFlags = flags;
        ballSpin = d1.spin ?? 0;
        hasBall = true;
      } else if (isLocal) {
        localPlayerX = ix;
        localPlayerY = iy;
        hasLocalPlayer = true;
      }

      const info = this.playerInfos.get(d1.id);
      const snapDisc = this.scratchDiscSnapshots[i]!;
      snapDisc.id = d1.id;
      snapDisc.team = (d1.team === 1 || d1.team === 2 ? d1.team : 0) as 0 | 1 | 2;
      snapDisc.x = ix;
      snapDisc.y = iy;
      snapDisc.vx = ivx;
      snapDisc.vy = ivy;
      snapDisc.radius = d1.team === 0 ? this.discRenderer.ballRadius : this.discRenderer.playerRadius;
      snapDisc.avatar = d1.team === 0 ? '' : (info?.avatar || String(info?.number ?? d1.id));
      snapDisc.kicking = (flags & 1) !== 0;
      snapDisc.isDashing = (flags & 2) !== 0;
      snapDisc.isSpinActive = d1.team === 0 && Math.abs(d1.spin ?? 0) > 0.001;
      snapDisc.isPowerShot = d1.team === 0 && (flags & 8) !== 0;
      snapDisc.isTurbo = (flags & 16) !== 0;
      snapDisc.isTyping = (flags & 32) !== 0;
      snapDisc.stamina = d1.stamina ?? 100;
      snapDisc.spin = d1.spin ?? 0;
    }

    // Hold-to-focus ball override or dual-target camera with 180px leash
    if (this.focusBallOnly && hasBall) {
      this.camera.follow(ballX, ballY);
    } else if (hasLocalPlayer && hasBall) {
      this.camera.followDual(localPlayerX, localPlayerY, ballX, ballY, 0.25, 180);
    } else if (hasLocalPlayer) {
      this.camera.follow(localPlayerX, localPlayerY);
    } else if (hasBall) {
      this.camera.follow(ballX, ballY);
    }

    const dpr = this.getEffectiveDpr();
    const vWidth = (this.canvas.width || 800) / dpr;
    const vHeight = (this.canvas.height || 600) / dpr;

    const wExt = this.stadium.width + (this.stadium.goalDepth + this.stadium.runOff) * 2;
    const hExt = this.stadium.height + this.stadium.runOff * 2;
    const effectiveSafeBottom = this.getEffectiveSafeAreaBottom();
    this.camera.clamp(wExt, hExt, vWidth, vHeight, effectiveSafeBottom);

    const isFrozenPhase =
      s1.phase === MatchPhase.PAUSE ||
      s1.phase === MatchPhase.RESUME_COUNTDOWN ||
      s1.phase === MatchPhase.PRE_MATCH_VS ||
      s1.phase === MatchPhase.START_COUNTDOWN ||
      s1.phase === MatchPhase.STOP ||
      s1.phase === MatchPhase.STATS;
    this.discRenderer.isPaused = isFrozenPhase;

    if (this.screenShakeEnabled && this.goalShakeEnabled) {
      this.camera.updateShake(dt);
    } else {
      this.camera.resetShake();
    }

    if (s1.soundMask !== this.lastProcessedSoundMask) {
      if ((s1.soundMask & SOUND_POST_HIT) !== 0) {
        this.vfx.emitPostSparks(ballX, ballY, 12);
      }
      this.lastProcessedSoundMask = s1.soundMask;
    }

    const enteredGoalReplay = s1.phase === MatchPhase.GOAL_REPLAY && this.lastPhase !== MatchPhase.GOAL_REPLAY;
    const replayBallTeleported =
      s1.phase === MatchPhase.GOAL_REPLAY &&
      hasBall &&
      this.prevReplayBallX !== null &&
      this.prevReplayBallY !== null &&
      Math.hypot(ballX - this.prevReplayBallX, ballY - this.prevReplayBallY) > 120;
    const replayRestarted =
      s1.phase === MatchPhase.GOAL_REPLAY &&
      ((this.lastReplayTick >= 0 && s1.tick < this.lastReplayTick) || replayBallTeleported);

    if (enteredGoalReplay || replayRestarted) {
      for (let i = 0; i < this.localGoalNets.length; i++) {
        this.localGoalNets[i]!.reset();
      }
      this.prevReplayBallX = hasBall ? ballX : null;
      this.prevReplayBallY = hasBall ? ballY : null;
    }

    if (s1.phase !== MatchPhase.GOAL_REPLAY) {
      this.lastReplayTick = -1;
      this.prevReplayBallX = null;
      this.prevReplayBallY = null;
    }

    this.lastPhase = s1.phase;

    if (!this.goalNets && hasBall && this.netDeformationEnabled && !isFrozenPhase) {
      let netBallVx = ballVx;
      let netBallVy = ballVy;
      if (
        s1.phase === MatchPhase.GOAL_REPLAY &&
        Math.hypot(netBallVx, netBallVy) < 1e-3 &&
        this.prevReplayBallX !== null &&
        this.prevReplayBallY !== null &&
        dt > 1e-5
      ) {
        netBallVx = (ballX - this.prevReplayBallX) / dt;
        netBallVy = (ballY - this.prevReplayBallY) / dt;
      }

      this.scratchBall.pos.x = ballX;
      this.scratchBall.pos.y = ballY;
      this.scratchBall.vel.x = netBallVx;
      this.scratchBall.vel.y = netBallVy;
      this.scratchBall.radius = this.discRenderer.ballRadius;
      for (let i = 0; i < this.localGoalNets.length; i++) {
        this.localGoalNets[i]!.step(dt);
        this.localGoalNets[i]!.checkBallCollision(this.scratchBall);
      }
    }

    if (s1.phase === MatchPhase.GOAL_REPLAY) {
      this.lastReplayTick = s1.tick;
      if (hasBall) {
        this.prevReplayBallX = ballX;
        this.prevReplayBallY = ballY;
      }
    }

    this.vfx.update(dt);

    const ctx = this.ctx;
    ctx.save();
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else if (dpr !== 1 && typeof ctx.scale === 'function') {
      ctx.scale(dpr, dpr);
    }

    ctx.fillStyle = this.theme === 'dark' ? '#050811' : '#E0F2FE';
    ctx.fillRect(0, 0, vWidth, vHeight);

    const topHud = this._isMobileLayout ? (this.camera.topHudHeightPx || 0) : 0;
    const usableHeight = Math.max(100, vHeight - topHud - effectiveSafeBottom);
    const cx = vWidth / 2;
    const cy = topHud + usableHeight / 2;
    const effectiveZoom = this.getEffectiveZoom();

    ctx.save();
    ctx.translate(cx + this.camera.shakeOffsetX, cy + this.camera.shakeOffsetY);
    ctx.scale(effectiveZoom, effectiveZoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Pitch
    this.stadiumRenderer.renderPitch(ctx, this.stadium);

    // 2. GoalNets
    const activeNets = this.goalNets ?? this.localGoalNets;
    for (let i = 0; i < activeNets.length; i++) {
      activeNets[i]!.render(ctx);
    }

    // 3-6. Trails, Stamina Rings, Players, Ball
    this.discRenderer.playerInfos = this.playerInfos;
    this.discRenderer.render(ctx, this.scratchDiscSnapshots, localPlayerId);

    // 7. Posts
    this.stadiumRenderer.renderPosts(ctx, this.stadium);

    // 8. VFX & Floating scores
    this.vfx.render(ctx);
    this.renderFloatingScores(ctx, dt);

    ctx.restore();

    // 9. Off-Screen Indicators
    if (this.offscreenIndicatorsEnabled && this.scratchDiscSnapshots.length > 0) {
      this.offscreenRenderer.draw(
        ctx,
        this.scratchDiscSnapshots,
        localPlayerId,
        this.camera.x,
        this.camera.y,
        cx,
        cy,
        vWidth,
        vHeight,
        this._isMobileLayout ? 0 : this.chatHeight,
        this.getOffscreenOptions(effectiveZoom, vWidth, vHeight, this.minimapEnabled, this.minimapSize)
      );
    }

    // 10. Minimap Radar
    this.minimapRenderer.enabled = this.minimapEnabled;
    if (this.minimapEnabled) {
      this.minimapRenderer.render(
        ctx,
        s1,
        this.camera,
        localPlayerId,
        {
          minimapEnabled: this.minimapEnabled,
          minimapOpacity: this.minimapOpacity,
          minimapSize: this.minimapSize,
          minimapCameraFrustum: this.minimapCameraFrustum,
          viewportCenterX: cx,
          viewportCenterY: cy
        },
        vWidth,
        vHeight
      );
    }

    ctx.restore();
  }

  private renderSingleSnapshot(
    snapshot: GameSnapshot,
    localDiscId?: number | null,
    settings?: Partial<MinimapSettings>
  ): void {
    this.stadiumRenderer.theme = this.theme;
    this.discRenderer.theme = this.theme;
    const dpr = this.getEffectiveDpr();
    const ctx = this.ctx;

    const ball = snapshot.discs?.find((d) => d.team === 0);
    const localPlayer =
      localDiscId !== null && localDiscId !== undefined ? snapshot.discs?.find((d) => d.id === localDiscId) : null;

    if (this.focusBallOnly && ball) {
      this.camera.follow(ball.x, ball.y);
    } else if (localPlayer && ball) {
      this.camera.followDual(localPlayer.x, localPlayer.y, ball.x, ball.y, 0.25, 180);
    } else {
      const target = localPlayer ?? ball;
      if (target) {
        this.camera.follow(target.x, target.y);
      }
    }

    const effectiveMinimapEnabled =
      settings?.minimapEnabled !== undefined ? settings.minimapEnabled : this.minimapEnabled;
    if (
      this._isMobileLayout &&
      effectiveMinimapEnabled !== false &&
      settings?.minimapSize !== undefined &&
      settings.minimapSize > 0
    ) {
      this.minimapRenderer.setSize(settings.minimapSize);
    }

    const vWidth = (this.canvas.width || 800) / dpr;
    const vHeight = (this.canvas.height || 600) / dpr;
    const effectiveSafeBottom = this.getEffectiveSafeAreaBottom(
      effectiveMinimapEnabled !== false,
      settings?.minimapSize
    );
    const topHud = this._isMobileLayout ? (this.camera.topHudHeightPx || 0) : 0;
    const usableHeight = Math.max(100, vHeight - topHud - effectiveSafeBottom);
    this.offsetX = vWidth / 2;
    this.offsetY = topHud + usableHeight / 2;

    const wExt = this.stadium.width + (this.stadium.goalDepth + this.stadium.runOff) * 2;
    const hExt = this.stadium.height + this.stadium.runOff * 2;
    this.camera.clamp(wExt, hExt, vWidth, vHeight, effectiveSafeBottom);

    const currentPhaseSingle: GameMatchPhase =
      snapshot.matchPhase !== undefined ? snapshot.matchPhase : toMatchPhase(snapshot.matchState);
    this.discRenderer.isPaused =
      currentPhaseSingle === GameMatchPhase.PAUSED ||
      currentPhaseSingle === GameMatchPhase.COUNTDOWN ||
      currentPhaseSingle === GameMatchPhase.STOPPED;

    if (this.screenShakeEnabled && this.goalShakeEnabled) {
      this.camera.updateShake(1 / 60);
    } else {
      this.camera.resetShake();
    }

    ctx.save();
    ctx.fillStyle = this.theme === 'dark' ? '#050811' : '#E0F2FE';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.scale(dpr, dpr);
    ctx.translate(
      this.offsetX + this.cameraOffset.x + this.camera.shakeOffsetX,
      this.offsetY + this.cameraOffset.y + this.camera.shakeOffsetY
    );
    const effectiveZoom = this.getEffectiveZoom();
    ctx.scale(effectiveZoom, effectiveZoom);

    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    this.stadiumRenderer.renderPitch(ctx, this.stadium);

    const activeNets = this.goalNets ?? this.localGoalNets;
    if (!this.goalNets && ball && this.netDeformationEnabled) {
      this.scratchBall.pos.x = ball.x;
      this.scratchBall.pos.y = ball.y;
      this.scratchBall.vel.x = ball.vx || 0;
      this.scratchBall.vel.y = ball.vy || 0;
      this.scratchBall.radius = ball.radius || 5.8;
      for (let i = 0; i < this.localGoalNets.length; i++) {
        this.localGoalNets[i]!.step(1 / 60);
        this.localGoalNets[i]!.checkBallCollision(this.scratchBall);
      }
    }
    for (let i = 0; i < activeNets.length; i++) {
      activeNets[i]!.render(ctx);
    }

    if (snapshot.discs) {
      this.discRenderer.draw(ctx, snapshot.discs, localDiscId);
    }
    this.stadiumRenderer.renderPosts(ctx, this.stadium);
    this.renderFloatingScores(ctx, 1 / 60);
    ctx.restore();

    this.drawOverlays(ctx, snapshot);
    ctx.restore();

    if (this.offscreenIndicatorsEnabled && snapshot.discs && snapshot.discs.length > 0) {
      ctx.save();
      ctx.scale(dpr, dpr);
      this.offscreenRenderer.draw(
        ctx,
        snapshot.discs,
        localDiscId,
        this.camera.x,
        this.camera.y,
        this.offsetX + this.cameraOffset.x,
        this.offsetY + this.cameraOffset.y,
        vWidth,
        vHeight,
        this._isMobileLayout ? 0 : this.chatHeight,
        this.getOffscreenOptions(
          effectiveZoom,
          vWidth,
          vHeight,
          effectiveMinimapEnabled !== false,
          settings?.minimapSize
        )
      );
      ctx.restore();
    }

    this.minimapRenderer.enabled = effectiveMinimapEnabled !== false;
    if (effectiveMinimapEnabled !== false) {
      ctx.save();
      ctx.scale(dpr, dpr);
      this.minimapRenderer.render(
        ctx,
        snapshot,
        this.camera,
        localDiscId,
        {
          minimapEnabled: effectiveMinimapEnabled,
          minimapOpacity: settings?.minimapOpacity ?? this.minimapOpacity,
          minimapSize: settings?.minimapSize ?? this.minimapSize,
          minimapCameraFrustum: settings?.minimapCameraFrustum ?? this.minimapCameraFrustum,
          viewportCenterX: this.offsetX + this.cameraOffset.x,
          viewportCenterY: this.offsetY + this.cameraOffset.y
        },
        vWidth,
        vHeight
      );
      ctx.restore();
    }
  }

  public drawOverlays(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
    const currentPhase: GameMatchPhase =
      snapshot.matchPhase !== undefined ? snapshot.matchPhase : toMatchPhase(snapshot.matchState);
    if (
      currentPhase === GameMatchPhase.PLAYING ||
      currentPhase === GameMatchPhase.STOPPED ||
      typeof ctx.fillText !== 'function'
    ) {
      return;
    }

    const subStateTimer = snapshot.subStateTimer ?? snapshot.countdownSeconds ?? 0;
    const targetTeam = snapshot.targetTeam ?? 0;
    const targetTeamColor = targetTeam === 1 ? '#FF0055' : targetTeam === 2 ? '#00E5FF' : '#00E599';
    const winningTeam = targetTeam === 1 ? 'EQUIPO ROJO' : targetTeam === 2 ? 'EQUIPO AZUL' : '';
    const winningTeamColor = targetTeam === 1 ? '#FF0055' : targetTeam === 2 ? '#00E5FF' : '#00E599';

    ctx.save();

    switch (currentPhase) {
      case GameMatchPhase.GOAL_CELEBRATION: {
        const lastGoal = snapshot.lastGoal;
        let title: string;
        let subText: string | undefined;

        if (lastGoal) {
          const scorer = lastGoal.scorerName || 'Jugador';
          const assisterText = lastGoal.assisterName
            ? `Asistencia: ${lastGoal.assisterName}`
            : 'Sin asistencia';
          title = `¡GOL DE ${scorer.toUpperCase()}!`;
          subText = `(${assisterText})`;
        } else {
          const teamSuffix =
            targetTeam === 1 ? ' - EQUIPO ROJO' : targetTeam === 2 ? ' - EQUIPO AZUL' : '';
          title = `¡GOL!${teamSuffix}`;
        }

        this.drawCenterBanner(ctx, title, targetTeamColor, subText);
        break;
      }
      case GameMatchPhase.COUNTDOWN:
        this.drawCountdownNumber(ctx, Math.ceil(subStateTimer));
        break;
      case GameMatchPhase.PAUSED:
        this.drawPauseOverlay(ctx);
        break;
      case GameMatchPhase.VICTORY_CELEBRATION:
      case GameMatchPhase.MATCH_ENDED: {
        let title = winningTeam ? `¡VICTORIA ${winningTeam}!` : '¡EMPATE!';
        let bannerColor = winningTeamColor;
        let subText: string | undefined = undefined;

        if (snapshot.isGoldenGoal && winningTeam) {
          title = `¡GOL DE ORO! - VICTORIA ${winningTeam}`;
          bannerColor = '#FFB800';
          subText = 'PRÓRROGA CONCLUIDA POR GOL SÚBITO';
        }

        this.drawCenterBanner(ctx, title, bannerColor, subText);
        break;
      }
      default:
        break;
    }

    ctx.restore();
  }

  public renderOverlayState(ctx: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
    this.drawOverlays(ctx, snapshot);
  }

  public drawCenterBanner(
    ctxOrText: CanvasRenderingContext2D | string,
    textOrColor?: string,
    colorOrSubtext?: string,
    subtext?: string
  ): void {
    let ctx: CanvasRenderingContext2D;
    let text: string;
    let color: string = '#00E599';
    let sub: string | undefined;

    if (typeof ctxOrText === 'string') {
      ctx = this.ctx;
      text = ctxOrText;
      if (textOrColor) color = textOrColor;
      if (colorOrSubtext) sub = colorOrSubtext;
    } else {
      ctx = ctxOrText;
      text = textOrColor || '';
      if (colorOrSubtext) color = colorOrSubtext;
      sub = subtext;
    }

    this.drawBannerBox(ctx, text, sub, color);
  }

  public drawCountdownNumber(ctxOrCount: CanvasRenderingContext2D | number, countNum?: number): void {
    const ctx = typeof ctxOrCount === 'number' ? this.ctx : ctxOrCount;
    const count = typeof ctxOrCount === 'number' ? ctxOrCount : (countNum ?? 0);
    const text = count > 0 ? count.toString() : '¡PLAY!';
    this.drawBigText(ctx, text, '#00E599');
  }

  private drawBigText(ctx: CanvasRenderingContext2D, text: string, color: string): void {
    ctx.save();
    ctx.font = '900 70px "Zen Dots", "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = color;
    ctx.shadowBlur = 18;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(text, 0, -20 + 4);

    if (typeof ctx.strokeText === 'function') {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeText(text, 0, -20);
    }

    ctx.fillStyle = color;
    ctx.fillText(text, 0, -20);
    ctx.restore();
  }

  private drawBannerBox(
    ctx: CanvasRenderingContext2D,
    text: string,
    subtext?: string,
    color: string = '#00E599'
  ): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '900 38px "Zen Dots", "Inter", sans-serif';
    const textMetrics = typeof ctx.measureText === 'function' ? ctx.measureText(text) : { width: 200 };
    let bannerWidth = Math.max(textMetrics.width + 64, 280);

    if (subtext) {
      ctx.font = '600 16px "Inter", sans-serif';
      const subMetrics = typeof ctx.measureText === 'function' ? ctx.measureText(subtext) : { width: 150 };
      bannerWidth = Math.max(bannerWidth, subMetrics.width + 48);
    }

    const bannerHeight = subtext ? 96 : 72;
    const yOffset = -20;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(-bannerWidth / 2, yOffset - bannerHeight / 2, bannerWidth, bannerHeight, 16);
    } else if (typeof ctx.rect === 'function') {
      ctx.rect(-bannerWidth / 2, yOffset - bannerHeight / 2, bannerWidth, bannerHeight);
    }
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = '900 38px "Zen Dots", "Inter", sans-serif';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    const titleY = subtext ? yOffset - 14 : yOffset;
    ctx.fillText(text, 0, titleY);

    if (subtext) {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.font = '600 15px "Inter", sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(subtext, 0, yOffset + 22);
    }

    ctx.restore();
  }

  private drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    const width = (this.stadium.halfWidth + this.stadium.goalDepth + 30) * 2;
    const height = (this.stadium.halfHeight + 30) * 2;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fillRect(-width / 2, -height / 2, width, height);

    const title = 'PARTIDO PAUSADO';
    const subtitle = 'Presiona P o usa el menú de administrador para reanudar';

    ctx.font = '900 36px "Zen Dots", "Inter", sans-serif';
    const titleMetrics = typeof ctx.measureText === 'function' ? ctx.measureText(title) : { width: 240 };

    ctx.font = '600 15px "Zen Dots", "Inter", sans-serif';
    const subMetrics = typeof ctx.measureText === 'function' ? ctx.measureText(subtitle) : { width: 320 };

    const cardWidth = Math.max(titleMetrics.width, subMetrics.width) + 64;
    const cardHeight = 112;
    const yOffset = -15;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(-cardWidth / 2, yOffset - cardHeight / 2, cardWidth, cardHeight, 18);
    } else if (typeof ctx.rect === 'function') {
      ctx.rect(-cardWidth / 2, yOffset - cardHeight / 2, cardWidth, cardHeight);
    }
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 36px "Zen Dots", "Inter", sans-serif';
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(title, 0, yOffset - 18);

    ctx.font = '600 15px "Zen Dots", "Inter", sans-serif';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(subtitle, 0, yOffset + 24);

    ctx.restore();
  }

  private resolveGeometricNonPenetration(_discs: DiscSnapshot[]): void {
    // No-op: zero physical/geometric mutation allowed in the renderer
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.vfx.clear();
  }
}

export { GameRenderer as CanvasRenderer };
export { triggerPitchEmote, clearPitchEmotes, activePitchEmotes } from './DiscRenderer';
