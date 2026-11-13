import type { CompactDiscState, GameStateSnapshot } from '@legacyx/core';
import type { MatchBannerPayload } from '../ui/state/gameUI.svelte.js';
import { userProfile } from '../ui/state/userProfile.svelte.js';

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

export interface LxrBannerEvent {
  t: number;
  payload: MatchBannerPayload;
}

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

export type LxrReplayFile = LxrReplayV1 | LxrReplayV2;

export interface MatchRecorderMetadata {
  roomName: string;
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
    (parsed.magic !== 'LXR1' && parsed.magic !== 'LXR2') ||
    !Array.isArray(parsed.frames)
  ) {
    throw new Error('Archivo .lxr inválido o corrupto.');
  }

  const durationFallback =
    parsed.frames.length > 0 ? parsed.frames[parsed.frames.length - 1]!.t : 1;
  const durationSeconds = Math.max(0.5, Number(parsed.durationSeconds ?? durationFallback));

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
        typeof v2.viewportWidth === 'number' && Number.isFinite(v2.viewportWidth) && v2.viewportWidth > 0
          ? v2.viewportWidth
          : 1280,
      viewportHeight:
        typeof v2.viewportHeight === 'number' && Number.isFinite(v2.viewportHeight) && v2.viewportHeight > 0
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
  private currentMeta: MatchRecorderMetadata = {
    roomName: 'Sala LegacyX-GO',
    stadiumId: 'mediano',
    players: [],
    recordingPlayerId: null,
    recordingPlayerName: '',
    cameraZoom: 1,
    viewportWidth: 1280,
    viewportHeight: 720,
    timeLimitSeconds: 180
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

    this.currentMeta = {
      roomName: meta?.roomName || 'Sala LegacyX-GO',
      stadiumId: meta?.stadiumId || 'mediano',
      redKit: meta?.redKit ? { ...meta.redKit } : undefined,
      blueKit: meta?.blueKit ? { ...meta.blueKit } : undefined,
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
          : 180
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
    if (meta.stadiumId) this.currentMeta.stadiumId = meta.stadiumId;
    if (meta.redKit) this.currentMeta.redKit = { ...meta.redKit };
    if (meta.blueKit) this.currentMeta.blueKit = { ...meta.blueKit };
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
  }

  public recordFrame(snapshot: GameStateSnapshot, minIntervalMs: number = 30): void {
    if (!this.isRecording || !snapshot || !Array.isArray(snapshot.discs)) return;
    const now = this.nowMs();
    if (now - this.lastRecordedFrameMs < minIntervalMs && this.framesBuffer.length > 0) {
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
    this.chatBuffer.push({
      t: typeof entry.t === 'number' && Number.isFinite(entry.t) ? entry.t : this.elapsedSec(),
      kind: entry.kind,
      sender: entry.sender,
      ...(entry.senderTeam ? { senderTeam: entry.senderTeam } : {}),
      text: entry.text
    });
  }

  public recordBanner(payload: MatchBannerPayload, t?: number): void {
    if (!this.isRecording) return;
    this.bannersBuffer.push({
      t: typeof t === 'number' && Number.isFinite(t) ? t : this.elapsedSec(),
      payload: { ...payload }
    });
  }

  private async uploadReplayToCloud(replayFile: LxrReplayV2): Promise<void> {
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

    const replayFile: LxrReplayV2 = {
      magic: 'LXR2',
      version: 2,
      createdAt: new Date().toISOString(),
      roomName: this.currentMeta.roomName,
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
      redKit: this.currentMeta.redKit,
      blueKit: this.currentMeta.blueKit,
      players: this.currentMeta.players,
      chatMessages: this.chatBuffer.slice(),
      banners: this.bannersBuffer.slice(),
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
