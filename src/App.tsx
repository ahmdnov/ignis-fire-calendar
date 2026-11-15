import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { AlertTriangle, Info, Moon, Sun } from 'lucide-react';
import type {
  AreaInputMode,
  AreaSelection,
  BasemapId,
  BreakdownResponse,
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
  ApiError,
  downloadCalendarCsv,
  downloadHotspotsCsv,
  fetchBreakdown,
  fetchMapData,
  fetchMeta,
  fetchRegions,
  fetchSummary,
} from './api';
import {
  computeBbox,
  computePresetWindow,
  createCirclePolygon,
  estimateAreaKm2,
  fmtDate,
  fmtDateRange,
  parseUrlState,
  slugify,
} from './util';
import { WordmarkSvg } from './components/WordmarkSvg';
import { IntroController } from './intro/IntroController';
import { Tooltip, type TooltipState } from './components/Tooltip';
import { MapView } from './components/MapView';
import { AnnualChart, Climatology, SeasonCurve } from './components/Charts';
import { ExclusionsCard, Headline, ReportCard } from './components/Panels';
import { CommandBar, SectionNav, type PeriodPreset, type SectionDef } from './components/CommandBar';
import {
  Briefing,
  StoryPager,
  OutlookCard,
  OutlookTrackCard,
  MonthsVsNormalCard,
  ProvinceRanking,
  RecordMonthsCard,
  StoryChapter,
  TopYearsCard,
} from './components/Story';
import {
  nowInsight,
  thisYearInsight,
  trendInsight,
  trustInsight,
  nextInsight,
  whenInsight,
  whereInsight,
} from './insights';
import { Methods } from './pages/Methods';

const GlobeView = lazy(() => import('./components/GlobeView').then((m) => ({ default: m.GlobeView })));

const DEFAULT_AREA = 'c:IRQ';
const DEFAULT_PRESET: PeriodPreset = '12m';

/** The story, in reading order. Chip labels are the chapter questions in short form. */
const SECTIONS: (SectionDef & { question: string })[] = [
  { id: 'sec-now', label: 'Overview', question: 'Overview' },
  { id: 'sec-where', label: 'Where', question: 'Where is it burning?' },
  { id: 'sec-when', label: 'When', question: 'When in the year does it burn?' },
  { id: 'sec-year', label: 'This year', question: 'How is this year going?' },
  { id: 'sec-trend', label: 'Trend', question: 'Is it getting worse?' },
  { id: 'sec-next', label: 'Next', question: "What's likely next?" },
  { id: 'sec-trust', label: 'Trust', question: 'Can you trust these numbers?' },
];

function countryToArea(regions: RegionsResponse, code: string, provinceCode?: string): AreaSelection {
  const country = regions.countries.find((c) => c.code === code) || regions.countries[0];
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

function circleArea(lat: number, lon: number, rad: number): AreaSelection {
  const geom = createCirclePolygon(lon, lat, rad);
  return {
    id: `coords:${lat.toFixed(2)}:${lon.toFixed(2)}:${rad}`,
    label: `${rad} km around ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
    slug: `coords_${lat.toFixed(1)}_${lon.toFixed(1)}_${rad}km`,
    kind: 'coords',
    bbox: computeBbox(geom),
    center: [lon, lat],
    geometry: geom,
    areaKm2: estimateAreaKm2(geom),
    circleRadiusKm: rad,
  };
}

/** Rebuild an area from its id in the URL: c:IRQ, p:IRQ-3228, coords:lat:lon:radius. */
function areaFromId(regions: RegionsResponse, id: string | undefined): AreaSelection {
  if (id?.startsWith('coords:')) {
    const [lat, lon, rad] = id.slice(7).split(':').map(Number);
    if ([lat, lon, rad].every(Number.isFinite) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 && rad >= 5 && rad <= 600) {
      return circleArea(lat, lon, rad);
    }
  }
  if (id?.startsWith('p:')) {
    for (const c of regions.countries) {
      if (c.provinces.some((p) => p.code === id)) return countryToArea(regions, c.code, id);
    }
  }
  const code = regions.countries.some((c) => c.code === id) ? (id as string) : DEFAULT_AREA;
  return countryToArea(regions, code);
}

const isIsoDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function App() {
  const initialUrl = useMemo(() => parseUrlState(window.location.search), []);
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem('ignis-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('ignis-theme', theme);
  }, [theme]);

  const [showIntro, setShowIntro] = useState<boolean>(() => !initialUrl.skipIntro);
  const [navTab, setNavTab] = useState<NavTab>(initialUrl.tab || 'explore');

  // The landing covers the page; keep the document from scrolling behind it.
  useEffect(() => {
    document.documentElement.style.overflow = showIntro ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [showIntro]);

  /* ------------------------------------------------------------------ reference data */
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [regions, setRegions] = useState<RegionsResponse | null>(null);

  /* ------------------------------------------------------------------ selection */
  const [area, setArea] = useState<AreaSelection | null>(null);
  const [areaInputMode, setAreaInputMode] = useState<AreaInputMode>('region');
  const [drawTool, setDrawTool] = useState<DrawTool>('polygon');
  const [display, setDisplay] = useState<'map' | 'globe'>('globe');
  const [basemap, setBasemap] = useState<BasemapId>('map');

  const [windowFrom, setWindowFrom] = useState<string>('');
  const [windowTo, setWindowTo] = useState<string>('');
  const [activePreset, setActivePreset] = useState<PeriodPreset | null>(DEFAULT_PRESET);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialUrl.view || 'harm');
  const [baselineStart, setBaselineStart] = useState<number>(2001);
  const [baselineEnd, setBaselineEnd] = useState<number>(2025);
  const [colorRamp, setColorRamp] = useState<ColorRampId>('fire');

  /* ------------------------------------------------------------------ results */
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [mapData, setMapData] = useState<MapResponse | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [rankingExpanded, setRankingExpanded] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const lastFullYear = useMemo(() => {
    if (!meta) return 2025;
    return meta.latestDate.endsWith('-12-31') ? meta.currentYear : meta.currentYear - 1;
  }, [meta]);

  // Load the archive description and the region list once, then set the first view from the URL.
  useEffect(() => {
    let alive = true;
    fetchMeta()
      .then((m) => fetchRegions().then((r) => [m, r] as const))
      .then(([m, r]) => {
        if (!alive) return;
        setMeta(m);
        setRegions(r);
        setArea(areaFromId(r, initialUrl.area));

        const full = m.latestDate.endsWith('-12-31') ? m.currentYear : m.currentYear - 1;
        setBaselineEnd(full);

        const qFrom = initialParams.get('from');
        const qTo = initialParams.get('to');
        if (isIsoDate(qFrom) && isIsoDate(qTo) && qFrom <= qTo && qTo <= m.latestDate && qFrom >= m.archiveStart) {
          setWindowFrom(qFrom);
          setWindowTo(qTo);
          setActivePreset(null);
        } else {
          const w = computePresetWindow(m.latestDate, DEFAULT_PRESET);
          setWindowFrom(w.from);
          setWindowTo(w.to);
        }
      });
    return () => {
      alive = false;
    };
  }, [initialUrl.area, initialParams]);

  // Keep the address bar shareable.
  useEffect(() => {
    if (!area || !windowFrom) return;
    const sp = new URLSearchParams(window.location.search);
    if (area.kind === 'draw') sp.delete('area');
    else sp.set('area', area.id);
    sp.set('from', windowFrom);
    sp.set('to', windowTo);
    sp.set('view', viewMode);
    if (navTab === 'methods') sp.set('tab', 'methods');
    else sp.delete('tab');
    window.history.replaceState(null, '', `${window.location.pathname}?${sp.toString()}`);
  }, [area, windowFrom, windowTo, viewMode, navTab]);

  // Fetch whenever the question changes: area, period or baseline.
  useEffect(() => {
    if (!area || !windowFrom || !windowTo) return;
    let alive = true;
    setLoading(true);
    Promise.allSettled([
      fetchSummary({ area, from: windowFrom, to: windowTo, baselineStart, baselineEnd }),
      fetchMapData({ area, from: windowFrom, to: windowTo }),
    ]).then(([sumRes, mapRes]) => {
      if (!alive) return;
      if (sumRes.status === 'fulfilled') {
        setSummary(sumRes.value);
        setError(null);
      } else {
        const e = sumRes.reason;
        setError(
          e instanceof ApiError
            ? `This area could not be analysed: ${e.message}`
            : 'The data server did not answer. Check that it is running, then try again.'
        );
      }
      if (mapRes.status === 'fulfilled') setMapData(mapRes.value);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [area, windowFrom, windowTo, baselineStart, baselineEnd]);

  // Province breakdown of the area's country (for a country or a province). Keyed on the country,
  // so moving between provinces of one country does not refetch.
  const breakdownCountry = area?.kind === 'region' ? area.countryCode : undefined;
  useEffect(() => {
    if (!breakdownCountry || !windowFrom || !windowTo) {
      setBreakdown(null);
      return;
    }
    let alive = true;
    fetchBreakdown({ countryCode: breakdownCountry, from: windowFrom, to: windowTo, baselineStart, baselineEnd })
      .then((b) => alive && setBreakdown(b))
      .catch(() => alive && setBreakdown(null));
    return () => {
      alive = false;
    };
  }, [breakdownCountry, windowFrom, windowTo, baselineStart, baselineEnd]);
  useEffect(() => setRankingExpanded(false), [breakdownCountry]);

  /* ------------------------------------------------------------------ handlers */
  // One question is shown at a time. Choosing one swaps the view and returns to the top of it.
  const [activeSec, setActiveSec] = useState('sec-now');
  const scrollToSection = useCallback((id: string) => {
    setActiveSec(id);
    window.setTimeout(() => {
      const top = document.getElementById('story-top');
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 30);
  }, []);

  const handleSelectCountry = useCallback(
    (code: string) => {
      if (!regions) return;
      setAreaInputMode('region');
      setArea(countryToArea(regions, code));
    },
    [regions]
  );

  const handleSelectProvince = useCallback(
    (countryCode: string, provCode: string) => {
      if (!regions) return;
      setAreaInputMode('region');
      setArea(countryToArea(regions, countryCode, provCode || undefined));
    },
    [regions]
  );

  const handleAreaInputMode = useCallback((mode: AreaInputMode) => {
    setAreaInputMode(mode);
    if (mode === 'draw') setDisplay('map');
  }, []);

  const handleStartDrawing = useCallback(() => {
    setAreaInputMode('draw');
    setDisplay('map');
    scrollToSection('sec-where');
  }, [scrollToSection]);

  const handlePreset = useCallback(
    (preset: PeriodPreset) => {
      if (!meta) return;
      const w = computePresetWindow(meta.latestDate, preset);
      setSelectedMonthKey(null);
      setActivePreset(preset);
      setWindowFrom(w.from);
      setWindowTo(w.to);
    },
    [meta]
  );

  const handleWindow = useCallback((from: string, to: string) => {
    setSelectedMonthKey(null);
    setActivePreset(null);
    setWindowFrom(from);
    setWindowTo(to);
  }, []);

  const handleExportCalendar = async () => {
    if (!summary) return;
    const msg = await downloadCalendarCsv(summary);
    if (msg) setNotice(msg);
  };

  const handleExportHotspots = async () => {
    if (!area) return;
    setNotice('Preparing the hotspot file. Large areas can take a minute.');
    const msg = await downloadHotspotsCsv(area, windowFrom, windowTo, mapData);
    setNotice(msg);
  };

  /* ------------------------------------------------------------------ derived */
  const rangeLabel = meta ? `${meta.archiveStart.slice(0, 4)}–${meta.latestDate.slice(0, 4)}` : '2000–2025';
  const isSample = !!(summary?.isFallback || meta?.isFallback);
  const covered = summary ? summary.coverage !== false : true;
  const ready = !!(meta && regions && area && windowFrom);
  const latestYear = summary?.seasonCurve.year ?? meta?.currentYear;

  // The story's answers, recomputed whenever the data changes.
  const story = useMemo(() => {
    if (!summary || !area) return null;
    // Only use a breakdown that belongs to this area's country and to the dates on screen,
    // so a slower response can never pair one period's ranking with another period's headline.
    const bd =
      breakdown &&
      area.kind === 'region' &&
      breakdown.countryCode === area.countryCode &&
      breakdown.from === summary.from &&
      breakdown.to === summary.to
        ? breakdown
        : null;
    return {
      now: nowInsight(summary),
      where: whereInsight(area, bd, mapData),
      when: whenInsight(summary),
      year: thisYearInsight(summary),
      trend: trendInsight(summary),
      next: nextInsight(summary),
      trust: trustInsight(summary),
      breakdown: bd,
    };
  }, [summary, area, breakdown, mapData]);

  // Tabs that exist for this area; an unavailable one falls back to the overview.
  const tabSections = useMemo(
    () => (!covered || !story ? SECTIONS.slice(0, 2) : SECTIONS.filter((x) => x.id !== 'sec-next' || !!story.next)),
    [covered, story]
  );
  const tab = tabSections.some((x) => x.id === activeSec) ? activeSec : 'sec-now';

  const dataStatus = meta ? (
    <>
      <i className={`data-dot ${isSample ? 'data-dot--sample' : ''}`} aria-hidden="true" />
      {isSample ? 'Offline sample · not real readings' : `NASA FIRMS archive · through ${fmtDate(meta.latestDate)}`}
    </>
  ) : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showIntro && <IntroController onLaunch={() => setShowIntro(false)} rangeLabel={rangeLabel} />}

      <header className={`topbar ${navTab === 'explore' ? 'topbar--static' : ''}`}>
        <div className="brand-lockup">
          <button
            type="button"
            onClick={() => setShowIntro(true)}
            aria-label="Back to the IGNIS start page"
            title="Back to the IGNIS start page"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 38,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            <WordmarkSvg height={20} ember />
          </button>
          <span className="brand-lockup__divider" aria-hidden="true" />
          <span className="brand-lockup__sub">HARMONIZED FIRE CALENDAR · {rangeLabel}</span>
        </div>

        <nav className="topbar-nav" aria-label="Primary navigation">
          <button
            type="button"
            onClick={() => setNavTab('explore')}
            aria-current={navTab === 'explore' ? 'page' : undefined}
            className={`nav-tab ${navTab === 'explore' ? 'nav-tab--active' : ''}`}
          >
            Explore
          </button>
          <button
            type="button"
            onClick={() => setNavTab('methods')}
            aria-current={navTab === 'methods' ? 'page' : undefined}
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
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </nav>
      </header>

      {navTab === 'methods' ? (
        meta ? (
          <Methods meta={meta} />
        ) : (
          <div className="explore">
            <div className="skeleton" style={{ height: 520 }} aria-hidden="true" />
          </div>
        )
      ) : (
        <>
          {ready && regions && area && meta && (
            <CommandBar
              regions={regions}
              area={area}
              areaInputMode={areaInputMode}
              onAreaInputMode={handleAreaInputMode}
              selectedCountryCode={area.countryCode || ''}
              selectedProvinceCode={area.provinceCode || ''}
              onSelectCountry={handleSelectCountry}
              onSelectProvince={handleSelectProvince}
              drawTool={drawTool}
              onDrawTool={setDrawTool}
              onStartDrawing={handleStartDrawing}
              onApplyCoords={(lat, lon, rad) => {
                setAreaInputMode('coords');
                setArea(circleArea(lat, lon, rad));
              }}
              windowFrom={windowFrom}
              windowTo={windowTo}
              archiveStart={meta.archiveStart}
              latestDate={meta.latestDate}
              activePreset={activePreset}
              onPreset={handlePreset}
              onWindow={handleWindow}
              baselineStart={baselineStart}
              baselineEnd={baselineEnd}
              lastFullYear={lastFullYear}
              onBaseline={(s, e) => {
                setBaselineStart(s);
                setBaselineEnd(e);
              }}
              colorRamp={colorRamp}
              onColorRamp={setColorRamp}
              onExportCalendarCsv={handleExportCalendar}
              onExportHotspotsCsv={handleExportHotspots}
              onPrint={() => window.print()}
              loading={loading}
            >
              <SectionNav sections={tabSections} current={tab} onSelect={scrollToSection} status={dataStatus} armed={!!summary} />
            </CommandBar>
          )}

          <div className="explore">
            <main id="story-top" className="main" aria-busy={loading && !!summary}>
              {error && (
                <div className="notice notice--error no-print" role="alert">
                  <AlertTriangle size={17} aria-hidden="true" />
                  <span>{error}</span>
                  <button type="button" className="notice__close" aria-label="Dismiss" onClick={() => setError(null)}>
                    ×
                  </button>
                </div>
              )}
              {notice && (
                <div className="notice no-print" role="status">
                  <Info size={17} aria-hidden="true" />
                  <span>{notice}</span>
                  <button type="button" className="notice__close" aria-label="Dismiss" onClick={() => setNotice(null)}>
                    ×
                  </button>
                </div>
              )}

              {!summary || !area || !meta ? (
                <div aria-live="polite" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <span className="sr-only">Loading fire data…</span>
                  <div className="skeleton" style={{ height: 300 }} aria-hidden="true" />
                  <div className="skeleton" style={{ height: 'clamp(420px, 62vh, 620px)' }} aria-hidden="true" />
                  <div className="skeleton" style={{ height: 620 }} aria-hidden="true" />
                </div>
              ) : (
                <div className="story-tabs" data-tab={tab}>
                  <div id="sec-now" data-reveal>
                    <Headline
                      summary={summary}
                      onHoverTooltip={setTooltip}
                      question={covered ? '01 · Is it burning more than normal?' : undefined}
                      meaning={story && covered ? story.now.parts : undefined}
                    />
                  </div>

                  {!covered && regions && (
                    <div className="notice" role="status">
                      <Info size={17} aria-hidden="true" />
                      <div>
                        <strong>No archive coverage for this area.</strong> Pick one of the covered countries:
                        <div className="chip-grid" style={{ marginTop: 10 }}>
                          {regions.countries.map((c) => (
                            <button key={c.code} type="button" className="region-chip" onClick={() => handleSelectCountry(c.code)}>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {covered && story && (
                    <Briefing
                      area={area.label}
                      onJump={scrollToSection}
                      items={[
                        { id: 'sec-where', n: '02', insight: story.where },
                        { id: 'sec-when', n: '03', insight: story.when },
                        { id: 'sec-year', n: '04', insight: story.year },
                        { id: 'sec-trend', n: '05', insight: story.trend },
                        ...(story.next ? [{ id: 'sec-next', n: '06', insight: story.next }] : []),
                        { id: 'sec-trust', n: story.next ? '07' : '06', insight: story.trust },
                      ]}
                    />
                  )}

                  <StoryChapter
                    id="sec-where"
                    n="02"
                    question="Where is it burning?"
                    insight={
                      story && covered
                        ? story.where
                        : { parts: ['The map shows the selected area. There is no archive data here to analyse.'], short: [], facts: [] }
                    }
                    hint={
                      story?.breakdown
                        ? 'brighter, larger dots mean more days with fire in that square. The bars show each province’s share of the fire; the badge compares it with its own past on the same dates. Click a province to open it.'
                        : 'brighter, larger dots mean more days with fire in that square. Switch to Map for satellite night lights and true colour.'
                    }
                  >
                    <div className={story?.breakdown && covered ? 'story-grid' : undefined}>
                      <section className="viz-card" aria-labelledby="viz-title">
                        <div className="viz-card__head">
                          <div>
                            <div className="section-kicker" style={{ marginBottom: 4 }}>
                              WHERE IT BURNED · {fmtDateRange(windowFrom, windowTo)}
                            </div>
                            <h3 id="viz-title">
                              {mapData
                                ? `${mapData.hotspots.features.length.toLocaleString('en-US')} grid cells with fire`
                                : `Fire locations in ${area.label}`}
                            </h3>
                          </div>
                          <div className="segmented segmented--2 no-print" role="group" aria-label="Map or globe">
                            <button
                              type="button"
                              aria-pressed={display === 'globe'}
                              className={`segmented__btn ${display === 'globe' ? 'segmented__btn--ember' : ''}`}
                              onClick={() => {
                                if (areaInputMode === 'draw') setAreaInputMode('region');
                                setDisplay('globe');
                              }}
                            >
                              3D globe
                            </button>
                            <button
                              type="button"
                              aria-pressed={display === 'map'}
                              className={`segmented__btn ${display === 'map' ? 'segmented__btn--ember' : ''}`}
                              onClick={() => setDisplay('map')}
                            >
                              Map
                            </button>
                          </div>
                        </div>

                        <div className="viz-card__body">
                          {showIntro || !mapData ? (
                            <div className="earth-stage" aria-hidden="true" />
                          ) : display === 'globe' ? (
                            <Suspense fallback={<div className="earth-stage" aria-label="Loading the globe" />}>
                              <GlobeView
                                area={area}
                                mapData={mapData}
                                colorRamp={colorRamp}
                                from={windowFrom}
                                to={windowTo}
                                onCountry={handleSelectCountry}
                                onMap={() => setDisplay('map')}
                              />
                            </Suspense>
                          ) : (
                            <MapView
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
                            />
                          )}
                        </div>
                      </section>

                      {story?.breakdown && covered && (
                        <ProvinceRanking
                          breakdown={story.breakdown}
                          selectedId={area.provinceCode}
                          expanded={rankingExpanded}
                          onToggle={() => setRankingExpanded((x) => !x)}
                          onSelect={(pid) => handleSelectProvince(story.breakdown!.countryCode, pid)}
                        />
                      )}
                    </div>
                  </StoryChapter>

                  {covered && story && (
                    <>
                      <StoryChapter
                        id="sec-when"
                        n="03"
                        question="When in the year does it burn?"
                        insight={story.when}
                        hint={`each box is the normal range for that month in ${summary.baselineStart}–${summary.baselineEnd} (the line is the median); the dot is ${latestYear}.`}
                      >
                        <div className="story-grid">
                          <Climatology
                            months={summary.climatology.months}
                            baselineStart={summary.baselineStart}
                            baselineEnd={summary.baselineEnd}
                            year={latestYear}
                            onHoverTooltip={setTooltip}
                          />
                          <RecordMonthsCard summary={summary} />
                        </div>
                      </StoryChapter>

                      <StoryChapter
                        id="sec-year"
                        n="04"
                        question={`How is ${latestYear ?? 'this year'} going?`}
                        insight={story.year}
                        hint={`the orange line adds up ${latestYear}’s fire day by day. The dashed line is a normal year, and the shaded band holds 8 of every 10 past years. Above the band means an unusually heavy year.`}
                      >
                        <div className="story-grid">
                          <SeasonCurve
                            days={summary.seasonCurve.days}
                            daysOffset={summary.seasonCurve.daysOffset}
                            year={latestYear}
                            note={summary.seasonCurve.note}
                            onHoverTooltip={setTooltip}
                          />
                          <MonthsVsNormalCard summary={summary} year={latestYear} />
                        </div>
                      </StoryChapter>

                      <StoryChapter
                        id="sec-trend"
                        n="05"
                        question="Is it getting worse over time?"
                        insight={story.trend}
                        hint="each bar is one year. Grey bars (before 2012) are converted from the older MODIS satellite and carry error whiskers; orange bars come from VIIRS. The dashed line is the long-term trend."
                      >
                        <div className="story-grid">
                          <AnnualChart
                            annual={summary.calendar.annual}
                            trend={summary.calendar.trend}
                            onHoverTooltip={setTooltip}
                          />
                          <TopYearsCard summary={summary} />
                        </div>
                      </StoryChapter>

                      {story.next && summary.outlook && (
                        <StoryChapter
                          id="sec-next"
                          n="06"
                          question="What's likely next?"
                          insight={story.next}
                          hint="the marker shows the chance that next month ends above its usual level; between 40% and 60% is too close to call. The grid on the right is the honesty check: every forecast the model would have made here, using only earlier data, and whether it came true."
                        >
                          <div className="story-grid story-grid--even">
                            <OutlookCard outlook={summary.outlook} />
                            <OutlookTrackCard outlook={summary.outlook} areaLabel={area.label} />
                          </div>
                        </StoryChapter>
                      )}

                      <StoryChapter
                        id="sec-trust"
                        n={story.next ? '07' : '06'}
                        question="Can you trust these numbers?"
                        insight={story.trust}
                        hint="the long bar shows every raw satellite detection; only the orange part is counted as fire. The report card tests the pre-2012 conversion on 2012–2017, when both satellites were flying."
                      >
                        <div className="story-grid story-grid--even">
                          <ExclusionsCard summary={summary} />
                          <ReportCard summary={summary} />
                        </div>
                      </StoryChapter>
                    </>
                  )}
                  <StoryPager sections={tabSections} current={tab} onSelect={scrollToSection} />
                </div>
              )}
            </main>
          </div>
        </>
      )}

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
        <span>IGNIS · harmonized MODIS &amp; VIIRS fire calendar · NASA Space Apps Challenge 2026</span>
        <span className="font-mono" style={{ fontSize: 11 }}>
          {isSample
            ? 'Offline sample shown. Start the data server for the real archive.'
            : 'Data: NASA FIRMS active fire archive (MODIS, VIIRS S-NPP, VIIRS NOAA-20)'}
        </span>
      </footer>

      <Tooltip tooltip={tooltip} />
    </div>
  );
}
