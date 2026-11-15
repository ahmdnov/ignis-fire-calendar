import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fireSeason,
  nextInsight,
  nowInsight,
  partsToText,
  thisYearInsight,
  trendInsight,
  trustInsight,
  whenInsight,
  whereInsight,
} from './insights';
import { actionsInsight, buildActions } from './actions';
import { getFallbackSummary, SHOWCASE_COUNTRIES } from './fallbackData';
import type { AreaSelection, BreakdownResponse, MapResponse, ProvinceStat, SummaryResponse } from './types';

const country = SHOWCASE_COUNTRIES[0];
const area: AreaSelection = {
  id: country.code,
  label: country.name,
  slug: 'x',
  kind: 'region',
  countryCode: country.code,
  bbox: country.bbox,
  center: country.center,
  geometry: country.geometry,
  areaKm2: country.areaKm2,
};
const base = () => structuredClone(getFallbackSummary(area, '2025-01-01', '2025-12-31', 2001, 2025)) as SummaryResponse;
const text = (i: { parts: Parameters<typeof partsToText>[0] }) => partsToText(i.parts);

test('fire season wraps the new year and finds the shortest window holding 75%', () => {
  // Southern-hemisphere style season: Aug-Oct dominate.
  const arg = [5, 5, 5, 5, 5, 10, 30, 120, 150, 100, 20, 5];
  const s = fireSeason(arg)!;
  assert.equal(s.peak, 9);
  assert.equal(s.start, 8);
  assert.equal(s.len, 3);
  assert.ok(s.share >= 0.75);
  // Season across the new year: Dec-Feb holds 300 of 382 (79%), the shortest window over 75%.
  const wrap = [100, 80, 5, 2, 2, 2, 2, 2, 2, 5, 60, 120];
  const w = fireSeason(wrap)!;
  assert.equal(w.start, 12);
  assert.equal(w.len, 3);
  assert.equal(fireSeason(new Array(12).fill(0)), null);
});

test('when: names the season and the record month; flat years say there is no season', () => {
  const s = base();
  const meds = [5, 5, 5, 5, 40, 120, 160, 140, 90, 10, 5, 5];
  s.climatology.months = s.climatology.months.map((m, i) => ({ ...m, median: meds[i] }));
  const w = whenInsight(s);
  // Jun-Sep holds 510 of 590 (86%); no 3-month window reaches 75%.
  assert.match(text(w), /fire season runs Jun–Sep: these 4 months hold 86%/);
  assert.match(text(w), /peaking in July/);
  assert.match(text(w), /busiest month on record was/);
  assert.ok(!w.weak);

  s.climatology.months = s.climatology.months.map((m) => ({ ...m, median: 50 }));
  const flat = whenInsight(s);
  assert.match(text(flat), /spread through the whole year/);
  assert.doesNotMatch(text(flat), /busiest month is usually|peaking/);

  s.climatology.months = s.climatology.months.map((m) => ({ ...m, median: 1 }));
  const thin = whenInsight(s);
  assert.ok(thin.weak);
  assert.match(text(thin), /Too little fire/);
});

function withAnnual(s: SummaryResponse, vals: number[], significant: boolean, slope: number) {
  s.calendar.annual = vals.map((v, i) => ({
    year: 2001 + i,
    harmonized: v,
    raw: v,
    cvLower: v,
    cvUpper: v,
    sensorEra: 2001 + i < 2012 ? 'MODIS' : 'VIIRS',
    provisional: false,
  }));
  s.calendar.trend = { slopePctPerYear: slope, pValue: significant ? 0.001 : 0.4, significant, direction: 'stable' };
  return s;
}

test('trend: rising, falling and flat are worded differently and never overclaim', () => {
  const rising = withAnnual(base(), Array.from({ length: 25 }, (_, i) => 1000 + i * 100), true, 4.4);
  rising.reportCard.grade = 'Good';
  const r = trendInsight(rising);
  assert.match(text(r), /^Yes\. Fire has risen about 4\.4% a year since 2001/);
  assert.match(text(r), /10 of the 10 biggest years came in the last decade/);

  const falling = withAnnual(base(), Array.from({ length: 25 }, (_, i) => 5000 - i * 100), true, -2.5);
  falling.reportCard.grade = 'Good';
  assert.match(text(trendInsight(falling)), /^No, it is falling/);

  const flat = withAnnual(base(), Array.from({ length: 25 }, (_, i) => 1000 + (i % 2) * 300), false, 0.3);
  flat.reportCard.grade = 'Good';
  const f = trendInsight(flat);
  assert.match(text(f), /^No clear trend/);
  assert.doesNotMatch(text(f), /risen|falling/);

  // Poor grade: MODIS years near zero would fake a huge rise. Only VIIRS years are compared.
  const poor = withAnnual(base(), Array.from({ length: 25 }, (_, i) => (i < 11 ? 2 : 100 + (i - 11) * 10)), true, 11);
  poor.reportCard.grade = 'Poor';
  const p = trendInsight(poor);
  assert.ok(p.weak);
  assert.match(text(p), /^Not measurable over the whole record here/);
  assert.match(text(p), /Using the newer satellite only: 2021–2025 averaged 1\.8× the 2012–2016 level/);
  assert.doesNotMatch(text(p), /risen about/);

  const tiny = withAnnual(base(), Array.from({ length: 25 }, () => 3), false, 0);
  assert.ok(trendInsight(tiny).weak);
});

test('trust: insufficient grade is said plainly', () => {
  const s = base();
  s.exclusions = { excludedPct: 87, totalRaw: 1000, keptVegetation: 130, gasFlares: 800, staticIndustrial: 40, lowConfidence: 20, volcanic: 10 };
  s.reportCard.grade = 'Good';
  s.reportCard.meanAnnualErrorPct = 6.8;
  const t = trustInsight(s);
  assert.match(text(t), /84% were oil, gas and other industry/);
  assert.match(text(t), /rated Good/);
  assert.match(text(t), /within 6\.8% of VIIRS/);
  s.reportCard.grade = 'Insufficient';
  const i = trustInsight(s);
  assert.ok(i.weak);
  assert.match(text(i), /too few fires in 2012–2017/i);
});

test('now: zero fire on dates that are normally fire-free is called normal, not unusual', () => {
  const s = base();
  s.headline.historyStrip = Array.from({ length: 25 }, (_, i) => ({ year: 2001 + i, value: 0, isCurrent: i === 24 }));
  s.headline.medianWindowCount = 0;
  const n = nowInsight(s);
  assert.match(text(n), /also normal here/);
  // and a record high is called a record
  s.headline.historyStrip = Array.from({ length: 25 }, (_, i) => ({ year: 2001 + i, value: i === 24 ? 900 : 100 + i, isCurrent: i === 24 }));
  s.headline.medianWindowCount = 112;
  assert.match(text(nowInsight(s)), /highest on record/);
});

function prov(id: string, name: string, value: number, share: number, median: number | null, ratio: number | null): ProvinceStat {
  return { id, name, value, share, median, ratio, percentile: 50, rank: 1, nYears: 25, status: 'near', statusLabel: '', };
}

test('where: ranks provinces and ignores provinces with too little fire to judge', () => {
  const bd: BreakdownResponse = {
    countryCode: area.countryCode!,
    countryName: 'Iraq',
    from: '2025-01-01',
    to: '2025-12-31',
    total: 1000,
    unassignedShare: 0,
    provinces: [
      prov('p:A', 'Maysan', 400, 0.4, 150, 2.7),
      prov('p:B', 'Basra', 300, 0.3, 200, 1.5),
      prov('p:C', 'Tiny', 4, 0.004, 0.5, 8.0), // 8x, but only 4 hotspot-days: must not be called out
      prov('p:D', 'Wasit', 296, 0.296, 300, 0.99),
    ],
  };
  const w = whereInsight(area, bd, null);
  assert.match(text(w), /^Maysan holds 40% of Iraq's fire/);
  assert.match(text(w), /2 of 4 provinces hold half/);
  assert.match(text(w), /Maysan is also the furthest above its own normal \(2\.7×\)/);
  assert.doesNotMatch(text(w), /Tiny/);

  const inProvince = whereInsight({ ...area, provinceCode: 'p:B', kind: 'region' }, bd, null);
  assert.match(text(inProvince), /Basra ranks 2nd of 4 Iraq provinces/);
  assert.match(text(inProvince), /30% of Iraq's total/);
});

test('where: drawn areas get a concentration answer from the map cells', () => {
  const feats = Array.from({ length: 100 }, (_, i) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
    properties: { id: String(i), lat: 0, lon: 0, count: 1, harmonizedCount: i < 10 ? 100 : 1, frpMw: 0, sensor: '', topDate: '' },
  }));
  const map = { hotspots: { type: 'FeatureCollection', features: feats }, cellDeg: 0.01 } as unknown as MapResponse;
  const w = whereInsight({ ...area, kind: 'draw', countryCode: undefined }, null, map);
  assert.match(text(w), /busiest 10% of them hold 92%/);
  assert.match(text(w), /a few hotspots dominate/);
  const empty = whereInsight({ ...area, kind: 'draw' }, null, { ...map, hotspots: { type: 'FeatureCollection', features: [] } } as MapResponse);
  assert.ok(empty.weak);
});

test('this year: reports total vs normal and flags months beyond the 90th percentile', () => {
  const s = base();
  s.latestDate = '2025-12-31';
  s.seasonCurve.year = 2025;
  s.seasonCurve.days = Array.from({ length: 73 }, (_, i) => ({
    doy: i * 5 + 1,
    dateLabel: `d${i}`,
    current: (i + 1) * 20,
    median: (i + 1) * 10,
    p10: 0,
    p90: (i + 1) * 15,
  }));
  s.climatology.months = s.climatology.months.map((m, i) => ({ ...m, p10: 5, p25: 10, median: 20, p75: 30, p90: 40, currentYear: i === 6 ? 90 : 20 }));
  const y = thisYearInsight(s);
  assert.match(text(y), /2025 ended with 1,460 hotspot-days, 2\.0× a normal year/);
  assert.match(text(y), /July was busier than in 9 out of 10 past years/);
});

test('next: busier, too close to call, off season and missing outlook are worded differently', () => {
  const s = base();
  s.latestDate = '2025-12-31';
  assert.equal(nextInsight(s), null); // offline sample has no outlook: the chapter is hidden
  const mk = (pBusier: number, call: 'busier' | 'quieter' | 'unclear' | 'none', inSeason = true) => {
    s.outlook = {
      next: { year: 2026, month: 1, label: 'January 2026', inSeason, pBusier, call, sure: pBusier >= 0.7, usual: 370.9,
        lastMonth: { label: 'December 2025', value: 500, usual: 267, ratio: 1.87 }, last12Ratio: 1.61 },
      track: [],
      trackSummary: { calls: 23, hits: 22, sureCalls: 16, sureHits: 15, noSignal: 1, offSeason: 0, fromYear: 2024 },
      skill: { accuracy: 0.725, coinFlip: 0.511, sameAsLastMonth: 0.722, sureAccuracy: 0.849, sureShare: 0.43, trainedOnRaw: 0.565, n: 13957, areas: 170 },
    };
    return nextInsight(s)!;
  };
  const up = mk(0.78, 'busier');
  assert.match(text(up), /^January 2026 is likely to be busier than usual: a 78% chance/);
  assert.doesNotMatch(text(up), /Why:|calls for this area/); // the cards carry the reasons and the track record
  const down = mk(0.22, 'quieter');
  assert.match(text(down), /likely to be quieter than usual: only a 22% chance of a busier month/);
  const mid = mk(0.57, 'unclear');
  assert.match(text(mid), /^No clear signal for January 2026/);
  assert.doesNotMatch(text(mid), /likely to be/);
  const off = mk(0.6, 'none', false);
  assert.ok(off.weak);
  assert.match(text(off), /^No forecast for January 2026: January is normally almost fire-free here/);
  assert.doesNotMatch(text(off), /chance/);
});

test('actions: each suggestion follows from its evidence, and weak evidence stays silent', () => {
  const s = withAnnual(base(), Array.from({ length: 25 }, (_, i) => 1000 + i * 100), true, 4.4);
  s.reportCard.grade = 'Good';
  const meds = [5, 5, 5, 5, 40, 120, 160, 140, 90, 10, 5, 5];
  s.climatology.months = s.climatology.months.map((m, i) => ({ ...m, median: meds[i] }));
  s.exclusions = { excludedPct: 87, totalRaw: 1000, keptVegetation: 130, gasFlares: 800, staticIndustrial: 40, lowConfidence: 20, volcanic: 10 };
  s.outlook = {
    next: { year: 2026, month: 1, label: 'January 2026', inSeason: true, pBusier: 0.78, call: 'busier', sure: true, usual: 370,
      lastMonth: { label: 'December 2025', value: 500, usual: 267, ratio: 1.87 }, last12Ratio: 1.6 },
    track: [], trackSummary: { calls: 0, hits: 0, sureCalls: 0, sureHits: 0, noSignal: 0, offSeason: 0, fromYear: 2024 },
    skill: { accuracy: 0.725, coinFlip: 0.511, sameAsLastMonth: 0.722, sureAccuracy: 0.849, sureShare: 0.43, trainedOnRaw: 0.565, n: 1, areas: 1 },
  };
  const bd: BreakdownResponse = {
    countryCode: area.countryCode!, countryName: 'Iraq', from: '2025-01-01', to: '2025-12-31', total: 1000, unassignedShare: 0,
    provinces: [prov('p:A', 'Maysan', 600, 0.6, 150, 4.0), prov('p:B', 'Basra', 396, 0.396, 300, 1.3), prov('p:C', 'Tiny', 4, 0.004, 0.5, 8.0)],
  };
  const acts = buildActions(s, area, bd);
  const titles = acts.map((a) => a.title);
  assert.ok(titles.includes('Send inspectors to Maysan first')); // not "Tiny": 8x on 4 hotspot-days is not evidence
  assert.ok(titles.includes('Put most crews and patrols in Maysan'));
  assert.ok(titles.includes('Add capacity for January 2026'));
  assert.ok(titles.includes('Have crews, equipment and burning-ban notices ready by the end of May')); // season Jun-Sep
  assert.ok(titles.includes('Budget for more fire each year, not for the past average'));
  assert.ok(titles.includes('Quote these filtered numbers, never raw satellite fire counts'));
  assert.deepEqual(acts.map((a) => a.when), [...acts.map((a) => a.when)].sort((x, y) => ['now', 'next-month', 'before-season', 'yearly', 'reporting'].indexOf(x) - ['now', 'next-month', 'before-season', 'yearly', 'reporting'].indexOf(y)));
  assert.match(partsToText(actionsInsight(acts, 'Iraq')!.parts), /confirm on the ground before acting/);

  // Unreliable early record: no trend advice, no "above its own normal" advice, and a reporting caution instead.
  s.reportCard.grade = 'Poor';
  const poor = buildActions(s, area, bd).map((a) => a.title);
  assert.ok(!poor.some((t) => /Budget for|Send inspectors/.test(t)));
  assert.ok(poor.includes('Make long-term comparisons from 2012 onward only'));

  // Too little fire: one honest line instead of a plan.
  const tiny = withAnnual(base(), Array.from({ length: 25 }, () => 3), false, 0);
  tiny.exclusions = { ...tiny.exclusions, totalRaw: 0, gasFlares: 0, staticIndustrial: 0 };
  assert.deepEqual(buildActions(tiny, area, null).map((a) => a.title), ['Do not build a fire plan on these numbers alone']);
});
