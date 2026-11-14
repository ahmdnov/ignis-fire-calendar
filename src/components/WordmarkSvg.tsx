import { useId } from 'react';

interface WordmarkSvgProps {
  height?: number;
  ember?: boolean;
  fillColor?: string;
  className?: string;
}

export function WordmarkSvg({
  height = 20,
  ember = true,
  fillColor = 'currentColor',
  className = '',
}: WordmarkSvgProps) {
  const rawId = useId();
  const gradId = `ignis-ember-${rawId.replace(/:/g, '')}`;
  const width = Math.round((696 / 100) * height);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 696 100"
      width={width}
      height={height}
      role="img"
      aria-label="IGNIS"
      className={className}
      style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      <g
        fill={fillColor}
        stroke={ember ? `url(#${gradId})` : 'none'}
        strokeWidth={ember ? 2 : 0}
        strokeLinejoin="miter"
        strokeMiterlimit={10}
        paintOrder="stroke fill"
      >
        <rect x="0" y="0" width="16" height="100" />
        <path d="M 224 0 L 208 16 L 96 16 A 12 12 0 0 0 84 28 L 84 72 A 12 12 0 0 0 96 84 L 196 84 A 12 12 0 0 0 208 72 L 208 62 L 148 62 L 164 46 L 224 46 L 224 72 A 28 28 0 0 1 196 100 L 96 100 A 28 28 0 0 1 68 72 L 68 28 A 28 28 0 0 1 96 0 Z" />
        <path d="M 276 0 L 292 0 L 412 81 L 412 16 L 428 0 L 428 100 L 412 100 L 292 19 L 292 84 L 276 100 Z" />
        <rect x="480" y="0" width="16" height="100" />
        <path d="M 696 0 L 680 16 L 574 16 A 10 10 0 0 0 564 26 L 564 32 A 10 10 0 0 0 574 42 L 670 42 A 26 26 0 0 1 696 68 L 696 74 A 26 26 0 0 1 670 100 L 548 100 L 564 84 L 670 84 A 10 10 0 0 0 680 74 L 680 68 A 10 10 0 0 0 670 58 L 574 58 A 26 26 0 0 1 548 32 L 548 26 A 26 26 0 0 1 574 0 Z" />
      </g>
    </svg>
  );
}
