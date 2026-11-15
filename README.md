# IGNIS: harmonized fire calendar

**NASA Space Apps Challenge 2026 · "Harmonization of MODIS and VIIRS Hot Spots"**

**Live site: https://ahmdnov.github.io/ignis-fire-calendar/**

IGNIS turns 25 years of NASA FIRMS fire hotspots into one consistent record and answers plain questions
about any covered area: is it burning more than normal, where, when in the year, how this year is going,
whether it is getting worse, what is likely next month, and how far the numbers can be trusted.

MODIS (2000–) and VIIRS (2012–) see fires differently, so stacking the two records creates a false jump in
2012. The data pipeline behind this site ([EmberCal](https://github.com/ahmdnov/embercal)) calibrates every
satellite to one scale, removes gas flares and other industrial heat, and validates the result on years it
never saw (monthly error 71% → 12%).

Coverage: Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, Oman, Iraq, Iran and Argentina, 2000–2025.

## The live site and the full version

The live site is a static copy. It holds real, precomputed results for every country and province at the
three preset periods (last 30 days, 12 months, 5 years) with the 2001–2025 baseline.

Drawing your own area, typing coordinates, custom dates, a custom baseline and the per-detection CSV export
need the data server, so they only work in the full version run locally.

## Run the full version locally

Requires Node 18+ and the EmberCal data server (Python 3.11+; see its README for the data download).

```
# 1. data server (in the EmberCal folder), port 8000
python -m uvicorn server.app:app --port 8000

# 2. this front end, port 3000 (it forwards /api to port 8000)
npm install
npm run dev
```

Tests: `npx tsx --test src/insights.test.ts src/util.test.ts src/intro/burnTimeline.test.ts src/intro/fireAudioSchedule.test.ts`

## Rebuild the static site

```
VITE_STATIC=1 npx vite build --base=./
python <EmberCal folder>/pipeline/export_static.py dist/data
```

Then publish the `dist` folder (this repository serves it from the `gh-pages` branch).

## Data and credits

- NASA FIRMS active fire data: MODIS Collection 6.1, VIIRS 375 m (S-NPP and NOAA-20).
- NASA GIBS imagery (VIIRS Black Marble night lights, corrected reflectance); NASA Blue Marble relief.
- Natural Earth boundaries.

## Use of AI

The code, the data pipeline and the documentation were written with the help of an AI coding assistant
(Anthropic's Claude). The running app uses no AI: every number comes from a deterministic, tested pipeline,
and the sentences on the page are filled from fixed templates.
