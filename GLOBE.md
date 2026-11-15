# IGNIS — interactive globe

Based on mnv-nasa/INGIS, commit a342721.

## Run

Requires a current Node.js version supported by Vite 8 (Node 22.12+ recommended).

```
npm ci
npm run dev
```

Open the address printed by Vite. The Explore dashboard opens in 3D Globe mode. Use Map to return to the existing MapLibre view. Drawing an area opens Map; switching back to the globe displays that selection.

The globe uses the same selected area, dates and API result as the map. Click an activity cell for its harmonized hotspot-days. Drag to rotate, scroll to zoom, or use the labelled buttons. Focus region returns the camera to the selected area. Auto orbit is opt-in and stops when interacting.

The existing app uses generated fallback data if its API is unavailable. The globe labels this SAMPLE DATA — NOT LIVE READINGS. The globe covers the provided Gulf and Argentina dataset; other parts of Earth do not imply data coverage. This repository does not contain the production API server.

## Changes

- Lazy-loaded Three.js globe with locally bundled Earth imagery.
- Shared region/date/ramp controls and selected-area outlines.
- Country selection and activity-cell details.
- Software-rendered interactive Earth fallback for devices without WebGL. This mode supports rotation, zoom and sidebar region selection; cell picking and automatic orbit use the WebGL renderer.
- Existing esbuild dependency updated to satisfy Vite 8's declared peer requirement.

## Assets

`public/globe/earth.jpg`: NASA Blue Marble Earth imagery, obtained from https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg . Earth texture is illustrative background imagery, not current satellite fire imagery. Attribution is also displayed in the globe.

## Validation

TypeScript check (`npx tsc --noEmit`) and production build (`npm run build`) pass. The software-rendered globe was visually inspected in the browser, including rotation and Focus region. The preview browser disables WebGL, so hardware rendering and its cell-picking interaction could not be visually verified. No live API or production-data validation is implied by the sample preview.

## Black globe revision
Black material with relief lighting, worldwide Natural Earth country outlines, IGNIS ember gradient (#EA580C to #F59E0B), and eased 1.6-second country focus/zoom in both renderers. Cividis remains available. Natural Earth country boundaries: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson (public domain). TypeScript and production build pass; compatibility renderer visually checked with Argentina selected. Hardware rendering remains unverified in this WebGL-disabled browser.

## Real data, fire intro and dashboard redesign (14 Nov 2026)

### Run with the real NASA FIRMS archive

Two processes. The data server lives in the EmberCal project (`Desktop/hakathon`), this folder is the front end.

```
# 1. data server (port 8000)
cd C:\Users\Ahmed\Desktop\hakathon
python -m uvicorn server.app:app --host 127.0.0.1 --port 8000

# 2. front end (port 3000; vite.config.ts proxies /api to port 8000)
npm run dev
```

If the data server is not running, the app falls back to generated sample data and says so everywhere
("Offline sample · not real readings"). It never shows sample numbers as real ones.

### What changed

- `src/realApi.ts`, `src/api.ts`: adapter between the server's JSON and the view types in `src/types.ts`.
  A reachable server that rejects a request shows an error instead of switching to sample data.
- `src/intro/`: fire burn-through intro ported from the pyrography atelier project (WebGL shader, particles,
  timeline, Web Audio fire sound), recoloured to the IGNIS ember palette. `IntroController.tsx` runs the clock.
  Sound is off until the visitor turns it on. Esc or "Skip intro" skips; reduced motion or no WebGL skips the burn.
- `src/components/CommandBar.tsx`: sticky command bar (area, period, baseline, colour ramp, export) and section
  jump-nav. Replaces the left sidebar. Popovers become bottom sheets under 780 px.
- `src/App.tsx`: answer-first, full-width layout; URL keeps area, period and view (`?area=c:IRQ&from=…&to=…`).
- `src/styles.css`, `src/util.ts` (`FIRE_STOPS`): one ember palette. The "Fire heat" ramps pass the dataviz
  ordinal validator in both themes. MODIS era = warm ash, VIIRS era = ember (colour-blind separation dE 12.8).
  The ash fails only the validator's "reads as grey" check, which is the intent.
- Server (`hakathon/server/app.py`): `window` block (the selected dates compared with the same dates in every
  other year, from daily data), `coverage` flag, and per-country roll-ups (Argentina summary 1.8 s -> 0.13 s).

### Checks run

`npx tsc --noEmit`, `npm run build`, `npx tsx --test src/intro/*.test.ts src/util.test.ts` (15 pass),
`python -m pytest -q` in hakathon (11 pass), and a scripted browser click-through (intro, all area modes,
periods, baseline, exports, no-coverage area, phone width, light theme, print, reduced motion; no console errors).
The fire sound was not listened to: the test browser has no audio output.

## Analytics as a story (15 Nov 2026)

Below the headline, the dashboard is six question chapters. Each chapter has a question, an answer computed from
the data, a "how to read" line, then the charts as evidence. A "things to know" briefing under the headline sums
the chapters up.

- Chapters: 01 Now · 02 Where (with province ranking) · 03 When · 04 This year · 05 Trend · 06 Trust.
- `src/insights.ts`: the answers, as pure functions. When data is too thin, the chapter shows "Limited data".
  Where the pre-2012 record is rated Poor or Insufficient, the trend uses VIIRS years only.
  Tests: `src/insights.test.ts`.
- `src/components/Story.tsx`: chapter frame, briefing, province ranking, record-month, month-by-month and
  record-year cards.
- Server: `POST /api/breakdown {country, start, end, baseline}` returns every province's share of the fire and its
  ratio against its own normal. Cells are mapped to provinces at startup (about 2 s). Tests in
  `hakathon/tests/test_api.py`.
