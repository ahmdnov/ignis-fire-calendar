import { interpolateRgb, piecewise } from 'd3';
import type {
  AreaGeometry,
  CalendarCell,
  ClimatologyMonth,
  GradeLevel,
  HotspotCellFeature,
  StatusLevel,
  SummaryResponse,
  ThemeMode,
} from './types';

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * "Fire heat" sequential ramp, low -> high. One hue family (burnt orange -> gold), monotone lightness,
 * lowest step still >= 2:1 against the card surface. Both pass the dataviz ordinal validator
 * (dark on #110D0B, light on #FAF7F2). Dark mode runs dark -> bright, light mode light -> dark.
 */
export const FIRE_STOPS: Record<ThemeMode, string[]> = {
  dark: ['#80380F', '#AE4C0C', '#D9670B', '#F08C12', '#F9AE2B', '#FFCB5C'],
  light: ['#EC9D22', '#E07F0E', '#C8620B', '#A64A0B', '#80370C', '#57260B'],
};
/** Cividis end points, for legends. */
export const CIVIDIS_STOPS = ['#00204d', '#575c6d', '#a69d75', '#ffea46'];

const fireInterp: Record<ThemeMode, (t: number) => string> = {
  dark: piecewise(interpolateRgb, FIRE_STOPS.dark),
  light: piecewise(interpolateRgb, FIRE_STOPS.light),
};

export function fireColor(t: number, theme: ThemeMode = 'dark'): string {
  return fireInterp[theme](Math.max(0, Math.min(1, t)));
}

export function rampGradientCss(stops: string[]): string {
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** "2 Dec 2025" from an ISO date. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** "2 Dec – 31 Dec 2025", or with both years when they differ. */
export function fmtDateRange(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty] = to.split('-').map(Number);
  if (!fy || !ty) return `${from} – ${to}`;
  return fy === ty ? `${fd} ${MONTH_NAMES[fm - 1]} – ${fmtDate(to)}` : `${fmtDate(from)} – ${fmtDate(to)}`;
}

export function fmtNum(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
  return Math.round(value).toLocaleString('en-US');
}

export function fmtRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${ratio.toFixed(1)}×`;
}

export function ordinal(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'area';
}

export function computeBbox(geometry: AreaGeometry): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const visitRing = (ring: number[][]) => {
    for (const pt of ring) {
      if (pt[0] < minLon) minLon = pt[0];
      if (pt[0] > maxLon) maxLon = pt[0];
      if (pt[1] < minLat) minLat = pt[1];
      if (pt[1] > maxLat) maxLat = pt[1];
    }
  };

  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(visitRing);
  } else {
    geometry.coordinates.forEach((poly) => poly.forEach(visitRing));
  }

  return [minLon, minLat, maxLon, maxLat];
}

export function createCirclePolygon(
  lon: number,
  lat: number,
  radiusKm: number,
  steps = 48
): AreaGeometry {
  const safeRadius = Math.max(1, Math.min(800, radiusKm));
  const latDegPerKm = 1 / 111.32;
  const lonDegPerKm = 1 / (111.32 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const pLon = lon + Math.cos(theta) * safeRadius * lonDegPerKm;
    const pLat = Math.max(-85, Math.min(85, lat + Math.sin(theta) * safeRadius * latDegPerKm));
    coords.push([Number(pLon.toFixed(4)), Number(pLat.toFixed(4))]);
  }
  return {
    type: 'Polygon',
    coordinates: [coords],
  };
}

export function createRectanglePolygon(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number
): AreaGeometry {
  const x0 = Math.min(minLon, maxLon);
  const x1 = Math.max(minLon, maxLon);
  const y0 = Math.min(minLat, maxLat);
  const y1 = Math.max(minLat, maxLat);
  return {
    type: 'Polygon',
    coordinates: [
      [
        [Number(x0.toFixed(4)), Number(y0.toFixed(4))],
        [Number(x1.toFixed(4)), Number(y0.toFixed(4))],
        [Number(x1.toFixed(4)), Number(y1.toFixed(4))],
        [Number(x0.toFixed(4)), Number(y1.toFixed(4))],
        [Number(x0.toFixed(4)), Number(y0.toFixed(4))],
      ],
    ],
  };
}

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateAreaKm2(geometry: AreaGeometry): number {
  const ringArea = (ring: number[][]): number => {
    if (ring.length < 3) return 0;
    let avgLat = 0;
    for (const pt of ring) avgLat += pt[1];
    avgLat /= ring.length;
    const kmPerLat = 111.32;
    const kmPerLon = 111.32 * Math.max(0.15, Math.cos((avgLat * Math.PI) / 180));
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const x1 = ring[i][0] * kmPerLon;
      const y1 = ring[i][1] * kmPerLat;
      const x2 = ring[i + 1][0] * kmPerLon;
      const y2 = ring[i + 1][1] * kmPerLat;
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
  };

  if (geometry.type === 'Polygon') {
    return Math.round(ringArea(geometry.coordinates[0] || []));
  }
  let total = 0;
  for (const poly of geometry.coordinates) {
    total += ringArea(poly[0] || []);
  }
  return Math.round(total);
}

export function computePresetWindow(
  latestDate: string,
  preset: '30d' | '12m' | '5y'
): { from: string; to: string } {
  const end = new Date(`${latestDate}T00:00:00Z`);
  const start = new Date(end.getTime());
  if (preset === '30d') {
    start.setUTCDate(start.getUTCDate() - 29);
  } else if (preset === '12m') {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    start.setUTCDate(start.getUTCDate() + 1);
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 5);
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return {
    from: start.toISOString().slice(0, 10),
    to: latestDate,
  };
}

export function monthDateRange(year: number, month: number, latestDate?: string): {
  from: string;
  to: string;
} {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = `${year}-${mm}-01`;
  let to = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  if (latestDate && to > latestDate) {
    to = latestDate;
  }
  if (from > to) {
    return { from: to, to };
  }
  return { from, to };
}

export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function classifyStatus(ratio: number, percentile: number): {
  status: StatusLevel;
  statusLabel: string;
} {
  if (ratio >= 1.65 || percentile >= 90) {
    return { status: 'far_above', statusLabel: '▲▲ Far above normal' };
  }
  if (ratio >= 1.2 || percentile >= 72) {
    return { status: 'above', statusLabel: '▲ Above normal' };
  }
  if (ratio <= 0.72 || percentile <= 25) {
    return { status: 'below', statusLabel: '▼ Below normal' };
  }
  return { status: 'near', statusLabel: '● Near normal' };
}

export function gradeColor(grade: GradeLevel): string {
  switch (grade) {
    case 'Good':
      return 'var(--good)';
    case 'Fair':
      return 'var(--warning)';
    case 'Poor':
      return 'var(--critical)';
    default:
      return 'var(--text-muted)';
  }
}

/**
 * Recomputes baseline-dependent anomaly, zScore, and monthly climatology when the
 * baselineStart / baselineEnd sliders change client-side or on fallback data.
 */
export function applyBaselineToSummary(
  summary: SummaryResponse,
  baselineStart: number,
  baselineEnd: number
): SummaryResponse {
  const lo = Math.min(baselineStart, baselineEnd);
  const hi = Math.max(baselineStart, baselineEnd);

  const monthBuckets = new Map<number, number[]>();
  for (let m = 1; m <= 12; m++) monthBuckets.set(m, []);

  for (const cell of summary.calendar.cells) {
    if (cell.year >= lo && cell.year <= hi) {
      monthBuckets.get(cell.month)?.push(cell.harmonized);
    }
  }

  const monthStats = new Map<
    number,
    { median: number; mean: number; std: number; p10: number; p25: number; p75: number; p90: number }
  >();

  for (let m = 1; m <= 12; m++) {
    const vals = (monthBuckets.get(m) || []).slice().sort((a, b) => a - b);
    if (vals.length === 0) {
      monthStats.set(m, { median: 0, mean: 0, std: 1, p10: 0, p25: 0, p75: 0, p90: 0 });
      continue;
    }
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length - 1);
    const std = Math.max(1, Math.sqrt(variance));
    monthStats.set(m, {
      median: quantile(vals, 0.5),
      mean,
      std,
      p10: quantile(vals, 0.1),
      p25: quantile(vals, 0.25),
      p75: quantile(vals, 0.75),
      p90: quantile(vals, 0.9),
    });
  }

  const cells: CalendarCell[] = summary.calendar.cells.map((cell) => {
    const st = monthStats.get(cell.month)!;
    const denom = Math.max(1, st.median);
    const anomaly = ((cell.harmonized - st.median) / denom) * 100;
    const zScore = (cell.harmonized - st.mean) / Math.max(1, st.std);
    return {
      ...cell,
      anomaly: Number(anomaly.toFixed(1)),
      zScore: Number(Math.max(-3.5, Math.min(3.5, zScore)).toFixed(2)),
    };
  });

  const latestYear = Math.max(...summary.calendar.years);
  const months: ClimatologyMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const st = monthStats.get(m)!;
    const currentCell = cells.find((c) => c.year === latestYear && c.month === m);
    months.push({
      month: m,
      label: MONTH_NAMES[m - 1],
      p10: Math.round(st.p10),
      p25: Math.round(st.p25),
      median: Math.round(st.median),
      p75: Math.round(st.p75),
      p90: Math.round(st.p90),
      currentYear: currentCell ? currentCell.harmonized : null,
    });
  }

  return {
    ...summary,
    baselineStart: lo,
    baselineEnd: hi,
    calendar: {
      ...summary.calendar,
      cells,
    },
    climatology: {
      months,
    },
  };
}

export function buildCalendarCsv(summary: SummaryResponse): string {
  const header = [
    'area_id',
    'area_label',
    'year',
    'month',
    'sensor_era',
    'harmonized_hotspots',
    'raw_hotspots',
    'anomaly_pct',
    'z_score',
    'provisional_nrt',
    'baseline_window',
  ].join(',');
  const baseline = `${summary.baselineStart}-${summary.baselineEnd}`;
  const rows = summary.calendar.cells.map((c) =>
    [
      `"${summary.area.id}"`,
      `"${summary.area.label.replace(/"/g, '""')}"`,
      c.year,
      c.month,
      c.sensorEra,
      c.harmonized,
      c.raw,
      c.anomaly.toFixed(1),
      c.zScore.toFixed(2),
      c.provisional ? 'true' : 'false',
      baseline,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export function buildHotspotsCsv(
  areaLabel: string,
  features: HotspotCellFeature[],
  from: string,
  to: string
): string {
  const header = [
    'cell_id',
    'area',
    'window_from',
    'window_to',
    'latitude',
    'longitude',
    'harmonized_count',
    'raw_count',
    'frp_mw',
    'dominant_sensor',
    'peak_date',
  ].join(',');
  const rows = features.map((f) =>
    [
      f.properties.id,
      `"${areaLabel.replace(/"/g, '""')}"`,
      from,
      to,
      f.properties.lat.toFixed(4),
      f.properties.lon.toFixed(4),
      f.properties.harmonizedCount,
      f.properties.count,
      f.properties.frpMw.toFixed(1),
      f.properties.sensor,
      f.properties.topDate,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export function triggerTextDownload(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface UrlStateParams {
  area?: string;
  view?: 'harm' | 'raw' | 'anom';
  tab?: 'explore' | 'methods';
  skipIntro?: boolean;
}

export function parseUrlState(search: string): UrlStateParams {
  const sp = new URLSearchParams(search);
  const area = sp.get('area') || undefined;
  const viewRaw = sp.get('view');
  const view =
    viewRaw === 'harm' || viewRaw === 'raw' || viewRaw === 'anom' ? viewRaw : undefined;
  const tabRaw = sp.get('tab');
  const tab = tabRaw === 'explore' || tabRaw === 'methods' ? tabRaw : undefined;
  const skipIntro = sp.get('skipIntro') === '1' || sp.get('autostart') === '1';
  return { area, view, tab, skipIntro };
}
