import type { MetaResponse } from '../types';
import { fmtNum, gradeColor } from '../util';
import { SeamSmallMultiples } from '../components/Charts';

interface MethodsProps {
  meta: MetaResponse;
}

const PIPELINE_STEPS = [
  {
    step: '01 · Ingest',
    title: 'Multi-Mission FIRMS Archive',
    body: 'Loads daily MODIS Collection 6.1 (Terra & Aqua, 1 km) and VIIRS 375 m (S-NPP & NOAA-20) detections from 2000-11-01 through near-real-time.',
  },
  {
    step: '02 · Screen Flares',
    title: 'Industrial & Flare Masking',
    body: 'Removes persistent oil & gas flares, refineries, steelworks, low-confidence noise, and volcanic hotspots via multi-year persistence grids.',
  },
  {
    step: '03 · Spatial Join',
    title: 'Boundary & 0.01° Grid Aggregation',
    body: 'Indexes detections into ~1 km cells and aggregates monthly/daily totals for 177 countries, provinces, or custom polygons.',
  },
  {
    step: '04 · Overlap Fit',
    title: 'Country × Month Calibration',
    body: 'Fits pooled cross-sensor ratios on the 2012–2017 MODIS/VIIRS overlap window with empirical-Bayes shrinkage for low-fire months.',
  },
  {
    step: '05 · Harmonize',
    title: 'Unified 2000–2026 Series',
    body: 'Scales historical MODIS counts into VIIRS 375 m equivalents and aligns NOAA-20 to S-NPP (k = 0.99) to eliminate the 2012 cliff.',
  },
  {
    step: '06 · Validate',
    title: 'Leave-One-Year-Out CV',
    body: 'Grades every region by held-out annual WAPE and seam bias, surfacing uncertainty whiskers directly on MODIS-era bars.',
  },
];

export function Methods({ meta }: MethodsProps) {
  return (
    <main
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '32px 28px 64px',
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
          1 km MODIS often missed, creating an artificial 3×–5× jump in raw hotspot records. IGNIS
          calibrates {fmtNum(meta.totalHotspots)} detections across {meta.countriesCount} countries
          into a single statistically consistent 26-year fire calendar.
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
          02 · LEAVE-ONE-YEAR-OUT CROSS-VALIDATION (2012–2017 SEAM)
        </div>
        <h2
          id="loyo-heading"
          className="section-heading text-blur-reveal"
          style={{ margin: '0 0 16px 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.025em' }}
        >
          Calibration model comparison (WAPE)
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
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monthly WAPE</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Annual WAPE</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Median Seam Bias</th>
                <th style={{ padding: '10px 12px' }}>Diagnostic Notes</th>
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
                      color: row.recommended ? 'var(--good)' : 'var(--text-primary)',
                    }}
                  >
                    {row.monthlyWapePct.toFixed(1)}%
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontWeight: row.recommended ? 700 : 500,
                      color: row.recommended ? 'var(--good)' : 'var(--text-primary)',
                    }}
                  >
                    {row.annualWapePct.toFixed(1)}%
                  </td>
                  <td className="font-mono" style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {row.medianBiasPct >= 0 ? '+' : ''}
                    {row.medianBiasPct.toFixed(1)}%
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
          Showcase country parameters (k_Aqua, k_Terra, k_NOAA-20)
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
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Annual CV WAPE</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Industrial Excluded</th>
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
                    {c.kAqua.toFixed(2)}
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {c.kTerra.toFixed(2)}
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {c.kNoaa20.toFixed(2)}
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {c.cvAnnualErrorPct.toFixed(1)}%
                  </td>
                  <td className="font-mono" style={{ padding: '9px 12px', textAlign: 'right' }}>
                    {c.industrialSharePct.toFixed(0)}%
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
              04 · 9-COUNTRY SEAM TEST SMALL MULTIPLES (2012–2025)
            </div>
            <h2
              id="seam-multiples-heading"
              className="section-heading text-blur-reveal"
              style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.025em' }}
            >
              Harmonized MODIS vs. VIIRS S-NPP across calibration &amp; 2018 version shift
            </h2>
          </div>
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--accent)' }}>■</span> Shaded = 2012–2017 fit ·{' '}
            <span style={{ color: 'var(--series-2)' }}>━━</span> VIIRS S-NPP ·{' '}
            <span style={{ color: 'var(--series-1)' }}>╌╌</span> MODIS harmonized
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
              Recent 30-day VIIRS near-real-time (NRT) detections are marked provisional (hatched)
              until NASA’s standard science-quality reprocessing completes.
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
            Hotspot detections sourced from <strong>NASA FIRMS</strong> (MODIS Collection 6.1
            MCD14ML &amp; VIIRS 375 m VNP14IMG / VJ114IMG). True-colour and night-lights imagery
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
