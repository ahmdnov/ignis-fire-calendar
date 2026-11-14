import type {
  AreaSelection,
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

const API_TIMEOUT_MS = 1800;
let backendReachable: boolean | null = null;

async function fetchJsonWithTimeout<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Non-JSON response');
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMeta(): Promise<MetaResponse> {
  try {
    const data = await fetchJsonWithTimeout<MetaResponse>('/api/meta');
    backendReachable = true;
    return { ...data, isFallback: false };
  } catch {
    backendReachable = false;
    return getFallbackMeta();
  }
}

export async function fetchRegions(): Promise<RegionsResponse> {
  if (backendReachable === false) {
    return getFallbackRegions();
  }
  try {
    const data = await fetchJsonWithTimeout<RegionsResponse>('/api/regions');
    if (!data?.countries?.length) {
      return getFallbackRegions();
    }
    return { ...data, isFallback: false };
  } catch {
    return getFallbackRegions();
  }
}

export async function fetchSummary(params: {
  area: AreaSelection;
  from: string;
  to: string;
  baselineStart: number;
  baselineEnd: number;
}): Promise<SummaryResponse> {
  if (backendReachable === false) {
    return getFallbackSummary(
      params.area,
      params.from,
      params.to,
      params.baselineStart,
      params.baselineEnd
    );
  }
  try {
    const data = await fetchJsonWithTimeout<SummaryResponse>('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area: params.area.id,
        geometry: params.area.geometry,
        label: params.area.label,
        from: params.from,
        to: params.to,
        baselineStart: params.baselineStart,
        baselineEnd: params.baselineEnd,
      }),
    });
    return applyBaselineToSummary(
      { ...data, isFallback: false },
      params.baselineStart,
      params.baselineEnd
    );
  } catch {
    return getFallbackSummary(
      params.area,
      params.from,
      params.to,
      params.baselineStart,
      params.baselineEnd
    );
  }
}

export async function fetchMapData(params: {
  area: AreaSelection;
  from: string;
  to: string;
}): Promise<MapResponse> {
  if (backendReachable === false) {
    return getFallbackMap(params.area, params.from, params.to);
  }
  try {
    const data = await fetchJsonWithTimeout<MapResponse>('/api/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area: params.area.id,
        geometry: params.area.geometry,
        from: params.from,
        to: params.to,
      }),
    });
    return { ...data, isFallback: false };
  } catch {
    return getFallbackMap(params.area, params.from, params.to);
  }
}

export async function downloadCalendarCsv(summary: SummaryResponse): Promise<void> {
  const slug = summary.area.slug || slugify(summary.area.label);
  const filename = `ignis_calendar_${slug}.csv`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch('/api/calendar.csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area: summary.area.id,
        geometry: summary.area.geometry,
        baselineStart: summary.baselineStart,
        baselineEnd: summary.baselineEnd,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.includes(',')) {
        triggerTextDownload(filename, text);
        return;
      }
    }
  } catch {
    // Fallback to client-side CSV generation
  }
  triggerTextDownload(filename, buildCalendarCsv(summary));
}

export async function downloadHotspotsCsv(
  area: AreaSelection,
  from: string,
  to: string,
  mapData: MapResponse | null
): Promise<void> {
  const slug = area.slug || slugify(area.label);
  const filename = `ignis_hotspots_${slug}.csv`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const res = await fetch('/api/hotspots.csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area: area.id,
        geometry: area.geometry,
        from,
        to,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text && text.includes(',')) {
        triggerTextDownload(filename, text);
        return;
      }
    }
  } catch {
    // Fallback to client-side CSV generation
  }
  const features = mapData?.hotspots.features || getFallbackMap(area, from, to).hotspots.features;
  triggerTextDownload(filename, buildHotspotsCsv(area.label, features, from, to));
}
