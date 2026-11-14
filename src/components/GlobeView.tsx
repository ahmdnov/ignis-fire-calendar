import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { interpolateInferno, interpolateCividis } from 'd3';
import type { AreaSelection, MapResponse, ColorRampId, HotspotCellFeature } from '../types';
import './globe.css';
import { emberColor, useWorldBorders } from './globeTheme';
import { SoftwareGlobe } from './SoftwareGlobe';

type Props = { area: AreaSelection; mapData: MapResponse; colorRamp: ColorRampId; from: string; to: string; onCountry: (code: string) => void; onMap: () => void };
const xyz = (lon: number, lat: number, r=1) => new T.Vector3(r*Math.cos(lat*Math.PI/180)*Math.cos(lon*Math.PI/180),r*Math.sin(lat*Math.PI/180),-r*Math.cos(lat*Math.PI/180)*Math.sin(lon*Math.PI/180));
const rings = (g: any): number[][][] => g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
function clear(group: T.Group) {group.traverse((o: any)=>{o.geometry?.dispose();o.material?.dispose();});group.clear();}
export function GlobeView(p: Props) {
  const world = useWorldBorders();
  const host=useRef<HTMLDivElement>(null), latest=useRef(p), runtime=useRef<any>(null);latest.current=p;
  const [ready,setReady]=useState(0),[failed,setFailed]=useState(false),[orbit,setOrbit]=useState(false),[reading,setReading]=useState<HotspotCellFeature|null>(null);
  const focus=()=>{const r=runtime.current;if(r){r.target=xyz(...latest.current.area.center,1.85);r.flight={start:performance.now(),from:r.camera.position.clone()};r.controls.autoRotate=false;setOrbit(false);}};
  useEffect(()=>{
    const el=host.current;if(!el)return;
    let renderer:T.WebGLRenderer;try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{setFailed(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1,.01,100);camera.position.copy(xyz(47,29,3.3));
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=1.3;controls.maxDistance=5;controls.autoRotateSpeed=.35;
    const earth=new T.Mesh(new T.SphereGeometry(1,96,64),new T.MeshPhongMaterial({color:'#090a0c',shininess:45,specular:'#898078'}));scene.add(earth);
    let alive=true;const texture=new T.TextureLoader().load('./globe/earth.jpg',t=>{if(!alive){t.dispose();return;}t.colorSpace=T.SRGBColorSpace;earth.material.bumpMap=t;earth.material.bumpScale=.012;earth.material.needsUpdate=true;});
    scene.add(new T.AmbientLight('#b6b8bd',1.1));const light=new T.DirectionalLight('#fff2d4',4);light.position.set(3,4,5);scene.add(light);
    const atmosphere=new T.Mesh(new T.SphereGeometry(1.035,64,48),new T.ShaderMaterial({transparent:true,side:T.BackSide,depthWrite:false,blending:T.AdditiveBlending,vertexShader:'varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n;varying vec3 v;void main(){float a=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(.65,.39,.17,a*.35);}'}));scene.add(atmosphere);
    const points=new T.Group(),borders=new T.Group(),selection=new T.Group();scene.add(points,borders,selection);
    const r={scene,camera,controls,points,borders,selection,target:null as T.Vector3|null,flight:null as any};runtime.current=r;
    const resize=new ResizeObserver(()=>{renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();});resize.observe(el);
    controls.addEventListener('start',()=>{r.target=null;controls.autoRotate=false;setOrbit(false);});
    const ray=new T.Raycaster();ray.params.Points.threshold=.015;let down=[0,0];
    const onDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];};
    const onUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const b=el.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),camera);const surface=ray.intersectObject(earth)[0];if(!surface){setReading(null);return;}const hit=ray.intersectObjects(points.children)[0];if(hit&&hit.distance<surface.distance+.03&&hit.index!==undefined){setReading(latest.current.mapData.hotspots.features[hit.index]);return;}setReading(null);const v=surface.point.clone().normalize();const ll:[number,number]=[Math.atan2(-v.z,v.x)*180/Math.PI,Math.asin(v.y)*180/Math.PI];
      // Use planar containment for the regional polygons, independent of ring winding.
      const inside=(ring:number[][])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [x,y]=ring[i],[a,b]=ring[j];if((y>ll[1])!==(b>ll[1])&&ll[0]<(a-x)*(ll[1]-y)/(b-y)+x)yes=!yes;}return yes;};
      const f=latest.current.mapData.countryOutlines.features.find(f=>{const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;return polys.some(poly=>inside(poly[0])&&!poly.slice(1).some(inside));});if(f)latest.current.onCountry(f.properties.code);
    };
    el.addEventListener('pointerdown',onDown);el.addEventListener('pointerup',onUp);
    const onLost=(e:Event)=>{e.preventDefault();setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',onLost);
    let frame=0;const draw=()=>{frame=requestAnimationFrame(draw);if(r.target){const f=r.flight;const t=Math.min(1,(performance.now()-f.start)/1600);const ease=t*t*(3-2*t);const a=f.from.clone().normalize(),b=r.target.clone().normalize();const q=new T.Quaternion().setFromUnitVectors(a,b);const turn=new T.Quaternion().slerp(q,ease);camera.position.copy(a.applyQuaternion(turn).multiplyScalar(T.MathUtils.lerp(f.from.length(),r.target.length(),ease)+Math.sin(Math.PI*t)*.35));if(t===1)r.target=null;}controls.update();renderer.render(scene,camera);};draw();setReady(n=>n+1);
    return()=>{alive=false;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();el.removeEventListener('pointerdown',onDown);el.removeEventListener('pointerup',onUp);renderer.domElement.removeEventListener('webglcontextlost',onLost);clear(points);clear(borders);clear(selection);earth.geometry.dispose();earth.material.dispose();atmosphere.geometry.dispose();atmosphere.material.dispose();texture.dispose();renderer.dispose();el.replaceChildren();runtime.current=null;};
  },[]);
  useEffect(()=>{const r=runtime.current;if(!r)return;setReading(null);clear(r.points);clear(r.borders);const values=p.mapData.hotspots.features,max=Math.max(1,...values.map(f=>f.properties.harmonizedCount));const verts:number[]=[],colors:number[]=[];for(const f of values){verts.push(...xyz(...f.geometry.coordinates,1.007).toArray());const t=.42+.58*Math.sqrt(Math.max(0,f.properties.harmonizedCount)/max);colors.push(...new T.Color((p.colorRamp==='cividis'?interpolateCividis:emberColor)(t)).toArray());}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));const m=new T.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,vertexShader:'varying vec3 c;void main(){c=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(12./-p.z,3.,14.);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 c;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(c,pow(1.-d,.65));}'});r.points.add(new T.Points(g,m));
    for(const f of (world.length?world:p.mapData.countryOutlines.features))for(const ring of rings(f.geometry))r.borders.add(new T.Line(new T.BufferGeometry().setFromPoints(ring.map(c=>xyz(c[0],c[1],1.002))),new T.LineBasicMaterial({color:'#aaa49c',transparent:true,opacity:.65})));
  },[p.mapData,p.colorRamp,ready,world]);
  useEffect(()=>{const r=runtime.current;if(!r)return;clear(r.selection);for(const ring of rings(p.area.geometry))r.selection.add(new T.Line(new T.BufferGeometry().setFromPoints(ring.map(c=>xyz(c[0],c[1],1.009))),new T.LineBasicMaterial({color:'#ffd38b'})));focus();},[p.area,ready]);
  const move=(angle:number)=>{const r=runtime.current;if(r){r.target=null;r.camera.position.applyAxisAngle(new T.Vector3(0,1,0),angle);}};
  const zoom=(factor:number)=>{const r=runtime.current;if(r){r.target=null;r.camera.position.setLength(T.MathUtils.clamp(r.camera.position.length()*factor,1.3,5));}};
  if (failed) return <SoftwareGlobe area={p.area} mapData={p.mapData} colorRamp={p.colorRamp} from={p.from} to={p.to} />;
  return <section className="earth-stage" aria-label="Interactive 3D Earth"><div ref={host} className="earth-canvas"/>
    <div className="earth-title"><span>IGNIS / EARTH OBSERVATORY</span><h2>A planet in perspective.</h2><p>{p.area.label} <span> / </span> {p.from} — {p.to}</p></div>
    <div className="earth-data"><i/>{p.mapData.isFallback?'SAMPLE DATA · NOT LIVE READINGS':'API DATA'}<small>{p.mapData.hotspots.features.length.toLocaleString()} activity cells</small></div>
    <div className="earth-tools"><button aria-label="Rotate left" onClick={()=>move(-.2)}>←</button><button aria-label="Rotate right" onClick={()=>move(.2)}>→</button><button aria-label="Zoom in" onClick={()=>zoom(.85)}>+</button><button aria-label="Zoom out" onClick={()=>zoom(1.15)}>−</button><button onClick={focus}>Focus region</button><button aria-pressed={orbit} onClick={()=>{const r=runtime.current;if(r){r.target=null;r.controls.autoRotate=!orbit;setOrbit(!orbit);}}}>{orbit?'Pause orbit':'Auto orbit'}</button></div>
    {reading&&<div className="earth-reading" role="status"><button aria-label="Close reading" onClick={()=>setReading(null)}>×</button><strong>{reading.properties.harmonizedCount.toLocaleString(undefined,{maximumFractionDigits:1})}</strong><span>harmonized hotspot-days</span><small>{reading.geometry.coordinates[1].toFixed(3)}°, {reading.geometry.coordinates[0].toFixed(3)}°</small></div>}
    {!p.mapData.hotspots.features.length&&<div className="earth-empty">No activity cells for this area and period.</div>}
    {failed&&<div className="earth-error" role="alert">3D rendering is unavailable on this device.<button onClick={p.onMap}>Open map</button></div>}
    <div className="earth-key"><span style={{background:p.colorRamp==='cividis'?'linear-gradient(90deg,#00204c,#7c7b78,#ffea46)':'linear-gradient(90deg,#EA580C,#F59E0B)'}}/><small>Lower activity <b>Harmonized hotspot-days</b> Higher activity</small></div>
    <div className="earth-foot">Drag to rotate · Scroll to zoom · Click a country or activity cell<br/>Coverage: Gulf countries & Argentina · Earth imagery: NASA Blue Marble</div>
  </section>;
}
