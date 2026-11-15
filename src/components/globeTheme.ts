import { useEffect, useState } from 'react';
import { fireColor } from '../util';
/** Same "Fire heat" ramp as the calendar, so a colour means the same thing on the globe, the map and the grid. */
export const emberColor = (t: number) => fireColor(t, 'dark');
export function useWorldBorders() {
 const [features,setFeatures]=useState<any[]>([]);
 useEffect(()=>{const ac=new AbortController();fetch('./globe/countries.geojson',{signal:ac.signal}).then(r=>{if(!r.ok)throw Error('Boundaries unavailable');return r.json();}).then(d=>setFeatures(d.features)).catch(()=>{});return()=>ac.abort();},[]);
 return features;
}
