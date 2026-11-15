import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { BreakdownResponse, OutlookResponse, OutlookTrackItem, SummaryResponse } from '../types';
import type { Insight, Part } from '../insights';
import type { Action } from '../actions';
import { monthsVsNormal, recordMonths, topYears } from '../insights';
import { MONTH_FULL, MONTH_NAMES, fmtNum } from '../util';

/** Renders insight text; `{b}` parts are the numbers and names the reader should notice. */
export function Rich({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : <strong key={i}>{p.b}</strong>))}
    </>
  );
}

/* ----------------------------------------------------------------------------- chapter frame */

interface StoryChapterProps {
  id: string;
  n: string;
  question: string;
  insight: Insight;
  hint?: string;
  children: ReactNode;
}

/** One chapter of the story: question, computed answer, how to read the evidence, then the evidence. */
export function StoryChapter({ id, n, question, insight, hint, children }: StoryChapterProps) {
  return (
    <section id={id} className="chapter" aria-labelledby={`${id}-q`} data-reveal>
      <header className="chapter__head">
        <div className="chapter__num" aria-hidden="true">
          {n}
        </div>
        <div className="chapter__text">
          <h2 id={`${id}-q`} className="chapter__q">
            <span className="sr-only">Question {n}: </span>
            {question}
          </h2>
          <p className="chapter__a">
            <Rich parts={insight.parts} />
          </p>
          {(insight.facts.length > 0 || insight.weak) && (
            <ul className="chapter__facts" aria-label="Key numbers">
              {insight.weak && (
                <li className="chapter__fact chapter__fact--weak">
                  <span>Limited data</span>
                  <b>read with care</b>
                </li>
              )}
              {insight.facts.map((f) => (
                <li key={f.label} className="chapter__fact">
                  <span>{f.label}</span>
                  <b>{f.value}</b>
                </li>
              ))}
            </ul>
          )}
          {hint && (
            <details className="chapter__hint">
              <summary>How to read these charts</summary>
              <p>{hint.charAt(0).toUpperCase() + hint.slice(1)}</p>
            </details>
          )}
        </div>
      </header>
      <div className="chapter__body">{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------------------------- briefing */

export interface BriefingItem {
  id: string;
  n: string;
  insight: Insight;
}

/** The whole story in a few lines, right under the headline. Each line jumps to its chapter. */
export function Briefing({ area, items, onJump }: { area: string; items: BriefingItem[]; onJump: (id: string) => void }) {
  const shown = items.filter((it) => it.insight.short.length > 0);
  if (!shown.length) return null;
  return (
    <section className="bento-card briefing" aria-labelledby="briefing-title" data-reveal>
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        THE SHORT VERSION
      </div>
      <h2 id="briefing-title" className="briefing__title">
        {shown.length} things to know about {area}
      </h2>
      <ol className="briefing__list">
        {shown.map((it) => (
          <li key={it.id}>
            <button type="button" className="briefing__item" onClick={() => onJump(it.id)}>
              <span className="briefing__n" aria-hidden="true">
                {it.n}
              </span>
              <span className="briefing__text">
                <Rich parts={it.insight.short} />
              </span>
              <ArrowRight size={15} className="briefing__go" aria-hidden="true" />
              <span className="sr-only">(go to this part of the page)</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ----------------------------------------------------------------------------- where: province ranking */

const ARROW: Record<string, string> = {
  far_above: '▲▲',
  above: '▲',
  near: '●',
  below: '▼',
  far_below: '▼▼',
  no_data: '–',
};

export function ProvinceRanking({
  breakdown,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: {
  breakdown: BreakdownResponse;
  selectedId?: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (provinceId: string) => void;
}) {
  const provs = breakdown.provinces;
  const maxShare = Math.max(0.0001, ...provs.map((p) => p.share));
  const selIdx = provs.findIndex((p) => p.id === selectedId);
  const minForRatio = Math.max(20, breakdown.total * 0.02);
  const judgeable = (p: (typeof provs)[number]) => p.ratio !== null && (p.median ?? 0) > 0 && p.value >= minForRatio;
  // The province furthest above its own normal (same rule as the chapter's answer), so the list
  // always shows the province the answer names.
  const hottest = provs
    .filter((p) => judgeable(p) && (p.ratio ?? 0) >= 1.3)
    .sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0))[0];
  // Keep the selected and the hottest province visible even when they are outside the top 6.
  const rows = expanded ? provs : provs.filter((p, i) => i < 6 || i === selIdx || p.id === hottest?.id);

  return (
    <div className="bento-card ranking" aria-labelledby="ranking-title">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        PROVINCES OF {breakdown.countryName.toUpperCase()} · SAME PERIOD
      </div>
      <h3 id="ranking-title" className="ranking__title">
        Share of the fire, and each province against its own normal
      </h3>
      <ol className="ranking__list">
        {rows.map((p, rowIdx) => {
          const i = provs.indexOf(p);
          const judge = judgeable(p);
          const skipped = rowIdx > 0 && i - provs.indexOf(rows[rowIdx - 1]) > 1;
          return (
            <li key={p.id}>
              {skipped && (
                <div className="ranking__gap" aria-hidden="true">
                  ···
                </div>
              )}
              <button
                type="button"
                className={`ranking__row ${p.id === selectedId ? 'ranking__row--selected' : ''}`}
                onClick={() => onSelect(p.id)}
                aria-current={p.id === selectedId ? 'true' : undefined}
                aria-label={`${i + 1}. ${p.name}: ${fmtNum(p.value)} hotspot-days, ${Math.round(p.share * 100)}% of the country${
                  judge ? `, ${(p.ratio as number).toFixed(1)} times its normal` : ''
                }. Open this province.`}
              >
                <span className="ranking__rank font-mono">{i + 1}</span>
                <span className="ranking__name">
                  {p.name}
                  {p.id === hottest?.id && (
                    <span className="ranking__tag" title="Furthest above its own normal">
                      top rise
                    </span>
                  )}
                </span>
                <span className="ranking__bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(p.value > 0 ? 2 : 0, (p.share / maxShare) * 100)}%` }} />
                </span>
                <span className="ranking__share font-mono">{p.value > 0 ? `${Math.round(p.share * 100)}%` : '—'}</span>
                {judge ? (
                  <span className={`status-badge status-badge--${p.status} ranking__badge`}>
                    {ARROW[p.status]} {(p.ratio as number).toFixed(1)}×
                  </span>
                ) : (
                  <span className="ranking__badge ranking__badge--none font-mono">{p.value > 0 ? 'too little' : 'no fire'}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="ranking__foot">
        {provs.length > 6 && (
          <button type="button" className="btn-secondary" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? 'Show top 6' : `Show all ${provs.length} provinces`}
          </button>
        )}
        <span className="ranking__note">
          Badge = this period vs the province’s median for the same dates in {breakdown.baselineSpan ?? 'past years'}. The
          arrow shows how it ranks among those years (▲ above, ● within normal, ▼ below).
          {' '}“Too little” = not enough fire to compare.
          {breakdown.unassignedShare >= 0.005 &&
            ` ${Math.round(breakdown.unassignedShare * 1000) / 10}% of the fire lies on coasts outside any province outline.`}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- small evidence lists */

function ListCard({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <div className="bento-card listcard">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        {kicker}
      </div>
      <h3 className="listcard__title">{title}</h3>
      {children}
    </div>
  );
}

/** When: the busiest months ever recorded here. */
export function RecordMonthsCard({ summary }: { summary: SummaryResponse }) {
  const rows = recordMonths(summary, 6);
  return (
    <ListCard kicker="THE FULL RECORD" title="Busiest months since 2000">
      {rows.length === 0 ? (
        <p className="listcard__empty">No fire recorded here.</p>
      ) : (
        <ol className="listcard__list">
          {rows.map((r, i) => (
            <li key={`${r.year}-${r.month}`} className="listcard__row">
              <span className="listcard__rank font-mono">{i + 1}</span>
              <span className="listcard__name">
                {MONTH_FULL[r.month - 1]} {r.year}
                {r.era === 'MODIS' && <small> MODIS era</small>}
              </span>
              <span className="listcard__value font-mono">{fmtNum(r.value)}</span>
              <span className="listcard__ratio font-mono">{r.ratio ? `${r.ratio.toFixed(1)}× normal` : ''}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="listcard__note">Hotspot-days in the month, and how that compares with the same month in a normal year.</p>
    </ListCard>
  );
}

const LEVEL_TEXT: Record<string, string> = {
  far_above: 'Far above',
  above: 'Above',
  near: 'In range',
  below: 'Below',
  far_below: 'Far below',
};

/** This year: each month against its own normal range. */
export function MonthsVsNormalCard({ summary, year }: { summary: SummaryResponse; year?: number }) {
  const rows = monthsVsNormal(summary);
  return (
    <ListCard kicker={`${year ?? ''} MONTH BY MONTH`} title="Which months were unusual?">
      <ol className="months-grid">
        {rows.map((r) => (
          <li key={r.month} className={`months-grid__cell months-grid__cell--${r.level}`}>
            <span className="months-grid__m">{MONTH_NAMES[r.month - 1]}</span>
            <span className="months-grid__v font-mono">{r.ratio !== null ? `${r.ratio.toFixed(1)}×` : fmtNum(r.value)}</span>
            <span className="months-grid__l">
              {ARROW[r.level]} {LEVEL_TEXT[r.level]}
            </span>
          </li>
        ))}
      </ol>
      <p className="listcard__note">
        × = this month vs the median for that month. The label shows where it falls among past years: “In range” is the
        middle half, “Far above” is higher than 9 of every 10 years. Months that vary a lot can be 2× and still in range.
      </p>
    </ListCard>
  );
}

/** Trend: the biggest years. */
export function TopYearsCard({ summary }: { summary: SummaryResponse }) {
  const rows = topYears(summary, 6);
  const last = summary.calendar.annual[summary.calendar.annual.length - 1]?.year ?? 2025;
  return (
    <ListCard kicker="RECORD YEARS" title="The biggest fire years">
      <ol className="listcard__list">
        {rows.map((r, i) => (
          <li key={r.year} className="listcard__row">
            <span className="listcard__rank font-mono">{i + 1}</span>
            <span className="listcard__name">
              {r.year}
              {r.year > last - 10 && <small className="listcard__tag">last decade</small>}
            </span>
            <span className="listcard__value font-mono">{fmtNum(r.value)}</span>
            <span className="listcard__ratio font-mono">{r.ratio ? `${r.ratio.toFixed(1)}× typical` : ''}</span>
          </li>
        ))}
      </ol>
      <p className="listcard__note">Hotspot-days per year. “Typical” is the median year since 2001.</p>
    </ListCard>
  );
}

/* ----------------------------------------------------------------------------- next: outlook */

const CALL_TEXT: Record<string, string> = {
  busier: 'Likely busier than usual',
  quieter: 'Likely quieter than usual',
  unclear: 'No clear signal',
  none: 'No forecast: off season',
};
const CALL_ICON: Record<string, string> = { busier: '▲', quieter: '▼', unclear: '●', none: '–' };
const pc = (x: number) => `${Math.round(x * 100)}%`;
const ratioText = (x: number) => `${x >= 10 ? Math.round(x) : x.toFixed(1)}×`;

/** Next: the forecast itself. A chance meter with the "too close to call" zone marked. */
export function OutlookCard({ outlook }: { outlook: OutlookResponse }) {
  const n = outlook.next;
  if (!n) return null;
  const p = Math.min(0.98, Math.max(0.02, n.pBusier));
  return (
    <div className="bento-card outlook">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        OUTLOOK FOR {n.label.toUpperCase()}
      </div>
      <h3 className="listcard__title">Will it be busier than usual?</h3>

      <div className="outlook__head">
        <div className={`outlook__chance outlook__chance--${n.call}`}>
          <span className="outlook__pct font-mono">{n.inSeason ? pc(n.pBusier) : '—'}</span>
          <span className="outlook__pctlabel">chance of a busier month</span>
        </div>
        <div className={`outlook__call outlook__call--${n.call}`}>
          <span aria-hidden="true">{CALL_ICON[n.call]}</span> {CALL_TEXT[n.call]}
          {n.sure && <small>model is confident</small>}
        </div>
      </div>

      {n.inSeason && (
        <div
          className="outlook__meter"
          role="img"
          aria-label={`${pc(n.pBusier)} chance that ${n.label} is busier than usual. ${CALL_TEXT[n.call]}.`}
        >
          <div className="outlook__track">
            <span className="outlook__zone outlook__zone--quieter" />
            <span className="outlook__zone outlook__zone--unclear" />
            <span className="outlook__zone outlook__zone--busier" />
            <span className="outlook__marker" style={{ left: `${p * 100}%` }} />
          </div>
          <div className="outlook__scale font-mono" aria-hidden="true">
            <span>0%</span>
            <span style={{ left: '40%' }}>40</span>
            <span style={{ left: '60%' }}>60</span>
            <span style={{ left: '100%' }}>100%</span>
          </div>
          <div className="outlook__zones" aria-hidden="true">
            <span>▼ quieter</span>
            <span>● too close to call</span>
            <span>busier ▲</span>
          </div>
        </div>
      )}

      <dl className="outlook__why">
        <div>
          <dt>Usual level for {MONTH_FULL[n.month - 1]}</dt>
          <dd className="font-mono">{fmtNum(Math.round(n.usual))} hotspot-days</dd>
        </div>
        <div>
          <dt>{n.lastMonth.label}</dt>
          <dd className="font-mono">
            {fmtNum(Math.round(n.lastMonth.value))} · {ratioText(n.lastMonth.ratio)} its usual
          </dd>
        </div>
        <div>
          <dt>Last 12 months</dt>
          <dd className="font-mono">{ratioText(n.last12Ratio)} their usual</dd>
        </div>
      </dl>
      <p className="listcard__note">
        “Usual” is the median for that calendar month here. The forecast uses only how recent months compared with their
        usual level: no weather data. Fire that runs above its usual level tends to stay above.
      </p>
    </div>
  );
}

function trackGlyph(t: OutlookTrackItem): { cls: string; mark: string; text: string } {
  if (t.call === 'none') return { cls: 'off', mark: '–', text: 'off season, no forecast' };
  if (t.call === 'unclear') return { cls: 'skip', mark: '·', text: `no clear signal (${pc(t.pBusier)})` };
  const said = t.call === 'busier' ? 'busier' : 'quieter';
  return t.hit
    ? { cls: 'hit', mark: '✓', text: `said ${said} (${pc(t.pBusier)}), and it was` }
    : { cls: 'miss', mark: '✕', text: `said ${said} (${pc(t.pBusier)}), but it was ${t.busier ? 'busier' : 'quieter'}` };
}

/** Next: would the forecast have been right here, and how good is it overall? */
export function OutlookTrackCard({ outlook, areaLabel }: { outlook: OutlookResponse; areaLabel: string }) {
  const ts = outlook.trackSummary;
  const sk = outlook.skill;
  const years = [...new Set(outlook.track.map((t) => t.year))];
  return (
    <div className="bento-card listcard">
      <div className="section-kicker" style={{ marginBottom: 4 }}>
        TRACK RECORD · {areaLabel.toUpperCase()}
      </div>
      <h3 className="listcard__title">
        {ts.calls > 0 ? `${ts.hits} of ${ts.calls} calls came true` : 'No calls made here'}
      </h3>

      {years.map((y) => (
        <div key={y} className="track">
          <span className="track__year font-mono">{y}</span>
          <ol className="track__row">
            {outlook.track
              .filter((t) => t.year === y)
              .map((t) => {
                const g = trackGlyph(t);
                return (
                  <li
                    key={t.month}
                    className={`track__cell track__cell--${g.cls}`}
                    title={`${MONTH_FULL[t.month - 1]} ${t.year}: ${g.text}. Actual ${fmtNum(Math.round(t.actual))}, usual ${fmtNum(Math.round(t.usual))}.`}
                  >
                    <span className="track__m" aria-hidden="true">
                      {MONTH_NAMES[t.month - 1][0]}
                    </span>
                    <span className="track__mark" aria-hidden="true">
                      {g.mark}
                    </span>
                    <span className="sr-only">
                      {MONTH_FULL[t.month - 1]} {t.year}: {g.text}
                    </span>
                  </li>
                );
              })}
          </ol>
        </div>
      ))}
      <div className="track__legend" aria-hidden="true">
        <span><b className="track__key track__key--hit">✓</b> right</span>
        <span><b className="track__key track__key--miss">✕</b> wrong</span>
        <span><b className="track__key">·</b> too close to call</span>
        <span><b className="track__key">–</b> off season</span>
      </div>

      <ul className="skill">
        <li>
          <span>All {sk.areas} areas, years never seen</span>
          <b className="font-mono">{pc(sk.accuracy)} right</b>
        </li>
        <li>
          <span>When the model is confident</span>
          <b className="font-mono">{pc(sk.sureAccuracy)} right</b>
        </li>
        <li className="skill__ref">
          <span>Coin flip</span>
          <b className="font-mono">{pc(sk.coinFlip)}</b>
        </li>
        <li className="skill__ref">
          <span>“Same as last month” rule</span>
          <b className="font-mono">{pc(sk.sameAsLastMonth)}</b>
        </li>
        <li className="skill__ref">
          <span>Same model on raw, unharmonized data</span>
          <b className="font-mono">{pc(sk.trainedOnRaw)}</b>
        </li>
      </ul>
      <p className="listcard__note">
        Each {ts.fromYear}+ forecast above was made using only earlier data, by a model that never saw {ts.fromYear} or later.
        The overall test covers {fmtNum(sk.n)} forecasts for 2016–2025, each predicted from earlier years only. The model
        matches the simple “same as last month” rule on right/wrong calls; what it adds is a chance you can rely on.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------------- pager */

/** Bottom of every view: step to the previous or next question. */
export function StoryPager({
  sections,
  current,
  onSelect,
}: {
  sections: { id: string; label: string; question: string }[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const i = sections.findIndex((s) => s.id === current);
  if (i < 0) return null;
  const prev = sections[i - 1];
  const next = sections[i + 1];
  return (
    <nav className="pager no-print" aria-label="Previous and next question">
      {prev ? (
        <button type="button" className="pager__btn" onClick={() => onSelect(prev.id)}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>
            <small>Previous</small>
            {prev.question}
          </span>
        </button>
      ) : (
        <span />
      )}
      <span className="pager__count font-mono" aria-hidden="true">
        {i + 1} / {sections.length}
      </span>
      {next ? (
        <button type="button" className="pager__btn pager__btn--next" onClick={() => onSelect(next.id)}>
          <span>
            <small>Next</small>
            {next.question}
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      ) : (
        <span />
      )}
    </nav>
  );
}

/* ----------------------------------------------------------------------------- what to do */

const WHEN_ICON: Record<string, string> = { now: '!', 'next-month': '→', 'before-season': '◷', yearly: '↻', reporting: '✎' };

/** What to do: one row per suggestion, with its timing, its evidence and a link to the evidence. */
export function ActionList({ actions, labels, onSee }: { actions: Action[]; labels: Record<string, string>; onSee: (id: string) => void }) {
  return (
    <div className="bento-card actions">
      <ol className="actions__list">
        {actions.map((a, i) => (
          <li key={i} className={`action action--${a.when}`}>
            <div className="action__when">
              <span className="action__icon" aria-hidden="true">
                {WHEN_ICON[a.when]}
              </span>
              <span>{a.whenLabel}</span>
            </div>
            <div className="action__body">
              <h3 className="action__title">{a.title}</h3>
              <p className="action__why">
                <span className="action__because">Because</span> <Rich parts={a.why} />
              </p>
              <p className="action__who">For: {a.who}</p>
            </div>
            <button type="button" className="action__see no-print" onClick={() => onSee(a.see)}>
              See the evidence
              <small>{labels[a.see] ?? ''}</small>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <p className="listcard__note">
        A satellite hotspot is not a confirmed fire, clouds hide fires, and these suggestions do not know about weather,
        staffing or local rules. Confirm on the ground before acting.
      </p>
    </div>
  );
}
