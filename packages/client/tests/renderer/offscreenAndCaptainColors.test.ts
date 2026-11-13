import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Stadium, MatchPhase, type GameStateSnapshot } from '@legacyx/core';
import { OffscreenIndicatorRenderer } from '../../src/renderer/OffscreenIndicatorRenderer';
import { StadiumRenderer } from '../../src/renderer/StadiumRenderer';
import { GameRenderer } from '../../src/renderer/GameRenderer';

function createRecordedCtx() {
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  const translates: Array<[number, number]> = [];
  const scales: Array<[number, number]> = [];
  const fillRects: Array<[number, number, number, number]> = [];

  let currentFillStyle = '';
  let currentStrokeStyle = '';
  let shadowBlurValue: number | undefined;

  const ctx: any = {
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: string) {
      currentFillStyle = val;
    },
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(val: string) {
      currentStrokeStyle = val;
    },
    get shadowBlur() {
      return shadowBlurValue;
    },
    set shadowBlur(val: number | undefined) {
      shadowBlurValue = val;
    },
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn((sx: number, sy: number) => {
      scales.push([sx, sy]);
    }),
    translate: vi.fn((tx: number, ty: number) => {
      translates.push([tx, ty]);
    }),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    fill: vi.fn(() => {
      fillStyles.push(currentFillStyle);
    }),
    stroke: vi.fn(() => {
      strokeStyles.push(currentStrokeStyle);
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillStyles.push(currentFillStyle);
      fillRects.push([x, y, w, h]);
    }),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
  };

  return { ctx, fillStyles, strokeStyles, translates, scales, fillRects };
}

describe('Task 3: OffscreenIndicatorRenderer & Captain Kit Colors', () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  describe('Item 7: OffscreenIndicatorRenderer zoom, radius & exact HUD bounds', () => {
    it('projects with zoom and does NOT draw indicator for visible disc in bottom-right clear pitch', () => {
      const { ctx, fillStyles, translates } = createRecordedCtx();
      const renderer = new OffscreenIndicatorRenderer();

      // cam = (0, 0), cx = 500, cy = 300, viewport = 1000x600, zoom = 0.5
      // Disc at (350, 250) -> sx = 350*0.5 + 500 = 675, sy = 250*0.5 + 300 = 425
      // Inside viewport [0, 1000] x [0, 600] and clear of bottom-left chat (sx 675 > chatWidth 340)
      const discs: any[] = [{ id: 2, team: 1, x: 350, y: 250, radius: 15 }];

      renderer.draw(ctx, discs, null, 0, 0, 500, 300, 1000, 600, 200, {
        zoom: 0.5,
        chatWidth: 340
      });

      expect(fillStyles).toHaveLength(0);
      expect(translates).toHaveLength(0);
    });

    it('includes scaled disc radius rScreen = radius * zoom so partially visible discs never trigger indicators', () => {
      const { ctx, fillStyles } = createRecordedCtx();
      const renderer = new OffscreenIndicatorRenderer();

      // At zoom 1.0, radius 15: sx = -8 has right edge at +7 >= 0 (partially visible on left edge)
      // sx = 1010 has left edge at 995 <= 1000 (partially visible on right edge)
      // At zoom 2.0, radius 15 (rScreen = 30): disc at x = 260 -> sx = 500 + 520 = 1020, left edge 990 <= 1000 (visible!)
      const visibleEdgeDiscs: any[] = [
        { id: 1, team: 1, x: -508, y: 0, radius: 15 },
        { id: 2, team: 2, x: 510, y: 0, radius: 15 }
      ];
      renderer.draw(ctx, visibleEdgeDiscs, null, 0, 0, 500, 300, 1000, 600, 0, { zoom: 1.0 });
      expect(fillStyles).toHaveLength(0);

      // Zoom 2.0 partially visible right edge: x = 260 -> sx = 500 + 260*2 = 1020, rScreen = 30 -> 1020 - 30 = 990 <= 1000
      renderer.draw(ctx, [{ id: 3, team: 1, x: 260, y: 0, radius: 15 }], null, 0, 0, 500, 300, 1000, 600, 0, {
        zoom: 2.0
      });
      expect(fillStyles).toHaveLength(0);

      // Zoom 2.0 completely offscreen: x = 270 -> sx = 1040, rScreen = 30 -> 1040 - 30 = 1010 > 1000
      renderer.draw(ctx, [{ id: 4, team: 1, x: 270, y: 0, radius: 15 }], null, 0, 0, 500, 300, 1000, 600, 0, {
        zoom: 2.0
      });
      expect(fillStyles).toHaveLength(1);
    });

    it('triggers indicator ONLY when occluded inside bottom-left chat box, never when chatHeight=0 or sx > chatWidth', () => {
      const renderer = new OffscreenIndicatorRenderer();

      // Case 1: Strictly behind bottom-left chat box (sx=150, sy=500 inside x<=340 && y>=400)
      const occluded = createRecordedCtx();
      renderer.draw(
        occluded.ctx,
        [{ id: 1, team: 2, x: -350, y: 200, radius: 15 }],
        null,
        0,
        0,
        500,
        300,
        1000,
        600,
        200,
        { zoom: 1.0, chatWidth: 340 }
      );
      expect(occluded.fillStyles).toHaveLength(1);
      const [ex, ey] = occluded.translates[0]!;
      expect(ex).toBeGreaterThanOrEqual(OffscreenIndicatorRenderer.MARGIN);
      expect(ex).toBeLessThanOrEqual(1000 - OffscreenIndicatorRenderer.MARGIN);
      expect(ey).toBeGreaterThanOrEqual(OffscreenIndicatorRenderer.MARGIN + OffscreenIndicatorRenderer.HUD_TOP_MARGIN);
      expect(ey).toBeLessThanOrEqual(600 - OffscreenIndicatorRenderer.MARGIN);
      // Projected indicator itself must sit outside the chat box so it stays visible
      expect(ex > 340 || ey < 400).toBe(true);

      // Case 2: Same coordinates with chatHeight=0 -> visible, 0 indicators
      const noChatHeight = createRecordedCtx();
      renderer.draw(
        noChatHeight.ctx,
        [{ id: 1, team: 2, x: -350, y: 200, radius: 15 }],
        null,
        0,
        0,
        500,
        300,
        1000,
        600,
        0,
        { zoom: 1.0, chatWidth: 340 }
      );
      expect(noChatHeight.fillStyles).toHaveLength(0);

      // Case 3: Same coordinates with chatWidth=0 -> visible, 0 indicators
      const noChatWidth = createRecordedCtx();
      renderer.draw(
        noChatWidth.ctx,
        [{ id: 1, team: 2, x: -350, y: 200, radius: 15 }],
        null,
        0,
        0,
        500,
        300,
        1000,
        600,
        200,
        { zoom: 1.0, chatWidth: 0 }
      );
      expect(noChatWidth.fillStyles).toHaveLength(0);

      // Case 4: Bottom-right clear pitch (sx=700 > chatWidth=340, sy=500) -> 0 indicators
      const clearRight = createRecordedCtx();
      renderer.draw(
        clearRight.ctx,
        [{ id: 1, team: 2, x: 200, y: 200, radius: 15 }],
        null,
        0,
        0,
        500,
        300,
        1000,
        600,
        200,
        { zoom: 1.0, chatWidth: 340 }
      );
      expect(clearRight.fillStyles).toHaveLength(0);
    });

    it('treats top-center scoreboard as occluded while keeping top-left/top-right clear pitch unoccluded', () => {
      const renderer = new OffscreenIndicatorRenderer();

      // Behind top-center scoreboard: sx = 500 (inside [320, 680]), sy = 25 (inside [0, 56])
      const occludedTop = createRecordedCtx();
      renderer.draw(
        occludedTop.ctx,
        [{ id: 1, team: 1, x: 0, y: -275, radius: 15 }],
        null,
        0,
        0,
        500,
        300,
        1000,
        600,
        0,
        { zoom: 1.0 }
      );
      expect(occludedTop.fillStyles).toHaveLength(1);
      expect(occludedTop.translates[0]![1]).toBeGreaterThanOrEqual(56);

      // Top-left clear pitch: sx = 120 (< 320), sy = 25 -> visible, 0 indicators
      const clearTopLeft = createRecordedCtx();
      renderer.draw(
        clearTopLeft.ctx,
        [{ id: 1, team: 1, x: -380, y: -275, radius: 15 }],
        null,
        0,
        0,
        500,
        300,
        1000,
        600,
        0,
        { zoom: 1.0 }
      );
      expect(clearTopLeft.fillStyles).toHaveLength(0);
    });

    it('uses captain redColor and blueColor for offscreen arrows and falls back to defaults', () => {
      const renderer = new OffscreenIndicatorRenderer();
      const discs: any[] = [
        { id: 0, team: 0, x: 1500, y: 0, radius: 5.8 },
        { id: 1, team: 1, x: -1500, y: 0, radius: 15 },
        { id: 2, team: 2, x: 1500, y: 100, radius: 15 }
      ];

      const custom = createRecordedCtx();
      renderer.draw(custom.ctx, discs, null, 0, 0, 500, 300, 1000, 600, 0, {
        redColor: '#22C55E',
        blueColor: '#F59E0B'
      });
      expect(custom.fillStyles).toEqual(['#FFCC00', '#22C55E', '#F59E0B']);
      expect(custom.ctx.shadowBlur).toBeUndefined();

      const defaults = createRecordedCtx();
      renderer.draw(defaults.ctx, discs, null, 0, 0, 500, 300, 1000, 600, 0);
      expect(defaults.fillStyles).toEqual(['#FFCC00', '#FF0055', '#00E5FF']);
    });
  });

  describe('Item 25: StadiumRenderer captain colors & cache invalidation', () => {
    beforeEach(() => {
      (globalThis as any).document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'canvas') {
            const cacheCtx = createRecordedCtx();
            return {
              width: 0,
              height: 0,
              style: {},
              getContext: () => cacheCtx.ctx,
              __recorded: cacheCtx
            };
          }
          return {};
        })
      };
    });

    it('renders left/right goalposts with redTeamColor and blueTeamColor instead of hardcoded #FF0055/#0EA5E9', () => {
      const stadium = new Stadium();
      const renderer = new StadiumRenderer(stadium);
      renderer.setTeamColors('#22C55E', '#F59E0B');

      const main = createRecordedCtx();
      renderer.renderPosts(main.ctx, stadium);

      expect(main.strokeStyles).toContain('#22C55E');
      expect(main.strokeStyles).toContain('#F59E0B');
      expect(main.strokeStyles).not.toContain('#FF0055');
      expect(main.strokeStyles).not.toContain('#0EA5E9');
      expect(main.strokeStyles).toContain('rgba(34, 197, 94, 0.4)');
      expect(main.strokeStyles).toContain('rgba(245, 158, 11, 0.4)');
      expect(main.ctx.shadowBlur).toBeUndefined();
    });

    it('renders keeper areas and dashed goal lines in captain colors and invalidates cache when colors change', () => {
      const stadium = new Stadium();
      const renderer = new StadiumRenderer(stadium);
      renderer.setTeamColors('#22C55E', '#F59E0B');

      const main = createRecordedCtx();
      renderer.renderPitch(main.ctx, stadium);

      const firstCache = renderer.cachedCanvas as any;
      expect(firstCache).not.toBeNull();
      const firstCacheRecorded = firstCache.__recorded;
      expect(firstCacheRecorded.fillStyles).toContain('rgba(34, 197, 94, 0.06)');
      expect(firstCacheRecorded.fillStyles).toContain('rgba(245, 158, 11, 0.06)');
      expect(firstCacheRecorded.strokeStyles).toContain('rgba(34, 197, 94, 0.35)');
      expect(firstCacheRecorded.strokeStyles).toContain('rgba(245, 158, 11, 0.35)');
      // Goal lines adopt team colors with existing alpha
      expect(firstCacheRecorded.strokeStyles).toContain('rgba(34, 197, 94, 0.45)');
      expect(firstCacheRecorded.strokeStyles).toContain('rgba(245, 158, 11, 0.45)');

      // Re-rendering without color change reuses cached canvas
      renderer.renderPitch(main.ctx, stadium);
      expect(renderer.cachedCanvas).toBe(firstCache);

      // Mutating captain color invalidates cache on next renderPitch automatically
      renderer.redTeamColor = '#A855F7';
      renderer.renderPitch(main.ctx, stadium);
      const updatedRecorded = (renderer.cachedCanvas as any).__recorded;
      expect(updatedRecorded.strokeStyles).toContain('rgba(168, 85, 247, 0.35)');
      expect(updatedRecorded.strokeStyles).toContain('rgba(168, 85, 247, 0.45)');
    });
  });

  describe('GameRenderer DPR, zoom, chatBounds & captain kit integration', () => {
    beforeEach(() => {
      (globalThis as any).window = {
        devicePixelRatio: 2,
        innerWidth: 1000,
        innerHeight: 600
      };
      (globalThis as any).document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'canvas') {
            const cacheCtx = createRecordedCtx();
            return {
              width: 0,
              height: 0,
              style: {},
              getContext: () => cacheCtx.ctx
            };
          }
          return {};
        })
      };
    });

    it('applies DPR transform, passes CSS px bounds, effective zoom, chat bounds, and captain colors in render()', () => {
      const main = createRecordedCtx();
      const mockCanvas: any = {
        width: 1000,
        height: 600,
        clientWidth: 1000,
        clientHeight: 600,
        getContext: () => main.ctx
      };

      const stadium = new Stadium();
      const renderer = new GameRenderer(mockCanvas, { stadium });
      expect(mockCanvas.width).toBe(2000);
      expect(mockCanvas.height).toBe(1200);

      renderer.safeAreaBottom = 0;
      renderer.setChatBounds(340, 200);
      renderer.camera.setZoom(0.5);
      renderer.setTeamKits(
        { primaryColor: '#22C55E', secondaryColor: '#FFFFFF', pattern: 'solid' },
        { primaryColor: '#F59E0B', secondaryColor: '#FFFFFF', pattern: 'solid' }
      );

      const offscreenFills: string[] = [];
      let shadowBlurAfterOffscreen: number | undefined;
      const origOffscreenDraw = renderer.offscreenRenderer.draw.bind(renderer.offscreenRenderer);
      const drawSpy = vi.spyOn(renderer.offscreenRenderer, 'draw').mockImplementation((...args) => {
        const start = main.fillStyles.length;
        origOffscreenDraw(...args);
        offscreenFills.push(...main.fillStyles.slice(start));
        shadowBlurAfterOffscreen = main.ctx.shadowBlur;
      });
      const minimapSpy = vi.spyOn(renderer.minimapRenderer, 'render');

      const snap: GameStateSnapshot = {
        tick: 10,
        phase: MatchPhase.PLAYING,
        matchTimer: 60,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 5.8, flags: 0 },
          { id: 1, team: 1, x: 350, y: 150, vx: 0, vy: 0, radius: 15, flags: 0 }, // visible at zoom 0.5
          { id: 2, team: 2, x: 2500, y: 0, vx: 0, vy: 0, radius: 15, flags: 0 } // offscreen right
        ]
      };

      renderer.render(snap, snap, 1.0, 0);

      // DPR setTransform applied cleanly in CSS px
      expect(main.ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);

      // OffscreenIndicatorRenderer receives CSS px viewport (1000x600), zoom=0.5, chatWidth=340, and captain colors
      expect(drawSpy).toHaveBeenCalledWith(
        main.ctx,
        expect.any(Array),
        0,
        expect.any(Number),
        expect.any(Number),
        500,
        300,
        1000,
        600,
        200,
        {
          zoom: 0.5,
          chatWidth: 340,
          redColor: '#22C55E',
          blueColor: '#F59E0B'
        }
      );

      // Minimap receives CSS pixel viewport (1000x600), not physical pixels (2000x1200)
      expect(minimapSpy).toHaveBeenCalledWith(
        main.ctx,
        snap,
        renderer.camera,
        0,
        expect.any(Object),
        1000,
        600
      );

      // Only the truly offscreen blue disc (id=2) triggered an offscreen indicator arrow
      expect(offscreenFills).toEqual(['#F59E0B']);
      expect(shadowBlurAfterOffscreen).toBeUndefined();
    });
  });
});
