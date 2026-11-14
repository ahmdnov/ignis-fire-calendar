import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type RasterTileSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Circle, Pentagon, RotateCcw, Square } from 'lucide-react';
import type {
  AreaInputMode,
  AreaSelection,
  BasemapId,
  DrawTool,
  MapResponse,
  ThemeMode,
} from '../types';
import {
  computeBbox,
  createCirclePolygon,
  createRectanglePolygon,
  estimateAreaKm2,
  fmtNum,
  haversineKm,
} from '../util';
import type { TooltipState } from './Tooltip';

interface MapViewProps {
  area: AreaSelection;
  mapData: MapResponse | null;
  basemap: BasemapId;
  onBasemapChange: (b: BasemapId) => void;
  theme: ThemeMode;
  areaInputMode: AreaInputMode;
  drawTool: DrawTool;
  onDrawToolChange: (t: DrawTool) => void;
  onSelectCountryCode: (code: string) => void;
  onCustomAreaDrawn: (newArea: AreaSelection) => void;
  onHoverTooltip: (tip: TooltipState | null) => void;
  latestDate: string;
}

function getRasterTileUrl(basemap: BasemapId, theme: ThemeMode, latestDate: string): string {
  if (basemap === 'night') {
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
  }
  if (basemap === 'truecolor') {
    // Use yesterday or latestDate for NASA GIBS true color reflectance
    const dt = new Date(`${latestDate}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - 1);
    const gibsDate = dt.toISOString().slice(0, 10);
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
  }
  return theme === 'light'
    ? 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
    : 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
}

export function MapView({
  area,
  mapData,
  basemap,
  onBasemapChange,
  theme,
  areaInputMode,
  drawTool,
  onDrawToolChange,
  onSelectCountryCode,
  onCustomAreaDrawn,
  onHoverTooltip,
  latestDate,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  // Interactive drawing state
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [liveRadiusKm, setLiveRadiusKm] = useState<number | null>(null);

  const onSelectCountryRef = useRef(onSelectCountryCode);
  onSelectCountryRef.current = onSelectCountryCode;
  const onHoverRef = useRef(onHoverTooltip);
  onHoverRef.current = onHoverTooltip;
  const areaInputModeRef = useRef(areaInputMode);
  areaInputModeRef.current = areaInputMode;
  const drawToolRef = useRef(drawTool);
  drawToolRef.current = drawTool;
  const onCustomAreaDrawnRef = useRef(onCustomAreaDrawn);
  onCustomAreaDrawnRef.current = onCustomAreaDrawn;

  // Initialize MapLibre instance once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: MapLibreMap | null = null;
    try {
      map = new MapLibreMap({
        container: el,
        center: area.center,
        zoom: 4.7,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: 'raster',
              tiles: [getRasterTileUrl(basemap, theme, latestDate)],
              tileSize: 256,
              maxzoom: 9,
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: {
                'background-color': theme === 'light' ? '#F4F4F5' : '#09090B',
              },
            },
            {
              id: 'basemap-tiles',
              type: 'raster',
              source: 'basemap',
              paint: { 'raster-opacity': 0.88 },
            },
          ],
        },
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('error', () => {
      // Tile fetch errors in hermetic sandboxes shouldn't break the vector layers
    });

    map.on('load', () => {
      if (!map) return;
      map.addSource('countries', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': '#F59E0B',
          'fill-opacity': 0.04,
        },
      });
      map.addLayer({
        id: 'countries-outline',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': 'rgba(255,255,255,0.22)',
          'line-width': 1,
        },
      });

      map.addSource('aoi', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'aoi-fill',
        type: 'fill',
        source: 'aoi',
        paint: {
          'fill-color': '#F59E0B',
          'fill-opacity': 0.12,
        },
      });
      map.addLayer({
        id: 'aoi-outline',
        type: 'line',
        source: 'aoi',
        paint: {
          'line-color': '#F59E0B',
          'line-width': 2.2,
        },
      });

      map.addSource('draw-preview', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'draw-preview-fill',
        type: 'fill',
        source: 'draw-preview',
        paint: {
          'fill-color': '#38BDF8',
          'fill-opacity': 0.18,
        },
      });
      map.addLayer({
        id: 'draw-preview-line',
        type: 'line',
        source: 'draw-preview',
        paint: {
          'line-color': '#38BDF8',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });

      map.addSource('hotspots', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'hotspots-glow',
        type: 'circle',
        source: 'hotspots',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'harmonizedCount'],
            1,
            5,
            20,
            12,
            60,
            20,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'harmonizedCount'],
            1,
            '#F59E0B',
            18,
            '#F97316',
            45,
            '#EF4444',
          ],
          'circle-opacity': 0.28,
          'circle-blur': 0.6,
        },
      });
      map.addLayer({
        id: 'hotspots-core',
        type: 'circle',
        source: 'hotspots',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'harmonizedCount'],
            1,
            2.5,
            20,
            5,
            60,
            8,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'harmonizedCount'],
            1,
            '#FDE68A',
            12,
            '#F59E0B',
            35,
            '#EF4444',
          ],
          'circle-opacity': 0.92,
          'circle-stroke-width': 0.6,
          'circle-stroke-color': 'rgba(9,9,11,0.7)',
        },
      });

      map.on('mousemove', 'hotspots-core', (e: MapLayerMouseEvent) => {
        if (!map) return;
        map.getCanvas().style.cursor = 'pointer';
        const feat = e.features?.[0];
        if (!feat || !feat.properties) return;
        const p = feat.properties;
        onHoverRef.current({
          x: e.originalEvent.clientX,
          y: e.originalEvent.clientY,
          title: `0.01° Grid Cell (${Number(p.lat).toFixed(2)}°, ${Number(p.lon).toFixed(2)}°)`,
          lines: [
            { label: 'Harmonized detections', value: fmtNum(Number(p.harmonizedCount)), color: '#F97316' },
            { label: 'Raw detections', value: fmtNum(Number(p.count)) },
            { label: 'Peak FRP', value: `${Number(p.frpMw).toFixed(1)} MW` },
            { label: 'Sensor', value: String(p.sensor) },
          ],
        });
      });

      map.on('mouseleave', 'hotspots-core', () => {
        if (!map) return;
        map.getCanvas().style.cursor = areaInputModeRef.current === 'draw' ? 'crosshair' : '';
        onHoverRef.current(null);
      });

      map.on('click', 'countries-fill', (e: MapLayerMouseEvent) => {
        if (areaInputModeRef.current === 'draw') return;
        const code = e.features?.[0]?.properties?.code;
        if (code) {
          onSelectCountryRef.current(String(code));
        }
      });

      setMapReady(true);
    });

    return () => {
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update basemap tile URL or theme background
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('basemap') as RasterTileSource | undefined;
    if (src && typeof src.setTiles === 'function') {
      src.setTiles([getRasterTileUrl(basemap, theme, latestDate)]);
    }
    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', theme === 'light' ? '#F4F4F5' : '#09090B');
    }
    if (map.getLayer('countries-outline')) {
      map.setPaintProperty(
        'countries-outline',
        'line-color',
        theme === 'light' ? 'rgba(9,9,11,0.2)' : 'rgba(255,255,255,0.22)'
      );
    }
  }, [basemap, theme, latestDate, mapReady]);

  // Sync GeoJSON sources & fit map bounds to active AOI
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !mapData) return;

    const aoiSrc = map.getSource('aoi') as GeoJSONSource | undefined;
    aoiSrc?.setData({
      type: 'FeatureCollection',
      features: [mapData.aoiFeature as GeoJSON.Feature],
    });

    const hsSrc = map.getSource('hotspots') as GeoJSONSource | undefined;
    hsSrc?.setData(mapData.hotspots as GeoJSON.FeatureCollection);

    const countrySrc = map.getSource('countries') as GeoJSONSource | undefined;
    countrySrc?.setData(mapData.countryOutlines as GeoJSON.FeatureCollection);

    const [minLon, minLat, maxLon, maxLat] = area.bbox;
    try {
      map.fitBounds(
        [
          [minLon, minLat],
          [maxLon, maxLat],
        ],
        { padding: 48, duration: 550, maxZoom: 9.5 }
      );
    } catch {
      // Ignore invalid bbox
    }
  }, [mapData, area, mapReady]);

  // Interactive Drawing Handlers (Polygon / Rectangle / Circle)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    map.getCanvas().style.cursor = areaInputMode === 'draw' ? 'crosshair' : '';

    const onClick = (e: MapMouseEvent) => {
      if (areaInputMode !== 'draw') return;
      const pt: [number, number] = [Number(e.lngLat.lng.toFixed(4)), Number(e.lngLat.lat.toFixed(4))];

      if (drawTool === 'circle') {
        if (draftPoints.length === 0) {
          setDraftPoints([pt]);
          setLiveRadiusKm(0);
        } else {
          const center = draftPoints[0];
          const rad = Math.max(5, Math.round(haversineKm(center[0], center[1], pt[0], pt[1])));
          const geom = createCirclePolygon(center[0], center[1], rad);
          onCustomAreaDrawnRef.current({
            id: `draw:circle:${center[0]}:${center[1]}:${rad}`,
            label: `Drawn circle (${rad} km radius)`,
            slug: `circle_${rad}km`,
            kind: 'draw',
            bbox: computeBbox(geom),
            center,
            geometry: geom,
            areaKm2: estimateAreaKm2(geom),
            circleRadiusKm: rad,
          });
          setDraftPoints([]);
          setHoverPoint(null);
          setLiveRadiusKm(null);
        }
        return;
      }

      if (drawTool === 'rectangle') {
        if (draftPoints.length === 0) {
          setDraftPoints([pt]);
        } else {
          const p0 = draftPoints[0];
          const geom = createRectanglePolygon(p0[0], p0[1], pt[0], pt[1]);
          const bbox = computeBbox(geom);
          onCustomAreaDrawnRef.current({
            id: `draw:rect:${bbox.join(':')}`,
            label: `Drawn rectangle (${bbox[1].toFixed(1)}°–${bbox[3].toFixed(1)}°N)`,
            slug: 'drawn_rectangle',
            kind: 'draw',
            bbox,
            center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
            geometry: geom,
            areaKm2: estimateAreaKm2(geom),
          });
          setDraftPoints([]);
          setHoverPoint(null);
        }
        return;
      }

      // Polygon mode
      setDraftPoints((prev) => [...prev, pt]);
    };

    const onMouseMove = (e: MapMouseEvent) => {
      if (areaInputMode !== 'draw' || draftPoints.length === 0) return;
      const pt: [number, number] = [Number(e.lngLat.lng.toFixed(4)), Number(e.lngLat.lat.toFixed(4))];
      setHoverPoint(pt);
      if (drawTool === 'circle') {
        setLiveRadiusKm(Math.round(haversineKm(draftPoints[0][0], draftPoints[0][1], pt[0], pt[1])));
      }
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
    };
  }, [areaInputMode, drawTool, draftPoints, mapReady]);

  // Update draw-preview GeoJSON layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('draw-preview') as GeoJSONSource | undefined;
    if (!src) return;

    if (draftPoints.length === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const endPt = hoverPoint || draftPoints[draftPoints.length - 1];
    if (drawTool === 'circle' && liveRadiusKm && liveRadiusKm > 0) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: createCirclePolygon(draftPoints[0][0], draftPoints[0][1], liveRadiusKm),
            properties: {},
          },
        ],
      });
    } else if (drawTool === 'rectangle' && hoverPoint) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: createRectanglePolygon(
              draftPoints[0][0],
              draftPoints[0][1],
              endPt[0],
              endPt[1]
            ),
            properties: {},
          },
        ],
      });
    } else {
      const coords = [...draftPoints, endPt];
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {},
          },
        ],
      });
    }
  }, [draftPoints, hoverPoint, drawTool, liveRadiusKm, mapReady]);

  const finishPolygon = () => {
    if (draftPoints.length < 3) return;
    const closed = [...draftPoints, draftPoints[0]];
    const geom = { type: 'Polygon' as const, coordinates: [closed] };
    const bbox = computeBbox(geom);
    onCustomAreaDrawn({
      id: `draw:poly:${draftPoints.length}:${bbox[0].toFixed(2)}`,
      label: `Custom polygon (${draftPoints.length} vertices)`,
      slug: 'custom_polygon',
      kind: 'draw',
      bbox,
      center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
      geometry: geom,
      areaKm2: estimateAreaKm2(geom),
    });
    setDraftPoints([]);
    setHoverPoint(null);
  };

  return (
    <section
      className="bento-card"
      style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
      aria-label="Interactive spatial hotspot map"
    >
      <div
        ref={containerRef}
        data-testid="maplibre-container"
        style={{
          width: '100%',
          height: 390,
          background: theme === 'light' ? '#F4F4F5' : '#09090B',
          position: 'relative',
        }}
      />

      {/* Fallback vector projection if WebGL fails in constrained environments */}
      {webglFailed && mapData && (
        <FallbackSvgMap area={area} mapData={mapData} />
      )}

      {/* Top-Left Always-Dark Frosted Obsidian HUD */}
      <div
        className="map-hud-panel"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 5,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}
        role="group"
        aria-label="Basemap layer switcher"
      >
        {(
          [
            { id: 'map', label: 'Map' },
            { id: 'night', label: 'VIIRS night lights' },
            { id: 'truecolor', label: 'VIIRS true colour' },
          ] as { id: BasemapId; label: string }[]
        ).map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onBasemapChange(b.id)}
            className={`map-hud-btn ${basemap === b.id ? 'map-hud-btn--active' : ''}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Draw-on-map Floating Tool Bar when Draw tab is active */}
      {areaInputMode === 'draw' && (
        <div
          className="map-hud-panel"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 5,
            padding: '5px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={() => {
              onDrawToolChange('polygon');
              setDraftPoints([]);
              setLiveRadiusKm(null);
            }}
            className={`map-hud-btn ${drawTool === 'polygon' ? 'map-hud-btn--active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Pentagon size={13} />
            Polygon
          </button>
          <button
            type="button"
            onClick={() => {
              onDrawToolChange('rectangle');
              setDraftPoints([]);
              setLiveRadiusKm(null);
            }}
            className={`map-hud-btn ${drawTool === 'rectangle' ? 'map-hud-btn--active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Square size={13} />
            Rectangle
          </button>
          <button
            type="button"
            onClick={() => {
              onDrawToolChange('circle');
              setDraftPoints([]);
              setLiveRadiusKm(null);
            }}
            className={`map-hud-btn ${drawTool === 'circle' ? 'map-hud-btn--active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Circle size={13} />
            Circle
          </button>
          {drawTool === 'polygon' && draftPoints.length >= 3 && (
            <button
              type="button"
              onClick={finishPolygon}
              className="map-hud-btn map-hud-btn--active"
            >
              Finish ({draftPoints.length})
            </button>
          )}
          {draftPoints.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraftPoints([]);
                setHoverPoint(null);
                setLiveRadiusKm(null);
              }}
              aria-label="Clear drawing"
              className="map-hud-btn"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      )}

      {/* Bottom-Left Telemetry Legend & Live Draw Readout */}
      <div
        className="map-hud-panel font-mono"
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 5,
          padding: '7px 11px',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span>
          <span style={{ color: '#F59E0B' }}>■</span> AOI boundary
        </span>
        <span>
          <span style={{ color: '#EF4444' }}>●</span> 0.01° thermal cells (
          {mapData?.hotspots.features.length ?? 0})
        </span>
        {areaInputMode === 'draw' && (
          <span style={{ color: '#38BDF8' }}>
            {drawTool === 'circle' && liveRadiusKm !== null
              ? `Radius: ${liveRadiusKm} km (click to finish)`
              : drawTool === 'circle'
                ? 'Click center, then edge'
                : drawTool === 'rectangle'
                  ? draftPoints.length === 0
                    ? 'Click 1st corner'
                    : 'Click opposite corner'
                  : `Click vertices (${draftPoints.length} placed)`}
          </span>
        )}
      </div>
    </section>
  );
}

function FallbackSvgMap({ area, mapData }: { area: AreaSelection; mapData: MapResponse }) {
  const [minLon, minLat, maxLon, maxLat] = area.bbox;
  const padLon = Math.max(0.5, (maxLon - minLon) * 0.25);
  const padLat = Math.max(0.5, (maxLat - minLat) * 0.25);
  const x0 = minLon - padLon;
  const x1 = maxLon + padLon;
  const y0 = minLat - padLat;
  const y1 = maxLat + padLat;
  const w = 800;
  const h = 390;

  const px = (lon: number) => ((lon - x0) / Math.max(0.01, x1 - x0)) * w;
  const py = (lat: number) => h - ((lat - y0) / Math.max(0.01, y1 - y0)) * h;

  const ringToPath = (ring: number[][]) =>
    ring.map((pt, i) => `${i === 0 ? 'M' : 'L'}${px(pt[0]).toFixed(1)},${py(pt[1]).toFixed(1)}`).join(' ') + ' Z';

  const aoiPath =
    area.geometry.type === 'Polygon'
      ? ringToPath(area.geometry.coordinates[0] || [])
      : area.geometry.coordinates.map((p) => ringToPath(p[0] || [])).join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#0B0B0E',
      }}
    >
      <path d={aoiPath} fill="rgba(245, 158, 11, 0.14)" stroke="#F59E0B" strokeWidth={2} />
      {mapData.hotspots.features.map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        return (
          <circle
            key={f.properties.id}
            cx={px(lon)}
            cy={py(lat)}
            r={Math.min(8, 2.5 + f.properties.harmonizedCount / 10)}
            fill="#F97316"
            opacity={0.78}
          />
        );
      })}
    </svg>
  );
}
