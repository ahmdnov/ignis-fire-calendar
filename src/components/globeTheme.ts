import { useEffect, useState } from 'react';
import { interpolateRgb } from 'd3';
export const emberColor = interpolateRgb('#EA580C', '#F59E0B');
export function useWorldBorders() {
 const [features,setFeatures]=useState<any[]>([]);
 useEffect(()=>{const ac=new AbortController();fetch('./globe/countries.geojson',{signal:ac.signal}).then(r=>{if(!r.ok)throw Error('Boundaries unavailable');return r.json();}).then(d=>setFeatures(d.features)).catch(()=>{});return()=>ac.abort();},[]);
 return features;
}
