import type {
  AreaSelection,
  CalendarCell,
  CountryCalibrationRow,
  CountryOption,
  GradeLevel,
  HotspotCellFeature,
  LoyoMethodRow,
  MapResponse,
  MetaResponse,
  RegionsResponse,
  SummaryResponse,
} from './types';
import {
  applyBaselineToSummary,
  classifyStatus,
  computeBbox,
  createCirclePolygon,
  estimateAreaKm2,
  MONTH_NAMES,
  ordinal,
  slugify,
} from './util';

export const LATEST_ARCHIVE_DATE = '2026-11-14';
export const ARCHIVE_START_DATE = '2000-11-01';

// Deterministic PRNG for reproducible showcase telemetry
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeCountryGeometry(ring: number[][]) {
  return {
    type: 'Polygon' as const,
    coordinates: [ring],
  };
}

function makeProvince(code: string, name: string, center: [number, number], radiusKm: number) {
  const geometry = createCirclePolygon(center[0], center[1], radiusKm, 16);
  return {
    code,
    name,
    bbox: computeBbox(geometry),
    center,
    geometry,
    areaKm2: estimateAreaKm2(geometry),
  };
}

export const SHOWCASE_COUNTRIES: CountryOption[] = [
  {
    code: 'c:IRQ',
    iso3: 'IRQ',
    name: 'Iraq',
    center: [44.36, 33.22],
    geometry: makeCountryGeometry([
      [38.79, 33.37],
      [41.18, 34.42],
      [42.35, 37.1],
      [44.78, 37.15],
      [46.15, 35.95],
      [45.55, 33.9],
      [47.68, 32.1],
      [48.56, 29.98],
      [46.55, 29.1],
      [41.88, 31.18],
      [39.2, 32.16],
      [38.79, 33.37],
    ]),
    bbox: [38.79, 29.1, 48.56, 37.15],
    areaKm2: 438317,
    provinces: [
      makeProvince('p:IRQ-BA', 'Basra', [47.78, 30.51], 68),
      makeProvince('p:IRQ-MA', 'Maysan', [47.15, 31.84], 64),
      makeProvince('p:IRQ-DQ', 'Dhi Qar', [46.26, 31.04], 62),
      makeProvince('p:IRQ-KI', 'Kirkuk', [44.39, 35.47], 58),
      makeProvince('p:IRQ-NI', 'Nineveh', [42.85, 36.34], 92),
      makeProvince('p:IRQ-WA', 'Wasit', [45.83, 32.51], 66),
    ],
  },
  {
    code: 'c:IRN',
    iso3: 'IRN',
    name: 'Iran',
    center: [53.68, 32.42],
    geometry: makeCountryGeometry([
      [44.78, 39.4],
      [48.6, 38.45],
      [53.9, 37.15],
      [56.2, 37.9],
      [61.1, 36.5],
      [60.8, 31.4],
      [61.5, 25.2],
      [57.1, 25.7],
      [53.8, 26.8],
      [50.2, 29.9],
      [47.9, 31.1],
      [45.6, 34.2],
      [44.78, 39.4],
    ]),
    bbox: [44.78, 25.2, 61.5, 39.4],
    areaKm2: 1648195,
    provinces: [
      makeProvince('p:IRN-KZ', 'Khuzestan', [48.9, 31.32], 115),
      makeProvince('p:IRN-FA', 'Fars', [52.9, 29.3], 135),
      makeProvince('p:IRN-GO', 'Golestan', [54.9, 37.1], 75),
      makeProvince('p:IRN-LO', 'Lorestan', [48.35, 33.48], 85),
    ],
  },
  {
    code: 'c:SAU',
    iso3: 'SAU',
    name: 'Saudi Arabia',
    center: [45.07, 23.88],
    geometry: makeCountryGeometry([
      [34.95, 29.3],
      [38.8, 31.7],
      [42.1, 31.1],
      [46.6, 29.1],
      [48.5, 28.5],
      [50.8, 25.4],
      [51.5, 24.1],
      [55.2, 22.7],
      [52.1, 18.8],
      [47.1, 17.2],
      [43.2, 16.4],
      [40.8, 19.6],
      [38.2, 22.8],
      [34.95, 29.3],
    ]),
    bbox: [34.95, 16.4, 55.2, 31.7],
    areaKm2: 2149690,
    provinces: [
      makeProvince('p:SAU-EP', 'Eastern Province', [49.1, 25.8], 170),
      makeProvince('p:SAU-RI', 'Riyadh', [46.5, 24.4], 150),
      makeProvince('p:SAU-AS', 'Asir', [42.6, 18.6], 95),
    ],
  },
  {
    code: 'c:KWT',
    iso3: 'KWT',
    name: 'Kuwait',
    center: [47.48, 29.31],
    geometry: makeCountryGeometry([
      [46.55, 29.1],
      [47.7, 30.1],
      [48.4, 29.8],
      [48.42, 28.55],
      [47.45, 28.52],
      [46.55, 29.1],
    ]),
    bbox: [46.55, 28.52, 48.42, 30.1],
    areaKm2: 17818,
    provinces: [
      makeProvince('p:KWT-AH', 'Al Ahmadi', [48.05, 28.9], 32),
      makeProvince('p:KWT-JA', 'Al Jahra', [47.35, 29.45], 45),
    ],
  },
  {
    code: 'c:ARE',
    iso3: 'ARE',
    name: 'UAE',
    center: [53.84, 23.42],
    geometry: makeCountryGeometry([
      [51.58, 24.15],
      [53.8, 24.4],
      [56.25, 25.95],
      [56.38, 24.95],
      [55.3, 22.75],
      [52.5, 22.95],
      [51.58, 24.15],
    ]),
    bbox: [51.58, 22.75, 56.38, 25.95],
    areaKm2: 83600,
    provinces: [
      makeProvince('p:ARE-AZ', 'Abu Dhabi', [53.7, 23.7], 115),
      makeProvince('p:ARE-SH', 'Sharjah', [55.65, 25.25], 38),
    ],
  },
  {
    code: 'c:QAT',
    iso3: 'QAT',
    name: 'Qatar',
    center: [51.18, 25.35],
    geometry: makeCountryGeometry([
      [50.76, 24.58],
      [50.85, 25.65],
      [51.22, 26.15],
      [51.62, 25.45],
      [51.55, 24.55],
      [50.76, 24.58],
    ]),
    bbox: [50.76, 24.55, 51.62, 26.15],
    areaKm2: 11586,
    provinces: [
      makeProvince('p:QAT-DA', 'Doha & Al Wakrah', [51.45, 25.18], 26),
      makeProvince('p:QAT-KH', 'Al Khor', [51.32, 25.72], 24),
    ],
  },
  {
    code: 'c:OMN',
    iso3: 'OMN',
    name: 'Oman',
    center: [55.97, 21.47],
    geometry: makeCountryGeometry([
      [52.0, 18.8],
      [55.5, 22.6],
      [56.5, 24.7],
      [59.8, 22.5],
      [58.1, 20.1],
      [54.1, 16.9],
      [52.0, 18.8],
    ]),
    bbox: [52.0, 16.9, 59.8, 24.7],
    areaKm2: 309500,
    provinces: [
      makeProvince('p:OMN-DH', 'Dhofar', [54.1, 17.6], 115),
      makeProvince('p:OMN-WU', 'Al Wusta', [56.2, 20.1], 110),
    ],
  },
  {
    code: 'c:BHR',
    iso3: 'BHR',
    name: 'Bahrain',
    center: [50.55, 26.06],
    geometry: makeCountryGeometry([
      [50.42, 25.82],
      [50.45, 26.28],
      [50.68, 26.26],
      [50.64, 25.82],
      [50.42, 25.82],
    ]),
    bbox: [50.42, 25.82, 50.68, 26.28],
    areaKm2: 786,
    provinces: [
      makeProvince('p:BHR-SO', 'Southern Governorate', [50.55, 26.02], 14),
    ],
  },
  {
    code: 'c:ARG',
    iso3: 'ARG',
    name: 'Argentina',
    center: [-63.61, -38.41],
    geometry: makeCountryGeometry([
      [-66.9, -22.1],
      [-58.1, -22.4],
      [-53.7, -26.2],
      [-58.4, -34.6],
      [-62.2, -39.1],
      [-67.5, -45.8],
      [-68.6, -54.8],
      [-72.8, -49.5],
      [-71.2, -41.1],
      [-69.8, -32.8],
      [-68.3, -26.9],
      [-66.9, -22.1],
    ]),
    bbox: [-72.8, -54.8, -53.7, -22.1],
    areaKm2: 2780400,
    provinces: [
      makeProvince('p:ARG-CN', 'Corrientes', [-57.8, -28.6], 155),
      makeProvince('p:ARG-CB', 'Córdoba', [-63.8, -31.7], 165),
      makeProvince('p:ARG-SA', 'Salta', [-64.5, -24.1], 175),
      makeProvince('p:ARG-RN', 'Río Negro', [-67.2, -40.3], 180),
    ],
  },
];

export const LOYO_RESULTS: LoyoMethodRow[] = [
  {
    method: 'Raw Uncalibrated (MODIS → VIIRS)',
    monthlyWapePct: 71.1,
    annualWapePct: 68.4,
    medianBiasPct: -69.2,
    notes: 'Severe 3.5×–5× sensor cliff at 2012; flares dominate Gulf totals.',
  },
  {
    method: 'Global Constant Ratio (Single k)',
    monthlyWapePct: 28.4,
    annualWapePct: 19.7,
    medianBiasPct: -8.6,
    notes: 'Under-corrects arid shrublands and over-corrects humid grasslands.',
  },
  {
    method: 'Country-Level Annual Ratio',
    monthlyWapePct: 18.9,
    annualWapePct: 10.4,
    medianBiasPct: 2.1,
    notes: 'Captures regional canopy geometry; misses seasonal fire-size shifts.',
  },
  {
    method: 'Country × Month Pooled (IGNIS)',
    monthlyWapePct: 12.3,
    annualWapePct: 6.6,
    medianBiasPct: 0.4,
    notes: 'Production model with NOAA-20 → S-NPP inter-sensor k = 0.99.',
    recommended: true,
  },
];

interface CountryProfile {
  iso3: string;
  name: string;
  kAqua: number;
  kTerra: number;
  kNoaa20: number;
  cvAnnualErrorPct: number;
  biasPct: number;
  industrialSharePct: number;
  grade: GradeLevel;
  baseMonthlyPeak: number;
  peakMonths: number[];
  rawJumpFactor: number;
  flareNoiseFloor: number;
  currentMultiplier: number;
  trendSlopePct: number;
  flareFraction: number;
  staticFraction: number;
  lowConfFraction: number;
  volcanicFraction: number;
}

const PROFILES: Record<string, CountryProfile> = {
  IRQ: {
    iso3: 'IRQ',
    name: 'Iraq',
    kAqua: 3.64,
    kTerra: 4.18,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 7.4,
    biasPct: 1.2,
    industrialSharePct: 85.0,
    grade: 'Good',
    baseMonthlyPeak: 1480,
    peakMonths: [5, 6, 7, 8, 9, 10],
    rawJumpFactor: 4.1,
    flareNoiseFloor: 3100,
    currentMultiplier: 2.38,
    trendSlopePct: 1.9,
    flareFraction: 0.64,
    staticFraction: 0.16,
    lowConfFraction: 0.05,
    volcanicFraction: 0.0,
  },
  IRN: {
    iso3: 'IRN',
    name: 'Iran',
    kAqua: 3.42,
    kTerra: 3.91,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 6.8,
    biasPct: -0.9,
    industrialSharePct: 62.0,
    grade: 'Good',
    baseMonthlyPeak: 3850,
    peakMonths: [6, 7, 8, 9, 10],
    rawJumpFactor: 3.7,
    flareNoiseFloor: 2450,
    currentMultiplier: 1.54,
    trendSlopePct: 2.4,
    flareFraction: 0.44,
    staticFraction: 0.13,
    lowConfFraction: 0.04,
    volcanicFraction: 0.01,
  },
  SAU: {
    iso3: 'SAU',
    name: 'Saudi Arabia',
    kAqua: 3.88,
    kTerra: 4.45,
    kNoaa20: 0.98,
    cvAnnualErrorPct: 11.2,
    biasPct: 2.3,
    industrialSharePct: 78.0,
    grade: 'Good',
    baseMonthlyPeak: 920,
    peakMonths: [4, 5, 6, 7, 8, 9],
    rawJumpFactor: 4.3,
    flareNoiseFloor: 1850,
    currentMultiplier: 1.12,
    trendSlopePct: 0.8,
    flareFraction: 0.56,
    staticFraction: 0.17,
    lowConfFraction: 0.05,
    volcanicFraction: 0.0,
  },
  KWT: {
    iso3: 'KWT',
    name: 'Kuwait',
    kAqua: 3.95,
    kTerra: 4.52,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 16.4,
    biasPct: -2.8,
    industrialSharePct: 79.0,
    grade: 'Fair',
    baseMonthlyPeak: 240,
    peakMonths: [5, 6, 7, 8, 9],
    rawJumpFactor: 4.5,
    flareNoiseFloor: 690,
    currentMultiplier: 1.32,
    trendSlopePct: -0.6,
    flareFraction: 0.58,
    staticFraction: 0.16,
    lowConfFraction: 0.05,
    volcanicFraction: 0.0,
  },
  ARE: {
    iso3: 'ARE',
    name: 'UAE',
    kAqua: 3.72,
    kTerra: 4.29,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 18.1,
    biasPct: 3.1,
    industrialSharePct: 88.0,
    grade: 'Fair',
    baseMonthlyPeak: 210,
    peakMonths: [5, 6, 7, 8, 9, 10],
    rawJumpFactor: 4.2,
    flareNoiseFloor: 840,
    currentMultiplier: 0.92,
    trendSlopePct: -1.1,
    flareFraction: 0.62,
    staticFraction: 0.21,
    lowConfFraction: 0.05,
    volcanicFraction: 0.0,
  },
  QAT: {
    iso3: 'QAT',
    name: 'Qatar',
    kAqua: 4.05,
    kTerra: 4.61,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 24.5,
    biasPct: 4.4,
    industrialSharePct: 96.0,
    grade: 'Fair',
    baseMonthlyPeak: 95,
    peakMonths: [5, 6, 7, 8, 9],
    rawJumpFactor: 4.6,
    flareNoiseFloor: 1120,
    currentMultiplier: 0.68,
    trendSlopePct: -0.4,
    flareFraction: 0.72,
    staticFraction: 0.21,
    lowConfFraction: 0.03,
    volcanicFraction: 0.0,
  },
  OMN: {
    iso3: 'OMN',
    name: 'Oman',
    kAqua: 3.55,
    kTerra: 4.08,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 12.9,
    biasPct: -1.5,
    industrialSharePct: 74.0,
    grade: 'Good',
    baseMonthlyPeak: 380,
    peakMonths: [6, 7, 8, 9, 10],
    rawJumpFactor: 3.9,
    flareNoiseFloor: 620,
    currentMultiplier: 1.05,
    trendSlopePct: 0.5,
    flareFraction: 0.54,
    staticFraction: 0.15,
    lowConfFraction: 0.05,
    volcanicFraction: 0.0,
  },
  BHR: {
    iso3: 'BHR',
    name: 'Bahrain',
    kAqua: 3.92,
    kTerra: 4.48,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 29.2,
    biasPct: 5.1,
    industrialSharePct: 93.0,
    grade: 'Fair',
    baseMonthlyPeak: 38,
    peakMonths: [5, 6, 7, 8, 9],
    rawJumpFactor: 4.4,
    flareNoiseFloor: 310,
    currentMultiplier: 0.84,
    trendSlopePct: 0.2,
    flareFraction: 0.61,
    staticFraction: 0.28,
    lowConfFraction: 0.04,
    volcanicFraction: 0.0,
  },
  ARG: {
    iso3: 'ARG',
    name: 'Argentina',
    kAqua: 3.18,
    kTerra: 3.62,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 6.1,
    biasPct: 0.3,
    industrialSharePct: 8.0,
    grade: 'Good',
    baseMonthlyPeak: 14200,
    peakMonths: [7, 8, 9, 10, 11],
    rawJumpFactor: 3.4,
    flareNoiseFloor: 340,
    currentMultiplier: 1.82,
    trendSlopePct: 1.6,
    flareFraction: 0.02,
    staticFraction: 0.03,
    lowConfFraction: 0.03,
    volcanicFraction: 0.0,
  },
};

function buildSeamSeries(profile: CountryProfile) {
  const rng = mulberry32(hashString(`seam:${profile.iso3}`));
  const series = [];
  for (let year = 2012; year <= 2025; year++) {
    const seasonalTotal = profile.baseMonthlyPeak * 4.4;
    const interannual = 0.78 + rng() * 0.48;
    const viirsSnpp = Math.round(seasonalTotal * interannual);
    const modisRaw = Math.round(viirsSnpp / profile.rawJumpFactor);
    // 2018 MODIS Collection 6.1 version shift slightly tilts calibration by ~2%
    const v61Shift = year >= 2018 ? 1.02 + (rng() - 0.5) * 0.06 : 1 + (rng() - 0.5) * 0.05;
    const modisHarmonized = Math.round(viirsSnpp * v61Shift);
    series.push({
      year,
      modisRaw,
      modisHarmonized,
      viirsSnpp,
    });
  }
  return series;
}

export function getFallbackRegions(): RegionsResponse {
  return {
    countries: SHOWCASE_COUNTRIES,
    isFallback: true,
  };
}

export function getFallbackMeta(): MetaResponse {
  const countryCalibrations: CountryCalibrationRow[] = Object.values(PROFILES).map((p) => ({
    iso3: p.iso3,
    name: p.name,
    kAqua: p.kAqua,
    kTerra: p.kTerra,
    kNoaa20: p.kNoaa20,
    cvAnnualErrorPct: p.cvAnnualErrorPct,
    industrialSharePct: p.industrialSharePct,
    grade: p.grade,
    seamSeries: buildSeamSeries(p),
  }));

  return {
    latestDate: LATEST_ARCHIVE_DATE,
    archiveStart: ARCHIVE_START_DATE,
    currentYear: 2026,
    currentMonth: 11,
    totalHotspots: 16542890,
    countriesCount: 177,
    loyoResults: LOYO_RESULTS,
    countryCalibrations,
    isFallback: true,
  };
}

function getProfileForArea(area: AreaSelection): CountryProfile {
  const iso = (area.countryCode || area.id).replace(/^c:/, '').split('-')[0];
  if (PROFILES[iso]) {
    const base = PROFILES[iso];
    if (area.provinceCode) {
      return {
        ...base,
        baseMonthlyPeak: Math.max(45, Math.round(base.baseMonthlyPeak * 0.24)),
        flareNoiseFloor: Math.round(base.flareNoiseFloor * 0.35),
      };
    }
    return base;
  }

  // Custom drawn or coordinate AOI: scale smoothly by areaKm2
  const scale = Math.max(0.08, Math.min(2.5, area.areaKm2 / 180000));
  const isSouthHemisphere = area.center[1] < 0;
  return {
    iso3: 'CUSTOM',
    name: area.label,
    kAqua: 3.48,
    kTerra: 3.96,
    kNoaa20: 0.99,
    cvAnnualErrorPct: 10.8,
    biasPct: 0.9,
    industrialSharePct: 18.0,
    grade: area.areaKm2 < 400 ? 'Fair' : 'Good',
    baseMonthlyPeak: Math.max(32, Math.round(1150 * scale)),
    peakMonths: isSouthHemisphere ? [7, 8, 9, 10, 11] : [6, 7, 8, 9, 10],
    rawJumpFactor: 3.8,
    flareNoiseFloor: Math.round(280 * scale),
    currentMultiplier: 1.48,
    trendSlopePct: 1.4,
    flareFraction: 0.09,
    staticFraction: 0.05,
    lowConfFraction: 0.04,
    volcanicFraction: 0.0,
  };
}

export function getFallbackSummary(
  area: AreaSelection,
  from: string,
  to: string,
  baselineStart = 2001,
  baselineEnd = 2025
): SummaryResponse {
  const profile = getProfileForArea(area);
  const rng = mulberry32(hashString(`summary:${area.id}`));
  const years = Array.from({ length: 27 }, (_, i) => 2000 + i);
  const currentYear = 2026;
  const currentMonth = 11;

  const cells: CalendarCell[] = [];
  const annualMap = new Map<number, { harm: number; raw: number; provisional: boolean }>();

  for (const year of years) {
    const yearFactor =
      year === currentYear
        ? profile.currentMultiplier
        : 0.58 + rng() * 0.92 + ((year - 2000) * profile.trendSlopePct) / 100 / 2.2;
    let annualHarm = 0;
    let annualRaw = 0;

    for (let month = 1; month <= 12; month++) {
      // Archive starts Nov 2000 and ends Nov 2026
      if (year === 2000 && month < 11) continue;
      if (year === currentYear && month > currentMonth) continue;

      const isPeak = profile.peakMonths.includes(month);
      const seasonShape = isPeak
        ? 0.55 + 0.55 * Math.sin(((month - profile.peakMonths[0] + 1) / profile.peakMonths.length) * Math.PI)
        : 0.14 + rng() * 0.18;

      const noise = 0.78 + rng() * 0.44;
      const partialMonthFactor = year === currentYear && month === currentMonth ? 0.47 : 1;
      const harmonized = Math.max(
        0,
        Math.round(profile.baseMonthlyPeak * seasonShape * yearFactor * noise * partialMonthFactor)
      );

      const sensorEra: 'MODIS' | 'VIIRS' = year < 2012 ? 'MODIS' : 'VIIRS';
      const raw =
        sensorEra === 'MODIS'
          ? Math.max(0, Math.round(harmonized / profile.rawJumpFactor + profile.flareNoiseFloor * 0.22))
          : Math.max(0, Math.round(harmonized + profile.flareNoiseFloor * (0.85 + rng() * 0.3)));

      const provisional = year === currentYear && month >= 10;

      cells.push({
        year,
        month,
        harmonized,
        raw,
        anomaly: 0,
        zScore: 0,
        provisional,
        sensorEra,
      });

      annualHarm += harmonized;
      annualRaw += raw;
    }

    annualMap.set(year, {
      harm: annualHarm,
      raw: annualRaw,
      provisional: year === currentYear,
    });
  }

  const annual = years.map((year) => {
    const rec = annualMap.get(year) || { harm: 0, raw: 0, provisional: false };
    const sensorEra: 'MODIS' | 'VIIRS' = year < 2012 ? 'MODIS' : 'VIIRS';
    const unc = sensorEra === 'MODIS' ? profile.cvAnnualErrorPct / 100 : 0.025;
    return {
      year,
      harmonized: rec.harm,
      raw: rec.raw,
      cvLower: Math.max(0, Math.round(rec.harm * (1 - unc))),
      cvUpper: Math.round(rec.harm * (1 + unc)),
      sensorEra,
      provisional: rec.provisional,
    };
  });

  // Compute history strip across years 2001..2026 for the current month/window
  const histYears = years.filter((y) => y >= 2001);
  const stripValues = histYears.map((y) => {
    const sum = cells
      .filter((c) => c.year === y && c.month >= 9 && c.month <= 11)
      .reduce((s, c) => s + c.harmonized, 0);
    return { year: y, value: sum, isCurrent: y === currentYear };
  });

  const currentWindowCount = stripValues.find((d) => d.isCurrent)?.value || 0;
  const pastVals = stripValues
    .filter((d) => !d.isCurrent)
    .map((d) => d.value)
    .sort((a, b) => a - b);
  const medianWindowCount = pastVals[Math.floor(pastVals.length / 2)] || 1;
  const ratio = Number((currentWindowCount / Math.max(1, medianWindowCount)).toFixed(2));
  const belowCount = pastVals.filter((v) => v <= currentWindowCount).length;
  const percentile = Math.min(99, Math.max(1, Math.round((belowCount / Math.max(1, pastVals.length)) * 100)));
  const sortedDesc = [...stripValues].sort((a, b) => b.value - a.value);
  const rank = sortedDesc.findIndex((d) => d.isCurrent) + 1;
  const { status, statusLabel } = classifyStatus(ratio, percentile);

  const sentence =
    ratio >= 1.5
      ? `${area.label} is burning at ${ratio.toFixed(1)}× its 2001–2025 median for this window — ${ordinal(percentile)} percentile and #${rank} of the past ${histYears.length} years.`
      : ratio <= 0.75
        ? `${area.label} is running quieter than typical at ${ratio.toFixed(1)}× the historical median (${ordinal(percentile)} percentile, #${rank} of ${histYears.length} years).`
        : `${area.label} is tracking close to its 25-year median (${ratio.toFixed(1)}× median, ${ordinal(percentile)} percentile, #${rank} of ${histYears.length} years).`;

  // Season-to-date cumulative curve (weekly samples across 365 days -> 52 points)
  const days = [];
  let cumMed = 0;
  let cumP10 = 0;
  let cumP90 = 0;
  let cumCurr = 0;
  const currentDoy = 318; // Nov 14
  for (let w = 0; w <= 52; w++) {
    const doy = Math.min(365, w * 7 + 1);
    const month = Math.min(12, Math.floor((doy - 1) / 30.5) + 1);
    const isPeak = profile.peakMonths.includes(month);
    const step = profile.baseMonthlyPeak * (isPeak ? 0.34 : 0.08);
    cumMed += step;
    cumP10 += step * 0.56;
    cumP90 += step * 1.62;
    if (doy <= currentDoy) {
      cumCurr += step * profile.currentMultiplier * (0.94 + rng() * 0.12);
    }
    const dt = new Date(Date.UTC(2026, 0, doy));
    const dateLabel = `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
    days.push({
      doy,
      dateLabel,
      current: doy <= currentDoy ? Math.round(cumCurr) : null,
      median: Math.round(cumMed),
      p10: Math.round(cumP10),
      p90: Math.round(cumP90),
    });
  }
  const daysOffset = Math.round((profile.currentMultiplier - 1) * 26);

  // Exclusions breakdown
  const keptVegetation = Math.max(120, annual.find((a) => a.year === 2025)?.harmonized || 2400);
  const exclShare = profile.industrialSharePct / 100;
  const totalRaw = Math.round(keptVegetation / Math.max(0.04, 1 - exclShare));
  const totalExcluded = totalRaw - keptVegetation;
  const fracSum =
    profile.flareFraction +
    profile.staticFraction +
    profile.lowConfFraction +
    profile.volcanicFraction || 1;

  const gasFlares = Math.round((totalExcluded * profile.flareFraction) / fracSum);
  const staticIndustrial = Math.round((totalExcluded * profile.staticFraction) / fracSum);
  const lowConfidence = Math.round((totalExcluded * profile.lowConfFraction) / fracSum);
  const volcanic = Math.max(0, totalExcluded - gasFlares - staticIndustrial - lowConfidence);

  const rawSummary: SummaryResponse = {
    area,
    from,
    to,
    baselineStart,
    baselineEnd,
    latestDate: LATEST_ARCHIVE_DATE,
    headline: {
      status,
      statusLabel,
      ratio,
      percentile,
      rank,
      totalYears: histYears.length,
      currentWindowCount,
      medianWindowCount,
      sentence,
      historyStrip: stripValues,
    },
    calendar: {
      years,
      cells,
      annual,
      trend: {
        slopePctPerYear: profile.trendSlopePct,
        pValue: Math.abs(profile.trendSlopePct) > 1.3 ? 0.018 : 0.24,
        significant: Math.abs(profile.trendSlopePct) > 1.3,
        direction:
          profile.trendSlopePct > 0.6
            ? 'increasing'
            : profile.trendSlopePct < -0.6
              ? 'decreasing'
              : 'stable',
      },
    },
    seasonCurve: {
      days,
      daysOffset,
    },
    climatology: { months: [] },
    reportCard: {
      grade: profile.grade,
      meanAnnualErrorPct: profile.cvAnnualErrorPct,
      biasPct: profile.biasPct,
      kAqua: profile.kAqua,
      kTerra: profile.kTerra,
      kNoaa20: profile.kNoaa20,
      seamOverlap: buildSeamSeries(profile)
        .filter((s) => s.year >= 2012 && s.year <= 2017)
        .map((s) => ({
          year: s.year,
          modisHarmonized: s.modisHarmonized,
          viirsSnpp: s.viirsSnpp,
        })),
    },
    exclusions: {
      excludedPct: Math.round(profile.industrialSharePct),
      totalRaw,
      keptVegetation,
      gasFlares,
      staticIndustrial,
      lowConfidence,
      volcanic,
    },
    isFallback: true,
  };

  return applyBaselineToSummary(rawSummary, baselineStart, baselineEnd);
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInArea(lon: number, lat: number, area: AreaSelection): boolean {
  if (area.geometry.type === 'Polygon') {
    return pointInRing(lon, lat, area.geometry.coordinates[0] || []);
  }
  return area.geometry.coordinates.some((poly) => pointInRing(lon, lat, poly[0] || []));
}

export function getFallbackMap(area: AreaSelection, from: string, to: string): MapResponse {
  const rng = mulberry32(hashString(`map:${area.id}:${from}:${to}`));
  const [minLon, minLat, maxLon, maxLat] = area.bbox;
  const features: HotspotCellFeature[] = [];
  const sensors = ['VIIRS NOAA-20', 'VIIRS S-NPP', 'MODIS Aqua', 'MODIS Terra'];

  // Generate clustered thermal fire cells inside the AOI polygon
  const clusterCount = 12;
  const clusters: [number, number][] = [];
  for (let c = 0; c < clusterCount * 3 && clusters.length < clusterCount; c++) {
    const lon = minLon + rng() * (maxLon - minLon);
    const lat = minLat + rng() * (maxLat - minLat);
    if (pointInArea(lon, lat, area)) {
      clusters.push([lon, lat]);
    }
  }
  if (clusters.length === 0) clusters.push(area.center);

  const spanLon = Math.max(0.25, maxLon - minLon);
  const spanLat = Math.max(0.25, maxLat - minLat);

  let attempts = 0;
  while (features.length < 180 && attempts < 1400) {
    attempts++;
    const cluster = clusters[attempts % clusters.length];
    const jitterLon = (rng() - 0.5) * spanLon * 0.24;
    const jitterLat = (rng() - 0.5) * spanLat * 0.24;
    const lon = Number((cluster[0] + jitterLon).toFixed(2));
    const lat = Number((cluster[1] + jitterLat).toFixed(2));
    if (!pointInArea(lon, lat, area)) continue;

    const rawCount = Math.max(1, Math.round(1 + rng() ** 2 * 42));
    const harmonizedCount = Math.round(rawCount * (0.95 + rng() * 0.22));
    const frpMw = Number((6.4 + rng() ** 1.7 * 145).toFixed(1));
    const sensor = sensors[Math.floor(rng() * 2)]; // Recent window dominated by VIIRS

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
      properties: {
        id: `cell_${features.length + 1}`,
        lat,
        lon,
        count: rawCount,
        harmonizedCount,
        frpMw,
        sensor,
        topDate: to,
      },
    });
  }

  return {
    aoiFeature: {
      type: 'Feature',
      geometry: area.geometry,
      properties: {
        id: area.id,
        label: area.label,
      },
    },
    hotspots: {
      type: 'FeatureCollection',
      features,
    },
    countryOutlines: {
      type: 'FeatureCollection',
      features: SHOWCASE_COUNTRIES.map((c) => ({
        type: 'Feature',
        geometry: c.geometry,
        properties: {
          code: c.code,
          name: c.name,
        },
      })),
    },
    isFallback: true,
  };
}
