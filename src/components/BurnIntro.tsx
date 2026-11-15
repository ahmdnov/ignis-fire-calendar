import { useEffect, useRef, useState } from 'react';

interface BurnIntroProps {
  onDismiss: () => void;
  /** Tagline, kicker and launch button are shown once this is true (after the fire has opened). */
  revealed?: boolean;
  /** True while the opening fire transition is still running; Esc then skips it instead of leaving. */
  burning?: boolean;
  onSkipBurn?: () => void;
  /** Root element, so the intro clock can drive the wordmark glow through the --ember-heat CSS variable. */
  rootRef?: React.Ref<HTMLDivElement>;
  /** Year span of the loaded archive, e.g. "2000–2025". */
  rangeLabel?: string;
}

interface EmberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  accelY: number;
  size: number;
  depthLayer: 0 | 1 | 2;
  life: number;
  maxLife: number;
  phase: number;
  flickerSpeed: number;
  colorStop: number;
}

function emberColorFromStop(t: number): string {
  if (t < 0.35) return '#FDE047';
  if (t < 0.65) return '#F59E0B';
  if (t < 0.85) return '#EA580C';
  return '#EF4444';
}

function fbmWave(x: number, t: number, seed: number): number {
  return (
    Math.sin(x * 0.0045 + t * 0.85 + seed) * 14 +
    Math.sin(x * 0.011 - t * 1.45 + seed * 1.7) * 7 +
    Math.sin(x * 0.027 + t * 2.3 + seed * 2.9) * 3.5 +
    Math.cos(x * 0.062 - t * 3.1 + seed * 0.6) * 1.6
  );
}

function drawPineRidge(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseYRatio: number,
  treeSpacing: number,
  treeHeightMax: number,
  seed: number,
  fillStyle: string | CanvasGradient
) {
  const baseY = height * baseYRatio;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, baseY);

  const count = Math.ceil(width / treeSpacing) + 2;
  for (let i = 0; i <= count; i++) {
    const cx = i * treeSpacing;
    const hHash = Math.abs(Math.sin(i * 12.9898 + seed * 78.233)) % 1;
    const wHash = Math.abs(Math.cos(i * 4.1414 + seed * 19.19)) % 1;
    const hillOffset =
      Math.sin(cx * 0.0038 + seed) * (height * 0.024) +
      Math.cos(cx * 0.009 + seed * 2.1) * (height * 0.011);
    const th = treeHeightMax * (0.45 + hHash * 0.72);
    const tw = treeSpacing * (0.65 + wHash * 0.55);
    const trunkBaseY = baseY + hillOffset;

    ctx.lineTo(cx - tw * 0.5, trunkBaseY);
    ctx.lineTo(cx - tw * 0.22, trunkBaseY - th * 0.42);
    ctx.lineTo(cx - tw * 0.34, trunkBaseY - th * 0.42);
    ctx.lineTo(cx - tw * 0.12, trunkBaseY - th * 0.74);
    ctx.lineTo(cx - tw * 0.2, trunkBaseY - th * 0.74);
    ctx.lineTo(cx, trunkBaseY - th);
    ctx.lineTo(cx + tw * 0.2, trunkBaseY - th * 0.74);
    ctx.lineTo(cx + tw * 0.12, trunkBaseY - th * 0.74);
    ctx.lineTo(cx + tw * 0.34, trunkBaseY - th * 0.42);
    ctx.lineTo(cx + tw * 0.22, trunkBaseY - th * 0.42);
    ctx.lineTo(cx + tw * 0.5, trunkBaseY);
  }

  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

export function BurnIntro({
  onDismiss,
  revealed = true,
  burning = false,
  onSkipBurn,
  rootRef,
  rangeLabel = '2000–2025',
}: BurnIntroProps) {
  const backdropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dissolving, setDissolving] = useState(false);

  const handleClose = () => {
    if (dissolving) return;
    setDissolving(true);
    window.setTimeout(() => {
      onDismiss();
    }, 450);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (burning) onSkipBurn?.();
        else handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dissolving, burning, onSkipBurn]);

  useEffect(() => {
    const backdropCanvas = backdropCanvasRef.current;
    const fireCanvas = fireCanvasRef.current;
    const foregroundCanvas = foregroundCanvasRef.current;
    if (!backdropCanvas || !fireCanvas || !foregroundCanvas) return;

    const backdropCtx = backdropCanvas.getContext('2d');
    const ctx = fireCanvas.getContext('2d');
    const foregroundCtx = foregroundCanvas.getContext('2d');
    if (!backdropCtx || !ctx || !foregroundCtx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const paintStaticLayers = () => {
      const pw = Math.floor(width * dpr);
      const backH = Math.max(1, Math.floor(height * 0.36));
      const foreH = Math.max(1, Math.floor(height * 0.24));

      backdropCanvas.width = pw;
      backdropCanvas.height = Math.floor(backH * dpr);
      backdropCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdropCtx.clearRect(0, 0, width, backH);

      // Subtle scorched-wood grain lines in the lower third
      backdropCtx.strokeStyle = 'rgba(59, 30, 13, 0.35)';
      backdropCtx.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const gy = (i / 18) * backH;
        backdropCtx.beginPath();
        for (let x = 0; x <= width; x += 56) {
          const offset = Math.sin(x * 0.011 + i * 1.45) * 2.2;
          if (x === 0) backdropCtx.moveTo(x, gy + offset);
          else backdropCtx.lineTo(x, gy + offset);
        }
        backdropCtx.stroke();
      }

      // Far backlit pine ridge silhouette
      drawPineRidge(backdropCtx, width, backH, 0.47, 18, 28, 1.3, '#180B07');

      // Mid & Foreground charred forest ridge silhouettes framing the wildfire front
      foregroundCanvas.width = pw;
      foregroundCanvas.height = Math.floor(foreH * dpr);
      foregroundCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      foregroundCtx.clearRect(0, 0, width, foreH);
      drawPineRidge(foregroundCtx, width, foreH, 0.5, 22, 34, 4.7, '#130906');
      drawPineRidge(foregroundCtx, width, foreH, 0.75, 28, 38, 9.1, '#09090B');
    };

    let fireBandGrad: CanvasGradient | null = null;
    let hotspotStroke: CanvasGradient | null = null;

    const rebuildDynamicGradients = () => {
      const fireY = height * 0.84;
      const g1 = ctx.createLinearGradient(0, fireY - 38, 0, height * 0.96);
      g1.addColorStop(0, 'rgba(253, 224, 71, 0.92)');
      g1.addColorStop(0.22, 'rgba(249, 115, 22, 0.94)');
      g1.addColorStop(0.55, 'rgba(234, 88, 12, 0.88)');
      g1.addColorStop(1, 'rgba(154, 52, 18, 0.25)');
      fireBandGrad = g1;

      const g2 = ctx.createLinearGradient(0, 0, width, 0);
      g2.addColorStop(0, '#EA580C');
      g2.addColorStop(0.25, '#FDE047');
      g2.addColorStop(0.5, '#F97316');
      g2.addColorStop(0.75, '#FDE047');
      g2.addColorStop(1, '#EA580C');
      hotspotStroke = g2;
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      fireCanvas.width = Math.floor(width * dpr);
      fireCanvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildDynamicGradients();
      paintStaticLayers();
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnEmber = (randomHeight: boolean): EmberParticle => {
      const roll = Math.random();
      const depthLayer: 0 | 1 | 2 = roll < 0.45 ? 0 : roll < 0.8 ? 1 : 2;
      const depthScale = depthLayer === 0 ? 0.52 : depthLayer === 1 ? 0.95 : 1.48;
      const spawnY = randomHeight
        ? Math.random() * height
        : height * (0.78 + Math.random() * 0.18);

      return {
        x: Math.random() * width,
        y: spawnY,
        vx: (Math.random() - 0.42) * 0.48 * depthScale,
        vy: -(0.55 + Math.random() * 1.45) * depthScale,
        accelY: -(0.003 + Math.random() * 0.008) * depthScale,
        size:
          depthLayer === 0
            ? 0.9 + Math.random() * 1.0
            : depthLayer === 1
              ? 1.6 + Math.random() * 1.4
              : 2.5 + Math.random() * 2.1,
        depthLayer,
        life: randomHeight ? Math.random() * 180 : 0,
        maxLife: 190 + Math.random() * 220,
        phase: Math.random() * Math.PI * 2,
        flickerSpeed: 2.5 + Math.random() * 5.0,
        colorStop: Math.random(),
      };
    };

    const embers: EmberParticle[] = Array.from({ length: 140 }, () => spawnEmber(true));
    let rafId = 0;
    let time = 0;

    const render = () => {
      time += 0.016;
      ctx.clearRect(0, 0, width, height);

      // Undulating Wildfire Crown Front (#9A3412 -> #EA580C -> #F97316 -> #FDE047 hotspots)
      ctx.save();
      const fireY = height * 0.84;

      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 18) {
        const wave = fbmWave(x, time, 0.4);
        const tongue = Math.max(0, Math.sin(x * 0.019 - time * 2.1)) * 12;
        ctx.lineTo(x, fireY + wave - tongue);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      if (fireBandGrad) {
        ctx.fillStyle = fireBandGrad;
        ctx.fill();
      }

      ctx.beginPath();
      for (let x = 0; x <= width; x += 18) {
        const wave = fbmWave(x, time, 0.4);
        const tongue = Math.max(0, Math.sin(x * 0.019 - time * 2.1)) * 12;
        const y = fireY + wave - tongue;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.36)';
      ctx.lineWidth = 10;
      ctx.stroke();

      if (hotspotStroke) {
        ctx.strokeStyle = hotspotStroke;
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      ctx.restore();

      // Convective Air-Mirage Heat-Haze Plumes rising softly above the wildfire horizon
      ctx.save();
      const shimmerTop = height * 0.67;
      const shimmerBottom = height * 0.84;
      const shimmerBands = 4;
      for (let b = 0; b < shimmerBands; b++) {
        const rise = (time * 0.24 + b / shimmerBands) % 1;
        const bandY = shimmerBottom - rise * (shimmerBottom - shimmerTop);
        const envelope = Math.sin(rise * Math.PI);
        ctx.strokeStyle = `rgba(249, 115, 22, ${(envelope * 0.038).toFixed(3)})`;
        ctx.lineWidth = 12 - rise * 5;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 36) {
          const shimmer =
            Math.sin(x * 0.009 - time * 2.4 + b * 1.7) * (6 + rise * 4) +
            Math.cos(x * 0.023 + time * 3.1 + b * 0.9) * 3.2;
          if (x === 0) ctx.moveTo(x, bandY + shimmer);
          else ctx.lineTo(x, bandY + shimmer);
        }
        ctx.stroke();
      }
      ctx.restore();

      // 140 Multi-depth rising embers & cinders
      for (let i = 0; i < embers.length; i++) {
        const p = embers[i];
        if (!prefersReduced) {
          const depthMult = p.depthLayer === 0 ? 0.45 : p.depthLayer === 1 ? 0.85 : 1.3;
          const sway = Math.sin(time * 1.85 + p.phase + p.y * 0.012) * 0.58 * depthMult;
          p.vy = Math.max(-4.2 * depthMult, p.vy + p.accelY);
          p.x += p.vx + sway;
          p.y += p.vy;
          p.life += 1;
        }

        if (p.y < -24 || p.life > p.maxLife || p.x < -30 || p.x > width + 30) {
          embers[i] = spawnEmber(false);
          continue;
        }

        const ageRatio = Math.min(1, p.life / p.maxLife);
        const heightRatio = 1 - Math.max(0, Math.min(1, p.y / height));
        const flicker = 0.65 + 0.35 * Math.sin(time * p.flickerSpeed + p.phase);
        const fade = Math.sin(ageRatio * Math.PI) * (1 - heightRatio * 0.45);
        const alpha = Math.max(0.05, Math.min(1, fade * flicker));
        const color = emberColorFromStop(Math.min(0.99, p.colorStop * 0.55 + heightRatio * 0.5));
        const layerAlpha = p.depthLayer === 0 ? 0.72 : p.depthLayer === 1 ? 0.88 : 0.96;

        if (p.depthLayer > 0) {
          ctx.globalAlpha = alpha * (p.depthLayer === 2 ? 0.22 : 0.14);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (p.depthLayer === 2 ? 2.8 : 2.1), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = alpha * layerAlpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!prefersReduced) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-testid="burn-intro-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="IGNIS Wildfire Home"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{
        backgroundColor: '#09090B',
        backgroundImage:
          'radial-gradient(ellipse 90% 55% at 50% 84%, rgba(249, 115, 22, 0.32) 0%, rgba(234, 88, 12, 0.18) 32%, rgba(154, 52, 18, 0.08) 58%, rgba(9, 9, 11, 0) 100%), linear-gradient(to bottom, #09090B 0%, #0B090B 54%, #1A0E08 76%, #3B1E0D 90%, #09090B 100%)',
        opacity: dissolving ? 0 : 1,
        transform: dissolving ? 'scale(1.02)' : 'scale(1)',
        transition:
          'opacity 450ms cubic-bezier(0.16, 1, 0.3, 1), transform 450ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Static Lower-Third Wood Grain & Far Pine Ridge (lower 36vh only) */}
      <canvas
        ref={backdropCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[36vh] w-full"
      />

      {/* 60fps Wildfire Horizon, Convective Air-Mirage Plumes & 140 Multi-Depth Embers */}
      <canvas
        ref={fireCanvasRef}
        data-testid="burn-intro-canvas"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Static Mid & Foreground Charred Pine Ridges (lower 24vh only) */}
      <canvas
        ref={foregroundCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[24vh] w-full"
      />

      {/* Center Stage: Pure-Vector Wordmark + Launch CTA */}
      <div
        className="relative z-10 flex max-w-[680px] flex-col items-center px-6 py-8 text-center"
      >
        <div
          style={{
            padding: '10px 14px',
            // --ember-heat (0..1) is driven by the intro clock: the lettering glows as the fire passes, then cools.
            filter:
              'drop-shadow(0 0 calc(14px + 30px * var(--ember-heat, 0)) rgba(234, 88, 12, calc(0.22 + 0.62 * var(--ember-heat, 0)))) drop-shadow(0 0 calc(4px * var(--ember-heat, 0)) rgba(253, 224, 71, calc(0.55 * var(--ember-heat, 0))))',
          }}
        >
          <svg
            viewBox="0 0 696 100"
            className="h-auto w-[min(560px,82vw)]"
            role="img"
            aria-label="IGNIS"
            style={{ display: 'block', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="ignis-intro-ember" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#EA580C" />
              </linearGradient>
            </defs>
            <g
              fill="#FAFAFA"
              stroke="url(#ignis-intro-ember)"
              strokeWidth="2.2"
              strokeLinejoin="miter"
              strokeMiterlimit="10"
              paintOrder="stroke fill"
            >
              <rect x="0" y="0" width="16" height="100" />
              <path d="M 224 0 L 208 16 L 96 16 A 12 12 0 0 0 84 28 L 84 72 A 12 12 0 0 0 96 84 L 196 84 A 12 12 0 0 0 208 72 L 208 62 L 148 62 L 164 46 L 224 46 L 224 72 A 28 28 0 0 1 196 100 L 96 100 A 28 28 0 0 1 68 72 L 68 28 A 28 28 0 0 1 96 0 Z" />
              <path d="M 276 0 L 292 0 L 412 81 L 412 16 L 428 0 L 428 100 L 412 100 L 292 19 L 292 84 L 276 100 Z" />
              <rect x="480" y="0" width="16" height="100" />
              <path d="M 696 0 L 680 16 L 574 16 A 10 10 0 0 0 564 26 L 564 32 A 10 10 0 0 0 574 42 L 670 42 A 26 26 0 0 1 696 68 L 696 74 A 26 26 0 0 1 670 100 L 548 100 L 564 84 L 670 84 A 10 10 0 0 0 680 74 L 680 68 A 10 10 0 0 0 670 58 L 574 58 A 26 26 0 0 1 548 32 L 548 26 A 26 26 0 0 1 574 0 Z" />
            </g>
          </svg>
        </div>

        <div
          aria-hidden={!revealed}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            opacity: revealed ? 1 : 0,
            transform: revealed ? 'translateY(0)' : 'translateY(10px)',
            filter: revealed ? 'blur(0)' : 'blur(6px)',
            transition:
              'opacity 600ms ease, transform 600ms cubic-bezier(0.16, 1, 0.3, 1), filter 600ms ease',
            pointerEvents: revealed ? 'auto' : 'none',
          }}
        >
        <div
          className="font-mono"
          style={{
            marginTop: 22,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#A1A1AA',
          }}
        >
          ORBITAL THERMAL HARMONIZATION ENGINE
        </div>

        <h1
          className="display-heading"
          style={{
            marginTop: 14,
            marginBottom: 30,
            fontSize: 'clamp(1.25rem, 2.3vw, 1.65rem)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.32,
            color: '#FAFAFA',
            textWrap: 'balance',
          }}
        >
          One fire calendar. Two decades. Every sensor. ({rangeLabel})
        </h1>

        <button
          type="button"
          onClick={handleClose}
          tabIndex={revealed ? 0 : -1}
          className="btn-primary-ember"
          style={{
            height: 46,
            padding: '0 28px',
            fontSize: 14,
            borderRadius: 9999,
          }}
        >
          Launch Fire Calendar →
        </button>
        </div>
      </div>
    </div>
  );
}
