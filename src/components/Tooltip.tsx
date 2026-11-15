import type { ReactNode } from 'react';

export interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: { label: string; value: string; color?: string }[];
  note?: string;
}

interface TooltipProps {
  tooltip: TooltipState | null;
  extra?: ReactNode;
}

export function Tooltip({ tooltip, extra }: TooltipProps) {
  if (!tooltip) return null;

  // Keep tooltip comfortably within viewport bounds
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const left = Math.min(vw - 260, Math.max(12, tooltip.x + 14));
  const top = Math.min(vh - 180, Math.max(12, tooltip.y - 12));

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 120,
        pointerEvents: 'none',
        minWidth: 205,
        maxWidth: 260,
        padding: '10px 12px',
        borderRadius: 12,
        background: 'color-mix(in srgb, var(--surface-1) 94%, transparent)',
        backdropFilter: 'blur(16px) saturate(160%)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-pop)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 6,
          color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 5,
        }}
      >
        {tooltip.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tooltip.lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              fontSize: 11,
            }}
          >
            <span style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {line.color && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: line.color,
                    display: 'inline-block',
                  }}
                />
              )}
              {line.label}
            </span>
            <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {line.value}
            </span>
          </div>
        ))}
      </div>
      {tooltip.note && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 5,
            borderTop: '1px solid var(--border)',
            fontSize: 10.5,
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {tooltip.note}
        </div>
      )}
      {extra}
    </div>
  );
}
