/**
 * Plain-language answers for each chapter of the analytics story.
 *
 * Every sentence is computed from the data on screen (SummaryResponse, BreakdownResponse, MapResponse).
 * Nothing is invented: when the data is too thin to support a conclusion the insight says so and is
 * marked `weak`. Text is returned as parts so numbers can be emphasized without HTML strings.
 */
import type { AreaSelection, BreakdownResponse, MapResponse, ProvinceStat, SummaryResponse } from './types';
import { MONTH_FULL, MONTH_NAMES, fmtDate, fmtNum, ordinal } from './util';

export type Part = string | { b: string };

export interface Fact {
  label: string;
  value: string;
}

export interface Insight {
  /** the chapter's answer, one or two sentences */
  parts: Part[];
  /** one line for the briefing at the top of the page */
  short: Part[];
  facts: Fact[];
  /** true when the data is too thin for a firm conclusion */
  weak?: boolean;
}

/** Below this many hotspot-days in a typical year, seasonal and trend statements are not reliable. */
export const MIN_YEARLY = 30;

const b = (s: string | number): Part => ({ b: String(s) });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (x: number) => (x >= 10 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`);

export function partsToText(parts: Part[]): string {
  return parts.map((p) => (typeof p === 'string' ? p : p.b)).join('');
}

/** "Saudi_Arabia" style names and "Iraq" alike, for "Iraq's". */
function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, c) => a - c);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "May–Sep", wrapping over the new year ("Nov–Feb"). */
function monthSpan(start: number, len: number): string {
  const end = ((start - 1 + len - 1) % 12) + 1;
  return len === 1 ? MONTH_FULL[start - 1] : `${MONTH_NAMES[start - 1]}–${MONTH_NAMES[end - 1]}`;
}

/* ----------------------------------------------------------------------------- 01 · now */

export function nowInsight(s: SummaryResponse): Insight {
  const h = s.headline;
  const strip = h.historyStrip;
  const current = strip.find((p) => p.isCurrent);
  const past = strip.filter((p) => !p.isCurrent);
  if (s.coverage === false || !current) {
    return { parts: ['This area is outside the archive, so there is nothing to compare.'], short: [], facts: [], weak: true };
  }
  const more = past.filter((p) => p.value > current.value).length;
  const n = past.length;
  const typical = Number.isFinite(h.medianWindowCount) ? h.medianWindowCount : median(past.map((p) => p.value));

  if (current.value === 0 && typical === 0) {
    return {
      parts: ['No vegetation fire on these dates, which is also normal here: most years are fire-free on the same dates.'],
      short: ['Now: no fire on these dates, as usual.'],
      facts: [],
      weak: true,
    };
  }
  if (typical === 0) {
    return {
      parts: [b(fmtNum(current.value)), ' hotspot-days on dates that are normally fire-free here. ', b(`${n - more} of ${n}`), ' past years had less.'],
      short: ['Now: fire on dates that are normally fire-free.'],
      facts: [],
    };
  }
  const ratio = current.value / typical;
  const parts: Part[] =
    more === 0
      ? ['This is the ', b('highest on record'), ` for these dates: none of the ${n} earlier years had as much fire.`]
      : ratio >= 1
        ? ['Only ', b(`${more} of the ${n}`), ' earlier years had more fire on these dates. ']
        : [b(`${more} of the ${n}`), ' earlier years had more fire on these dates, so this is a quieter-than-usual period. '];
  if (more > 0 && ratio >= 1) {
    parts.push(ratio >= 1.15 ? 'Unusually active.' : 'Busy, but within the normal range.');
  }
  const short: Part[] =
    ratio >= 1.15
      ? ['Now: ', b(times(ratio)), ' the normal fire for these dates (', b(`#${more + 1} of ${n + 1}`), ' years).']
      : ratio <= 0.87
        ? ['Now: quieter than normal, ', b(times(ratio)), ' the usual fire for these dates.']
        : ['Now: about normal for these dates (', b(times(ratio)), ').'];
  return { parts, short, facts: [] };
}

/* ----------------------------------------------------------------------------- 02 · where */

/** A province needs enough fire before "N× its normal" means anything. */
export function judgeable(p: ProvinceStat, total: number): boolean {
  return p.ratio !== null && (p.median ?? 0) > 0 && p.value >= Math.max(20, total * 0.02);
}

/** How many of the largest provinces it takes to reach half the fire. */
export function provincesForHalf(provs: ProvinceStat[]): number {
  let acc = 0;
  for (let i = 0; i < provs.length; i++) {
    acc += provs[i].share;
    if (acc >= 0.5) return i + 1;
  }
  return provs.length;
}

export function whereInsight(
  area: AreaSelection,
  breakdown: BreakdownResponse | null,
  map: MapResponse | null
): Insight {
  // A province or country with a breakdown: rank provinces.
  if (breakdown && breakdown.total > 0 && area.kind === 'region') {
    const provs = breakdown.provinces;
    const country = breakdown.countryName;
    const withFire = provs.filter((p) => p.value > 0).length;
    const hot = provs
      .filter((p) => judgeable(p, breakdown.total) && (p.ratio ?? 0) >= 1.3)
      .sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0));
    const facts: Fact[] = [
      { label: 'Provinces with fire', value: `${withFire} of ${provs.length}` },
      { label: 'Half the fire is in', value: `${provincesForHalf(provs)} province${provincesForHalf(provs) > 1 ? 's' : ''}` },
    ];

    if (area.provinceCode) {
      const idx = provs.findIndex((p) => p.id === area.provinceCode);
      const me = provs[idx];
      if (!me) return { parts: ['No province breakdown for this area.'], short: [], facts: [], weak: true };
      const name = me.name;
      if (me.value === 0) {
        return {
          parts: [`${name} had no vegetation fire in this period, while ${country} as a whole had `, b(fmtNum(breakdown.total)), ' hotspot-days.'],
          short: [`Where: no fire in ${name} this period.`],
          facts,
        };
      }
      const parts: Part[] = [
        `${name} ranks `, b(`${ordinal(idx + 1)} of ${provs.length}`), ` ${country} provinces for fire in this period, with `,
        b(pct(me.share)), ` of ${possessive(country)} total. `,
      ];
      if (judgeable(me, breakdown.total)) {
        parts.push('It is ', b(times(me.ratio as number)), ' its own normal for these dates');
        parts.push(hot[0]?.id === me.id ? ', the furthest above normal of any province.' : '.');
      } else {
        parts.push('Too little fire here to compare with its own past.');
      }
      return {
        parts,
        short: ['Where: ', b(`${ordinal(idx + 1)} of ${provs.length}`), ` provinces, `, b(pct(me.share)), ` of ${possessive(country)} fire.`],
        facts: [{ label: 'Share of country', value: pct(me.share) }, ...facts],
        weak: !judgeable(me, breakdown.total),
      };
    }

    const top = provs[0];
    const half = provincesForHalf(provs);
    const parts: Part[] = [b(top.name), ' holds ', b(pct(top.share)), ` of ${possessive(country)} fire in this period`];
    if (half > 1) parts.push(', and ', b(`${half} of ${provs.length}`), ' provinces hold half of it. ');
    else parts.push('. ');
    if (hot.length) {
      parts.push(
        hot[0].id === top.id ? `${top.name} is also` : `${hot[0].name} is`,
        ' the furthest above its own normal (', b(times(hot[0].ratio as number)), ').'
      );
    } else {
      parts.push('No province with enough fire to judge is far above its own normal.');
    }
    const short: Part[] = ['Where: ', b(top.name), ' holds ', b(pct(top.share)), ' of the fire'];
    if (hot.length && hot[0].id === top.id) short.push(' and is the most above its normal.');
    else if (hot.length) short.push('; ', b(hot[0].name), ' is the most above its normal.');
    else short.push('.');
    return { parts, short, facts };
  }

  // Drawn shapes, circles, offline: how concentrated the fire is, from the map cells.
  const vals = (map?.hotspots.features ?? []).map((f) => f.properties.harmonizedCount).filter((v) => v > 0);
  if (!vals.length) {
    return {
      parts: ['No vegetation fire was detected in this area and period.'],
      short: ['Where: no fire detected in this period.'],
      facts: [],
      weak: true,
    };
  }
  vals.sort((x, y) => y - x);
  const total = vals.reduce((a, c) => a + c, 0);
  const k = Math.max(1, Math.round(vals.length * 0.1));
  const topShare = vals.slice(0, k).reduce((a, c) => a + c, 0) / total;
  const cell = map?.cellDeg ? ` (${map.cellDeg}° squares)` : '';
  if (vals.length < 10) {
    return {
      parts: ['Fire was detected in only ', b(vals.length), ` grid cells${cell}, so it is very localized.`],
      short: ['Where: only ', b(vals.length), ' small spots burned.'],
      facts: [],
      weak: true,
    };
  }
  return {
    parts: [
      'Fire was detected in ', b(fmtNum(vals.length)), ` grid cells${cell}. The busiest `, b('10%'), ' of them hold ', b(pct(topShare)),
      ' of it, ',
      topShare >= 0.5 ? 'so a few hotspots dominate: look for the brightest dots on the map.' : 'so burning is spread widely across the area.',
    ],
    short: ['Where: the busiest 10% of spots hold ', b(pct(topShare)), ' of the fire.'],
    facts: [{ label: 'Cells with fire', value: fmtNum(vals.length) }],
  };
}

/* ----------------------------------------------------------------------------- 03 · when */

export interface SeasonWindow {
  start: number; // 1..12
  len: number;
  share: number;
  peak: number; // 1..12
  /** false when fire is spread through the year: 75% needs 8+ months, so there is no real season */
  clear: boolean;
  /** false when no month stands out (busiest month < 1.3x the monthly average) */
  clearPeak: boolean;
}

/** Shortest run of consecutive months (wrapping the year) that holds >= 75% of a normal year's fire. */
export function fireSeason(medians: number[]): SeasonWindow | null {
  const total = medians.reduce((a, c) => a + c, 0);
  if (total <= 0) return null;
  const peak = medians.indexOf(Math.max(...medians)) + 1;
  const clearPeak = Math.max(...medians) >= 1.3 * (total / 12);
  for (let len = 1; len <= 12; len++) {
    let best: SeasonWindow | null = null;
    for (let start = 1; start <= 12; start++) {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += medians[(start - 1 + i) % 12];
      if (sum / total >= 0.75 && (!best || sum / total > best.share)) {
        best = { start, len, share: sum / total, peak, clear: len <= 7, clearPeak };
      }
    }
    if (best) return best;
  }
  return null;
}

export function whenInsight(s: SummaryResponse): Insight {
  const med = s.climatology.months.map((m) => m.median);
  const yearly = med.reduce((a, c) => a + c, 0);
  const season = fireSeason(med);
  const cells = s.calendar.cells.filter((c) => !c.provisional);
  const record = cells.reduce((best, c) => (c.harmonized > (best?.harmonized ?? 0) ? c : best), cells[0]);
  const facts: Fact[] = [];

  if (!season || yearly < MIN_YEARLY) {
    const parts: Part[] = ['Too little fire in a normal year here (', b(fmtNum(yearly)), ' hotspot-days) to name a fire season. '];
    if (record && record.harmonized > 0) {
      parts.push('The busiest month on record was ', b(`${MONTH_FULL[record.month - 1]} ${record.year}`), '.');
    }
    return { parts, short: ['When: too little fire for a clear season.'], facts, weak: true };
  }

  const parts: Part[] = [];
  if (!season.clear) {
    parts.push('Fire is spread through the whole year here, with no clear season. ');
    if (season.clearPeak) parts.push('The busiest month is usually ', b(MONTH_FULL[season.peak - 1]), '. ');
  } else {
    parts.push(
      'The fire season runs ', b(monthSpan(season.start, season.len)), ': these ', b(`${season.len} month${season.len > 1 ? 's' : ''}`),
      ' hold ', b(pct(season.share)), ' of a normal year’s fire, peaking in ', b(MONTH_FULL[season.peak - 1]), '. '
    );
  }
  if (record && record.harmonized > 0) {
    const normal = s.climatology.months[record.month - 1]?.median ?? 0;
    parts.push('The busiest month on record was ', b(`${MONTH_FULL[record.month - 1]} ${record.year}`));
    if (normal > 0) parts.push(', at ', b(times(record.harmonized / normal)), ` a normal ${MONTH_FULL[record.month - 1]}.`);
    else parts.push('.');
  }

  if (season.clear) {
    facts.push({ label: 'Season share', value: pct(season.share) });
    facts.push({ label: 'Peak month', value: MONTH_FULL[season.peak - 1] });
  }
  if (record) facts.push({ label: 'Record month', value: `${MONTH_NAMES[record.month - 1]} ${record.year} · ${fmtNum(record.harmonized)}` });

  return {
    parts,
    short: !season.clear
      ? season.clearPeak
        ? ['When: fire all year, busiest in ', b(MONTH_FULL[season.peak - 1]), '.']
        : ['When: fire all year, with no clear season.']
      : ['When: the season runs ', b(monthSpan(season.start, season.len)), ', peaking in ', b(MONTH_FULL[season.peak - 1]), '.'],
    facts,
  };
}

/** The busiest months on record, for the "When" chapter's evidence card. */
export function recordMonths(s: SummaryResponse, n = 5) {
  return s.calendar.cells
    .filter((c) => c.harmonized > 0 && !c.provisional)
    .sort((x, y) => y.harmonized - x.harmonized)
    .slice(0, n)
    .map((c) => {
      const normal = s.climatology.months[c.month - 1]?.median ?? 0;
      return { year: c.year, month: c.month, value: c.harmonized, ratio: normal > 0 ? c.harmonized / normal : null, era: c.sensorEra };
    });
}

/* ----------------------------------------------------------------------------- 04 · this year */

export function thisYearInsight(s: SummaryResponse): Insight {
  const year = s.seasonCurve.year ?? Number(s.latestDate.slice(0, 4));
  const days = s.seasonCurve.days;
  const withCur = days.filter((d) => d.current !== null);
  const last = withCur[withCur.length - 1];
  const fullNormal = days[days.length - 1]?.median ?? 0;
  const months = s.climatology.months.filter((m) => m.currentYear !== null);
  const above = months.filter((m) => (m.currentYear as number) > m.p90 && m.p90 > 0);
  const below = months.filter((m) => (m.currentYear as number) < m.p10);
  const complete = s.latestDate.endsWith('-12-31');

  if (!last || fullNormal < MIN_YEARLY) {
    return {
      parts: [`Too little fire in a normal year here to judge how ${year} is going.`],
      short: [`${year}: too little fire to judge.`],
      facts: [],
      weak: true,
    };
  }
  const cur = last.current as number;
  const normalNow = last.median;
  const ratio = normalNow > 0 ? cur / normalNow : null;
  const passed = days.find((d) => d.current !== null && (d.current as number) >= fullNormal);

  const parts: Part[] = complete
    ? [`${year} ended with `, b(fmtNum(cur)), ' hotspot-days, ']
    : [`So far in ${year} (to ${fmtDate(s.latestDate)}): `, b(fmtNum(cur)), ' hotspot-days, '];
  if (ratio !== null) parts.push(b(times(ratio)), complete ? ' a normal year. ' : ' the normal total by this date. ');
  if (passed && ratio !== null && ratio > 1.05) {
    parts.push('It had already burned a whole normal year’s worth by ', b(passed.dateLabel), '. ');
  }
  if (above.length) {
    const one = above.length === 1;
    parts.push(
      b(one ? MONTH_FULL[above[0].month - 1] : `${above.length} months`),
      one ? '' : ` (${above.map((m) => m.label).join(', ')})`,
      one ? ' was' : ' were',
      ' busier than in 9 out of 10 past years.'
    );
  } else if (below.length >= 3) {
    parts.push(b(`${below.length} months`), ' were unusually quiet.');
  } else {
    parts.push('No single month was far outside its normal range.');
  }
  return {
    parts,
    short: ratio === null ? [`${year}: `, b(fmtNum(cur)), ' hotspot-days.'] : [`${year}: `, b(times(ratio)), complete ? ' a normal year.' : ' normal so far.'],
    facts: [
      { label: complete ? `${year} total` : `${year} so far`, value: fmtNum(cur) },
      { label: complete ? 'Normal year' : 'Normal by now', value: fmtNum(normalNow) },
    ],
  };
}

/** Month-by-month: this year against its normal range. */
export function monthsVsNormal(s: SummaryResponse) {
  return s.climatology.months
    .filter((m) => m.currentYear !== null)
    .map((m) => {
      const v = m.currentYear as number;
      const level =
        v > m.p90 && m.p90 > 0 ? 'far_above' : v > m.p75 ? 'above' : v < m.p10 ? 'far_below' : v < m.p25 ? 'below' : 'near';
      return { month: m.month, label: m.label, value: v, median: m.median, ratio: m.median > 0 ? v / m.median : null, level } as const;
    });
}

/* ----------------------------------------------------------------------------- 05 · trend */

export function trendInsight(s: SummaryResponse): Insight {
  const years = s.calendar.annual.filter((a) => a.year >= 2001 && !a.provisional);
  const t = s.calendar.trend;
  const vals = years.map((a) => a.harmonized);
  const typical = median(vals);
  if (years.length < 8 || typical < MIN_YEARLY) {
    return {
      parts: ['Too little fire here each year to measure a long-term trend reliably.'],
      short: ['Trend: too little fire to measure.'],
      facts: [],
      weak: true,
    };
  }
  const grade = s.reportCard.grade;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : 0);

  // Where MODIS missed most of the fires (grade Poor or Insufficient), the 2001-2011 values are too
  // low and any long-term "trend" is mostly the satellite change. Answer from the VIIRS years only.
  if (grade === 'Poor' || grade === 'Insufficient') {
    const viirs = years.filter((a) => a.year >= 2012);
    const early = avg(viirs.slice(0, 5).map((a) => a.harmonized));
    const late = avg(viirs.slice(-5).map((a) => a.harmonized));
    const r = early > 0 ? late / early : null;
    const lastY = viirs[viirs.length - 1]?.year;
    const parts: Part[] = [
      b('Not measurable over the whole record here. '),
      'Before 2012 the older satellite missed most of the small fires in this area, so a 2001–', String(lastY),
      ' trend would mostly show the change of satellite. ',
    ];
    if (r !== null && viirs.length >= 10) {
      parts.push(
        'Using the newer satellite only: ', b(`${viirs[viirs.length - 5].year}–${lastY}`), ' averaged ', b(times(r)),
        ` the ${viirs[0].year}–${viirs[4].year} level`,
        r >= 1.3 ? ', so burning has increased.' : r <= 0.77 ? ', so burning has decreased.' : ', about the same.'
      );
    }
    return {
      parts,
      short:
        r !== null && viirs.length >= 10
          ? ['Trend: since 2012, recent years are ', b(times(r)), ' the early VIIRS years.']
          : ['Trend: not measurable reliably here.'],
      facts: [{ label: 'Biggest year since 2012', value: (() => {
        const top = [...viirs].sort((x, y) => y.harmonized - x.harmonized)[0];
        return top ? `${top.year} · ${fmtNum(top.harmonized)}` : '—';
      })() }],
      weak: true,
    };
  }

  const first5 = avg(vals.slice(0, 5));
  const last5 = avg(vals.slice(-5));
  const top10 = [...years].sort((x, y) => y.harmonized - x.harmonized).slice(0, 10);
  const recentCut = years[years.length - 1].year - 9;
  const recentInTop = top10.filter((a) => a.year >= recentCut).length;
  const biggest = top10[0];
  const since = years[0].year;
  const pctYr = Math.abs(t.slopePctPerYear).toFixed(1);

  const parts: Part[] = [];
  if (t.significant && t.slopePctPerYear > 0) parts.push(b('Yes. '), 'Fire has risen about ', b(`${pctYr}% a year`), ` since ${since}, a statistically clear rise. `);
  else if (t.significant) parts.push(b('No, it is falling. '), 'Fire has dropped about ', b(`${pctYr}% a year`), ` since ${since}, a statistically clear fall. `);
  else parts.push(b('No clear trend. '), 'Year-to-year swings are bigger than any long-term change. ');
  if (first5 > 0) parts.push('The last 5 years averaged ', b(times(last5 / first5)), ' the first 5. ');
  parts.push(
    b(`${recentInTop} of the 10`), ' biggest years came in the last decade',
    recentInTop >= 6 ? ', so big fire years are becoming more common.' : recentInTop <= 2 ? ', so big fire years are rarer now.' : '.'
  );
  const weak = false;

  return {
    parts,
    short:
      t.significant && t.slopePctPerYear > 0
        ? ['Trend: rising about ', b(`${pctYr}% a year`), ` since ${since}.`]
        : t.significant
          ? ['Trend: falling about ', b(`${pctYr}% a year`), ` since ${since}.`]
          : ['Trend: no clear long-term change since ', b(since), '.'],
    facts: [
      { label: 'Biggest year', value: `${biggest.year} · ${fmtNum(biggest.harmonized)}` },
      { label: 'Typical year', value: fmtNum(typical) },
    ],
    weak,
  };
}

/** Largest years, for the trend chapter's evidence card. */
export function topYears(s: SummaryResponse, n = 5) {
  const years = s.calendar.annual.filter((a) => a.year >= 2001 && !a.provisional);
  const typical = median(years.map((a) => a.harmonized));
  return [...years]
    .sort((x, y) => y.harmonized - x.harmonized)
    .slice(0, n)
    .map((a) => ({ year: a.year, value: a.harmonized, ratio: typical > 0 ? a.harmonized / typical : null, era: a.sensorEra }));
}

/* ----------------------------------------------------------------------------- 06 · trust */

export function trustInsight(s: SummaryResponse): Insight {
  const ex = s.exclusions;
  const rc = s.reportCard;
  const industry = ex.totalRaw > 0 ? (ex.gasFlares + ex.staticIndustrial) / ex.totalRaw : 0;
  const parts: Part[] = [];
  if (ex.totalRaw > 0) {
    parts.push(
      'Of ', b(fmtNum(ex.totalRaw)), ' raw satellite detections here in this period, ', b(pct(industry)),
      industry >= 0.5 ? ' were oil, gas and other industry, not fire. ' : ' were industry or other non-fire heat. ',
      'They were removed before counting. '
    );
  } else {
    parts.push('No satellite detections here in this period. ');
  }
  const err = Number.isFinite(rc.meanAnnualErrorPct) ? `${rc.meanAnnualErrorPct.toFixed(1)}%` : null;
  if (rc.grade === 'Good' || rc.grade === 'Fair') {
    parts.push('Years before 2012 are rated ', b(rc.grade), ': in 2012–2017, when both satellites flew, the converted MODIS record was within ', b(err ?? '—'), ' of VIIRS per year.');
  } else if (rc.grade === 'Poor') {
    parts.push('Years before 2012 are rated ', b('Poor'), ': the older satellite missed many of the small fires here, so early values are unreliable.');
  } else {
    parts.push('There were too few fires in 2012–2017 to test the conversion here, so treat years before 2012 as a rough guide.');
  }
  return {
    parts,
    short: [
      'Trust: ', b(pct(industry)), ' of detections were industry and removed; early years rated ', b(rc.grade), '.',
    ],
    facts: [
      { label: 'Removed as industry', value: pct(industry) },
      { label: 'Pre-2012 grade', value: rc.grade },
    ],
    weak: rc.grade === 'Poor' || rc.grade === 'Insufficient',
  };
}

/* ----------------------------------------------------------------------------- next · outlook */

/** Next-month forecast. Returns null when there is no outlook (offline sample, no coverage). */
export function nextInsight(s: SummaryResponse): Insight | null {
  const o = s.outlook;
  const n = o?.next;
  if (!o || !n) return null;
  const ts = o.trackSummary;
  const chance = pct(n.pBusier);
  const span = `${ts.fromYear}–${s.latestDate.slice(0, 4)}`;
  const facts: Fact[] = [];
  const parts: Part[] = [];
  let short: Part[];

  if (!n.inSeason) {
    parts.push(
      'No forecast for ', b(n.label), `: ${MONTH_FULL[n.month - 1]} is normally almost fire-free here (usual level: `,
      b(fmtNum(Math.round(n.usual))), ' hotspot-days), so there is nothing to predict.'
    );
    short = ['Next month: ', b('no forecast'), `, ${MONTH_FULL[n.month - 1]} is normally almost fire-free here`];
    return { parts, short, facts: [{ label: `Usual ${MONTH_NAMES[n.month - 1]}`, value: fmtNum(Math.round(n.usual)) }], weak: true };
  }

  const recent =
    n.last12Ratio >= 1.15
      ? `the last 12 months ran ${times(n.last12Ratio)} their usual level`
      : n.last12Ratio <= 0.87
        ? `the last 12 months ran at ${times(n.last12Ratio)} their usual level`
        : 'the last 12 months were close to their usual level';
  const last = `${n.lastMonth.label} came in at ${times(n.lastMonth.ratio)} its usual`;

  if (n.call === 'busier') {
    parts.push(b(n.label), ' is likely to be ', b('busier than usual'), ': a ', b(chance), ` chance. Why: ${recent}; ${last}.`);
    short = ['Next month (', n.label, '): likely ', b('busier than usual'), ', ', b(chance), ' chance'];
  } else if (n.call === 'quieter') {
    parts.push(
      b(n.label), ' is likely to be ', b('quieter than usual'), ': only a ', b(chance), ` chance of a busier month. Why: ${recent}; ${last}.`
    );
    short = ['Next month (', n.label, '): likely ', b('quieter than usual'), ', ', b(pct(1 - n.pBusier)), ' chance'];
  } else {
    parts.push(
      b('No clear signal'), ' for ', b(n.label), ': the chance of a busier-than-usual month is ', b(chance),
      `, too close to call. Why: ${recent}; ${last}.`
    );
    short = ['Next month (', n.label, '): ', b('no clear signal'), ', ', b(chance), ' chance of busier than usual'];
  }
  if (ts.calls >= 6) {
    parts.push(' In ', span, ' the model made ', b(ts.calls), ' calls for this area and ', b(ts.hits), ' came true.');
  }
  facts.push({ label: 'Chance busier', value: chance });
  facts.push({ label: `Usual ${MONTH_NAMES[n.month - 1]}`, value: fmtNum(Math.round(n.usual)) });
  if (ts.calls > 0) facts.push({ label: `Record here ${span}`, value: `${ts.hits} of ${ts.calls}` });
  facts.push({ label: 'All areas, unseen years', value: `${pct(o.skill.accuracy)} right` });
  return { parts, short, facts, weak: ts.calls < 6 };
}
