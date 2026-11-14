import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import {
  Download,
  Image as ImageIcon,
  Moon,
  Printer,
  Sun,
} from 'lucide-react';
import type {
  AreaInputMode,
  AreaSelection,
  BasemapId,
  CalendarViewMode,
  ColorRampId,
  DrawTool,
  MapResponse,
  MetaResponse,
  NavTab,
  RegionsResponse,
  SummaryResponse,
  ThemeMode,
} from './types';
import {
  downloadCalendarCsv,
  downloadHotspotsCsv,
  fetchMapData,
  fetchMeta,
  fetchRegions,
  fetchSummary,
} from './api';
import {
  getFallbackMap,
  getFallbackMeta,
  getFallbackRegions,
  getFallbackSummary,
  LATEST_ARCHIVE_DATE,
} from './fallbackData';
import {
  applyBaselineToSummary,
  computeBbox,
  computePresetWindow,
  createCirclePolygon,
  estimateAreaKm2,
  monthDateRange,
  parseUrlState,
  slugify,
} from './util';
import { WordmarkSvg } from './components/WordmarkSvg';
import { BurnIntro } from './components/BurnIntro';
import { Tooltip, type TooltipState } from './components/Tooltip';
import { MapView } from './components/MapView';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { AnnualChart, Climatology, SeasonCurve } from './components/Charts';
import { ExclusionsCard, Headline, ReportCard } from './components/Panels';
import { Methods } from './pages/Methods';

const GlobeView = lazy(() => import('./components/GlobeView').then(m => ({ default: m.GlobeView })));

const SHOWCASE_CHIPS = [
  { code: 'c:IRQ', label: 'Iraq' },
  { code: 'c:IRN', label: 'Iran' },
  { code: 'c:SAU', label: 'Saudi Arabia' },
  { code: 'c:KWT', label: 'Kuwait' },
  { code: 'c:ARE', label: 'UAE' },
  { code: 'c:QAT', label: 'Qatar' },
  { code: 'c:OMN', label: 'Oman' },
  { code: 'c:BHR', label: 'Bahrain' },
  { code: 'c:ARG', label: 'Argentina' },
];

function countryToArea(regions: RegionsResponse, code: string, provinceCode?: string): AreaSelection {
  const country =
    regions.countries.find((c) => c.code === code) || regions.countries[0];
  if (provinceCode) {
    const prov = country.provinces.find((p) => p.code === provinceCode);
    if (prov) {
      return {
        id: prov.code,
        label: `${prov.name}, ${country.name}`,
        slug: slugify(`${country.name}_${prov.name}`),
        kind: 'region',
        countryCode: country.code,
        provinceCode: prov.code,
        bbox: prov.bbox,
        center: prov.center,
        geometry: prov.geometry,
        areaKm2: prov.areaKm2,
      };
    }
  }
  return {
    id: country.code,
    label: country.name,
    slug: slugify(country.name),
    kind: 'region',
    countryCode: country.code,
    bbox: country.bbox,
    center: country.center,
    geometry: country.geometry,
    areaKm2: country.areaKm2,
  };
}

export default function App() {
  const initialUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? parseUrlState(window.location.search)
        : {},
    []
  );

  // Theme persisted under localStorage.getItem("ignis-theme")
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('ignis-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('ignis-theme', theme);
  }, [theme]);

  const [showIntro, setShowIntro] = useState<boolean>(() => !initialUrl.skipIntro);
  const [navTab, setNavTab] = useState<NavTab>(initialUrl.tab || 'explore');

  // Reference metadata & regions (seeded immediately with fallback so UI never stalls)
  const initialRegions = useMemo(() => getFallbackRegions(), []);
  const initialMeta = useMemo(() => getFallbackMeta(), []);
  const [regions, setRegions] = useState<RegionsResponse>(initialRegions);
  const [meta, setMeta] = useState<MetaResponse>(initialMeta);

  // Active Area Selection
  const defaultArea = useMemo(
    () => countryToArea(initialRegions, initialUrl.area || 'c:IRQ'),
    [initialRegions, initialUrl.area]
  );
  const [area, setArea] = useState<AreaSelection>(defaultArea);
  const [areaInputMode, setAreaInputMode] = useState<AreaInputMode>('region');
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(
    defaultArea.countryCode || 'c:IRQ'
  );
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<string>('');
  const [display, setDisplay] = useState<'map' | 'globe'>('globe');
  useEffect(() => { if (areaInputMode === 'draw') setDisplay('map'); }, [areaInputMode]);
  const [drawTool, setDrawTool] = useState<DrawTool>('polygon');

  // Coordinates form inputs
  const [coordLat, setCoordLat] = useState<string>(String(defaultArea.center[1]));
  const [coordLon, setCoordLon] = useState<string>(String(defaultArea.center[0]));
  const [coordRadiusKm, setCoordRadiusKm] = useState<string>('80');
  const [coordError, setCoordError] = useState<string>('');

  // Map & Export window
  const defaultWindow = useMemo(() => computePresetWindow(LATEST_ARCHIVE_DATE, '30d'), []);
  const [windowFrom, setWindowFrom] = useState<string>(defaultWindow.from);
  const [windowTo, setWindowTo] = useState<string>(defaultWindow.to);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Calendar & Baseline controls
  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialUrl.view || 'harm');
  const [baselineStart, setBaselineStart] = useState<number>(2001);
  const [baselineEnd, setBaselineEnd] = useState<number>(2025);
  const [colorRamp, setColorRamp] = useState<ColorRampId>('fire');
  const [basemap, setBasemap] = useState<BasemapId>('map');

  // Summary & Map data
  const [summary, setSummary] = useState<SummaryResponse>(() =>
    getFallbackSummary(defaultArea, defaultWindow.from, defaultWindow.to, 2001, 2025)
  );
  const [mapData, setMapData] = useState<MapResponse>(() =>
    getFallbackMap(defaultArea, defaultWindow.from, defaultWindow.to)
  );
  const [loading, setLoading] = useState<boolean>(false);

  // Floating tooltip & Calendar SVG ref for PNG export
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const calendarSvgRef = useRef<SVGSVGElement | null>(null);

  // Hydrate /api/meta and /api/regions on mount
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMeta(), fetchRegions()]).then(([m, r]) => {
      if (!alive) return;
      setMeta(m);
      setRegions(r);
      if (initialUrl.area && initialUrl.area.startsWith('c:')) {
        const nextArea = countryToArea(r, initialUrl.area);
        setArea(nextArea);
        setSelectedCountryCode(nextArea.countryCode || 'c:IRQ');
      }
    });
    return () => {
      alive = false;
    };
  }, [initialUrl.area]);

  // Sync URL query params (?area=...&view=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    sp.set('area', area.id);
    sp.set('view', viewMode);
    if (navTab === 'methods') sp.set('tab', 'methods');
    else sp.delete('tab');
    const nextUrl = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  }, [area.id, viewMode, navTab]);

  // Fetch /api/summary when area or window changes
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchSummary({
        area,
        from: windowFrom,
        to: windowTo,
        baselineStart,
        baselineEnd,
      }),
      fetchMapData({
        area,
        from: windowFrom,
        to: windowTo,
      }),
    ]).then(([sumRes, mapRes]) => {
      if (!alive) return;
      setSummary(sumRes);
      setMapData(mapRes);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [area, windowFrom, windowTo]);

  // Recompute baseline stats instantly when baseline years change
  useEffect(() => {
    setSummary((prev) => applyBaselineToSummary(prev, baselineStart, baselineEnd));
  }, [baselineStart, baselineEnd]);

  const handleSelectCountry = (code: string) => {
    setAreaInputMode('region');
    setSelectedCountryCode(code);
    setSelectedProvinceCode('');
    const next = countryToArea(regions, code);
    setArea(next);
    setCoordLat(String(next.center[1]));
    setCoordLon(String(next.center[0]));
  };

  const handleSelectProvince = (provCode: string) => {
    setSelectedProvinceCode(provCode);
    const next = countryToArea(regions, selectedCountryCode, provCode || undefined);
    setArea(next);
    setCoordLat(String(next.center[1]));
    setCoordLon(String(next.center[0]));
  };

  const handleApplyCoords = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(coordLat);
    const lon = Number(coordLon);
    const rad = Number(coordRadiusKm);
    if (!Number.isFinite(lat) || lat < -85 || lat > 85) {
      setCoordError('Latitude must be between -85 and 85.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCoordError('Longitude must be between -180 and 180.');
      return;
    }
    if (!Number.isFinite(rad) || rad < 5 || rad > 600) {
      setCoordError('Radius must be between 5 and 600 km.');
      return;
    }
    setCoordError('');
    const geom = createCirclePolygon(lon, lat, rad);
    setArea({
      id: `coords:${lat.toFixed(2)}:${lon.toFixed(2)}:${rad}`,
      label: `Point (${lat.toFixed(2)}°, ${lon.toFixed(2)}° · ${rad} km)`,
      slug: `coords_${lat.toFixed(1)}_${lon.toFixed(1)}_${rad}km`,
      kind: 'coords',
      bbox: computeBbox(geom),
      center: [lon, lat],
      geometry: geom,
      areaKm2: estimateAreaKm2(geom),
      circleRadiusKm: rad,
    });
  };

  const handleSelectMonthFromCalendar = (year: number, month: number) => {
    const { from, to } = monthDateRange(year, month, meta.latestDate);
    setSelectedMonthKey(`${year}-${month}`);
    setWindowFrom(from);
    setWindowTo(to);
  };

  const handlePresetWindow = (preset: '30d' | '12m' | '5y') => {
    const { from, to } = computePresetWindow(meta.latestDate, preset);
    setSelectedMonthKey(null);
    setWindowFrom(from);
    setWindowTo(to);
  };

  const handleExportPng = () => {
    const svg = calendarSvgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const clone = svg.cloneNode(true) as SVGSVGElement;

    // Resolve CSS variables to concrete colors for standalone PNG rendering
    const cs = getComputedStyle(document.documentElement);
    let markup = serializer.serializeToString(clone);
    const varNames = [
      '--page',
      '--surface-1',
      '--surface-2',
      '--surface-3',
      '--border-strong',
      '--text-primary',
      '--text-secondary',
      '--text-muted',
      '--series-1',
      '--series-2',
      '--accent',
      '--empty-cell',
    ];
    for (const v of varNames) {
      const val = cs.getPropertyValue(v).trim() || '#FAFAFA';
      markup = markup.replaceAll(`var(${v})`, val);
    }

    const svgBlob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const w = 960 * scale;
      const h = 760 * scale;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = theme === 'light' ? '#FFFFFF' : '#09090B';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = theme === 'light' ? '#09090B' : '#FAFAFA';
      ctx.font = `700 ${20 * scale}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(`IGNIS · ${area.label} (${viewMode.toUpperCase()})`, 36 * scale, 40 * scale);

      ctx.drawImage(img, 24 * scale, 56 * scale, w - 48 * scale, h - 104 * scale);

      ctx.fillStyle = '#A1A1AA';
      ctx.font = `500 ${11 * scale}px "IBM Plex Mono", monospace`;
      ctx.fillText(
        'IGNIS · data: NASA FIRMS (MODIS C6.1, VIIRS 375 m), harmonized',
        36 * scale,
        h - 20 * scale
      );

      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `ignis_calendar_${area.slug || slugify(area.label)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const activeCountry = useMemo(
    () => regions.countries.find((c) => c.code === selectedCountryCode) || regions.countries[0],
    [regions.countries, selectedCountryCode]
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showIntro && <BurnIntro onDismiss={() => setShowIntro(false)} />}

      {/* Sticky Frosted-Obsidian Topbar */}
      <header className="topbar">
        <div className="brand-lockup">
          <button
            type="button"
            onClick={() => setShowIntro(true)}
            aria-label="Return to IGNIS home"
            title="Return to IGNIS home"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <WordmarkSvg height={20} ember />
          </button>
          <span className="brand-lockup__divider" aria-hidden="true" />
          <span className="brand-lockup__sub">HARMONIZED FIRE CALENDAR · 2000–2026</span>
        </div>

        <nav className="topbar-nav" aria-label="Primary navigation">
          <button
            type="button"
            onClick={() => setNavTab('explore')}
            className={`nav-tab ${navTab === 'explore' ? 'nav-tab--active' : ''}`}
          >
            Explore
          </button>
          <button
            type="button"
            onClick={() => setNavTab('methods')}
            className={`nav-tab ${navTab === 'methods' ? 'nav-tab--active' : ''}`}
          >
            Methods &amp; validation
          </button>

          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="icon-btn"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </nav>
      </header>

      {navTab === 'methods' ? (
        <Methods meta={meta} />
      ) : (
        <div className="explore">
          {/* Left Sticky Control Rail (340px) */}
          <aside className="sidebar" aria-label="Fire calendar controls">
            {/* 01 · AREA OF INTEREST */}
            <section className="sidebar-card">
              <h2 className="section-kicker">01 · AREA OF INTEREST</h2>

              <div
                className="segmented segmented--3"
                role="tablist"
                aria-label="Area selection mode"
                style={{ marginBottom: 12 }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={areaInputMode === 'region'}
                  onClick={() => setAreaInputMode('region')}
                  className={`segmented__btn ${areaInputMode === 'region' ? 'segmented__btn--active' : ''}`}
                >
                  Region
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={areaInputMode === 'draw'}
                  onClick={() => setAreaInputMode('draw')}
                  className={`segmented__btn ${areaInputMode === 'draw' ? 'segmented__btn--active' : ''}`}
                >
                  Draw on map
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={areaInputMode === 'coords'}
                  onClick={() => setAreaInputMode('coords')}
                  className={`segmented__btn ${areaInputMode === 'coords' ? 'segmented__btn--active' : ''}`}
                >
                  Coordinates
                </button>
              </div>

              {areaInputMode === 'region' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div className="field-label">Quick-select showcase countries</div>
                    <div className="chip-grid">
                      {SHOWCASE_CHIPS.map((chip) => {
                        const isActive =
                          area.kind === 'region' && selectedCountryCode === chip.code;
                        return (
                          <button
                            key={chip.code}
                            type="button"
                            onClick={() => handleSelectCountry(chip.code)}
                            className={`region-chip ${isActive ? 'region-chip--active' : ''}`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="country-select" className="field-label">
                      Country
                    </label>
                    <select
                      id="country-select"
                      className="field-select"
                      value={selectedCountryCode}
                      onChange={(e) => handleSelectCountry(e.target.value)}
                    >
                      {regions.countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.iso3})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="province-select" className="field-label">
                      Province / Governorate
                    </label>
                    <select
                      id="province-select"
                      className="field-select"
                      value={selectedProvinceCode}
                      onChange={(e) => handleSelectProvince(e.target.value)}
                    >
                      <option value="">All of {activeCountry?.name}</option>
                      {activeCountry?.provinces.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {areaInputMode === 'draw' && (
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  <p style={{ margin: '0 0 10px 0' }}>
                    Use the floating drawing toolbar on the top-right of the map to sketch a custom{' '}
                    <strong>Polygon</strong>, <strong>Rectangle</strong>, or{' '}
                    <strong>Circle</strong> AOI.
                  </p>
                  <div className="segmented segmented--3">
                    {(['polygon', 'rectangle', 'circle'] as DrawTool[]).map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => setDrawTool(tool)}
                        className={`segmented__btn ${drawTool === tool ? 'segmented__btn--ember' : ''}`}
                        style={{ textTransform: 'capitalize' }}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {areaInputMode === 'coords' && (
                <form
                  onSubmit={handleApplyCoords}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label htmlFor="coord-lat" className="field-label">
                        Latitude
                      </label>
                      <input
                        id="coord-lat"
                        type="number"
                        step="0.01"
                        className="field-input font-mono"
                        value={coordLat}
                        onChange={(e) => setCoordLat(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="coord-lon" className="field-label">
                        Longitude
                      </label>
                      <input
                        id="coord-lon"
                        type="number"
                        step="0.01"
                        className="field-input font-mono"
                        value={coordLon}
                        onChange={(e) => setCoordLon(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="coord-radius" className="field-label">
                      Radius (km)
                    </label>
                    <input
                      id="coord-radius"
                      type="number"
                      min={5}
                      max={600}
                      className="field-input font-mono"
                      value={coordRadiusKm}
                      onChange={(e) => setCoordRadiusKm(e.target.value)}
                    />
                  </div>
                  {coordError && (
                    <div style={{ fontSize: 11.5, color: 'var(--critical)' }}>{coordError}</div>
                  )}
                  <button type="submit" className="btn-primary-ember">
                    Apply Coordinates
                  </button>
                </form>
              )}
            </section>

            {/* 02 · MAP & EXPORT WINDOW */}
            <section className="sidebar-card">
              <h2 className="section-kicker">02 · MAP &amp; EXPORT WINDOW</h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div>
                  <label htmlFor="window-from" className="field-label">
                    From
                  </label>
                  <input
                    id="window-from"
                    type="date"
                    className="field-input font-mono"
                    value={windowFrom}
                    min={meta.archiveStart}
                    max={windowTo}
                    onChange={(e) => {
                      setSelectedMonthKey(null);
                      setWindowFrom(e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="window-to" className="field-label">
                    To
                  </label>
                  <input
                    id="window-to"
                    type="date"
                    className="field-input font-mono"
                    value={windowTo}
                    min={windowFrom}
                    max={meta.latestDate}
                    onChange={(e) => {
                      setSelectedMonthKey(null);
                      setWindowTo(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => handlePresetWindow('30d')}
                  className="btn-secondary"
                  style={{ fontSize: 11.5, padding: '0 6px' }}
                >
                  Last 30 days
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetWindow('12m')}
                  className="btn-secondary"
                  style={{ fontSize: 11.5, padding: '0 6px' }}
                >
                  Last 12 mo
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetWindow('5y')}
                  className="btn-secondary"
                  style={{ fontSize: 11.5, padding: '0 6px' }}
                >
                  Last 5 yrs
                </button>
              </div>
            </section>

            {/* 03 · BASELINE & COLOR RAMP */}
            <section className="sidebar-card">
              <h2 className="section-kicker">03 · BASELINE &amp; COLOR RAMP</h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div>
                  <label htmlFor="baseline-start" className="field-label">
                    Baseline start
                  </label>
                  <input
                    id="baseline-start"
                    type="number"
                    min={2000}
                    max={2024}
                    className="field-input font-mono"
                    value={baselineStart}
                    onChange={(e) =>
                      setBaselineStart(Math.max(2000, Math.min(2024, Number(e.target.value) || 2001)))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="baseline-end" className="field-label">
                    Baseline end
                  </label>
                  <input
                    id="baseline-end"
                    type="number"
                    min={2001}
                    max={2025}
                    className="field-input font-mono"
                    value={baselineEnd}
                    onChange={(e) =>
                      setBaselineEnd(Math.max(2001, Math.min(2025, Number(e.target.value) || 2025)))
                    }
                  />
                </div>
              </div>

              <div className="field-label">Heatmap palette</div>
              <div className="segmented segmented--2" role="group" aria-label="Color ramp selector">
                <button
                  type="button"
                  onClick={() => setColorRamp('fire')}
                  className={`segmented__btn ${colorRamp === 'fire' ? 'segmented__btn--active' : ''}`}
                >
                  Fire heat
                </button>
                <button
                  type="button"
                  onClick={() => setColorRamp('cividis')}
                  className={`segmented__btn ${colorRamp === 'cividis' ? 'segmented__btn--active' : ''}`}
                >
                  Cividis (CV-safe)
                </button>
              </div>
            </section>

            {/* 04 · EXPORT BRIEFING */}
            <section className="sidebar-card">
              <h2 className="section-kicker">04 · EXPORT BRIEFING</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => downloadCalendarCsv(summary)}
                  className="btn-secondary"
                >
                  <Download size={13} />
                  Calendar CSV
                </button>
                <button
                  type="button"
                  onClick={() => downloadHotspotsCsv(area, windowFrom, windowTo, mapData)}
                  className="btn-secondary"
                >
                  <Download size={13} />
                  Hotspots CSV
                </button>
              </div>
              <button
                type="button"
                onClick={handleExportPng}
                className="btn-secondary"
                style={{ width: '100%', marginBottom: 8 }}
              >
                <ImageIcon size={13} />
                Calendar PNG
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-primary-ember"
                style={{ width: '100%' }}
              >
                <Printer size={14} />
                Print briefing
              </button>
            </section>
          </aside>

          {/* Main Analytical Canvas */}
          <main className="main" aria-busy={loading}>
            <Headline summary={summary} onHoverTooltip={setTooltip} />

            {!showIntro && (<div>
              <div className="visualization-switch"><button aria-pressed={display === 'map'} onClick={() => setDisplay('map')}>Map</button><button aria-pressed={display === 'globe'} onClick={() => { setAreaInputMode('region'); setDisplay('globe'); }}>3D Globe</button><small>One dataset. Two perspectives.</small></div>
              {display === 'globe' ? <Suspense fallback={<div className="earth-stage">Loading Earth…</div>}><GlobeView area={area} mapData={mapData} colorRamp={colorRamp} from={windowFrom} to={windowTo} onCountry={handleSelectCountry} onMap={() => setDisplay('map')} /></Suspense> : <MapView
                area={area}
                mapData={mapData}
                basemap={basemap}
                onBasemapChange={setBasemap}
                theme={theme}
                areaInputMode={areaInputMode}
                drawTool={drawTool}
                onDrawToolChange={setDrawTool}
                onSelectCountryCode={handleSelectCountry}
                onCustomAreaDrawn={(drawn) => setArea(drawn)}
                onHoverTooltip={setTooltip}
                latestDate={meta.latestDate}
              />}
            </div>)}

            <CalendarHeatmap
              summary={summary}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              colorRamp={colorRamp}
              theme={theme}
              selectedMonthKey={selectedMonthKey}
              onSelectMonth={handleSelectMonthFromCalendar}
              onHoverTooltip={setTooltip}
              svgRef={calendarSvgRef}
            />

            {/* 2-Column Analytics Bento Grid */}
            <div className="analytics-grid">
              <SeasonCurve
                days={summary.seasonCurve.days}
                daysOffset={summary.seasonCurve.daysOffset}
                onHoverTooltip={setTooltip}
              />
              <AnnualChart
                annual={summary.calendar.annual}
                trend={summary.calendar.trend}
                onHoverTooltip={setTooltip}
              />
            </div>

            <div className="analytics-grid">
              <Climatology
                months={summary.climatology.months}
                baselineStart={summary.baselineStart}
                baselineEnd={summary.baselineEnd}
                onHoverTooltip={setTooltip}
              />
              <ReportCard summary={summary} />
            </div>

            <ExclusionsCard summary={summary} />
          </main>
        </div>
      )}

      {/* Subtle Footer */}
      <footer
        className="no-print"
        style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--border)',
          padding: '18px 28px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        <span>
          IGNIS · Harmonized MODIS C6.1 &amp; VIIRS 375 m Fire Calendar · NASA Space Apps Challenge 2026
        </span>
        {summary.isFallback && (
          <span
            className="font-mono"
            style={{
              padding: '5px 12px',
              borderRadius: 10,
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--text-secondary)',
            }}
          >
            Preview dataset · connect FastAPI backend for 16.5M full archive
          </span>
        )}
      </footer>

      <Tooltip tooltip={tooltip} />
    </div>
  );
}
