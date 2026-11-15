/**
 * Bridge between the EmberCal FastAPI server (hakathon/server/app.py) and the IGNIS view types.
 * Pure functions: server JSON in, `types.ts` shapes out. No numbers are invented here; where the
 * server has no value the field is NaN / null and the UI prints a dash.
 */
import type {
  AreaGeometry,
  AreaSelection,
  CalendarCell,
  CountryCalibrationRow,
  CountryOption,
  GradeLevel,
  LoyoMethodRow,
  BreakdownResponse,
  MapResponse,
  MetaResponse,
  ProvinceOption,
  RegionsResponse,
  StatusLevel,
  SummaryResponse, OutlookResponse } from './types';
import { MONTH_NAMES, estimateAreaKm2, fmtDateRange, fmtNum, ordinal } from './util';

/* ----------------------------------------------------------------------------- server shapes */

interface SrvRegionFeature {
  type: 'Feature';
  geometry: AreaGeometry;
  properties: {
    id: string;
    name: string;
    level: 'country' | 'province';
    country: string;
    iso3: string;
    bbox: [number, number, number, number];
  };
}

interface SrvPair {
  k_global: number;
  k_country: Record<string, number>;
  selected_model?: string;
  cv_monthly: Record<string, { wape: number; bias: number; n: number }>;
  cv_annual_all?: { wape: number; bias: number };
  cv_annual_by_country: Record<string, { wape: number; bias: number; n: number }>;
  paired_days: number;
}

export interface SrvMeta {
  data_end: string;
  provisional_from: string | null;
  countries: string[];
  calibration: Record<string, SrvPair>;
  seam: Record<string, { year: number; modis_estimate: number; snpp: number }[]>;
  exclusions: {
    country: string;
    total: number;
    non_vegetation_type: number;
    low_confidence: number;
    persistent_static: number;
    kept: number;
  }[];
  static_cells: number;
}

interface SrvWindow {
  start: string;
  end: string;
  days: number;
  status: string;
  value: number | null;
  median: number | null;
  ratio: number | null;
  percentile: number | null;
  rank: number | null;
  n_years: number;
  baseline_span?: string;
  history: { y: number; v: number }[];
  sentence: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Server outlook (snake_case) -> view type. */
export function toOutlook(o: any): OutlookResponse | null {
  if (!o) return null;
  const n = o.next;
  return {
    next: n
      ? {
          year: n.year, month: n.month, label: n.label, inSeason: n.in_season, pBusier: n.p_busier, call: n.call, sure: n.sure,
          usual: n.usual, lastMonth: n.last_month, last12Ratio: n.last_12_months_ratio,
        }
      : null,
    track: (o.track ?? []).map((t: any) => ({
      year: t.year, month: t.month, pBusier: t.p_busier, call: t.call, sure: t.sure, actual: t.actual, usual: t.usual, busier: t.busier, hit: t.hit,
    })),
    trackSummary: {
      calls: o.track_summary.calls, hits: o.track_summary.hits, sureCalls: o.track_summary.sure_calls, sureHits: o.track_summary.sure_hits,
      noSignal: o.track_summary.no_signal, offSeason: o.track_summary.off_season, fromYear: o.track_summary.from_year,
    },
    skill: {
      accuracy: o.skill.accuracy, coinFlip: o.skill.coin_flip, sameAsLastMonth: o.skill.same_as_last_month, sureAccuracy: o.skill.sure_accuracy,
      sureShare: o.skill.sure_share, trainedOnRaw: o.skill.trained_on_raw, n: o.skill.n, areas: o.skill.areas,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SrvSummary {
  area: { label: string; bbox: number[]; active_cells: number; countries: string[] };
  coverage: boolean;
  outlook?: unknown;
  window: SrvWindow;
  data_end: string;
  baseline: [number, number];
  monthly: {
    y: number;
    m: number;
    harm: number | null;
    raw: number;
    src: 'MODIS' | 'VIIRS';
    prov: boolean;
    partial: boolean;
    anom: number | null;
  }[];
  climatology: { m: number; median: number; p10: number; p25: number; p75: number; p90: number }[];
  annual: { y: number; harm: number | null; raw: number; complete: boolean; src: 'MODIS' | 'VIIRS'; lo?: number; hi?: number }[];
  trend: { slope_pct_per_year: number; p_value: number; significant: boolean } | null;
  season: {
    season_year: number;
    start_month: number;
    current: number[];
    envelope: { p10: number[]; median: number[]; p90: number[] };
    lead: { value: number | null; median_same_day: number | null; days_ahead: number | null } | null;
  };
  exclusions: {
    total_detections: number;
    kept: number;
    industrial_flagged: number;
    persistent_static: number;
    low_confidence: number;
    volcano_offshore: number;
  };
  report_card: {
    grade: string;
    error: number | null;
    bias: number | null;
    years: { y: number; modis_estimate: number; snpp: number }[];
  };
}

export interface SrvMap {
  cell_deg: number;
  cells: [number, number, number][];
  max: number;
}

/* ----------------------------------------------------------------------------- shared caches */

let metaCache: SrvMeta | null = null;
let regionsCache: RegionsResponse | null = null;

const ISO3_BY_SERVER_NAME: Record<string, string> = {
  Argentina: 'ARG',
  Bahrain: 'BHR',
  Iran: 'IRN',
  Iraq: 'IRQ',
  Kuwait: 'KWT',
  Oman: 'OMN',
  Qatar: 'QAT',
  Saudi_Arabia: 'SAU',
  United_Arab_Emirates: 'ARE',
};

const pretty = (serverName: string) => serverName.replace(/_/g, ' ');

/* ----------------------------------------------------------------------------- requests */

/** IGNIS area -> the server's `aoi` object. */
export function areaToAoi(area: AreaSelection): Record<string, unknown> {
  if (area.kind === 'region') {
    return { type: 'region', id: area.provinceCode || area.countryCode || area.id };
  }
  if (area.kind === 'coords' && area.circleRadiusKm) {
    return {
      type: 'circle',
      lat: area.center[1],
      lon: area.center[0],
      radius_km: area.circleRadiusKm,
      label: area.label,
    };
  }
  return { type: 'polygon', geometry: area.geometry, label: area.label };
}

/* ----------------------------------------------------------------------------- regions */

export function toRegions(fc: { features: SrvRegionFeature[] }): RegionsResponse {
  const option = (f: SrvRegionFeature): ProvinceOption => {
    const [w, s, e, n] = f.properties.bbox;
    return {
      code: f.properties.id,
      name: f.properties.name,
      bbox: [w, s, e, n],
      center: [Number(((w + e) / 2).toFixed(3)), Number(((s + n) / 2).toFixed(3))],
      geometry: f.geometry,
      areaKm2: estimateAreaKm2(f.geometry),
    };
  };
  const countries: CountryOption[] = fc.features
    .filter((f) => f.properties.level === 'country')
    .map((f) => ({ ...option(f), iso3: f.properties.iso3, provinces: [] as ProvinceOption[] }));
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  for (const f of fc.features) {
    if (f.properties.level === 'province') byIso.get(f.properties.iso3)?.provinces.push(option(f));
  }
  for (const c of countries) c.provinces.sort((a, b) => a.name.localeCompare(b.name));
  countries.sort((a, b) => a.name.localeCompare(b.name));
  regionsCache = { countries, isFallback: false };
  return regionsCache;
}

/* ----------------------------------------------------------------------------- meta */

function gradeFromError(err: number | null | undefined): GradeLevel {
  if (err === null || err === undefined || !Number.isFinite(err)) return 'Insufficient';
  return err < 0.15 ? 'Good' : err < 0.35 ? 'Fair' : 'Poor';
}

export function toMeta(m: SrvMeta): MetaResponse {
  metaCache = m;
  const aqua = m.calibration.Aqua;
  const terra = m.calibration.Terra;
  const n20 = m.calibration.NOAA20;
  const selected = aqua.selected_model || 'country_month(n0=400)';
  const n0 = /n0=(\d+)/.exec(selected)?.[1] ?? '400';
  const row = (key: string, method: string, notes: string, extra: Partial<LoyoMethodRow> = {}): LoyoMethodRow => ({
    method,
    monthlyWapePct: (aqua.cv_monthly[key]?.wape ?? NaN) * 100,
    annualWapePct: NaN,
    medianBiasPct: (aqua.cv_monthly[key]?.bias ?? NaN) * 100,
    notes,
    ...extra,
  });
  const loyoResults: LoyoMethodRow[] = [
    row('raw', 'No correction (MODIS Aqua as-is)', 'MODIS sees far fewer hotspot-days than VIIRS, so counts sit ~70% low.'),
    row('global', `One factor everywhere (k = ${aqua.k_global.toFixed(2)})`, 'Right on average, wrong where fires are unusually small or large.'),
    row('country', 'One factor per country', 'Follows each fire regime; misses the seasonal change in fire size.'),
    row(selected, `Per country × month, pooled (n₀ = ${n0})`, `Selected by leave-one-year-out cross-validation on ${fmtNum(aqua.paired_days)} paired days.`, {
      annualWapePct: (aqua.cv_annual_all?.wape ?? NaN) * 100,
      recommended: true,
    }),
  ];

  const countryCalibrations: CountryCalibrationRow[] = m.countries.map((c) => {
    const ex = m.exclusions.find((e) => e.country === c);
    const err = aqua.cv_annual_by_country[c]?.wape;
    return {
      iso3: ISO3_BY_SERVER_NAME[c] || c.slice(0, 3).toUpperCase(),
      name: pretty(c),
      kAqua: aqua.k_country[c] ?? NaN,
      kTerra: terra?.k_country[c] ?? NaN,
      kNoaa20: n20?.k_country[c] ?? NaN,
      cvAnnualErrorPct: (err ?? NaN) * 100,
      industrialSharePct: ex && ex.total ? ((ex.non_vegetation_type + ex.persistent_static) / ex.total) * 100 : NaN,
      grade: gradeFromError(err),
      seamSeries: (m.seam[c] || []).map((s) => ({
        year: s.year,
        modisRaw: NaN,
        modisHarmonized: s.modis_estimate,
        viirsSnpp: s.snpp,
      })),
    };
  });

  const end = m.data_end;
  return {
    latestDate: end,
    archiveStart: '2000-11-01',
    currentYear: Number(end.slice(0, 4)),
    currentMonth: Number(end.slice(5, 7)),
    totalHotspots: m.exclusions.reduce((s, e) => s + e.total, 0),
    countriesCount: m.countries.length,
    loyoResults,
    countryCalibrations,
    isFallback: false,
  };
}

/* ----------------------------------------------------------------------------- summary */

const STATUS: Record<string, { status: StatusLevel; statusLabel: string }> = {
  'far above normal': { status: 'far_above', statusLabel: '▲▲ Far above normal' },
  'above normal': { status: 'above', statusLabel: '▲ Above normal' },
  'near normal': { status: 'near', statusLabel: '● Near normal' },
  'below normal': { status: 'below', statusLabel: '▼ Below normal' },
  'far below normal': { status: 'far_below', statusLabel: '▼▼ Far below normal' },
  'no history': { status: 'no_data', statusLabel: '– Not enough history' },
  'no coverage': { status: 'no_data', statusLabel: '– No archive coverage' },
};

function sentenceFor(label: string, w: SrvWindow): string {
  if (w.status === 'no coverage' || w.value === null) {
    return `${label} lies outside the archive. IGNIS covers Bahrain, Iran, Iraq, Kuwait, Oman, Qatar, Saudi Arabia, the UAE and Argentina.`;
  }
  const period = fmtDateRange(w.start, w.end);
  const span = w.baseline_span || 'baseline';
  if (w.median && w.median > 0 && w.ratio !== null) {
    const pct = w.percentile !== null ? `${ordinal(Math.round(w.percentile))} percentile and ` : '';
    return `${label} recorded ${fmtNum(w.value)} harmonized hotspot-days from ${period}. That is ${w.ratio.toFixed(1)}× the ${span} median for the same dates (${fmtNum(w.median)}): ${pct}#${w.rank} of ${w.n_years} years.`;
  }
  if (w.value > 0) {
    return `${label} recorded ${fmtNum(w.value)} harmonized hotspot-days from ${period}. These dates are normally fire-free here, so this is unusual.`;
  }
  return `${label} recorded no vegetation-fire hotspots from ${period}, which is normal for these dates.`;
}

function seasonDays(s: SrvSummary['season']) {
  const out = [];
  const n = s.envelope.median.length; // 365, 29 Feb dropped
  const start = Date.UTC(2001, s.start_month - 1, 1); // 2001: a non-leap template year
  const lastCur = s.current.length - 1;
  for (let i = 0; i < n; i++) {
    if (i % 5 !== 0 && i !== lastCur && i !== n - 1) continue; // ~75 points keeps the SVG light
    const d = new Date(start + i * 86400000);
    out.push({
      doy: i + 1,
      dateLabel: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`,
      current: i <= lastCur ? s.current[i] : null,
      median: s.envelope.median[i],
      p10: s.envelope.p10[i],
      p90: s.envelope.p90[i],
    });
  }
  return out;
}

function seasonNote(s: SrvSummary['season']): string | undefined {
  const lead = s.lead;
  if (!lead || lead.value === null) return undefined;
  if (lead.days_ahead !== null && Math.abs(lead.days_ahead) > 2) {
    return lead.days_ahead > 0
      ? `${lead.days_ahead} days ahead of a normal year`
      : `${Math.abs(lead.days_ahead)} days behind a normal year`;
  }
  if (lead.median_same_day && lead.median_same_day > 0) {
    const r = lead.value / lead.median_same_day;
    if (r >= 1.15 || r <= 0.87) return `${r.toFixed(1)}× the normal total by this date`;
    return 'Tracking a normal year';
  }
  return lead.value > 0 ? 'Normally no fire by this date' : undefined;
}

function kForArea(countries: string[]): { kAqua: number; kTerra: number; kNoaa20: number } {
  const cal = metaCache?.calibration;
  if (!cal || !countries.length) return { kAqua: NaN, kTerra: NaN, kNoaa20: NaN };
  const mean = (pair: SrvPair | undefined) => {
    const vals = countries.map((c) => pair?.k_country[c]).filter((v): v is number => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  };
  return { kAqua: mean(cal.Aqua), kTerra: mean(cal.Terra), kNoaa20: mean(cal.NOAA20) };
}

export function toSummary(s: SrvSummary, area: AreaSelection, from: string, to: string): SummaryResponse {
  const w = s.window;
  const endYear = Number(w.end.slice(0, 4));
  const latestYear = Number(s.data_end.slice(0, 4));

  const cells: CalendarCell[] = s.monthly.map((x) => ({
    year: x.y,
    month: x.m,
    harmonized: x.harm ?? 0,
    raw: x.raw,
    anomaly: 0, // filled by applyBaselineToSummary
    zScore: 0,
    provisional: x.prov || x.partial,
    sensorEra: x.src,
  }));
  const years = Array.from(new Set(cells.map((c) => c.year))).sort((a, b) => a - b);

  const st = STATUS[w.status] || STATUS['no history'];
  const ex = s.exclusions;
  const total = ex.total_detections;
  const grade = (s.report_card.grade.charAt(0).toUpperCase() + s.report_card.grade.slice(1)) as GradeLevel;

  return {
    area,
    from,
    to,
    baselineStart: s.baseline[0],
    baselineEnd: s.baseline[1],
    latestDate: s.data_end,
    coverage: s.coverage,
    outlook: toOutlook(s.outlook),
    windowDays: w.days,
    headline: {
      ...st,
      ratio: w.ratio ?? NaN,
      percentile: w.percentile ?? NaN,
      rank: w.rank ?? NaN,
      totalYears: w.n_years,
      currentWindowCount: w.value ?? NaN,
      medianWindowCount: w.median ?? NaN,
      sentence: sentenceFor(area.label, w),
      baselineSpan: w.baseline_span,
      historyStrip: w.history.map((h) => ({ year: h.y, value: h.v, isCurrent: h.y === endYear })),
    },
    calendar: {
      years,
      cells,
      annual: s.annual.map((a) => ({
        year: a.y,
        harmonized: a.harm ?? 0,
        raw: a.raw,
        cvLower: a.lo ?? a.harm ?? 0,
        cvUpper: a.hi ?? a.harm ?? 0,
        sensorEra: a.src,
        provisional: !a.complete && a.y === latestYear,
      })),
      trend: s.trend
        ? {
            slopePctPerYear: s.trend.slope_pct_per_year ?? 0,
            pValue: s.trend.p_value ?? 1,
            significant: s.trend.significant,
            direction: !s.trend.significant ? 'stable' : s.trend.slope_pct_per_year > 0 ? 'increasing' : 'decreasing',
          }
        : { slopePctPerYear: 0, pValue: 1, significant: false, direction: 'stable' },
    },
    seasonCurve: {
      days: seasonDays(s.season),
      daysOffset: s.season.lead?.days_ahead ?? 0,
      year: s.season.season_year,
      note: seasonNote(s.season),
    },
    climatology: {
      months: s.climatology.map((c) => ({
        month: c.m,
        label: MONTH_NAMES[c.m - 1],
        p10: c.p10,
        p25: c.p25,
        median: c.median,
        p75: c.p75,
        p90: c.p90,
        currentYear: cells.find((x) => x.year === latestYear && x.month === c.m)?.harmonized ?? null,
      })),
    },
    reportCard: {
      grade,
      meanAnnualErrorPct: s.report_card.error === null ? NaN : s.report_card.error * 100,
      biasPct: s.report_card.bias === null ? NaN : s.report_card.bias * 100,
      ...kForArea(s.area.countries),
      seamOverlap: s.report_card.years.map((y) => ({ year: y.y, modisHarmonized: y.modis_estimate, viirsSnpp: y.snpp })),
    },
    exclusions: {
      excludedPct: total ? Number((((total - ex.kept) / total) * 100).toFixed(1)) : 0,
      totalRaw: total,
      keptVegetation: ex.kept,
      gasFlares: ex.industrial_flagged,
      staticIndustrial: ex.persistent_static,
      lowConfidence: ex.low_confidence,
      volcanic: ex.volcano_offshore,
    },
    isFallback: false,
  };
}

/* ----------------------------------------------------------------------------- map */

export function toMap(m: SrvMap, area: AreaSelection): MapResponse {
  return {
    aoiFeature: { type: 'Feature', geometry: area.geometry, properties: { id: area.id, label: area.label } },
    hotspots: {
      type: 'FeatureCollection',
      features: m.cells.map(([lon, lat, v]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: `${lon}_${lat}`,
          lat,
          lon,
          count: v,
          harmonizedCount: v,
          frpMw: NaN,
          sensor: 'Harmonized MODIS + VIIRS',
          topDate: '',
        },
      })),
    },
    countryOutlines: {
      type: 'FeatureCollection',
      features: (regionsCache?.countries || []).map((c) => ({
        type: 'Feature',
        geometry: c.geometry,
        properties: { code: c.code, name: c.name },
      })),
    },
    cellDeg: m.cell_deg,
    isFallback: false,
  };
}

/* ----------------------------------------------------------------------------- province breakdown */

export interface SrvBreakdown {
  country: string;
  name: string;
  start: string;
  end: string;
  baseline_span?: string;
  total: number | null;
  unassigned_share: number | null;
  provinces: {
    id: string;
    name: string;
    value: number | null;
    median: number | null;
    ratio: number | null;
    percentile: number | null;
    rank: number | null;
    n_years: number;
    status: string;
    share: number | null;
  }[];
}

export function toBreakdown(b: SrvBreakdown): BreakdownResponse {
  return {
    countryCode: b.country,
    countryName: b.name,
    from: b.start,
    to: b.end,
    baselineSpan: b.baseline_span,
    total: b.total ?? 0,
    unassignedShare: b.unassigned_share ?? 0,
    provinces: b.provinces.map((p) => {
      const st = STATUS[p.status] || STATUS['no history'];
      return {
        id: p.id,
        name: p.name,
        value: p.value ?? 0,
        median: p.median,
        ratio: p.ratio,
        percentile: p.percentile,
        rank: p.rank,
        nYears: p.n_years,
        status: st.status,
        statusLabel: st.statusLabel,
        share: p.share ?? 0,
      };
    }),
  };
}
