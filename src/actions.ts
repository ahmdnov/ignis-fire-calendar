/**
 * "What to do": suggestions derived from the same numbers as the other chapters, by fixed rules.
 * Nothing here knows about weather, staffing, budgets or local law, so every suggestion carries the
 * evidence it rests on and the page presents the list as a checklist to discuss, not as orders.
 * A rule stays silent when its evidence is weak (too little fire, unclear trend, no clear signal).
 */
import type { AreaSelection, BreakdownResponse, SummaryResponse } from './types';
import { MIN_YEARLY, fireSeason, judgeable, provincesForHalf, type Insight, type Part } from './insights';
import { MONTH_FULL, fmtNum } from './util';

export type ActionWhen = 'now' | 'next-month' | 'before-season' | 'yearly' | 'reporting';

export interface Action {
  when: ActionWhen;
  /** short label for the timing, e.g. "Before May" */
  whenLabel: string;
  title: string;
  /** the evidence, in one sentence */
  why: Part[];
  /** who would normally act on it */
  who: string;
  /** the tab that shows the evidence */
  see: string;
}

const b = (s: string | number): Part => ({ b: String(s) });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (x: number) => (x >= 10 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`);
const median = (xs: number[]) => {
  const v = [...xs].sort((x, y) => x - y);
  const m = Math.floor(v.length / 2);
  return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : 0;
};
const list = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const ORDER: ActionWhen[] = ['now', 'next-month', 'before-season', 'yearly', 'reporting'];

export function buildActions(s: SummaryResponse, area: AreaSelection, breakdown: BreakdownResponse | null): Action[] {
  const out: Action[] = [];
  const years = s.calendar.annual.filter((a) => a.year >= 2001 && !a.provisional);
  const typical = median(years.map((a) => a.harmonized));
  const thin = years.length < 8 || typical < MIN_YEARLY;
  const grade = s.reportCard.grade;
  const weakHistory = grade === 'Poor' || grade === 'Insufficient';

  if (thin) {
    // Too little fire for any planning rule. Say that, plus the reporting caution below if it applies.
    out.push({
      when: 'yearly',
      whenLabel: 'In general',
      title: 'Do not build a fire plan on these numbers alone',
      why: ['A typical year here has only ', b(fmtNum(Math.round(typical))), ' hotspot-days, too few for the season, trend or forecast to be reliable. Rely on local reports.'],
      who: 'Anyone using this page',
      see: 'sec-trust',
    });
  } else {
    // ---- the latest year against normal
    const last = years[years.length - 1];
    // Where the pre-2012 record is unreliable, "normal" means the newer satellite's years only.
    const ref = years.slice(0, -1).filter((a) => !weakHistory || a.year >= 2012);
    const earlier = median(ref.map((a) => a.harmonized));
    const refSpan = weakHistory ? ` in ${ref[0]?.year}–${ref[ref.length - 1]?.year}` : '';
    const yr = earlier > 0 ? last.harmonized / earlier : null;
    if (yr !== null && yr >= 1.3) {
      out.push({
        when: 'now',
        whenLabel: 'Now',
        title: `Review what made ${last.year} so active before the next season`,
        why: [`${last.year} ended at `, b(times(yr)), ' a normal year (', b(fmtNum(Math.round(last.harmonized))), ` hotspot-days against a usual ${fmtNum(Math.round(earlier))}${refSpan}).`],
        who: 'Fire service and environment agencies',
        see: 'sec-year',
      });
    }

    // ---- where: the province that changed most, and where most of the fire is
    if (breakdown && breakdown.total > 0 && area.kind === 'region') {
      const provs = breakdown.provinces;
      // "Above its own normal" leans on the early years, so it is not used where those are unreliable.
      const hot = provs
        .filter((p) => !weakHistory && judgeable(p, breakdown.total) && (p.ratio ?? 0) >= 1.5)
        .sort((x, y) => (y.ratio ?? 0) - (x.ratio ?? 0));
      if (area.provinceCode) {
        const me = provs.find((p) => p.id === area.provinceCode);
        if (me && !weakHistory && judgeable(me, breakdown.total) && (me.ratio ?? 0) >= 1.5) {
          out.push({
            when: 'now',
            whenLabel: 'Now',
            title: `Find out what changed in ${me.name}`,
            why: ['It ran at ', b(times(me.ratio as number)), ' its own normal for these dates. Possible causes to check: new farmland, a change in burning practice, or an unusually dry year.'],
            who: 'Provincial environment and agriculture offices',
            see: 'sec-where',
          });
        }
      } else {
        if (hot.length) {
          out.push({
            when: 'now',
            whenLabel: 'Now',
            title: `Send inspectors to ${hot[0].name} first`,
            why: [
              b(hot[0].name), ' ran at ', b(times(hot[0].ratio as number)), ' its own normal for these dates, the furthest above normal of any province',
              hot.length > 1 ? `; ${list(hot.slice(1, 3).map((p) => p.name))} ${hot.length > 2 ? 'are' : 'is'} next.` : '.',
            ],
            who: 'Environment and agriculture inspectors',
            see: 'sec-where',
          });
        }
        const half = provincesForHalf(provs);
        if (half <= Math.max(2, Math.ceil(provs.length / 3))) {
          const names = provs.slice(0, half).map((p) => p.name);
          out.push({
            when: 'before-season',
            whenLabel: 'Each season',
            title: `Put most crews and patrols in ${list(names)}`,
            why: [half === 1 ? 'This one province holds ' : `These ${half} of ${provs.length} provinces hold `, b('half'), ` of ${breakdown.countryName}'s fire in this period.`],
            who: 'Fire service planners',
            see: 'sec-where',
          });
        }
      }
    }

    // ---- next month
    const n = s.outlook?.next;
    if (n && n.inSeason) {
      const usual = fmtNum(Math.round(n.usual));
      if (n.call === 'busier') {
        out.push({
          when: 'next-month',
          whenLabel: n.label,
          title: `Add capacity for ${n.label}`,
          why: ['The outlook gives a ', b(pct(n.pBusier)), ` chance of a busier-than-usual month (usual: ${usual} hotspot-days).`],
          who: 'Fire service duty planners',
          see: 'sec-next',
        });
      } else if (n.call === 'quieter') {
        out.push({
          when: 'next-month',
          whenLabel: n.label,
          title: `Use ${n.label} for training and equipment maintenance`,
          why: ['The outlook gives only a ', b(pct(n.pBusier)), ' chance of a busier-than-usual month, so it is the likeliest quiet window.'],
          who: 'Fire service duty planners',
          see: 'sec-next',
        });
      } else if (n.call === 'unclear') {
        out.push({
          when: 'next-month',
          whenLabel: n.label,
          title: `Plan ${n.label} as a normal month`,
          why: ['The outlook is too close to call (', b(pct(n.pBusier)), ` chance of busier than usual), so staff for the usual level of about ${usual} hotspot-days.`],
          who: 'Fire service duty planners',
          see: 'sec-next',
        });
      }
    }

    // ---- season timing
    const season = fireSeason(s.climatology.months.map((m) => m.median));
    if (season && season.clear) {
      const before = MONTH_FULL[(season.start + 10) % 12];
      const end = MONTH_FULL[(season.start + season.len - 2) % 12];
      out.push({
        when: 'before-season',
        whenLabel: `By end of ${before}`,
        title: `Have crews, equipment and burning-ban notices ready by the end of ${before}`,
        why: [
          'The fire season runs ', b(`${MONTH_FULL[season.start - 1]}–${end}`), ' and holds ', b(pct(season.share)), " of a normal year's fire",
          season.clearPeak ? [', peaking in ', b(MONTH_FULL[season.peak - 1]), '.'] : ['.'],
        ].flat(),
        who: 'Fire service, agriculture ministry, health and air-quality agencies',
        see: 'sec-when',
      });
    } else if (season) {
      out.push({
        when: 'yearly',
        whenLabel: 'All year',
        title: 'Keep the same readiness all year',
        why: ['Fire here is spread through the year with no clear season, so there is no quiet period to stand down in.'],
        who: 'Fire service planners',
        see: 'sec-when',
      });
    }

    // ---- long-term trend (only where the early record can be trusted)
    const t = s.calendar.trend;
    if (!weakHistory && t.significant && Math.abs(t.slopePctPerYear) >= 1) {
      const first = years.slice(0, 5).reduce((a, c) => a + c.harmonized, 0) / 5;
      const lastFive = years.slice(-5).reduce((a, c) => a + c.harmonized, 0) / 5;
      if (t.slopePctPerYear > 0) {
        out.push({
          when: 'yearly',
          whenLabel: 'Next budget',
          title: 'Budget for more fire each year, not for the past average',
          why: [
            'Fire has risen about ', b(`${t.slopePctPerYear.toFixed(1)}% a year`), ' since 2001',
            first > 0 ? [`; the last 5 years averaged `, b(times(lastFive / first)), ' the first 5.'] : ['.'],
          ].flat(),
          who: 'Ministries and budget holders',
          see: 'sec-trend',
        });
      } else {
        out.push({
          when: 'yearly',
          whenLabel: 'Next budget',
          title: 'Keep the measures that are working, and record what they are',
          why: ['Fire has fallen about ', b(`${Math.abs(t.slopePctPerYear).toFixed(1)}% a year`), ' since 2001, a statistically clear decline.'],
          who: 'Ministries and budget holders',
          see: 'sec-trend',
        });
      }
    }
  }

  // ---- reporting cautions
  const ex = s.exclusions;
  const industry = ex.totalRaw > 0 ? (ex.gasFlares + ex.staticIndustrial) / ex.totalRaw : 0;
  if (industry >= 0.5) {
    out.push({
      when: 'reporting',
      whenLabel: 'When reporting',
      title: 'Quote these filtered numbers, never raw satellite fire counts',
      why: [b(pct(industry)), ' of the raw detections here are oil, gas and other industry, not vegetation fire. Raw counts would overstate fire several times over.'],
      who: 'Analysts, journalists and agencies publishing figures',
      see: 'sec-trust',
    });
  }
  if (weakHistory && !thin) {
    out.push({
      when: 'reporting',
      whenLabel: 'When reporting',
      title: 'Make long-term comparisons from 2012 onward only',
      why: ['Before 2012 the older satellite missed most of the small fires here, so earlier years look quieter than they were.'],
      who: 'Analysts, journalists and agencies publishing figures',
      see: 'sec-trust',
    });
  }

  return out.sort((x, y) => ORDER.indexOf(x.when) - ORDER.indexOf(y.when));
}

/** The chapter's answer and briefing line. */
export function actionsInsight(actions: Action[], areaLabel: string): Insight | null {
  if (!actions.length) return null;
  const first = actions[0];
  const lead = first.title.charAt(0).toLowerCase() + first.title.slice(1);
  return {
    parts: [
      b(`${actions.length} suggestion${actions.length > 1 ? 's' : ''}`), ` for ${areaLabel}, most urgent first. Start here: `, b(lead),
      '. Each one shows the number it rests on. They come from fixed rules that know nothing about weather, staffing or local law, so use them as a checklist to discuss, and confirm on the ground before acting.',
    ],
    short: ['What to do: ', b(lead), actions.length > 1 ? `, and ${actions.length - 1} more` : ''],
    facts: [],
  };
}
