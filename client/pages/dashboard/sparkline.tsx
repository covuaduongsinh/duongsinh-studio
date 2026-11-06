import type { ReactElement } from 'react';

const WIDTH = 240;
const HEIGHT = 40;
const INSET = 3;

/** A figure's trend inside a stat tile: one line with a wash under it; hovering a stretch names its value. */
export function Sparkline({
  points,
}: {
  readonly points: readonly {
    readonly label: string;
    readonly value: number | null;
  }[];
}): ReactElement | null {
  const known = points.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  if (known.length < 2) return null;
  const top = Math.max(...known);
  const bottom = Math.min(...known);
  const span = top - bottom;
  const x = (index: number): number =>
    INSET + (index * (WIDTH - INSET * 2)) / Math.max(1, points.length - 1);
  // A flat series sits mid-height rather than on the floor.
  const y = (value: number): number =>
    span === 0
      ? HEIGHT / 2
      : INSET + ((top - value) * (HEIGHT - INSET * 2)) / span;
  const line = points.flatMap((point, index) =>
    point.value === null ? [] : [`${x(index)},${y(point.value)}`],
  );
  const stretch = (WIDTH - INSET * 2) / Math.max(1, points.length - 1);
  return (
    <svg
      aria-hidden
      className='h-10 w-full'
      preserveAspectRatio='none'
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <polygon
        className='fill-primary/10'
        points={`${line[0]?.split(',')[0]},${HEIGHT} ${line.join(' ')} ${line.at(-1)?.split(',')[0]},${HEIGHT}`}
      />
      <polyline
        className='fill-none stroke-primary'
        points={line.join(' ')}
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        vectorEffect='non-scaling-stroke'
      />
      {points.map((point, index) => (
        <rect
          key={point.label}
          fill='transparent'
          height={HEIGHT}
          width={stretch}
          x={x(index) - stretch / 2}
          y={0}
        >
          <title>
            {point.label}: {point.value ?? '—'}
          </title>
        </rect>
      ))}
    </svg>
  );
}
