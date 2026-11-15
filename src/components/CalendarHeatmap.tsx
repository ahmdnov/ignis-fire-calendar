import { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Calendar, Table2 } from 'lucide-react';
import type {
  CalendarCell,
  CalendarViewMode,
  ColorRampId,
  SummaryResponse,
  ThemeMode,
} from '../types';
import {
  CIVIDIS_STOPS,
  FIRE_STOPS,
  fireColor,
  fmtCompact,
  fmtNum,
  MONTH_FULL,
  MONTH_NAMES,
  rampGradientCss,
} from '../util';
import type { TooltipState } from './Tooltip';

interface CalendarHeatmapProps {
  summary: SummaryResponse;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  colorRamp: ColorRampId;
  theme: ThemeMode;
  selectedMonthKey: string | null;
  onSelectMonth: (year: number, month: number) => void;
  onHoverTooltip: (tip: TooltipState | null) => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export function CalendarHeatmap({
  summary,
  viewMode,
  onViewModeChange,
  colorRamp,
  theme,
  selectedMonthKey,
  onSelectMonth,
  onHoverTooltip,
  svgRef,
}: CalendarHeatmapProps) {
  const [displayMode, setDisplayMode] = useState<'chart' | 'table'>('chart');
  const [focusedCoord, setFocusedCoord] = useState<{ year: number; month: number } | null>(null);
  const internalSvgRef = useRef<SVGSVGElement | null>(null);
  const resolvedSvgRef = svgRef || internalSvgRef;

  const years = summary.calendar.years;
  const cellMap = useMemo(() => {
    const map = new Map<string, CalendarCell>();
    for (const c of summary.calendar.cells) {
      map.set(`${c.year}-${c.month}`, c);
    }
    return map;
  }, [summary.calendar.cells]);

  const annualMap = useMemo(() => {
    const map = new Map<number, (typeof summary.calendar.annual)[0]>();
    for (const a of summary.calendar.annual) {
      map.set(a.year, a);
    }
    return map;
  }, [summary.calendar.annual]);

  const { maxVal, maxAnnual, colorScale } = useMemo(() => {
    const values = summary.calendar.cells.map((c) =>
      viewMode === 'raw' ? c.raw : c.harmonized
    );
    const maxV = Math.max(10, d3.quantile(values.slice().sort((a, b) => a - b), 0.98) || d3.max(values) || 100);
    const maxA = Math.max(
      10,
      d3.max(summary.calendar.annual, (a) => (viewMode === 'raw' ? a.raw : a.harmonized)) || 100
    );

    if (viewMode === 'anom') {
      // smoke-blue (below normal) <- neutral -> ember (above normal); same values as the CSS tokens
      const divCool = theme === 'light' ? '#4B6A8C' : '#8DA2BE';
      const divMid = theme === 'light' ? '#E7E2DA' : '#26211D';
      const divWarm = theme === 'light' ? '#C2410C' : '#F4631E';
      const scale = d3
        .scaleLinear<string>()
        .domain([-2.5, 0, 2.5])
        .range([divCool, divMid, divWarm])
        .clamp(true);
      return { maxVal: maxV, maxAnnual: maxA, colorScale: (c: CalendarCell) => scale(c.zScore) };
    }

    const interpolator =
      colorRamp === 'cividis' ? d3.interpolateCividis : (t: number) => fireColor(t, theme);

    // Square-root scale: fire counts are skewed, so a linear scale would paint most months the same.
    const scale = d3.scaleSequentialSqrt(interpolator).domain([0, maxV]).clamp(true);
    return {
      maxVal: maxV,
      maxAnnual: maxA,
      colorScale: (c: CalendarCell) => {
        const val = viewMode === 'raw' ? c.raw : c.harmonized;
        if (val <= 0) return 'var(--empty-cell)';
        return scale(val);
      },
    };
  }, [summary.calendar.cells, summary.calendar.annual, viewMode, colorRamp, theme]);

  // SVG Layout Geometry
  const margin = { top: 28, right: 16, bottom: 26, left: 52 };
  const cellW = 46;
  const cellH = 21;
  const gap = 2;
  const gridW = 12 * (cellW + gap) - gap;
  const annualGap = 20;
  const annualBarMaxW = 135;
  const svgW = margin.left + gridW + annualGap + annualBarMaxW + margin.right + 56;
  const svgH = margin.top + years.length * (cellH + gap) + margin.bottom;

  const latestYear = years[years.length - 1];
  const latestMonth = summary.calendar.cells.reduce(
    (m, c) => (c.year === latestYear && c.month > m ? c.month : m),
    1
  );
  const idx2012 = years.indexOf(2012);
  const cliffY = idx2012 > 0 ? margin.top + idx2012 * (cellH + gap) - gap / 2 : null;

  const handleCellKeyDown = (e: React.KeyboardEvent<SVGRectElement>, year: number, month: number) => {
    const yIdx = years.indexOf(year);
    let nextYear = year;
    let nextMonth = month;
    if (e.key === 'ArrowRight') nextMonth = Math.min(12, month + 1);
    else if (e.key === 'ArrowLeft') nextMonth = Math.max(1, month - 1);
    else if (e.key === 'ArrowDown') nextYear = years[Math.min(years.length - 1, yIdx + 1)];
    else if (e.key === 'ArrowUp') nextYear = years[Math.max(0, yIdx - 1)];
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectMonth(year, month);
      return;
    } else {
      return;
    }

    e.preventDefault();
    setFocusedCoord({ year: nextYear, month: nextMonth });
    const nextEl = resolvedSvgRef.current?.querySelector<SVGRectElement>(
      `[data-cell="${nextYear}-${nextMonth}"]`
    );
    nextEl?.focus();
  };

  return (
    <section className="bento-card" aria-labelledby="calendar-heatmap-heading">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div className="section-kicker" style={{ marginBottom: 4 }}>
            BURNING CALENDAR {years[0]}–{latestYear} · {summary.area.label}
          </div>
          <h2
            id="calendar-heatmap-heading"
            className="section-heading text-blur-reveal"
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Every month since {years[0]}, on one scale
          </h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <div className="segmented segmented--3" role="group" aria-label="Calendar metric mode">
            <button
              type="button"
              onClick={() => onViewModeChange('harm')}
              className={`segmented__btn ${viewMode === 'harm' ? 'segmented__btn--ember' : ''}`}
            >
              Harmonized
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('raw')}
              className={`segmented__btn ${viewMode === 'raw' ? 'segmented__btn--ember' : ''}`}
            >
              Raw (before)
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('anom')}
              className={`segmented__btn ${viewMode === 'anom' ? 'segmented__btn--ember' : ''}`}
            >
              Anomaly
            </button>
          </div>

          <div className="segmented segmented--2" role="group" aria-label="Calendar display view">
            <button
              type="button"
              onClick={() => setDisplayMode('chart')}
              className={`segmented__btn ${displayMode === 'chart' ? 'segmented__btn--active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Calendar size={13} />
              Chart
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('table')}
              className={`segmented__btn ${displayMode === 'table' ? 'segmented__btn--active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Table2 size={13} />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Mode Explanation + Color Scale Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          {viewMode === 'harm' &&
            'Vegetation-fire hotspot-days in VIIRS units: industry and gas flares removed, MODIS years (before 2012) scaled per country and month. Click a month to see it on the map.'}
          {viewMode === 'raw' &&
            'Every raw detection from every satellite, industry and flares included. The jump at 2012 is the sensor change, not more fire.'}
          {viewMode === 'anom' &&
            `How far each month sits from its own ${summary.baselineStart}–${summary.baselineEnd} normal, in standard deviations.`}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {viewMode === 'anom' ? '-2.5σ' : '0'}
          </span>
          <div
            aria-hidden="true"
            style={{
              width: 112,
              height: 10,
              borderRadius: 4,
              border: '1px solid var(--border)',
              background:
                viewMode === 'anom'
                  ? `linear-gradient(90deg, var(--div-cool), var(--neutral-mid), var(--div-warm))`
                  : rampGradientCss(colorRamp === 'cividis' ? CIVIDIS_STOPS : FIRE_STOPS[theme]),
            }}
          />
          <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {viewMode === 'anom' ? '+2.5σ' : fmtCompact(maxVal)}
          </span>
        </div>
      </div>

      {displayMode === 'chart' ? (
        <div style={{ width: '100%', overflowX: 'auto' }} tabIndex={-1}>
          <svg
            ref={resolvedSvgRef}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ width: '100%', minWidth: 680, height: 'auto', display: 'block' }}
            role="grid"
            aria-label={`Fire calendar heatmap, ${years[0]} to ${latestYear}, for ${summary.area.label}`}
          >
            <defs>
              <pattern
                id="ignis-hatch"
                width="6"
                height="6"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="var(--text-primary)"
                  strokeOpacity={0.4}
                  strokeWidth="1.5"
                />
              </pattern>
            </defs>

            {/* Month Headers */}
            {MONTH_NAMES.map((mName, mIdx) => (
              <text
                key={mName}
                x={margin.left + mIdx * (cellW + gap) + cellW / 2}
                y={17}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize={11}
                fontWeight={600}
                fontFamily="var(--font-mono)"
              >
                {mName}
              </text>
            ))}

            <text
              x={margin.left + gridW + annualGap}
              y={17}
              textAnchor="start"
              fill="var(--text-secondary)"
              fontSize={11}
              fontWeight={600}
              fontFamily="var(--font-mono)"
            >
              ANNUAL TOTAL ({viewMode === 'raw' ? 'RAW' : 'HARM'})
            </text>

            {/* Year Rows & Month Cells */}
            {years.map((year, yIdx) => {
              const rowY = margin.top + yIdx * (cellH + gap);
              const annualRec = annualMap.get(year);
              const annualVal = annualRec
                ? viewMode === 'raw'
                  ? annualRec.raw
                  : annualRec.harmonized
                : 0;
              const barW = Math.max(2, (annualVal / maxAnnual) * annualBarMaxW);
              const barColor = year < 2012 ? 'var(--series-1)' : 'var(--series-2)';

              return (
                <g key={year}>
                  <text
                    x={margin.left - 10}
                    y={rowY + cellH / 2 + 4}
                    textAnchor="end"
                    fill={year === latestYear ? 'var(--accent)' : 'var(--text-secondary)'}
                    fontSize={11}
                    fontWeight={year === latestYear || year === 2012 ? 700 : 500}
                    fontFamily="var(--font-mono)"
                  >
                    {year}
                  </text>

                  {MONTH_NAMES.map((_, mIdx) => {
                    const month = mIdx + 1;
                    const key = `${year}-${month}`;
                    const cell = cellMap.get(key);
                    const cellX = margin.left + mIdx * (cellW + gap);
                    const isSelected = selectedMonthKey === key;
                    const isFocused =
                      focusedCoord?.year === year && focusedCoord?.month === month;

                    if (!cell) {
                      return (
                        <rect
                          key={key}
                          x={cellX}
                          y={rowY}
                          width={cellW}
                          height={cellH}
                          rx={3}
                          fill="var(--empty-cell)"
                          opacity={0.45}
                        />
                      );
                    }

                    const fill = colorScale(cell);
                    return (
                      <g key={key}>
                        <rect
                          data-cell={key}
                          tabIndex={year === latestYear && month === latestMonth ? 0 : -1}
                          role="gridcell"
                          aria-label={`${MONTH_FULL[month - 1]} ${year}: ${fmtNum(cell.harmonized)} harmonized hotspot-days`}
                          x={cellX}
                          y={rowY}
                          width={cellW}
                          height={cellH}
                          rx={3}
                          fill={fill}
                          stroke={
                            isSelected || isFocused
                              ? 'var(--accent)'
                              : 'var(--surface-1)'
                          }
                          strokeWidth={isSelected || isFocused ? 2 : 0.6}
                          style={{ cursor: 'pointer' }}
                          onClick={() => onSelectMonth(year, month)}
                          onKeyDown={(e) => handleCellKeyDown(e, year, month)}
                          onMouseMove={(e) =>
                            onHoverTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              title: `${MONTH_FULL[month - 1]} ${year} (${cell.sensorEra} era)`,
                              lines: [
                                {
                                  label: 'Harmonized',
                                  value: fmtNum(cell.harmonized),
                                  color: 'var(--series-2)',
                                },
                                {
                                  label: 'Raw detections',
                                  value: fmtNum(cell.raw),
                                  color: 'var(--series-1)',
                                },
                                {
                                  label: 'Vs. normal',
                                  value: `${cell.anomaly >= 0 ? '+' : ''}${cell.anomaly.toFixed(1)}% (${cell.zScore >= 0 ? '+' : ''}${cell.zScore.toFixed(2)}σ)`,
                                },
                              ],
                              note: cell.provisional
                                ? 'Provisional or partial month'
                                : 'Click to show this month on the map',
                            })
                          }
                          onMouseLeave={() => onHoverTooltip(null)}
                        />
                        {cell.provisional && (
                          <rect
                            x={cellX}
                            y={rowY}
                            width={cellW}
                            height={cellH}
                            rx={3}
                            fill="url(#ignis-hatch)"
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Right-hand Annual Total Bar */}
                  <rect
                    x={margin.left + gridW + annualGap}
                    y={rowY + 3}
                    width={barW}
                    height={cellH - 6}
                    rx={2.5}
                    fill={barColor}
                    opacity={annualRec?.provisional ? 0.68 : 0.9}
                  />
                  <text
                    x={margin.left + gridW + annualGap + barW + 6}
                    y={rowY + cellH / 2 + 4}
                    fill="var(--text-secondary)"
                    fontSize={10.5}
                    fontFamily="var(--font-mono)"
                  >
                    {fmtCompact(annualVal)}
                  </text>
                </g>
              );
            })}

            {/* 2012 Sensor-Cliff Rule */}
            {cliffY !== null && (
              <g aria-label="2012 VIIRS sensor boundary">
                <line
                  x1={margin.left - 44}
                  x2={margin.left + gridW + annualGap + annualBarMaxW + 44}
                  y1={cliffY}
                  y2={cliffY}
                  stroke="var(--accent)"
                  strokeWidth={1.3}
                  strokeDasharray="3 3"
                />
                <rect
                  x={margin.left + gridW - 156}
                  y={cliffY - 9}
                  width={154}
                  height={18}
                  rx={4}
                  fill="var(--surface-1)"
                  stroke="var(--accent)"
                  strokeWidth={0.8}
                />
                <text
                  x={margin.left + gridW - 79}
                  y={cliffY + 3.5}
                  textAnchor="middle"
                  fill="var(--accent)"
                  fontSize={9.5}
                  fontWeight={700}
                  fontFamily="var(--font-mono)"
                >
                  2012 · VIIRS 375 m BEGINS
                </text>
              </g>
            )}

            {/* Footer Legend */}
            <g transform={`translate(${margin.left}, ${svgH - 8})`}>
              <rect x={0} y={-9} width={10} height={10} rx={2} fill="var(--series-1)" />
              <text x={15} y={0} fill="var(--text-muted)" fontSize={10.5} fontFamily="var(--font-mono)">
                MODIS era (2000–2011)
              </text>
              <rect x={165} y={-9} width={10} height={10} rx={2} fill="var(--series-2)" />
              <text x={180} y={0} fill="var(--text-muted)" fontSize={10.5} fontFamily="var(--font-mono)">
                VIIRS era (2012–{latestYear})
              </text>
              <rect
                x={335}
                y={-9}
                width={10}
                height={10}
                rx={2}
                fill="var(--surface-3)"
                stroke="var(--border-strong)"
              />
              <rect x={335} y={-9} width={10} height={10} rx={2} fill="url(#ignis-hatch)" />
              <text x={350} y={0} fill="var(--text-muted)" fontSize={10.5} fontFamily="var(--font-mono)">
                Hatched = provisional / partial month
              </text>
            </g>
          </svg>
        </div>
      ) : (
        <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              textAlign: 'right',
            }}
          >
            <thead
              style={{
                position: 'sticky',
                top: 0,
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border-strong)',
              }}
            >
              <tr>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
                  Year
                </th>
                {MONTH_NAMES.map((m) => (
                  <th key={m} style={{ padding: '8px 6px', fontFamily: 'var(--font-mono)' }}>
                    {m}
                  </th>
                ))}
                <th style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {years
                .slice()
                .reverse()
                .map((y) => {
                  const ann = annualMap.get(y);
                  return (
                    <tr key={y} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td
                        className="font-mono"
                        style={{
                          padding: '6px 10px',
                          textAlign: 'left',
                          fontWeight: 600,
                          color: y < 2012 ? 'var(--series-1)' : 'var(--series-2)',
                        }}
                      >
                        {y}
                      </td>
                      {MONTH_NAMES.map((_, idx) => {
                        const c = cellMap.get(`${y}-${idx + 1}`);
                        const val = !c
                          ? '—'
                          : viewMode === 'raw'
                            ? fmtNum(c.raw)
                            : viewMode === 'anom'
                              ? `${c.anomaly >= 0 ? '+' : ''}${c.anomaly.toFixed(0)}%`
                              : fmtNum(c.harmonized);
                        return (
                          <td
                            key={idx}
                            className="font-mono"
                            style={{ padding: '6px 6px', color: 'var(--text-secondary)' }}
                          >
                            {val}
                          </td>
                        );
                      })}
                      <td
                        className="font-mono"
                        style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text-primary)' }}
                      >
                        {ann ? fmtNum(viewMode === 'raw' ? ann.raw : ann.harmonized) : '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
