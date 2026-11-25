import { gameUI } from '../ui/state/gameUI.svelte';

export interface MusicTrack {
  name: string;
  title: string;
  url: string;
}

class MusicPlayerManager {
  tracks = $state<MusicTrack[]>([]);
  currentTrackIndex = $state<number>(0);
  isPlaying = $state<boolean>(false);
  isLoading = $state<boolean>(false);
  lastError = $state<string | null>(null);

  currentTrack = $derived.by(() => {
    if (this.tracks.length === 0) return null;
    const idx = ((this.currentTrackIndex % this.tracks.length) + this.tracks.length) % this.tracks.length;
    return this.tracks[idx] ?? null;
  });

  private audio: HTMLAudioElement | null = null;
  private fetchedOnce = false;
  private hasPickedInitialTrack = false;
  private lastMatchActive = false;

  private pickRandomIndex(excludeIndex?: number): number {
    if (this.tracks.length <= 1) return 0;
    let candidate = Math.floor(Math.random() * this.tracks.length);
    if (excludeIndex !== undefined && this.tracks.length > 1 && candidate === excludeIndex) {
      candidate = (candidate + 1 + Math.floor(Math.random() * (this.tracks.length - 1))) % this.tracks.length;
    }
    return candidate;
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'metadata';
      this.audio.loop = false;
      this.audio.addEventListener('ended', () => {
        if (this.tracks.length > 0 && gameUI.settings.musicEnabled && !gameUI.settings.isMuted) {
          this.nextTrack();
        } else {
          this.isPlaying = false;
        }
      });
      this.audio.addEventListener('play', () => {
        this.isPlaying = true;
      });
      this.audio.addEventListener('pause', () => {
        this.isPlaying = false;
      });
      this.audio.addEventListener('error', () => {
        this.isPlaying = false;
        this.lastError = 'No se pudo reproducir la pista.';
      });
    }
    return this.audio;
  }

  public computeTargetVolume(isMatchActive: boolean = this.lastMatchActive): number {
    if (gameUI.settings.isMuted || !gameUI.settings.musicEnabled) return 0;
    if (isMatchActive && !gameUI.settings.musicInMatch) return 0;
    return Math.max(0, Math.min(1, gameUI.settings.masterVolume * gameUI.settings.musicVolume));
  }

  public syncVolume(isMatchActive: boolean = this.lastMatchActive): void {
    this.lastMatchActive = isMatchActive;
    const audio = this.audio;
    const targetVol = this.computeTargetVolume(isMatchActive);
    if (!audio) return;
    audio.volume = targetVol;
    if (targetVol <= 0.001 && !audio.paused) {
      audio.pause();
    }
  }

  public async refreshTracks(): Promise<MusicTrack[]> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return [];
    this.isLoading = true;
    this.lastError = null;
    try {
      const res = await fetch('/api/media/list');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.music)
        ? data.music.filter((t: any) => t && typeof t.url === 'string' && typeof t.title === 'string')
        : [];
      this.tracks = list;
      if (this.tracks.length > 0 && !this.hasPickedInitialTrack) {
        this.currentTrackIndex = this.pickRandomIndex();
        this.hasPickedInitialTrack = true;
      } else if (this.currentTrackIndex >= this.tracks.length) {
        this.currentTrackIndex = 0;
      }
      this.fetchedOnce = true;
      return this.tracks;
    } catch {
      this.fetchedOnce = true;
      return this.tracks;
    } finally {
      this.isLoading = false;
    }
  }

  public async play(index?: number): Promise<void> {
    if (!this.fetchedOnce) {
      await this.refreshTracks();
    }
    if (this.tracks.length === 0) return;

    if (typeof index === 'number' && Number.isFinite(index)) {
      const len = this.tracks.length;
      this.currentTrackIndex = ((index % len) + len) % len;
    }

    const track = this.currentTrack;
    const audio = this.ensureAudio();
    if (!track || !audio) return;

    const targetVol = this.computeTargetVolume();
    audio.volume = targetVol;
    if (targetVol <= 0.001) {
      audio.pause();
      return;
    }

    const encodedTarget = track.url;
    if (!audio.src || !audio.src.endsWith(encodedTarget)) {
      audio.src = encodedTarget;
    }

    try {
      this.lastError = null;
      await audio.play();
      this.isPlaying = true;
    } catch {
      this.isPlaying = false;
    }
  }

  public pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
    this.isPlaying = false;
  }

  public async togglePlay(): Promise<void> {
    if (this.isPlaying) {
      this.pause();
      return;
    }
    await this.play();
  }

  public async nextTrack(): Promise<void> {
    if (this.tracks.length === 0) {
      await this.refreshTracks();
    }
    if (this.tracks.length === 0) return;
    if (this.tracks.length === 1) {
      await this.play(0);
      return;
    }
    await this.play(this.pickRandomIndex(this.currentTrackIndex));
  }

  public async prevTrack(): Promise<void> {
    if (this.tracks.length === 0) {
      await this.refreshTracks();
    }
    if (this.tracks.length === 0) return;
    await this.play(this.currentTrackIndex - 1);
  }

  public async tryAutoStart(): Promise<void> {
    if (!gameUI.settings.musicEnabled || gameUI.settings.isMuted) return;
    if (!this.fetchedOnce) {
      await this.refreshTracks();
    }
    if (this.tracks.length > 0 && !this.isPlaying) {
      await this.play(this.currentTrackIndex);
    }
  }
}

export const musicPlayer = new MusicPlayerManager();
