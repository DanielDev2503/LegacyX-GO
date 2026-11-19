import { Capacitor } from '@capacitor/core';
import { createStadium, MatchPhase, type GameStateSnapshot, type StadiumId } from '@legacyx/core';
import { drawBallDesign, type BallSkin } from '../renderer/ballDesigns.js';
import { GameRenderer } from '../renderer/GameRenderer.js';
import type { PlayerVisualInfo } from '../renderer/DiscRenderer.js';
import { drawKitPatternCanvas } from '../ui/utils/kitPatterns.js';
import { WebmMuxer, type WebmVideoCodec } from './WebmMuxer.js';
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
  activeEmotes?: Array<{ playerId: number; emoji: string; progress: number }>;
  ballRadius?: number;
  playerRadius?: number;
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
  activeEmotes: Array<{ playerId: number; emoji: string; progress: number }>;
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

function normalizePositiveRadius(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/**
 * Resolves active ballRadius and playerRadius at `currentTimeSec`, checking top-level/meta/modifiers
 * replay properties and applying any `modifiers_updated` HUD timeline events up to `currentTimeSec`.
 */
export function getActiveReplayModifiersAtTime(
  replay: LxrReplayFile,
  currentTimeSec: number
): { ballRadius?: number; playerRadius?: number } {
  const anyReplay = replay as unknown as {
    ballRadius?: unknown;
    playerRadius?: unknown;
    meta?: { ballRadius?: unknown; playerRadius?: unknown };
    modifiers?: { ballRadius?: unknown; playerRadius?: unknown };
  };

  let ballRadius =
    normalizePositiveRadius(anyReplay?.ballRadius) ??
    normalizePositiveRadius(anyReplay?.meta?.ballRadius) ??
    normalizePositiveRadius(anyReplay?.modifiers?.ballRadius);
  let playerRadius =
    normalizePositiveRadius(anyReplay?.playerRadius) ??
    normalizePositiveRadius(anyReplay?.meta?.playerRadius) ??
    normalizePositiveRadius(anyReplay?.modifiers?.playerRadius);

  if (replay.magic === 'LXR3' && Array.isArray((replay as LxrReplayV3).hudEvents)) {
    let latestModT = -Infinity;
    for (const ev of (replay as LxrReplayV3).hudEvents) {
      if (ev.type !== 'modifiers_updated' || ev.t > currentTimeSec || ev.t < latestModT) continue;
      latestModT = ev.t;
      const nextBall = normalizePositiveRadius(ev.payload?.ballRadius);
      const nextPlayer = normalizePositiveRadius(ev.payload?.playerRadius);
      if (nextBall !== undefined) ballRadius = nextBall;
      if (nextPlayer !== undefined) playerRadius = nextPlayer;
    }
  }

  return {
    ...(ballRadius !== undefined ? { ballRadius } : {}),
    ...(playerRadius !== undefined ? { playerRadius } : {})
  };
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
  const modifiers = getActiveReplayModifiersAtTime(replay, currentTimeSec);

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
      ballRadius?: number;
      playerRadius?: number;
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
    if (modifiers.ballRadius !== undefined) {
      rendererAny.discRenderer.ballRadius = modifiers.ballRadius;
    }
    if (modifiers.playerRadius !== undefined) {
      rendererAny.discRenderer.playerRadius = modifiers.playerRadius;
    }
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
  maxAgeSec: number = Infinity,
  maxLines: number = 3
): LxrChatEntry[] {
  if (!Array.isArray(chatMessages) || chatMessages.length === 0 || maxLines <= 0) return [];
  const minTime = Number.isFinite(maxAgeSec) ? currentTimeSec - maxAgeSec : -Infinity;
  const visible = chatMessages.filter((entry) => entry.t <= currentTimeSec && entry.t >= minTime);
  return visible.slice(-maxLines);
}

/**
 * Resolves currently active pitch emotes at `currentTimeSec` from LXR3 `hudEvents`,
 * keeping only the latest active emote per `playerId` with normalized progress in [0, 1].
 */
export function getActiveReplayEmotes(
  replay: LxrReplayFile,
  currentTimeSec: number
): Array<{ playerId: number; emoji: string; progress: number }> {
  if (replay.magic !== 'LXR3' || !Array.isArray((replay as LxrReplayV3).hudEvents)) {
    return [];
  }
  const latestByPlayer = new Map<number, { t: number; emoji: string; progress: number }>();
  for (const ev of (replay as LxrReplayV3).hudEvents) {
    if (ev.type !== 'emote') continue;
    if (typeof ev.payload?.playerId !== 'number' || typeof ev.payload?.emoji !== 'string' || !ev.payload.emoji) {
      continue;
    }
    const rawDurationMs = ev.payload.durationMs ?? 2200;
    const durationSec =
      typeof rawDurationMs === 'number' && Number.isFinite(rawDurationMs) && rawDurationMs > 0
        ? rawDurationMs / 1000
        : 2.2;
    if (ev.t <= currentTimeSec && currentTimeSec <= ev.t + durationSec) {
      const progress = Math.max(0, Math.min(1, (currentTimeSec - ev.t) / durationSec));
      const prev = latestByPlayer.get(ev.payload.playerId);
      if (!prev || ev.t >= prev.t) {
        latestByPlayer.set(ev.payload.playerId, {
          t: ev.t,
          emoji: ev.payload.emoji,
          progress
        });
      }
    }
  }
  return Array.from(latestByPlayer.entries()).map(([playerId, info]) => ({
    playerId,
    emoji: info.emoji,
    progress: info.progress
  }));
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

/**
 * Resuelve la vista de overlay de sala activa en un instante de replay.
 * Garantiza que `overlay === 'NONE'` nunca muestre el menú o estadísticas encima del partido
 * aunque `activeSlide` conserve su último valor `'MENU'`.
 */
export function resolveReplayOverlayView(ui?: LxrUiOverlayState | null): 'NONE' | 'MENU' | 'STATS' {
  if (!ui) return 'NONE';
  const overlayUp = String(ui.overlay || 'NONE').toUpperCase();
  const isRoomOverlayOpen =
    overlayUp === 'MENU' ||
    overlayUp === 'TEAM_SELECT' ||
    overlayUp === 'TEAM_MANAGEMENT' ||
    overlayUp === 'STATS';
  if (!isRoomOverlayOpen) return 'NONE';
  const slideUp = String(ui.activeSlide || '').toUpperCase();
  if (overlayUp === 'STATS' || slideUp === 'STATS') return 'STATS';
  return 'MENU';
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
  const activeModifiers = getActiveReplayModifiersAtTime(replay, currentTimeSec);
  const activeEmotes = getActiveReplayEmotes(replay, currentTimeSec);
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
    activeEmotes,
    ...(activeModifiers.ballRadius !== undefined ? { ballRadius: activeModifiers.ballRadius } : {}),
    ...(activeModifiers.playerRadius !== undefined ? { playerRadius: activeModifiers.playerRadius } : {}),
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

function makeVerticalLinearGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  stops: Array<[number, string]>
): CanvasGradient | string {
  if (typeof ctx.createLinearGradient !== 'function') {
    return stops[0]?.[1] ?? '#ffffff';
  }
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  for (const [offset, color] of stops) {
    grad.addColorStop(offset, color);
  }
  return grad;
}

function drawCornerRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number
): void {
  const maxR = Math.min(w / 2, h / 2);
  const rTL = Math.max(0, Math.min(maxR, tl));
  const rTR = Math.max(0, Math.min(maxR, tr));
  const rBR = Math.max(0, Math.min(maxR, br));
  const rBL = Math.max(0, Math.min(maxR, bl));
  ctx.beginPath();
  ctx.moveTo(x + rTL, y);
  ctx.lineTo(x + w - rTR, y);
  if (rTR > 0) ctx.arc(x + w - rTR, y + rTR, rTR, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rBR);
  if (rBR > 0) ctx.arc(x + w - rBR, y + h - rBR, rBR, 0, Math.PI / 2);
  ctx.lineTo(x + rBL, y + h);
  if (rBL > 0) ctx.arc(x + rBL, y + h - rBL, rBL, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rTL);
  if (rTL > 0) ctx.arc(x + rTL, y + rTL, rTL, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function drawDiamondPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfDiag: number
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfDiag);
  ctx.lineTo(cx + halfDiag, cy);
  ctx.lineTo(cx, cy + halfDiag);
  ctx.lineTo(cx - halfDiag, cy);
  ctx.closePath();
}

function traceFlagPolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: 'angled' | 'hex'
): void {
  ctx.beginPath();
  if (shape === 'angled') {
    ctx.moveTo(x + w * 0.12, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.88, y + h);
    ctx.lineTo(x, y + h);
  } else {
    ctx.moveTo(x + w * 0.16, y);
    ctx.lineTo(x + w * 0.84, y);
    ctx.lineTo(x + w, y + h * 0.5);
    ctx.lineTo(x + w * 0.84, y + h);
    ctx.lineTo(x + w * 0.16, y + h);
    ctx.lineTo(x, y + h * 0.5);
  }
  ctx.closePath();
}

function drawWcFlagBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: 'rect' | 'pill' | 'angled' | 'hex',
  kit: Record<string, unknown> | undefined,
  fallbackColor: string,
  borderOverride?: string
): void {
  const resolved = resolveKitPatternInput(kit, fallbackColor);
  if (shape === 'rect' || shape === 'pill') {
    const radius = shape === 'pill' ? Math.min(w, h) / 2 : borderOverride ? 7 : 3;
    drawPatternFilledRoundedRect(ctx, x, y, w, h, radius, kit, fallbackColor);
    ctx.save();
    drawRoundedRect(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.fillStyle = makeVerticalLinearGradient(ctx, x, y, h, [
      [0, 'rgba(255, 255, 255, 0.28)'],
      [0.48, 'rgba(255, 255, 255, 0)'],
      [1, 'rgba(0, 0, 0, 0.2)']
    ]);
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    if (borderOverride || !resolved.hasOutline) {
      ctx.save();
      drawRoundedRect(ctx, x, y, w, h, radius);
      ctx.lineWidth = borderOverride ? 1.5 : 1;
      ctx.strokeStyle = borderOverride ?? 'rgba(255, 255, 255, 0.22)';
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  ctx.save();
  traceFlagPolygon(ctx, x, y, w, h, shape);
  ctx.clip();
  drawKitPatternCanvas(
    ctx,
    x,
    y,
    w,
    h,
    resolved as Parameters<typeof drawKitPatternCanvas>[5]
  );
  ctx.fillStyle = makeVerticalLinearGradient(ctx, x, y, h, [
    [0, 'rgba(255, 255, 255, 0.28)'],
    [0.48, 'rgba(255, 255, 255, 0)'],
    [1, 'rgba(0, 0, 0, 0.2)']
  ]);
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  ctx.save();
  traceFlagPolygon(ctx, x, y, w, h, shape);
  ctx.lineWidth = resolved.hasOutline ? 1.5 : 1;
  ctx.strokeStyle = resolved.hasOutline ? '#000000' : 'rgba(255, 255, 255, 0.45)';
  ctx.stroke();
  ctx.restore();
}

function drawWc2006Scoreboard(
  ctx: CanvasRenderingContext2D,
  state: ReplayHudOverlayState,
  centerX: number,
  top: number,
  clockStr: string,
  isWarning: boolean
): void {
  const redTag = state.redAcronym.slice(0, 6).toUpperCase();
  const blueTag = state.blueAcronym.slice(0, 6).toUpperCase();
  const tagFont = '800 14.5px "Arial Narrow", Inter, system-ui, sans-serif';
  const scoreFont = '900 20px "JetBrains Mono", monospace';
  const clockFont = '800 13px "JetBrains Mono", monospace';

  ctx.font = tagFont;
  const tagSlotW = Math.max(
    40,
    Math.ceil(Math.max(ctx.measureText(redTag).width, ctx.measureText(blueTag).width)) + 4
  );
  ctx.font = scoreFont;
  const scoreW = Math.max(
    76,
    Math.ceil(ctx.measureText(String(state.redScore)).width + ctx.measureText(String(state.blueScore)).width + 38)
  );
  ctx.font = clockFont;
  const tabW = Math.max(70, Math.ceil(ctx.measureText(clockStr).width + 24));

  const flagW = 27;
  const flagH = 25;
  const padX = 8;
  const gap = 7;
  const wingW = padX + flagW + gap + tagSlotW + gap;
  const barW = wingW * 2 + scoreW;
  const barH = 40;
  const barY = top + 2;
  const left = centerX - barW / 2;

  // Hanging bottom clock tab drawn first so pill edge cleanly caps its top seam
  const tabH = 20;
  const tabX = centerX - tabW / 2;
  const tabY = barY + barH - 2;
  ctx.save();
  ctx.shadowBlur = 0;
  drawCornerRoundedRect(ctx, tabX, tabY, tabW, tabH, 0, 0, 8, 8);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, tabX, tabY, tabH, [
    [0, '#20242c'],
    [1, '#07090d']
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#7b8492';
  ctx.stroke();
  ctx.font = clockFont;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clockStr, centerX, tabY + tabH / 2 + 1);
  ctx.restore();

  // Metallic silver rounded pill bar
  drawRoundedRect(ctx, left, barY, barW, barH, barH / 2);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, left, barY, barH, [
    [0, '#f3f5f8'],
    [0.52, '#c8ced6'],
    [1, '#dce1e8']
  ]);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = isWarning ? 1.8 : 1.5;
  ctx.strokeStyle = isWarning ? '#ef4444' : '#8c96a5';
  ctx.stroke();

  const cy = barY + barH / 2;
  drawWcFlagBadge(ctx, left + padX, cy - flagH / 2, flagW, flagH, 'pill', state.redKit, state.redColor || '#e74c3c');
  drawWcFlagBadge(
    ctx,
    left + barW - padX - flagW,
    cy - flagH / 2,
    flagW,
    flagH,
    'pill',
    state.blueKit,
    state.blueColor || '#00e5ff'
  );

  // Bold black uppercase acronyms on silver wings (outside flags)
  ctx.font = tagFont;
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(redTag, left + padX + flagW + gap + tagSlotW / 2, cy + 0.5);
  ctx.fillText(blueTag, left + barW - padX - flagW - gap - tagSlotW / 2, cy + 0.5);

  // Glossy black center score box
  const scoreX = centerX - scoreW / 2;
  const scoreY = barY + 4;
  const scoreH = barH - 8;
  drawRoundedRect(ctx, scoreX, scoreY, scoreW, scoreH, 5);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, scoreX, scoreY, scoreH, [
    [0, '#272b33'],
    [0.55, '#090b0f'],
    [1, '#161920']
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#8e97a4';
  ctx.stroke();

  // Vertical silver hairline between scores
  ctx.fillStyle = makeVerticalLinearGradient(ctx, centerX, barY + 11, 18, [
    [0, 'rgba(226, 232, 240, 0.3)'],
    [0.5, '#e2e8f0'],
    [1, 'rgba(226, 232, 240, 0.3)']
  ]);
  ctx.fillRect(centerX - 0.75, barY + 11, 1.5, 18);

  ctx.font = scoreFont;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(state.redScore), centerX - scoreW / 4, cy + 0.5);
  ctx.fillText(String(state.blueScore), centerX + scoreW / 4, cy + 0.5);

  if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, cy);
}

function drawWc2010Scoreboard(
  ctx: CanvasRenderingContext2D,
  state: ReplayHudOverlayState,
  centerX: number,
  top: number,
  clockStr: string,
  isWarning: boolean
): void {
  const redTag = state.redAcronym.slice(0, 6).toUpperCase();
  const blueTag = state.blueAcronym.slice(0, 6).toUpperCase();
  const tagFont = '900 14.5px "Space Grotesk", Inter, system-ui, sans-serif';
  const scoreFont = '900 20px "JetBrains Mono", monospace';
  const clockFont = '800 13px "JetBrains Mono", monospace';

  ctx.font = tagFont;
  const tagSlotW = Math.max(
    40,
    Math.ceil(Math.max(ctx.measureText(redTag).width, ctx.measureText(blueTag).width)) + 4
  );
  ctx.font = scoreFont;
  const trapW = Math.max(
    84,
    Math.ceil(ctx.measureText(String(state.redScore)).width + ctx.measureText(String(state.blueScore)).width + 46)
  );
  ctx.font = clockFont;
  const archW = Math.max(76, Math.ceil(ctx.measureText(clockStr).width + 28));

  const flagW = 32;
  const flagH = 22;
  const padX = 8;
  const gap = 8;
  const wingW = padX + flagW + gap + tagSlotW + gap;
  const barW = wingW * 2 + trapW;
  const barH = 38;
  const barY = top + 18;
  const left = centerX - barW / 2;

  // Champagne/warm-silver winged bar
  drawCornerRoundedRect(ctx, left, barY, barW, barH, 6, 6, 18, 18);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, left, barY, barH, [
    [0, '#f7e6d6'],
    [0.55, '#d8bda9'],
    [1, '#b89882']
  ]);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Central burnt-orange downward trapezoid clipped cleanly to bar
  const trapInset = Math.round(trapW * 0.12);
  ctx.save();
  drawCornerRoundedRect(ctx, left, barY, barW, barH, 6, 6, 18, 18);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(centerX - trapW / 2, barY);
  ctx.lineTo(centerX + trapW / 2, barY);
  ctx.lineTo(centerX + trapW / 2 - trapInset, barY + barH);
  ctx.lineTo(centerX - trapW / 2 + trapInset, barY + barH);
  ctx.closePath();
  ctx.fillStyle = makeVerticalLinearGradient(ctx, centerX, barY, barH, [
    [0, '#ff8524'],
    [0.58, '#d94a00'],
    [1, '#9e2d00']
  ]);
  ctx.fill();
  ctx.restore();

  drawCornerRoundedRect(ctx, left, barY, barW, barH, 6, 6, 18, 18);
  ctx.lineWidth = isWarning ? 1.8 : 1.5;
  ctx.strokeStyle = isWarning ? '#ef4444' : '#9d7f6a';
  ctx.stroke();

  const cy = barY + barH / 2;
  drawWcFlagBadge(ctx, left + padX, cy - flagH / 2, flagW, flagH, 'angled', state.redKit, state.redColor || '#e74c3c');
  drawWcFlagBadge(
    ctx,
    left + barW - padX - flagW,
    cy - flagH / 2,
    flagW,
    flagH,
    'angled',
    state.blueKit,
    state.blueColor || '#00e5ff'
  );

  // Bold black acronyms on champagne wings
  ctx.font = tagFont;
  ctx.fillStyle = '#14110f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(redTag, left + padX + flagW + gap + tagSlotW / 2, cy + 0.5);
  ctx.fillText(blueTag, left + barW - padX - flagW - gap - tagSlotW / 2, cy + 0.5);

  // White scores inside burnt-orange trapezoid (no dash)
  ctx.font = scoreFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(state.redScore), centerX - trapW * 0.21, cy + 1);
  ctx.fillText(String(state.blueScore), centerX + trapW * 0.21, cy + 1);

  // Arched glossy burnt-orange top timer tab overlapping bar top by 2px
  const archH = 20;
  const archX = centerX - archW / 2;
  drawCornerRoundedRect(ctx, archX, top, archW, archH, 14, 14, 0, 0);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, archX, top, archH, [
    [0, '#ff7b1c'],
    [0.55, '#c74100'],
    [1, '#8f2a00']
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#fb923c';
  ctx.stroke();

  ctx.font = clockFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(clockStr, centerX, top + archH / 2);

  if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, cy);
}

function drawWc2014Scoreboard(
  ctx: CanvasRenderingContext2D,
  state: ReplayHudOverlayState,
  centerX: number,
  top: number,
  clockStr: string,
  isWarning: boolean
): void {
  const redTag = state.redAcronym.slice(0, 6).toUpperCase();
  const blueTag = state.blueAcronym.slice(0, 6).toUpperCase();
  const tagFont = '900 14.5px "Space Grotesk", Inter, system-ui, sans-serif';
  const scoreFont = '900 20px "JetBrains Mono", monospace';
  const clockFont = '800 13px "JetBrains Mono", monospace';

  ctx.font = tagFont;
  const tagSlotW = Math.max(
    40,
    Math.ceil(Math.max(ctx.measureText(redTag).width, ctx.measureText(blueTag).width)) + 4
  );
  ctx.font = scoreFont;
  const scoreW = Math.max(
    82,
    Math.ceil(ctx.measureText(String(state.redScore)).width + ctx.measureText(String(state.blueScore)).width + 44)
  );
  ctx.font = clockFont;
  const tabW = Math.max(74, Math.ceil(ctx.measureText(clockStr).width + 28));

  const flagW = 32;
  const flagH = 26;
  const padX = 8;
  const gap = 8;
  const wingW = padX + flagW + gap + tagSlotW + gap;
  const barW = wingW * 2 + scoreW;
  const barH = 40;
  const barY = top + 2;
  const left = centerX - barW / 2;

  // Emerald-green rounded bottom timer pill drawn first for flush seam
  const tabH = 20;
  const tabX = centerX - tabW / 2;
  const tabY = barY + barH - 2;
  ctx.save();
  ctx.shadowBlur = 0;
  drawCornerRoundedRect(ctx, tabX, tabY, tabW, tabH, 0, 0, 10, 10);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, tabX, tabY, tabH, [
    [0, '#1fc74e'],
    [1, '#0e7a2b']
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#86efac';
  ctx.stroke();
  ctx.font = clockFont;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clockStr, centerX, tabY + tabH / 2 + 1);
  ctx.restore();

  // Bright white-silver 3D beveled bar
  drawRoundedRect(ctx, left, barY, barW, barH, 11);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, left, barY, barH, [
    [0, '#ffffff'],
    [0.6, '#e1e6ed'],
    [1, '#c4ccd6']
  ]);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = isWarning ? 1.8 : 1.5;
  ctx.strokeStyle = isWarning ? '#ef4444' : '#9aa5b4';
  ctx.stroke();

  const cy = barY + barH / 2;
  drawWcFlagBadge(ctx, left + padX, cy - flagH / 2, flagW, flagH, 'rect', state.redKit, state.redColor || '#e74c3c', '#cbd5e1');
  drawWcFlagBadge(
    ctx,
    left + barW - padX - flagW,
    cy - flagH / 2,
    flagW,
    flagH,
    'rect',
    state.blueKit,
    state.blueColor || '#00e5ff',
    '#cbd5e1'
  );

  // Dark navy bold acronyms outside flags
  ctx.font = tagFont;
  ctx.fillStyle = '#0e244d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(redTag, left + padX + flagW + gap + tagSlotW / 2, cy + 0.5);
  ctx.fillText(blueTag, left + barW - padX - flagW - gap - tagSlotW / 2, cy + 0.5);

  // Royal-blue central capsule
  const scoreX = centerX - scoreW / 2;
  const scoreY = barY + 4;
  const scoreH = barH - 8;
  drawRoundedRect(ctx, scoreX, scoreY, scoreW, scoreH, 7);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, scoreX, scoreY, scoreH, [
    [0, '#1b8ce8'],
    [1, '#0952a5']
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#60a5fa';
  ctx.stroke();

  ctx.font = scoreFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(state.redScore), centerX - scoreW * 0.24, cy + 0.5);
  ctx.fillText(String(state.blueScore), centerX + scoreW * 0.24, cy + 0.5);
  ctx.fillStyle = '#dbeafe';
  ctx.font = '900 18px Inter, system-ui, sans-serif';
  ctx.fillText('-', centerX, cy);

  if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, cy);
}

function drawWc2018Scoreboard(
  ctx: CanvasRenderingContext2D,
  state: ReplayHudOverlayState,
  centerX: number,
  top: number,
  clockStr: string,
  isWarning: boolean
): void {
  const redTag = state.redAcronym.slice(0, 6).toUpperCase();
  const blueTag = state.blueAcronym.slice(0, 6).toUpperCase();
  const tagFont = '800 14.5px Georgia, "Times New Roman", serif';
  const scoreFont = '900 20px Georgia, "Times New Roman", serif';
  const clockFont = '800 13.5px "JetBrains Mono", monospace';

  ctx.font = tagFont;
  const tagSlotW = Math.max(
    38,
    Math.ceil(Math.max(ctx.measureText(redTag).width, ctx.measureText(blueTag).width)) + 4
  );
  ctx.font = scoreFont;
  const scoreW = Math.max(
    78,
    Math.ceil(ctx.measureText(String(state.redScore)).width + ctx.measureText(String(state.blueScore)).width + 42)
  );
  ctx.font = clockFont;
  const clockBlockW = Math.max(66, Math.ceil(ctx.measureText(clockStr).width + 24));

  const flagW = 34;
  const flagH = 23;
  const wingPadX = 10;
  const gap = 7;
  const wingW = wingPadX + flagW + gap + tagSlotW + wingPadX;
  const barW = wingW * 2 + scoreW + clockBlockW;
  const barH = 40;
  const barY = top + 4;
  const left = centerX - barW / 2;

  drawRoundedRect(ctx, left, barY, barW, barH, 3);
  ctx.fillStyle = '#980917';
  ctx.fill();
  ctx.shadowBlur = 0;

  const scoreX = left + wingW;
  const rightWingX = scoreX + scoreW;
  const clockX = rightWingX + wingW;
  const cy = barY + barH / 2;

  ctx.save();
  drawRoundedRect(ctx, left, barY, barW, barH, 3);
  ctx.clip();

  // Crimson-red left & right wings
  const wingGrad = makeVerticalLinearGradient(ctx, left, barY, barH, [
    [0, '#dc182b'],
    [1, '#980917']
  ]);
  ctx.fillStyle = wingGrad;
  ctx.fillRect(left, barY, wingW, barH);
  ctx.fillRect(rightWingX, barY, wingW, barH);

  // Deep royal-blue center score block
  ctx.fillStyle = makeVerticalLinearGradient(ctx, scoreX, barY, barH, [
    [0, '#0e4da4'],
    [1, '#072963']
  ]);
  ctx.fillRect(scoreX, barY, scoreW, barH);

  // Attached cobalt-blue right timer box
  ctx.fillStyle = makeVerticalLinearGradient(ctx, clockX, barY, barH, [
    [0, '#1976d2'],
    [1, '#0b479c']
  ]);
  ctx.fillRect(clockX, barY, clockBlockW, barH);

  // Thin vertical ice-blue dividers between blocks
  ctx.fillStyle = 'rgba(186, 230, 253, 0.65)';
  ctx.fillRect(scoreX, barY, 1, barH);
  ctx.fillRect(rightWingX - 1, barY, 1, barH);
  ctx.fillRect(clockX, barY, 1, barH);

  // Hexagonal outer flags
  drawWcFlagBadge(ctx, left + wingPadX, cy - flagH / 2, flagW, flagH, 'hex', state.redKit, state.redColor || '#e74c3c');
  drawWcFlagBadge(
    ctx,
    rightWingX + wingW - wingPadX - flagW,
    cy - flagH / 2,
    flagW,
    flagH,
    'hex',
    state.blueKit,
    state.blueColor || '#00e5ff'
  );

  // White Georgia serif acronyms on crimson wings
  ctx.font = tagFont;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(redTag, left + wingPadX + flagW + gap + tagSlotW / 2, cy + 0.5);
  ctx.fillText(blueTag, rightWingX + wingPadX + tagSlotW / 2, cy + 0.5);

  // White serif scores + gold diamond between scores
  const scoreMidX = scoreX + scoreW / 2;
  ctx.font = scoreFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(state.redScore), scoreX + scoreW * 0.25, cy + 0.5);
  ctx.fillText(String(state.blueScore), scoreX + scoreW * 0.75, cy + 0.5);

  drawDiamondPath(ctx, scoreMidX, cy, 6.2);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, scoreMidX, cy - 6.2, 12.4, [
    [0, '#fde047'],
    [0.55, '#f4c430'],
    [1, '#ca8a04']
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#713f12';
  ctx.stroke();

  // Timer text
  ctx.font = clockFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(clockStr, clockX + clockBlockW / 2, cy + 0.5);
  ctx.restore();

  drawRoundedRect(ctx, left, barY, barW, barH, 3);
  ctx.lineWidth = isWarning ? 1.8 : 1.5;
  ctx.strokeStyle = isWarning ? '#ef4444' : '#e2e8f0';
  ctx.stroke();

  if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, cy);
}

function drawWc2022Scoreboard(
  ctx: CanvasRenderingContext2D,
  state: ReplayHudOverlayState,
  centerX: number,
  top: number,
  clockStr: string,
  isWarning: boolean
): void {
  const redTag = state.redAcronym.slice(0, 6).toUpperCase();
  const blueTag = state.blueAcronym.slice(0, 6).toUpperCase();
  const tagFont = '800 14.5px "Space Grotesk", Inter, system-ui, sans-serif';
  const scoreFont = '900 20px "JetBrains Mono", monospace';
  const clockFont = '800 13.5px "JetBrains Mono", monospace';

  ctx.font = tagFont;
  const tagSlotW = Math.max(
    38,
    Math.ceil(Math.max(ctx.measureText(redTag).width, ctx.measureText(blueTag).width)) + 4
  );
  ctx.font = scoreFont;
  const scoreSlotW = Math.max(
    22,
    Math.ceil(Math.max(ctx.measureText(String(state.redScore)).width, ctx.measureText(String(state.blueScore)).width)) + 6
  );
  ctx.font = clockFont;
  const clockBlockW = Math.max(66, Math.ceil(ctx.measureText(clockStr).width + 22));

  const zigzagW = 9;
  const flagW = 30;
  const flagH = 21;
  const gap = 7.5;
  const padLeft = 7.5;
  const padRight = 10.5;
  const sepW = 24;
  const bodyW =
    padLeft +
    flagW +
    gap +
    tagSlotW +
    gap +
    scoreSlotW +
    gap +
    sepW +
    gap +
    scoreSlotW +
    gap +
    tagSlotW +
    gap +
    flagW +
    padRight;
  const barW = clockBlockW + zigzagW + bodyW;
  const barH = 42;
  const barY = top + 4;
  const left = centerX - barW / 2;
  const cy = barY + barH / 2;

  drawRoundedRect(ctx, left, barY, barW, barH, 6);
  ctx.fillStyle = makeVerticalLinearGradient(ctx, left, barY, barH, [
    [0, '#8e083f'],
    [1, '#5c0027']
  ]);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  drawRoundedRect(ctx, left, barY, barW, barH, 6);
  ctx.clip();

  // Left maroon clock text
  ctx.font = clockFont;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clockStr, left + clockBlockW / 2 + 1, cy + 0.5);

  // Crisp white 9-spike serrated zigzag divider
  const zx = left + clockBlockW;
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const py = barY + 1 + (i / 18) * (barH - 2);
    const px = i % 2 === 0 ? zx + 1 : zx + 7;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'miter';
  ctx.stroke();

  let curX = zx + zigzagW + padLeft;
  drawWcFlagBadge(ctx, curX, cy - flagH / 2, flagW, flagH, 'rect', state.redKit, state.redColor || '#e74c3c');
  curX += flagW + gap;

  ctx.font = tagFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(redTag, curX + tagSlotW / 2, cy + 0.5);
  curX += tagSlotW + gap;

  ctx.font = scoreFont;
  ctx.fillText(String(state.redScore), curX + scoreSlotW / 2, cy + 0.5);
  curX += scoreSlotW + gap;

  // Cream-and-burgundy lattice diamond emblem
  const sepCx = curX + sepW / 2;
  drawDiamondPath(ctx, sepCx, cy, 11.5);
  ctx.fillStyle = '#f8f1e5';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#d4b078';
  ctx.stroke();

  drawDiamondPath(ctx, sepCx, cy, 5.5);
  ctx.fillStyle = '#6d0731';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#b45309';
  ctx.stroke();
  curX += sepW + gap;

  ctx.font = scoreFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(state.blueScore), curX + scoreSlotW / 2, cy + 0.5);
  curX += scoreSlotW + gap;

  ctx.font = tagFont;
  ctx.fillText(blueTag, curX + tagSlotW / 2, cy + 0.5);
  curX += tagSlotW + gap;

  drawWcFlagBadge(ctx, curX, cy - flagH / 2, flagW, flagH, 'rect', state.blueKit, state.blueColor || '#00e5ff');
  ctx.restore();

  drawRoundedRect(ctx, left, barY, barW, barH, 6);
  ctx.lineWidth = isWarning ? 1.8 : 1.5;
  ctx.strokeStyle = isWarning ? '#ef4444' : '#e5c158';
  ctx.stroke();

  if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, cy);
}

function drawWc2026Scoreboard(
  ctx: CanvasRenderingContext2D,
  state: ReplayHudOverlayState,
  centerX: number,
  top: number,
  clockStr: string,
  isWarning: boolean
): void {
  const redTag = state.redAcronym.slice(0, 6).toUpperCase();
  const blueTag = state.blueAcronym.slice(0, 6).toUpperCase();
  const tagFont = '900 14.5px "Arial Narrow", Impact, Outfit, sans-serif';
  const scoreFont = '900 20px "JetBrains Mono", monospace';
  const clockFont = '900 13.5px "JetBrains Mono", monospace';

  ctx.font = tagFont;
  const tagSlotW = Math.max(
    38,
    Math.ceil(Math.max(ctx.measureText(redTag).width, ctx.measureText(blueTag).width)) + 4
  );
  ctx.font = scoreFont;
  const scorePillW = Math.max(
    26,
    Math.ceil(Math.max(ctx.measureText(String(state.redScore)).width, ctx.measureText(String(state.blueScore)).width) + 12)
  );
  ctx.font = clockFont;
  const clockBlockW = Math.max(70, Math.ceil(ctx.measureText(clockStr).width + 28));

  const flagW = 30;
  const flagH = 21;
  const dotR = 4;
  const dotDiam = dotR * 2;
  const gap = 6.5;
  const wingGap = 8;
  const padRight = 12;
  const emblemW = 22;
  const emblemH = 30;
  const scorePillH = 28;
  const wingLeftW = wingGap + flagW + gap + dotDiam + gap + tagSlotW + gap + scorePillW;
  const wingRightW = scorePillW + gap + tagSlotW + gap + dotDiam + gap + flagW + padRight;
  const barW = clockBlockW + wingLeftW + gap + emblemW + gap + wingRightW;
  const barH = 42;
  const barY = top + 4;
  const left = centerX - barW / 2;
  const cy = barY + barH / 2;

  // Dark obsidian main pill bar
  drawRoundedRect(ctx, left, barY, barW, barH, barH / 2);
  ctx.fillStyle = '#11151d';
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  drawRoundedRect(ctx, left, barY, barW, barH, barH / 2);
  ctx.clip();

  // Left solid white rounded timer pill block + violet divider
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, barY, clockBlockW, barH);
  ctx.fillStyle = '#8b5cf6';
  ctx.fillRect(left + clockBlockW - 3, barY, 3, barH);

  ctx.font = clockFont;
  ctx.fillStyle = '#0b0e14';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clockStr, left + (clockBlockW - 3) / 2 + 2, cy + 0.5);

  const redDotColor = String(state.redKit?.primaryColor || state.redColor || '#e74c3c');
  const blueDotColor = String(state.blueKit?.primaryColor || state.blueColor || '#00e5ff');

  const drawTeamDot = (cx: number, color: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.stroke();
    ctx.restore();
  };

  const drawScorePill = (x: number, score: number) => {
    const py = cy - scorePillH / 2;
    drawRoundedRect(ctx, x, py, scorePillW, scorePillH, 7);
    ctx.fillStyle = makeVerticalLinearGradient(ctx, x, py, scorePillH, [
      [0, '#27c28a'],
      [1, '#14855d']
    ]);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(167, 243, 208, 0.45)';
    ctx.stroke();
    ctx.font = scoreFont;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(score), x + scorePillW / 2, cy + 0.5);
  };

  let curX = left + clockBlockW + wingGap;
  drawWcFlagBadge(ctx, curX, cy - flagH / 2, flagW, flagH, 'rect', state.redKit, redDotColor);
  curX += flagW + gap;

  drawTeamDot(curX + dotR, redDotColor);
  curX += dotDiam + gap;

  ctx.font = tagFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(redTag, curX + tagSlotW / 2, cy + 0.5);
  curX += tagSlotW + gap;

  drawScorePill(curX, state.redScore);
  curX += scorePillW + gap;

  // High-contrast white/black central '26' emblem with red top & blue bottom accents
  const emY = cy - emblemH / 2;
  ctx.save();
  drawRoundedRect(ctx, curX, emY, emblemW, emblemH, 6);
  ctx.clip();
  ctx.fillStyle = makeVerticalLinearGradient(ctx, curX, emY, emblemH, [
    [0, '#ffffff'],
    [1, '#e2e8f0']
  ]);
  ctx.fillRect(curX, emY, emblemW, emblemH);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(curX, emY, emblemW, 3);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(curX, emY + emblemH - 3, emblemW, 3);
  ctx.restore();

  drawRoundedRect(ctx, curX, emY, emblemW, emblemH, 6);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  ctx.font = '900 11.5px "Space Grotesk", system-ui, sans-serif';
  ctx.fillStyle = '#0b0e14';
  ctx.fillText('26', curX + emblemW / 2, cy + 0.5);
  curX += emblemW + gap;

  drawScorePill(curX, state.blueScore);
  curX += scorePillW + gap;

  ctx.font = tagFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(blueTag, curX + tagSlotW / 2, cy + 0.5);
  curX += tagSlotW + gap;

  drawTeamDot(curX + dotR, blueDotColor);
  curX += dotDiam + gap;

  drawWcFlagBadge(ctx, curX, cy - flagH / 2, flagW, flagH, 'rect', state.blueKit, blueDotColor);
  ctx.restore();

  drawRoundedRect(ctx, left, barY, barW, barH, barH / 2);
  ctx.lineWidth = isWarning ? 1.8 : 1.5;
  ctx.strokeStyle = isWarning ? '#ef4444' : '#334155';
  ctx.stroke();

  if (state.isGoldenGoal) drawGoldenGoalEmblem(ctx, left + barW + 24, cy);
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

  // World Cup Broadcast Scoreboards (wc2006..wc2026) matching MatchScoreboard.svelte
  if (design === 'wc2006') {
    drawWc2006Scoreboard(ctx, state, centerX, top, clockStr, isWarning);
  } else if (design === 'wc2010') {
    drawWc2010Scoreboard(ctx, state, centerX, top, clockStr, isWarning);
  } else if (design === 'wc2014') {
    drawWc2014Scoreboard(ctx, state, centerX, top, clockStr, isWarning);
  } else if (design === 'wc2018') {
    drawWc2018Scoreboard(ctx, state, centerX, top, clockStr, isWarning);
  } else if (design === 'wc2022') {
    drawWc2022Scoreboard(ctx, state, centerX, top, clockStr, isWarning);
  } else {
    drawWc2026Scoreboard(ctx, state, centerX, top, clockStr, isWarning);
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
  const h = 26;

  const ping = Math.max(0, Math.round(telemetry.pingMs));
  const fps = Math.max(1, Math.round(telemetry.fps));
  const pingColor = ping <= 65 ? '#4ade80' : ping <= 130 ? '#fbbf24' : '#f87171';

  ctx.font = '700 11px "JetBrains Mono", monospace';
  const pingLabel = 'Ping:';
  const pingVal = `${ping}ms`;
  const sepLabel = '|';
  const fpsLabel = 'FPS:';
  const fpsVal = `${fps}`;

  const xPingLabel = x + 21;
  const xPingVal = xPingLabel + Math.max(33, ctx.measureText(pingLabel).width) + 5;
  const xSep = xPingVal + Math.max(30, ctx.measureText(pingVal).width) + 7;
  const xFpsLabel = xSep + Math.max(5, ctx.measureText(sepLabel).width) + 7;
  const xFpsVal = xFpsLabel + Math.max(28, ctx.measureText(fpsLabel).width) + 5;
  const w = Math.max(180, Math.ceil(xFpsVal + Math.max(20, ctx.measureText(fpsVal).width) + 12 - x));

  drawRoundedRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = 'rgba(9, 13, 22, 0.8)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + 11.5, y + 13, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = '#22c55e';
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(pingLabel, xPingLabel, y + 13.5);
  ctx.fillStyle = pingColor;
  ctx.fillText(pingVal, xPingVal, y + 13.5);
  ctx.fillStyle = '#475569';
  ctx.fillText(sepLabel, xSep, y + 13.5);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(fpsLabel, xFpsLabel, y + 13.5);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(fpsVal, xFpsVal, y + 13.5);

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
  const lines = getVisibleReplayChat(state.chatMessages, state.currentTimeSec, Infinity, 3);
  if (lines.length === 0) return;

  ctx.save();
  const opacity = normalizeReplayOpacity(state.chatOpacity, 0.95);
  ctx.globalAlpha = opacity;
  const x = 16;
  const lineHeight = 18;
  const padY = 5;
  const totalH = lines.length * lineHeight + padY * 2;
  const bottomMargin = state.showExtendedHud ? 46 : 16;
  const top = REPLAY_STAGE_HEIGHT - bottomMargin - totalH;

  drawRoundedRect(ctx, x, top, 390, totalH, 8);
  ctx.fillStyle = 'rgba(9, 13, 22, 0.72)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lines.forEach((msg, idx) => {
    const y = top + padY + idx * lineHeight + lineHeight / 2;
    ctx.font = '700 11px Inter, system-ui, sans-serif';
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

    ctx.font = '500 11px Inter, system-ui, sans-serif';
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
  const overlayView = resolveReplayOverlayView(state.uiOverlay);
  if (overlayView === 'NONE') return;
  const ui = state.uiOverlay!;
  const isStatsOpen = overlayView === 'STATS';
  const isMenuOpen = overlayView === 'MENU';

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
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4'
  ];
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

function applyReplayDiscRadii(
  snapshot: GameStateSnapshot,
  ballRadius?: number,
  playerRadius?: number
): GameStateSnapshot {
  if (ballRadius === undefined && playerRadius === undefined) {
    return snapshot;
  }
  return {
    ...snapshot,
    discs: snapshot.discs.map((d) => {
      const isBall = d.team === 0 || (d.id === 0 && d.team !== 1 && d.team !== 2);
      const radius = isBall ? ballRadius : playerRadius;
      return radius !== undefined ? ({ ...d, radius } as GameStateSnapshot['discs'][number]) : d;
    })
  };
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

  const hudState = deriveReplayHudTimelineState(replay, f0, currentTimeSec);
  const modifiers = getActiveReplayModifiersAtTime(replay, currentTimeSec);

  const discRendererAny = renderer.discRenderer as unknown as
    | {
        replayEmotes?: Map<number, { emoji: string; progress: number }>;
        ballRadius?: number;
        playerRadius?: number;
      }
    | undefined;
  if (discRendererAny) {
    if (modifiers.ballRadius !== undefined) {
      discRendererAny.ballRadius = modifiers.ballRadius;
    }
    if (modifiers.playerRadius !== undefined) {
      discRendererAny.playerRadius = modifiers.playerRadius;
    }
    if (!(discRendererAny.replayEmotes instanceof Map)) {
      discRendererAny.replayEmotes = new Map<number, { emoji: string; progress: number }>();
    } else {
      discRendererAny.replayEmotes.clear();
    }
    for (const emote of hudState.activeEmotes) {
      discRendererAny.replayEmotes.set(emote.playerId, {
        emoji: emote.emoji,
        progress: emote.progress
      });
    }
  }

  const renderSnap0 = applyReplayDiscRadii(f0.snapshot, modifiers.ballRadius, modifiers.playerRadius);
  const renderSnap1 = applyReplayDiscRadii(f1.snapshot, modifiers.ballRadius, modifiers.playerRadius);

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
      renderSnap0,
      renderSnap1,
      alpha,
      followPlayerId ?? undefined,
      EXPORT_FIXED_DT_SEC
    );
  } else {
    renderer.render(renderSnap0, renderSnap1, alpha, followPlayerId ?? undefined);
  }

  const dprScaleX = ctx.canvas.width / REPLAY_STAGE_WIDTH;
  const dprScaleY = ctx.canvas.height / REPLAY_STAGE_HEIGHT;
  ctx.save();
  ctx.setTransform(dprScaleX, 0, 0, dprScaleY, 0, 0);
  renderReplayHudOverlay(
    ctx,
    hudState,
    REPLAY_STAGE_WIDTH,
    REPLAY_STAGE_HEIGHT
  );
  ctx.restore();
}

function buildCleanWebmFilename(roomName?: string, mimeType = 'video/webm'): string {
  const cleanBase = (roomName || 'legacyx-replay')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const ext = mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
  return `${cleanBase || 'legacyx-replay'}.${ext}`;
}

interface ResolvedWebCodecsExportConfig {
  encoderConfig: VideoEncoderConfig;
  muxCodec: WebmVideoCodec;
  mimeType: string;
}

async function pickSupportedWebCodecsConfig(
  width: number,
  height: number,
  fps: number
): Promise<ResolvedWebCodecsExportConfig | null> {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined' ||
    typeof VideoEncoder.isConfigSupported !== 'function'
  ) {
    return null;
  }

  const candidates: Array<{ codec: string; muxCodec: WebmVideoCodec; mimeType: string }> = [
    { codec: 'vp09.00.41.08', muxCodec: 'V_VP9', mimeType: 'video/webm;codecs=vp9' },
    { codec: 'vp09.00.40.08', muxCodec: 'V_VP9', mimeType: 'video/webm;codecs=vp9' },
    { codec: 'vp8', muxCodec: 'V_VP8', mimeType: 'video/webm;codecs=vp8' }
  ];

  for (const cand of candidates) {
    try {
      const config: VideoEncoderConfig = {
        codec: cand.codec,
        width,
        height,
        bitrate: 6_000_000,
        framerate: fps
      };
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        return {
          encoderConfig: support.config ?? config,
          muxCodec: cand.muxCodec,
          mimeType: cand.mimeType
        };
      }
    } catch {
      // Probar siguiente códec candidato
    }
  }
  return null;
}

async function exportReplayWithWebCodecs(
  canvas: HTMLCanvasElement,
  renderer: GameRenderer,
  ctx: CanvasRenderingContext2D,
  replay: LxrReplayFile,
  totalDuration: number,
  totalFrames: number,
  effZoom: number,
  followPlayerId: number | null,
  lastKitSigRef: { value: string },
  webCodecs: ResolvedWebCodecsExportConfig,
  onProgress?: (pct: number) => void
): Promise<WebmExportResult> {
  const muxer = new WebmMuxer({
    width: REPLAY_STAGE_WIDTH,
    height: REPLAY_STAGE_HEIGHT,
    fps: EXPORT_FIXED_FPS,
    codec: webCodecs.muxCodec
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      muxer.addVideoFrame(bytes, chunk.type === 'key', chunk.timestamp);
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    }
  });

  const frameDurationUs = Math.round(1_000_000 / EXPORT_FIXED_FPS);
  try {
    encoder.configure(webCodecs.encoderConfig);
    onProgress?.(0);

    for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
      if (encodeError) throw encodeError;
      while (encoder.encodeQueueSize > 8 && !encodeError) {
        await yieldCooperativeTick();
      }
      if (encodeError) throw encodeError;

      const virtualTimeSec =
        frameIndex === 0 ? 0 : Math.min(totalDuration, frameIndex * EXPORT_FIXED_DT_SEC);
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

      const timestampUs = Math.round((frameIndex * 1_000_000) / EXPORT_FIXED_FPS);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurationUs
      });
      try {
        encoder.encode(videoFrame, { keyFrame: frameIndex % 120 === 0 });
      } finally {
        videoFrame.close();
      }

      if (frameIndex > 0 && frameIndex % 4 === 0) {
        await yieldCooperativeTick();
      }
      onProgress?.(Math.min(99, Math.round((frameIndex / totalFrames) * 100)));
    }

    await encoder.flush();
    if (encodeError) throw encodeError;

    const blob = muxer.finalize();
    onProgress?.(100);
    return {
      blob,
      filename: buildCleanWebmFilename(replay.roomName),
      mimeType: webCodecs.mimeType
    };
  } finally {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      // Ignorado
    }
  }
}

async function exportReplayWithMediaRecorder(
  canvas: HTMLCanvasElement,
  renderer: GameRenderer,
  ctx: CanvasRenderingContext2D,
  replay: LxrReplayFile,
  totalDuration: number,
  totalFrames: number,
  effZoom: number,
  followPlayerId: number | null,
  lastKitSigRef: { value: string },
  onProgress?: (pct: number) => void
): Promise<WebmExportResult> {
  if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
    throw new Error('Tu navegador no soporta captura de canvas a video WebM.');
  }

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
      const outMime = mimeType || recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: outMime });
      resolve({
        blob,
        filename: buildCleanWebmFilename(replay.roomName, outMime),
        mimeType: outMime
      });
    };
  });

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
  }
}

export async function exportReplayToWebm(
  replay: LxrReplayFile,
  onProgress?: (pct: number) => void,
  options?: { followRecorder?: boolean }
): Promise<WebmExportResult> {
  if (!replay || !Array.isArray(replay.frames) || replay.frames.length === 0) {
    throw new Error('La repetición no contiene frames reproducibles.');
  }
  if (typeof document === 'undefined') {
    throw new Error('La exportación a video WebM no es compatible en este entorno.');
  }

  const webCodecs = await pickSupportedWebCodecsConfig(
    REPLAY_STAGE_WIDTH,
    REPLAY_STAGE_HEIGHT,
    EXPORT_FIXED_FPS
  );
  if (!webCodecs && typeof MediaRecorder === 'undefined') {
    throw new Error('La exportación a video WebM no es compatible en este entorno.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = REPLAY_STAGE_WIDTH;
  canvas.height = REPLAY_STAGE_HEIGHT;
  canvas.style.width = `${REPLAY_STAGE_WIDTH}px`;
  canvas.style.height = `${REPLAY_STAGE_HEIGHT}px`;

  if (!webCodecs && typeof canvas.captureStream !== 'function') {
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

  try {
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
    const lastKitSigRef = { value: JSON.stringify(getActiveReplayKitsAtTime(replay, 0)) };

    if (webCodecs) {
      return await exportReplayWithWebCodecs(
        canvas,
        renderer,
        ctx,
        replay,
        totalDuration,
        totalFrames,
        effZoom,
        followPlayerId,
        lastKitSigRef,
        webCodecs,
        onProgress
      );
    }

    return await exportReplayWithMediaRecorder(
      canvas,
      renderer,
      ctx,
      replay,
      totalDuration,
      totalFrames,
      effZoom,
      followPlayerId,
      lastKitSigRef,
      onProgress
    );
  } finally {
    renderer.destroy();
  }
}

function isMobileOrNativeShareEnv(): boolean {
  try {
    if (typeof Capacitor !== 'undefined' && Boolean(Capacitor?.isNativePlatform?.())) {
      return true;
    }
  } catch {
    // Ignored
  }
  if (typeof navigator !== 'undefined') {
    const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
    if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) {
      return true;
    }
    if (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) {
      return true;
    }
  }
  if (typeof window !== 'undefined') {
    if ('ontouchstart' in window) return true;
    try {
      if (window.matchMedia?.('(pointer: coarse)')?.matches) return true;
    } catch {
      // Ignored
    }
  }
  return false;
}

function triggerAnchorDownload(result: WebmExportResult): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body?.appendChild(a);
  a.click();
  document.body?.removeChild(a);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }, 1500);
}

export function triggerWebmDownload(result: WebmExportResult): void {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const shouldTryNativeShare =
    Boolean(nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') &&
    (isMobileOrNativeShareEnv() || typeof window === 'undefined');

  if (shouldTryNativeShare && nav && typeof File !== 'undefined') {
    try {
      const cleanMime = (result.mimeType || result.blob.type || 'video/webm').split(';')[0] || 'video/webm';
      const videoFile = new File([result.blob], result.filename, { type: cleanMime });
      if (nav.canShare?.({ files: [videoFile] })) {
        void Promise.resolve(
          nav.share({
            files: [videoFile],
            title: result.filename
          })
        ).catch((err: unknown) => {
          const errName = (err as { name?: string } | null)?.name;
          if (errName !== 'AbortError') {
            triggerAnchorDownload(result);
          }
        });
        return;
      }
    } catch {
      // Fallback to anchor download below
    }
  }

  triggerAnchorDownload(result);
}
