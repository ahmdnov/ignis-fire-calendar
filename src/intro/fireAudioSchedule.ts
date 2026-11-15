export const FIRE_AUDIO_TIMELINE = {
  IGNITION_AT_SEC: 0.14,
  WHOOSH_PEAK_SEC: 0.44,
  WHOOSH_END_SEC: 1.25,
  ROAR_FADE_IN_START_SEC: 0.85,
  ROAR_PEAK_START_SEC: 1.25,
  ROAR_PEAK_END_SEC: 2.75,
  ROAR_FADE_OUT_END_SEC: 3.45,
  CRACKLE_START_SEC: 1.15,
  ENDING_CRACKLE_START_SEC: 3.0,
  TOTAL_DURATION_SEC: 5.8,
} as const;

export interface CrackleGrain {
  timeSec: number;
  freqHz: number;
  q: number;
  gain: number;
  pan: number;
  durationSec: number;
  playbackRate: number;
  layer: 'consumption' | 'ember';
}

export interface PhaseEnvelopeSnapshot {
  subPunch: number;
  whoosh: number;
  wildfireRoar: number;
  crackleMaster: number;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic PRNG (Mulberry32) so acoustic tests are reproducible
 * while live playback sounds richly organic.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Evaluates normalized gain curves across the three acoustic phases (0.0s - 5.8s).
 */
export function computePhaseEnvelopeSnapshot(tSec: number): PhaseEnvelopeSnapshot {
  if (tSec < 0 || tSec >= FIRE_AUDIO_TIMELINE.TOTAL_DURATION_SEC) {
    return { subPunch: 0, whoosh: 0, wildfireRoar: 0, crackleMaster: 0 };
  }

  // Phase 1: Hard ignition sub-punch & air-sucking whoosh (0.0s - 1.25s)
  let subPunch = 0;
  if (tSec >= 0.08 && tSec <= 1.25) {
    const rise = smoothstep(0.08, 0.22, tSec);
    const decay = Math.pow(1 - clamp01((tSec - 0.22) / (1.25 - 0.22)), 1.9);
    subPunch = rise * decay;
  }

  let whoosh = 0;
  if (tSec >= 0.04 && tSec <= FIRE_AUDIO_TIMELINE.WHOOSH_END_SEC) {
    const rise = smoothstep(0.04, FIRE_AUDIO_TIMELINE.WHOOSH_PEAK_SEC, tSec);
    const fall =
      1 - smoothstep(FIRE_AUDIO_TIMELINE.WHOOSH_PEAK_SEC, FIRE_AUDIO_TIMELINE.WHOOSH_END_SEC, tSec);
    whoosh = rise * fall;
  }

  // Phase 2: Forest wildfire roar eating through wood (0.85s - 3.45s)
  const roarIn = smoothstep(
    FIRE_AUDIO_TIMELINE.ROAR_FADE_IN_START_SEC,
    FIRE_AUDIO_TIMELINE.ROAR_PEAK_START_SEC,
    tSec
  );
  const roarOut =
    1 -
    smoothstep(
      FIRE_AUDIO_TIMELINE.ROAR_PEAK_END_SEC,
      FIRE_AUDIO_TIMELINE.ROAR_FADE_OUT_END_SEC,
      tSec
    );
  const wildfireRoar = roarIn * roarOut;

  // Phase 2->3: Crackles start during wood consumption (~1.15s) and decay softly to 5.8s
  let crackleMaster = 0;
  if (tSec >= FIRE_AUDIO_TIMELINE.CRACKLE_START_SEC) {
    const inRamp = smoothstep(1.15, 1.85, tSec);
    const outRamp = 1 - smoothstep(3.35, FIRE_AUDIO_TIMELINE.TOTAL_DURATION_SEC, tSec);
    crackleMaster = inRamp * outRamp;
  }

  return {
    subPunch: clamp01(subPunch),
    whoosh: clamp01(whoosh),
    wildfireRoar: clamp01(wildfireRoar),
    crackleMaster: clamp01(crackleMaster),
  };
}

/**
 * Generates randomized granular wood-consumption pops (1.15s - 3.25s)
 * and gradually spacing-out, exponentially decaying crispy ember crackles (3.0s - 5.75s).
 */
export function generateCrackleEvents(seed = 20261114): CrackleGrain[] {
  const rand = createSeededRng(seed);
  const grains: CrackleGrain[] = [];

  // Phase 2 wood fiber splits & resin/sap pops (1.15s - 3.25s)
  let t = 1.15;
  while (t < 3.22) {
    const progress = (t - 1.15) / (3.22 - 1.15);
    const interval = 0.045 + rand() * 0.11;
    t += interval;
    if (t >= 3.25) break;

    grains.push({
      timeSec: Number(t.toFixed(4)),
      freqHz: 950 + rand() * 2900,
      q: 1.8 + rand() * 3.4,
      gain: (0.18 + rand() * 0.28) * (0.65 + 0.35 * Math.sin(progress * Math.PI)),
      pan: (rand() - 0.5) * 1.3,
      durationSec: 0.018 + rand() * 0.026,
      playbackRate: 0.72 + rand() * 0.55,
      layer: 'consumption',
    });
  }

  // Phase 3 gradual, easy, crispy wood & ember crackling (3.0s - 5.72s)
  // Frequent around 3.0s, spacing out wider and decaying exponentially toward silence by 5.8s
  let emberT = 3.0;
  while (emberT < 5.7) {
    const decayProgress = clamp01((emberT - 3.0) / (5.72 - 3.0));
    // Spacing grows from ~0.045s at 3.0s up to ~0.34s near 5.6s
    const minGap = 0.04 + Math.pow(decayProgress, 1.55) * 0.24;
    const jitter = rand() * (0.07 + decayProgress * 0.22);
    emberT += minGap + jitter;
    if (emberT >= 5.72) break;

    // Exponential volume decay trailing softly into silence
    const envelope = Math.pow(1 - decayProgress, 2.15);
    grains.push({
      timeSec: Number(emberT.toFixed(4)),
      freqHz: 2000 + rand() * 5000, // 2kHz - 7kHz dry wood-char crisps
      q: 2.8 + rand() * 5.6,
      gain: (0.14 + rand() * 0.24) * envelope,
      pan: (rand() - 0.5) * 1.5,
      durationSec: 0.008 + rand() * 0.022,
      playbackRate: 0.85 + rand() * 0.75,
      layer: 'ember',
    });
  }

  return grains.sort((a, b) => a.timeSec - b.timeSec);
}
