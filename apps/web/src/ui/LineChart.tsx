import type { ComponentChildren } from 'preact';

export interface Point {
  x: number;
  y: number;
  /** Shown as a hollow marker and left out of the line (e.g. a snapshot flagged incomplete). */
  hollow?: boolean;
}

export interface Line {
  label: string;
  points: readonly Point[];
  color: string;
  dash?: string;
  /** Draw a filled marker at every point (sparse series such as quarterly snapshots). */
  dots?: boolean;
}

/** A shaded band between lo and hi (fan charts). */
export interface Band {
  label: string;
  points: readonly { x: number; lo: number; hi: number }[];
  color: string;
  opacity: number;
}

export interface Marker {
  x: number;
  label: string;
}

interface Props {
  title: string;
  /** Shown after the title (e.g. an evidence badge); not part of the chart's accessible name. */
  badge?: ComponentChildren;
  lines: Line[];
  bands?: Band[];
  /** Draw a horizontal reference line at this y (e.g. 0 for effects). */
  zero?: boolean;
  xMax: number;
  xLabel: (x: number) => string;
  markers?: Marker[];
  yFormat?: (y: number) => string;
  /** Text alternative describing the chart's key takeaway (screen readers). */
  summary: string;
  /** Small print under the legend (data source, caveats). */
  note?: string;
}

const W = 520;
const H = 190;
const M = { top: 12, right: 26, bottom: 28, left: 52 };

/** Rough "nice" ticks (1-2-5 steps) covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step)
    out.push(Number(v.toFixed(10)));
  return out;
}

/** Points of a series given as one value per tick starting at `x0`. */
export function dense(values: readonly number[], x0 = 0): Point[] {
  return values.map((y, i) => ({ x: x0 + i, y }));
}

/** Minimal SVG line chart (placeholder until the M7 chart pass). */
export function LineChart({
  title,
  badge,
  lines,
  bands = [],
  zero = false,
  xMax,
  xLabel,
  markers = [],
  yFormat = String,
  summary,
  note,
}: Props) {
  const all = [
    ...lines.flatMap((l) => l.points.map((p) => p.y)),
    ...bands.flatMap((b) => b.points.flatMap((p) => [p.lo, p.hi])),
    ...(zero ? [0] : []),
  ].filter(Number.isFinite);
  if (all.length === 0) {
    return (
      <figure class="chart">
        <figcaption>
          {title} {badge}
        </figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: no data yet.`}>
          <text x={W / 2} y={H / 2} text-anchor="middle" class="empty">
            No data yet. End a turn to see results.
          </text>
        </svg>
        {note && <p class="chart-note">{note}</p>}
      </figure>
    );
  }
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1;
  lo -= pad;
  hi += pad;
  const yTicks = niceTicks(lo, hi);
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const sx = (x: number) => M.left + (x / xMax) * iw;
  const sy = (y: number) => M.top + ih - ((y - lo) / (hi - lo)) * ih;
  const xTicks: number[] = [];
  for (let x = 0; x <= xMax; x += 12) xTicks.push(x);
  const hasHollow = lines.some((l) => l.points.some((p) => p.hollow));

  return (
    <figure class="chart">
      <figcaption>
        {title} {badge}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`}>
        {yTicks.map((y) => (
          <g key={`y${y}`}>
            <line x1={M.left} x2={W - M.right} y1={sy(y)} y2={sy(y)} class="grid" />
            <text x={M.left - 6} y={sy(y) + 4} text-anchor="end" class="tick">
              {yFormat(y)}
            </text>
          </g>
        ))}
        {xTicks.map((x) => (
          <text key={`x${x}`} x={sx(x)} y={H - 8} text-anchor="middle" class="tick">
            {xLabel(x)}
          </text>
        ))}
        {bands.map((b) => (
          <polygon
            key={b.label}
            fill={b.color}
            fill-opacity={b.opacity}
            stroke="none"
            points={[
              ...b.points.map((p) => `${sx(p.x)},${sy(p.hi)}`),
              ...[...b.points].reverse().map((p) => `${sx(p.x)},${sy(p.lo)}`),
            ].join(' ')}
          />
        ))}
        {zero && <line x1={M.left} x2={W - M.right} y1={sy(0)} y2={sy(0)} class="zero" />}
        {markers.map((m, i) => (
          <g key={`m${i}`}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={M.top} y2={M.top + ih} class="marker" />
            <title>{m.label}</title>
          </g>
        ))}
        {lines.map((l) => (
          <g key={l.label}>
            <polyline
              fill="none"
              stroke={l.color}
              stroke-width={2.5}
              stroke-dasharray={l.dash}
              points={l.points
                .filter((p) => !p.hollow)
                .map((p) => `${sx(p.x)},${sy(p.y)}`)
                .join(' ')}
            />
            {l.points.map((p, i) =>
              p.hollow ? (
                <circle
                  key={i}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={4}
                  fill="var(--panel)"
                  stroke={l.color}
                  stroke-width={2}
                />
              ) : l.dots ? (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill={l.color} />
              ) : null,
            )}
          </g>
        ))}
      </svg>
      <ul class="legend">
        {lines.map((l) => (
          <li key={l.label}>
            <svg width="28" height="10" aria-hidden="true">
              <line
                x1="0"
                x2="28"
                y1="5"
                y2="5"
                stroke={l.color}
                stroke-width="3"
                stroke-dasharray={l.dash}
              />
            </svg>
            {l.label}
          </li>
        ))}
        {bands.map((b) => (
          <li key={b.label}>
            <svg width="28" height="10" aria-hidden="true">
              <rect width="28" height="10" fill={b.color} fill-opacity={b.opacity} />
            </svg>
            {b.label}
          </li>
        ))}
        {hasHollow && (
          <li>
            <svg width="12" height="12" aria-hidden="true">
              <circle cx="6" cy="6" r="4" fill="none" stroke="var(--ink)" stroke-width="2" />
            </svg>
            Flagged incomplete (dropped)
          </li>
        )}
      </ul>
      {note && <p class="chart-note">{note}</p>}
    </figure>
  );
}
