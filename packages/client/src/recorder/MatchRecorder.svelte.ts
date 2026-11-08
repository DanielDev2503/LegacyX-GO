import type { CompactDiscState, GameStateSnapshot } from '@legacyx/core';
import { soundFX } from '../audio/SoundFX.js';

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

export interface LxrFrame {
  t: number;
  snapshot: GameStateSnapshot;
}

export interface LxrReplayFile {
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

export interface MatchRecorderMetadata {
  roomName: string;
  stadiumId: string;
  redKit?: Record<string, unknown>;
  blueKit?: Record<string, unknown>;
  players: LxrPlayerMeta[];
}

function selectSupportedVideoMime(): { mimeType: string; ext: 'webm' | 'mp4' } {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return { mimeType: '', ext: 'webm' };
  }
  const candidates: Array<{ mimeType: string; ext: 'webm' | 'mp4' }> = [
    { mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
    { mimeType: 'video/mp4', ext: 'mp4' }
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: '', ext: 'webm' };
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
    discs
  };
}

class MatchRecorderStore {
  isRecording = $state(false);
  elapsedSeconds = $state(0);
  hasRecordedClip = $state(false);
  showPostRecordPrompt = $state(false);
  lastVideoUrl = $state<string | null>(null);
  lastVideoExt = $state<'webm' | 'mp4'>('webm');
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
  private mediaRecorder: MediaRecorder | null = null;
  private videoTracksToCleanup: MediaStreamTrack[] = [];
  private recordedChunks: Blob[] = [];
  private framesBuffer: LxrFrame[] = [];
  private goalsBuffer: LxrGoalMarker[] = [];
  private currentMeta: MatchRecorderMetadata = {
    roomName: 'Sala LegacyX-GO',
    stadiumId: 'mediano',
    players: []
  };
  private latestRedScore = 0;
  private latestBlueScore = 0;

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  public start(canvas: HTMLCanvasElement | null, meta?: Partial<MatchRecorderMetadata>): boolean {
    if (this.isRecording) return true;

    if (this.lastVideoUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(this.lastVideoUrl);
      } catch {
        // Ignored in test environments
      }
    }

    this.lastVideoUrl = null;
    this.recordedChunks = [];
    this.framesBuffer = [];
    this.goalsBuffer = [];
    this.latestRedScore = 0;
    this.latestBlueScore = 0;
    this.lastRecordedFrameMs = -999;
    this.startedAtMs = this.nowMs();
    this.elapsedSeconds = 0;
    this.showPostRecordPrompt = false;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const cleanRoom = (meta?.roomName || 'legacyx-partido')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    this.lastFileBaseName = `${cleanRoom || 'legacyx'}-${stamp}`;

    this.currentMeta = {
      roomName: meta?.roomName || 'Sala LegacyX-GO',
      stadiumId: meta?.stadiumId || 'mediano',
      redKit: meta?.redKit ? { ...meta.redKit } : undefined,
      blueKit: meta?.blueKit ? { ...meta.blueKit } : undefined,
      players: meta?.players ? meta.players.map((p) => ({ ...p })) : []
    };

    // Inicializar captura de video + audio en tiempo real (60 FPS) si el entorno soporta MediaRecorder
    this.videoTracksToCleanup = [];
    if (
      canvas &&
      typeof (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream ===
        'function' &&
      typeof MediaRecorder !== 'undefined'
    ) {
      try {
        const videoStream = canvas.captureStream(60);
        const videoTracks = videoStream.getVideoTracks();
        this.videoTracksToCleanup = videoTracks;

        const audioStream = soundFX.getAudioStream();
        const audioTracks = audioStream ? audioStream.getAudioTracks() : [];
        const combinedTracks = [...videoTracks, ...audioTracks];
        const combinedStream =
          typeof MediaStream !== 'undefined' ? new MediaStream(combinedTracks) : videoStream;

        const { mimeType, ext } = selectSupportedVideoMime();
        this.lastVideoExt = ext;
        const recorder = mimeType
          ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 4_500_000 })
          : new MediaRecorder(combinedStream);

        recorder.ondataavailable = (ev: BlobEvent) => {
          if (ev.data && ev.data.size > 0) {
            this.recordedChunks.push(ev.data);
          }
        };

        recorder.onstop = () => {
          if (this.recordedChunks.length > 0 && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
            const outMime = mimeType || (this.lastVideoExt === 'mp4' ? 'video/mp4' : 'video/webm');
            const blob = new Blob(this.recordedChunks, { type: outMime });
            this.lastVideoUrl = URL.createObjectURL(blob);
          }
          for (const vt of this.videoTracksToCleanup) {
            try {
              vt.stop();
            } catch {
              // Ignored
            }
          }
          this.videoTracksToCleanup = [];
        };

        recorder.start(250);
        this.mediaRecorder = recorder;
      } catch {
        this.mediaRecorder = null;
      }
    }

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
    const elapsedSec = Math.max(0, (this.nowMs() - this.startedAtMs) / 1000);
    this.latestRedScore = goal.redScore;
    this.latestBlueScore = goal.blueScore;
    this.goalsBuffer.push({
      t: Math.round(elapsedSec * 1000) / 1000,
      scoringTeam: goal.scoringTeam,
      scorerName: goal.scorerName || 'Gol',
      redScore: goal.redScore,
      blueScore: goal.blueScore
    });
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

    const replayFile: LxrReplayFile = {
      magic: 'LXR1',
      version: 1,
      createdAt: new Date().toISOString(),
      roomName: this.currentMeta.roomName,
      stadiumId: this.currentMeta.stadiumId,
      durationSeconds: Math.max(0.5, Math.round(totalSec * 100) / 100),
      redScore: this.latestRedScore,
      blueScore: this.latestBlueScore,
      redKit: this.currentMeta.redKit,
      blueKit: this.currentMeta.blueKit,
      players: this.currentMeta.players,
      frames: this.framesBuffer.slice(),
      goals: this.goalsBuffer.slice()
    };

    this.lastReplayData = replayFile;
    this.hasRecordedClip = true;
    this.showPostRecordPrompt = true;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignored
      }
    }
    this.mediaRecorder = null;

    return replayFile;
  }

  public toggle(canvas: HTMLCanvasElement | null, meta?: Partial<MatchRecorderMetadata>): void {
    if (this.isRecording) {
      this.stop();
    } else {
      this.start(canvas, meta);
    }
  }

  public dismissPrompt(): void {
    this.showPostRecordPrompt = false;
  }

  public downloadVideo(): boolean {
    if (!this.lastVideoUrl || typeof document === 'undefined') return false;
    const a = document.createElement('a');
    a.href = this.lastVideoUrl;
    a.download = `${this.lastFileBaseName}.${this.lastVideoExt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  public downloadReplay(replay: LxrReplayFile | null = this.lastReplayData): boolean {
    if (!replay || typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      return false;
    }
    const serialized = JSON.stringify(replay);
    const blob = new Blob([serialized], { type: 'application/x-legacyx-replay+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.lastFileBaseName}.lxr`;
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
    return true;
  }

  public parseReplayText(raw: string): LxrReplayFile {
    const parsed = JSON.parse(raw) as Partial<LxrReplayFile>;
    if (!parsed || parsed.magic !== 'LXR1' || !Array.isArray(parsed.frames)) {
      throw new Error('Archivo .lxr inválido o corrupto.');
    }
    const valid: LxrReplayFile = {
      magic: 'LXR1',
      version: 1,
      createdAt: parsed.createdAt || new Date().toISOString(),
      roomName: parsed.roomName || 'Repetición LegacyX-GO',
      stadiumId: parsed.stadiumId || 'mediano',
      durationSeconds: Math.max(
        0.5,
        Number(
          parsed.durationSeconds ??
            (parsed.frames.length > 0 ? parsed.frames[parsed.frames.length - 1]!.t : 1)
        )
      ),
      redScore: Number(parsed.redScore ?? 0),
      blueScore: Number(parsed.blueScore ?? 0),
      redKit: parsed.redKit,
      blueKit: parsed.blueKit,
      players: Array.isArray(parsed.players) ? parsed.players : [],
      frames: parsed.frames,
      goals: Array.isArray(parsed.goals) ? parsed.goals : []
    };
    this.lastReplayData = valid;
    this.hasRecordedClip = true;
    return valid;
  }

  public async loadReplayFile(file: File): Promise<LxrReplayFile> {
    const raw = await file.text();
    return this.parseReplayText(raw);
  }
}

export const matchRecorder = new MatchRecorderStore();
