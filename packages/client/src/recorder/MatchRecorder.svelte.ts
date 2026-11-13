import type { CompactDiscState, GameStateSnapshot } from '@legacyx/core';
import type { MatchBannerPayload } from '../ui/state/gameUI.svelte.js';
import { userProfile } from '../ui/state/userProfile.svelte.js';

export type LxrRoomType = 'casual' | 'ranked';

export type LxrScoreboardDesign =
  | 'original'
  | 'wc2006'
  | 'wc2010'
  | 'wc2014'
  | 'wc2018'
  | 'wc2022'
  | 'wc2026';

export type LxrBallSkin =
  | 'classic'
  | 'retro'
  | 'neon'
  | 'cyber'
  | 'gold'
  | 'solid'
  | 'wc2006'
  | 'wc2010'
  | 'wc2014'
  | 'wc2018'
  | 'wc2022'
  | 'wc2026'
  | 'futsal';

export type LxrTheme = 'dark' | 'light';

export interface LxrPlayerMeta {
  id: number;
  nickname: string;
  team: 'red' | 'blue' | 'spectator';
  avatar?: string;
  avatarType?: string;
  number?: number | string;
}

export interface LxrGoalMarker {
  t: number;
  scoringTeam: 'red' | 'blue';
  scorerName: string;
  redScore: number;
  blueScore: number;
}

export interface LxrChatEntry {
  t: number;
  kind: 'chat' | 'system' | 'goal' | 'whisper' | 'team';
  sender: string;
  senderTeam?: 'RED' | 'BLUE' | 'SPECTATOR';
  text: string;
}

export type LxrBannerPayload = Omit<MatchBannerPayload, 'kind'> & {
  kind: MatchBannerPayload['kind'] | 'GOAL_REPLAY';
};

export interface LxrBannerEvent {
  t: number;
  payload: LxrBannerPayload;
}

export interface LxrTelemetryPayload {
  pingMs: number;
  fps: number;
}

export interface LxrScoreEventPayload {
  kind: string;
  points: number;
  label: string;
  playerName: string;
  team: 'red' | 'blue' | 'neutral';
  color?: string;
}

export interface LxrChatPayload {
  kind: 'chat' | 'system' | 'goal' | 'whisper' | 'team';
  sender: string;
  senderTeam?: 'RED' | 'BLUE' | 'SPECTATOR';
  text: string;
}

export interface LxrUiOverlayState {
  overlay: string;
  activeSlide: string;
  isPaused: boolean;
  postMatchStats: Record<string, unknown> | null;
}

export interface LxrKitsUpdatedPayload {
  redKit?: Record<string, unknown>;
  blueKit?: Record<string, unknown>;
}

export type LxrHudEvent =
  | { t: number; type: 'telemetry'; payload: LxrTelemetryPayload }
  | { t: number; type: 'score_event'; payload: LxrScoreEventPayload }
  | { t: number; type: 'chat'; payload: LxrChatPayload }
  | { t: number; type: 'banner'; payload: LxrBannerPayload }
  | { t: number; type: 'ui_overlay'; payload: LxrUiOverlayState }
  | { t: number; type: 'kits_updated'; payload: LxrKitsUpdatedPayload };

export interface LxrFrame {
  t: number;
  snapshot: GameStateSnapshot;
}

export interface LxrReplayV1 {
  magic: 'LXR1';
  version: 1;
  createdAt: string;
  roomName: string;
  stadiumId: string;
  durationSeconds: number;
  redScore: number;
  blueScore: number;
  redKit?: Record<string, unknown>;
  blueKit?: Record<string, unknown>;
  players: LxrPlayerMeta[];
  frames: LxrFrame[];
  goals: LxrGoalMarker[];
}

export interface LxrReplayV2 {
  magic: 'LXR2';
  version: 2;
  createdAt: string;
  roomName: string;
  stadiumId: string;
  durationSeconds: number;
  redScore: number;
  blueScore: number;
  recordingPlayerId: number | null;
  recordingPlayerName: string;
  cameraZoom: number;
  viewportWidth: number;
  viewportHeight: number;
  timeLimitSeconds: number;
  redKit?: Record<string, unknown>;
  blueKit?: Record<string, unknown>;
  players: LxrPlayerMeta[];
  chatMessages: LxrChatEntry[];
  banners: LxrBannerEvent[];
  frames: LxrFrame[];
  goals: LxrGoalMarker[];
}

export interface LxrReplayV3 {
  magic: 'LXR3';
  version: 3;
  createdAt: string;
  roomName: string;
  roomType: LxrRoomType;
  stadiumId: string;
  durationSeconds: number;
  redScore: number;
  blueScore: number;
  recordingPlayerId: number | null;
  recordingPlayerName: string;
  cameraZoom: number;
  viewportWidth: number;
  viewportHeight: number;
  timeLimitSeconds: number;
  scoreboardDesign: LxrScoreboardDesign;
  theme: LxrTheme;
  ballMode: 'texture' | 'color';
  ballSkin: LxrBallSkin;
  ballCustomColor: string;
  chatOpacity: number;
  minimapEnabled: boolean;
  minimapOpacity: number;
  minimapSize: 'small' | 'medium' | 'large' | number;
  minimapCameraFrustum: boolean;
  redKit?: Record<string, unknown>;
  blueKit?: Record<string, unknown>;
  players: LxrPlayerMeta[];
  initialChatMessages: LxrChatEntry[];
  initialUiOverlay: LxrUiOverlayState;
  chatMessages: LxrChatEntry[];
  banners: LxrBannerEvent[];
  hudEvents: LxrHudEvent[];
  frames: LxrFrame[];
  goals: LxrGoalMarker[];
}

export type LxrReplayFile = LxrReplayV1 | LxrReplayV2 | LxrReplayV3;

export interface MatchRecorderMetadata {
  roomName: string;
  roomType?: LxrRoomType;
  stadiumId: string;
  redKit?: Record<string, unknown>;
  blueKit?: Record<string, unknown>;
  players: LxrPlayerMeta[];
  recordingPlayerId?: number | null;
  recordingPlayerName?: string;
  cameraZoom?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  timeLimitSeconds?: number;
  scoreboardDesign?: LxrScoreboardDesign;
  theme?: LxrTheme;
  ballMode?: 'texture' | 'color';
  ballSkin?: LxrBallSkin;
  ballCustomColor?: string;
  chatOpacity?: number;
  minimapEnabled?: boolean;
  minimapOpacity?: number;
  minimapSize?: 'small' | 'medium' | 'large' | number;
  minimapCameraFrustum?: boolean;
  initialChatMessages?: LxrChatEntry[];
  initialUiOverlay?: Partial<LxrUiOverlayState>;
}

const VALID_SCOREBOARD_DESIGNS = new Set<LxrScoreboardDesign>([
  'original',
  'wc2006',
  'wc2010',
  'wc2014',
  'wc2018',
  'wc2022',
  'wc2026'
]);

const VALID_BALL_SKINS = new Set<LxrBallSkin>([
  'classic',
  'retro',
  'neon',
  'cyber',
  'gold',
  'solid',
  'wc2006',
  'wc2010',
  'wc2014',
  'wc2018',
  'wc2022',
  'wc2026',
  'futsal'
]);

function normalizeScoreboardDesign(val: unknown): LxrScoreboardDesign {
  return typeof val === 'string' && VALID_SCOREBOARD_DESIGNS.has(val as LxrScoreboardDesign)
    ? (val as LxrScoreboardDesign)
    : 'original';
}

function normalizeBallSkin(val: unknown): LxrBallSkin {
  return typeof val === 'string' && VALID_BALL_SKINS.has(val as LxrBallSkin)
    ? (val as LxrBallSkin)
    : 'classic';
}

function cloneKit(kit?: Record<string, unknown>): Record<string, unknown> | undefined {
  return kit ? { ...kit } : undefined;
}

function cloneJsonSafe<T>(val: T): T {
  if (val === null || val === undefined) return val;
  try {
    return JSON.parse(JSON.stringify(val)) as T;
  } catch {
    return val;
  }
}

function defaultUiOverlay(partial?: Partial<LxrUiOverlayState> | null): LxrUiOverlayState {
  return {
    overlay: typeof partial?.overlay === 'string' && partial.overlay ? partial.overlay : 'NONE',
    activeSlide:
      typeof partial?.activeSlide === 'string' && partial.activeSlide ? partial.activeSlide : 'NONE',
    isPaused: Boolean(partial?.isPaused),
    postMatchStats:
      partial?.postMatchStats && typeof partial.postMatchStats === 'object'
        ? cloneJsonSafe(partial.postMatchStats)
        : null
  };
}

function normalizeFiniteOpacity(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function normalizeMinimapSize(raw: unknown): 'small' | 'medium' | 'large' | number {
  if (raw === 'small' || raw === 'medium' || raw === 'large') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  return 'medium';
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

export async function compressReplayGzip(replay: LxrReplayFile): Promise<Uint8Array> {
  const jsonStr = JSON.stringify(replay);
  const uncompressed = new TextEncoder().encode(jsonStr);
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    const writePromise = (async () => {
      await writer.write(uncompressed);
      await writer.close();
    })();

    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    await writePromise;
    return concatChunks(chunks);
  }
  return uncompressed;
}

export function normalizeParsedReplay(parsed: Partial<LxrReplayFile>): LxrReplayFile {
  if (
    !parsed ||
    (parsed.magic !== 'LXR1' && parsed.magic !== 'LXR2' && parsed.magic !== 'LXR3') ||
    !Array.isArray(parsed.frames)
  ) {
    throw new Error('Archivo .lxr inválido o corrupto.');
  }

  const durationFallback =
    parsed.frames.length > 0 ? parsed.frames[parsed.frames.length - 1]!.t : 1;
  const durationSeconds = Math.max(0.5, Number(parsed.durationSeconds ?? durationFallback));

  if (parsed.magic === 'LXR3' || parsed.version === 3) {
    const v3 = parsed as Partial<LxrReplayV3>;
    const hudEvents: LxrHudEvent[] = Array.isArray(v3.hudEvents)
      ? v3.hudEvents
          .filter((ev): ev is LxrHudEvent => Boolean(ev && typeof ev.t === 'number' && ev.type))
          .map((ev) => ({ ...ev, payload: cloneJsonSafe(ev.payload) }) as LxrHudEvent)
          .sort((a, b) => a.t - b.t)
      : [];

    const initialChatMessages: LxrChatEntry[] = Array.isArray(v3.initialChatMessages)
      ? v3.initialChatMessages.map((m) => ({ ...m }))
      : [];

    const chatMessages: LxrChatEntry[] = Array.isArray(v3.chatMessages)
      ? v3.chatMessages.map((m) => ({ ...m }))
      : hudEvents
          .filter((ev): ev is Extract<LxrHudEvent, { type: 'chat' }> => ev.type === 'chat')
          .map((ev) => ({ t: ev.t, ...ev.payload }));

    const banners: LxrBannerEvent[] = Array.isArray(v3.banners)
      ? v3.banners.map((b) => ({ ...b, payload: { ...b.payload } }))
      : hudEvents
          .filter((ev): ev is Extract<LxrHudEvent, { type: 'banner' }> => ev.type === 'banner')
          .map((ev) => ({ t: ev.t, payload: { ...ev.payload } }));

    return {
      magic: 'LXR3',
      version: 3,
      createdAt: v3.createdAt || new Date().toISOString(),
      roomName: v3.roomName || 'Repetición LegacyX-GO',
      roomType: v3.roomType === 'ranked' ? 'ranked' : 'casual',
      stadiumId: v3.stadiumId || 'mediano',
      durationSeconds,
      redScore: Number(v3.redScore ?? 0),
      blueScore: Number(v3.blueScore ?? 0),
      recordingPlayerId: v3.recordingPlayerId ?? null,
      recordingPlayerName: String(v3.recordingPlayerName ?? ''),
      cameraZoom:
        typeof v3.cameraZoom === 'number' && Number.isFinite(v3.cameraZoom) && v3.cameraZoom > 0
          ? v3.cameraZoom
          : 1,
      viewportWidth:
        typeof v3.viewportWidth === 'number' &&
        Number.isFinite(v3.viewportWidth) &&
        v3.viewportWidth > 0
          ? v3.viewportWidth
          : 1280,
      viewportHeight:
        typeof v3.viewportHeight === 'number' &&
        Number.isFinite(v3.viewportHeight) &&
        v3.viewportHeight > 0
          ? v3.viewportHeight
          : 720,
      timeLimitSeconds:
        typeof v3.timeLimitSeconds === 'number' && Number.isFinite(v3.timeLimitSeconds)
          ? v3.timeLimitSeconds
          : 180,
      scoreboardDesign: normalizeScoreboardDesign(v3.scoreboardDesign),
      theme: v3.theme === 'light' ? 'light' : 'dark',
      ballMode: v3.ballMode === 'color' ? 'color' : 'texture',
      ballSkin: normalizeBallSkin(v3.ballSkin),
      ballCustomColor:
        typeof v3.ballCustomColor === 'string' && v3.ballCustomColor.trim()
          ? v3.ballCustomColor
          : '#ffffff',
      chatOpacity: normalizeFiniteOpacity(v3.chatOpacity, 0.95),
      minimapEnabled: v3.minimapEnabled !== false,
      minimapOpacity: normalizeFiniteOpacity(v3.minimapOpacity, 0.6),
      minimapSize: normalizeMinimapSize(v3.minimapSize),
      minimapCameraFrustum: v3.minimapCameraFrustum !== false,
      redKit: cloneKit(v3.redKit),
      blueKit: cloneKit(v3.blueKit),
      players: Array.isArray(v3.players) ? v3.players : [],
      initialChatMessages,
      initialUiOverlay: defaultUiOverlay(v3.initialUiOverlay),
      chatMessages,
      banners,
      hudEvents,
      frames: v3.frames ?? [],
      goals: Array.isArray(v3.goals) ? v3.goals : []
    };
  }

  if (parsed.magic === 'LXR2' || parsed.version === 2) {
    const v2 = parsed as Partial<LxrReplayV2>;
    return {
      magic: 'LXR2',
      version: 2,
      createdAt: v2.createdAt || new Date().toISOString(),
      roomName: v2.roomName || 'Repetición LegacyX-GO',
      stadiumId: v2.stadiumId || 'mediano',
      durationSeconds,
      redScore: Number(v2.redScore ?? 0),
      blueScore: Number(v2.blueScore ?? 0),
      recordingPlayerId: v2.recordingPlayerId ?? null,
      recordingPlayerName: String(v2.recordingPlayerName ?? ''),
      cameraZoom:
        typeof v2.cameraZoom === 'number' && Number.isFinite(v2.cameraZoom) && v2.cameraZoom > 0
          ? v2.cameraZoom
          : 1,
      viewportWidth:
        typeof v2.viewportWidth === 'number' &&
        Number.isFinite(v2.viewportWidth) &&
        v2.viewportWidth > 0
          ? v2.viewportWidth
          : 1280,
      viewportHeight:
        typeof v2.viewportHeight === 'number' &&
        Number.isFinite(v2.viewportHeight) &&
        v2.viewportHeight > 0
          ? v2.viewportHeight
          : 720,
      timeLimitSeconds:
        typeof v2.timeLimitSeconds === 'number' && Number.isFinite(v2.timeLimitSeconds)
          ? v2.timeLimitSeconds
          : 180,
      redKit: v2.redKit,
      blueKit: v2.blueKit,
      players: Array.isArray(v2.players) ? v2.players : [],
      chatMessages: Array.isArray(v2.chatMessages) ? v2.chatMessages : [],
      banners: Array.isArray(v2.banners) ? v2.banners : [],
      frames: v2.frames ?? [],
      goals: Array.isArray(v2.goals) ? v2.goals : []
    };
  }

  return {
    magic: 'LXR1',
    version: 1,
    createdAt: parsed.createdAt || new Date().toISOString(),
    roomName: parsed.roomName || 'Repetición LegacyX-GO',
    stadiumId: parsed.stadiumId || 'mediano',
    durationSeconds,
    redScore: Number(parsed.redScore ?? 0),
    blueScore: Number(parsed.blueScore ?? 0),
    redKit: parsed.redKit,
    blueKit: parsed.blueKit,
    players: Array.isArray(parsed.players) ? parsed.players : [],
    frames: parsed.frames,
    goals: Array.isArray(parsed.goals) ? parsed.goals : []
  };
}

export async function decompressReplayGzip(data: ArrayBuffer | Uint8Array): Promise<LxrReplayFile> {
  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (uint8.length >= 2 && uint8[0] === 0x1f && uint8[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const payloadBytes = new Uint8Array(uint8);
    const writePromise = (async () => {
      await writer.write(payloadBytes);
      await writer.close();
    })();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    await writePromise;
    const str = new TextDecoder().decode(concatChunks(chunks));
    return normalizeParsedReplay(JSON.parse(str) as Partial<LxrReplayFile>);
  }
  const str = new TextDecoder().decode(uint8);
  return normalizeParsedReplay(JSON.parse(str) as Partial<LxrReplayFile>);
}

function cloneSnapshotForReplay(snap: GameStateSnapshot): GameStateSnapshot {
  const discs: CompactDiscState[] = snap.discs.map((d) => ({
    id: d.id,
    team: d.team,
    x: Math.round(d.x * 100) / 100,
    y: Math.round(d.y * 100) / 100,
    vx: Math.round(d.vx * 100) / 100,
    vy: Math.round(d.vy * 100) / 100,
    flags: d.flags,
    stamina: d.stamina,
    spin: d.spin
  }));
  return {
    tick: snap.tick,
    phase: snap.phase,
    redScore: snap.redScore,
    blueScore: snap.blueScore,
    matchTimer: snap.matchTimer,
    soundMask: snap.soundMask,
    ...(snap.isGoldenGoal !== undefined ? { isGoldenGoal: snap.isGoldenGoal } : {}),
    ...(snap.kickoffActive !== undefined ? { kickoffActive: snap.kickoffActive } : {}),
    ...(snap.isNeutralKickoff !== undefined ? { isNeutralKickoff: snap.isNeutralKickoff } : {}),
    ...(snap.kickoffPossessingTeam !== undefined
      ? { kickoffPossessingTeam: snap.kickoffPossessingTeam }
      : {}),
    discs
  };
}

const SAVED_CLOUD_NOTICE_TEXT =
  'Grabación guardada en tu cuenta. Ve al Visor de Repeticiones para verla o descargar el video.';

class MatchRecorderStore {
  isRecording = $state(false);
  elapsedSeconds = $state(0);
  hasRecordedClip = $state(false);
  showPostRecordPrompt = $state(false);
  isUploadingToCloud = $state(false);
  cloudSaveError = $state<string | null>(null);
  savedCloudNotice = $state<string | null>(null);
  lastReplayData = $state<LxrReplayFile | null>(null);
  lastFileBaseName = $state<string>('legacyx-partido');

  formattedElapsed = $derived.by(() => {
    const total = Math.max(0, Math.floor(this.elapsedSeconds));
    const mins = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const secs = (total % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  });

  private startedAtMs = 0;
  private lastRecordedFrameMs = -999;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private noticeTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private activeUploadPromise: Promise<void> | null = null;
  private framesBuffer: LxrFrame[] = [];
  private goalsBuffer: LxrGoalMarker[] = [];
  private chatBuffer: LxrChatEntry[] = [];
  private bannersBuffer: LxrBannerEvent[] = [];
  private hudEventsBuffer: LxrHudEvent[] = [];
  private initialChatBuffer: LxrChatEntry[] = [];
  private initialUiOverlayState: LxrUiOverlayState = defaultUiOverlay();
  private lastKitsSignature = '';
  private currentMeta: MatchRecorderMetadata = {
    roomName: 'Sala LegacyX-GO',
    roomType: 'casual',
    stadiumId: 'mediano',
    players: [],
    recordingPlayerId: null,
    recordingPlayerName: '',
    cameraZoom: 1,
    viewportWidth: 1280,
    viewportHeight: 720,
    timeLimitSeconds: 180,
    scoreboardDesign: 'original',
    theme: 'dark',
    ballMode: 'texture',
    ballSkin: 'classic',
    ballCustomColor: '#ffffff',
    chatOpacity: 0.95,
    minimapEnabled: true,
    minimapOpacity: 0.6,
    minimapSize: 'medium',
    minimapCameraFrustum: true
  };
  private latestRedScore = 0;
  private latestBlueScore = 0;

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private elapsedSec(): number {
    return Math.round(Math.max(0, (this.nowMs() - this.startedAtMs) / 1000) * 1000) / 1000;
  }

  private clearNoticeTimer(): void {
    if (this.noticeTimeoutHandle !== null) {
      clearTimeout(this.noticeTimeoutHandle);
      this.noticeTimeoutHandle = null;
    }
  }

  public start(canvas: HTMLCanvasElement | null, meta?: Partial<MatchRecorderMetadata>): boolean {
    if (this.isRecording) return true;

    this.clearNoticeTimer();
    this.framesBuffer = [];
    this.goalsBuffer = [];
    this.chatBuffer = [];
    this.bannersBuffer = [];
    this.hudEventsBuffer = [];
    this.initialChatBuffer = Array.isArray(meta?.initialChatMessages)
      ? meta.initialChatMessages.map((m) => ({ ...m }))
      : [];
    this.initialUiOverlayState = defaultUiOverlay(meta?.initialUiOverlay);
    this.latestRedScore = 0;
    this.latestBlueScore = 0;
    this.lastRecordedFrameMs = -999;
    this.startedAtMs = this.nowMs();
    this.elapsedSeconds = 0;
    this.showPostRecordPrompt = false;
    this.cloudSaveError = null;
    this.savedCloudNotice = null;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const cleanRoom = (meta?.roomName || 'legacyx-partido')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    this.lastFileBaseName = `${cleanRoom || 'legacyx'}-${stamp}`;

    const winW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280;
    const winH = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 720;
    const canvasW = canvas?.clientWidth || canvas?.width || winW;
    const canvasH = canvas?.clientHeight || canvas?.height || winH;

    const redKit = cloneKit(meta?.redKit);
    const blueKit = cloneKit(meta?.blueKit);
    this.lastKitsSignature =
      redKit || blueKit ? JSON.stringify({ redKit: redKit ?? null, blueKit: blueKit ?? null }) : '';

    this.currentMeta = {
      roomName: meta?.roomName || 'Sala LegacyX-GO',
      roomType: meta?.roomType === 'ranked' ? 'ranked' : 'casual',
      stadiumId: meta?.stadiumId || 'mediano',
      redKit,
      blueKit,
      players: meta?.players ? meta.players.map((p) => ({ ...p })) : [],
      recordingPlayerId: meta?.recordingPlayerId ?? null,
      recordingPlayerName: meta?.recordingPlayerName ?? '',
      cameraZoom:
        typeof meta?.cameraZoom === 'number' && Number.isFinite(meta.cameraZoom) && meta.cameraZoom > 0
          ? meta.cameraZoom
          : 1,
      viewportWidth:
        typeof meta?.viewportWidth === 'number' && meta.viewportWidth > 0 ? meta.viewportWidth : canvasW,
      viewportHeight:
        typeof meta?.viewportHeight === 'number' && meta.viewportHeight > 0 ? meta.viewportHeight : canvasH,
      timeLimitSeconds:
        typeof meta?.timeLimitSeconds === 'number' && meta.timeLimitSeconds >= 0
          ? meta.timeLimitSeconds
          : 180,
      scoreboardDesign: normalizeScoreboardDesign(meta?.scoreboardDesign),
      theme: meta?.theme === 'light' ? 'light' : 'dark',
      ballMode: meta?.ballMode === 'color' ? 'color' : 'texture',
      ballSkin: normalizeBallSkin(meta?.ballSkin),
      ballCustomColor:
        typeof meta?.ballCustomColor === 'string' && meta.ballCustomColor.trim()
          ? meta.ballCustomColor
          : '#ffffff',
      chatOpacity: normalizeFiniteOpacity(meta?.chatOpacity, 0.95),
      minimapEnabled: meta?.minimapEnabled !== false,
      minimapOpacity: normalizeFiniteOpacity(meta?.minimapOpacity, 0.6),
      minimapSize: normalizeMinimapSize(meta?.minimapSize),
      minimapCameraFrustum: meta?.minimapCameraFrustum !== false
    };

    this.isRecording = true;
    if (this.timerHandle !== null) clearInterval(this.timerHandle);
    this.timerHandle = setInterval(() => {
      if (!this.isRecording) return;
      this.elapsedSeconds = Math.max(0, Math.floor((this.nowMs() - this.startedAtMs) / 1000));
    }, 250);

    return true;
  }

  public updateMetadata(meta: Partial<MatchRecorderMetadata>): void {
    if (!this.isRecording) return;
    if (meta.roomName) this.currentMeta.roomName = meta.roomName;
    if (meta.roomType === 'casual' || meta.roomType === 'ranked') {
      this.currentMeta.roomType = meta.roomType;
    }
    if (meta.stadiumId) this.currentMeta.stadiumId = meta.stadiumId;

    if (meta.redKit || meta.blueKit) {
      const nextRed = meta.redKit ? cloneKit(meta.redKit) : this.currentMeta.redKit;
      const nextBlue = meta.blueKit ? cloneKit(meta.blueKit) : this.currentMeta.blueKit;
      const nextSig = JSON.stringify({ redKit: nextRed ?? null, blueKit: nextBlue ?? null });
      if (!this.lastKitsSignature) {
        this.currentMeta.redKit = nextRed;
        this.currentMeta.blueKit = nextBlue;
        this.lastKitsSignature = nextSig;
      } else if (nextSig !== this.lastKitsSignature) {
        this.lastKitsSignature = nextSig;
        this.hudEventsBuffer.push({
          t: this.elapsedSec(),
          type: 'kits_updated',
          payload: {
            ...(nextRed ? { redKit: nextRed } : {}),
            ...(nextBlue ? { blueKit: nextBlue } : {})
          }
        });
      }
    }

    if (meta.players && meta.players.length > 0) {
      this.currentMeta.players = meta.players.map((p) => ({ ...p }));
    }
    if (meta.recordingPlayerId !== undefined) {
      this.currentMeta.recordingPlayerId = meta.recordingPlayerId;
    }
    if (meta.recordingPlayerName !== undefined) {
      this.currentMeta.recordingPlayerName = meta.recordingPlayerName;
    }
    if (typeof meta.cameraZoom === 'number' && Number.isFinite(meta.cameraZoom) && meta.cameraZoom > 0) {
      this.currentMeta.cameraZoom = meta.cameraZoom;
    }
    if (typeof meta.viewportWidth === 'number' && meta.viewportWidth > 0) {
      this.currentMeta.viewportWidth = meta.viewportWidth;
    }
    if (typeof meta.viewportHeight === 'number' && meta.viewportHeight > 0) {
      this.currentMeta.viewportHeight = meta.viewportHeight;
    }
    if (typeof meta.timeLimitSeconds === 'number' && meta.timeLimitSeconds >= 0) {
      this.currentMeta.timeLimitSeconds = meta.timeLimitSeconds;
    }
    if (meta.scoreboardDesign !== undefined) {
      this.currentMeta.scoreboardDesign = normalizeScoreboardDesign(meta.scoreboardDesign);
    }
    if (meta.theme === 'dark' || meta.theme === 'light') {
      this.currentMeta.theme = meta.theme;
    }
    if (meta.ballMode === 'texture' || meta.ballMode === 'color') {
      this.currentMeta.ballMode = meta.ballMode;
    }
    if (meta.ballSkin !== undefined) {
      this.currentMeta.ballSkin = normalizeBallSkin(meta.ballSkin);
    }
    if (typeof meta.ballCustomColor === 'string' && meta.ballCustomColor.trim()) {
      this.currentMeta.ballCustomColor = meta.ballCustomColor;
    }
    if (meta.chatOpacity !== undefined) {
      this.currentMeta.chatOpacity = normalizeFiniteOpacity(meta.chatOpacity, 0.95);
    }
    if (meta.minimapEnabled !== undefined) {
      this.currentMeta.minimapEnabled = Boolean(meta.minimapEnabled);
    }
    if (meta.minimapOpacity !== undefined) {
      this.currentMeta.minimapOpacity = normalizeFiniteOpacity(meta.minimapOpacity, 0.6);
    }
    if (meta.minimapSize !== undefined) {
      this.currentMeta.minimapSize = normalizeMinimapSize(meta.minimapSize);
    }
    if (meta.minimapCameraFrustum !== undefined) {
      this.currentMeta.minimapCameraFrustum = Boolean(meta.minimapCameraFrustum);
    }
  }

  public recordFrame(snapshot: GameStateSnapshot, minIntervalMs: number = 0): void {
    if (!this.isRecording || !snapshot || !Array.isArray(snapshot.discs)) return;
    const now = this.nowMs();
    if (minIntervalMs > 0 && now - this.lastRecordedFrameMs < minIntervalMs && this.framesBuffer.length > 0) {
      return;
    }
    this.lastRecordedFrameMs = now;
    const elapsedSec = Math.max(0, (now - this.startedAtMs) / 1000);
    this.latestRedScore = snapshot.redScore ?? this.latestRedScore;
    this.latestBlueScore = snapshot.blueScore ?? this.latestBlueScore;
    this.framesBuffer.push({
      t: Math.round(elapsedSec * 1000) / 1000,
      snapshot: cloneSnapshotForReplay(snapshot)
    });
  }

  public recordGoal(goal: {
    scoringTeam: 'red' | 'blue';
    scorerName?: string | null;
    redScore: number;
    blueScore: number;
  }): void {
    if (!this.isRecording) return;
    this.latestRedScore = goal.redScore;
    this.latestBlueScore = goal.blueScore;
    this.goalsBuffer.push({
      t: this.elapsedSec(),
      scoringTeam: goal.scoringTeam,
      scorerName: goal.scorerName || 'Gol',
      redScore: goal.redScore,
      blueScore: goal.blueScore
    });
  }

  public recordChat(entry: Omit<LxrChatEntry, 't'> & { t?: number }): void {
    if (!this.isRecording) return;
    const t = typeof entry.t === 'number' && Number.isFinite(entry.t) ? entry.t : this.elapsedSec();
    const chatItem: LxrChatEntry = {
      t,
      kind: entry.kind,
      sender: entry.sender,
      ...(entry.senderTeam ? { senderTeam: entry.senderTeam } : {}),
      text: entry.text
    };
    this.chatBuffer.push(chatItem);
    this.hudEventsBuffer.push({
      t,
      type: 'chat',
      payload: {
        kind: entry.kind,
        sender: entry.sender,
        ...(entry.senderTeam ? { senderTeam: entry.senderTeam } : {}),
        text: entry.text
      }
    });
  }

  public recordBanner(payload: MatchBannerPayload, t?: number): void {
    if (!this.isRecording) return;
    const time = typeof t === 'number' && Number.isFinite(t) ? t : this.elapsedSec();
    const cloned = { ...payload };
    this.bannersBuffer.push({
      t: time,
      payload: cloned
    });
    this.hudEventsBuffer.push({
      t: time,
      type: 'banner',
      payload: { ...cloned }
    });
  }

  public recordTelemetry(pingMs: number, fps: number, t?: number): void {
    if (!this.isRecording) return;
    const time = typeof t === 'number' && Number.isFinite(t) ? t : this.elapsedSec();
    this.hudEventsBuffer.push({
      t: time,
      type: 'telemetry',
      payload: {
        pingMs: Number.isFinite(pingMs) ? Math.max(0, Math.round(pingMs)) : 0,
        fps: Number.isFinite(fps) ? Math.max(0, Math.round(fps)) : 60
      }
    });
  }

  public recordScoreEvent(event: LxrScoreEventPayload, t?: number): void {
    if (!this.isRecording) return;
    const time = typeof t === 'number' && Number.isFinite(t) ? t : this.elapsedSec();
    this.hudEventsBuffer.push({
      t: time,
      type: 'score_event',
      payload: {
        kind: event.kind,
        points: Number(event.points) || 0,
        label: event.label,
        playerName: event.playerName,
        team: event.team,
        ...(event.color ? { color: event.color } : {})
      }
    });
  }

  public recordUiOverlay(state: Partial<LxrUiOverlayState>, t?: number): void {
    if (!this.isRecording) return;
    const time = typeof t === 'number' && Number.isFinite(t) ? t : this.elapsedSec();
    this.hudEventsBuffer.push({
      t: time,
      type: 'ui_overlay',
      payload: defaultUiOverlay(state)
    });
  }

  public recordKitsUpdated(kits: LxrKitsUpdatedPayload, t?: number): void {
    if (!this.isRecording) return;
    const time = typeof t === 'number' && Number.isFinite(t) ? t : this.elapsedSec();
    const redKit = cloneKit(kits.redKit);
    const blueKit = cloneKit(kits.blueKit);
    this.lastKitsSignature = JSON.stringify({
      redKit: redKit ?? null,
      blueKit: blueKit ?? null
    });
    this.hudEventsBuffer.push({
      t: time,
      type: 'kits_updated',
      payload: {
        ...(redKit ? { redKit } : {}),
        ...(blueKit ? { blueKit } : {})
      }
    });
  }

  private async uploadReplayToCloud(replayFile: LxrReplayV3): Promise<void> {
    this.isUploadingToCloud = true;
    this.cloudSaveError = null;
    this.savedCloudNotice = null;
    this.clearNoticeTimer();

    try {
      await userProfile.uploadUserReplay(replayFile, replayFile.roomName);
      this.savedCloudNotice = SAVED_CLOUD_NOTICE_TEXT;
      this.noticeTimeoutHandle = setTimeout(() => {
        this.savedCloudNotice = null;
        this.noticeTimeoutHandle = null;
      }, 5500);
    } catch (err) {
      this.savedCloudNotice = null;
      this.cloudSaveError =
        err instanceof Error ? err.message : 'No se pudo guardar la grabación en tu cuenta.';
    } finally {
      this.isUploadingToCloud = false;
    }
  }

  public async waitForCloudUpload(): Promise<void> {
    if (this.activeUploadPromise) {
      await this.activeUploadPromise;
    }
  }

  public stop(): LxrReplayFile | null {
    if (!this.isRecording) return this.lastReplayData;

    this.isRecording = false;
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }

    const totalSec = Math.max(
      this.framesBuffer.length > 0 ? this.framesBuffer[this.framesBuffer.length - 1]!.t : 0,
      (this.nowMs() - this.startedAtMs) / 1000
    );
    this.elapsedSeconds = Math.round(totalSec);

    const sortedHudEvents = this.hudEventsBuffer
      .slice()
      .sort((a, b) => a.t - b.t);

    const replayFile: LxrReplayV3 = {
      magic: 'LXR3',
      version: 3,
      createdAt: new Date().toISOString(),
      roomName: this.currentMeta.roomName,
      roomType: this.currentMeta.roomType ?? 'casual',
      stadiumId: this.currentMeta.stadiumId,
      durationSeconds: Math.max(0.5, Math.round(totalSec * 100) / 100),
      redScore: this.latestRedScore,
      blueScore: this.latestBlueScore,
      recordingPlayerId: this.currentMeta.recordingPlayerId ?? null,
      recordingPlayerName: this.currentMeta.recordingPlayerName ?? '',
      cameraZoom: this.currentMeta.cameraZoom ?? 1,
      viewportWidth: this.currentMeta.viewportWidth ?? 1280,
      viewportHeight: this.currentMeta.viewportHeight ?? 720,
      timeLimitSeconds: this.currentMeta.timeLimitSeconds ?? 180,
      scoreboardDesign: this.currentMeta.scoreboardDesign ?? 'original',
      theme: this.currentMeta.theme ?? 'dark',
      ballMode: this.currentMeta.ballMode ?? 'texture',
      ballSkin: this.currentMeta.ballSkin ?? 'classic',
      ballCustomColor: this.currentMeta.ballCustomColor ?? '#ffffff',
      chatOpacity: this.currentMeta.chatOpacity ?? 0.95,
      minimapEnabled: this.currentMeta.minimapEnabled !== false,
      minimapOpacity: this.currentMeta.minimapOpacity ?? 0.6,
      minimapSize: this.currentMeta.minimapSize ?? 'medium',
      minimapCameraFrustum: this.currentMeta.minimapCameraFrustum !== false,
      redKit: cloneKit(this.currentMeta.redKit),
      blueKit: cloneKit(this.currentMeta.blueKit),
      players: this.currentMeta.players,
      initialChatMessages: this.initialChatBuffer.slice(),
      initialUiOverlay: defaultUiOverlay(this.initialUiOverlayState),
      chatMessages: this.chatBuffer.slice(),
      banners: this.bannersBuffer.slice(),
      hudEvents: sortedHudEvents,
      frames: this.framesBuffer.slice(),
      goals: this.goalsBuffer.slice()
    };

    this.lastReplayData = replayFile;
    this.hasRecordedClip = true;
    this.showPostRecordPrompt = true;

    if (userProfile.isAuthenticated) {
      this.activeUploadPromise = this.uploadReplayToCloud(replayFile);
    }

    return replayFile;
  }

  public toggle(canvas: HTMLCanvasElement | null, meta?: Partial<MatchRecorderMetadata>): void {
    if (this.isRecording) {
      this.stop();
    } else {
      this.start(canvas, meta);
    }
  }

  public dismissSavedCloudNotice(): void {
    this.clearNoticeTimer();
    this.savedCloudNotice = null;
  }

  public dismissPrompt(): void {
    this.dismissSavedCloudNotice();
    this.showPostRecordPrompt = false;
    this.cloudSaveError = null;
  }

  public parseReplayText(raw: string): LxrReplayFile {
    const parsed = JSON.parse(raw) as Partial<LxrReplayFile>;
    const valid = normalizeParsedReplay(parsed);
    this.lastReplayData = valid;
    this.hasRecordedClip = true;
    return valid;
  }

  public loadReplayData(replay: LxrReplayFile): void {
    this.lastReplayData = replay;
    this.hasRecordedClip = true;
  }

  public async loadReplayFile(file: File): Promise<LxrReplayFile> {
    const raw = await file.text();
    return this.parseReplayText(raw);
  }
}

export const matchRecorder = new MatchRecorderStore();
