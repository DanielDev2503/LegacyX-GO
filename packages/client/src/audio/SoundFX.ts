/**
 * SoundFX.ts
 * Procedural Web Audio API Synthesizer for LegacyX-GO.
 * Generates kicks, post rebounds, referee whistles, goal horns, and UI clicks
 * with ZERO external audio files or dependencies.
 */

export class SoundFX {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _isMuted: boolean = false;
  private _volume: number = 0.5;

  public get isMuted(): boolean {
    return this._isMuted;
  }

  public get volume(): number {
    return this._volume;
  }

  /**
   * Lazily initializes or resumes the AudioContext on first user gesture.
   */
  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;

      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this._isMuted ? 0 : this._volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  public setMasterVolume(val: number): void {
    this._volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this._isMuted) {
      this.masterGain.gain.setValueAtTime(this._volume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this._volume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this._isMuted);
    return this._isMuted;
  }

  /**
   * Ball kick: FM percussive drop (120 Hz to 40 Hz in 60-80 ms).
   */
  public playKick(strength: number = 1.0): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const normalizedStrength = Math.max(0.2, Math.min(2.0, strength));
      const startFreq = 120 * Math.min(1.4, 0.8 + normalizedStrength * 0.4);
      const endFreq = 40;
      const duration = 0.07;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

      const peakGain = Math.min(1.0, 0.7 * normalizedStrength);
      gain.gain.setValueAtTime(peakGain, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + duration);

      // Disconnect node tree after decay to prevent memory leaks
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext safety fallback
    }
  }

  /**
   * Metallic chime for post and crossbar collisions (880 Hz harmonic bell resonance).
   */
  public playPostHit(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, t);
      osc1.frequency.exponentialRampToValueAtTime(620, t + 0.28);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, t);
      osc2.frequency.exponentialRampToValueAtTime(1240, t + 0.28);

      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(t);
      osc2.start(t + 0.002);
      osc1.stop(t + 0.28);
      osc2.stop(t + 0.28);

      osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext safety fallback
    }
  }

  /**
   * Referee dual-tone whistle with 32 Hz trill flutter.
   */
  public playWhistle(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const masterWhistleGain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2600, t);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2950, t);

      // Tremolo / trill flutter
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(32, t);
      lfoGain.gain.setValueAtTime(120, t);

      lfo.connect(osc1.frequency);
      lfo.connect(osc2.frequency);

      masterWhistleGain.gain.setValueAtTime(0, t);
      masterWhistleGain.gain.linearRampToValueAtTime(0.55, t + 0.04);
      masterWhistleGain.gain.setValueAtTime(0.55, t + 0.45);
      masterWhistleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

      osc1.connect(masterWhistleGain);
      osc2.connect(masterWhistleGain);
      masterWhistleGain.connect(this.masterGain);

      lfo.start(t);
      osc1.start(t);
      osc2.start(t);

      const endTime = t + 0.85;
      lfo.stop(endTime);
      osc1.stop(endTime);
      osc2.stop(endTime);

      osc1.onended = () => {
        lfo.disconnect();
        lfoGain.disconnect();
        osc1.disconnect();
        osc2.disconnect();
        masterWhistleGain.disconnect();
      };
    } catch {
      // AudioContext safety fallback
    }
  }

  /**
   * Goal celebration horn: Low-frequency chord filtered through a warm lowpass filter.
   */
  public playGoalHorn(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(130.81, t); // C3

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(164.81, t); // E3

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, t);
      filter.Q.setValueAtTime(2.5, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.65, t + 0.1);
      gain.gain.setValueAtTime(0.65, t + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 1.2);
      osc2.stop(t + 1.2);

      osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext safety fallback
    }
  }

  /**
   * Subtle acoustic feedback when hovering over buttons or cards.
   */
  public playUIHover(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, t);

      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.025);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext safety fallback
    }
  }

  /**
   * Crisp feedback when clicking buttons or toggles.
   */
  public playUIClick(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.04);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.04);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext safety fallback
    }
  }
}

export const soundFX = new SoundFX();
