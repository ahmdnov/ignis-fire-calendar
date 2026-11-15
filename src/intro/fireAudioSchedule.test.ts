import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePhaseEnvelopeSnapshot,
  FIRE_AUDIO_TIMELINE,
  generateCrackleEvents,
} from './fireAudioSchedule';

test('phase 1 whoosh and sub-bass punch peak during ignition and fade out by 1.25s', () => {
  const pre = computePhaseEnvelopeSnapshot(0.02);
  const peak = computePhaseEnvelopeSnapshot(FIRE_AUDIO_TIMELINE.WHOOSH_PEAK_SEC);
  const settled = computePhaseEnvelopeSnapshot(1.3);

  assert.equal(pre.whoosh, 0);
  assert.ok(peak.whoosh > 0.85);
  assert.ok(peak.subPunch > 0.35);
  assert.equal(settled.whoosh, 0);
  assert.equal(settled.subPunch, 0);
});

test('phase 2 wildfire roar swells smoothly across 1.0s-3.2s and clears by 3.45s', () => {
  const crossfade = computePhaseEnvelopeSnapshot(1.05);
  const peak = computePhaseEnvelopeSnapshot(2.0);
  const ending = computePhaseEnvelopeSnapshot(3.5);

  assert.ok(crossfade.wildfireRoar > 0.2 && crossfade.wildfireRoar < 1);
  assert.equal(peak.wildfireRoar, 1);
  assert.equal(ending.wildfireRoar, 0);
});

test('phase 3 fades to complete silence by 5.8s', () => {
  const active = computePhaseEnvelopeSnapshot(3.4);
  const tail = computePhaseEnvelopeSnapshot(5.2);
  const end = computePhaseEnvelopeSnapshot(FIRE_AUDIO_TIMELINE.TOTAL_DURATION_SEC);

  assert.ok(active.crackleMaster > 0.5);
  assert.ok(tail.crackleMaster > 0 && tail.crackleMaster < 0.2);
  assert.equal(end.crackleMaster, 0);
  assert.equal(end.wildfireRoar, 0);
  assert.equal(end.whoosh, 0);
});

test('granular ember crackles stay within 2kHz-7kHz, space out over time, and decay exponentially', () => {
  const grains = generateCrackleEvents(12345);
  const emberGrains = grains.filter((g) => g.layer === 'ember');

  assert.ok(emberGrains.length >= 16);
  for (const g of emberGrains) {
    assert.ok(g.freqHz >= 2000 && g.freqHz <= 7000);
    assert.ok(g.pan >= -0.75 && g.pan <= 0.75);
    assert.ok(g.timeSec >= 3.0 && g.timeSec < 5.75);
  }

  const earlyEmbers = emberGrains.filter((g) => g.timeSec < 3.8);
  const lateEmbers = emberGrains.filter((g) => g.timeSec > 4.9);
  assert.ok(earlyEmbers.length > lateEmbers.length);

  const avgEarlyGain =
    earlyEmbers.reduce((acc, g) => acc + g.gain, 0) / Math.max(1, earlyEmbers.length);
  const avgLateGain =
    lateEmbers.reduce((acc, g) => acc + g.gain, 0) / Math.max(1, lateEmbers.length);
  assert.ok(avgEarlyGain > avgLateGain * 3);
});
