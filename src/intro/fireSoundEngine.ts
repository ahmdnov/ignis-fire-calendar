import { FIRE_AUDIO_TIMELINE, generateCrackleEvents } from './fireAudioSchedule';

type AudioStopHandle = {
  stopAt: (when: number) => void;
};

class FireSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private brownBuffer: AudioBuffer | null = null;
  private pinkBuffer: AudioBuffer | null = null;
  private crackleBuffer: AudioBuffer | null = null;
  private activeHandles: AudioStopHandle[] = [];
  private muted = false;
  private hasStartedThisRun = false;
  /** Bumped by stopAll(), so a play that was still waiting on resume() can't start after a stop. */
  private generation = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.22;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0.0001 : 0.92;

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.buildNoiseBuffers(this.ctx);
    }

    return this.ctx;
  }

  private buildNoiseBuffers(ctx: AudioContext) {
    const sampleRate = ctx.sampleRate;
    const loopLen = Math.floor(sampleRate * 4.0);

    // 1. Warm Brownian Noise Buffer (low-frequency rumble & turbulent fire body)
    const brown = ctx.createBuffer(1, loopLen, sampleRate);
    const brownData = brown.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < loopLen; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.024 * white) / 1.024;
      brownData[i] = Math.max(-1, Math.min(1, lastOut * 3.4));
    }
    this.brownBuffer = brown;

    // 2. Paul Kellet Pink Noise Buffer (natural turbulent air-and-flame texture)
    const pink = ctx.createBuffer(1, loopLen, sampleRate);
    const pinkData = pink.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < loopLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      pinkData[i] = Math.max(-1, Math.min(1, sample));
    }
    this.pinkBuffer = pink;

    // 3. Dry Crispy Granular Impulse Buffer (42ms sharp wood-char transient)
    const crackleLen = Math.floor(sampleRate * 0.042);
    const crackle = ctx.createBuffer(1, crackleLen, sampleRate);
    const crackleData = crackle.getChannelData(0);
    for (let i = 0; i < crackleLen; i++) {
      const env = Math.pow(1 - i / crackleLen, 3.2);
      const spike = i < sampleRate * 0.004 ? 1.35 : 0.75;
      crackleData[i] = (Math.random() * 2 - 1) * env * spike;
    }
    this.crackleBuffer = crackle;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(mute ? 0.0001 : 0.92, now, 0.02);

    if (!mute && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  public toggleMute(currentElapsedSec: number): boolean {
    const nextMuted = !this.muted;
    this.setMuted(nextMuted);
    if (!nextMuted && !this.hasStartedThisRun && currentElapsedSec < FIRE_AUDIO_TIMELINE.TOTAL_DURATION_SEC) {
      void this.playSynced(currentElapsedSec);
    }
    return nextMuted;
  }

  public stopAll(): void {
    const ctx = this.ctx;
    const now = ctx ? ctx.currentTime : 0;
    for (const handle of this.activeHandles) {
      try {
        handle.stopAt(now + 0.025);
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.activeHandles = [];
    this.hasStartedThisRun = false;
    this.generation++;
  }

  /**
   * True when the browser lets audio play right now. Without a prior user gesture most browsers keep
   * the context suspended (and `resume()` pending), so this waits briefly instead of forever.
   */
  public async canPlayNow(waitMs = 250): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    try {
      await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, waitMs))]);
    } catch {
      return false;
    }
    return (ctx.state as AudioContextState) === 'running';
  }

  /**
   * Attempts autoplay immediately on page load; returns true if running,
   * or false if browser autoplay policy requires a first user gesture to unlock.
   */
  public async tryAutoplay(offsetSec = 0): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }

    if (ctx.state !== 'running') {
      return false;
    }

    await this.playSynced(offsetSec);
    return true;
  }

  public async playSynced(offsetSec = 0): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.compressor || !this.brownBuffer || !this.pinkBuffer || !this.crackleBuffer) {
      return;
    }

    const gen = this.generation;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    if (gen !== this.generation) return;

    if (offsetSec >= FIRE_AUDIO_TIMELINE.TOTAL_DURATION_SEC) {
      return;
    }

    this.stopAll();
    this.hasStartedThisRun = true;

    const now = ctx.currentTime + 0.015;
    const origin = now - offsetSec;
    const handles: AudioStopHandle[] = [];

    const scheduleGainPoint = (param: AudioParam, time: number, value: number) => {
      if (time >= now) {
        param.exponentialRampToValueAtTime(Math.max(0.0001, value), time);
      }
    };

    // =========================================================================
    // PHASE 1 (0.0s - 1.2s): Hard Ignition Sub-Bass Punch & Air-Sucking Whoosh
    // =========================================================================
    if (offsetSec < 1.28) {
      // 1A. Sub-bass ignition punch (155Hz -> 55Hz)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'triangle';
      const punchStart = Math.max(now, origin + 0.12);
      subOsc.frequency.setValueAtTime(155, punchStart);
      subOsc.frequency.exponentialRampToValueAtTime(55, Math.max(punchStart + 0.05, origin + 0.62));

      subGain.gain.setValueAtTime(0.0001, now);
      if (origin + 0.14 >= now) {
        subGain.gain.setValueAtTime(0.0001, origin + 0.12);
        subGain.gain.exponentialRampToValueAtTime(0.42, origin + 0.2);
      } else {
        subGain.gain.setValueAtTime(0.24, now);
      }
      scheduleGainPoint(subGain.gain, origin + 0.85, 0.0001);

      subOsc.connect(subGain);
      subGain.connect(this.compressor);
      subOsc.start(punchStart);
      subOsc.stop(Math.max(now + 0.05, origin + 1.05));
      handles.push({ stopAt: (t) => subOsc.stop(t) });

      // 1B. Low-end warm pressure swell (brown noise < 160Hz)
      const pressureSrc = ctx.createBufferSource();
      pressureSrc.buffer = this.brownBuffer;
      pressureSrc.loop = true;

      const pressureFilter = ctx.createBiquadFilter();
      pressureFilter.type = 'lowpass';
      pressureFilter.frequency.setValueAtTime(160, now);
      pressureFilter.Q.value = 1.2;

      const pressureGain = ctx.createGain();
      pressureGain.gain.setValueAtTime(0.0001, now);
      scheduleGainPoint(pressureGain.gain, origin + 0.26, 0.55);
      scheduleGainPoint(pressureGain.gain, origin + 1.25, 0.0001);

      pressureSrc.connect(pressureFilter);
      pressureFilter.connect(pressureGain);
      pressureGain.connect(this.compressor);
      pressureSrc.start(now, Math.random() * 2);
      pressureSrc.stop(Math.max(now + 0.05, origin + 1.32));
      handles.push({ stopAt: (t) => pressureSrc.stop(t) });

      // 1C. Fast rushing turbulent air-and-flame sweep (220Hz -> 1400Hz -> 280Hz)
      const whooshSrc = ctx.createBufferSource();
      whooshSrc.buffer = this.pinkBuffer;
      whooshSrc.loop = true;

      const whooshFilter = ctx.createBiquadFilter();
      whooshFilter.type = 'bandpass';
      whooshFilter.Q.value = 2.3;
      const sweepStart = Math.max(now, origin + 0.1);
      whooshFilter.frequency.setValueAtTime(220, sweepStart);
      if (origin + 0.44 > now) {
        whooshFilter.frequency.exponentialRampToValueAtTime(1400, origin + 0.44);
      }
      if (origin + 1.22 > now) {
        whooshFilter.frequency.exponentialRampToValueAtTime(280, origin + 1.22);
      }

      const whooshGain = ctx.createGain();
      whooshGain.gain.setValueAtTime(0.0001, now);
      if (origin + 0.44 > now) {
        whooshGain.gain.exponentialRampToValueAtTime(0.68, origin + 0.44);
      } else {
        whooshGain.gain.setValueAtTime(0.38, now);
      }
      scheduleGainPoint(whooshGain.gain, origin + 1.25, 0.0001);

      whooshSrc.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(this.compressor);
      whooshSrc.start(now, Math.random() * 2);
      whooshSrc.stop(Math.max(now + 0.05, origin + 1.32));
      handles.push({ stopAt: (t) => whooshSrc.stop(t) });
    }

    // =========================================================================
    // PHASE 2 (1.0s - 3.45s): Forest Wildfire Roar Eating Through Wood
    // =========================================================================
    if (offsetSec < 3.45) {
      const roarStart = Math.max(now, origin + 0.78);
      const roarEnd = Math.max(now + 0.1, origin + 3.55);

      const buildRoarLayer = (
        buffer: AudioBuffer,
        baseFreq: number,
        q: number,
        peakGain: number,
        lfoRate: number,
        lfoDepthHz: number,
        panPos: number
      ) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(baseFreq, roarStart);
        filter.Q.value = q;

        // Organic billowing LFO on filter cutoff & subtle gain modulation
        const lfo = ctx.createOscillator();
        const lfoFilterGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = lfoRate;
        lfoFilterGain.gain.value = lfoDepthHz;
        lfo.connect(lfoFilterGain);
        lfoFilterGain.connect(filter.frequency);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        if (origin + 1.32 > now) {
          gain.gain.setValueAtTime(0.0001, roarStart);
          gain.gain.exponentialRampToValueAtTime(peakGain, origin + 1.32);
        } else {
          gain.gain.setValueAtTime(peakGain * 0.85, now);
        }
        if (origin + 2.75 > now) {
          gain.gain.setValueAtTime(peakGain, origin + 2.75);
        }
        scheduleGainPoint(gain.gain, origin + 3.48, 0.0001);

        const panner = ctx.createStereoPanner();
        panner.pan.value = panPos;

        src.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this.compressor!);

        src.start(roarStart, Math.random() * 2.5);
        src.stop(roarEnd);
        lfo.start(roarStart);
        lfo.stop(roarEnd);

        handles.push({
          stopAt: (t) => {
            src.stop(t);
            lfo.stop(t);
          },
        });
      };

      // Deep warm timber-fire body (150Hz - 360Hz) + roaring mid flame wall (340Hz - 650Hz)
      buildRoarLayer(this.brownBuffer, 225, 0.95, 0.62, 0.43, 85, -0.32);
      buildRoarLayer(this.pinkBuffer, 460, 1.35, 0.34, 0.71, 165, 0.32);
    }

    // =========================================================================
    // PHASE 2 -> 3 (1.15s - 5.8s): Wood Consumption Pops & Ember Crackling
    // =========================================================================
    const grains = generateCrackleEvents(Math.floor(Math.random() * 100000) + 1);
    for (const grain of grains) {
      const when = origin + grain.timeSec;
      if (when < now - 0.01) continue;

      const startAt = Math.max(now, when);
      const src = ctx.createBufferSource();
      src.buffer = this.crackleBuffer;
      src.playbackRate.value = grain.playbackRate;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = grain.freqHz;
      filter.Q.value = grain.q;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0001, grain.gain), startAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + grain.durationSec);

      const panner = ctx.createStereoPanner();
      panner.pan.value = grain.pan;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.compressor);

      src.start(startAt);
      src.stop(startAt + grain.durationSec + 0.01);
      handles.push({ stopAt: (t) => src.stop(t) });
    }

    this.activeHandles = handles;
  }
}

export const fireSoundEngine = new FireSoundEngine();
