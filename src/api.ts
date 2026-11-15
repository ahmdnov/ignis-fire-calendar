import type {
  AreaSelection,
  BreakdownResponse,
  MapResponse,
  MetaResponse,
  RegionsResponse,
  SummaryResponse,
} from './types';
import {
  getFallbackMap,
  getFallbackMeta,
  getFallbackRegions,
  getFallbackSummary,
} from './fallbackData';
import {
  applyBaselineToSummary,
  buildCalendarCsv,
  buildHotspotsCsv,
  slugify,
  triggerTextDownload,
} from './util';
import {
  areaToAoi,
  toBreakdown,
  toMap,
  toMeta,
  toRegions,
  toSummary,
  type SrvBreakdown,
  type SrvMap,
  type SrvMeta,
  type SrvSummary,
} from './realApi';

/**
 * Data access. The real source is the EmberCal FastAPI server (NASA FIRMS archive, harmonized).
 * The generated sample in fallbackData.ts is used ONLY when that server cannot be reached at all,
 * and everything built from it carries `isFallback: true` so the UI can label it.
 * A reachable server that rejects a request (bad polygon, unknown region) raises ApiError instead
 * of silently switching to sample numbers.
 */

/**
 * Static build (VITE_STATIC=1, used for the public GitHub Pages site): there is no server, so every
 * answer is a real server response saved to a file by hakathon/pipeline/export_static.py. That covers
 * each country and province at the three preset periods with the default baseline. Anything else
 * (drawn areas, custom dates or baseline, hotspot export) needs the full version and says so.
 */
const STATIC = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_STATIC === '1';
const STATIC_BASELINE: [number, number] = [2001, 2025];
const STATIC_ONLY =
  'the online demo holds precomputed results for countries and provinces at the three preset periods ' +
  '(last 30 days, 12 months, 5 years) with the 2001–2025 baseline. Run the project locally for drawn areas, ' +
  'custom dates and custom baselines.';

function staticKey(area: AreaSelection, from: string, to: string): string | null {
  if (area.kind !== 'region') return null;
  const id = area.provinceCode || area.countryCode || area.id;
  return `${id.replace(/[^A-Za-z0-9-]/g, '-')}_${from}_${to}`;
}

async function staticJson<T>(path: string): Promise<T> {
  try {
    return await getJson<T>(`./data/${path}`);
  } catch {
    throw new ApiError(404, STATIC_ONLY);
  }
}

const API_TIMEOUT_MS = 15000;
const CSV_TIMEOUT_MS = 120000;
let backendReachable: boolean | null = null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      let detail: string | null = null;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        // not JSON
      }
      // A 5xx without a JSON body is the dev proxy saying the server is not there.
      if (detail === null && res.status >= 500) throw new TypeError('backend unreachable');
      throw new ApiError(res.status, detail ?? `HTTP ${res.status}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await request(url, undefined, API_TIMEOUT_MS);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await request(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    API_TIMEOUT_MS
  );
  return (await res.json()) as T;
}

export async function fetchMeta(): Promise<MetaResponse> {
  try {
    const data = await getJson<SrvMeta>(STATIC ? './data/meta.json' : '/api/meta');
    if (!data?.data_end || !data?.calibration) throw new TypeError('unexpected meta');
    backendReachable = true;
    return toMeta(data);
  } catch {
    backendReachable = false;
    return getFallbackMeta();
  }
}

export async function fetchRegions(): Promise<RegionsResponse> {
  if (backendReachable === false) return getFallbackRegions();
  try {
    const data = await getJson<{ features: never[] }>(STATIC ? './data/regions.json' : '/api/regions');
    if (!data?.features?.length) return getFallbackRegions();
    return toRegions(data);
  } catch {
    return getFallbackRegions();
  }
}

export interface SummaryParams {
  area: AreaSelection;
  from: string;
  to: string;
  baselineStart: number;
  baselineEnd: number;
}

function sampleSummary(p: SummaryParams): SummaryResponse {
  return getFallbackSummary(p.area, p.from, p.to, p.baselineStart, p.baselineEnd);
}

export async function fetchSummary(params: SummaryParams): Promise<SummaryResponse> {
  if (STATIC) {
    const key = staticKey(params.area, params.from, params.to);
    if (!key || params.baselineStart !== STATIC_BASELINE[0] || params.baselineEnd !== STATIC_BASELINE[1]) {
      throw new ApiError(404, STATIC_ONLY);
    }
    const data = await staticJson<SrvSummary>(`summary/${key}.json`);
    return applyBaselineToSummary(toSummary(data, params.area, params.from, params.to), data.baseline[0], data.baseline[1]);
  }
  if (backendReachable === false) return sampleSummary(params);
  try {
    const data = await postJson<SrvSummary>('/api/summary', {
      aoi: areaToAoi(params.area),
      start: params.from,
      end: params.to,
      baseline: [params.baselineStart, params.baselineEnd],
    });
    backendReachable = true;
    return applyBaselineToSummary(
      toSummary(data, params.area, params.from, params.to),
      data.baseline[0],
      data.baseline[1]
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (backendReachable) throw new ApiError(0, 'The data server stopped responding. Check that it is still running.');
    backendReachable = false;
    return sampleSummary(params);
  }
}

export async function fetchMapData(params: { area: AreaSelection; from: string; to: string }): Promise<MapResponse> {
  if (STATIC) {
    const key = staticKey(params.area, params.from, params.to);
    if (!key) throw new ApiError(404, STATIC_ONLY);
    return toMap(await staticJson<SrvMap>(`map/${key}.json`), params.area);
  }
  if (backendReachable === false) return getFallbackMap(params.area, params.from, params.to);
  try {
    const data = await postJson<SrvMap>('/api/map', {
      aoi: areaToAoi(params.area),
      start: params.from,
      end: params.to,
      max_features: 6000,
    });
    return toMap(data, params.area);
  } catch (err) {
    if (err instanceof ApiError || backendReachable) throw err instanceof ApiError ? err : new ApiError(0, 'The data server stopped responding.');
    return getFallbackMap(params.area, params.from, params.to);
  }
}

/**
 * Every province of a country for the window. Null when there is nothing to break down
 * (offline sample, or an area that is not a country or province).
 */
export async function fetchBreakdown(params: {
  countryCode: string;
  from: string;
  to: string;
  baselineStart: number;
  baselineEnd: number;
}): Promise<BreakdownResponse | null> {
  if (STATIC) {
    if (params.baselineStart !== STATIC_BASELINE[0] || params.baselineEnd !== STATIC_BASELINE[1]) return null;
    const key = `${params.countryCode.replace(/[^A-Za-z0-9-]/g, '-')}_${params.from}_${params.to}`;
    try {
      return toBreakdown(await getJson<SrvBreakdown>(`./data/breakdown/${key}.json`));
    } catch {
      return null;
    }
  }
  if (backendReachable === false) return null;
  const data = await postJson<SrvBreakdown>('/api/breakdown', {
    country: params.countryCode,
    start: params.from,
    end: params.to,
    baseline: [params.baselineStart, params.baselineEnd],
  });
  return toBreakdown(data);
}

async function downloadFromServer(url: string, body: unknown, filename: string): Promise<void> {
  const res = await request(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    CSV_TIMEOUT_MS
  );
  const text = await res.text();
  triggerTextDownload(filename, text);
}

/** Resolves to null on success, or to a short message the UI should show. */
export async function downloadCalendarCsv(summary: SummaryResponse): Promise<string | null> {
  const slug = summary.area.slug || slugify(summary.area.label);
  if (summary.isFallback) {
    triggerTextDownload(`ignis_calendar_${slug}_SAMPLE.csv`, buildCalendarCsv(summary));
    return 'Offline sample exported. Start the data server for real values.';
  }
  if (STATIC) {
    const id = (summary.area.provinceCode || summary.area.countryCode || summary.area.id).replace(/[^A-Za-z0-9-]/g, '-');
    try {
      const res = await request(`./data/calendar/${id}.csv`, undefined, API_TIMEOUT_MS);
      triggerTextDownload(`ignis_calendar_${slug}.csv`, await res.text());
      return null;
    } catch {
      return 'Calendar export is not available for this selection in the online demo.';
    }
  }
  try {
    await downloadFromServer(
      '/api/calendar.csv',
      { aoi: areaToAoi(summary.area), baseline: [summary.baselineStart, summary.baselineEnd] },
      `ignis_calendar_${slug}.csv`
    );
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.message : 'Calendar export failed: the data server did not answer.';
  }
}

export async function downloadHotspotsCsv(
  area: AreaSelection,
  from: string,
  to: string,
  mapData: MapResponse | null
): Promise<string | null> {
  const slug = area.slug || slugify(area.label);
  if (mapData?.isFallback) {
    triggerTextDownload(
      `ignis_hotspots_${slug}_SAMPLE.csv`,
      buildHotspotsCsv(area.label, mapData.hotspots.features, from, to)
    );
    return 'Offline sample exported. Start the data server for real detections.';
  }
  if (STATIC) return 'The hotspot export (every single detection) needs the full version: run the project locally.';
  try {
    await downloadFromServer(
      '/api/hotspots.csv',
      { aoi: areaToAoi(area), start: from, end: to },
      `ignis_hotspots_${slug}_${from}_${to}.csv`
    );
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 413) return `Too many detections to export: ${err.message}`;
    return err instanceof ApiError ? err.message : 'Hotspot export failed: the data server did not answer.';
  }
}
