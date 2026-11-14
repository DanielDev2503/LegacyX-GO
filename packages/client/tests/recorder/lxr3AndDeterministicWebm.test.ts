import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import { MatchPhase, type GameStateSnapshot } from '@legacyx/core';
import {
  compressReplayGzip,
  decompressReplayGzip,
  matchRecorder,
  normalizeParsedReplay,
  type LxrReplayV1,
  type LxrReplayV2,
  type LxrReplayV3,
  type LxrScoreboardDesign
} from '../../src/recorder/MatchRecorder.svelte.js';
import {
  applyReplayRendererConfig,
  deriveReplayHudTimelineState,
  exportReplayToWebm,
  getVisibleReplayChat,
  renderReplayHudOverlay,
  REPLAY_STAGE_HEIGHT,
  REPLAY_STAGE_WIDTH,
  resolveReplayOverlayView
} from '../../src/recorder/ReplayHudCompositor.js';
import { WebmMuxer } from '../../src/recorder/WebmMuxer.js';
import { GameRenderer } from '../../src/renderer/GameRenderer.js';
import ReplayViewerModal from '../../src/ui/modals/ReplayViewerModal.svelte';
import { gameUI } from '../../src/ui/state/gameUI.svelte.js';

function makeSnapshot(overrides?: Partial<GameStateSnapshot>): GameStateSnapshot {
  return {
    tick: 120,
    phase: MatchPhase.PLAYING,
    matchTimer: 95,
    redScore: 2,
    blueScore: 1,
    soundMask: 0,
    isGoldenGoal: false,
    discs: [
      {
        id: 0,
        x: 0,
        y: 0,
        vx: 140,
        vy: -30,
        radius: 10,
        team: 0,
        flags: 0,
        stamina: 100,
        spin: 0.5
      },
      {
        id: 7,
        x: -180,
        y: 12,
        vx: 100,
        vy: 0,
        radius: 15,
        team: 1,
        flags: 1,
        stamina: 85,
        spin: 0
      },
      {
        id: 9,
        x: 180,
        y: -15,
        vx: -80,
        vy: 20,
        radius: 15,
        team: 2,
        flags: 0,
        stamina: 90,
        spin: 0
      }
    ],
    ...overrides
  };
}

function makeMockCanvas2dContext() {
  const fillTexts: string[] = [];
  const fillStyles: unknown[] = [];
  const strokeStyles: unknown[] = [];
  const alphaHistory: number[] = [];
  const roundRectCalls: Array<[number, number, number, number, number]> = [];
  const stateStack: Array<{ globalAlpha: number; shadowColor: string; shadowBlur: number }> = [];

  const ctx: Record<string, unknown> = {
    canvas: { width: REPLAY_STAGE_WIDTH, height: REPLAY_STAGE_HEIGHT },
    fillStyle: '#ffffff',
    strokeStyle: '#ffffff',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    save: vi.fn(() => {
      stateStack.push({
        globalAlpha: Number(ctx.globalAlpha ?? 1),
        shadowColor: String(ctx.shadowColor ?? 'transparent'),
        shadowBlur: Number(ctx.shadowBlur ?? 0)
      });
    }),
    restore: vi.fn(() => {
      const prev = stateStack.pop();
      if (prev) {
        ctx.globalAlpha = prev.globalAlpha;
        ctx.shadowColor = prev.shadowColor;
        ctx.shadowBlur = prev.shadowBlur;
      }
    }),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn((x: number, y: number, w: number, h: number, r: number) => {
      roundRectCalls.push([x, y, w, h, r]);
    }),
    fill: vi.fn(() => {
      fillStyles.push(ctx.fillStyle);
      alphaHistory.push(Number(ctx.globalAlpha ?? 1));
    }),
    stroke: vi.fn(() => {
      strokeStyles.push(ctx.strokeStyle);
    }),
    fillRect: vi.fn(() => {
      fillStyles.push(ctx.fillStyle);
    }),
    strokeRect: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      fillTexts.push(String(text));
    }),
    strokeText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: String(text).length * 7 })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    }))
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillTexts,
    fillStyles,
    strokeStyles,
    alphaHistory,
    roundRectCalls
  };
}

function makeSampleV3Replay(overrides?: Partial<LxrReplayV3>): LxrReplayV3 {
  return {
    magic: 'LXR3',
    version: 3,
    createdAt: '2026-11-13T18:00:00.000Z',
    roomName: 'Ranked WC Finals',
    roomType: 'ranked',
    stadiumId: 'mediano',
    durationSeconds: 0.5,
    redScore: 2,
    blueScore: 1,
    scoreboardDesign: 'wc2022',
    theme: 'light',
    ballMode: 'texture',
    ballSkin: 'wc2022',
    ballCustomColor: '#ffffff',
    redKit: {
      name: 'Rojos',
      tag: 'ROJ',
      primaryColor: '#dc2626',
      secondaryColor: '#ffffff',
      tertiaryColor: '#facc15',
      pattern: 'vertical',
      hasOutline: true
    },
    blueKit: {
      name: 'Azules',
      tag: 'AZU',
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      tertiaryColor: '#ffffff',
      pattern: 'diagonal_right',
      hasOutline: true
    },
    chatOpacity: 0.6,
    minimapEnabled: true,
    minimapOpacity: 0.72,
    minimapSize: 220,
    minimapCameraFrustum: false,
    initialChatMessages: [
      { t: 0, kind: 'system', sender: 'Sistema', text: 'Inicio de Ranked' }
    ],
    initialUiOverlay: {
      overlay: 'NONE',
      activeSlide: 'GAME',
      isPaused: false,
      postMatchStats: null
    },
    players: [
      { id: 7, nickname: 'Ace', team: 'red', avatar: '⚡', number: 10 },
      { id: 9, nickname: 'Keeper', team: 'blue', avatar: '🛡', number: 1 }
    ],
    recordingPlayerId: 7,
    recordingPlayerName: 'Ace',
    cameraZoom: 1,
    viewportWidth: 1280,
    viewportHeight: 720,
    timeLimitSeconds: 180,
    goals: [{ t: 0.25, scoringTeam: 'red', scorerName: 'Ace', redScore: 2, blueScore: 1 }],
    chatMessages: [
      { t: 0, kind: 'system', sender: 'Sistema', text: 'Inicio de Ranked' },
      { t: 0.15, kind: 'chat', sender: 'Ace', senderTeam: 'RED', text: 'Buen pase!' }
    ],
    banners: [
      { t: 0.05, payload: { kind: 'VS', label: 'ROJ VS AZU', durationMs: 200 } },
      { t: 0.3, payload: { kind: 'GOAL_REPLAY', label: 'REPETICIÓN DEL GOL', scorerName: 'Ace' } }
    ],
    hudEvents: [
      { t: 0.05, type: 'banner', payload: { kind: 'VS', label: 'ROJ VS AZU', durationMs: 200 } },
      { t: 0.1, type: 'telemetry', payload: { pingMs: 28, fps: 144 } },
      { t: 0.15, type: 'chat', payload: { kind: 'chat', sender: 'Ace', senderTeam: 'RED', text: 'Buen pase!' } },
      {
        t: 0.2,
        type: 'score_event',
        payload: { kind: 'GOL', points: 100, label: 'GOLAZO', playerName: 'Ace', team: 'red' }
      },
      {
        t: 0.25,
        type: 'kits_updated',
        payload: {
          redKit: {
            tag: 'CAM',
            primaryColor: '#16a34a',
            secondaryColor: '#ffffff',
            tertiaryColor: '#000000',
            pattern: 'checkerboard',
            hasOutline: true
          }
        }
      },
      { t: 0.3, type: 'banner', payload: { kind: 'GOAL_REPLAY', label: 'REPETICIÓN DEL GOL', scorerName: 'Ace' } },
      {
        t: 0.4,
        type: 'ui_overlay',
        payload: {
          overlay: 'STATS',
          activeSlide: 'STATS',
          isPaused: false,
          postMatchStats: {
            mvpName: 'Ace',
            players: [{ nickname: 'Ace', team: 'red', goals: 2, assists: 1, points: 250 }]
          }
        }
      }
    ],
    frames: [
      { t: 0, snapshot: makeSnapshot({ matchTimer: 95, redScore: 1, blueScore: 1 }) },
      { t: 0.25, snapshot: makeSnapshot({ matchTimer: 94.75, redScore: 2, blueScore: 1 }) },
      { t: 0.45, snapshot: makeSnapshot({ phase: 3.5, matchTimer: 94.55, redScore: 2, blueScore: 1 }) }
    ],
    ...overrides
  };
}

describe('LXR3 HUD Timeline Recording & Deterministic WebM Export', () => {
  beforeEach(() => {
    if (matchRecorder.isRecording) {
      matchRecorder.stop();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('captures LXR3 with full metadata, 60Hz frames without 30ms drops, chronological hudEvents & gzip roundtrip', async () => {
    let nowMs = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const mockCanvas = { width: 1280, height: 720 } as HTMLCanvasElement;
    const started = matchRecorder.start(mockCanvas, {
      roomName: 'Copa Ranked 2026',
      roomType: 'ranked',
      stadiumId: 'mediano',
      scoreboardDesign: 'wc2026',
      theme: 'light',
      ballMode: 'texture',
      ballSkin: 'wc2026',
      ballCustomColor: '#ffffff',
      redKit: {
        tag: 'R26',
        primaryColor: '#ef4444',
        secondaryColor: '#ffffff',
        tertiaryColor: '#facc15',
        pattern: 'vertical',
        hasOutline: true
      },
      blueKit: {
        tag: 'B26',
        primaryColor: '#2563eb',
        secondaryColor: '#0f172a',
        tertiaryColor: '#ffffff',
        pattern: 'hoop',
        hasOutline: false
      },
      chatOpacity: 0.55,
      minimapEnabled: true,
      minimapOpacity: 0.75,
      minimapSize: 215,
      minimapCameraFrustum: false,
      initialChatMessages: [{ t: 0, kind: 'system', sender: 'Sala', text: 'Pre-partido' }],
      initialUiOverlay: { overlay: 'NONE', activeSlide: 'GAME', isPaused: false, postMatchStats: null },
      players: [{ id: 1, nickname: 'Capt', team: 'red', number: 10 }]
    });
    expect(started).toBe(true);

    // Record 10 consecutive ~60Hz frames (every 16.67ms) — NONE should be dropped!
    for (let i = 0; i < 10; i++) {
      nowMs = 1000 + i * 16.67;
      matchRecorder.recordFrame(makeSnapshot({ tick: 100 + i }));
    }

    nowMs = 1200;
    matchRecorder.recordTelemetry(34, 120);
    nowMs = 1250;
    matchRecorder.recordScoreEvent({ kind: 'GOAL', points: 100, label: 'GOLAZO', playerName: 'Capt', team: 'red' });
    nowMs = 1300;
    matchRecorder.recordChat({ kind: 'chat', sender: 'Capt', senderTeam: 'RED', text: 'Vamos!' });
    nowMs = 1350;
    matchRecorder.recordBanner({ kind: 'GOAL_REPLAY', label: 'REPETICIÓN DEL GOL', scorerName: 'Capt' });
    nowMs = 1400;
    matchRecorder.updateMetadata({
      redKit: { tag: 'NEW', primaryColor: '#10b981', secondaryColor: '#000', pattern: 'checkerboard' }
    });
    nowMs = 1450;
    matchRecorder.recordUiOverlay({
      overlay: 'STATS',
      activeSlide: 'STATS',
      isPaused: false,
      postMatchStats: { mvpName: 'Capt', players: [] }
    });

    const recorded = matchRecorder.stop();
    expect(recorded?.magic).toBe('LXR3');
    if (recorded?.magic !== 'LXR3') throw new Error('Expected LXR3');

    expect(recorded.frames).toHaveLength(10); // Zero frames dropped by 30ms throttle!
    expect(recorded.roomType).toBe('ranked');
    expect(recorded.scoreboardDesign).toBe('wc2026');
    expect(recorded.theme).toBe('light');
    expect(recorded.ballSkin).toBe('wc2026');
    expect(recorded.chatOpacity).toBe(0.55);
    expect(recorded.minimapSize).toBe(215);
    expect(recorded.minimapCameraFrustum).toBe(false);
    expect(recorded.initialChatMessages).toHaveLength(1);

    const eventTypes = recorded.hudEvents.map((e) => e.type);
    expect(eventTypes).toEqual(['telemetry', 'score_event', 'chat', 'banner', 'kits_updated', 'ui_overlay']);

    const gz = await compressReplayGzip(recorded);
    const decoded = await decompressReplayGzip(gz);
    expect(decoded.magic).toBe('LXR3');
    if (decoded.magic !== 'LXR3') throw new Error('Expected LXR3 after gzip roundtrip');
    expect(decoded.hudEvents).toHaveLength(6);
    expect(decoded.scoreboardDesign).toBe('wc2026');
  });

  it('keeps LXR1 and LXR2 backwards compatibility in normalizeParsedReplay', () => {
    const v1: LxrReplayV1 = {
      magic: 'LXR1',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      roomName: 'Old V1',
      stadiumId: 'clasico',
      durationSeconds: 1,
      redScore: 1,
      blueScore: 0,
      players: [{ id: 1, nickname: 'Uno', team: 'red' }],
      goals: [],
      frames: [{ t: 0, snapshot: makeSnapshot() }]
    };
    const v2: LxrReplayV2 = {
      ...v1,
      magic: 'LXR2',
      version: 2,
      recordingPlayerId: 1,
      recordingPlayerName: 'Uno',
      cameraZoom: 1,
      viewportWidth: 1280,
      viewportHeight: 720,
      timeLimitSeconds: 180,
      chatMessages: [{ t: 0.2, kind: 'chat', sender: 'Uno', senderTeam: 'RED', text: 'Hola' }],
      banners: [{ t: 0.1, payload: { kind: 'VS', label: 'A vs B' } }]
    };

    expect(normalizeParsedReplay(v1).magic).toBe('LXR1');
    const parsedV2 = normalizeParsedReplay(v2);
    expect(parsedV2.magic).toBe('LXR2');
    if (parsedV2.magic === 'LXR2') {
      expect(parsedV2.chatMessages).toHaveLength(1);
      expect(parsedV2.banners).toHaveLength(1);
    }
  });

  it('derives deterministic HUD timeline state cleanly when scrubbing forward and backward', () => {
    const replay = makeSampleV3Replay();

    const tEarly = deriveReplayHudTimelineState(replay, replay.frames[0]!, 0.08);
    expect(tEarly.roomType).toBe('ranked');
    expect(tEarly.scoreboardDesign).toBe('wc2022');
    expect(tEarly.redAcronym).toBe('ROJ');
    expect(tEarly.activeBanner?.kind).toBe('VS');
    expect(tEarly.chatOpacity).toBe(0.6);

    const tLate = deriveReplayHudTimelineState(replay, replay.frames[2]!, 0.42);
    expect(tLate.telemetry).toEqual({ pingMs: 28, fps: 144 });
    expect(tLate.redAcronym).toBe('CAM'); // kits_updated applied!
    expect(tLate.slidingEvents).toHaveLength(1);
    expect(tLate.slidingEvents[0]!.pointsText).toBe('+100');
    expect(tLate.activeBanner?.kind).toBe('GOAL_REPLAY');
    expect(tLate.isGoalReplay).toBe(true);
    expect(tLate.uiOverlay.activeSlide).toBe('STATS');
    expect(tLate.uiOverlay.postMatchStats?.mvpName).toBe('Ace');

    // Scrub backwards reverts kits & ui_overlay cleanly
    const tBack = deriveReplayHudTimelineState(replay, replay.frames[0]!, 0.2);
    expect(tBack.redAcronym).toBe('ROJ');
    expect(tBack.uiOverlay.activeSlide).toBe('GAME');
  });

  it('composites all 7 scoreboard styles, yellow ranked card, telemetry, events, banners, chatOpacity & stats panel in Canvas2D', () => {
    const designs: LxrScoreboardDesign[] = [
      'original',
      'wc2006',
      'wc2010',
      'wc2014',
      'wc2018',
      'wc2022',
      'wc2026'
    ];
    const replay = makeSampleV3Replay();

    for (const design of designs) {
      const mock = makeMockCanvas2dContext();
      const state = deriveReplayHudTimelineState(replay, replay.frames[2]!, 0.42);
      state.scoreboardDesign = design;

      renderReplayHudOverlay(mock.ctx, state, REPLAY_STAGE_WIDTH, REPLAY_STAGE_HEIGHT);

      expect(mock.strokeStyles).toContain('#ffd700'); // Ranked yellow room border
      expect(mock.fillTexts.some((t) => t.includes('RANK'))).toBe(true);
      expect(mock.fillTexts.some((t) => t.includes('28ms'))).toBe(true);
      expect(mock.fillTexts.some((t) => t.includes('144'))).toBe(true);
      expect(mock.fillTexts.some((t) => t.includes('GOLAZO'))).toBe(true);
      expect(mock.fillTexts.some((t) => t.includes('+100'))).toBe(true);
      expect(mock.fillTexts.some((t) => t.includes('Buen pase!'))).toBe(true);
      expect(mock.fillTexts.some((t) => t.includes('ESTADÍSTICAS'))).toBe(true);
      expect(mock.fillTexts.some((t) => t.includes('MVP: Ace'))).toBe(true);
      expect(mock.alphaHistory.some((a) => Math.abs(a - 0.6) < 0.01)).toBe(true);
    }
  });

  it('exports deterministic WebM without pre-locking canvas context, applies theme/minimap/overrideDpr=1, paints Frame 0 before start(), and drives captureStream(0)+requestFrame', async () => {
    const replay = makeSampleV3Replay({
      durationSeconds: 0.05 // 3 virtual frames at 60fps
    });

    const callOrder: string[] = [];
    const requestFrameSpy = vi.fn(() => {
      callOrder.push('requestFrame');
    });
    const captureStreamSpy = vi.fn((fps?: number) => {
      callOrder.push(`captureStream(${fps})`);
      return {
        getVideoTracks: () => [{ requestFrame: requestFrameSpy, stop: vi.fn() }],
        getTracks: () => [{ stop: vi.fn() }]
      };
    });

    const mock2d = makeMockCanvas2dContext();
    const exportCanvas = {
      width: 0,
      height: 0,
      style: {} as Record<string, string>,
      getContext: vi.fn((_type: string, opts?: Record<string, unknown>) => {
        callOrder.push(`exportCanvas.getContext:${JSON.stringify(opts ?? null)}`);
        return mock2d.ctx;
      }),
      captureStream: captureStreamSpy
    };

    let createdCount = 0;
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') {
          createdCount++;
          if (createdCount === 1) {
            return exportCanvas as unknown as HTMLCanvasElement;
          }
          // Helper offscreen canvases used inside StadiumRenderer caches
          return {
            width: 0,
            height: 0,
            style: {} as Record<string, string>,
            getContext: vi.fn(() => makeMockCanvas2dContext().ctx)
          } as unknown as HTMLCanvasElement;
        }
        return {} as HTMLElement;
      })
    });
    vi.stubGlobal('window', {
      devicePixelRatio: 2.5
    });

    const renderFixedSpy = vi
      .spyOn(GameRenderer.prototype, 'renderAtFixedStep')
      .mockImplementation(() => {
        callOrder.push('renderAtFixedStep');
      });

    let capturedOptions: Record<string, unknown> | undefined;
    const origSetTheme = GameRenderer.prototype.setTheme;
    const setThemeSpy = vi.spyOn(GameRenderer.prototype, 'setTheme').mockImplementation(function (this: GameRenderer, theme) {
      callOrder.push(`setTheme:${theme}`);
      return origSetTheme.call(this, theme);
    });

    class FakeMediaRecorder {
      static isTypeSupported = () => true;
      public state = 'inactive';
      public ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      public onstop: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      start() {
        this.state = 'recording';
        callOrder.push('recorder.start');
      }
      stop() {
        this.state = 'inactive';
        callOrder.push('recorder.stop');
        this.ondataavailable?.({ data: new Blob(['webm-bytes'], { type: 'video/webm' }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    // Also spy on resize & applyReplayRendererConfig target instance via constructor wrap? Check options via mock2d getContext + renderer side effects
    const res = await exportReplayToWebm(replay);
    expect(res.mimeType).toContain('video/webm');
    expect(res.blob.size).toBeGreaterThan(0);

    // 1. NEVER call exportCanvas.getContext('2d') before GameRenderer initializes { alpha: false }
    const exportCtxCalls = callOrder.filter((c) => c.startsWith('exportCanvas.getContext:'));
    expect(exportCtxCalls).toEqual(['exportCanvas.getContext:{"alpha":false}']);
    // overrideDpr = 1 prevents HiDPI scaling (window.devicePixelRatio = 2.5 would otherwise balloon or crop canvas)
    expect(exportCanvas.width).toBe(REPLAY_STAGE_WIDTH);
    expect(exportCanvas.height).toBe(REPLAY_STAGE_HEIGHT);

    // 2. Recorded theme ('light') applied
    expect(setThemeSpy).toHaveBeenCalledWith('light');

    // 3. Paint Frame 0 BEFORE recorder.start()
    const firstRenderIdx = callOrder.indexOf('renderAtFixedStep');
    const recorderStartIdx = callOrder.indexOf('recorder.start');
    expect(firstRenderIdx).toBeGreaterThanOrEqual(0);
    expect(recorderStartIdx).toBeGreaterThan(firstRenderIdx);

    // 4. Deterministic captureStream(0) + requestFrame() per virtual 1/60s step
    expect(captureStreamSpy).toHaveBeenCalledWith(0);
    // totalDuration = 0.5 minimum clamp in exportReplayToWebm -> ceil(0.5 * 60) = 30 steps + Frame 0 = 31 frames!
    expect(renderFixedSpy.mock.calls.length).toBeGreaterThanOrEqual(30);
    expect(renderFixedSpy.mock.calls[0]![4]).toBeCloseTo(1 / 60, 6);
    expect(requestFrameSpy).toHaveBeenCalledTimes(renderFixedSpy.mock.calls.length);
    void capturedOptions;
  });

  it('applies recorded theme, ball skin, minimap size/opacity/frustum & overrideDpr in renderer config + ReplayViewerModal markup', () => {
    const replay = makeSampleV3Replay();
    const { ctx } = makeMockCanvas2dContext();
    const fakeCanvas = {
      width: 1280,
      height: 720,
      style: {} as Record<string, string>,
      getContext: vi.fn(() => ctx)
    } as unknown as HTMLCanvasElement;

    const renderer = new GameRenderer(fakeCanvas, {
      stadium: { width: 840, height: 400, goalWidth: 130, goalDepth: 50, corners: 50 } as never,
      overrideDpr: 1
    });
    expect(renderer.overrideDpr).toBe(1);

    applyReplayRendererConfig(renderer, replay, 0);
    expect(renderer.theme).toBe('light');
    expect(renderer.discRenderer.ballSkin).toBe('wc2022');
    expect(renderer.minimapEnabled).toBe(true);
    expect(renderer.minimapOpacity).toBe(0.72);
    expect(renderer.minimapSize).toBe(220);
    expect(renderer.minimapCameraFrustum).toBe(false);
    renderer.destroy();

    const modalSrc = readFileSync(
      resolve(__dirname, '../../src/ui/modals/ReplayViewerModal.svelte'),
      'utf8'
    );
    expect(modalSrc).toContain('<MatchScoreboard');
    expect(modalSrc).toContain('<KitPatternBadge');
    expect(modalSrc).toContain('class:is-ranked={hudRoomType === \'ranked\'}');
    expect(modalSrc).toContain('hud-top-right-card');
    expect(modalSrc).toContain('hud-telemetry-corner');
    expect(modalSrc).toContain('hud-sliding-event-container');
    expect(modalSrc).toContain('goal-replay-pill');
    expect(modalSrc).toContain('hud-ui-overlay-panel');
    expect(modalSrc).not.toMatch(/backdrop-filter\s*:\s*blur/i);

    const { html } = render(ReplayViewerModal);
    expect(html).toContain('role="dialog"');
  });

  it('prevents stuck MENÚ DE SALA when overlay is NONE even if activeSlide is MENU, keeps long-lived chat, and syncs phase transitions', () => {
    expect(resolveReplayOverlayView({ overlay: 'NONE', activeSlide: 'MENU', isPaused: false, postMatchStats: null })).toBe('NONE');
    expect(resolveReplayOverlayView({ overlay: 'TEAM_MANAGEMENT', activeSlide: 'MENU', isPaused: false, postMatchStats: null })).toBe('MENU');
    expect(resolveReplayOverlayView({ overlay: 'TEAM_MANAGEMENT', activeSlide: 'STATS', isPaused: false, postMatchStats: null })).toBe('STATS');
    expect(resolveReplayOverlayView({ overlay: 'STATS', activeSlide: 'MENU', isPaused: false, postMatchStats: null })).toBe('STATS');

    const replay = makeSampleV3Replay({
      initialUiOverlay: { overlay: 'NONE', activeSlide: 'MENU', isPaused: false, postMatchStats: null },
      hudEvents: [{ t: 0.1, type: 'telemetry', payload: { pingMs: 12, fps: 60 } }],
      chatMessages: [
        { t: 0, kind: 'system', sender: 'Sala', text: 'Inicio' },
        { t: 2, kind: 'chat', sender: 'Ace', senderTeam: 'RED', text: 'Mensaje antiguo' }
      ]
    });
    const mock = makeMockCanvas2dContext();
    const state = deriveReplayHudTimelineState(replay, replay.frames[1]!, 45.0);
    renderReplayHudOverlay(mock.ctx, state, REPLAY_STAGE_WIDTH, REPLAY_STAGE_HEIGHT);

    // Must NEVER draw room menu when overlay === 'NONE'
    expect(mock.fillTexts.some((t) => t.includes('MENÚ DE SALA'))).toBe(false);
    // Telemetry keeps Ping & FPS separated
    expect(mock.fillTexts).toContain('Ping:');
    expect(mock.fillTexts).toContain('12ms');
    // Default chat view does not vanish after 18s; finite maxAgeSec still filters when requested
    expect(mock.fillTexts.some((t) => t.includes('Mensaje antiguo'))).toBe(true);
    expect(getVisibleReplayChat(replay.chatMessages, 45.0, 18)).toEqual([]);

    // gameUI phase transitions emit ui_overlay changes
    const prevCallback = gameUI.onHudStateChange;
    const events: Array<{ kind: string; detail: Record<string, unknown> }> = [];
    gameUI.currentScreen = 'IN_GAME';
    gameUI.hasJoinedInitialSync = false;
    gameUI.previousMatchPhase = 0;
    gameUI.activeModal = 'TEAM_MANAGEMENT';
    gameUI.activeSlide = 'MENU';
    gameUI.onHudStateChange = (kind, detail) => {
      events.push({ kind, detail });
    };
    try {
      gameUI.handleMatchPhaseTransition(0, true);
      gameUI.handleMatchPhaseTransition(2);
      gameUI.handleMatchPhaseTransition(5);
      expect(events.some((e) => e.kind === 'ui_overlay' && e.detail.activeModal === 'NONE')).toBe(true);
      expect(events.some((e) => e.kind === 'ui_overlay' && e.detail.activeModal === 'STATS')).toBe(true);
    } finally {
      gameUI.onHudStateChange = prevCallback;
      gameUI.activeModal = 'NONE';
      gameUI.hasJoinedInitialSync = false;
      gameUI.currentScreen = 'LOBBY';
    }
  });

  it('muxes deterministic EBML/WebM containers with Info Duration, multiple Clusters, and Cues index', async () => {
    const muxer = new WebmMuxer({ width: 1280, height: 720, fps: 60, codec: 'V_VP8' });
    muxer.addVideoFrame(new Uint8Array([1, 2, 3, 4]), true, 0);
    muxer.addVideoFrame(new Uint8Array([5, 6, 7]), false, 16_667);
    // Cross the 30s cluster ceiling to force a second Cluster + Cues entry
    muxer.addVideoFrame(new Uint8Array([8, 9, 10, 11]), true, 32_000_000);
    const blob = muxer.finalize();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // EBML header magic
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    const textSig = new TextDecoder('latin1').decode(bytes);
    expect(textSig).toContain('webm');
    expect(textSig).toContain('V_VP8');

    // Count Cluster EBML IDs [0x1F, 0x43, 0xB6, 0x75] and verify Cues [0x1C, 0x53, 0xBB, 0x6B]
    let clusterCount = 0;
    let hasCues = false;
    for (let i = 0; i <= bytes.length - 4; i++) {
      if (bytes[i] === 0x1f && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xb6 && bytes[i + 3] === 0x75) {
        clusterCount++;
      }
      if (bytes[i] === 0x1c && bytes[i + 1] === 0x53 && bytes[i + 2] === 0xbb && bytes[i + 3] === 0x6b) {
        hasCues = true;
      }
    }
    expect(clusterCount).toBe(2);
    expect(hasCues).toBe(true);

    // Verify backpatched Info Duration float64 immediately after [0x44, 0x89, 0x88] matches > 32,000 ms
    let encodedDurationMs = 0;
    for (let i = 0; i <= bytes.length - 11; i++) {
      if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) {
        encodedDurationMs = new DataView(bytes.buffer, bytes.byteOffset + i + 3, 8).getFloat64(0, false);
        break;
      }
    }
    expect(encodedDurationMs).toBeGreaterThan(32_000);
    expect(encodedDurationMs).toBeLessThan(32_100);
  });

  it('prefers WebCodecs VideoEncoder + WebmMuxer when available with exact 1/60s deterministic timestamps', async () => {
    const replay = makeSampleV3Replay({ durationSeconds: 0.05 });
    const mock2d = makeMockCanvas2dContext();
    const exportCanvas = {
      width: 0,
      height: 0,
      style: {} as Record<string, string>,
      getContext: vi.fn(() => mock2d.ctx),
      captureStream: vi.fn()
    };

    let created = 0;
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') {
          created++;
          return (created === 1
            ? exportCanvas
            : {
                width: 0,
                height: 0,
                style: {} as Record<string, string>,
                getContext: vi.fn(() => makeMockCanvas2dContext().ctx)
              }) as unknown as HTMLCanvasElement;
        }
        return {} as HTMLElement;
      })
    });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.spyOn(GameRenderer.prototype, 'renderAtFixedStep').mockImplementation(() => {});

    const encodedTimestamps: number[] = [];
    const encodedKeyFlags: boolean[] = [];

    class FakeVideoFrame {
      public readonly timestamp: number;
      public readonly duration: number;
      public closed = false;
      constructor(_source: unknown, init: { timestamp: number; duration: number }) {
        this.timestamp = init.timestamp;
        this.duration = init.duration;
      }
      close() {
        this.closed = true;
      }
    }

    class FakeVideoEncoder {
      static async isConfigSupported(cfg: { codec: string }) {
        return { supported: cfg.codec === 'vp09.00.41.08', config: cfg };
      }
      public state: 'unconfigured' | 'configured' | 'closed' = 'unconfigured';
      public encodeQueueSize = 0;
      private readonly outputCb: (chunk: unknown) => void;
      constructor(init: { output: (chunk: unknown) => void; error: (err: unknown) => void }) {
        this.outputCb = init.output;
      }
      configure() {
        this.state = 'configured';
      }
      encode(frame: FakeVideoFrame, opts?: { keyFrame?: boolean }) {
        encodedTimestamps.push(frame.timestamp);
        encodedKeyFlags.push(Boolean(opts?.keyFrame));
        this.outputCb({
          byteLength: 16,
          type: opts?.keyFrame ? 'key' : 'delta',
          timestamp: frame.timestamp,
          copyTo(dst: Uint8Array) {
            dst.fill(0x55);
          }
        });
      }
      async flush() {}
      close() {
        this.state = 'closed';
      }
    }

    vi.stubGlobal('VideoFrame', FakeVideoFrame);
    vi.stubGlobal('VideoEncoder', FakeVideoEncoder);

    const res = await exportReplayToWebm(replay);
    expect(res.mimeType).toBe('video/webm;codecs=vp9');
    expect(exportCanvas.captureStream).not.toHaveBeenCalled();
    expect(encodedTimestamps.length).toBeGreaterThanOrEqual(31);
    expect(encodedTimestamps[0]).toBe(0);
    expect(encodedTimestamps[1]).toBe(16667);
    expect(encodedTimestamps[2]).toBe(33333);
    expect(encodedTimestamps[3]).toBe(50000);
    expect(encodedKeyFlags[0]).toBe(true);

    const header = new Uint8Array(await res.blob.arrayBuffer()).slice(0, 4);
    expect(Array.from(header)).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  });
});
