/**
 * SoundFX.ts
 * Procedural Web Audio API Synthesizer for LegacyX-GO.
 * Generates layered kicks, wall bounces, hollow metallic post clangs, dual-chamber referee whistles,
 * stadium horns, crowd roars/gasps/barras chants, dash whooshes, Magnus spin swirls,
 * countdowns, and futuristic UI tones with ZERO external audio assets.
 */

export type WhistleKind = 'kickoff' | 'goal' | 'fulltime';

export class SoundFX {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private chatGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private envGain: GainNode | null = null;
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveGain: GainNode | null = null;
  private cachedPinkNoiseBuffer: AudioBuffer | null = null;
  private cachedWhiteNoiseBuffer: AudioBuffer | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;

  private _isMuted: boolean = false;
  private _volume: number = 1.0;
  private _chatVolume: number = 1.0;
  private _sfxVolume: number = 1.0;
  private _envVolume: number = 1.0;

  // Canal 2: Chat y Social
  public chatNormalSoundEnabled: boolean = true;
  public chatMentionSoundEnabled: boolean = true;
  public chatEmotesSoundEnabled: boolean = true;

  // Canal 3: Efectos (SFX)
  public kickSoundEnabled: boolean = true;
  public postHitSoundEnabled: boolean = true;

  // Canal 4: Entorno
  public whistleSoundEnabled: boolean = true;
  public goalSoundEnabled: boolean = true;
  public crowdSoundEnabled: boolean = true;
  public ambientSoundEnabled: boolean = true;

  // Backwards compatibility alias for chatSoundEnabled
  public get chatSoundEnabled(): boolean {
    return this.chatNormalSoundEnabled;
  }
  public set chatSoundEnabled(val: boolean) {
    this.chatNormalSoundEnabled = val;
  }

  public get isMuted(): boolean {
    return this._isMuted;
  }
  public set isMuted(val: boolean) {
    this.setMuted(val);
  }

  public get volume(): number {
    return this._volume;
  }
  public set volume(val: number) {
    this.setMasterVolume(val);
  }

  public get chatVolume(): number {
    return this._chatVolume;
  }
  public set chatVolume(val: number) {
    this.setChatVolume(val);
  }

  public get sfxVolume(): number {
    return this._sfxVolume;
  }
  public set sfxVolume(val: number) {
    this.setSfxVolume(val);
  }

  public get envVolume(): number {
    return this._envVolume;
  }
  public set envVolume(val: number) {
    this.setEnvVolume(val);
  }

  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;

      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this._isMuted ? 0 : this._volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.chatGain = this.ctx.createGain();
      this.chatGain.gain.setValueAtTime(this._chatVolume, this.ctx.currentTime);
      this.chatGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this._sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.envGain = this.ctx.createGain();
      this.envGain.gain.setValueAtTime(this._envVolume, this.ctx.currentTime);
      this.envGain.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      void this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext, pink: boolean = true): AudioBuffer {
    if (pink && this.cachedPinkNoiseBuffer) return this.cachedPinkNoiseBuffer;
    if (!pink && this.cachedWhiteNoiseBuffer) return this.cachedWhiteNoiseBuffer;

    const length = Math.max(1, Math.floor((ctx.sampleRate || 44100) * 2.5));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate || 44100);
    const data = buffer.getChannelData(0);

    if (pink) {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.12) * 1.4));
      }
      this.cachedPinkNoiseBuffer = buffer;
    } else {
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.cachedWhiteNoiseBuffer = buffer;
    }
    return buffer;
  }

  private scheduleNote(
    ctx: AudioContext,
    dest: AudioNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), startTime);
    if (Math.abs(endFreq - startFreq) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
    }
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.015, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  public setMasterVolume(val: number): void {
    this._volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx && !this._isMuted) {
      this.masterGain.gain.setValueAtTime(this._volume, this.ctx.currentTime);
    }
  }

  public setChatVolume(val: number): void {
    this._chatVolume = Math.max(0, Math.min(1, val));
    if (this.chatGain && this.ctx) {
      this.chatGain.gain.setValueAtTime(this._chatVolume, this.ctx.currentTime);
    }
  }

  public setSfxVolume(val: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this._sfxVolume, this.ctx.currentTime);
    }
  }

  public setEnvVolume(val: number): void {
    this._envVolume = Math.max(0, Math.min(1, val));
    if (this.envGain && this.ctx) {
      this.envGain.gain.setValueAtTime(this._envVolume, this.ctx.currentTime);
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
   * 1. Kick: Deep synthetic leather punch + attack snap (scales cleanly into Power Shot)
   */
  public playKick(strength: number = 1.0): void {
    if (this._isMuted || !this.kickSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.sfxGain || this.masterGain;
      const s = Math.max(0.25, Math.min(2.0, strength));

      // Sub punch body
      this.scheduleNote(ctx, dest, 'sine', 165 * (0.9 + s * 0.1), 42, t, 0.095, Math.min(0.95, 0.72 * s));
      // Leather snap transient
      this.scheduleNote(ctx, dest, 'triangle', 460 * (0.85 + s * 0.15), 115, t, 0.045, Math.min(0.7, 0.45 * s));

      // High-energy air burst on strong kicks
      if (s >= 1.15) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.getNoiseBuffer(ctx, false);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1100, t);
        filter.Q.setValueAtTime(1.4, t);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(Math.min(0.35, 0.16 * s), t);
        nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(dest);
        noise.start(t);
        noise.stop(t + 0.055);
        noise.onended = () => {
          noise.disconnect();
          filter.disconnect();
          nGain.disconnect();
        };
      }
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 2. Wall / Barrier Bounce: Damped rubber-acrylic thud
   */
  public playBounce(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.sfxGain || this.masterGain;
      this.scheduleNote(ctx, dest, 'triangle', 148, 52, t, 0.068, 0.36);
      this.scheduleNote(ctx, dest, 'sine', 290, 95, t, 0.032, 0.14);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 3. Goalpost Hit: Hollow metallic clang + dramatic stadium crowd gasp
   */
  public playPostHit(): void {
    if (this._isMuted || !this.postHitSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.sfxGain || this.masterGain;

      const primaries = [
        { type: 'triangle' as OscillatorType, f0: 960, f1: 880, dur: 0.34, amp: 0.42 },
        { type: 'sine' as OscillatorType, f0: 2140, f1: 1980, dur: 0.28, amp: 0.26 },
        { type: 'sine' as OscillatorType, f0: 3420, f1: 3210, dur: 0.19, amp: 0.14 }
      ];
      for (const p of primaries) {
        this.scheduleNote(ctx, dest, p.type, p.f0, p.f1, t, p.dur, p.amp);
      }

      if (this.crowdSoundEnabled) {
        this.playCrowdGasp();
      }
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Nylon net swish when ball rockets past the line
   */
  public playNetSwish(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx, false);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2600, t);
      filter.frequency.exponentialRampToValueAtTime(950, t + 0.22);
      filter.Q.setValueAtTime(1.8, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain || this.masterGain);
      noise.start(t);
      noise.stop(t + 0.22);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  public playGoal(): void {
    this.playGoalCelebration();
  }

  private fireWhistleBlast(ctx: AudioContext, dest: AudioNode, startTime: number, duration: number, peak: number): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const masterWhistle = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2790, startTime);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(3140, startTime);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(36, startTime);
    lfoGain.gain.setValueAtTime(135, startTime);

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    masterWhistle.gain.setValueAtTime(0.0001, startTime);
    masterWhistle.gain.linearRampToValueAtTime(peak, startTime + 0.035);
    masterWhistle.gain.setValueAtTime(peak, startTime + Math.max(0.04, duration * 0.72));
    masterWhistle.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(masterWhistle);
    osc2.connect(masterWhistle);
    masterWhistle.connect(dest);

    const air = ctx.createBufferSource();
    air.buffer = this.getNoiseBuffer(ctx, false);
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.setValueAtTime(2950, startTime);
    airFilter.Q.setValueAtTime(3.2, startTime);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(peak * 0.14, startTime);
    airGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(dest);

    const end = startTime + duration;
    lfo.start(startTime);
    osc1.start(startTime);
    osc2.start(startTime);
    air.start(startTime);
    lfo.stop(end);
    osc1.stop(end);
    osc2.stop(end);
    air.stop(end);

    osc1.onended = () => {
      lfo.disconnect();
      lfoGain.disconnect();
      osc1.disconnect();
      osc2.disconnect();
      masterWhistle.disconnect();
      air.disconnect();
      airFilter.disconnect();
      airGain.disconnect();
    };
  }

  /**
   * 4. Pea Referee Whistle: Supports 'kickoff', 'goal', and triple 'fulltime' cadence
   */
  public playWhistle(kind: WhistleKind = 'kickoff'): void {
    if (this._isMuted) return;
    if (kind === 'goal' && !this.goalSoundEnabled) return;
    if (kind !== 'goal' && !this.whistleSoundEnabled) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.envGain || this.masterGain;

      if (kind === 'fulltime') {
        this.fireWhistleBlast(ctx, dest, t, 0.22, 0.48);
        this.fireWhistleBlast(ctx, dest, t + 0.30, 0.22, 0.48);
        this.fireWhistleBlast(ctx, dest, t + 0.60, 0.68, 0.56);
      } else if (kind === 'goal') {
        this.fireWhistleBlast(ctx, dest, t, 0.20, 0.48);
        this.fireWhistleBlast(ctx, dest, t + 0.26, 0.52, 0.56);
      } else {
        this.fireWhistleBlast(ctx, dest, t, 0.42, 0.48);
      }
    } catch {
      // AudioContext fallback
    }
  }

  public playGoalWhistle(isGoal: boolean = true): void {
    this.playWhistle(isGoal ? 'goal' : 'kickoff');
  }

  /**
   * Deep Stadium Goal Horn Triad
   */
  public playGoalHorn(): void {
    if (this._isMuted || !this.goalSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.envGain || this.masterGain;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(130.81, t); // C3
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(164.81, t); // E3
      osc3.type = 'sawtooth';
      osc3.frequency.setValueAtTime(196.00, t); // G3

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, t);
      filter.frequency.linearRampToValueAtTime(860, t + 0.18);
      filter.frequency.exponentialRampToValueAtTime(360, t + 1.35);
      filter.Q.setValueAtTime(2.0, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.52, t + 0.09);
      gain.gain.setValueAtTime(0.52, t + 0.85);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);

      osc1.connect(filter);
      osc2.connect(filter);
      osc3.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc1.start(t);
      osc2.start(t);
      osc3.start(t);
      osc1.stop(t + 1.35);
      osc2.stop(t + 1.35);
      osc3.stop(t + 1.35);

      osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        osc3.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Layered Stadium Crowd Ovations (dual vocal-formant filtered noise)
   */
  public playCrowdCheer(): void {
    if (this._isMuted || !this.crowdSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.envGain || this.masterGain;
      const buffer = this.getNoiseBuffer(ctx, true);

      const bands = [
        { freq: 520, q: 1.5, peak: 0.34, dur: 2.1 },
        { freq: 1320, q: 2.1, peak: 0.22, dur: 1.9 }
      ];

      for (const b of bands) {
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(b.freq * 0.85, t);
        filter.frequency.linearRampToValueAtTime(b.freq * 1.15, t + 0.45);
        filter.frequency.exponentialRampToValueAtTime(b.freq * 0.78, t + b.dur);
        filter.Q.setValueAtTime(b.q, t);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(b.peak, t + 0.22);
        gain.gain.setValueAtTime(b.peak * 0.85, t + b.dur * 0.55);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + b.dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        noise.start(t);
        noise.stop(t + b.dur);
        noise.onended = () => {
          noise.disconnect();
          filter.disconnect();
          gain.disconnect();
        };
      }
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Full Goal Celebration Package: Net Swish + Goal Whistle + Stadium Horn + Crowd Roar
   */
  public playGoalCelebration(): void {
    if (this._isMuted) return;
    this.playNetSwish();
    if (this.goalSoundEnabled) {
      this.playWhistle('goal');
      this.playGoalHorn();
    }
    if (this.crowdSoundEnabled) {
      this.playCrowdCheer();
    }
  }

  /**
   * Collective stadium crowd "OOOOH!" gasp on post hits or heroic goalie saves
   */
  public playCrowdGasp(): void {
    if (this._isMuted || !this.crowdSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx, true);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, t);
      filter.frequency.linearRampToValueAtTime(880, t + 0.16);
      filter.frequency.exponentialRampToValueAtTime(460, t + 0.62);
      filter.Q.setValueAtTime(2.2, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.32, t + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.envGain || this.masterGain);

      noise.start(t);
      noise.stop(t + 0.65);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Ultras / Barras chant: 4-beat stadium bass drum ("bombo") + rhythmic crowd chant swells
   */
  public playBarrasChant(): void {
    if (this._isMuted || !this.crowdSoundEnabled || !this.ambientSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.envGain || this.masterGain;
      const beatOffsets = [0, 0.36, 0.56, 0.92, 1.28];

      // Stadium bombo bass drums
      for (const offset of beatOffsets) {
        this.scheduleNote(ctx, dest, 'sine', 96, 40, t + offset, 0.22, 0.36);
      }

      // Crowd rhythmic "Eh / Olé!" formant swell
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx, true);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, t);
      filter.frequency.setValueAtTime(790, t + 0.52);
      filter.frequency.setValueAtTime(640, t + 1.05);
      filter.Q.setValueAtTime(2.6, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.20, t + 0.18);
      gain.gain.setValueAtTime(0.24, t + 0.65);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      noise.start(t);
      noise.stop(t + 1.75);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Kinetic Dash / Boost Whoosh
   */
  public playDashWhoosh(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.sfxGain || this.masterGain;

      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx, false);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, t);
      filter.frequency.exponentialRampToValueAtTime(2150, t + 0.15);
      filter.Q.setValueAtTime(2.0, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      noise.start(t);
      noise.stop(t + 0.17);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      this.scheduleNote(ctx, dest, 'sine', 240, 90, t, 0.12, 0.16);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Magnus Effect Curve-Shot Shimmer
   */
  public playMagnusSwirl(): void {
    if (this._isMuted || !this.kickSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.sfxGain || this.masterGain;
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, t);
      osc.frequency.exponentialRampToValueAtTime(920, t + 0.22);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(28, t);
      lfoGain.gain.setValueAtTime(55, t);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

      osc.connect(gain);
      gain.connect(dest);

      lfo.start(t);
      osc.start(t);
      lfo.stop(t + 0.24);
      osc.stop(t + 0.24);
      osc.onended = () => {
        lfo.disconnect();
        lfoGain.disconnect();
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Sudden-Death / Golden Goal Alert Siren
   */
  public playGoldenGoalSiren(): void {
    if (this._isMuted || !this.whistleSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.envGain || this.masterGain;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(698.46, t + 0.35);
      osc.frequency.linearRampToValueAtTime(440, t + 0.78);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.Q.setValueAtTime(1.5, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(t);
      osc.stop(t + 0.85);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Ambient stadium murmur (pink-filtered bed + distant stadium hum)
   */
  public playAmbientStadium(): void {
    if (this._isMuted || !this.ambientSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.envGain || this.masterGain;
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx, true);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      noise.start(t);
      noise.stop(t + 2.2);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Match final seconds countdown tick
   */
  public playCountdownTick(urgent: boolean = false): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.envGain || this.masterGain;
      this.scheduleNote(ctx, dest, 'triangle', urgent ? 987.77 : 783.99, urgent ? 920 : 740, t, 0.11, urgent ? 0.34 : 0.22);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 5. Kickoff Countdown Chime: punchy D5 -> GO G5+D6 harmonic burst
   */
  public playCountdown(isGo: boolean = false): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.masterGain;
      if (isGo) {
        this.scheduleNote(ctx, dest, 'triangle', 783.99, 783.99, t, 0.36, 0.34);
        this.scheduleNote(ctx, dest, 'sine', 1174.66, 1174.66, t + 0.02, 0.34, 0.24);
      } else {
        this.scheduleNote(ctx, dest, 'triangle', 587.33, 554.37, t, 0.16, 0.30);
      }
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 6. Chat message blip: clean warm C6 -> E6 chime
   */
  public playChatMessageSound(): void {
    if (this._isMuted || !this.chatNormalSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.chatGain || this.masterGain;
      this.scheduleNote(ctx, dest, 'sine', 1046.5, 1318.5, t, 0.075, 0.14);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Chat Mention alert (@jugador): shimmering triad ping
   */
  public playChatMentionSound(): void {
    if (this._isMuted || !this.chatMentionSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.chatGain || this.masterGain;
      this.scheduleNote(ctx, dest, 'sine', 880, 1108.73, t, 0.14, 0.18);
      this.scheduleNote(ctx, dest, 'triangle', 1318.51, 1760, t + 0.05, 0.18, 0.16);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Pitch Emote pop harmonic
   */
  public playPitchEmoteSound(): void {
    if (this._isMuted || !this.chatEmotesSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.chatGain || this.masterGain;
      this.scheduleNote(ctx, dest, 'sine', 587.33, 1046.5, t, 0.10, 0.20);
      this.scheduleNote(ctx, dest, 'triangle', 880, 1318.5, t + 0.02, 0.09, 0.10);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 7. Player joined arpeggio: C5 -> E5 -> G5
   */
  public playPlayerJoinedSound(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const dest = this.masterGain;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        this.scheduleNote(ctx, dest, 'sine', freq, freq * 1.01, t + idx * 0.06, 0.16, 0.15);
      });
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Sleek soft cyber UI hover tick
   */
  public playUIHover(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      this.scheduleNote(ctx, this.masterGain, 'sine', 1050, 1380, t, 0.026, 0.035);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Tactile futuristic mechanical UI click
   */
  public playUIClick(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      this.scheduleNote(ctx, this.masterGain, 'triangle', 360, 145, t, 0.038, 0.16);
      this.scheduleNote(ctx, this.masterGain, 'sine', 1650, 1200, t, 0.018, 0.06);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Expone un MediaStream de salida conectado al masterGain para capturar audio
   * procedural del juego junto al video de canvas en MatchRecorder (.webm).
   */
  public getAudioStream(): MediaStream | null {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return null;
    if (typeof ctx.createMediaStreamDestination !== 'function') return null;

    try {
      if (!this.mediaStreamDest) {
        this.mediaStreamDest = ctx.createMediaStreamDestination();
        this.masterGain.connect(this.mediaStreamDest);
      }
      return this.mediaStreamDest.stream;
    } catch {
      return null;
    }
  }

  /**
   * Mantiene activo un oscilador inaudible de ganancia casi cero (0.00015) para el Host.
   * Evita que el navegador suspenda o ralentice la pestaña del Host cuando está en segundo plano.
   */
  public startHostKeepAlive(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void ctx.resume().catch(() => {});
    }
    if (this.keepAliveOsc) return;

    try {
      this.keepAliveGain = ctx.createGain();
      this.keepAliveGain.gain.setValueAtTime(0.00015, ctx.currentTime);
      this.keepAliveOsc = ctx.createOscillator();
      this.keepAliveOsc.type = 'sine';
      this.keepAliveOsc.frequency.setValueAtTime(40, ctx.currentTime);
      this.keepAliveOsc.connect(this.keepAliveGain);
      this.keepAliveGain.connect(ctx.destination);
      this.keepAliveOsc.start();
    } catch {
      // Ignorado si la política del navegador requiere interacción previa
    }
  }

  public stopHostKeepAlive(): void {
    if (this.keepAliveOsc) {
      try {
        this.keepAliveOsc.stop();
        this.keepAliveOsc.disconnect();
      } catch {
        // Ignored
      }
      this.keepAliveOsc = null;
    }
    if (this.keepAliveGain) {
      try {
        this.keepAliveGain.disconnect();
      } catch {
        // Ignored
      }
      this.keepAliveGain = null;
    }
  }

  public play(
    type:
      | 'kick'
      | 'bounce'
      | 'post'
      | 'goal'
      | 'whistle'
      | 'countdown'
      | 'chat'
      | 'player_joined'
      | 'gasp'
      | 'barras'
      | 'dash'
      | 'magnus'
      | 'golden_goal'
      | 'net_swish'
      | string,
    isGo?: boolean
  ): void {
    switch (type) {
      case 'kick':
        return this.playKick();
      case 'bounce':
        return this.playBounce();
      case 'post':
        return this.playPostHit();
      case 'goal':
        return this.playGoalCelebration();
      case 'whistle':
        return this.playWhistle('kickoff');
      case 'countdown':
        return this.playCountdown(isGo);
      case 'chat':
        return this.playChatMessageSound();
      case 'player_joined':
        return this.playPlayerJoinedSound();
      case 'gasp':
        return this.playCrowdGasp();
      case 'barras':
        return this.playBarrasChant();
      case 'dash':
        return this.playDashWhoosh();
      case 'magnus':
        return this.playMagnusSwirl();
      case 'golden_goal':
        return this.playGoldenGoalSiren();
      case 'net_swish':
        return this.playNetSwish();
    }
  }
}

export { SoundFX as AudioManager, SoundFX as AudioEngine };
export const soundFX = new SoundFX();
