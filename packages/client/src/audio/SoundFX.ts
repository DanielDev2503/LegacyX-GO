/**
 * SoundFX.ts
 * Procedural Web Audio API Synthesizer for LegacyX-GO.
 * Generates kicks, wall bounces, post clinks, referee whistles, countdown beeps,
 * chat blips, and player-join arpeggios with ZERO external audio assets.
 */

export class SoundFX {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private chatGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private envGain: GainNode | null = null;

  private _isMuted: boolean = false;
  private _volume: number = 0.5;
  private _chatVolume: number = 0.7;
  private _sfxVolume: number = 0.7;
  private _envVolume: number = 0.5;

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

      // Sub-canales de audio
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
   * 1. Kick: 220 Hz -> 45 Hz triangle wave in 80ms
   */
  public playKick(strength: number = 1.0): void {
    if (this._isMuted || !this.kickSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const normalizedStrength = Math.max(0.2, Math.min(2.0, strength));
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

      gain.gain.setValueAtTime(Math.min(1.0, 0.9 * normalizedStrength), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.sfxGain || this.masterGain);

      osc.start(t);
      osc.stop(t + 0.08);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 2. Wall Bounce: 110 Hz -> 40 Hz sine wave in 60ms
   */
  public playBounce(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain || this.masterGain);

      osc.start(t);
      osc.stop(t + 0.06);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 3. Post Hit: 1400 Hz -> 900 Hz + 2850 Hz -> 2100 Hz metallic dual-resonance in 250ms
   */
  public playPostHit(): void {
    if (this._isMuted || !this.postHitSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1400, t);
      osc1.frequency.exponentialRampToValueAtTime(900, t + 0.25);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2850, t);
      osc2.frequency.exponentialRampToValueAtTime(2100, t + 0.25);

      gain.gain.setValueAtTime(0.7, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.sfxGain || this.masterGain);

      osc1.start(t);
      osc2.start(t + 0.002);
      osc1.stop(t + 0.25);
      osc2.stop(t + 0.25);

      osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  public playGoal(): void {
    this.playGoalWhistle(true);
  }

  /**
   * 4. Referee Whistle: 2600 Hz + 2950 Hz with 32 Hz LFO trill over 900ms
   */
  public playWhistle(): void {
    this.playGoalWhistle(false);
  }

  public playGoalWhistle(isGoal: boolean = true): void {
    if (this._isMuted) return;
    if (isGoal && !this.goalSoundEnabled) return;
    if (!isGoal && !this.whistleSoundEnabled) return;
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

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(32, t);
      lfoGain.gain.setValueAtTime(150, t);

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      masterWhistleGain.gain.setValueAtTime(0, t);
      masterWhistleGain.gain.linearRampToValueAtTime(0.6, t + 0.05);
      masterWhistleGain.gain.setValueAtTime(0.6, t + 0.5);
      masterWhistleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

      osc1.connect(masterWhistleGain);
      osc2.connect(masterWhistleGain);
      masterWhistleGain.connect(this.envGain || this.masterGain);

      lfo.start(t);
      osc1.start(t);
      osc2.start(t);

      const endTime = t + 0.9;
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
      // AudioContext fallback
    }
  }

  public playGoalHorn(): void {
    if (this._isMuted || !this.goalSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(130.81, t);

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(164.81, t);

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
      gain.connect(this.envGain || this.masterGain);

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
      // AudioContext fallback
    }
  }

  /**
   * Crowd cheering / ovation synthesizer (filtered noise with rise/fall envelope)
   */
  public playCrowdCheer(): void {
    if (this._isMuted || !this.crowdSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 1.5);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, t);
      filter.Q.setValueAtTime(1.6, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.envGain || this.masterGain);

      noise.start(t);
      noise.stop(t + 1.5);

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
   * Ambient stadium drone
   */
  public playAmbientStadium(): void {
    if (this._isMuted || !this.ambientSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(65, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

      osc.connect(gain);
      gain.connect(this.envGain || this.masterGain);

      osc.start(t);
      osc.stop(t + 2.0);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 5. Countdown beep: 440 Hz / 880 Hz GO
   */
  public playCountdown(isGo: boolean = false): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const freq = isGo ? 880 : 440;
      const duration = isGo ? 0.35 : 0.15;

      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + duration);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 6. Chat blip: 800 Hz -> 1200 Hz in 50ms
   */
  public playChatMessageSound(): void {
    if (this._isMuted || !this.chatNormalSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.chatGain || this.masterGain);

      osc.start(t);
      osc.stop(t + 0.08);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Chat Mention sound (@tu_nombre)
   */
  public playChatMentionSound(): void {
    if (this._isMuted || !this.chatMentionSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, t);
      osc1.frequency.exponentialRampToValueAtTime(1320, t + 0.12);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, t + 0.04);
      osc2.frequency.exponentialRampToValueAtTime(2200, t + 0.16);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.chatGain || this.masterGain);

      osc1.start(t);
      osc2.start(t + 0.04);
      osc1.stop(t + 0.22);
      osc2.stop(t + 0.22);

      osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * Pitch Emote pop/bubble sound
   */
  public playPitchEmoteSound(): void {
    if (this._isMuted || !this.chatEmotesSoundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(980, t + 0.09);

      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

      osc.connect(gain);
      gain.connect(this.chatGain || this.masterGain);

      osc.start(t);
      osc.stop(t + 0.14);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * 7. Player joined arpeggio: C5 (523.25 Hz) -> E5 (659.25 Hz)
   */
  public playPlayerJoinedSound(): void {
    if (this._isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      const notes = [523.25, 659.25];
      const noteInterval = 0.06;
      const noteDuration = 0.15;

      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const noteTime = t + idx * noteInterval;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);
        gain.gain.setValueAtTime(0.18, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + noteDuration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(noteTime);
        osc.stop(noteTime + noteDuration);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      });
    } catch {
      // AudioContext fallback
    }
  }

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
      // AudioContext fallback
    }
  }

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
      // AudioContext fallback
    }
  }

  public play(
    type: 'kick' | 'bounce' | 'post' | 'goal' | 'countdown' | 'chat' | 'player_joined' | string,
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
        return this.playGoalWhistle(true);
      case 'countdown':
        return this.playCountdown(isGo);
      case 'chat':
        return this.playChatMessageSound();
      case 'player_joined':
        return this.playPlayerJoinedSound();
    }
  }
}

export { SoundFX as AudioManager, SoundFX as AudioEngine };
export const soundFX = new SoundFX();
