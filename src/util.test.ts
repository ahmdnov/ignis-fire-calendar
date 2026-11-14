import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBaselineToSummary,
  buildCalendarCsv,
  classifyStatus,
  computeBbox,
  computePresetWindow,
  createCirclePolygon,
  createRectanglePolygon,
  estimateAreaKm2,
  monthDateRange,
  parseUrlState,
  slugify,
} from './util';
import { getFallbackSummary, SHOWCASE_COUNTRIES } from './fallbackData';

test('polygon geometry helpers compute valid closed rings and positive area', () => {
  const circle = createCirclePolygon(44.36, 33.22, 50, 32);
  assert.equal(circle.type, 'Polygon');
  const ring = circle.coordinates[0];
  assert.equal(ring.length, 33);
  assert.deepEqual(ring[0], ring[ring.length - 1]);

  const area = estimateAreaKm2(circle);
  // Circle of radius 50 km has area ~ pi * 2500 = 7854 km2
  assert.ok(area > 7200 && area < 8500, `Expected ~7854 km2, got ${area}`);

  const rect = createRectanglePolygon(40, 30, 42, 32);
  const bbox = computeBbox(rect);
  assert.deepEqual(bbox, [40, 30, 42, 32]);
});

test('date window and month range helpers clamp to latest archive date', () => {
  const w30 = computePresetWindow('2026-11-14', '30d');
  assert.equal(w30.from, '2026-10-16');
  assert.equal(w30.to, '2026-11-14');

  const nov = monthDateRange(2026, 11, '2026-11-14');
  assert.deepEqual(nov, { from: '2026-11-01', to: '2026-11-14' });

  const aug = monthDateRange(2024, 8, '2026-11-14');
  assert.deepEqual(aug, { from: '2024-08-01', to: '2024-08-31' });
});

test('status classification and URL parsing behave deterministically', () => {
  assert.equal(classifyStatus(2.4, 97).status, 'far_above');
  assert.equal(classifyStatus(1.3, 75).status, 'above');
  assert.equal(classifyStatus(1.0, 50).status, 'near');
  assert.equal(classifyStatus(0.5, 15).status, 'below');

  const parsed = parseUrlState('?area=c:IRQ&view=raw&tab=methods&skipIntro=1');
  assert.equal(parsed.area, 'c:IRQ');
  assert.equal(parsed.view, 'raw');
  assert.equal(parsed.tab, 'methods');
  assert.equal(parsed.skipIntro, true);

  assert.equal(slugify('Saudi Arabia · Eastern'), 'saudi_arabia_eastern');
});

test('fallback summary and baseline recomputation produce valid 2000-2026 data and CSV', () => {
  const iraq = SHOWCASE_COUNTRIES.find((c) => c.code === 'c:IRQ')!;
  const area = {
    id: iraq.code,
    label: iraq.name,
    slug: 'iraq',
    kind: 'region' as const,
    countryCode: iraq.code,
    bbox: iraq.bbox,
    center: iraq.center,
    geometry: iraq.geometry,
    areaKm2: iraq.areaKm2,
  };

  const summary = getFallbackSummary(area, '2026-10-16', '2026-11-14', 2001, 2025);
  assert.equal(summary.calendar.years[0], 2000);
  assert.equal(summary.calendar.years[summary.calendar.years.length - 1], 2026);
  assert.equal(summary.exclusions.excludedPct, 85);
  assert.ok(summary.calendar.cells.length > 300);

  const rebaselined = applyBaselineToSummary(summary, 2010, 2020);
  assert.equal(rebaselined.baselineStart, 2010);
  assert.equal(rebaselined.baselineEnd, 2020);
  assert.equal(rebaselined.climatology.months.length, 12);

  const csv = buildCalendarCsv(rebaselined);
  assert.ok(csv.startsWith('area_id,area_label,year,month'));
  assert.ok(csv.includes('2010-2020'));
});
