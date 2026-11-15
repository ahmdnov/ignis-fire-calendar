import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BURN_TIMELINE,
  computeBurnProgress,
  computeEmberHeat,
  computeHeatMirage,
  estimateOrganicBurnRadius,
  getBurnTimelineState,
} from './burnTimeline';

test('pre-ignition holds dark charred bark & smoke canopy until 0.15s', () => {
  const state = getBurnTimelineState(0.08);
  assert.equal(state.phase, 'pre-ignition');
  assert.equal(state.burnProgress, 0);
  assert.equal(state.emberHeat, 0);
  assert.equal(state.heatMirage, 0);
  assert.equal(state.isInteractive, false);
  assert.equal(state.isOverlayMounted, true);
  assert.equal(state.isNavVisible, false);
});

test('ignition expands volumetric forest-fire burnProgress monotonically from 0.15s to 4.2s', () => {
  const early = computeBurnProgress(0.5);
  const mid = computeBurnProgress(2.1);
  const late = computeBurnProgress(3.8);
  const done = computeBurnProgress(BURN_TIMELINE.BURN_END_SEC);

  assert.ok(early > 0 && early < mid);
  assert.ok(mid < late);
  assert.ok(late < 1);
  assert.equal(done, 1);
});

test('cooling ember curve peaks as blaze surrounds center and cools cleanly by 4.65s', () => {
  const before = computeEmberHeat(0.1);
  const rising = computeEmberHeat(1.0);
  const peak = computeEmberHeat(BURN_TIMELINE.LOGO_EMBER_PEAK_SEC);
  const cooling = computeEmberHeat(3.7);
  const cooled = computeEmberHeat(4.7);

  assert.equal(before, 0);
  assert.ok(rising > 0.4 && rising < 1);
  assert.equal(peak, 1);
  assert.ok(cooling > 0 && cooling < 0.7);
  assert.equal(cooled, 0);
});

test('heatMirage shimmers behind passing flame front and decays cleanly to 0 by 4.65s', () => {
  assert.equal(computeHeatMirage(0.2), 0);
  assert.equal(computeHeatMirage(2.2), 1);
  const decaying = computeHeatMirage(3.85);
  assert.ok(decaying > 0 && decaying < 0.7);
  assert.equal(computeHeatMirage(4.65), 0);
  assert.equal(getBurnTimelineState(0, true).heatMirage, 0);
});

test('overlay becomes interactive at 4.2s while cooling shimmer & trailing cinders finish clearing', () => {
  const fireCleared = getBurnTimelineState(4.25);
  assert.equal(fireCleared.isBurnFinished, true);
  assert.equal(fireCleared.isInteractive, true);
  assert.equal(fireCleared.isOverlayMounted, true);
  assert.equal(fireCleared.isParticleCanvasMounted, true);
  assert.equal(fireCleared.isNavVisible, true);

  const fullySettled = getBurnTimelineState(5.0);
  assert.equal(fullySettled.isOverlayMounted, false);
  assert.equal(fullySettled.isParticleCanvasMounted, false);
  assert.equal(fullySettled.heatMirage, 0);
  assert.equal(fullySettled.phase, 'complete');
});

test('skipIntro immediately yields interactive state with nav visible', () => {
  const skipped = getBurnTimelineState(0, true);
  assert.equal(skipped.phase, 'complete');
  assert.equal(skipped.burnProgress, 1);
  assert.equal(skipped.isInteractive, true);
  assert.equal(skipped.isOverlayMounted, false);
  assert.equal(skipped.isParticleCanvasMounted, false);
  assert.equal(skipped.isNavVisible, true);
});

test('organic burn radius varies non-circularly with angle', () => {
  const r1 = estimateOrganicBurnRadius(0.5, 0, 1.6, 1.5);
  const r2 = estimateOrganicBurnRadius(0.5, Math.PI / 3, 1.6, 1.5);
  assert.notEqual(r1, r2);
  assert.ok(r1 > 0 && r2 > 0);
});
