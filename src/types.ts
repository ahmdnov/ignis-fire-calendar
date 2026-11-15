export type ThemeMode = 'dark' | 'light';
export type NavTab = 'explore' | 'methods';
export type AreaInputMode = 'region' | 'draw' | 'coords';
export type DrawTool = 'polygon' | 'rectangle' | 'circle';
export type BasemapId = 'map' | 'night' | 'truecolor';
export type CalendarViewMode = 'harm' | 'raw' | 'anom';
export type ColorRampId = 'fire' | 'cividis';
export type StatusLevel = 'far_above' | 'above' | 'near' | 'below' | 'far_below' | 'no_data';
export type GradeLevel = 'Good' | 'Fair' | 'Poor' | 'Insufficient';

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

export type GeoJsonMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: number[][][][];
};

export type AreaGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export interface AreaSelection {
  id: string;
  label: string;
  slug: string;
  kind: AreaInputMode;
  countryCode?: string;
  provinceCode?: string;
  bbox: [number, number, number, number];
  center: [number, number];
  geometry: AreaGeometry;
  areaKm2: number;
  circleRadiusKm?: number;
}

export interface ProvinceOption {
  code: string;
  name: string;
  bbox: [number, number, number, number];
  center: [number, number];
  geometry: AreaGeometry;
  areaKm2: number;
}

export interface CountryOption {
  code: string;
  iso3: string;
  name: string;
  bbox: [number, number, number, number];
  center: [number, number];
  geometry: AreaGeometry;
  areaKm2: number;
  provinces: ProvinceOption[];
}

export interface RegionsResponse {
  countries: CountryOption[];
  isFallback?: boolean;
}

export interface LoyoMethodRow {
  method: string;
  monthlyWapePct: number;
  annualWapePct: number;
  medianBiasPct: number;
  notes: string;
  recommended?: boolean;
}

export interface CountryCalibrationRow {
  iso3: string;
  name: string;
  kAqua: number;
  kTerra: number;
  kNoaa20: number;
  cvAnnualErrorPct: number;
  industrialSharePct: number;
  grade: GradeLevel;
  seamSeries: {
    year: number;
    modisRaw: number;
    modisHarmonized: number;
    viirsSnpp: number;
  }[];
}

export interface MetaResponse {
  latestDate: string;
  archiveStart: string;
  currentYear: number;
  currentMonth: number;
  totalHotspots: number;
  countriesCount: number;
  loyoResults: LoyoMethodRow[];
  countryCalibrations: CountryCalibrationRow[];
  isFallback?: boolean;
}

export interface CalendarCell {
  year: number;
  month: number;
  harmonized: number;
  raw: number;
  anomaly: number;
  zScore: number;
  provisional: boolean;
  sensorEra: 'MODIS' | 'VIIRS';
}

export interface AnnualTotal {
  year: number;
  harmonized: number;
  raw: number;
  cvLower: number;
  cvUpper: number;
  sensorEra: 'MODIS' | 'VIIRS';
  provisional: boolean;
}

export interface HistoryStripPoint {
  year: number;
  value: number;
  isCurrent?: boolean;
}

export interface SeasonCurvePoint {
  doy: number;
  dateLabel: string;
  current: number | null;
  median: number;
  p10: number;
  p90: number;
}

export interface ClimatologyMonth {
  month: number;
  label: string;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  currentYear: number | null;
}

export interface SummaryResponse {
  area: AreaSelection;
  from: string;
  to: string;
  baselineStart: number;
  baselineEnd: number;
  latestDate: string;
  /** false when the area has no cells in the archive (outside the covered countries) */
  coverage?: boolean;
  /** length of the selected window in days */
  windowDays?: number;
  /** next-month forecast with its track record; absent offline or outside coverage */
  outlook?: OutlookResponse | null;
  headline: {
    status: StatusLevel;
    statusLabel: string;
    ratio: number;
    percentile: number;
    rank: number;
    totalYears: number;
    currentWindowCount: number;
    medianWindowCount: number;
    sentence: string;
    /** years the median and percentile are measured against, e.g. "2001–2024" */
    baselineSpan?: string;
    historyStrip: HistoryStripPoint[];
  };
  calendar: {
    years: number[];
    cells: CalendarCell[];
    annual: AnnualTotal[];
    trend: {
      slopePctPerYear: number;
      pValue: number;
      significant: boolean;
      direction: 'increasing' | 'decreasing' | 'stable';
    };
  };
  seasonCurve: {
    days: SeasonCurvePoint[];
    daysOffset: number;
    /** calendar year drawn as the 'current' line */
    year?: number;
    /** one-line reading of the curve */
    note?: string;
  };
  climatology: {
    months: ClimatologyMonth[];
  };
  reportCard: {
    grade: GradeLevel;
    meanAnnualErrorPct: number;
    biasPct: number;
    kAqua: number;
    kTerra: number;
    kNoaa20: number;
    seamOverlap: {
      year: number;
      modisHarmonized: number;
      viirsSnpp: number;
    }[];
  };
  exclusions: {
    excludedPct: number;
    totalRaw: number;
    keptVegetation: number;
    gasFlares: number;
    staticIndustrial: number;
    lowConfidence: number;
    volcanic: number;
  };
  isFallback?: boolean;
}

export interface HotspotCellFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    lat: number;
    lon: number;
    count: number;
    harmonizedCount: number;
    frpMw: number;
    sensor: string;
    topDate: string;
  };
}

export interface MapResponse {
  aoiFeature: {
    type: 'Feature';
    geometry: AreaGeometry;
    properties: {
      id: string;
      label: string;
    };
  };
  hotspots: {
    type: 'FeatureCollection';
    features: HotspotCellFeature[];
  };
  countryOutlines: {
    type: 'FeatureCollection';
    features: {
      type: 'Feature';
      geometry: AreaGeometry;
      properties: {
        code: string;
        name: string;
      };
    }[];
  };
  /** grid size of the returned cells in degrees (cells are merged when an area has too many) */
  cellDeg?: number;
  isFallback?: boolean;
}

export interface ProvinceStat {
  id: string;
  name: string;
  /** harmonized hotspot-days in the window */
  value: number;
  /** median of the same dates in the baseline years */
  median: number | null;
  ratio: number | null;
  percentile: number | null;
  rank: number | null;
  nYears: number;
  status: StatusLevel;
  statusLabel: string;
  /** share of the country's total in the window (0..1) */
  share: number;
}

/** Provinces of one country for one window, sorted by value (largest first). */
export interface BreakdownResponse {
  countryCode: string;
  countryName: string;
  from: string;
  to: string;
  baselineSpan?: string;
  total: number;
  unassignedShare: number;
  provinces: ProvinceStat[];
}

/* ----------------------------------------------------------------------------- next-month outlook */

export type OutlookCall = 'busier' | 'quieter' | 'unclear' | 'none';

export interface OutlookNext {
  year: number;
  month: number;
  label: string;
  /** false when this calendar month is normally almost fire-free here, so nothing is forecast */
  inSeason: boolean;
  /** chance that the month ends above its usual (median) level, 0-1 */
  pBusier: number;
  call: OutlookCall;
  sure: boolean;
  usual: number;
  lastMonth: { label: string; value: number; usual: number; ratio: number };
  last12Ratio: number;
}

export interface OutlookTrackItem {
  year: number;
  month: number;
  pBusier: number;
  call: OutlookCall;
  sure: boolean;
  actual: number;
  usual: number;
  busier: boolean;
  /** null when no call was made (no clear signal, or off season) */
  hit: boolean | null;
}

export interface OutlookResponse {
  next: OutlookNext | null;
  track: OutlookTrackItem[];
  trackSummary: { calls: number; hits: number; sureCalls: number; sureHits: number; noSignal: number; offSeason: number; fromYear: number };
  /** back-test over all areas on years the model never saw */
  skill: { accuracy: number; coinFlip: number; sameAsLastMonth: number; sureAccuracy: number; sureShare: number; trainedOnRaw: number; n: number; areas: number };
}
