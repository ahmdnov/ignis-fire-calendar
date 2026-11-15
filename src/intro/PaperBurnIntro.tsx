import { useEffect, useRef } from 'react';
import {
  BURN_TIMELINE,
  estimateOrganicBurnRadius,
  getBurnTimelineState,
} from './burnTimeline';

interface PaperBurnIntroProps {
  /** Seconds since ignition, written every frame by the intro clock (a ref, so no re-render per frame). */
  elapsedRef: { current: number };
  /** Called once if WebGL is unavailable, so the intro can be skipped instead of showing a black screen. */
  onUnsupported?: () => void;
  isOverlayMounted: boolean;
  isParticleCanvasMounted: boolean;
  isInteractive: boolean;
}

interface FireParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  kind: 'near-lens' | 'cinder' | 'smoke';
  rotation: number;
  spin: number;
  phase: number;
  heat: number;
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;

  uniform float u_time;
  uniform float u_progress;
  uniform float u_aspect;
  uniform float u_mirage;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187,
      0.366025403784439,
      -0.577350269189626,
      0.024390243902439
    );
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Fast 2-octave fBm for secondary grain & mirage waves
  float fbm2(vec2 p) {
    float v = 0.5 * (snoise(p) * 0.5 + 0.5);
    p = mat2(0.80, 0.60, -0.60, 0.80) * p * 2.04 + vec2(3.1, 1.7);
    v += 0.25 * (snoise(p) * 0.5 + 0.5);
    return v * 1.3333;
  }

  // GPU-optimized 4-octave fBm
  float fbm4(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      value += amp * (snoise(p) * 0.5 + 0.5);
      p = rot * p * 2.04 + vec2(3.1, 1.7);
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 centered = (v_uv - 0.5) * vec2(u_aspect, 1.0);
    float dist = length(centered);
    float angle = atan(centered.y, centered.x);

    // Vertically stretched coordinate field for tall upward-licking forest flames
    vec2 fireCoord = centered * vec2(1.15, 0.42);

    // Domain-warped curl-like turbulence flowing strongly UPWARD (subtracting u_time from y)
    vec2 curlWarp = vec2(
      fbm4(fireCoord * 2.3 - vec2(0.0, u_time * 1.15)) - 0.5,
      fbm4(fireCoord * 2.3 + vec2(4.7, -u_time * 1.45)) - 0.5
    );

    // Three independent fire depth layers at distinct speeds & frequencies
    float flameInner = fbm4(fireCoord * 4.6 + curlWarp * 1.40 - vec2(0.0, u_time * 3.15));
    float flameMain  = fbm4(fireCoord * 2.8 + curlWarp * 1.15 - vec2(0.35, u_time * 2.25));
    float flameOuter = fbm4(fireCoord * 1.7 + curlWarp * 0.85 - vec2(-0.25, u_time * 1.40));

    // Expanding non-circular forest-fire parting boundary
    float maxCornerDist = length(vec2(max(u_aspect, 1.0) * 0.5, 0.5)) + 0.56;
    float openRadius = u_progress * maxCornerDist;

    float lobes = sin(angle * 3.0 + 0.8) * 0.075
                + cos(angle * 5.0 - u_time * 0.7) * 0.050
                + sin(angle * 8.0 + 1.1) * 0.030;

    float spread = smoothstep(0.0, 0.14, u_progress);
    float tongueDisplacement = (flameInner * 0.21 + flameMain * 0.16 - 0.16) * spread;
    float signedDist = dist - openRadius - (lobes * spread + tongueDisplacement);

    float activeFire = smoothstep(0.0, 0.012, u_progress);
    float clearFade = 1.0 - smoothstep(0.84, 1.0, u_progress);

    // 1. Heat Mirage (Convective Air Refraction) ahead of the flame front
    float mirageZone = activeFire * smoothstep(-0.02, 0.08, signedDist) * (1.0 - smoothstep(0.18, 0.62, signedDist));
    float mirageWaveA = sin(centered.y * 44.0 - u_time * 16.5 + centered.x * 12.0) * 0.5;
    float mirageWaveB = snoise(vec2(centered.x * 16.0, centered.y * 11.0 - u_time * 5.6)) * 0.5;
    vec2 mirageOffset = vec2(mirageWaveA * 0.45 + mirageWaveB, mirageWaveB * 0.7) * 0.0065 * mirageZone;
    vec2 smokeCoord = centered + mirageOffset;

    // 2. IGNIS obsidian base & warm smoke veil (#09090B -> #18130F)
    float canopySmoke = fbm2(smokeCoord * 3.0 - vec2(u_time * 0.07, u_time * 0.35));
    vec3 pureBlackBase = vec3(0.035, 0.035, 0.043);  // #09090B
    vec3 smokeVeil = vec3(0.094, 0.075, 0.059);      // #18130F
    vec3 darkCanvas = mix(pureBlackBase, smokeVeil, canopySmoke * 0.48);

    // 3. Wide 3-Layer Volumetric Fire Wall (kept identical in physics & thickness)
    float dCore  = signedDist - (flameInner - 0.5) * 0.14;
    float dMain  = signedDist - (flameMain  - 0.5) * 0.24;
    float dOuter = signedDist - (flameOuter - 0.5) * 0.30;

    // Layer 3: Outer Forest Blaze (deep crimson #800f2f / #590d22 -> charcoal smoke #141110)
    float outerFlameMask = activeFire
      * smoothstep(-0.04, 0.05, dOuter)
      * (1.0 - smoothstep(0.20, 0.46, dOuter));
    vec3 crimsonDeep = vec3(0.486, 0.176, 0.071);  // #7C2D12 scorched ember
    vec3 crimsonBright = vec3(0.604, 0.204, 0.071); // #9A3412
    vec3 outerColor = mix(crimsonDeep, crimsonBright, smoothstep(0.36, 0.14, dOuter) * flameOuter);

    // Thick billowing smoke around outer rim
    float outerSmokeMask = activeFire
      * smoothstep(0.08, 0.22, dOuter)
      * (1.0 - smoothstep(0.34, 0.62, dOuter))
      * smoothstep(0.28, 0.82, canopySmoke);

    // Layer 2: Main Roaring Body (molten orange #fb5607 -> scarlet #d90429 / #ff006e accents)
    float mainFlameMask = activeFire
      * smoothstep(-0.03, 0.025, dMain)
      * (1.0 - smoothstep(0.11, 0.27, dMain));
    vec3 moltenOrange = vec3(0.976, 0.451, 0.086); // #F97316
    vec3 scarletFire  = vec3(0.918, 0.345, 0.047); // #EA580C
    vec3 hotMagentaAccent = vec3(0.961, 0.620, 0.043); // #F59E0B amber edge
    vec3 mainColor = mix(scarletFire, moltenOrange, smoothstep(0.23, 0.05, dMain));
    mainColor = mix(mainColor, hotMagentaAccent, smoothstep(0.74, 0.96, flameMain) * 0.22);

    // Layer 1: Inner White-Hot Core (#fff6cc -> #ffbe0b) closest to the parting center
    float coreMask = activeFire
      * smoothstep(-0.028, 0.006, dCore)
      * (1.0 - smoothstep(0.032, 0.105, dCore));
    vec3 amberCore = vec3(0.984, 0.749, 0.141);    // #FBBF24
    vec3 whiteHot  = vec3(1.0, 0.969, 0.878);      // #FFF7E0
    float coreFlicker = 0.82 + 0.36 * flameInner;
    vec3 coreColor = mix(amberCore, whiteHot, smoothstep(0.065, 0.0, dCore) * coreFlicker);

    // Compose deep black smoky base & fire wall (100% opaque before ignition)
    float veilMask = mix(1.0, smoothstep(-0.02, 0.075, signedDist), activeFire);
    vec3 composite = darkCanvas;
    composite = mix(composite, smokeVeil * 1.15, outerSmokeMask * 0.74);
    composite = mix(composite, outerColor * (1.1 + 0.35 * flameOuter), outerFlameMask * 0.92);
    composite = mix(composite, mainColor * (1.18 + 0.35 * flameMain), mainFlameMask * 0.96);
    composite = mix(composite, coreColor * (1.28 + 0.32 * flameInner), coreMask);

    // 5. Additive Firelight Bloom & Post-Flame Convective Heat-Shimmer inside the opening
    float innerGlare = activeFire * smoothstep(-0.48, 0.04, signedDist) * (1.0 - veilMask);
    float radialShimmer = 0.65 + 0.35 * sin(u_time * 14.0 + flameInner * 8.0);
    vec3 glareColor = mix(vec3(0.98, 0.34, 0.04), vec3(1.0, 0.75, 0.18), smoothstep(-0.24, 0.02, signedDist));
    float glareAlpha = innerGlare * 0.48 * radialShimmer * clearFade;

    // Subtle rising convective air-wave shimmer across the revealed center decaying via u_mirage
    float risingWave = sin(centered.y * 38.0 - u_time * 14.5 + flameMain * 5.0);
    float heatVeil = u_mirage * (1.0 - veilMask) * smoothstep(0.15, 0.95, risingWave * 0.5 + 0.5);
    vec3 mirageTint = vec3(1.0, 0.62, 0.24);
    float mirageAlpha = heatVeil * 0.085;

    // Final alpha blends smoothly from wood-paper/fire wall to transparent center + subtle heat shimmer
    float wallAlpha = max(veilMask, max(outerFlameMask * 0.88, max(mainFlameMask * 0.95, coreMask))) * clearFade;
    float finalAlpha = clamp(max(wallAlpha, max(glareAlpha, mirageAlpha)), 0.0, 1.0);

    vec3 openAirRgb = mix(glareColor * 1.15, mirageTint, smoothstep(0.0, 0.08, mirageAlpha) * (1.0 - clearFade * 0.5));
    vec3 finalRgb = mix(openAirRgb, composite, clamp(wallAlpha * 1.15, 0.0, 1.0));
    gl_FragColor = vec4(finalRgb, finalAlpha);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function PaperBurnIntro({
  elapsedRef,
  onUnsupported,
  isOverlayMounted,
  isParticleCanvasMounted,
  isInteractive,
}: PaperBurnIntroProps) {
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // WebGL Volumetric Forest-Fire Shader Effect
  useEffect(() => {
    if (!isOverlayMounted) return;
    const canvas = webglCanvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) {
      onUnsupported?.();
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) {
      onUnsupported?.();
      return;
    }

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      onUnsupported?.();
      return;
    }

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTimeLoc = gl.getUniformLocation(program, 'u_time');
    const uProgressLoc = gl.getUniformLocation(program, 'u_progress');
    const uAspectLoc = gl.getUniformLocation(program, 'u_aspect');
    const uMirageLoc = gl.getUniformLocation(program, 'u_mirage');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    const render = () => {
      const t = elapsedRef.current;
      const timeline = getBurnTimelineState(t);
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTimeLoc, t);
      gl.uniform1f(uProgressLoc, timeline.burnProgress);
      gl.uniform1f(uAspectLoc, aspect);
      gl.uniform1f(uMirageLoc, timeline.heatMirage);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (t < BURN_TIMELINE.LOGO_COOL_END_SEC) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(posBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [isOverlayMounted]);

  // First-Person 3D Depth Cinders, Near-Lens Streaks & Rolling Smoke Particle Engine
  useEffect(() => {
    if (!isParticleCanvasMounted) return;
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: FireParticle[] = [];
    let width = window.innerWidth;
    let height = window.innerHeight;
    let lastTs = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.008, (now - lastTs) / 1000));
      lastTs = now;

      const t = elapsedRef.current;
      const timeline = getBurnTimelineState(t);
      const aspect = width / Math.max(1, height);

      ctx.clearRect(0, 0, width, height);

      // Spawn multi-depth forest-fire cinders, near-lens embers, and rolling smoke wisps
      if (
        timeline.burnProgress > 0.005 &&
        timeline.burnProgress < 0.96 &&
        particles.length < 320
      ) {
        const spawnCount = timeline.burnProgress < 0.25 ? 10 : 14;
        for (let i = 0; i < spawnCount; i++) {
          const roll = Math.random();
          const angle = Math.random() * Math.PI * 2;
          const baseRadius = estimateOrganicBurnRadius(
            timeline.burnProgress,
            angle,
            aspect,
            t
          );
          // Distribute spawns across the thick flame wall depth
          const wallDepthOffset = roll < 0.24 ? 0.09 + Math.random() * 0.12 : (Math.random() - 0.35) * 0.14;
          const radius = Math.max(0.02, baseRadius + wallDepthOffset);
          const normX = (Math.cos(angle) * radius) / aspect;
          const normY = Math.sin(angle) * radius;
          const px = (0.5 + normX) * width;
          const py = (0.5 - normY) * height;

          if (px >= -60 && px <= width + 60 && py >= -60 && py <= height + 60) {
            if (roll < 0.09) {
              // Foreground "Near-Lens" Sparks: large, fast-moving bokeh streaks past camera
              const outwardSpeed = 110 + Math.random() * 190;
              particles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * outwardSpeed + (Math.random() - 0.5) * 90,
                vy: -(160 + Math.random() * 220),
                size: 5.5 + Math.random() * 7.5,
                life: 0,
                maxLife: 0.35 + Math.random() * 0.45,
                kind: 'near-lens',
                rotation: angle,
                spin: 0,
                phase: Math.random() * Math.PI * 2,
                heat: 0.8 + Math.random() * 0.2,
              });
            } else if (roll < 0.28) {
              // Rolling Smoke Wisps along outer perimeter
              particles.push({
                x: px + (Math.random() - 0.5) * 28,
                y: py + (Math.random() - 0.5) * 24,
                vx: Math.cos(angle) * (18 + Math.random() * 34) + (Math.random() - 0.5) * 24,
                vy: -(48 + Math.random() * 75),
                size: 28 + Math.random() * 48,
                life: 0,
                maxLife: 0.85 + Math.random() * 0.95,
                kind: 'smoke',
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 1.4,
                phase: Math.random() * Math.PI * 2,
                heat: 0,
              });
            } else {
              // Swirling Wood-Bark Cinders caught in rising turbulent vortices
              particles.push({
                x: px + (Math.random() - 0.5) * 18,
                y: py + (Math.random() - 0.5) * 18,
                vx: Math.cos(angle) * (24 + Math.random() * 65) + (Math.random() - 0.5) * 48,
                vy: -(70 + Math.random() * 145),
                size: 1.1 + Math.random() * 2.3,
                life: 0,
                maxLife: 0.55 + Math.random() * 0.85,
                kind: 'cinder',
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 8,
                phase: Math.random() * Math.PI * 2,
                heat: 0.55 + Math.random() * 0.45,
              });
            }
          }
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        const progress = p.life / p.maxLife;
        // Turbulent wind vortex field
        const vortexX =
          Math.sin(t * 5.8 + p.phase + p.y * 0.014) * 52 +
          Math.cos(t * 9.1 + p.x * 0.01) * 24;
        const buoyancy = p.kind === 'near-lens' ? 95 : p.kind === 'cinder' ? 68 : 28;

        p.x += (p.vx + (p.kind === 'near-lens' ? vortexX * 0.5 : vortexX)) * dt;
        p.y += p.vy * dt;
        p.vy -= buoyancy * dt;
        p.rotation += p.spin * dt;

        if (p.kind === 'smoke') {
          const smokeAlpha = Math.sin(progress * Math.PI) * 0.34;
          const r = p.size * (1 + progress * 0.55);
          const grad = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r);
          grad.addColorStop(0, `rgba(22, 17, 15, ${smokeAlpha.toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(18, 14, 13, ${(smokeAlpha * 0.55).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(18, 14, 13, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'near-lens') {
          const alpha = (1 - progress) * 0.82;
          const r = p.size * (1.1 - progress * 0.3);
          const tailX = p.x - p.vx * 0.045;
          const tailY = p.y - p.vy * 0.045;

          // Soft bokeh streak past lens
          const streakGrad = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
          streakGrad.addColorStop(0, 'rgba(249, 115, 22, 0)');
          streakGrad.addColorStop(0.5, `rgba(249, 115, 22, ${(alpha * 0.55).toFixed(3)})`);
          streakGrad.addColorStop(1, `rgba(253, 224, 71, ${alpha.toFixed(3)})`);

          ctx.save();
          ctx.lineCap = 'round';
          ctx.strokeStyle = streakGrad;
          ctx.lineWidth = r * 1.15;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();

          // Soft outer lens glow
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.1);
          glow.addColorStop(0, `rgba(255, 247, 224, ${(alpha * 0.9).toFixed(3)})`);
          glow.addColorStop(0.4, `rgba(245, 158, 11, ${(alpha * 0.45).toFixed(3)})`);
          glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Sharp swirling wood-bark cinders
          const flicker = 0.65 + 0.35 * Math.sin(t * 32 + p.phase);
          const alpha = Math.max(0, (1 - progress) * flicker);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle =
            progress < 0.25 ? '#FFF7E0' : progress < 0.55 ? '#FBBF24' : progress < 0.8 ? '#F97316' : '#C2410C';
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (t < BURN_TIMELINE.PARTICLE_UNMOUNT_SEC || particles.length > 0) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [isParticleCanvasMounted]);

  if (!isOverlayMounted && !isParticleCanvasMounted) {
    return null;
  }

  return (
    <div
      data-testid="paper-burn-overlay"
      aria-hidden="true"
      className={`fixed inset-0 z-[60] overflow-hidden ${
        isInteractive ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
    >
      {isOverlayMounted && (
        <canvas
          ref={webglCanvasRef}
          data-testid="paper-burn-webgl"
          className="absolute inset-0 block h-full w-full"
        />
      )}
      {isParticleCanvasMounted && (
        <canvas
          ref={particleCanvasRef}
          data-testid="ember-particle-canvas"
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />
      )}
    </div>
  );
}
