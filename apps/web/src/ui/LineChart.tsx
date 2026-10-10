export interface Line {
  label: string;
  values: readonly number[];
  color: string;
  dash?: string;
}

export interface Marker {
  x: number;
  label: string;
}

interface Props {
  title: string;
  lines: Line[];
  xMax: number;
  xLabel: (x: number) => string;
  markers?: Marker[];
  yFormat?: (y: number) => string;
  /** Text alternative describing the chart's key takeaway (screen readers). */
  summary: string;
}

const W = 520;
const H = 220;
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

/** Minimal SVG line chart (placeholder until the M7 chart pass). */
export function LineChart({
  title,
  lines,
  xMax,
  xLabel,
  markers = [],
  yFormat = String,
  summary,
}: Props) {
  const all = lines.flatMap((l) => l.values);
  if (all.length === 0) {
    return (
      <figure class="chart">
        <figcaption>{title}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: no data yet.`}>
          <text x={W / 2} y={H / 2} text-anchor="middle" class="empty">
            No data yet. End a turn to see results.
          </text>
        </svg>
      </figure>
    );
  }
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
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

  return (
    <figure class="chart">
      <figcaption>{title}</figcaption>
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
        {markers.map((m, i) => (
          <g key={`m${i}`}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={M.top} y2={M.top + ih} class="marker" />
            <title>{m.label}</title>
          </g>
        ))}
        {lines.map((l) => (
          <polyline
            key={l.label}
            fill="none"
            stroke={l.color}
            stroke-width={2.5}
            stroke-dasharray={l.dash}
            points={l.values.map((v, i) => `${sx(i)},${sy(v)}`).join(' ')}
          />
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
      </ul>
    </figure>
  );
}
