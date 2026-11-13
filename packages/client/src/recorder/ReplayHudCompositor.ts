import { createStadium, MatchPhase, type StadiumId } from '@legacyx/core';
import { GameRenderer } from '../renderer/GameRenderer.js';
import type { PlayerVisualInfo } from '../renderer/DiscRenderer.js';
import type { MatchBannerPayload } from '../ui/state/gameUI.svelte.js';
import type {
  LxrBannerEvent,
  LxrChatEntry,
  LxrFrame,
  LxrReplayFile,
  LxrReplayV2
} from './MatchRecorder.svelte.js';

export const REPLAY_STAGE_WIDTH = 1280;
export const REPLAY_STAGE_HEIGHT = 720;

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
  activeBanner: MatchBannerPayload | null;
  currentTimeSec: number;
  timeLimitSeconds?: number;
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

export interface WebmExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
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

export function buildReplayPlayerInfos(replay: LxrReplayFile): Map<number, PlayerVisualInfo> {
  const playerInfos = new Map<number, PlayerVisualInfo>();
  for (const p of replay.players || []) {
    const kit = p.team === 'red' ? replay.redKit : p.team === 'blue' ? replay.blueKit : undefined;
    playerInfos.set(p.id, {
      nickname: p.nickname,
      number: p.number ?? p.id,
      avatar: p.avatar || String(p.id),
      avatarType: (p.avatarType as 'emoji' | 'text' | 'letters') || 'letters',
      hasOutline: true,
      tertiaryColor: String((kit as Record<string, unknown> | undefined)?.borderColor || '#ffffff'),
      kit: kit as PlayerVisualInfo['kit']
    });
  }
  return playerInfos;
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

function defaultBannerDurationSec(payload: MatchBannerPayload): number {
  if (typeof payload.durationMs === 'number' && payload.durationMs > 0) {
    return payload.durationMs / 1000;
  }
  switch (payload.kind) {
    case 'PAUSED':
      return Number.POSITIVE_INFINITY;
    case 'VICTORY':
      return 5.5;
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
): MatchBannerPayload | null {
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

function drawRoomCard(ctx: CanvasRenderingContext2D, roomName: string): void {
  ctx.save();
  ctx.font = '700 13px Inter, system-ui, sans-serif';
  const label = (roomName || 'Sala LegacyX-GO').slice(0, 32);
  const textWidth = ctx.measureText(label).width;
  const width = Math.max(150, Math.min(300, textWidth + 52));

  drawRoundedRect(ctx, 16, 10, width, 40, 12);
  ctx.fillStyle = 'rgba(11, 15, 25, 0.86)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(34, 30, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 48, 30);
  ctx.restore();
}

function drawScoreboard(ctx: CanvasRenderingContext2D, state: ReplayHudOverlayState): void {
  const centerX = REPLAY_STAGE_WIDTH / 2;
  const barW = 336;
  const barH = 44;
  const left = centerX - barW / 2;
  const top = 8;

  const isWarning = isReplayTimerWarning(state.matchTimer, state.phase, state.isGoldenGoal);
  const pulse = 0.55 + 0.45 * Math.sin(state.currentTimeSec * 7.5);

  ctx.save();
  if (isWarning) {
    ctx.shadowColor = `rgba(239, 68, 68, ${0.45 + pulse * 0.45})`;
    ctx.shadowBlur = 16;
  }

  drawRoundedRect(ctx, left, top, barW, barH, 12);
  ctx.fillStyle = isWarning ? 'rgba(38, 12, 18, 0.92)' : 'rgba(11, 15, 25, 0.9)';
  ctx.fill();
  ctx.lineWidth = isWarning ? 1.8 : 1;
  ctx.strokeStyle = isWarning
    ? `rgba(248, 113, 113, ${0.55 + pulse * 0.45})`
    : 'rgba(148, 163, 184, 0.28)';
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Red chip
  drawRoundedRect(ctx, left + 8, top + 7, 108, 30, 8);
  ctx.fillStyle = state.redColor || '#ef4444';
  ctx.fill();
  ctx.font = '800 13px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.redAcronym.slice(0, 6), left + 18, top + 22);
  ctx.font = '900 18px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(state.redScore), left + 106, top + 22);

  // Clock
  ctx.textAlign = 'center';
  ctx.font = '800 18px "JetBrains Mono", monospace';
  ctx.fillStyle = state.isGoldenGoal
    ? '#fbbf24'
    : isWarning
      ? '#fca5a5'
      : '#f8fafc';
  ctx.fillText(formatClock(state.matchTimer), centerX, top + 23);

  // Blue chip
  drawRoundedRect(ctx, left + barW - 116, top + 7, 108, 30, 8);
  ctx.fillStyle = state.blueColor || '#3b82f6';
  ctx.fill();
  ctx.font = '900 18px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(String(state.blueScore), left + barW - 106, top + 22);
  ctx.font = '800 13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(state.blueAcronym.slice(0, 6), left + barW - 18, top + 22);

  // Golden Goal mini-card docked right of scoreboard
  if (state.isGoldenGoal) {
    const ggLeft = left + barW + 10;
    drawRoundedRect(ctx, ggLeft, top + 4, 134, 36, 10);
    ctx.fillStyle = 'rgba(42, 29, 7, 0.94)';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = 'rgba(251, 191, 36, 0.9)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(ggLeft + 20, top + 22, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.restore();

    ctx.font = '800 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOL DE ORO', ggLeft + 34, top + 22);
  }

  ctx.restore();
}

function drawChatOverlay(ctx: CanvasRenderingContext2D, state: ReplayHudOverlayState): void {
  const lines = getVisibleReplayChat(state.chatMessages, state.currentTimeSec);
  if (lines.length === 0) return;

  ctx.save();
  const x = 16;
  const lineHeight = 25;
  const padY = 8;
  const totalH = lines.length * lineHeight + padY * 2;
  const top = REPLAY_STAGE_HEIGHT - 16 - totalH;

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
  banner: MatchBannerPayload | null,
  state: ReplayHudOverlayState
): void {
  if (!banner || banner.kind === 'NONE') return;

  const cx = REPLAY_STAGE_WIDTH / 2;
  const cy = 225;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

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

    ctx.font = '900 22px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, cx, cy);
    ctx.restore();
    return;
  }

  if (banner.kind === 'GOAL') {
    const isRed = banner.scoringTeam === 'red';
    const accent = isRed ? '#ef4444' : '#3b82f6';
    const hasBadges =
      typeof banner.speedKmh === 'number' || Boolean(banner.isPower) || Boolean(banner.isCurve);
    const boxH = hasBadges ? 116 : 86;

    drawRoundedRect(ctx, cx - 240, cy - boxH / 2, 480, boxH, 16);
    ctx.fillStyle = 'rgba(11, 15, 25, 0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = accent;
    ctx.stroke();

    ctx.font = '900 28px Inter, system-ui, sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(banner.isOwnGoal ? '¡AUTOGOL!' : '¡GOOOL!', cx, cy - boxH / 2 + 28);

    const scorerLine = banner.assisterName
      ? `${banner.scorerName || 'Jugador'} (Asist: ${banner.assisterName})`
      : banner.scorerName || 'Jugador';
    ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(scorerLine, cx, cy - boxH / 2 + 58);

    if (hasBadges) {
      const chips: Array<{ text: string; bg: string; border: string; fg: string }> = [];
      if (typeof banner.speedKmh === 'number' && banner.speedKmh > 0) {
        chips.push({
          text: `${Math.round(banner.speedKmh)} km/h`,
          bg: 'rgba(15, 23, 42, 0.95)',
          border: 'rgba(148, 163, 184, 0.45)',
          fg: '#e2e8f0'
        });
      }
      if (banner.isPower) {
        chips.push({
          text: 'POTENTE',
          bg: 'rgba(124, 45, 18, 0.92)',
          border: '#f97316',
          fg: '#fed7aa'
        });
      }
      if (banner.isCurve) {
        chips.push({
          text: 'EFECTO',
          bg: 'rgba(8, 51, 68, 0.92)',
          border: '#22d3ee',
          fg: '#a5f3fc'
        });
      }
      const chipW = 104;
      const gap = 10;
      const totalChipsW = chips.length * chipW + (chips.length - 1) * gap;
      let chipX = cx - totalChipsW / 2;
      const chipY = cy + boxH / 2 - 22;

      ctx.font = '800 11px Inter, system-ui, sans-serif';
      for (const chip of chips) {
        drawRoundedRect(ctx, chipX, chipY - 12, chipW, 24, 999);
        ctx.fillStyle = chip.bg;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = chip.border;
        ctx.stroke();
        ctx.fillStyle = chip.fg;
        ctx.fillText(chip.text, chipX + chipW / 2, chipY);
        chipX += chipW + gap;
      }
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

  drawRoomCard(ctx, state.roomName);
  drawScoreboard(ctx, state);
  drawChatOverlay(ctx, state);
  drawCenterBanner(ctx, state.activeBanner, state);

  ctx.restore();
}

export function deriveHudOverlayStateFromReplay(
  replay: LxrReplayFile,
  f0: LxrFrame,
  currentTimeSec: number
): ReplayHudOverlayState {
  const v2 = replay.magic === 'LXR2' ? (replay as LxrReplayV2) : null;
  const redKit = replay.redKit as Record<string, unknown> | undefined;
  const blueKit = replay.blueKit as Record<string, unknown> | undefined;

  return {
    roomName: replay.roomName || 'Repetición LegacyX-GO',
    phase: f0.snapshot.phase,
    matchTimer: f0.snapshot.matchTimer ?? 0,
    redScore: f0.snapshot.redScore ?? replay.redScore ?? 0,
    blueScore: f0.snapshot.blueScore ?? replay.blueScore ?? 0,
    isGoldenGoal: Boolean(f0.snapshot.isGoldenGoal),
    redAcronym: String(redKit?.tag || 'RED').slice(0, 6),
    blueAcronym: String(blueKit?.tag || 'BLUE').slice(0, 6),
    redColor: String(redKit?.primaryColor || '#ef4444'),
    blueColor: String(blueKit?.primaryColor || '#3b82f6'),
    chatMessages: v2?.chatMessages ?? [],
    activeBanner: getActiveReplayBanner(v2?.banners, currentTimeSec),
    currentTimeSec,
    timeLimitSeconds: v2?.timeLimitSeconds
  };
}

function pickSupportedWebmMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
}

function scheduleNextVideoTick(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => fn());
  } else {
    setTimeout(fn, 16);
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
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto Canvas 2D para exportar.');
  }

  const stadium = createStadium((replay.stadiumId || 'mediano') as StadiumId);
  const playerInfos = buildReplayPlayerInfos(replay);
  const renderer = new GameRenderer(canvas, { stadium, playerInfos });
  renderer.safeAreaBottom = 0;
  renderer.chatHeight = 0;
  renderer.minimapEnabled = true;

  if (replay.redKit || replay.blueKit) {
    renderer.setTeamKits(
      (replay.redKit ?? null) as unknown as Parameters<GameRenderer['setTeamKits']>[0],
      (replay.blueKit ?? null) as unknown as Parameters<GameRenderer['setTeamKits']>[1]
    );
  }
  renderer.resize(REPLAY_STAGE_WIDTH, REPLAY_STAGE_HEIGHT);

  const v2 = replay.magic === 'LXR2' ? (replay as LxrReplayV2) : null;
  const effZoom = computeReplayEffectiveZoom(
    v2?.cameraZoom ?? 1,
    v2?.viewportWidth ?? REPLAY_STAGE_WIDTH,
    v2?.viewportHeight ?? REPLAY_STAGE_HEIGHT,
    REPLAY_STAGE_WIDTH,
    REPLAY_STAGE_HEIGHT
  );
  const followPlayerId =
    options?.followRecorder !== false && v2?.recordingPlayerId != null ? v2.recordingPlayerId : null;
  renderer.focusBallOnly = followPlayerId == null;

  const totalDuration = Math.max(
    0.5,
    replay.durationSeconds || replay.frames[replay.frames.length - 1]!.t || 0.5
  );

  const stream = canvas.captureStream(60);
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

  try {
    onProgress?.(0);
    recorder.start(250);
    const exportStartMs = performance.now();

    await new Promise<void>((resolveLoop) => {
      const step = () => {
        const currentTimeSec = (performance.now() - exportStartMs) / 1000;
        const clampedTime = Math.min(totalDuration, currentTimeSec);
        const { f0, f1, alpha } = sampleReplayFrame(replay.frames, clampedTime);

        renderer.camera.setZoom(effZoom);
        renderer.scale = effZoom;
        renderer.render(f0.snapshot, f1.snapshot, alpha, followPlayerId ?? undefined);

        const dprScaleX = canvas.width / REPLAY_STAGE_WIDTH;
        const dprScaleY = canvas.height / REPLAY_STAGE_HEIGHT;
        ctx.save();
        ctx.setTransform(dprScaleX, 0, 0, dprScaleY, 0, 0);
        renderReplayHudOverlay(
          ctx,
          deriveHudOverlayStateFromReplay(replay, f0, clampedTime),
          REPLAY_STAGE_WIDTH,
          REPLAY_STAGE_HEIGHT
        );
        ctx.restore();

        onProgress?.(Math.min(99, Math.round((clampedTime / totalDuration) * 100)));

        if (currentTimeSec >= totalDuration) {
          resolveLoop();
          return;
        }
        scheduleNextVideoTick(step);
      };
      scheduleNextVideoTick(step);
    });

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
