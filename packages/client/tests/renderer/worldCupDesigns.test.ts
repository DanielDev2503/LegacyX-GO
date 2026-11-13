import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render as renderSvelte } from 'svelte/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MatchPhase, type GameStateSnapshot } from '@legacyx/core';

import {
  drawBallDesign,
  isBallSkin,
  WORLD_CUP_BALL_SKINS,
  type BallSkin
} from '../../src/renderer/ballDesigns';
import { DiscRenderer } from '../../src/renderer/DiscRenderer';
import { GameRenderer } from '../../src/renderer/GameRenderer';
import {
  drawKitBadgeCanvas,
  drawKitPatternCanvas,
  getKitPatternCss,
  getKitPatternSvgDataUri,
  type KitPatternId
} from '../../src/ui/utils/kitPatterns';
import KitPatternBadge from '../../src/ui/components/KitPatternBadge.svelte';
import MatchScoreboard, {
  SCOREBOARD_DESIGNS,
  type ScoreboardDesign
} from '../../src/ui/components/MatchScoreboard.svelte';

function createRecordedCtx() {
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  const fillTexts: Array<{ text: string; fillStyle: string }> = [];
  const strokeTexts: Array<{ text: string; strokeStyle: string }> = [];
  const fillRects: Array<[number, number, number, number]> = [];
  const setTransforms: Array<[number, number, number, number, number, number]> = [];
  const lineTos: Array<[number, number]> = [];

  let currentFillStyle = '';
  let currentStrokeStyle = '';

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
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn((a: number, b: number, c: number, d: number, e: number, f: number) => {
      setTransforms.push([a, b, c, d, e, f]);
    }),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn((x: number, y: number) => {
      lineTos.push([x, y]);
    }),
    arc: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    fill: vi.fn(() => {
      fillStyles.push(String(currentFillStyle));
    }),
    stroke: vi.fn(() => {
      strokeStyles.push(String(currentStrokeStyle));
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillStyles.push(String(currentFillStyle));
      fillRects.push([x, y, w, h]);
    }),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn((text: string) => {
      fillTexts.push({ text, fillStyle: String(currentFillStyle) });
    }),
    strokeText: vi.fn((text: string) => {
      strokeTexts.push({ text, strokeStyle: String(currentStrokeStyle) });
    }),
    measureText: vi.fn(() => ({ width: 100 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
  };

  return { ctx, fillStyles, strokeStyles, fillTexts, strokeTexts, fillRects, setTransforms, lineTos };
}

function makeSnapshot(tick: number, ballX: number, ballY: number, playerX: number): GameStateSnapshot {
  return {
    tick,
    phase: MatchPhase.PLAYING,
    redScore: 1,
    blueScore: 0,
    matchTimer: 120,
    soundMask: 0,
    discs: [
      { id: 0, team: 0, x: ballX, y: ballY, vx: 180, vy: 0, flags: 0, stamina: 100, spin: 0 },
      { id: 1, team: 1, x: playerX, y: 0, vx: 120, vy: 0, flags: 0, stamina: 100, spin: 0 }
    ]
  };
}

describe('World Cup Ball Designs, Replay Overrides, Kit Patterns & Scoreboards', () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  const originalLocalStorage = (globalThis as any).localStorage;

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
    vi.restoreAllMocks();
  });

  describe('1) World Cup Ball Designs (ballDesigns.ts + DiscRenderer.ts)', () => {
    it('exports WORLD_CUP_BALL_SKINS with all 6 iconic tournament balls', () => {
      expect(WORLD_CUP_BALL_SKINS).toEqual([
        'wc2006',
        'wc2010',
        'wc2014',
        'wc2018',
        'wc2022',
        'wc2026'
      ]);
      for (const skin of WORLD_CUP_BALL_SKINS) {
        expect(isBallSkin(skin)).toBe(true);
      }
      expect(isBallSkin('classic')).toBe(true);
      expect(isBallSkin('invalid_skin')).toBe(false);
    });

    it('renders all 6 existing skins and all 6 World Cup skins with iconic palettes & 3D rotation', () => {
      const allSkins: BallSkin[] = [
        'classic',
        'retro',
        'neon',
        'cyber',
        'gold',
        'solid',
        ...WORLD_CUP_BALL_SKINS
      ];

      for (const skin of allSkins) {
        const a = createRecordedCtx();
        const b = createRecordedCtx();
        drawBallDesign(a.ctx, { x: 50, y: 50, radius: 24, skin, rotX: 0, rotY: 0 });
        drawBallDesign(b.ctx, { x: 50, y: 50, radius: 24, skin, rotX: 0.85, rotY: 0.45 });
        expect(a.fillStyles.length).toBeGreaterThan(0);
        if (skin !== 'solid') {
          expect(a.lineTos).not.toEqual(b.lineTos);
        }
      }

      // Verify specific tournament palette signatures
      const wc2006 = createRecordedCtx();
      drawBallDesign(wc2006.ctx, { x: 50, y: 50, radius: 24, skin: 'wc2006', rotX: 0, rotY: 0 });
      expect(wc2006.fillStyles).toContain('#111827');
      expect(wc2006.strokeStyles).toContain('#D4AF37');

      const wc2010 = createRecordedCtx();
      drawBallDesign(wc2010.ctx, { x: 50, y: 50, radius: 24, skin: 'wc2010', rotX: 0, rotY: 0 });
      expect(wc2010.fillStyles).toContain('#16A34A');
      expect(wc2010.fillStyles).toContain('#FACC15');

      const wc2014 = createRecordedCtx();
      drawBallDesign(wc2014.ctx, { x: 50, y: 50, radius: 24, skin: 'wc2014', rotX: 0, rotY: 0 });
      expect(wc2014.strokeStyles).toContain('#0284C7');
      expect(wc2014.strokeStyles).toContain('#F97316');
      expect(wc2014.strokeStyles).toContain('#10B981');

      const wc2018 = createRecordedCtx();
      drawBallDesign(wc2018.ctx, { x: 50, y: 50, radius: 24, skin: 'wc2018', rotX: 0, rotY: 0 });
      expect(wc2018.fillStyles).toContain('#0F172A');
      expect(wc2018.fillStyles).toContain('#EAB308');

      const wc2022 = createRecordedCtx();
      drawBallDesign(wc2022.ctx, { x: 50, y: 50, radius: 24, skin: 'wc2022', rotX: 0.4, rotY: 0.3 });
      expect(wc2022.fillStyles).toContain('#06B6D4');
      expect(wc2022.fillStyles).toContain('#E11D48');

      const wc2026 = createRecordedCtx();
      drawBallDesign(wc2026.ctx, { x: 50, y: 50, radius: 24, skin: 'wc2026', rotX: 0, rotY: 0 });
      expect(wc2026.fillStyles).toContain('#EF4444');
      expect(wc2026.fillStyles).toContain('#10B981');
      expect(wc2026.fillStyles).toContain('#2563EB');
    });

    it('restores World Cup ballSkin from localStorage in DiscRenderer', () => {
      (globalThis as any).localStorage = {
        getItem: (k: string) => (k === 'haxball_ball_skin' ? 'wc2026' : null)
      };
      const discRenderer = new DiscRenderer();
      expect(discRenderer.ballSkin).toBe('wc2026');
    });
  });

  describe('2) Deterministic Replay Overrides (GameRenderer.ts)', () => {
    function createFakeCanvas(width = 1280, height = 720) {
      const recorded = createRecordedCtx();
      const canvas: any = {
        width,
        height,
        clientWidth: 0,
        clientHeight: 0,
        getContext: vi.fn(() => recorded.ctx)
      };
      return { canvas, recorded };
    }

    beforeEach(() => {
      (globalThis as any).document = undefined;
      (globalThis as any).window = { devicePixelRatio: 2, innerWidth: 1920, innerHeight: 1080 };
    });

    it('respects overrideDpr = 1 and setTheme("light") for 1280x720 offscreen export without cropping or dark fallback', () => {
      const { canvas, recorded } = createFakeCanvas(1280, 720);
      const renderer = new GameRenderer(canvas, { overrideDpr: 1, theme: 'light' });
      renderer.setTheme('light');

      const s0 = makeSnapshot(0, 0, 0, -50);
      const s1 = makeSnapshot(1, 3, 0, -48);
      renderer.renderAtFixedStep(s0, s1, 1.0, 1, 1 / 60);

      expect(renderer.theme).toBe('light');
      expect(renderer.stadiumRenderer.theme).toBe('light');
      expect(renderer.discRenderer.theme).toBe('light');
      // Full 1280x720 cleared with light background (#E0F2FE) and transform scale 1 (not HiDPI 2)
      expect(recorded.setTransforms).toContainEqual([1, 0, 0, 1, 0, 0]);
      expect(recorded.fillStyles).toContain('#E0F2FE');
      expect(recorded.fillRects).toContainEqual([0, 0, 1280, 720]);
    });

    it('renderAtFixedStep advances camera & goal nets deterministically ignoring wall-clock jumps', () => {
      const perfSpy = vi.spyOn(performance, 'now');
      const runSequence = (wallClockStart: number, stepJump: number) => {
        const { canvas } = createFakeCanvas(1280, 720);
        const renderer = new GameRenderer(canvas, { overrideDpr: 1, theme: 'dark' });
        renderer.camera.reset(0, 0);
        for (let f = 0; f < 10; f++) {
          perfSpy.mockReturnValue(wallClockStart + f * stepJump);
          const s0 = makeSnapshot(f, f * 4, 0, f * 2);
          const s1 = makeSnapshot(f + 1, (f + 1) * 4, 0, (f + 1) * 2);
          renderer.renderAtFixedStep(s0, s1, 0.5, 1, 1 / 60);
        }
        return { camX: renderer.camera.x, camY: renderer.camera.y };
      };

      const runA = runSequence(1000, 16.67);
      const runB = runSequence(500000, 450);
      expect(runA.camX).toBeGreaterThan(0);
      expect(runA.camX).toBeCloseTo(runB.camX, 8);
      expect(runA.camY).toBeCloseTo(runB.camY, 8);
    });
  });

  describe('3) Kit Patterns Utility & KitPatternBadge.svelte', () => {
    const ALL_PATTERNS: KitPatternId[] = [
      'solid',
      'vertical',
      'hoop',
      'vertical_stripe',
      'diagonal_right',
      'diagonal_left',
      'halves',
      'checkerboard',
      'diagonal',
      'diagonal_checks'
    ];

    it('generates crisp CSS (zero faded blending), SVG data URIs, and Canvas 2D fills for all patterns', () => {
      for (const pattern of ALL_PATTERNS) {
        const kit = {
          primaryColor: '#ef4444',
          secondaryColor: '#facc15',
          tertiaryColor: '#ffffff',
          pattern,
          hasOutline: true
        };
        const css = getKitPatternCss(kit);
        expect(css.length).toBeGreaterThan(0);
        const svg = getKitPatternSvgDataUri(kit);
        expect(svg.startsWith('data:image/svg+xml;utf8,')).toBe(true);
        expect(decodeURIComponent(svg)).toContain('#ef4444');
        if (pattern !== 'solid') {
          expect(decodeURIComponent(svg)).toContain('#facc15');
        }

        const recorded = createRecordedCtx();
        drawKitPatternCanvas(recorded.ctx, 10, 10, 64, 36, kit, 6);
        expect(recorded.fillStyles).toContain('#ef4444');
        if (pattern !== 'solid') {
          expect(recorded.fillStyles).toContain('#facc15');
        }
        expect(recorded.strokeStyles).toContain('#000000');

        const badgeRecorded = createRecordedCtx();
        drawKitBadgeCanvas(badgeRecorded.ctx, 10, 10, 64, 36, kit, 'RED', 6);
        expect(badgeRecorded.strokeTexts[0]).toEqual({ text: 'RED', strokeStyle: '#000000' });
        expect(badgeRecorded.fillTexts[0]).toEqual({ text: 'RED', fillStyle: '#ffffff' });
      }
    });

    it('renders KitPatternBadge.svelte with tertiaryColor and black outline when hasOutline=true', () => {
      const res = renderSvelte(KitPatternBadge, {
        props: {
          kit: {
            primaryColor: '#dc2626',
            secondaryColor: '#f8fafc',
            tertiaryColor: '#facc15',
            pattern: 'halves',
            hasOutline: true
          },
          label: 'ESP'
        }
      });
      expect(res.body).toContain('ESP');
      expect(res.body).toContain('data-pattern="halves"');
      expect(res.body).toContain('data-outline="true"');
      expect(res.body).toContain('has-outline');
      expect(res.body).toContain('#facc15');
    });
  });

  describe('4) MatchScoreboard.svelte (Original + 6 World Cup Broadcast Scoreboards)', () => {
    const redKit = {
      tag: 'ARG',
      primaryColor: '#38bdf8',
      secondaryColor: '#ffffff',
      tertiaryColor: '#0f172a',
      pattern: 'vertical' as const,
      hasOutline: false
    };
    const blueKit = {
      tag: 'BRA',
      primaryColor: '#facc15',
      secondaryColor: '#16a34a',
      tertiaryColor: '#1e3a8a',
      pattern: 'hoop' as const,
      hasOutline: true
    };

    it('renders original and all 6 World Cup scoreboard designs using KitPatternBadge (no country flags)', () => {
      expect(SCOREBOARD_DESIGNS).toEqual([
        'original',
        'wc2006',
        'wc2010',
        'wc2014',
        'wc2018',
        'wc2022',
        'wc2026'
      ]);

      for (const design of SCOREBOARD_DESIGNS as readonly ScoreboardDesign[]) {
        const res = renderSvelte(MatchScoreboard, {
          props: {
            design,
            redScore: 3,
            blueScore: 2,
            clockText: '02:45',
            redKit,
            blueKit,
            isWarning30s: false,
            isGoldenGoal: false
          }
        });
        expect(res.body).toContain(`design-${design}`);
        expect(res.body).toContain('ARG');
        expect(res.body).toContain('BRA');
        expect(res.body).toContain('data-pattern="vertical"');
        expect(res.body).toContain('data-pattern="hoop"');
        expect(res.body).toContain('02:45');
        expect(res.body).toContain('>3<');
        expect(res.body).toContain('>2<');
        if (design === 'wc2026') {
          expect(res.body).toContain('wc2026-emblem');
          expect(res.body).toContain('>26<');
        }
      }
    });

    it('keeps 30s warning pulse and renders ONLY metallic gold ball SVG for Golden Goal (zero GOL DE ORO text)', () => {
      const res = renderSvelte(MatchScoreboard, {
        props: {
          design: 'wc2022',
          redScore: 2,
          blueScore: 2,
          clockText: '00:15',
          redKit,
          blueKit,
          isWarning30s: true,
          isGoldenGoal: true,
          compact: true
        }
      });
      expect(res.body).toContain('is-warning-30s');
      expect(res.body).toContain('is-compact');
      expect(res.body).toContain('glowing-ball-svg');
      expect(res.body).toContain('#FACC15');
      expect(res.body).not.toContain('GOL DE ORO');
    });

    it('enforces Svelte 5 Runes, scoped styles, and ZERO backdrop-filter: blur', () => {
      const badgeSrc = readFileSync(
        path.resolve(__dirname, '../../src/ui/components/KitPatternBadge.svelte'),
        'utf-8'
      );
      const sbSrc = readFileSync(
        path.resolve(__dirname, '../../src/ui/components/MatchScoreboard.svelte'),
        'utf-8'
      );
      for (const src of [badgeSrc, sbSrc]) {
        expect(src).toContain('$props');
        expect(src).toContain('$derived');
        expect(src).not.toContain('export let ');
        expect(src).not.toContain('backdrop-filter');
      }
    });
  });
});
