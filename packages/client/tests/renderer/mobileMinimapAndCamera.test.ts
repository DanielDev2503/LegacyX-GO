import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Stadium } from '@legacyx/core';
import { MinimapRenderer } from '../../src/renderer/MinimapRenderer';
import { Camera } from '../../src/renderer/Camera';
import { GameRenderer } from '../../src/renderer/GameRenderer';
import { OffscreenIndicatorRenderer, type ExclusionRect } from '../../src/renderer/OffscreenIndicatorRenderer';

function createCtx() {
  const translates: Array<[number, number]> = [];
  const noop = () => {};
  const ctx: any = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save: noop,
    restore: noop,
    setTransform: noop,
    scale: noop,
    rotate: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    rect: noop,
    roundRect: noop,
    clip: noop,
    setLineDash: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    drawImage: noop,
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    translate: (x: number, y: number) => {
      translates.push([x, y]);
    }
  };
  return { ctx, translates };
}

const insideRect = (x: number, y: number, r: ExclusionRect, pad = 0) =>
  x > r.x - pad && x < r.x + r.width + pad && y > r.y - pad && y < r.y + r.height + pad;

const originalDocument = (globalThis as any).document;
const originalWindow = (globalThis as any).window;

function installDom(dpr = 1) {
  (globalThis as any).window = { devicePixelRatio: dpr, innerWidth: 1280, innerHeight: 720 };
  (globalThis as any).document = {
    createElement: vi.fn(() => ({ width: 0, height: 0, style: {}, getContext: () => createCtx().ctx }))
  };
}

function createRenderer(w: number, h: number) {
  const canvas: any = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    getContext: () => createCtx().ctx
  };
  const renderer = new GameRenderer(canvas, { stadium: new Stadium() });
  return { renderer, canvas };
}

function resizeTo(renderer: GameRenderer, canvas: any, w: number, h: number) {
  canvas.clientWidth = w;
  canvas.clientHeight = h;
  renderer.handleResize();
}

describe('Fase 2/5: MinimapRenderer mobile positioning & hitTest', () => {
  beforeEach(() => installDom());
  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it('centers horizontally at the bottom when positionMode is bottom-center', () => {
    const minimap = new MinimapRenderer(new Stadium(), { minimapSize: 160 });
    minimap.positionMode = 'bottom-center';
    const screenW = 844;
    const screenH = 390;
    const rect = minimap.computeRect(screenW, screenH);
    expect(rect.x).toBe(Math.round((screenW - minimap.width) / 2));
    expect(rect.y).toBe(Math.round(screenH - minimap.height - minimap.mobileBottomMargin));
    // Symmetric margins left/right
    expect(Math.abs(rect.x - (screenW - rect.x - rect.width))).toBeLessThanOrEqual(1);
  });

  it('stays bottom-right on desktop', () => {
    const minimap = new MinimapRenderer(new Stadium(), { minimapSize: 200 });
    expect(minimap.positionMode).toBe('bottom-right');
    const rect = minimap.computeRect(1280, 720);
    expect(rect.x).toBe(1280 - minimap.width - MinimapRenderer.DEFAULT_MARGIN);
    expect(rect.y).toBe(720 - minimap.height - MinimapRenderer.DEFAULT_MARGIN);
  });

  it('render() writes bottom-center x/y and hitTest matches the drawn bounds', () => {
    const minimap = new MinimapRenderer(new Stadium(), {
      minimapSize: 160,
      minimapPositionMode: 'bottom-center'
    });
    const { ctx } = createCtx();
    minimap.render(ctx, { discs: [] } as any, new Camera(0, 0), null, undefined, 844, 390);

    const { x, y, width, height } = minimap.getRect();
    expect(x).toBe(Math.round((844 - width) / 2));

    expect(minimap.hitTest(x + width / 2, y + height / 2)).toBe(true);
    expect(minimap.hitTest(x, y)).toBe(true);
    expect(minimap.hitTest(x + width, y + height)).toBe(true);

    expect(minimap.hitTest(x - 1, y + height / 2)).toBe(false);
    expect(minimap.hitTest(x + width + 1, y + height / 2)).toBe(false);
    expect(minimap.hitTest(x + width / 2, y - 1)).toBe(false);
    expect(minimap.hitTest(x + width / 2, y + height + 1)).toBe(false);
    expect(minimap.hitTest(NaN, y)).toBe(false);

    minimap.enabled = false;
    expect(minimap.hitTest(x + width / 2, y + height / 2)).toBe(false);
  });
});

describe('Fase 2/5: Camera & GameRenderer mobile zoom and safe area', () => {
  beforeEach(() => installDom());
  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it('Camera.getMobileAutoZoom scales with landscape height only in mobile layout', () => {
    const camera = new Camera(0, 0);
    expect(camera.getMobileAutoZoom(390)).toBe(1.0);

    camera.isMobileLayout = true;
    const z360 = camera.getMobileAutoZoom(360);
    const z390 = camera.getMobileAutoZoom(390);
    const z430 = camera.getMobileAutoZoom(430);
    expect(z360).toBeCloseTo(360 / Camera.MOBILE_REFERENCE_HEIGHT, 6);
    expect(z430).toBeCloseTo(430 / Camera.MOBILE_REFERENCE_HEIGHT, 6);
    expect(z360).toBeLessThan(z390);
    expect(z390).toBeLessThan(z430);
    expect(z430).toBeLessThan(1);
    expect(z360).toBeGreaterThanOrEqual(camera.minScale);
    // Large heights never zoom in beyond 1:1
    expect(camera.getMobileAutoZoom(1080)).toBe(1.0);
    expect(camera.getMobileAutoZoom(0)).toBe(1.0);
  });

  it('desktop GameRenderer keeps strict 1:1 scale, 160px safe area and bottom-right minimap', () => {
    const { renderer } = createRenderer(1280, 720);
    expect(renderer.isMobileLayout).toBe(false);
    expect(renderer.scale).toBe(1.0);
    expect(renderer.camera.zoom).toBe(1.0);
    expect(renderer.safeAreaBottom).toBe(160);
    expect(renderer.minimapRenderer.positionMode).toBe('bottom-right');
  });

  it('mobile layout auto-zooms for 360-430px landscape heights', () => {
    const { renderer, canvas } = createRenderer(844, 390);
    renderer.isMobileLayout = true;
    expect(renderer.camera.isMobileLayout).toBe(true);
    expect(renderer.minimapRenderer.positionMode).toBe('bottom-center');

    for (const h of [360, 390, 430]) {
      resizeTo(renderer, canvas, 844, h);
      const expected = h / Camera.MOBILE_REFERENCE_HEIGHT;
      expect(renderer.camera.zoom).toBeCloseTo(expected, 6);
      expect(renderer.scale).toBeCloseTo(expected, 6);
      expect(renderer.scale).toBeLessThan(1);
    }

    // Tablet / desktop-height viewport in mobile mode clamps to 1:1
    resizeTo(renderer, canvas, 1280, 900);
    expect(renderer.scale).toBe(1.0);
  });

  it('mobile safe area shrinks to the minimap band and centers pitch between Top-Bar and Minimap', () => {
    const { renderer } = createRenderer(844, 390);
    renderer.minimapSize = 160;
    renderer.isMobileLayout = true;

    const margin = renderer.minimapRenderer.mobileBottomMargin;
    const safe = renderer.safeAreaBottom;
    expect(renderer.minimapRenderer.width).toBe(160);
    expect(safe).toBe(renderer.minimapRenderer.height + margin * 2);
    expect(safe).toBeLessThan(160);

    const topHud = renderer.camera.topHudHeightPx;
    const minimapRect = renderer.minimapRenderer.computeRect(844, 390);
    const pitchBandTop = topHud;
    const pitchBandBottom = minimapRect.y - margin;
    expect(pitchBandBottom).toBeCloseTo(390 - safe, 6);
    expect(renderer.offsetX).toBe(422);
    expect(renderer.offsetY).toBeCloseTo((pitchBandTop + pitchBandBottom) / 2, 6);
  });

  it('minimap disabled on mobile collapses the bottom safe area to the margin', () => {
    const { renderer } = createRenderer(844, 390);
    renderer.minimapEnabled = false;
    renderer.isMobileLayout = true;
    expect(renderer.safeAreaBottom).toBe(Math.max(8, renderer.minimapRenderer.mobileBottomMargin));
  });

  it('switching back to desktop restores 1:1 zoom, configured safe area and bottom-right minimap', () => {
    const { renderer } = createRenderer(844, 390);
    renderer.safeAreaBottom = 140;
    renderer.isMobileLayout = true;
    expect(renderer.safeAreaBottom).not.toBe(140);

    renderer.isMobileLayout = false;
    expect(renderer.scale).toBe(1.0);
    expect(renderer.camera.zoom).toBe(1.0);
    expect(renderer.safeAreaBottom).toBe(140);
    expect(renderer.minimapRenderer.positionMode).toBe('bottom-right');
  });

  it('mobile offscreen options exclude HUD zones + minimap and drop the desktop chat slab', () => {
    const { renderer } = createRenderer(844, 390);
    renderer.minimapSize = 160;
    renderer.isMobileLayout = true;
    const joystick = { x: 12, y: 228, width: 150, height: 150 };
    const cluster = { x: 612, y: 188, width: 220, height: 190 };
    renderer.mobileExclusionZones = [joystick, cluster, { x: NaN, y: 0, width: 10, height: 10 }];

    const opts = (renderer as any).getOffscreenOptions(1, 844, 390, true, 160);
    expect(opts.chatWidth).toBe(0);
    expect(opts.exclusionZones).toHaveLength(3);
    expect(opts.exclusionZones).toContainEqual(joystick);
    expect(opts.exclusionZones).toContainEqual(cluster);
    expect(opts.exclusionZones).toContainEqual(renderer.minimapRenderer.computeRect(844, 390));

    renderer.isMobileLayout = false;
    const desktopOpts = (renderer as any).getOffscreenOptions(1, 1280, 720, true, 200);
    expect(desktopOpts.exclusionZones).toBeUndefined();
    expect(desktopOpts.chatWidth).toBe(renderer.chatWidth);
  });
});

describe('Fase 2/5: OffscreenIndicatorRenderer mobile HUD exclusion', () => {
  beforeEach(() => installDom());
  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  const W = 844;
  const H = 390;
  const CX = W / 2;
  const CY = 180;
  const PAD = OffscreenIndicatorRenderer.EXCLUSION_PADDING;

  function mobileZones() {
    const minimap = new MinimapRenderer(new Stadium(), { minimapSize: 160, minimapPositionMode: 'bottom-center' });
    const joystick: ExclusionRect = { x: 12, y: H - 12 - 150, width: 150, height: 150 };
    const minimapRect: ExclusionRect = minimap.computeRect(W, H);
    const cluster: ExclusionRect = { x: W - 12 - 220, y: H - 12 - 190, width: 220, height: 190 };
    return { joystick, minimapRect, cluster, all: [joystick, minimapRect, cluster] };
  }

  function drawOne(disc: { x: number; y: number; team?: number }, zones?: ExclusionRect[]) {
    const { ctx, translates } = createCtx();
    new OffscreenIndicatorRenderer().draw(
      ctx,
      [{ id: 7, team: disc.team ?? 1, x: disc.x, y: disc.y, radius: 15 } as any],
      null,
      0,
      0,
      CX,
      CY,
      W,
      H,
      0,
      { zoom: 1, chatWidth: 0, exclusionZones: zones }
    );
    return translates;
  }

  it('bottom-left offscreen arrow is pushed out of the Joystick zone', () => {
    const { joystick, all } = mobileZones();
    const disc = { x: -1000, y: 600 };

    const [naive] = drawOne(disc);
    expect(naive).toBeDefined();
    expect(insideRect(naive![0], naive![1], joystick)).toBe(true);

    const placed = drawOne(disc, all);
    expect(placed).toHaveLength(1);
    const [px, py] = placed[0]!;
    for (const z of all) expect(insideRect(px, py, z, PAD)).toBe(false);
  });

  it('bottom-right offscreen arrow is pushed out of the Action Cluster zone', () => {
    const { cluster, all } = mobileZones();
    const disc = { x: 1000, y: 600, team: 2 };

    const [naive] = drawOne(disc);
    expect(insideRect(naive![0], naive![1], cluster)).toBe(true);

    const placed = drawOne(disc, all);
    expect(placed).toHaveLength(1);
    const [px, py] = placed[0]!;
    for (const z of all) expect(insideRect(px, py, z, PAD)).toBe(false);
  });

  it('on-screen disc hidden under the bottom-center Minimap gets an indicator outside the Minimap', () => {
    const { minimapRect, all } = mobileZones();
    const sx = minimapRect.x + minimapRect.width / 2;
    const sy = minimapRect.y + minimapRect.height / 2;
    const disc = { x: sx - CX, y: sy - CY, team: 0 };

    // Without exclusions the disc is visible -> no indicator
    expect(drawOne(disc)).toHaveLength(0);

    const placed = drawOne(disc, all);
    expect(placed).toHaveLength(1);
    const [px, py] = placed[0]!;
    for (const z of all) expect(insideRect(px, py, z, PAD)).toBe(false);
    expect(py).toBeLessThanOrEqual(minimapRect.y - PAD + 1e-6);
  });

  it('every indicator around the full circle stays out of all mobile HUD zones and inside viewport margins', () => {
    const { all } = mobileZones();
    const m = OffscreenIndicatorRenderer.MARGIN;
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const placed = drawOne({ x: Math.cos(a) * 2000, y: Math.sin(a) * 2000 }, all);
      expect(placed).toHaveLength(1);
      const [px, py] = placed[0]!;
      for (const z of all) expect(insideRect(px, py, z, PAD)).toBe(false);
      expect(px).toBeGreaterThanOrEqual(m - 1e-6);
      expect(px).toBeLessThanOrEqual(W - m + 1e-6);
      expect(py).toBeGreaterThanOrEqual(m + OffscreenIndicatorRenderer.HUD_TOP_MARGIN - 1e-6);
      expect(py).toBeLessThanOrEqual(H - m + 1e-6);
    }
  });

  it('is deterministic for identical inputs', () => {
    const { all } = mobileZones();
    const a = drawOne({ x: -1000, y: 600 }, all);
    const b = drawOne({ x: -1000, y: 600 }, all);
    expect(a).toEqual(b);
  });
});
