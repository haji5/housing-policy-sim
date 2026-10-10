import { useEffect, useMemo, useRef } from 'preact/hooks';
import { hash32, Tenure } from '@zoned-out/sim';
import type { Snapshot, WorldLayout } from '../game/protocol.ts';

/**
 * Placeholder map (M2): every dwelling is a small square in its zone's block. Positions are a
 * fixed hashed shuffle so building types are scattered rather than banded. The M6 art pass
 * replaces this with the isometric renderer.
 */
const CELL = 4;
const GAP = 1;
const ZONE_GAP = 32;
const LABEL_H = 22;

export const MAP_COLORS = {
  owner: '#c9c9c9',
  ltr: '#0072b2',
  vacant: '#ffffff',
  vacantEdge: '#0072b2',
  str: '#e69f00',
  strPr: '#f0e442',
  bg: '#e8f1e4',
} as const;

interface Block {
  zone: number;
  x: number;
  y: number;
  cols: number;
  rows: number;
  cells: Int32Array; // dwelling id per cell
}

function layoutBlocks(layout: WorldLayout): { blocks: Block[]; width: number; height: number } {
  const perZone: number[][] = layout.zoneNames.map(() => []);
  for (let d = 0; d < layout.zone.length; d++) perZone[layout.zone[d]!]!.push(d);
  const blocks: Block[] = [];
  let x = 12;
  let height = 0;
  perZone.forEach((ids, zi) => {
    const sorted = ids
      .map((d) => ({ d, k: hash32(7, d, 0, 1) }))
      .sort((a, b) => a.k - b.k)
      .map((e) => e.d);
    const cols = Math.ceil(Math.sqrt(sorted.length * 3));
    const rows = Math.ceil(sorted.length / cols);
    blocks.push({ zone: zi, x, y: LABEL_H + 8, cols, rows, cells: Int32Array.from(sorted) });
    x += cols * CELL + ZONE_GAP;
    height = Math.max(height, LABEL_H + 8 + rows * CELL + 12);
  });
  return { blocks, width: x - ZONE_GAP + 12, height };
}

export function MapCanvas({ layout, snapshot }: { layout: WorldLayout; snapshot: Snapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useMemo(() => layoutBlocks(layout), [layout]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = geo.width;
    canvas.height = geo.height;
    ctx.fillStyle = MAP_COLORS.bg;
    ctx.fillRect(0, 0, geo.width, geo.height);
    const { tenure, principalRes, occupied } = snapshot;
    const covered = snapshot.levers.strRegime > 0;
    for (const b of geo.blocks) {
      ctx.fillStyle = '#1b1b1b';
      ctx.font = '600 13px system-ui, sans-serif';
      const rule = layout.zoneCovered[b.zone]
        ? covered
          ? ' (rule applies)'
          : ' (would be covered)'
        : ' (exempt)';
      ctx.fillText(layout.zoneNames[b.zone]! + rule, b.x, LABEL_H);
      for (let i = 0; i < b.cells.length; i++) {
        const d = b.cells[i]!;
        const cx = b.x + (i % b.cols) * CELL;
        const cy = b.y + Math.floor(i / b.cols) * CELL;
        const s = CELL - GAP;
        const t = tenure[d];
        if (t === Tenure.STR) {
          ctx.fillStyle = principalRes[d] ? MAP_COLORS.strPr : MAP_COLORS.str;
          ctx.fillRect(cx, cy, s, s);
        } else if (t === Tenure.LTR && occupied[d]) {
          ctx.fillStyle = MAP_COLORS.ltr;
          ctx.fillRect(cx, cy, s, s);
        } else if (t === Tenure.LTR) {
          ctx.fillStyle = MAP_COLORS.vacant;
          ctx.fillRect(cx, cy, s, s);
          ctx.strokeStyle = MAP_COLORS.vacantEdge;
          ctx.strokeRect(cx + 0.5, cy + 0.5, s - 1, s - 1);
        } else {
          ctx.fillStyle = MAP_COLORS.owner;
          ctx.fillRect(cx, cy, s, s);
        }
      }
    }
  }, [geo, snapshot, layout]);

  const counts = snapshot.series.zones.map((z) => z.strListings[z.strListings.length - 1] ?? 0);
  const alt = layout.zoneNames.map((n, i) => `${n}: ${counts[i]} STR listings`).join('; ');
  return (
    <div class="map">
      <canvas ref={ref} role="img" aria-label={`City map. ${alt}.`} />
      <ul class="legend map-legend">
        <li>
          <span class="sw" style={{ background: MAP_COLORS.str }} /> STR (investor)
        </li>
        <li>
          <span class="sw" style={{ background: MAP_COLORS.strPr }} /> STR (host's own home)
        </li>
        <li>
          <span class="sw" style={{ background: MAP_COLORS.ltr }} /> Rented long-term
        </li>
        <li>
          <span class="sw sw-vac" /> For rent (vacant)
        </li>
        <li>
          <span class="sw" style={{ background: MAP_COLORS.owner }} /> Owner-occupied
        </li>
      </ul>
    </div>
  );
}
