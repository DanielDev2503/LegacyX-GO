import { createStadium, MatchPhase, type GameStateSnapshot, type StadiumId } from '@legacyx/core';
import { drawBallDesign, type BallSkin } from '../renderer/ballDesigns.js';
import { GameRenderer } from '../renderer/GameRenderer.js';
import type { PlayerVisualInfo } from '../renderer/DiscRenderer.js';
import { drawKitPatternCanvas } from '../ui/utils/kitPatterns.js';
import type {
  LxrBannerEvent,
  LxrBannerPayload,
  LxrBallSkin,
  LxrChatEntry,
  LxrFrame,
  LxrReplayFile,
  LxrReplayV2,
  LxrReplayV3,
  LxrRoomType,
  LxrScoreboardDesign,
  LxrScoreEventPayload,
  LxrTelemetryPayload,
  LxrTheme,
  LxrUiOverlayState
} from './MatchRecorder.svelte.js';

export const REPLAY_STAGE_WIDTH = 1280;
export const REPLAY_STAGE_HEIGHT = 720;
export const EXPORT_FIXED_FPS = 60;
const EXPORT_FIXED_DT_SEC = 1 / EXPORT_FIXED_FPS;
const SCORE_EVENT_DURATION_SEC = 2.6;

export interface ReplaySlidingScoreEventView extends LxrScoreEventPayload {
  t: number;
  pointsText: string;
  accentColor: string;
}

export interface ReplayHudOverlayState {
  roomName: string;
  phase: number;
  matchTimer: number;
  redScore: number;
  blueScore: number;
  isGoldenGoal: boolean;
  redAcronym: string;
  blueAcronym: string;
  redColor: string;
  blueColor: string;
  chatMessages: LxrChatEntry[];
  activeBanner: LxrBannerPayload | null;
  currentTimeSec: number;
  timeLimitSeconds?: number;
  roomType?: LxrRoomType;
  scoreboardDesign?: LxrScoreboardDesign;
  theme?: LxrTheme;
  ballMode?: 'texture' | 'color';
  ballSkin?: LxrBallSkin;
  ballCustomColor?: string;
  redKit?: Record<string, unknown>;
  blueKit?: Record<string, unknown>;
  chatOpacity?: number;
  minimapEnabled?: boolean;
  minimapOpacity?: number;
  minimapSize?: number;
  minimapCameraFrustum?: boolean;
  telemetry?: LxrTelemetryPayload | null;
  slidingEvents?: ReplaySlidingScoreEventView[];
  uiOverlay?: LxrUiOverlayState | null;
  isGoalReplay?: boolean;
  showExtendedHud?: boolean;
}

export interface ReplayTimelineHudState extends ReplayHudOverlayState {
  roomType: LxrRoomType;
  scoreboardDesign: LxrScoreboardDesign;
  theme: LxrTheme;
  ballMode: 'texture' | 'color';
  ballSkin: LxrBallSkin;
  ballCustomColor: string;
  redKit: Record<string, unknown>;
  blueKit: Record<string, unknown>;
  chatOpacity: number;
  minimapEnabled: boolean;
  minimapOpacity: number;
  minimapSize: number;
  minimapCameraFrustum: boolean;
  telemetry: LxrTelemetryPayload;
  slidingEvents: ReplaySlidingScoreEventView[];
  uiOverlay: LxrUiOverlayState;
  isWarning30s: boolean;
  isGoalReplay: boolean;
  showExtendedHud: boolean;
}

export interface WebmExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export function normalizeReplayOpacity(raw: unknown, fallback: number = 0.85): number {
  const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  const scaled = num > 1 ? num / 100 : num;
  return Math.max(0.15, Math.min(1, scaled));
}

export function normalizeReplayMinimapSize(raw: unknown, fallback: number = 190): number {
  const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return Math.max(120, Math.min(320, Math.round(num)));
}

export function isReplayTimerWarning(
  matchTimer: number,
  phase: number,
  isGoldenGoal: boolean
): boolean {
  return (
    matchTimer > 0 &&
    matchTimer <= 30 &&
    !isGoldenGoal &&
    (phase === MatchPhase.PLAYING ||
      phase === MatchPhase.KICKOFF ||
      phase === MatchPhase.GOAL ||
      phase === MatchPhase.START_COUNTDOWN ||
      phase === MatchPhase.RESUME_COUNTDOWN)
  );
}

export function computeReplayEffectiveZoom(
  savedZoom: number,
  recordedWidth: number,
  recordedHeight: number,
  stageWidth: number = REPLAY_STAGE_WIDTH,
  stageHeight: number = REPLAY_STAGE_HEIGHT
): number {
  const safeZoom =
    typeof savedZoom === 'number' && Number.isFinite(savedZoom) && savedZoom > 0
      ? Math.min(2.5, Math.max(0.35, savedZoom))
      : 1.0;
  const refW =
    typeof recordedWidth === 'number' && Number.isFinite(recordedWidth) && recordedWidth > 0
      ? recordedWidth
      : REPLAY_STAGE_WIDTH;
  const refH =
    typeof recordedHeight === 'number' && Number.isFinite(recordedHeight) && recordedHeight > 0
      ? recordedHeight
      : REPLAY_STAGE_HEIGHT;
  const stW =
    typeof stageWidth === 'number' && Number.isFinite(stageWidth) && stageWidth > 0
      ? stageWidth
      : REPLAY_STAGE_WIDTH;
  const stH =
    typeof stageHeight === 'number' && Number.isFinite(stageHeight) && stageHeight > 0
      ? stageHeight
      : REPLAY_STAGE_HEIGHT;

  const fitScale = Math.min(stW / refW, stH / refH);
  return Math.max(0.2, Math.min(3.0, Math.round(safeZoom * fitScale * 10000) / 10000));
}

function defaultRedKit(): Record<string, unknown> {
  return {
    name: 'Red',
    tag: 'RED',
    primaryColor: '#ef4444',
    secondaryColor: '#991b1b',
    tertiaryColor: '#ffffff',
    pattern: 'solid',
    hasOutline: true
  };
}

function defaultBlueKit(): Record<string, unknown> {
  return {
    name: 'Blue',
    tag: 'BLUE',
    primaryColor: '#3b82f6',
    secondaryColor: '#1e40af',
    tertiaryColor: '#ffffff',
    pattern: 'solid',
    hasOutline: true
  };
}

function normalizeKitRecord(
  kit: Record<string, unknown> | undefined,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const base = kit ? { ...fallback, ...kit } : { ...fallback };
  const tertiaryColor = String(base.tertiaryColor || base.textColor || base.borderColor || '#ffffff');
  const hasOutline =
    typeof base.hasOutline === 'boolean'
      ? base.hasOutline
      : typeof base.outline === 'boolean'
        ? base.outline
        : true;
  return {
    ...base,
    tertiaryColor,
    textColor: tertiaryColor,
    outlineColor: hasOutline ? '#000000' : tertiaryColor,
    hasOutline,
    outline: hasOutline,
    pattern: String(base.pattern || 'solid')
  };
}

export function getActiveReplayKitsAtTime(
  replay: LxrReplayFile,
  currentTimeSec: number
): { redKit: Record<string, unknown>; blueKit: Record<string, unknown> } {
  let redKit = normalizeKitRecord(replay.redKit, defaultRedKit());
  let blueKit = normalizeKitRecord(replay.blueKit, defaultBlueKit());
  if (replay.magic === 'LXR3' && Array.isArray((replay as LxrReplayV3).hudEvents)) {
    for (const ev of (replay as LxrReplayV3).hudEvents) {
      if (ev.t > currentTimeSec) break;
      if (ev.type === 'kits_updated') {
        if (ev.payload.redKit) redKit = normalizeKitRecord(ev.payload.redKit, redKit);
        if (ev.payload.blueKit) blueKit = normalizeKitRecord(ev.payload.blueKit, blueKit);
      }
    }
  }
  return { redKit, blueKit };
}

export function buildReplayPlayerInfos(
  replay: LxrReplayFile,
  overrideKits?: { redKit?: Record<string, unknown>; blueKit?: Record<string, unknown> }
): Map<number, PlayerVisualInfo> {
  const playerInfos = new Map<number, PlayerVisualInfo>();
  const redKit = normalizeKitRecord(overrideKits?.redKit ?? replay.redKit, defaultRedKit());
  const blueKit = normalizeKitRecord(overrideKits?.blueKit ?? replay.blueKit, defaultBlueKit());

  for (const p of replay.players || []) {
    const kit = p.team === 'red' ? redKit : p.team === 'blue' ? blueKit : undefined;
    const tertiaryColor = kit ? String(kit.tertiaryColor || kit.textColor || '#ffffff') : '#ffffff';
    const hasOutline = kit ? kit.hasOutline !== false : true;
    playerInfos.set(p.id, {
      nickname: p.nickname,
      number: p.number ?? p.id,
      avatar: p.avatar || String(p.id),
      avatarType: (p.avatarType as 'emoji' | 'text' | 'letters') || 'letters',
      hasOutline,
      outlineColor: hasOutline ? '#000000' : tertiaryColor,
      tertiaryColor,
      kit: kit as PlayerVisualInfo['kit']
    });
  }
  return playerInfos;
}

export function applyReplayRendererKits(
  renderer: GameRenderer,
  replay: LxrReplayFile,
  kits: { redKit: Record<string, unknown>; blueKit: Record<string, unknown> }
): void {
  renderer.setTeamKits(
    kits.redKit as unknown as Parameters<GameRenderer['setTeamKits']>[0],
    kits.blueKit as unknown as Parameters<GameRenderer['setTeamKits']>[1]
  );
  if (renderer.discRenderer) {
    renderer.discRenderer.playerInfos = buildReplayPlayerInfos(replay, kits);
  }
}

export function applyReplayRendererConfig(
  renderer: GameRenderer,
  replay: LxrReplayFile,
  currentTimeSec: number = 0
): void {
  const v3 = replay.magic === 'LXR3' ? (replay as LxrReplayV3) : null;
  const theme: LxrTheme = v3?.theme === 'light' ? 'light' : 'dark';
  const ballMode: 'texture' | 'color' = v3?.ballMode === 'color' ? 'color' : 'texture';
  const ballSkin: LxrBallSkin = v3?.ballSkin || 'classic';
  const ballCustomColor = v3?.ballCustomColor || '#ffffff';
  const minimapEnabled = v3 ? v3.minimapEnabled !== false : true;
  const minimapOpacity = normalizeReplayOpacity(v3?.minimapOpacity, 0.65);
  const minimapSize = normalizeReplayMinimapSize(v3?.minimapSize, 190);
  const minimapCameraFrustum = v3 ? v3.minimapCameraFrustum !== false : true;

  const rendererAny = renderer as unknown as {
    setTheme?: (t: LxrTheme) => void;
    theme?: LxrTheme;
    minimapRenderer?: {
      setSettings?: (s: {
        minimapEnabled?: boolean;
        minimapOpacity?: number;
        minimapSize?: number;
        minimapCameraFrustum?: boolean;
      }) => void;
    };
    stadiumRenderer?: {
      theme?: LxrTheme;
      invalidateCache?: () => void;
    };
    discRenderer?: {
      theme?: LxrTheme;
      ballMode?: 'texture' | 'color';
      ballSkin?: string;
      ballCustomColor?: string;
      redKit?: unknown;
      blueKit?: unknown;
    };
  };

  if (typeof rendererAny.setTheme === 'function') {
    rendererAny.setTheme(theme);
  } else {
    rendererAny.theme = theme;
    if (rendererAny.stadiumRenderer) {
      rendererAny.stadiumRenderer.theme = theme;
      rendererAny.stadiumRenderer.invalidateCache?.();
    }
    if (rendererAny.discRenderer) {
      rendererAny.discRenderer.theme = theme;
    }
  }

  if (rendererAny.discRenderer) {
    rendererAny.discRenderer.ballMode = ballMode;
    rendererAny.discRenderer.ballSkin = ballSkin;
    rendererAny.discRenderer.ballCustomColor = ballCustomColor;
  }

  renderer.safeAreaBottom = 0;
  renderer.chatHeight = 0;
  renderer.minimapEnabled = minimapEnabled;
  renderer.minimapOpacity = minimapOpacity;
  renderer.minimapSize = minimapSize;
  renderer.minimapCameraFrustum = minimapCameraFrustum;
  rendererAny.minimapRenderer?.setSettings?.({
    minimapEnabled,
    minimapOpacity,
    minimapSize,
    minimapCameraFrustum
  });

  const kits = getActiveReplayKitsAtTime(replay, currentTimeSec);
  applyReplayRendererKits(renderer, replay, kits);
}

export function sampleReplayFrame(
  frames: LxrFrame[],
  currentTimeSec: number
): { f0: LxrFrame; f1: LxrFrame; alpha: number; index: number } {
  let idx = 0;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.t <= currentTimeSec) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const f0 = frames[idx]!;
  const f1 = frames[Math.min(frames.length - 1, idx + 1)]!;
  const span = f1.t - f0.t;
  const alpha = span > 0.0001 ? Math.max(0, Math.min(1, (currentTimeSec - f0.t) / span)) : 1.0;
  return { f0, f1, alpha, index: idx };
}

export function getTimelineChatMessages(replay: LxrReplayFile): LxrChatEntry[] {
  if (replay.magic === 'LXR3') {
    const v3 = replay as LxrReplayV3;
    const combined: LxrChatEntry[] = [];
    const seen = new Set<string>();
    const pushEntry = (entry: LxrChatEntry) => {
      const key = `${Math.round(entry.t * 1000)}|${entry.kind}|${entry.sender}|${entry.text}`;
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(entry);
    };
    for (const c of v3.initialChatMessages || []) pushEntry(c);
    for (const c of v3.chatMessages || []) pushEntry(c);
    for (const ev of v3.hudEvents || []) {
      if (ev.type === 'chat') {
        pushEntry({
          t: ev.t,
          kind: ev.payload.kind,
          sender: ev.payload.sender,
          senderTeam: ev.payload.senderTeam,
          text: ev.payload.text
        });
      }
    }
    combined.sort((a, b) => a.t - b.t);
    return combined;
  }
  if (replay.magic === 'LXR2') {
    return (replay as LxrReplayV2).chatMessages ?? [];
  }
  return [];
}

export function getTimelineBanners(replay: LxrReplayFile): LxrBannerEvent[] {
  if (replay.magic === 'LXR3') {
    const v3 = replay as LxrReplayV3;
    const out: LxrBannerEvent[] = [];
    const seen = new Set<string>();
    const pushBanner = (b: LxrBannerEvent) => {
      const key = `${Math.round(b.t * 1000)}|${b.payload.kind}|${b.payload.label || ''}|${b.payload.count ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(b);
    };
    for (const b of v3.banners || []) pushBanner(b);
    for (const ev of v3.hudEvents || []) {
      if (ev.type === 'banner') {
        pushBanner({ t: ev.t, payload: ev.payload });
      }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  if (replay.magic === 'LXR2') {
    return (replay as LxrReplayV2).banners ?? [];
  }
  return [];
}

export function getVisibleReplayChat(
  chatMessages: LxrChatEntry[] | undefined,
  currentTimeSec: number,
  maxAgeSec: number = 18,
  maxLines: number = 6
): LxrChatEntry[] {
  if (!Array.isArray(chatMessages) || chatMessages.length === 0) return [];
  const minTime = currentTimeSec - maxAgeSec;
  const visible = chatMessages.filter((entry) => entry.t <= currentTimeSec && entry.t >= minTime);
  return visible.slice(-maxLines);
}

function defaultBannerDurationSec(payload: LxrBannerPayload): number {
  if (typeof payload.durationMs === 'number' && payload.durationMs > 0) {
    return payload.durationMs / 1000;
  }
  switch (payload.kind) {
    case 'PAUSED':
      return Number.POSITIVE_INFINITY;
    case 'VICTORY':
      return 5.5;
    case 'GOAL_REPLAY':
      return 4.2;
    case 'GOAL':
      return 2.6;
    case 'VS':
      return 2.4;
    case 'COUNTDOWN':
      return 1.1;
    default:
      return 0;
  }
}

export function getActiveReplayBanner(
  banners: LxrBannerEvent[] | undefined,
  currentTimeSec: number
): LxrBannerPayload | null {
  if (!Array.isArray(banners) || banners.length === 0) return null;
  let latest: LxrBannerEvent | null = null;
  for (const b of banners) {
    if (b.t <= currentTimeSec) {
      if (!latest || b.t >= latest.t) latest = b;
    }
  }
  if (!latest || latest.payload.kind === 'NONE') return null;
  const dur = defaultBannerDurationSec(latest.payload);
  if (currentTimeSec - latest.t > dur) return null;
  return latest.payload;
}

export function getActiveTelemetryAtTime(
  replay: LxrReplayFile,
  currentTimeSec: number
): LxrTelemetryPayload {
  let latest: LxrTelemetryPayload = { pingMs: 0, fps: 60 };
  if (replay.magic === 'LXR3') {
    for (const ev of (replay as LxrReplayV3).hudEvents || []) {
      if (ev.t > currentTimeSec) break;
      if (ev.type === 'telemetry') {
        latest = {
          pingMs: Math.max(0, Math.round(ev.payload.pingMs)),
          fps: Math.max(1, Math.round(ev.payload.fps))
        };
      }
    }
  }
  return latest;
}

export function getActiveSlidingScoreEvents(
  replay: LxrReplayFile,
  currentTimeSec: number
): ReplaySlidingScoreEventView[] {
  if (replay.magic !== 'LXR3') return [];
  const minTime = currentTimeSec - SCORE_EVENT_DURATION_SEC;
  const events: ReplaySlidingScoreEventView[] = [];
  for (const ev of (replay as LxrReplayV3).hudEvents || []) {
    if (ev.t > currentTimeSec) break;
    if (ev.type === 'score_event' && ev.t >= minTime) {
      const p = ev.payload;
      const points = Number.isFinite(p.points) ? Math.round(p.points) : 0;
      const accentColor =
        p.color ||
        (p.team === 'red' ? '#ef4444' : p.team === 'blue' ? '#3b82f6' : '#38bdf8');
      events.push({
        ...p,
        t: ev.t,
        pointsText: points >= 0 ? `+${points}` : String(points),
        accentColor
      });
    }
  }
  return events.slice(-3);
}

export function getActiveUiOverlayAtTime(
  replay: LxrReplayFile,
  currentTimeSec: number
): LxrUiOverlayState {
  const base: LxrUiOverlayState =
    replay.magic === 'LXR3' && (replay as LxrReplayV3).initialUiOverlay
      ? {
          ...(replay as LxrReplayV3).initialUiOverlay!,
          postMatchStats: (replay as LxrReplayV3).initialUiOverlay?.postMatchStats
            ? { ...(replay as LxrReplayV3).initialUiOverlay!.postMatchStats! }
            : null
        }
      : { overlay: 'NONE', activeSlide: 'GAME', isPaused: false, postMatchStats: null };

  let current = base;
  if (replay.magic === 'LXR3') {
    for (const ev of (replay as LxrReplayV3).hudEvents || []) {
      if (ev.t > currentTimeSec) break;
      if (ev.type === 'ui_overlay') {
        current = {
          overlay: ev.payload.overlay || 'NONE',
          activeSlide: ev.payload.activeSlide || 'GAME',
          isPaused: Boolean(ev.payload.isPaused),
          postMatchStats: ev.payload.postMatchStats ? { ...ev.payload.postMatchStats } : null
        };
      }
    }
  }
  return current;
}

export function deriveReplayHudTimelineState(
  replay: LxrReplayFile,
  f0: LxrFrame,
  currentTimeSec: number
): ReplayTimelineHudState {
  const isV3 = replay.magic === 'LXR3';
  const v3 = isV3 ? (replay as LxrReplayV3) : null;
  const v2 = replay.magic === 'LXR2' ? (replay as LxrReplayV2) : null;

  const { redKit, blueKit } = getActiveReplayKitsAtTime(replay, currentTimeSec);
  const phase = f0.snapshot.phase;
  const matchTimer = f0.snapshot.matchTimer ?? 0;
  const isGoldenGoal = Boolean(f0.snapshot.isGoldenGoal);
  const activeBanner = getActiveReplayBanner(getTimelineBanners(replay), currentTimeSec);
  const goalReplayPhase = (MatchPhase as unknown as Record<string, number>).GOAL_REPLAY ?? 3.5;
  const isGoalReplay =
    phase === goalReplayPhase || phase === 3.5 || activeBanner?.kind === 'GOAL_REPLAY';
  const effectiveBanner: LxrBannerPayload | null =
    activeBanner ??
    (phase === goalReplayPhase || phase === 3.5
      ? { kind: 'GOAL_REPLAY', label: 'REPETICIÓN DEL GOL' }
      : null);

  return {
    roomName: replay.roomName || 'Repetición LegacyX-GO',
    phase,
    matchTimer,
    redScore: f0.snapshot.redScore ?? replay.redScore ?? 0,
    blueScore: f0.snapshot.blueScore ?? replay.blueScore ?? 0,
    isGoldenGoal,
    redAcronym: String(redKit.tag || 'RED').slice(0, 6),
    blueAcronym: String(blueKit.tag || 'BLUE').slice(0, 6),
    redColor: String(redKit.primaryColor || '#ef4444'),
    blueColor: String(blueKit.primaryColor || '#3b82f6'),
    chatMessages: getTimelineChatMessages(replay),
    activeBanner: effectiveBanner,
    currentTimeSec,
    timeLimitSeconds: v3?.timeLimitSeconds ?? v2?.timeLimitSeconds,
    roomType: v3?.roomType === 'ranked' ? 'ranked' : 'casual',
    scoreboardDesign: v3?.scoreboardDesign || 'original',
    theme: v3?.theme === 'light' ? 'light' : 'dark',
    ballMode: v3?.ballMode === 'color' ? 'color' : 'texture',
    ballSkin: v3?.ballSkin || 'classic',
    ballCustomColor: v3?.ballCustomColor || '#ffffff',
    redKit,
    blueKit,
    chatOpacity: normalizeReplayOpacity(v3?.chatOpacity, 0.95),
    minimapEnabled: v3 ? v3.minimapEnabled !== false : true,
    minimapOpacity: normalizeReplayOpacity(v3?.minimapOpacity, 0.6),
    minimapSize: normalizeReplayMinimapSize(v3?.minimapSize, 190),
    minimapCameraFrustum: v3 ? v3.minimapCameraFrustum !== false : true,
    telemetry: getActiveTelemetryAtTime(replay, currentTimeSec),
    slidingEvents: getActiveSlidingScoreEvents(replay, currentTimeSec),
    uiOverlay: getActiveUiOverlayAtTime(replay, currentTimeSec),
    isWarning30s: isReplayTimerWarning(matchTimer, phase, isGoldenGoal),
    isGoalReplay,
    showExtendedHud: isV3
  };
}

export function deriveHudOverlayStateFromReplay(
  replay: LxrReplayFile,
  f0: LxrFrame,
  currentTimeSec: number
): ReplayTimelineHudState {
  return deriveReplayHudTimelineState(replay, f0, currentTimeSec);
}

function formatClock(sec: number): string {
  const clamped = Math.max(0, Math.ceil(sec));
  const mins = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const rem = (clamped % 60).toString().padStart(2, '0');
  return `${mins}:${rem}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function resolveKitPatternInput(
  kit: Record<string, unknown> | undefined,
  fallbackColor: string
): {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  pattern: string;
  hasOutline: boolean;
} {
  const primaryColor = String(kit?.primaryColor || fallbackColor);
  const secondaryColor = String(kit?.secondaryColor || primaryColor);
  const tertiaryColor = String(kit?.tertiaryColor || kit?.textColor || '#ffffff');
  const hasOutline =
    typeof kit?.hasOutline === 'boolean'
      ? kit.hasOutline
      : typeof kit?.outline === 'boolean'
        ? kit.outline
        : true;
  return {
    primaryColor,
    secondaryColor,
    tertiaryColor,
    pattern: String(kit?.pattern || 'solid'),
    hasOutline
  };
}

function drawPatternFilledRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  kit: Record<string, unknown> | undefined,
  fallbackColor: string
): void {
  const resolved = resolveKitPatternInput(kit, fallbackColor);
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.clip();
  drawKitPatternCanvas(
    ctx,
    x,
    y,
    w,
    h,
    resolved as Parameters<typeof drawKitPatternCanvas>[5]
  );
  ctx.restore();

  if (resolved.hasOutline) {
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    ctx.restore();
  }
}

function drawKitLabelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  kit: Record<string, unknown> | undefined,
  align: CanvasTextAlign
): void {
  const resolved = resolveKitPatternInput(kit, '#ffffff');
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = '800 13px Inter, system-ui, sans-serif';
  if (resolved.hasOutline && typeof ctx.strokeText === 'function') {
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = resolved.tertiaryColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawRoomCard(
  ctx: CanvasRenderingContext2D,
  roomName: string,
  roomType: LxrRoomType = 'casual'
): void {
  const isRanked = roomType === 'ranked';
  ctx.save();
  ctx.font = '700 13px Inter, system-ui, sans-serif';
  const label = (roomName || 'Sala LegacyX-GO').slice(0, 32);
  const textWidth = ctx.measureText(label).width;
  const extraWidth = isRanked ? 58 : 0;
  const width = Math.max(150, Math.min(340, textWidth + 52 + extraWidth));

  drawRoundedRect(ctx, 16, 10, width, 40, 12);
  ctx.fillStyle = isRanked ? 'rgba(66, 32, 6, 0.92)' : 'rgba(11, 15, 25, 0.86)';
  ctx.fill();
  ctx.lineWidth = isRanked ? 1.6 : 1;
  ctx.strokeStyle = isRanked ? '#ffd700' : 'rgba(148, 163, 184, 0.25)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(34, 30, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = isRanked ? '#facc15' : '#38bdf8';
  ctx.fill();

  ctx.fillStyle = isRanked ? '#fef08a' : '#e2e8f0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 48, 30);

  if (isRanked) {
    const tagX = 16 + width - 54;
    drawRoundedRect(ctx, tagX, 20, 44, 20, 6);
    ctx.fillStyle = 'rgba(234, 179, 8, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '800 9px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fde047';
    ctx.textAlign = 'center';
    ctx.fillText('RANK', tagX + 22, 30);
  }
  ctx.restore();
}

function drawGoldenGoalEmblem(ctx: CanvasRenderingContext2D, ballX: number, ballY: number): void {
  const ballR = 13;
  ctx.save();
  ctx.shadowColor = 'rgba(250, 204, 21, 0.92)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
  ctx.fillStyle = '#FACC15';
  ctx.fill();
  ctx.restore();

  drawBallDesign(ctx, {
    x: ballX,
    y: ballY,
    radius: ballR,
    skin: 'gold',
    rotX: 0.35,
    rotY: 0.25
  });
}

function drawScoreboard(ctx: CanvasRenderingContext2D, state: ReplayHudOverlayState): void {
  const design: LxrScoreboardDesign = state.scoreboardDesign || 'original';
  const centerX = REPLAY_STAGE_WIDTH / 2;
  const top = 8;
  const isWarning = isReplayTimerWarning(state.matchTimer, state.phase, state.isGoldenGoal);
  const pulse = 0.55 + 0.45 * Math.sin(state.currentTimeSec * 7.5);
  const clockStr = formatClock(state.matchTimer);

  ctx.save();
  if (isWarning) {
    ctx.shadowColor = `rgba(239, 68, 68, ${0.45 + pulse * 0.45})`;
    ctx.shadowBlur = 16;
  }

  if (design === 'original') {
    const barW = 336;
    const barH = 44;
    const left = centerX - barW / 2;

    drawRoundedRect(ctx, left, top, barW, barH, 12);
    ctx.fillStyle = isWarning ? 'rgba(38, 12, 18, 0.92)' : 'rgba(11, 15, 25, 0.9)';
    ctx.fill();
    ctx.lineWidth = isWarning ? 1.8 : 1;
    ctx.strokeStyle = isWarning
      ? `rgba(248, 113, 113, ${0.55 + pulse * 0.45})`
      : 'rgba(148, 163, 184, 0.28)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Red pattern chip
    drawPatternFilledRoundedRect(ctx, left + 8, top + 7, 108, 30, 8, state.redKit, state.redColor);
    drawKitLabelText(ctx, state.redAcronym.slice(0, 6), left + 18, top + 22, state.redKit, 'left');
    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(state.redScore), left + 106, top + 22);

    // Clock
    ctx.textAlign = 'center';
    ctx.font = '800 18px "JetBrains Mono", monospace';
    ctx.fillStyle = state.isGoldenGoal ? '#fbbf24' : isWarning ? '#fca5a5' : '#f8fafc';
    ctx.fillText(clockStr, centerX, top + 23);

    // Blue pattern chip
    drawPatternFilledRoundedRect(ctx, left + barW - 116, top + 7, 108, 30, 8, state.blueKit, state.blueColor);
    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(state.blueScore), left + barW - 106, top + 22);
    drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), left + barW - 18, top + 22, state.blueKit, 'right');

    if (state.isGoldenGoal) {
      drawGoldenGoalEmblem(ctx, left + barW + 24, top + barH / 2);
    }
    ctx.restore();
    return;
  }

  // World Cup Broadcast Scoreboards (wc2006..wc2026)
  if (design === 'wc2006') {
    const barW = 356;
    const barH = 36;
    const left = centerX - barW / 2;
    drawRoundedRect(ctx, left, top + 2, barW, barH, 18);
    ctx.fillStyle = isWarning ? '#3b0d14' : '#e2e8f0';
    ctx.fill();
    ctx.lineWidth = isWarning ? 1.8 : 1.2;
    ctx.strokeStyle = isWarning ? '#f87171' : '#94a3b8';
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawPatternFilledRoundedRect(ctx, left + 6, top + 6, 118, 28, 12, state.redKit, state.redColor);
    drawKitLabelText(ctx, state.redAcronym.slice(0, 6), left + 18, top + 20, state.redKit, 'left');

    drawPatternFilledRoundedRect(ctx, left + barW - 124, top + 6, 118, 28, 12, state.blueKit, state.blueColor);
    drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), left + barW - 18, top + 20, state.blueKit, 'right');

    drawRoundedRect(ctx, centerX - 48, top + 5, 96, 30, 8);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${state.redScore} - ${state.blueScore}`, centerX, top + 20);

    // Hanging bottom clock tab
    drawRoundedRect(ctx, centerX - 38, top + 36, 76, 18, 6);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.font = '800 11px "JetBrains Mono", monospace';
    ctx.fillStyle = state.isGoldenGoal ? '#fbbf24' : isWarning ? '#fca5a5' : '#e2e8f0';
    ctx.fillText(clockStr, centerX, top + 45);

    if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, top + 20);
  } else if (design === 'wc2010') {
    const barW = 360;
    const barH = 34;
    const left = centerX - barW / 2;

    // Top arched amber clock tab
    drawRoundedRect(ctx, centerX - 42, top, 84, 18, 8);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '900 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#451a03';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(clockStr, centerX, top + 9);

    drawRoundedRect(ctx, left, top + 16, barW, barH, 10);
    ctx.fillStyle = isWarning ? '#450a0a' : '#fef3c7';
    ctx.fill();
    ctx.lineWidth = isWarning ? 1.8 : 1.2;
    ctx.strokeStyle = isWarning ? '#f87171' : '#d97706';
    ctx.stroke();

    drawPatternFilledRoundedRect(ctx, left + 6, top + 20, 120, 26, 6, state.redKit, state.redColor);
    drawKitLabelText(ctx, state.redAcronym.slice(0, 6), left + 16, top + 33, state.redKit, 'left');

    drawPatternFilledRoundedRect(ctx, left + barW - 126, top + 20, 120, 26, 6, state.blueKit, state.blueColor);
    drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), left + barW - 16, top + 33, state.blueKit, 'right');

    drawRoundedRect(ctx, centerX - 46, top + 19, 92, 28, 6);
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.redScore} - ${state.blueScore}`, centerX, top + 33);

    if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, top + 33);
  } else if (design === 'wc2014') {
    const barW = 360;
    const barH = 36;
    const left = centerX - barW / 2;

    drawRoundedRect(ctx, left, top + 2, barW, barH, 12);
    ctx.fillStyle = isWarning ? '#3b0d14' : '#f1f5f9';
    ctx.fill();
    ctx.lineWidth = isWarning ? 1.8 : 1.2;
    ctx.strokeStyle = isWarning ? '#f87171' : '#94a3b8';
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawPatternFilledRoundedRect(ctx, left + 6, top + 6, 122, 28, 8, state.redKit, state.redColor);
    drawKitLabelText(ctx, state.redAcronym.slice(0, 6), left + 18, top + 20, state.redKit, 'left');

    drawPatternFilledRoundedRect(ctx, left + barW - 128, top + 6, 122, 28, 8, state.blueKit, state.blueColor);
    drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), left + barW - 18, top + 20, state.blueKit, 'right');

    drawRoundedRect(ctx, centerX - 46, top + 4, 92, 32, 6);
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${state.redScore} - ${state.blueScore}`, centerX, top + 20);

    // Emerald green bottom clock pill
    drawRoundedRect(ctx, centerX - 38, top + 36, 76, 18, 9);
    ctx.fillStyle = '#16a34a';
    ctx.fill();
    ctx.font = '800 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(clockStr, centerX, top + 45);

    if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, top + 20);
  } else if (design === 'wc2018') {
    const barW = 392;
    const barH = 38;
    const left = centerX - barW / 2;

    drawRoundedRect(ctx, left, top + 4, barW, barH, 6);
    ctx.fillStyle = isWarning ? '#3b0d14' : '#0f172a';
    ctx.fill();
    ctx.lineWidth = isWarning ? 1.8 : 1.2;
    ctx.strokeStyle = isWarning ? '#f87171' : '#facc15';
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawPatternFilledRoundedRect(ctx, left + 6, top + 8, 96, 30, 4, state.redKit, state.redColor);
    drawKitLabelText(ctx, state.redAcronym.slice(0, 6), left + 16, top + 23, state.redKit, 'left');

    const blueX = left + 202;
    drawPatternFilledRoundedRect(ctx, blueX, top + 8, 96, 30, 4, state.blueKit, state.blueColor);
    drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), blueX + 86, top + 23, state.blueKit, 'right');

    // Center score + gold diamond
    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(state.redScore), left + 122, top + 23);
    ctx.fillText(String(state.blueScore), left + 180, top + 23);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(left + 151, top + 16);
    ctx.lineTo(left + 157, top + 23);
    ctx.lineTo(left + 151, top + 30);
    ctx.lineTo(left + 145, top + 23);
    ctx.closePath();
    ctx.fill();

    // Right clock block
    drawRoundedRect(ctx, left + barW - 84, top + 8, 78, 30, 4);
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillStyle = state.isGoldenGoal ? '#fde047' : '#ffffff';
    ctx.fillText(clockStr, left + barW - 45, top + 23);

    if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, top + 23);
  } else if (design === 'wc2022') {
    const barW = 404;
    const barH = 38;
    const left = centerX - barW / 2;

    drawRoundedRect(ctx, left, top + 4, barW, barH, 10);
    ctx.fillStyle = isWarning ? '#450a0a' : '#580a26';
    ctx.fill();
    ctx.lineWidth = isWarning ? 1.8 : 1.2;
    ctx.strokeStyle = isWarning ? '#f87171' : '#f8fafc';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Left timer block
    drawRoundedRect(ctx, left + 6, top + 8, 74, 30, 6);
    ctx.fillStyle = '#3b0719';
    ctx.fill();
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillStyle = state.isGoldenGoal ? '#fde047' : '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(clockStr, left + 43, top + 23);

    drawPatternFilledRoundedRect(ctx, left + 88, top + 8, 96, 30, 6, state.redKit, state.redColor);
    drawKitLabelText(ctx, state.redAcronym.slice(0, 6), left + 98, top + 23, state.redKit, 'left');

    drawPatternFilledRoundedRect(ctx, left + barW - 102, top + 8, 96, 30, 6, state.blueKit, state.blueColor);
    drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), left + barW - 16, top + 23, state.blueKit, 'right');

    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(state.redScore), left + 206, top + 23);
    ctx.fillText(String(state.blueScore), left + 278, top + 23);

    // Ornate white separator
    ctx.fillStyle = '#f8fafc';
    drawRoundedRect(ctx, left + 237, top + 14, 10, 18, 3);
    ctx.fill();

    if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, top + 23);
  } else {
    // wc2026
    const barW = 408;
    const barH = 38;
    const left = centerX - barW / 2;

    drawRoundedRect(ctx, left, top + 4, barW, barH, 12);
    ctx.fillStyle = isWarning ? '#3b0d14' : '#0f172a';
    ctx.fill();
    ctx.lineWidth = isWarning ? 1.8 : 1.2;
    ctx.strokeStyle = isWarning ? '#f87171' : '#38bdf8';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // White left clock block
    drawRoundedRect(ctx, left + 6, top + 8, 72, 30, 8);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.font = '900 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(clockStr, left + 42, top + 23);

    drawPatternFilledRoundedRect(ctx, left + 86, top + 8, 96, 30, 7, state.redKit, state.redColor);
    drawKitLabelText(ctx, state.redAcronym.slice(0, 6), left + 96, top + 23, state.redKit, 'left');

    drawPatternFilledRoundedRect(ctx, left + barW - 102, top + 8, 96, 30, 7, state.blueKit, state.blueColor);
    drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), left + barW - 16, top + 23, state.blueKit, 'right');

    ctx.font = '900 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(String(state.redScore), left + 204, top + 23);
    ctx.fillText(String(state.blueScore), left + 282, top + 23);

    // Vertical "26" badge
    drawRoundedRect(ctx, left + 231, top + 9, 24, 28, 5);
    ctx.fillStyle = '#0ea5e9';
    ctx.fill();
    ctx.font = '900 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('26', left + 243, top + 23);

    if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, top + 23);
  }

  ctx.restore();
}

function drawTopRightHudCard(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  const cardW = 198;
  const cardH = 38;
  const left = REPLAY_STAGE_WIDTH - 16 - cardW;
  const top = 10;

  drawRoundedRect(ctx, left, top, cardW, cardH, 12);
  ctx.fillStyle = 'rgba(11, 15, 25, 0.86)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.stroke();

  // 5 compact capsule buttons matching InGameHUD: Replays, REC, Audio, Menu, Settings
  const btnCenters = [left + 20, left + 56, left + 106, left + 142, left + 178];

  // 1. Replays play triangle
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(btnCenters[0]! - 4, top + 13);
  ctx.lineTo(btnCenters[0]! + 6, top + 19);
  ctx.lineTo(btnCenters[0]! - 4, top + 25);
  ctx.closePath();
  ctx.stroke();

  // 2. REC badge
  drawRoundedRect(ctx, btnCenters[1]! - 18, top + 9, 44, 20, 6);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(btnCenters[1]! - 9, top + 19, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.font = '800 9px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#fecaca';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('REC', btnCenters[1]! - 2, top + 19.5);

  // 3. Audio icon
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(btnCenters[2]! - 5, top + 16, 4, 6);
  ctx.beginPath();
  ctx.moveTo(btnCenters[2]! - 1, top + 16);
  ctx.lineTo(btnCenters[2]! + 4, top + 12);
  ctx.lineTo(btnCenters[2]! + 4, top + 26);
  ctx.lineTo(btnCenters[2]! - 1, top + 22);
  ctx.closePath();
  ctx.fill();

  // 4. Menu hamburger
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.8;
  for (const dy of [-4, 0, 4]) {
    ctx.beginPath();
    ctx.moveTo(btnCenters[3]! - 6, top + 19 + dy);
    ctx.lineTo(btnCenters[3]! + 6, top + 19 + dy);
    ctx.stroke();
  }

  // 5. Settings cog
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(btnCenters[4]!, top + 19, 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawTelemetryCorner(
  ctx: CanvasRenderingContext2D,
  telemetry: LxrTelemetryPayload
): void {
  ctx.save();
  const x = 16;
  const y = REPLAY_STAGE_HEIGHT - 36;
  const w = 176;
  const h = 26;

  drawRoundedRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(9, 13, 22, 0.8)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + 12, y + 13, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = '#22c55e';
  ctx.fill();

  const ping = Math.max(0, Math.round(telemetry.pingMs));
  const fps = Math.max(1, Math.round(telemetry.fps));
  const pingColor = ping <= 65 ? '#4ade80' : ping <= 130 ? '#fbbf24' : '#f87171';

  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Ping:', x + 22, y + 13.5);
  ctx.fillStyle = pingColor;
  ctx.fillText(`${ping}ms`, x + 56, y + 13.5);
  ctx.fillStyle = '#475569';
  ctx.fillText('|', x + 99, y + 13.5);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('FPS:', x + 108, y + 13.5);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`${fps}`, x + 138, y + 13.5);

  ctx.restore();
}

function drawSlidingScoreEvents(
  ctx: CanvasRenderingContext2D,
  events: ReplaySlidingScoreEventView[],
  currentTimeSec: number
): void {
  if (!events || events.length === 0) return;
  ctx.save();
  const cx = REPLAY_STAGE_WIDTH / 2;
  let y = 66;
  for (const ev of events) {
    const age = Math.max(0, currentTimeSec - ev.t);
    const alpha = age > SCORE_EVENT_DURATION_SEC - 0.45
      ? Math.max(0, (SCORE_EVENT_DURATION_SEC - age) / 0.45)
      : 1;
    ctx.globalAlpha = alpha;
    const textLabel = `${ev.label || ev.kind}`.slice(0, 22).toUpperCase();
    const textPts = ev.pointsText;
    const w = Math.max(146, (textLabel.length + textPts.length) * 8 + 40);
    const left = cx - w / 2;

    drawRoundedRect(ctx, left, y, w, 24, 999);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = ev.accentColor;
    ctx.stroke();

    ctx.font = '800 11px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(textLabel, left + 12, y + 12.5);

    ctx.textAlign = 'right';
    ctx.fillStyle = ev.accentColor;
    ctx.fillText(textPts, left + w - 12, y + 12.5);

    y += 29;
  }
  ctx.restore();
}

function drawChatOverlay(ctx: CanvasRenderingContext2D, state: ReplayHudOverlayState): void {
  const lines = getVisibleReplayChat(state.chatMessages, state.currentTimeSec);
  if (lines.length === 0) return;

  ctx.save();
  const opacity = normalizeReplayOpacity(state.chatOpacity, 0.95);
  ctx.globalAlpha = opacity;
  const x = 16;
  const lineHeight = 25;
  const padY = 8;
  const totalH = lines.length * lineHeight + padY * 2;
  const bottomMargin = state.showExtendedHud ? 46 : 16;
  const top = REPLAY_STAGE_HEIGHT - bottomMargin - totalH;

  drawRoundedRect(ctx, x, top, 390, totalH, 10);
  ctx.fillStyle = 'rgba(9, 13, 22, 0.72)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lines.forEach((msg, idx) => {
    const y = top + padY + idx * lineHeight + lineHeight / 2;
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.fillStyle =
      msg.kind === 'goal'
        ? '#fbbf24'
        : msg.kind === 'system'
          ? '#38bdf8'
          : msg.senderTeam === 'RED'
            ? '#f87171'
            : msg.senderTeam === 'BLUE'
              ? '#60a5fa'
              : '#cbd5e1';

    const prefix = msg.sender ? `${msg.sender}: ` : '';
    ctx.fillText(prefix, x + 12, y);
    const prefixW = ctx.measureText(prefix).width;

    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = msg.kind === 'goal' ? '#fef08a' : '#f1f5f9';
    ctx.fillText(msg.text.slice(0, 52), x + 12 + prefixW, y);
  });
  ctx.restore();
}

function drawCenterBanner(
  ctx: CanvasRenderingContext2D,
  banner: LxrBannerPayload | null,
  state: ReplayHudOverlayState
): void {
  if (!banner || banner.kind === 'NONE') return;

  const cx = REPLAY_STAGE_WIDTH / 2;
  const cy = 225;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (banner.kind === 'GOAL_REPLAY') {
    const pillW = 240;
    const pillH = 30;
    const topY = 98;
    drawRoundedRect(ctx, cx - pillW / 2, topY, pillW, pillH, 999);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - pillW / 2 + 18, topY + 15, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.font = '800 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(banner.label || 'REPETICIÓN DEL GOL', cx + 6, topY + 15.5);
    ctx.restore();
    return;
  }

  if (banner.kind === 'COUNTDOWN') {
    const text = banner.count && banner.count > 0 ? String(banner.count) : banner.label || '¡YA!';
    drawRoundedRect(ctx, cx - 90, cy - 42, 180, 84, 20);
    ctx.fillStyle = 'rgba(11, 15, 25, 0.88)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.font = '900 44px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(text, cx, cy);
    ctx.restore();
    return;
  }

  if (banner.kind === 'PAUSED') {
    const label = banner.isResume ? 'REANUDANDO' : banner.label || 'PARTIDO EN PAUSA';
    drawRoundedRect(ctx, cx - 170, cy - 30, 340, 60, 14);
    ctx.fillStyle = 'rgba(28, 22, 8, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.font = '800 20px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.fillText(label, cx, cy);
    ctx.restore();
    return;
  }

  if (banner.kind === 'VS') {
    const label = banner.label || `${state.redAcronym} VS ${state.blueAcronym}`;
    drawRoundedRect(ctx, cx - 220, cy - 36, 440, 72, 16);
    ctx.fillStyle = 'rgba(11, 15, 25, 0.92)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.stroke();

    if (state.redKit) {
      drawPatternFilledRoundedRect(ctx, cx - 208, cy - 22, 68, 44, 10, state.redKit, state.redColor);
      drawKitLabelText(ctx, state.redAcronym.slice(0, 6), cx - 174, cy, state.redKit, 'center');
    }
    if (state.blueKit) {
      drawPatternFilledRoundedRect(ctx, cx + 140, cy - 22, 68, 44, 10, state.blueKit, state.blueColor);
      drawKitLabelText(ctx, state.blueAcronym.slice(0, 6), cx + 174, cy, state.blueKit, 'center');
    }

    ctx.font = '900 20px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, cx, cy);
    ctx.restore();
    return;
  }

  if (banner.kind === 'GOAL') {
    const isRed = banner.scoringTeam === 'red';
    const accent = isRed ? '#ef4444' : '#3b82f6';
    const hasSpeedBadge =
      typeof banner.speedKmh === 'number' && Number.isFinite(banner.speedKmh) && banner.speedKmh > 0;
    const boxH = hasSpeedBadge ? 116 : 86;

    drawRoundedRect(ctx, cx - 240, cy - boxH / 2, 480, boxH, 16);
    ctx.fillStyle = 'rgba(11, 15, 25, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = accent;
    ctx.stroke();

    const teamKit = isRed ? state.redKit : state.blueKit;
    if (teamKit) {
      drawPatternFilledRoundedRect(ctx, cx - 226, cy - boxH / 2 + 12, 46, 26, 6, teamKit, accent);
      drawKitLabelText(
        ctx,
        (isRed ? state.redAcronym : state.blueAcronym).slice(0, 4),
        cx - 203,
        cy - boxH / 2 + 25,
        teamKit,
        'center'
      );
    }

    ctx.font = '900 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(banner.isOwnGoal ? '¡AUTOGOL!' : '¡GOOOL!', cx, cy - boxH / 2 + 28);

    const scorerLine = banner.assisterName
      ? `${banner.scorerName || 'Jugador'} (Asist: ${banner.assisterName})`
      : banner.scorerName || 'Jugador';
    ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(scorerLine, cx, cy - boxH / 2 + 58);

    if (hasSpeedBadge) {
      const chipW = 104;
      const chipX = cx - chipW / 2;
      const chipY = cy + boxH / 2 - 22;

      ctx.font = '800 11px Inter, system-ui, sans-serif';
      drawRoundedRect(ctx, chipX, chipY - 12, chipW, 24, 999);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`${Math.round(banner.speedKmh!)} km/h`, cx, chipY);
    }

    ctx.restore();
    return;
  }

  if (banner.kind === 'VICTORY') {
    const title =
      banner.winner === 'draw'
        ? 'EMPATE FINAL'
        : banner.winner === 'red'
          ? `VICTORIA ${state.redAcronym}`
          : `VICTORIA ${state.blueAcronym}`;
    drawRoundedRect(ctx, cx - 220, cy - 44, 440, 88, 18);
    ctx.fillStyle = 'rgba(11, 15, 25, 0.94)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();

    ctx.font = '900 26px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(title, cx, cy - 12);

    ctx.font = '800 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(
      `${banner.redScore ?? state.redScore} - ${banner.blueScore ?? state.blueScore}`,
      cx,
      cy + 20
    );
    ctx.restore();
  }
}

function drawUiOverlayPanel(ctx: CanvasRenderingContext2D, state: ReplayHudOverlayState): void {
  const ui = state.uiOverlay;
  if (!ui) return;
  const isStatsOpen = ui.activeSlide === 'STATS' || ui.overlay === 'STATS' || ui.overlay === 'stats';
  const isMenuOpen =
    ui.activeSlide === 'MENU' ||
    ui.overlay === 'MENU' ||
    ui.overlay === 'TEAM_SELECT' ||
    ui.overlay === 'TEAM_MANAGEMENT' ||
    ui.overlay === 'teamSelect';

  if (!isStatsOpen && !isMenuOpen) return;

  ctx.save();
  const cx = REPLAY_STAGE_WIDTH / 2;
  const cy = REPLAY_STAGE_HEIGHT / 2 + 12;

  if (isStatsOpen) {
    const w = 520;
    const h = 300;
    const left = cx - w / 2;
    const top = cy - h / 2;

    drawRoundedRect(ctx, left, top, w, h, 16);
    ctx.fillStyle = 'rgba(10, 15, 28, 0.92)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.stroke();

    ctx.font = '900 15px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ESTADÍSTICAS DEL PARTIDO', cx, top + 24);

    // Team header banners
    drawPatternFilledRoundedRect(ctx, left + 22, top + 46, 210, 34, 8, state.redKit, state.redColor);
    drawKitLabelText(ctx, `${state.redAcronym}  ${state.redScore}`, left + 127, top + 63, state.redKit, 'center');

    drawPatternFilledRoundedRect(ctx, left + w - 232, top + 46, 210, 34, 8, state.blueKit, state.blueColor);
    drawKitLabelText(ctx, `${state.blueScore}  ${state.blueAcronym}`, left + w - 127, top + 63, state.blueKit, 'center');

    const stats = ui.postMatchStats || {};
    const mvp = typeof stats.mvpName === 'string' ? stats.mvpName : null;
    if (mvp) {
      drawRoundedRect(ctx, left + 90, top + 90, w - 180, 28, 8);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.16)';
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '800 12px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.fillText(`MVP: ${mvp}`, cx, top + 104);
    }

    const rows = Array.isArray(stats.players) ? (stats.players as Array<Record<string, unknown>>).slice(0, 6) : [];
    let rowY = top + (mvp ? 136 : 102);
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    if (rows.length > 0) {
      for (const r of rows) {
        ctx.textAlign = 'left';
        ctx.fillStyle = r.team === 'blue' ? '#60a5fa' : '#f87171';
        ctx.fillText(String(r.nickname || 'Jugador').slice(0, 18), left + 26, rowY);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#e2e8f0';
        const goals = Number(r.goals ?? 0);
        const assists = Number(r.assists ?? 0);
        const pts = Number(r.points ?? r.score ?? 0);
        ctx.fillText(`G:${goals}  A:${assists}  PTS:${pts}`, left + w - 26, rowY);
        rowY += 24;
      }
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Marcador actual: ${state.redAcronym} ${state.redScore} - ${state.blueScore} ${state.blueAcronym}`, cx, top + 180);
    }
    ctx.restore();
    return;
  }

  // Open Menu / Team Management overlay
  const w = 360;
  const h = 190;
  const left = cx - w / 2;
  const top = cy - h / 2;
  drawRoundedRect(ctx, left, top, w, h, 14);
  ctx.fillStyle = 'rgba(10, 15, 28, 0.92)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.stroke();

  ctx.font = '900 15px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MENÚ DE SALA', cx, top + 28);

  drawPatternFilledRoundedRect(ctx, left + 22, top + 56, 146, 36, 8, state.redKit, state.redColor);
  drawKitLabelText(ctx, `${state.redAcronym} (${state.redScore})`, left + 95, top + 74, state.redKit, 'center');

  drawPatternFilledRoundedRect(ctx, left + w - 168, top + 56, 146, 36, 8, state.blueKit, state.blueColor);
  drawKitLabelText(ctx, `${state.blueAcronym} (${state.blueScore})`, left + w - 95, top + 74, state.blueKit, 'center');

  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillStyle = ui.isPaused ? '#fde047' : '#94a3b8';
  ctx.fillText(ui.isPaused ? 'Estado: Partido Pausado' : `Sala: ${state.roomName}`, cx, top + 128);
  ctx.restore();
}

export function renderReplayHudOverlay(
  ctx: CanvasRenderingContext2D,
  state: ReplayHudOverlayState,
  stageWidth: number = REPLAY_STAGE_WIDTH,
  stageHeight: number = REPLAY_STAGE_HEIGHT
): void {
  ctx.save();
  const scaleX = stageWidth / REPLAY_STAGE_WIDTH;
  const scaleY = stageHeight / REPLAY_STAGE_HEIGHT;
  if (scaleX !== 1 || scaleY !== 1) {
    ctx.scale(scaleX, scaleY);
  }

  drawRoomCard(ctx, state.roomName, state.roomType || 'casual');
  drawScoreboard(ctx, state);
  if (state.showExtendedHud) {
    drawTopRightHudCard(ctx);
  }
  if (state.slidingEvents && state.slidingEvents.length > 0) {
    drawSlidingScoreEvents(ctx, state.slidingEvents, state.currentTimeSec);
  }
  if (state.telemetry && state.showExtendedHud) {
    drawTelemetryCorner(ctx, state.telemetry);
  }
  drawChatOverlay(ctx, state);
  drawCenterBanner(ctx, state.activeBanner, state);
  if (state.uiOverlay) {
    drawUiOverlayPanel(ctx, state);
  }

  ctx.restore();
}

function pickSupportedWebmMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
}

function yieldCooperativeTick(): Promise<void> {
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        ch.port2.close();
        resolve();
      };
      ch.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function renderSingleExportFrame(
  renderer: GameRenderer,
  ctx: CanvasRenderingContext2D,
  replay: LxrReplayFile,
  f0: LxrFrame,
  f1: LxrFrame,
  alpha: number,
  currentTimeSec: number,
  effZoom: number,
  followPlayerId: number | null,
  lastKitSigRef: { value: string }
): void {
  const activeKits = getActiveReplayKitsAtTime(replay, currentTimeSec);
  const kitSig = JSON.stringify(activeKits);
  if (kitSig !== lastKitSigRef.value) {
    lastKitSigRef.value = kitSig;
    applyReplayRendererKits(renderer, replay, activeKits);
  }

  renderer.camera.setZoom(effZoom);
  renderer.scale = effZoom;

  const fixedStepFn = (renderer as unknown as {
    renderAtFixedStep?: (
      s0: GameStateSnapshot,
      s1: GameStateSnapshot,
      alpha: number,
      focusId?: number,
      dtSec?: number
    ) => void;
  }).renderAtFixedStep;

  if (typeof fixedStepFn === 'function') {
    fixedStepFn.call(
      renderer,
      f0.snapshot,
      f1.snapshot,
      alpha,
      followPlayerId ?? undefined,
      EXPORT_FIXED_DT_SEC
    );
  } else {
    renderer.render(f0.snapshot, f1.snapshot, alpha, followPlayerId ?? undefined);
  }

  const dprScaleX = ctx.canvas.width / REPLAY_STAGE_WIDTH;
  const dprScaleY = ctx.canvas.height / REPLAY_STAGE_HEIGHT;
  ctx.save();
  ctx.setTransform(dprScaleX, 0, 0, dprScaleY, 0, 0);
  renderReplayHudOverlay(
    ctx,
    deriveReplayHudTimelineState(replay, f0, currentTimeSec),
    REPLAY_STAGE_WIDTH,
    REPLAY_STAGE_HEIGHT
  );
  ctx.restore();
}

export async function exportReplayToWebm(
  replay: LxrReplayFile,
  onProgress?: (pct: number) => void,
  options?: { followRecorder?: boolean }
): Promise<WebmExportResult> {
  if (!replay || !Array.isArray(replay.frames) || replay.frames.length === 0) {
    throw new Error('La repetición no contiene frames reproducibles.');
  }
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('La exportación a video WebM no es compatible en este entorno.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = REPLAY_STAGE_WIDTH;
  canvas.height = REPLAY_STAGE_HEIGHT;
  canvas.style.width = `${REPLAY_STAGE_WIDTH}px`;
  canvas.style.height = `${REPLAY_STAGE_HEIGHT}px`;

  if (typeof canvas.captureStream !== 'function') {
    throw new Error('Tu navegador no soporta captura de canvas a video WebM.');
  }

  // IMPORTANT: NEVER call canvas.getContext('2d') before GameRenderer initializes { alpha: false }!
  const v3 = replay.magic === 'LXR3' ? (replay as LxrReplayV3) : null;
  const v2 = replay.magic === 'LXR2' ? (replay as LxrReplayV2) : null;
  const recordedTheme: LxrTheme = v3?.theme === 'light' ? 'light' : 'dark';
  const stadium = createStadium((replay.stadiumId || 'mediano') as StadiumId);
  const playerInfos = buildReplayPlayerInfos(replay);
  const renderer = new GameRenderer(
    canvas,
    {
      stadium,
      playerInfos,
      overrideDpr: 1,
      theme: recordedTheme
    } as ConstructorParameters<typeof GameRenderer>[1]
  );

  const ctx = renderer.ctx;
  if (!ctx) {
    renderer.destroy();
    throw new Error('No se pudo inicializar el contexto Canvas 2D para exportar.');
  }

  applyReplayRendererConfig(renderer, replay, 0);
  renderer.resize(REPLAY_STAGE_WIDTH, REPLAY_STAGE_HEIGHT);

  const camMeta = v3 ?? v2;
  const effZoom = computeReplayEffectiveZoom(
    camMeta?.cameraZoom ?? 1,
    camMeta?.viewportWidth ?? REPLAY_STAGE_WIDTH,
    camMeta?.viewportHeight ?? REPLAY_STAGE_HEIGHT,
    REPLAY_STAGE_WIDTH,
    REPLAY_STAGE_HEIGHT
  );
  const followPlayerId =
    options?.followRecorder !== false && camMeta?.recordingPlayerId != null
      ? camMeta.recordingPlayerId
      : null;
  renderer.focusBallOnly = followPlayerId == null;

  const totalDuration = Math.max(
    0.5,
    replay.durationSeconds || replay.frames[replay.frames.length - 1]!.t || 0.5
  );
  const totalFrames = Math.max(1, Math.ceil(totalDuration * EXPORT_FIXED_FPS));

  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;

  const mimeType = pickSupportedWebmMime();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
    : new MediaRecorder(stream);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev: BlobEvent) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stoppedPromise = new Promise<WebmExportResult>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Falló la codificación del video WebM.'));
    recorder.onstop = () => {
      const outMime = mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: outMime });
      const cleanBase = (replay.roomName || 'legacyx-replay')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32);
      resolve({
        blob,
        filename: `${cleanBase || 'legacyx-replay'}.webm`,
        mimeType: outMime
      });
    };
  });

  const lastKitSigRef = { value: JSON.stringify(getActiveReplayKitsAtTime(replay, 0)) };

  try {
    onProgress?.(0);

    // Paint Frame 0 cleanly BEFORE starting MediaRecorder so first encoded frame is never black/blank
    const initialSample = sampleReplayFrame(replay.frames, 0);
    renderSingleExportFrame(
      renderer,
      ctx,
      replay,
      initialSample.f0,
      initialSample.f1,
      initialSample.alpha,
      0,
      effZoom,
      followPlayerId,
      lastKitSigRef
    );

    recorder.start(250);
    videoTrack?.requestFrame?.();

    for (let frameIndex = 1; frameIndex <= totalFrames; frameIndex++) {
      await yieldCooperativeTick();
      const virtualTimeSec = Math.min(totalDuration, frameIndex * EXPORT_FIXED_DT_SEC);
      const { f0, f1, alpha } = sampleReplayFrame(replay.frames, virtualTimeSec);
      renderSingleExportFrame(
        renderer,
        ctx,
        replay,
        f0,
        f1,
        alpha,
        virtualTimeSec,
        effZoom,
        followPlayerId,
        lastKitSigRef
      );
      videoTrack?.requestFrame?.();
      onProgress?.(Math.min(99, Math.round((frameIndex / totalFrames) * 100)));
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    const result = await stoppedPromise;
    onProgress?.(100);
    return result;
  } finally {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignored
      }
    }
    renderer.destroy();
  }
}

export function triggerWebmDownload(result: WebmExportResult): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }, 1500);
}
