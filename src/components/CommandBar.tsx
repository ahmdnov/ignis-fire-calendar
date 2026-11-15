import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CalendarRange,
  ChevronDown,
  Download,
  FileSpreadsheet,
  MapPin,
  Printer,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  AreaInputMode,
  AreaSelection,
  ColorRampId,
  DrawTool,
  RegionsResponse,
} from '../types';
import { fmtDateRange } from '../util';
import { STATIC } from '../api';

export type PeriodPreset = '30d' | '12m' | '5y';
type PanelId = 'area' | 'period' | 'compare' | 'export';

interface CommandBarProps {
  regions: RegionsResponse;
  area: AreaSelection;
  areaInputMode: AreaInputMode;
  onAreaInputMode: (mode: AreaInputMode) => void;
  selectedCountryCode: string;
  selectedProvinceCode: string;
  onSelectCountry: (code: string) => void;
  onSelectProvince: (countryCode: string, provinceCode: string) => void;
  drawTool: DrawTool;
  onDrawTool: (tool: DrawTool) => void;
  onStartDrawing: () => void;
  onApplyCoords: (lat: number, lon: number, radiusKm: number) => void;

  windowFrom: string;
  windowTo: string;
  archiveStart: string;
  latestDate: string;
  activePreset: PeriodPreset | null;
  onPreset: (preset: PeriodPreset) => void;
  onWindow: (from: string, to: string) => void;

  baselineStart: number;
  baselineEnd: number;
  lastFullYear: number;
  onBaseline: (start: number, end: number) => void;
  colorRamp: ColorRampId;
  onColorRamp: (ramp: ColorRampId) => void;

  onExportCalendarCsv: () => void;
  onExportHotspotsCsv: () => void;
  onPrint: () => void;

  loading: boolean;
  children?: ReactNode; // section navigation row
}

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: '30d', label: 'Last 30 days' },
  { id: '12m', label: '12 months' },
  { id: '5y', label: '5 years' },
];

const MIN_BASELINE_YEARS = 5;

export function CommandBar(p: CommandBarProps) {
  const [open, setOpen] = useState<PanelId | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({});
  const uid = useId();

  const close = (restoreFocus = true) => {
    setOpen((cur) => {
      if (cur && restoreFocus) triggerRefs.current[cur]?.focus();
      return null;
    });
  };

  // Close on outside click and on Escape; move focus into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const panel = document.getElementById(`${uid}-${open}`);
    const first = panel?.querySelector<HTMLElement>('[data-autofocus], input, select, button');
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: PanelId) => setOpen((cur) => (cur === id ? null : id));
  const triggerProps = (id: PanelId) => ({
    ref: (el: HTMLButtonElement | null) => {
      triggerRefs.current[id] = el;
    },
    type: 'button' as const,
    'aria-expanded': open === id,
    'aria-controls': `${uid}-${id}`,
    'aria-haspopup': 'dialog' as const,
    onClick: () => toggle(id),
  });

  /* ---------------------------------------------------------------- area search */
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { key: string; label: string; sub: string; country: string; province?: string }[] = [];
    for (const c of p.regions.countries) {
      if (c.name.toLowerCase().includes(q) || c.iso3.toLowerCase() === q) {
        out.push({ key: c.code, label: c.name, sub: 'Country', country: c.code });
      }
      for (const pr of c.provinces) {
        if (pr.name.toLowerCase().includes(q)) {
          out.push({ key: pr.code, label: pr.name, sub: c.name, country: c.code, province: pr.code });
        }
      }
    }
    return out.slice(0, 40);
  }, [query, p.regions]);

  const activeCountry =
    p.regions.countries.find((c) => c.code === p.selectedCountryCode) || p.regions.countries[0];

  /* ---------------------------------------------------------------- coordinates */
  const [lat, setLat] = useState(String(p.area.center[1]));
  const [lon, setLon] = useState(String(p.area.center[0]));
  const [radius, setRadius] = useState('80');
  const [coordError, setCoordError] = useState('');
  useEffect(() => {
    setLat(String(p.area.center[1]));
    setLon(String(p.area.center[0]));
  }, [p.area.center]);

  const submitCoords = (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat);
    const lo = Number(lon);
    const r = Number(radius);
    if (lat.trim() === '' || !Number.isFinite(la) || la < -85 || la > 85) {
      setCoordError('Latitude must be a number between -85 and 85.');
      return;
    }
    if (lon.trim() === '' || !Number.isFinite(lo) || lo < -180 || lo > 180) {
      setCoordError('Longitude must be a number between -180 and 180.');
      return;
    }
    if (!Number.isFinite(r) || r < 5 || r > 600) {
      setCoordError('Radius must be between 5 and 600 km.');
      return;
    }
    setCoordError('');
    p.onApplyCoords(la, lo, r);
    close();
  };

  /* ---------------------------------------------------------------- baseline */
  const [bStart, setBStart] = useState(String(p.baselineStart));
  const [bEnd, setBEnd] = useState(String(p.baselineEnd));
  const [baselineError, setBaselineError] = useState('');
  useEffect(() => {
    setBStart(String(p.baselineStart));
    setBEnd(String(p.baselineEnd));
  }, [p.baselineStart, p.baselineEnd]);

  const submitBaseline = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Math.round(Number(bStart));
    const en = Math.round(Number(bEnd));
    if (!Number.isFinite(s) || !Number.isFinite(en) || s < 2001 || en > p.lastFullYear) {
      setBaselineError(`Use full years between 2001 and ${p.lastFullYear}.`);
      return;
    }
    if (en - s + 1 < MIN_BASELINE_YEARS) {
      setBaselineError(`Pick at least ${MIN_BASELINE_YEARS} years. A median of fewer years is not a meaningful "normal".`);
      return;
    }
    setBaselineError('');
    p.onBaseline(s, en);
    close();
  };

  const areaKicker =
    p.area.kind === 'region' ? 'Area' : p.area.kind === 'coords' ? 'Area · point + radius' : 'Area · drawn';

  return (
    <div className="stickybar no-print" ref={barRef}>
      {open && <button type="button" className="popover-backdrop" aria-label="Close panel" onClick={() => close()} />}

      <div className="commandbar" role="toolbar" aria-label="Fire calendar controls">
        {/* ---------------- Area ---------------- */}
        <div className="cmd-wrap cmd-wrap--grow">
          <button className="cmd" {...triggerProps('area')}>
            <MapPin size={16} className="cmd__icon" aria-hidden="true" />
            <span className="cmd__text">
              <span className="cmd__kicker">{areaKicker}</span>
              <span className="cmd__value">{p.area.label}</span>
            </span>
            <ChevronDown size={15} className="cmd__chev" aria-hidden="true" />
          </button>

          {open === 'area' && (
            <div id={`${uid}-area`} className="popover" role="dialog" aria-label="Choose an area">
              <div className="segmented segmented--3" role="tablist" aria-label="How to choose the area" style={{ marginBottom: 14 }}>
                {(
                  [
                    ['region', 'Region'],
                    ['draw', 'Draw on map'],
                    ['coords', 'Coordinates'],
                  ] as [AreaInputMode, string][]
                ).map(([mode, label]) => {
                  // The public static site has no data server, so it cannot analyse a custom shape.
                  const off = STATIC && mode !== 'region';
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={p.areaInputMode === mode}
                      aria-disabled={off || undefined}
                      disabled={off}
                      title={off ? 'Needs the full version with the data server (see the GitHub README)' : undefined}
                      className={`segmented__btn ${p.areaInputMode === mode ? 'segmented__btn--active' : ''}`}
                      onClick={() => p.onAreaInputMode(mode)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {STATIC && (
                <p className="field-hint" style={{ margin: '-6px 0 12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Online demo: pick any country or province. Drawing an area and typing coordinates work in the full version.
                </p>
              )}

              {p.areaInputMode === 'region' && (
                <div>
                  <label htmlFor={`${uid}-search`} className="field-label">
                    Search countries and provinces
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search
                      size={14}
                      aria-hidden="true"
                      style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }}
                    />
                    <input
                      id={`${uid}-search`}
                      data-autofocus
                      type="search"
                      className="field-input"
                      style={{ paddingLeft: 34 }}
                      placeholder="e.g. Basra, Corrientes, Oman"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  {query.trim().length >= 2 ? (
                    <div className="area-results" role="listbox" aria-label="Matching areas">
                      {matches.length === 0 && (
                        <p className="popover__hint">
                          No match. IGNIS covers Bahrain, Iran, Iraq, Kuwait, Oman, Qatar, Saudi Arabia, the UAE and
                          Argentina.
                        </p>
                      )}
                      {matches.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          role="option"
                          aria-selected={p.area.id === m.key}
                          className="area-row"
                          onClick={() => {
                            if (m.province) p.onSelectProvince(m.country, m.province);
                            else p.onSelectCountry(m.country);
                            setQuery('');
                            close();
                          }}
                        >
                          <span>{m.label}</span>
                          <span>{m.sub}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="field-label" style={{ marginTop: 14 }}>
                        Countries in the archive
                      </div>
                      <div className="chip-grid">
                        {p.regions.countries.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            aria-pressed={p.area.kind === 'region' && p.selectedCountryCode === c.code}
                            className={`region-chip ${
                              p.area.kind === 'region' && p.selectedCountryCode === c.code ? 'region-chip--active' : ''
                            }`}
                            onClick={() => p.onSelectCountry(c.code)}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>

                      {activeCountry && activeCountry.provinces.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <label htmlFor={`${uid}-province`} className="field-label">
                            Province / governorate in {activeCountry.name}
                          </label>
                          <select
                            id={`${uid}-province`}
                            className="field-select"
                            value={p.selectedProvinceCode}
                            onChange={(e) => p.onSelectProvince(activeCountry.code, e.target.value)}
                          >
                            <option value="">All of {activeCountry.name}</option>
                            {activeCountry.provinces.map((pr) => (
                              <option key={pr.code} value={pr.code}>
                                {pr.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {p.areaInputMode === 'draw' && (
                <div>
                  <p className="popover__hint" style={{ marginTop: 0, marginBottom: 12 }}>
                    Sketch your own area on the map. Polygon: click each corner, then press Enter or double-click to
                    finish. Rectangle and circle: click and drag.
                  </p>
                  <div className="segmented segmented--3" role="group" aria-label="Drawing shape" style={{ marginBottom: 12 }}>
                    {(['polygon', 'rectangle', 'circle'] as DrawTool[]).map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        aria-pressed={p.drawTool === tool}
                        className={`segmented__btn ${p.drawTool === tool ? 'segmented__btn--active' : ''}`}
                        style={{ textTransform: 'capitalize' }}
                        onClick={() => p.onDrawTool(tool)}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-autofocus
                    className="btn-primary-ember"
                    style={{ width: '100%' }}
                    onClick={() => {
                      p.onStartDrawing();
                      close(false);
                    }}
                  >
                    Start drawing on the map
                  </button>
                </div>
              )}

              {p.areaInputMode === 'coords' && (
                <form onSubmit={submitCoords} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label htmlFor={`${uid}-lat`} className="field-label">
                        Latitude (°N)
                      </label>
                      <input
                        id={`${uid}-lat`}
                        data-autofocus
                        inputMode="decimal"
                        className="field-input font-mono"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        aria-describedby={coordError ? `${uid}-coord-err` : undefined}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${uid}-lon`} className="field-label">
                        Longitude (°E)
                      </label>
                      <input
                        id={`${uid}-lon`}
                        inputMode="decimal"
                        className="field-input font-mono"
                        value={lon}
                        onChange={(e) => setLon(e.target.value)}
                        aria-describedby={coordError ? `${uid}-coord-err` : undefined}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`${uid}-radius`} className="field-label">
                      Radius (km, 5–600)
                    </label>
                    <input
                      id={`${uid}-radius`}
                      inputMode="decimal"
                      className="field-input font-mono"
                      value={radius}
                      onChange={(e) => setRadius(e.target.value)}
                      aria-describedby={coordError ? `${uid}-coord-err` : undefined}
                    />
                  </div>
                  {coordError && (
                    <p id={`${uid}-coord-err`} role="alert" className="field-error">
                      {coordError}
                    </p>
                  )}
                  <button type="submit" className="btn-primary-ember">
                    Analyse this circle
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* ---------------- Period ---------------- */}
        <div className="cmd-presets" role="group" aria-label="Quick periods">
          {PRESETS.map((pr) => (
            <button key={pr.id} type="button" aria-pressed={p.activePreset === pr.id} onClick={() => p.onPreset(pr.id)}>
              {pr.label}
            </button>
          ))}
        </div>

        <div className="cmd-wrap">
          <button className="cmd cmd--compact" {...triggerProps('period')} aria-label={`Period: ${fmtDateRange(p.windowFrom, p.windowTo)}`}>
            <CalendarRange size={16} className="cmd__icon" aria-hidden="true" />
            <span className="cmd__text">
              <span className="cmd__kicker">Period</span>
              <span className="cmd__value">{fmtDateRange(p.windowFrom, p.windowTo)}</span>
            </span>
            <ChevronDown size={15} className="cmd__chev" aria-hidden="true" />
          </button>

          {open === 'period' && (
            <div id={`${uid}-period`} className="popover" role="dialog" aria-label="Choose a period">
              <h3 className="popover__title">Period</h3>
              <div className="chip-grid" style={{ marginBottom: 14 }}>
                {PRESETS.map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    aria-pressed={p.activePreset === pr.id}
                    className={`region-chip ${p.activePreset === pr.id ? 'region-chip--active' : ''}`}
                    onClick={() => p.onPreset(pr.id)}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label htmlFor={`${uid}-from`} className="field-label">
                    From
                  </label>
                  <input
                    id={`${uid}-from`}
                    type="date"
                    className="field-input font-mono"
                    value={p.windowFrom}
                    min={p.archiveStart}
                    max={p.windowTo}
                    onChange={(e) => e.target.value && p.onWindow(e.target.value, p.windowTo)}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-to`} className="field-label">
                    To
                  </label>
                  <input
                    id={`${uid}-to`}
                    type="date"
                    className="field-input font-mono"
                    value={p.windowTo}
                    min={p.windowFrom}
                    max={p.latestDate}
                    onChange={(e) => e.target.value && p.onWindow(p.windowFrom, e.target.value)}
                  />
                </div>
              </div>
              <p className="popover__hint">
                The period sets the headline comparison, the map and the hotspot export. Data runs from{' '}
                {fmtDateRange(p.archiveStart, p.latestDate)}. You can also click any month in the calendar.
              </p>
            </div>
          )}
        </div>

        {/* ---------------- Baseline & display ---------------- */}
        <div className="cmd-wrap">
          <button
            className="cmd cmd--compact"
            {...triggerProps('compare')}
            aria-label={`Baseline ${p.baselineStart} to ${p.baselineEnd}, and display options`}
          >
            <SlidersHorizontal size={16} className="cmd__icon" aria-hidden="true" />
            <span className="cmd__text">
              <span className="cmd__kicker">Compared with</span>
              <span className="cmd__value">
                {p.baselineStart}–{p.baselineEnd} normal
              </span>
            </span>
            <ChevronDown size={15} className="cmd__chev" aria-hidden="true" />
          </button>

          {open === 'compare' && (
            <div id={`${uid}-compare`} className="popover" role="dialog" aria-label="Baseline and display">
              <form onSubmit={submitBaseline} noValidate>
                <h3 className="popover__title">What counts as normal</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label htmlFor={`${uid}-bs`} className="field-label">
                      First year
                    </label>
                    <input
                      id={`${uid}-bs`}
                      data-autofocus
                      type="number"
                      min={2001}
                      max={p.lastFullYear}
                      className="field-input font-mono"
                      value={bStart}
                      onChange={(e) => setBStart(e.target.value)}
                      aria-describedby={baselineError ? `${uid}-b-err` : `${uid}-b-hint`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-be`} className="field-label">
                      Last year
                    </label>
                    <input
                      id={`${uid}-be`}
                      type="number"
                      min={2001}
                      max={p.lastFullYear}
                      className="field-input font-mono"
                      value={bEnd}
                      onChange={(e) => setBEnd(e.target.value)}
                      aria-describedby={baselineError ? `${uid}-b-err` : `${uid}-b-hint`}
                    />
                  </div>
                </div>
                {baselineError ? (
                  <p id={`${uid}-b-err`} role="alert" className="field-error" style={{ marginTop: 8 }}>
                    {baselineError}
                  </p>
                ) : (
                  <p id={`${uid}-b-hint`} className="popover__hint">
                    Medians, percentiles and anomalies are measured against these years.
                  </p>
                )}
                <button type="submit" className="btn-secondary" style={{ width: '100%', marginTop: 10 }}>
                  Apply baseline
                </button>
              </form>

              <h3 className="popover__title" style={{ marginTop: 18 }}>
                Colour ramp
              </h3>
              <div className="segmented segmented--2" role="group" aria-label="Colour ramp">
                <button
                  type="button"
                  aria-pressed={p.colorRamp === 'fire'}
                  className={`segmented__btn ${p.colorRamp === 'fire' ? 'segmented__btn--active' : ''}`}
                  onClick={() => p.onColorRamp('fire')}
                >
                  Fire heat
                </button>
                <button
                  type="button"
                  aria-pressed={p.colorRamp === 'cividis'}
                  className={`segmented__btn ${p.colorRamp === 'cividis' ? 'segmented__btn--active' : ''}`}
                  onClick={() => p.onColorRamp('cividis')}
                >
                  Cividis
                </button>
              </div>
              <p className="popover__hint">Cividis is designed to read the same for colour-blind viewers.</p>
            </div>
          )}
        </div>

        {/* ---------------- Export ---------------- */}
        <div className="cmd-wrap cmd-wrap--end">
          <button className="cmd cmd--compact" {...triggerProps('export')} aria-haspopup="menu" aria-label="Export">
            <Download size={16} className="cmd__icon" aria-hidden="true" />
            <span className="cmd__text">
              <span className="cmd__kicker">Download</span>
              <span className="cmd__value">Export</span>
            </span>
            <ChevronDown size={15} className="cmd__chev" aria-hidden="true" />
          </button>

          {open === 'export' && (
            <div id={`${uid}-export`} className="popover popover--right popover--menu" role="menu" aria-label="Export">
              {(
                [
                  [p.onExportCalendarCsv, <FileSpreadsheet size={16} key="i" />, 'Calendar CSV', 'Every month since 2000'],
                  [p.onExportHotspotsCsv, <FileSpreadsheet size={16} key="i" />, 'Hotspots CSV', 'Each detection in this period'],
                  [p.onPrint, <Printer size={16} key="i" />, 'Print briefing', 'One-page summary or PDF'],
                ] as [() => void, ReactNode, string, string][]
              ).map(([fn, icon, label, sub]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    close(false);
                    fn();
                  }}
                >
                  {icon}
                  <span>
                    {label}
                    <small>{sub}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {p.children}
      {p.loading && <div className="progress-line" role="progressbar" aria-label="Loading data" />}
    </div>
  );
}

/* ----------------------------------------------------------------------------- section nav */

export interface SectionDef {
  id: string;
  label: string;
}

/** Jump chips with scroll-spy. `status` is a short data-source note shown at the right. */
export function SectionNav({
  sections,
  status,
  armed = true,
  current,
  onSelect,
}: {
  sections: SectionDef[];
  status?: ReactNode;
  /** flip to true once the section elements are in the page, so the scroll-spy can find them */
  armed?: boolean;
  /** when given, the chips are tabs: one section is shown at a time and the parent owns which */
  current?: string;
  onSelect?: (id: string) => void;
}) {
  const [spied, setActive] = useState(sections[0]?.id);
  const tabs = !!onSelect;
  const active = tabs ? current : spied;

  useEffect(() => {
    if (tabs) return;
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        // the first section (in page order) that is on screen wins
        const first = sections.find((s) => visible.has(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-150px 0px -50% 0px', threshold: [0, 0.05, 0.5] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections, armed, tabs]);

  return (
    <nav className="sectionnav" aria-label="Questions about this area">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className="sectionnav__chip"
          aria-current={active === s.id ? 'true' : undefined}
          onClick={() => {
            if (onSelect) {
              onSelect(s.id);
              return;
            }
            const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            document.getElementById(s.id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
            setActive(s.id);
          }}
        >
          {s.label}
        </button>
      ))}
      {status && <span className="sectionnav__status">{status}</span>}
    </nav>
  );
}
