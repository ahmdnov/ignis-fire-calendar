export type ThemeMode = 'dark' | 'light';
export type NavTab = 'explore' | 'methods';
export type AreaInputMode = 'region' | 'draw' | 'coords';
export type DrawTool = 'polygon' | 'rectangle' | 'circle';
export type BasemapId = 'map' | 'night' | 'truecolor';
export type CalendarViewMode = 'harm' | 'raw' | 'anom';
export type ColorRampId = 'fire' | 'cividis';
export type StatusLevel = 'far_above' | 'above' | 'near' | 'below';
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
  isFallback?: boolean;
}
