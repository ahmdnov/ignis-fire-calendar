import type { SummaryResponse } from '../types';
import { fmtNum, fmtRatio, gradeColor, ordinal } from '../util';
import { HistoryStrip, SeamMini } from './Charts';
import type { TooltipState } from './Tooltip';

interface HeadlineProps {
  summary: SummaryResponse;
  onHoverTooltip: (tip: TooltipState | null) => void;
}

export function Headline({ summary, onHoverTooltip }: HeadlineProps) {
  const { headline, area, from, to, latestDate } = summary;
  const generatedStr = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return (
    <section className="bento-card" aria-labelledby="headline-area-title">
      <div className="print-only-header">
        <span>IGNIS fire briefing · generated {generatedStr}</span>
        <span>data through {latestDate} · NASA FIRMS (MODIS C6.1 + VIIRS 375 m)</span>
      </div>

      <div className="headline-split">
        <div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <h1
              id="headline-area-title"
              className="display-heading text-blur-reveal"
              style={{
                margin: 0,
                fontSize: 'clamp(1.5rem, 2.4vw, 1.85rem)',
                fontWeight: 700,
                letterSpacing: '-0.032em',
                color: 'var(--text-primary)',
                textWrap: 'balance',
              }}
            >
              {area.label}
            </h1>
            <span className={`status-badge status-badge--${headline.status}`}>
              {headline.statusLabel}
            </span>
          </div>

          <p
            style={{
              margin: '0 0 16px 0',
              fontSize: 14.5,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              maxWidth: '68ch',
            }}
          >
            {headline.sentence}
          </p>

          <div
            className="font-mono"
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginBottom: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <span>Window: {from} → {to}</span>
            <span aria-hidden="true">·</span>
            <span>Area: {fmtNum(area.areaKm2)} km²</span>
            <span aria-hidden="true">·</span>
            <span>Observed: {fmtNum(headline.currentWindowCount)} harmonized</span>
          </div>

          <div className="kpi-grid">
            <div className="kpi-tile">
              <div className="kpi-tile__label">Ratio vs. median</div>
              <div className="kpi-tile__value">{fmtRatio(headline.ratio)}</div>
              <div className="kpi-tile__sub">Median {fmtNum(headline.medianWindowCount)}</div>
            </div>
            <div className="kpi-tile">
              <div className="kpi-tile__label">Historical percentile</div>
              <div className="kpi-tile__value">{ordinal(headline.percentile)}</div>
              <div className="kpi-tile__sub">
                {summary.baselineStart}–{summary.baselineEnd} baseline
              </div>
            </div>
            <div className="kpi-tile">
              <div className="kpi-tile__label">Rank</div>
              <div className="kpi-tile__value">
                #{headline.rank} / {headline.totalYears}
              </div>
              <div className="kpi-tile__sub">Since 2001 archive</div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            background: 'var(--page)',
            border: '1px solid var(--border)',
          }}
        >
          <HistoryStrip
            points={headline.historyStrip}
            medianValue={headline.medianWindowCount}
            onHoverTooltip={onHoverTooltip}
          />
        </div>
      </div>
    </section>
  );
}

interface ReportCardProps {
  summary: SummaryResponse;
}

export function ReportCard({ summary }: ReportCardProps) {
  const { reportCard } = summary;
  const gColor = gradeColor(reportCard.grade);

  return (
    <section className="bento-card" aria-labelledby="report-card-heading">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        PER-AREA HARMONIZATION REPORT CARD
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <h3
          id="report-card-heading"
          className="section-heading text-blur-reveal"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.024em' }}
        >
          Cross-sensor calibration fit
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
          }}
        >
          GRADE · {reportCard.grade.toUpperCase()}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--page)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
            Mean annual error
          </div>
          <div className="font-mono" style={{ fontSize: 18, fontWeight: 600 }}>
            {reportCard.meanAnnualErrorPct.toFixed(1)}%
          </div>
        </div>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--page)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
            Median seam bias
          </div>
          <div className="font-mono" style={{ fontSize: 18, fontWeight: 600 }}>
            {reportCard.biasPct >= 0 ? '+' : ''}
            {reportCard.biasPct.toFixed(1)}%
          </div>
        </div>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--page)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
            Scale factors (k)
          </div>
          <div className="font-mono" style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45 }}>
            Aq {reportCard.kAqua.toFixed(2)} · Te {reportCard.kTerra.toFixed(2)}
          </div>
        </div>
      </div>

      <SeamMini seamOverlap={reportCard.seamOverlap} />
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
    {
      label: 'Kept vegetation fires',
      count: exclusions.keptVegetation,
      pct: (exclusions.keptVegetation / total) * 100,
      color: 'var(--series-2)',
    },
    {
      label: 'Gas flares',
      count: exclusions.gasFlares,
      pct: (exclusions.gasFlares / total) * 100,
      color: 'var(--excl-flare)',
    },
    {
      label: 'Static industrial',
      count: exclusions.staticIndustrial,
      pct: (exclusions.staticIndustrial / total) * 100,
      color: 'var(--excl-static)',
    },
    {
      label: 'Low confidence',
      count: exclusions.lowConfidence,
      pct: (exclusions.lowConfidence / total) * 100,
      color: 'var(--excl-lowconf)',
    },
    {
      label: 'Volcanic / thermal',
      count: exclusions.volcanic,
      pct: (exclusions.volcanic / total) * 100,
      color: 'var(--excl-volcano)',
    },
  ];

  return (
    <section className="bento-card" aria-labelledby="exclusions-heading">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        INDUSTRIAL FLARE &amp; NOISE SCREENING
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <h3
          id="exclusions-heading"
          className="section-heading text-blur-reveal"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.024em' }}
        >
          Not every hotspot is a fire
        </h3>
        <span className="font-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
          {exclusions.excludedPct}% excluded
        </span>
      </div>

      <p style={{ margin: '0 0 14px 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
        Persistent oil &amp; gas flares, refineries, and static thermal anomalies are filtered out
        using multi-year spatial persistence masks before calibration so vegetation trends stay clean.
      </p>

      {/* 5-segment horizontal stacked bar with 1px --page gaps */}
      <div
        role="img"
        aria-label={`Hotspot classification breakdown: ${exclusions.excludedPct}% excluded as non-vegetation sources`}
        style={{
          display: 'flex',
          width: '100%',
          height: 20,
          borderRadius: 6,
          overflow: 'hidden',
          gap: 1,
          background: 'var(--page)',
          marginBottom: 14,
        }}
      >
        {segments.map(
          (seg) =>
            seg.pct > 0.2 && (
              <div
                key={seg.label}
                title={`${seg.label}: ${seg.pct.toFixed(1)}% (${fmtNum(seg.count)})`}
                style={{
                  width: `${seg.pct}%`,
                  background: seg.color,
                  height: '100%',
                }}
              />
            )
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '7px 14px',
        }}
      >
        {segments.map((seg) => (
          <div
            key={seg.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              paddingBottom: 4,
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-secondary)' }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: seg.color,
                  flexShrink: 0,
                }}
              />
              {seg.label}
            </span>
            <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {seg.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
