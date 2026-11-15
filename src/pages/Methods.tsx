import type { MetaResponse } from '../types';
import { fmtDate, fmtNum, gradeColor } from '../util';

const num = (v: number, d: number, suffix = '') => (Number.isFinite(v) ? `${v.toFixed(d)}${suffix}` : '—');
const signed = (v: number, d: number, suffix = '') =>
  Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}${suffix}` : '—';
import { SeamSmallMultiples } from '../components/Charts';

interface MethodsProps {
  meta: MetaResponse;
}

const PIPELINE_STEPS = [
  {
    step: '01 · Ingest',
    title: 'Multi-Mission FIRMS Archive',
    body: 'Loads every MODIS (Terra & Aqua, 1 km) and VIIRS 375 m (S-NPP & NOAA-20) detection from the NASA FIRMS country archive, from November 2000 onward.',
  },
  {
    step: '02 · Screen Flares',
    title: 'Industrial & Flare Masking',
    body: 'Keeps only NASA’s vegetation-fire type, drops low-confidence detections, and removes cells that stay hot for 60+ days across 6+ years (flares, refineries).',
  },
  {
    step: '03 · Spatial Join',
    title: 'One Shared Unit: Hotspot-Days',
    body: 'Snaps detections to a 0.01° (~1 km) grid and counts each cell once per day, so one fire seen as seven VIIRS pixels is not counted seven times.',
  },
  {
    step: '04 · Overlap Fit',
    title: 'Country × Month Calibration',
    body: 'Learns a MODIS → VIIRS factor per country and month from 2012–2017, when both flew. Months with little data are pulled toward the country average.',
  },
  {
    step: '05 · Harmonize',
    title: 'One Unified Series',
    body: 'Scales MODIS-era counts into VIIRS S-NPP units and aligns NOAA-20 to S-NPP (k ≈ 0.99), which removes the artificial jump at 2012.',
  },
  {
    step: '06 · Validate',
    title: 'Leave-One-Year-Out CV',
    body: 'Hides one year at a time, predicts it from the others, and reports the error. Every area gets a grade, and MODIS-era bars carry error whiskers.',
  },
];

export function Methods({ meta }: MethodsProps) {
  return (
    <main
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '28px clamp(12px, 2vw, 28px) 64px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
      }}
    >
      {/* Header Summary */}
      <section className="bento-card">
        <div className="section-kicker" style={{ marginBottom: 6 }}>
          METHODOLOGY &amp; EMPIRICAL VALIDATION · NASA SPACE APPS 2026
        </div>
        <h1
          className="display-heading text-blur-reveal"
          style={{
            margin: '0 0 12px 0',
            fontSize: 'clamp(1.6rem, 2.7vw, 2.15rem)',
            fontWeight: 700,
            letterSpacing: '-0.034em',
            textWrap: 'balance',
          }}
        >
          Bridging the 2012 MODIS-to-VIIRS sensor discontinuity
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '78ch' }}>
          In 2012, NASA’s 375 m VIIRS sensor began detecting small agricultural and scrub fires that
          1 km MODIS often missed, so raw hotspot counts jump several-fold for no real reason. IGNIS
          turns {fmtNum(meta.totalHotspots)} detections across {meta.countriesCount} countries into one
          consistent fire calendar from {meta.archiveStart.slice(0, 4)} to {fmtDate(meta.latestDate)}
          {meta.isFallback ? ' (offline sample shown: start the data server for real values)' : ''}.
        </p>
      </section>

      {/* 6-Step Horizontal Pipeline Cards */}
      <section aria-labelledby="pipeline-heading">
        <div className="section-kicker" id="pipeline-heading">
          01 · HARMONIZATION PIPELINE
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
            gap: 12,
          }}
        >
          {PIPELINE_STEPS.map((s) => (
            <article key={s.step} className="bento-card" style={{ padding: '16px 16px' }}>
              <div
                className="font-mono"
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}
              >
                {s.step}
              </div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: 14.5, fontWeight: 700 }}>{s.title}</h2>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Leave-One-Year-Out Cross-Validation Table */}
      <section className="bento-card" aria-labelledby="loyo-heading">
        <div className="section-kicker" style={{ marginBottom: 4 }}>
          02 · LEAVE-ONE-YEAR-OUT CROSS-VALIDATION · MODIS AQUA → VIIRS S-NPP, 2012–2017
        </div>
        <h2
          id="loyo-heading"
          className="section-heading text-blur-reveal"
          style={{ margin: '0 0 16px 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.025em' }}
        >
          How much each method gets wrong on a year it has not seen
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 12px' }}>Method</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monthly error</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Yearly error</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Bias</th>
                <th style={{ padding: '10px 12px' }}>What it means</th>
              </tr>
            </thead>
            <tbody>
              {meta.loyoResults.map((row) => (
                <tr
                  key={row.method}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: row.recommended
                      ? 'color-mix(in srgb, var(--accent) 8%, transparent)'
                      : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 12px', fontWeight: row.recommended ? 700 : 500 }}>
                    {row.method}
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontWeight: row.recommended ? 700 : 500,
                      color: row.recommended ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    {num(row.monthlyWapePct, 1, '%')}
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontWeight: row.recommended ? 700 : 500,
                      color: row.recommended ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    {num(row.annualWapePct, 1, '%')}
                  </td>
                  <td className="font-mono" style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {signed(row.medianBiasPct, 1, '%')}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12.5 }}>
                    {row.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-Country Calibration Factors Table */}
      <section className="bento-card" aria-labelledby="country-k-heading">
        <div className="section-kicker" style={{ marginBottom: 4 }}>
          03 · PER-COUNTRY CALIBRATION FACTORS &amp; EXCLUSION SHARE
        </div>
        <h2
          id="country-k-heading"
          className="section-heading text-blur-reveal"
          style={{ margin: '0 0 16px 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.025em' }}
        >
          Conversion factors and results per country
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 12px' }}>Country</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>k_Aqua</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>k_Terra</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>k_NOAA-20</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Yearly error (CV)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Industry removed</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {meta.countryCalibrations.map((c) => (
                <tr key={c.iso3} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>
                    {c.name}{' '}
                    <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      ({c.iso3})
                    </span>
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {num(c.kAqua, 2)}
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {num(c.kTerra, 2)}
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {num(c.kNoaa20, 2)}
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {num(c.cvAnnualErrorPct, 1, '%')}
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {num(c.industrialSharePct, 0, '%')}
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: gradeColor(c.grade),
                    }}
                  >
                    {c.grade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 9-Country Seam Test Small Multiples */}
      <section aria-labelledby="seam-multiples-heading">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <div className="section-kicker" style={{ marginBottom: 4 }}>
              04 · SEAM TEST, COUNTRY BY COUNTRY (2012–2025)
            </div>
            <h2
              id="seam-multiples-heading"
              className="section-heading text-blur-reveal"
              style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.025em' }}
            >
              Scaled MODIS against what VIIRS really counted
            </h2>
          </div>
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--accent)' }}>■</span> Shaded = 2012–2017, used to fit · after the dashed
            line = never seen by the fit ·{' '}
            <span style={{ color: 'var(--series-2)' }}>━━</span> VIIRS S-NPP ·{' '}
            <span style={{ color: 'var(--series-1)' }}>╌╌</span> MODIS, scaled
          </div>
        </div>
        <SeamSmallMultiples countries={meta.countryCalibrations} />
      </section>

      {/* Limitations & Credits */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 18,
        }}
      >
        <div className="bento-card">
          <div className="section-kicker" style={{ marginBottom: 6 }}>
            05 · KNOWN LIMITATIONS
          </div>
          <h3
            className="section-heading text-blur-reveal"
            style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 700, letterSpacing: '-0.022em' }}
          >
            Physical &amp; statistical caveats
          </h3>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
            }}
          >
            <li>
              Cloud cover and thick smoke plumes block both MODIS and VIIRS thermal bands; low
              monthly counts during monsoon periods reflect visibility as well as fuel moisture.
            </li>
            <li>
              Small, short-lived agricultural burns (&lt; 0.5 ha) may ignite and extinguish between
              MODIS overpass windows, increasing CV uncertainty in 2000–2011 estimates.
            </li>
            <li>
              Multiplying cannot create fires MODIS never saw. Where fires are tiny (for example
              Bahrain), values before 2012 are unreliable, and the report card says so.
            </li>
            <li>
              A brand-new gas flare looks like a fire until it has burned long enough to be flagged.
            </li>
            <li>
              Coverage is {meta.countriesCount} countries and the archive ends on {fmtDate(meta.latestDate)}.
              Near-real-time months, once added, are hatched as provisional.
            </li>
          </ul>
        </div>

        <div className="bento-card">
          <div className="section-kicker" style={{ marginBottom: 6 }}>
            06 · DATA CREDITS &amp; TRANSPARENCY
          </div>
          <h3
            className="section-heading text-blur-reveal"
            style={{ margin: '0 0 10px 0', fontSize: 16, fontWeight: 700, letterSpacing: '-0.022em' }}
          >
            Open Earth-observation sources
          </h3>
          <p style={{ margin: '0 0 10px 0', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            Hotspot detections come from the <strong>NASA FIRMS</strong> archive (MODIS MCD14ML &amp;
            VIIRS 375 m VNP14IMG / VJ114IMG). True-colour and night-lights imagery
            served via <strong>NASA GIBS</strong>. Administrative boundaries derived from{' '}
            <strong>Natural Earth</strong>.
          </p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--text-muted)' }}>
            AI Disclosure: Statistical harmonization code, DuckDB aggregation queries, and interface
            engineering were developed for the NASA Space Apps Challenge 2026 IGNIS submission with
            AI-assisted engineering tooling, verified against held-out FIRMS overlap records.
          </p>
        </div>
      </section>
    </main>
  );
}
