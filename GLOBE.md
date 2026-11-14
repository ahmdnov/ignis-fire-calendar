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
