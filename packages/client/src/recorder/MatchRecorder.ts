export interface LxrReplayDisc {
  id: number;
  team: number;
  x: number;
  y: number;
  radius: number;
  name?: string;
}

export interface LxrReplayFrame {
  t: number; // elapsed seconds
  redScore: number;
  blueScore: number;
  timerSeconds: number;
  discs: LxrReplayFrameDisc[];
}

export interface LxrReplayFrameDisc {
  id: number;
  team: number;
  x: number;
  y: number;
  r: number;
}

export interface LxrGoalMarker {
  t: number;
  team: 'red' | 'blue';
  redScore: number;
  blueScore: number;
  scorerName?: string;
}

export interface LxrReplayDocument {
  version: '1.0';
  createdAt: string;
  roomName: string;
  stadiumId: string;
  durationSeconds: number;
  redScore: number;
  blueScore: number;
  goals: LxrGoalMarker[];
  frames: LxrReplayFrame[];
}

export class MatchRecorder {
  public activeCanvas: HTMLCanvasElement | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private videoChunks: Blob[] = [];
  private lastVideoBlob: Blob | null = null;
  private lastVideoMime: string = 'video/webm';
  private lastReplayDoc: LxrReplayDocument | null = null;

  private frames: LxrReplayFrame[] = [];
  private goals: LxrGoalMarker[] = [];
  private isRecordingActive = false;
  private startedAtMs = 0;
  private currentRoomName = 'LegacyX Match';
  private currentStadiumId = 'mediano';
  private lastSampleMs = 0;

  public get isRecording(): boolean {
    return this.isRecordingActive;
  }

  public get hasVideo(): boolean {
    return this.lastVideoBlob !== null && this.lastVideoBlob.size > 0;
  }

  public get hasReplay(): boolean {
    return this.lastReplayDoc !== null && this.lastReplayDoc.frames.length > 0;
  }

  public get latestReplay(): LxrReplayDocument | null {
    return this.lastReplayDoc;
  }

  public getElapsedSeconds(): number {
    if (!this.isRecordingActive) return 0;
    return Math.max(0, Math.floor(( performance.now() - this.startedAtMs ) / 1000));
  }

  public attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.activeCanvas = canvas;
  }

  public startRecording(
    canvas: HTMLCanvasElement | null = this.activeCanvas,
    stadiumId: string = 'mediano',
    roomName: string = 'LegacyX Match'
  ): boolean {
    if (this.isRecordingActive) return true;

    this.frames = [];
    this.goals = [];
    this.videoChunks = [];
    this.lastVideoBlob = null;
    this.currentStadiumId = stadiumId || 'mediano';
    this.currentRoomName = roomName || 'LegacyX Match';
    this.startedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastSampleMs = 0;
    this.isRecordingActive = true;

    if (canvas && typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = canvas.captureStream(60);
        const candidates = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4'
        ];
        let chosenMime = '';
        for (const m of candidates) {
          if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)) {
            chosenMime = m;
            break;
          }
        }
        this.lastVideoMime = chosenMime || 'video/webm';
        this.mediaRecorder = chosenMime
          ? new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: 4_500_000 })
          : new MediaRecorder(stream);

        this.mediaRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            this.videoChunks.push(ev.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          if (this.videoChunks.length > 0) {
            this.lastVideoBlob = new Blob(this.videoChunks, { type: this.lastVideoMime });
          }
        };

        this.mediaRecorder.start(250);
      } catch {
        this.mediaRecorder = null;
      }
    }

    return true;
  }

  public recordFrame(snapshot: {
    redScore: number;
    blueScore: number;
    timerSeconds: number;
    discs: Array<{ id: number; team: number; x: number; y: number; radius?: number }>;
  }): void {
    if (!this.isRecordingActive) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastSampleMs < 30) return; // ~30 fps ligero para .lxr
    this.lastSampleMs = now;

    const elapsed = Number(((now - this.startedAtMs) / 1000).toFixed(3));
    this.frames.push({
      t: elapsed,
      redScore: snapshot.redScore,
      blueScore: snapshot.blueScore,
      timerSeconds: snapshot.timerSeconds,
      discs: snapshot.discs.map((d) => ({
        id: d.id,
        team: d.team,
        x: Math.round(d.x * 10) / 10,
        y: Math.round(d.y * 10) / 10,
        r: d.radius ?? (d.team === 0 ? 6 : 15)
      }))
    });
  }

  public recordGoalMarker(team: 'red' | 'blue', redScore: number, blueScore: number, scorerName?: string): void {
    if (!this.isRecordingActive) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = Number(((now - this.startedAtMs) / 1000).toFixed(2));
    this.goals.push({
      t: elapsed,
      team,
      redScore,
      blueScore,
      scorerName
    });
  }

  public stopRecording(): LxrReplayDocument | null {
    if (!this.isRecordingActive) return this.lastReplayDoc;
    this.isRecordingActive = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    if (this.videoChunks.length > 0 && !this.lastVideoBlob) {
      this.lastVideoBlob = new Blob(this.videoChunks, { type: this.lastVideoMime });
    }

    const lastFrame = this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
    const duration = lastFrame ? Math.max(1, Math.round(lastFrame.t)) : 1;

    this.lastReplayDoc = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      roomName: this.currentRoomName,
      stadiumId: this.currentStadiumId,
      durationSeconds: duration,
      redScore: lastFrame?.redScore ?? 0,
      blueScore: lastFrame?.blueScore ?? 0,
      goals: [...this.goals],
      frames: [...this.frames]
    };

    return this.lastReplayDoc;
  }

  public downloadVideoWebm(): boolean {
    const blob =
      this.lastVideoBlob ||
      (this.videoChunks.length > 0 ? new Blob(this.videoChunks, { type: this.lastVideoMime }) : null);
    if (!blob || typeof document === 'undefined') return false;

    const ext = this.lastVideoMime.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legacyx-match-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  public downloadReplayLxr(doc: LxrReplayDocument | null = this.lastReplayDoc): boolean {
    if (!doc || typeof document === 'undefined') return false;
    const json = JSON.stringify(doc);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legacyx-replay-${Date.now()}.lxr`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  public setLoadedReplay(doc: LxrReplayDocument): void {
    this.lastReplayDoc = doc;
  }
}

export const matchRecorder = new MatchRecorder();
