import * as d3 from 'd3';
import type {
  AnnualTotal,
  ClimatologyMonth,
  CountryCalibrationRow,
  HistoryStripPoint,
  SeasonCurvePoint,
} from '../types';
import { fmtCompact, fmtNum } from '../util';
import type { TooltipState } from './Tooltip';

interface HistoryStripProps {
  points: HistoryStripPoint[];
  medianValue: number;
  onHoverTooltip: (tip: TooltipState | null) => void;
}

export function HistoryStrip({ points, medianValue, onHoverTooltip }: HistoryStripProps) {
  const w = 360;
  const h = 112;
  const pad = { top: 12, right: 8, bottom: 20, left: 8 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const med = Number.isFinite(medianValue) ? medianValue : 0;
  const maxV = Math.max(4, d3.max(points, (d) => d.value) || 4, med * 1.2);
  const firstYear = points[0]?.year;
  const lastYear = points[points.length - 1]?.year;
  const currentYear = points.find((d) => d.isCurrent)?.year;
  const x = d3
    .scaleBand<number>()
    .domain(points.map((d) => d.year))
    .range([0, innerW])
    .padding(0.22);
  const y = d3.scaleLinear().domain([0, maxV]).range([innerH, 0]);
  const medY = y(med);

  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
          marginBottom: 4,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>SAME DATES, EVERY YEAR</span>
        <span>MEDIAN {Number.isFinite(medianValue) ? fmtCompact(medianValue) : '—'}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <g transform={`translate(${pad.left}, ${pad.top})`}>
          <line
            x1={0}
            x2={innerW}
            y1={medY}
            y2={medY}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {points.map((d) => {
            const barH = Math.max(2, innerH - y(d.value));
            const color = d.isCurrent
              ? 'var(--accent)'
              : d.year < 2012
                ? 'var(--series-1)'
                : 'var(--series-2)';
            return (
              <rect
                key={d.year}
                x={x(d.year)}
                y={y(d.value)}
                width={x.bandwidth()}
                height={barH}
                rx={1.5}
                fill={color}
                opacity={d.isCurrent ? 1 : 0.72}
                style={{ cursor: 'pointer' }}
                onMouseMove={(e) =>
                  onHoverTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    title: `${d.year} · same dates`,
                    lines: [
                      { label: 'Hotspot-days', value: fmtNum(d.value), color },
                      { label: 'Baseline median', value: fmtNum(med) },
                    ],
                    note: d.year < 2012 ? 'MODIS era: scaled to VIIRS units' : undefined,
                  })
                }
                onMouseLeave={() => onHoverTooltip(null)}
              />
            );
          })}
          {Array.from(new Set([firstYear, 2012, currentYear ?? lastYear])).map((yr) => {
            const px = yr === undefined ? undefined : x(yr);
            if (px === undefined || yr === undefined) return null;
            return (
              <text
                key={yr}
                x={px + x.bandwidth() / 2}
                y={innerH + 14}
                textAnchor="middle"
                fontSize={9.5}
                fontFamily="var(--font-mono)"
                fill={yr === currentYear ? 'var(--accent)' : 'var(--text-muted)'}
              >
                {yr}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

interface SeasonCurveProps {
  days: SeasonCurvePoint[];
  daysOffset: number;
  /** Year drawn as the solid line. */
  year?: number;
  /** One-line reading of the curve, when the data source provides it. */
  note?: string;
  onHoverTooltip: (tip: TooltipState | null) => void;
}

export function SeasonCurve({ days, daysOffset, year, note, onHoverTooltip }: SeasonCurveProps) {
  const yearLabel = year ? String(year) : 'This year';
  const w = 540;
  const h = 230;
  const m = { top: 14, right: 16, bottom: 26, left: 48 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;

  const maxY = Math.max(
    10,
    d3.max(days, (d) => Math.max(d.p90, d.current ?? 0)) || 100
  );
  const x = d3.scaleLinear().domain([1, 365]).range([0, iw]);
  const y = d3.scaleLinear().domain([0, maxY * 1.05]).range([ih, 0]);

  const areaGen = d3
    .area<SeasonCurvePoint>()
    .x((d) => x(d.doy))
    .y0((d) => y(d.p10))
    .y1((d) => y(d.p90))
    .curve(d3.curveMonotoneX);

  const medLine = d3
    .line<SeasonCurvePoint>()
    .x((d) => x(d.doy))
    .y((d) => y(d.median))
    .curve(d3.curveMonotoneX);

  const currDays = days.filter((d) => d.current !== null);
  const currLine = d3
    .line<SeasonCurvePoint>()
    .x((d) => x(d.doy))
    .y((d) => y(d.current || 0))
    .curve(d3.curveMonotoneX);

  const yTicks = y.ticks(4);
  const offsetText = note
    ? note
    : daysOffset > 2
      ? `${daysOffset} days ahead of typical season`
      : daysOffset < -2
        ? `${Math.abs(daysOffset)} days behind typical season`
        : 'Tracking typical seasonal pace';

  return (
    <div className="bento-card">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        CUMULATIVE HOTSPOT-DAYS THROUGH THE YEAR
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <h3
          className="section-heading text-blur-reveal"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.024em' }}
        >
          {yearLabel} against a normal year
        </h3>
        <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--accent)' }}>
          {offsetText}
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <g transform={`translate(${m.left}, ${m.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text
                x={-8}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill="var(--axis)"
              >
                {fmtCompact(t)}
              </text>
            </g>
          ))}

          <path d={areaGen(days) || ''} fill="var(--series-1)" opacity={0.14} />
          <path
            d={medLine(days) || ''}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <path d={currLine(currDays) || ''} fill="none" stroke="var(--series-2)" strokeWidth={2.5} />

          {currDays.map((pt, idx) =>
            idx % 4 === 0 || idx === currDays.length - 1 ? (
              <circle
                key={pt.doy}
                cx={x(pt.doy)}
                cy={y(pt.current || 0)}
                r={3.5}
                fill="var(--series-2)"
                stroke="var(--page)"
                strokeWidth={1.2}
                style={{ cursor: 'pointer' }}
                onMouseMove={(e) =>
                  onHoverTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    title: `${pt.dateLabel} (DOY ${pt.doy})`,
                    lines: [
                      {
                        label: `${yearLabel} so far`,
                        value: fmtNum(pt.current || 0),
                        color: 'var(--series-2)',
                      },
                      {
                        label: 'Historical median',
                        value: fmtNum(pt.median),
                        color: 'var(--series-1)',
                      },
                      {
                        label: '10th–90th band',
                        value: `${fmtCompact(pt.p10)}–${fmtCompact(pt.p90)}`,
                      },
                    ],
                  })
                }
                onMouseLeave={() => onHoverTooltip(null)}
              />
            ) : null
          )}

          {[
            { doy: 1, label: 'Jan' },
            { doy: 91, label: 'Apr' },
            { doy: 182, label: 'Jul' },
            { doy: 274, label: 'Oct' },
            { doy: 365, label: 'Dec' },
          ].map((tk) => (
            <text
              key={tk.label}
              x={x(tk.doy)}
              y={ih + 18}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--axis)"
            >
              {tk.label}
            </text>
          ))}
        </g>
      </svg>

      <div
        className="font-mono"
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          fontSize: 10.5,
          color: 'var(--text-muted)',
        }}
      >
        <span>
          <strong style={{ color: 'var(--series-2)' }}>━━</strong> {yearLabel} cumulative
        </span>
        <span>
          <strong style={{ color: 'var(--series-1)' }}>╌╌</strong> Normal year (median)
        </span>
        <span>
          <strong style={{ color: 'var(--series-1)', opacity: 0.55 }}>■</strong> 8 of every 10 past years
        </span>
      </div>
    </div>
  );
}

interface AnnualChartProps {
  annual: AnnualTotal[];
  trend: {
    slopePctPerYear: number;
    pValue: number;
    significant: boolean;
    direction: string;
  };
  onHoverTooltip: (tip: TooltipState | null) => void;
}

export function AnnualChart({ annual, trend, onHoverTooltip }: AnnualChartProps) {
  const w = 540;
  const h = 230;
  const m = { top: 14, right: 16, bottom: 26, left: 48 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;

  const fullYears = annual.filter((a) => a.year >= 2001);
  const maxY = Math.max(10, d3.max(fullYears, (d) => d.cvUpper) || 100);
  const x = d3
    .scaleBand<number>()
    .domain(fullYears.map((d) => d.year))
    .range([0, iw])
    .padding(0.24);
  const y = d3.scaleLinear().domain([0, maxY * 1.08]).range([ih, 0]);
  const yTicks = y.ticks(4);

  // Trend line from first to last year
  const midVal = d3.median(fullYears, (d) => d.harmonized) || 100;
  const slopePerYr = (midVal * trend.slopePctPerYear) / 100;
  const meanIdx = (fullYears.length - 1) / 2;
  const y0 = Math.max(0, midVal - slopePerYr * meanIdx);
  const y1 = Math.max(0, midVal + slopePerYr * meanIdx);

  return (
    <div className="bento-card">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        LONG-TERM TRAJECTORY ({fullYears[0]?.year}–{fullYears[fullYears.length - 1]?.year})
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <h3
          className="section-heading text-blur-reveal"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.024em' }}
        >
          Annual totals &amp; trend
        </h3>
        <span
          className="font-mono"
          style={{
            fontSize: 11.5,
            color: trend.significant ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          {trend.slopePctPerYear >= 0 ? '+' : ''}
          {trend.slopePctPerYear.toFixed(1)}% per year · {trend.pValue < 0.001 ? 'p < 0.001' : `p = ${trend.pValue.toFixed(3)}`}
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <g transform={`translate(${m.left}, ${m.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text
                x={-8}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill="var(--axis)"
              >
                {fmtCompact(t)}
              </text>
            </g>
          ))}

          {fullYears.map((d) => {
            const bx = x(d.year) || 0;
            const bw = x.bandwidth();
            const color = d.sensorEra === 'MODIS' ? 'var(--series-1)' : 'var(--series-2)';
            return (
              <g key={d.year}>
                <rect
                  x={bx}
                  y={y(d.harmonized)}
                  width={bw}
                  height={Math.max(2, ih - y(d.harmonized))}
                  rx={2}
                  fill={color}
                  opacity={d.provisional ? 0.65 : 0.88}
                  style={{ cursor: 'pointer' }}
                  onMouseMove={(e) =>
                    onHoverTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      title: `${d.year} (${d.sensorEra} era)`,
                      lines: [
                        { label: 'Harmonized total', value: fmtNum(d.harmonized), color },
                        { label: 'Raw archive', value: fmtNum(d.raw) },
                        {
                          label: 'CV interval',
                          value: `${fmtCompact(d.cvLower)}–${fmtCompact(d.cvUpper)}`,
                        },
                      ],
                      note: d.provisional ? 'Year not complete yet' : undefined,
                    })
                  }
                  onMouseLeave={() => onHoverTooltip(null)}
                />
                {d.sensorEra === 'MODIS' && (
                  <line
                    x1={bx + bw / 2}
                    x2={bx + bw / 2}
                    y1={y(d.cvUpper)}
                    y2={y(d.cvLower)}
                    stroke="var(--text-primary)"
                    strokeWidth={1.1}
                    opacity={0.7}
                  />
                )}
              </g>
            );
          })}

          {/* Theil-Sen Trend Line */}
          <line
            x1={(x(fullYears[0].year) || 0) + x.bandwidth() / 2}
            x2={(x(fullYears[fullYears.length - 1].year) || 0) + x.bandwidth() / 2}
            y1={y(y0)}
            y2={y(y1)}
            stroke="var(--accent)"
            strokeWidth={1.8}
            strokeDasharray="5 3"
          />

          {Array.from(new Set([2001, 2006, 2012, 2018, fullYears[fullYears.length - 1]?.year ?? 2025])).map((yr) => {
            const px = x(yr);
            if (px === undefined) return null;
            return (
              <text
                key={yr}
                x={px + x.bandwidth() / 2}
                y={ih + 18}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill={yr === 2012 ? 'var(--accent)' : 'var(--axis)'}
              >
                {yr}
              </text>
            );
          })}
        </g>
      </svg>

      <div
        className="font-mono"
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          fontSize: 10.5,
          color: 'var(--text-muted)',
        }}
      >
        <span>
          <strong style={{ color: 'var(--series-1)' }}>■</strong> MODIS era (scaled) with error whiskers
        </span>
        <span>
          <strong style={{ color: 'var(--series-2)' }}>■</strong> VIIRS era
        </span>
        <span>
          <strong style={{ color: 'var(--accent)' }}>╌╌</strong> Trend (Theil–Sen)
        </span>
      </div>

    </div>
  );
}

interface ClimatologyProps {
  months: ClimatologyMonth[];
  baselineStart: number;
  baselineEnd: number;
  /** Year shown as dots on top of the normal range. */
  year?: number;
  onHoverTooltip: (tip: TooltipState | null) => void;
}

export function Climatology({
  months,
  baselineStart,
  baselineEnd,
  year,
  onHoverTooltip,
}: ClimatologyProps) {
  const yearLabel = year ? String(year) : 'latest year';
  const w = 540;
  const h = 230;
  const m = { top: 14, right: 16, bottom: 26, left: 48 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;

  const maxY = Math.max(
    10,
    d3.max(months, (d) => Math.max(d.p90, d.currentYear ?? 0)) || 100
  );
  const x = d3
    .scaleBand<string>()
    .domain(months.map((d) => d.label))
    .range([0, iw])
    .padding(0.32);
  const y = d3.scaleLinear().domain([0, maxY * 1.08]).range([ih, 0]);
  const yTicks = y.ticks(4);

  return (
    <div className="bento-card">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        NORMAL RANGE FOR EACH MONTH ({baselineStart}–{baselineEnd})
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <h3
          className="section-heading text-blur-reveal"
          style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.024em' }}
        >
          The normal fire season, and {yearLabel}
        </h3>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          box = middle half of years · whiskers = 10–90% · dot = {yearLabel}
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <g transform={`translate(${m.left}, ${m.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text
                x={-8}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill="var(--axis)"
              >
                {fmtCompact(t)}
              </text>
            </g>
          ))}

          {months.map((d) => {
            const bx = x(d.label) || 0;
            const bw = x.bandwidth();
            const cx = bx + bw / 2;
            return (
              <g
                key={d.month}
                style={{ cursor: 'pointer' }}
                onMouseMove={(e) =>
                  onHoverTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    title: `${d.label} climatology`,
                    lines: [
                      {
                        label: `${yearLabel} observed`,
                        value: d.currentYear !== null ? fmtNum(d.currentYear) : '—',
                        color: 'var(--series-2)',
                      },
                      { label: 'Median (50th)', value: fmtNum(d.median), color: 'var(--series-1)' },
                      { label: 'IQR (25th–75th)', value: `${fmtCompact(d.p25)}–${fmtCompact(d.p75)}` },
                      { label: '10th–90th pct', value: `${fmtCompact(d.p10)}–${fmtCompact(d.p90)}` },
                    ],
                  })
                }
                onMouseLeave={() => onHoverTooltip(null)}
              >
                <line
                  x1={cx}
                  x2={cx}
                  y1={y(d.p90)}
                  y2={y(d.p10)}
                  stroke="var(--text-muted)"
                  strokeWidth={1.3}
                />
                <rect
                  x={bx}
                  y={y(d.p75)}
                  width={bw}
                  height={Math.max(2, y(d.p25) - y(d.p75))}
                  rx={3}
                  fill="var(--series-1)"
                  opacity={0.34}
                  stroke="var(--series-1)"
                  strokeWidth={1}
                />
                <line
                  x1={bx}
                  x2={bx + bw}
                  y1={y(d.median)}
                  y2={y(d.median)}
                  stroke="var(--series-1)"
                  strokeWidth={2}
                />
                {d.currentYear !== null && (
                  <circle
                    cx={cx}
                    cy={y(d.currentYear)}
                    r={4.2}
                    fill="var(--series-2)"
                    stroke="var(--page)"
                    strokeWidth={1.4}
                  />
                )}
              </g>
            );
          })}

          {months.map((d) => (
            <text
              key={d.month}
              x={(x(d.label) || 0) + x.bandwidth() / 2}
              y={ih + 18}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--axis)"
            >
              {d.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}

interface SeamMiniProps {
  seamOverlap: { year: number; modisHarmonized: number; viirsSnpp: number }[];
}

export function SeamMini({ seamOverlap }: SeamMiniProps) {
  const w = 360;
  const h = 128;
  const m = { top: 10, right: 8, bottom: 22, left: 42 };
  const iw = w - m.left - m.right;
  const ih = h - m.top - m.bottom;

  const maxY = Math.max(
    10,
    d3.max(seamOverlap, (d) => Math.max(d.modisHarmonized, d.viirsSnpp)) || 100
  );
  const x0 = d3
    .scaleBand<number>()
    .domain(seamOverlap.map((d) => d.year))
    .range([0, iw])
    .padding(0.24);
  const x1 = d3.scaleBand().domain(['modis', 'viirs']).range([0, x0.bandwidth()]).padding(0.12);
  const y = d3.scaleLinear().domain([0, maxY * 1.1]).range([ih, 0]);

  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 10.5,
          color: 'var(--text-muted)',
          marginBottom: 4,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>OVERLAP SEAM CHECK (2012–2017)</span>
        <span>
          <span style={{ color: 'var(--series-1)' }}>■ MODIS est.</span> vs{' '}
          <span style={{ color: 'var(--series-2)' }}>■ VIIRS S-NPP</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <g transform={`translate(${m.left}, ${m.top})`}>
          {y.ticks(3).map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text
                x={-6}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize={9.5}
                fontFamily="var(--font-mono)"
                fill="var(--axis)"
              >
                {fmtCompact(t)}
              </text>
            </g>
          ))}
          {seamOverlap.map((d) => {
            const gx = x0(d.year) || 0;
            return (
              <g key={d.year} transform={`translate(${gx}, 0)`}>
                <rect
                  x={x1('modis')}
                  y={y(d.modisHarmonized)}
                  width={x1.bandwidth()}
                  height={Math.max(1, ih - y(d.modisHarmonized))}
                  rx={1.5}
                  fill="var(--series-1)"
                />
                <rect
                  x={x1('viirs')}
                  y={y(d.viirsSnpp)}
                  width={x1.bandwidth()}
                  height={Math.max(1, ih - y(d.viirsSnpp))}
                  rx={1.5}
                  fill="var(--series-2)"
                />
                <text
                  x={x0.bandwidth() / 2}
                  y={ih + 14}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontFamily="var(--font-mono)"
                  fill="var(--axis)"
                >
                  {d.year}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

interface SeamSmallMultiplesProps {
  countries: CountryCalibrationRow[];
}

export function SeamSmallMultiples({ countries }: SeamSmallMultiplesProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14,
      }}
    >
      {countries.map((c) => {
        const w = 260;
        const h = 132;
        const m = { top: 14, right: 10, bottom: 22, left: 38 };
        const iw = w - m.left - m.right;
        const ih = h - m.top - m.bottom;

        const maxY = Math.max(
          10,
          d3.max(c.seamSeries, (d) => Math.max(d.modisHarmonized, d.viirsSnpp)) || 100
        );
        const x = d3.scaleLinear().domain([2012, 2025]).range([0, iw]);
        const y = d3.scaleLinear().domain([0, maxY * 1.12]).range([ih, 0]);

        const modisLine = d3
          .line<(typeof c.seamSeries)[0]>()
          .x((d) => x(d.year))
          .y((d) => y(d.modisHarmonized));

        const viirsLine = d3
          .line<(typeof c.seamSeries)[0]>()
          .x((d) => x(d.year))
          .y((d) => y(d.viirsSnpp));

        return (
          <div key={c.iso3} className="bento-card" style={{ padding: '14px 16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 6,
              }}
            >
              <strong style={{ fontSize: 13 }}>{c.name}</strong>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                CV {c.cvAnnualErrorPct.toFixed(1)}%
              </span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              <g transform={`translate(${m.left}, ${m.top})`}>
                {/* 2012-2017 v6.2 calibration window */}
                <rect
                  x={x(2012)}
                  y={0}
                  width={x(2017) - x(2012)}
                  height={ih}
                  fill="var(--accent)"
                  opacity={0.09}
                />
                {/* 2018 MODIS version shift marker */}
                <line
                  x1={x(2018)}
                  x2={x(2018)}
                  y1={0}
                  y2={ih}
                  stroke="var(--text-muted)"
                  strokeDasharray="2 2"
                />
                {y.ticks(3).map((t) => (
                  <g key={t}>
                    <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
                    <text
                      x={-5}
                      y={y(t) + 3}
                      textAnchor="end"
                      fontSize={9}
                      fontFamily="var(--font-mono)"
                      fill="var(--axis)"
                    >
                      {fmtCompact(t)}
                    </text>
                  </g>
                ))}
                <path
                  d={viirsLine(c.seamSeries) || ''}
                  fill="none"
                  stroke="var(--series-2)"
                  strokeWidth={2}
                />
                <path
                  d={modisLine(c.seamSeries) || ''}
                  fill="none"
                  stroke="var(--series-1)"
                  strokeWidth={1.8}
                  strokeDasharray="4 2"
                />
                {[2012, 2018, 2025].map((yr) => (
                  <text
                    key={yr}
                    x={x(yr)}
                    y={ih + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fontFamily="var(--font-mono)"
                    fill="var(--axis)"
                  >
                    {yr}
                  </text>
                ))}
              </g>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
