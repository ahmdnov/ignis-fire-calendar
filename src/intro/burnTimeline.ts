export const BURN_TIMELINE = {
  IGNITION_START_SEC: 0.15,
  BURN_END_SEC: 4.2,
  PARTICLE_UNMOUNT_SEC: 4.95,
  LOGO_EMBER_IGNITE_SEC: 0.35,
  LOGO_EMBER_PEAK_SEC: 3.05,
  LOGO_COOL_END_SEC: 4.65,
  NAV_REVEAL_SEC: 3.95,
} as const;

export type IntroPhase = 'pre-ignition' | 'burning' | 'cooling' | 'complete';

export interface BurnTimelineState {
  elapsedSec: number;
  /** Normalized 0..1 progress of the volumetric forest-fire parting across the viewport */
  burnProgress: number;
  /** True once the roaring fire has cleared all corners (>= 4.2s) */
  isBurnFinished: boolean;
  /** True once overlay pointer-events should be disabled (>= 4.2s) */
  isInteractive: boolean;
  /** True while the WebGL fire shader overlay should remain mounted */
  isOverlayMounted: boolean;
  /** True while the 2D cinder/smoke particle canvas should remain mounted */
  isParticleCanvasMounted: boolean;
  /** 0..1 heat intensity for the "IGNIS" burned-wood cooling ember glow */
  emberHeat: number;
  /** 0..1 convective air mirage intensity over the revealed site, decaying over ~1.5s */
  heatMirage: number;
  /** True when the sticky top nav should fade in */
  isNavVisible: boolean;
  phase: IntroPhase;
}

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Nonlinear expansion curve for a surrounding forest fire parting from center:
 * ignites rapidly into a roaring ring, lingers briefly as the tall flame wall sweeps outward,
 * then accelerates cleanly past the four viewport corners by 4.2s.
 */
export function computeBurnProgress(elapsedSec: number): number {
  if (elapsedSec <= BURN_TIMELINE.IGNITION_START_SEC) return 0;
  if (elapsedSec >= BURN_TIMELINE.BURN_END_SEC) return 1;

  const span = BURN_TIMELINE.BURN_END_SEC - BURN_TIMELINE.IGNITION_START_SEC;
  const t = clamp01((elapsedSec - BURN_TIMELINE.IGNITION_START_SEC) / span);
  const smooth = t * t * (3 - 2 * t);
  return clamp01(t * 0.38 + smooth * 0.62);
}

/**
 * Computes the cooling ember intensity (0..1) on the recessed "IGNIS" pyrography lettering.
 * Rises rapidly to a radiant glow as the fire opens, holds through peak blaze,
 * and cools smoothly over ~1.6s (3.05s -> 4.65s) into a subtle warm smoldering finish.
 */
export function computeEmberHeat(elapsedSec: number): number {
  if (elapsedSec < BURN_TIMELINE.LOGO_EMBER_IGNITE_SEC) return 0;
  if (elapsedSec <= BURN_TIMELINE.LOGO_EMBER_PEAK_SEC) {
    const rise =
      (elapsedSec - BURN_TIMELINE.LOGO_EMBER_IGNITE_SEC) /
      (BURN_TIMELINE.LOGO_EMBER_PEAK_SEC - BURN_TIMELINE.LOGO_EMBER_IGNITE_SEC);
    return clamp01(Math.pow(rise, 0.35));
  }
  if (elapsedSec >= BURN_TIMELINE.LOGO_COOL_END_SEC) return 0;

  const coolT =
    (elapsedSec - BURN_TIMELINE.LOGO_EMBER_PEAK_SEC) /
    (BURN_TIMELINE.LOGO_COOL_END_SEC - BURN_TIMELINE.LOGO_EMBER_PEAK_SEC);
  return clamp01(Math.pow(1 - coolT, 1.55));
}

/**
 * Computes the refractive heat-shimmer intensity (0..1) over the newly revealed opening
 * right behind the passing fire wall, decaying smoothly to 0.0 over ~1.55s as embers cool.
 */
export function computeHeatMirage(elapsedSec: number): number {
  const startSec = 0.45;
  const peakEndSec = 3.1;
  const decayEndSec = BURN_TIMELINE.LOGO_COOL_END_SEC; // 4.65s (~1.55s decay)

  if (elapsedSec <= startSec || elapsedSec >= decayEndSec) return 0;
  if (elapsedSec <= 1.35) {
    return clamp01((elapsedSec - startSec) / (1.35 - startSec));
  }
  if (elapsedSec <= peakEndSec) {
    return 1;
  }
  const decayT = (elapsedSec - peakEndSec) / (decayEndSec - peakEndSec);
  return clamp01(Math.pow(1 - decayT, 1.7));
}

export function getBurnTimelineState(
  elapsedSec: number,
  skipIntro = false
): BurnTimelineState {
  if (skipIntro) {
    return {
      elapsedSec: BURN_TIMELINE.PARTICLE_UNMOUNT_SEC,
      burnProgress: 1,
      isBurnFinished: true,
      isInteractive: true,
      isOverlayMounted: false,
      isParticleCanvasMounted: false,
      emberHeat: 0,
      heatMirage: 0,
      isNavVisible: true,
      phase: 'complete',
    };
  }

  const burnProgress = computeBurnProgress(elapsedSec);
  const emberHeat = computeEmberHeat(elapsedSec);
  const heatMirage = computeHeatMirage(elapsedSec);
  const isBurnFinished = elapsedSec >= BURN_TIMELINE.BURN_END_SEC;
  const isInteractive = isBurnFinished;
  const isOverlayMounted = elapsedSec < BURN_TIMELINE.LOGO_COOL_END_SEC;
  const isParticleCanvasMounted = elapsedSec < BURN_TIMELINE.PARTICLE_UNMOUNT_SEC;
  const isNavVisible = elapsedSec >= BURN_TIMELINE.NAV_REVEAL_SEC;

  let phase: IntroPhase = 'pre-ignition';
  if (isBurnFinished && emberHeat <= 0.01) {
    phase = 'complete';
  } else if (elapsedSec >= BURN_TIMELINE.IGNITION_START_SEC) {
    phase = elapsedSec >= BURN_TIMELINE.LOGO_EMBER_PEAK_SEC ? 'cooling' : 'burning';
  }

  return {
    elapsedSec,
    burnProgress,
    isBurnFinished,
    isInteractive,
    isOverlayMounted,
    isParticleCanvasMounted,
    emberHeat,
    heatMirage,
    isNavVisible,
    phase,
  };
}

/**
 * Estimates the radial distance (in normalized aspect-corrected space) of the active forest-fire wall
 * at a given angle so the 2D Canvas particle engine emits swirling cinders and smoke wisps along the blaze.
 */
export function estimateOrganicBurnRadius(
  burnProgress: number,
  angleRad: number,
  aspect: number,
  timeSec: number
): number {
  const maxCornerDist = Math.hypot(Math.max(aspect, 1) * 0.5, 0.5) + 0.55;
  const baseRadius = burnProgress * maxCornerDist;
  const organicLobe =
    Math.sin(angleRad * 3.0 + 0.8) * 0.075 +
    Math.cos(angleRad * 5.0 - timeSec * 0.7) * 0.05 +
    Math.sin(angleRad * 8.0 + 1.1) * 0.03;
  return Math.max(0.02, baseRadius + organicLobe * Math.min(1, burnProgress * 2.4));
}
