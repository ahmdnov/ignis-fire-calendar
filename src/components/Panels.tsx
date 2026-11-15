import type { SummaryResponse } from '../types';
import { fmtDate, fmtDateRange, fmtNum, fmtRatio, gradeColor, ordinal } from '../util';
import { HistoryStrip, SeamMini } from './Charts';
import { Rich } from './Story';
import type { Part } from '../insights';
import type { TooltipState } from './Tooltip';

interface HeadlineProps {
  summary: SummaryResponse;
  onHoverTooltip: (tip: TooltipState | null) => void;
  /** chapter question shown above the area name */
  question?: string;
  /** one line that puts the numbers in context */
  meaning?: Part[];
}

const dash = (v: number, fmt: (n: number) => string) => (Number.isFinite(v) ? fmt(v) : '—');

/** The answer, first: is this area burning more or less than normal for these dates? */
export function Headline({ summary, onHoverTooltip, question, meaning }: HeadlineProps) {
  const { headline, area, from, to, latestDate } = summary;
  const generatedStr = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const covered = summary.coverage !== false;

  return (
    <section className="bento-card headline-card" aria-labelledby="headline-area-title">
      <div className="print-only-header">
        <span>IGNIS fire briefing · generated {generatedStr}</span>
        <span>data through {latestDate} · NASA FIRMS (MODIS + VIIRS 375 m), harmonized</span>
      </div>

      <div className="headline-split" style={covered ? undefined : { gridTemplateColumns: '1fr' }}>
        <div>
          <div className="section-kicker" style={{ marginBottom: 8 }}>
            {question ? `${question.toUpperCase()} · ` : ''}
            {fmtDateRange(from, to)}
            {summary.isFallback ? ' · OFFLINE SAMPLE, NOT REAL READINGS' : ''}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <h1
              id="headline-area-title"
              className="display-heading"
              style={{
                margin: 0,
                fontSize: 'clamp(1.6rem, 2.6vw, 2.1rem)',
                fontWeight: 700,
                letterSpacing: '-0.032em',
                color: 'var(--text-primary)',
                textWrap: 'balance',
              }}
            >
              {area.label}
            </h1>
            <span className={`status-badge status-badge--${headline.status}`}>{headline.statusLabel}</span>
          </div>

          {/* The plain-language "meaning" line replaces the long statistical sentence when there is one. */}
          {!(meaning && meaning.length > 0) && (
            <p
              style={{
                margin: '0 0 18px 0',
                fontSize: 15,
                lineHeight: 1.62,
                color: 'var(--text-secondary)',
                maxWidth: '70ch',
              }}
            >
              {headline.sentence}
            </p>
          )}

          {meaning && meaning.length > 0 && (
            <p className="headline__meaning">
              <span className="headline__meaning-label">What this means</span>
              <span>
                <Rich parts={meaning} />
              </span>
            </p>
          )}

          {covered && (
            <div className="kpi-grid">
              <div className="kpi-tile">
                <div className="kpi-tile__label">Vs. normal</div>
                <div className="kpi-tile__value">{dash(headline.ratio, fmtRatio)}</div>
                <div className="kpi-tile__sub">
                  {dash(headline.currentWindowCount, (n) => fmtNum(n))} vs usual {dash(headline.medianWindowCount, (n) => fmtNum(n))}
                </div>
              </div>
              <div className="kpi-tile">
                <div className="kpi-tile__label">Percentile</div>
                <div className="kpi-tile__value">{dash(headline.percentile, (n) => ordinal(Math.round(n)))}</div>
                <div className="kpi-tile__sub">vs {headline.baselineSpan || `${summary.baselineStart}–${summary.baselineEnd}`}</div>
              </div>
              <div className="kpi-tile">
                <div className="kpi-tile__label">Rank</div>
                <div className="kpi-tile__value">
                  {Number.isFinite(headline.rank) ? `#${headline.rank}` : '—'}
                </div>
                <div className="kpi-tile__sub">of {headline.totalYears} years</div>
              </div>
            </div>
          )}

          {covered && !(meaning && meaning.length > 0) && (
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 14,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px 10px',
              }}
            >
              <span>{dash(headline.currentWindowCount, (n) => fmtNum(n))} harmonized hotspot-days</span>
              <span aria-hidden="true">·</span>
              <span>area {fmtNum(area.areaKm2)} km²</span>
              <span aria-hidden="true">·</span>
              <span>archive through {fmtDate(latestDate)}</span>
            </div>
          )}
        </div>

        {covered && headline.historyStrip.length > 0 && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--page) 70%, transparent)',
              border: '1px solid var(--border)',
            }}
          >
            <HistoryStrip
              points={headline.historyStrip}
              medianValue={headline.medianWindowCount}
              onHoverTooltip={onHoverTooltip}
            />
          </div>
        )}
      </div>
    </section>
  );
}

interface ReportCardProps {
  summary: SummaryResponse;
}

const GRADE_TEXT: Record<string, string> = {
  Good: 'Before 2012, the scaled MODIS record closely matches what VIIRS would have seen here.',
  Fair: 'Before 2012, values are usable for trends and seasons, with moderate year-to-year error.',
  Poor: 'MODIS missed many of the small fires here, so values before 2012 are unreliable.',
  Insufficient: 'Too few fires in 2012–2017 to test the method here. Treat values before 2012 as indicative.',
};

const GRADE_ICON: Record<string, string> = { Good: '✓', Fair: '~', Poor: '!', Insufficient: '?' };

export function ReportCard({ summary }: ReportCardProps) {
  const { reportCard } = summary;
  const gColor = gradeColor(reportCard.grade);
  const pct = (v: number, signed = false) =>
    Number.isFinite(v) ? `${signed && v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—';
  const k = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');

  const tile = {
    padding: '12px 14px',
    borderRadius: 12,
    background: 'var(--page)',
    border: '1px solid var(--border)',
  } as const;

  return (
    <section className="bento-card" aria-labelledby="report-card-heading">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        CAN YOU TRUST THE YEARS BEFORE 2012 HERE?
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <h3
          id="report-card-heading"
          className="section-heading"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.024em' }}
        >
          Harmonization report card
        </h3>
        <span
          className="font-mono"
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            color: gColor,
            background: `color-mix(in srgb, ${gColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${gColor} 35%, transparent)`,
            whiteSpace: 'nowrap',
          }}
        >
          {GRADE_ICON[reportCard.grade] || '?'} {reportCard.grade.toUpperCase()}
        </span>
      </div>

      <p style={{ margin: '0 0 14px 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        {GRADE_TEXT[reportCard.grade] || GRADE_TEXT.Insufficient}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={tile}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Yearly error</div>
          <div className="font-mono" style={{ fontSize: 18, fontWeight: 600 }}>
            {pct(reportCard.meanAnnualErrorPct)}
          </div>
        </div>
        <div style={tile}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Bias</div>
          <div className="font-mono" style={{ fontSize: 18, fontWeight: 600 }}>
            {pct(reportCard.biasPct, true)}
          </div>
        </div>
        <div style={tile}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>MODIS → VIIRS factor</div>
          <div className="font-mono" style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45 }}>
            Aqua ×{k(reportCard.kAqua)}
            <br />
            Terra ×{k(reportCard.kTerra)}
          </div>
        </div>
      </div>

      {reportCard.seamOverlap.length > 0 && <SeamMini seamOverlap={reportCard.seamOverlap} />}
    </section>
  );
}

interface ExclusionsCardProps {
  summary: SummaryResponse;
}

export function ExclusionsCard({ summary }: ExclusionsCardProps) {
  const { exclusions } = summary;
  const total = Math.max(1, exclusions.totalRaw);

  const segments = [
    { label: 'Kept: vegetation fires', count: exclusions.keptVegetation, color: 'var(--series-2)' },
    { label: 'Industry & gas flares (NASA type flag)', count: exclusions.gasFlares, color: 'var(--excl-flare)' },
    { label: 'Always-hot cells (60+ days, 6+ years)', count: exclusions.staticIndustrial, color: 'var(--excl-static)' },
    { label: 'Low confidence', count: exclusions.lowConfidence, color: 'var(--excl-lowconf)' },
    { label: 'Volcano / offshore', count: exclusions.volcanic, color: 'var(--excl-volcano)' },
  ].map((s) => ({ ...s, pct: (s.count / total) * 100 }));

  return (
    <section className="bento-card" aria-labelledby="exclusions-heading">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        WHAT WAS SCREENED OUT · {fmtDateRange(summary.from, summary.to)}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <h3
          id="exclusions-heading"
          className="section-heading"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.024em' }}
        >
          Not every hotspot is a fire
        </h3>
        <span className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
          {exclusions.totalRaw > 0 ? `${exclusions.excludedPct}% excluded` : 'no detections'}
        </span>
      </div>

      <p style={{ margin: '0 0 14px 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', maxWidth: '86ch' }}>
        Satellites also see gas flares, refineries and other hot industry. Of {fmtNum(exclusions.totalRaw)} raw
        detections in this area and period, {fmtNum(exclusions.keptVegetation)} are counted as vegetation fire. The
        rest are removed before any counting, so oil fields do not look like wildfires.
      </p>

      <div
        role="img"
        aria-label={`Of ${fmtNum(exclusions.totalRaw)} detections, ${exclusions.excludedPct}% were excluded as not vegetation fire`}
        style={{
          display: 'flex',
          width: '100%',
          height: 20,
          borderRadius: 6,
          overflow: 'hidden',
          gap: 2,
          background: 'var(--surface-1)',
          marginBottom: 14,
        }}
      >
        {segments.map(
          (seg) =>
            seg.pct > 0.2 && (
              <div
                key={seg.label}
                title={`${seg.label}: ${seg.pct.toFixed(1)}% (${fmtNum(seg.count)})`}
                style={{ width: `${seg.pct}%`, background: seg.color, height: '100%' }}
              />
            )
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '7px 28px',
        }}
      >
        {segments.map((seg) => (
          <div
            key={seg.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              fontSize: 12.5,
              paddingBottom: 5,
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
              {seg.label}
            </span>
            <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {seg.pct.toFixed(1)}% · {fmtNum(seg.count)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
