import { useEffect, useMemo, useRef } from 'preact/hooks';
import { hash32, Tenure } from '@zoned-out/sim';
import type { Snapshot, WorldLayout } from '../game/protocol.ts';

/**
 * Placeholder map (M2): every dwelling is a small square in its zone's block. Positions are a
 * fixed hashed shuffle so building types are scattered rather than banded. The M6 art pass
 * replaces this with the isometric renderer.
 */
const ZONE_GAP = 24;
const LABEL_H = 18;
const MAX_W = 880;
const LABEL_CHAR_W = 7;

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
  /** Top of the cell grid; the label sits above it. */
  y: number;
  cols: number;
  rows: number;
  label: string;
  cells: Int32Array; // dwelling id per cell
}

function zoneLabel(layout: WorldLayout, zi: number, ruleOn: boolean): string {
  const tag = layout.zoneCovered[zi] ? (ruleOn ? 'rule applies' : 'would be covered') : 'exempt';
  return `${layout.zoneNames[zi]} (${tag})`;
}

interface Geometry {
  blocks: Block[];
  width: number;
  height: number;
  cell: number;
  gap: number;
}

/** Blocks of width:height `aspect` flow left to right and wrap onto new rows at MAX_W. */
function packBlocks(layout: WorldLayout, perZone: Int32Array[], cell: number, aspect: number) {
  const blocks: Block[] = [];
  let x = 12;
  let y = LABEL_H + 6;
  let rowH = 0;
  let width = 0;
  perZone.forEach((cells, zi) => {
    const label = zoneLabel(layout, zi, true);
    const cols = Math.min(
      Math.floor((MAX_W - 24) / cell),
      Math.max(
        Math.ceil(Math.sqrt(cells.length * aspect)),
        Math.ceil((label.length * LABEL_CHAR_W) / cell),
      ),
    );
    const rows = Math.ceil(cells.length / cols);
    if (x > 12 && x + cols * cell > MAX_W) {
      x = 12;
      y += rowH + LABEL_H + 8;
      rowH = 0;
    }
    blocks.push({ zone: zi, x, y, cols, rows, label, cells });
    width = Math.max(width, x + cols * cell + 12);
    x += cols * cell + ZONE_GAP;
    rowH = Math.max(rowH, rows * cell);
  });
  return { blocks, width, height: y + rowH + 12 };
}

/** Cells shrink for big cities; the block shape that gives the shortest map wins. */
function layoutBlocks(layout: WorldLayout): Geometry {
  // Small cells so the whole map and the charts fit a laptop screen.
  const n = layout.zone.length;
  const cell = n > 30000 ? 2 : n > 15000 ? 3 : 4;
  const ids: number[][] = layout.zoneNames.map(() => []);
  for (let d = 0; d < n; d++) ids[layout.zone[d]!]!.push(d);
  // Fixed hashed shuffle so building types are scattered rather than banded.
  const perZone = ids.map((zoneIds) =>
    Int32Array.from(
      zoneIds
        .map((d) => ({ d, k: hash32(7, d, 0, 1) }))
        .sort((a, b) => a.k - b.k)
        .map((e) => e.d),
    ),
  );
  let best = packBlocks(layout, perZone, cell, 3);
  for (let aspect = 1.5; aspect <= 12; aspect += 0.5) {
    const g = packBlocks(layout, perZone, cell, aspect);
    if (g.height < best.height) best = g;
  }
  return { ...best, cell, gap: cell > 2 ? 1 : 0 };
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
    const CELL = geo.cell;
    for (const b of geo.blocks) {
      ctx.fillStyle = '#1b1b1b';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(zoneLabel(layout, b.zone, covered), b.x, b.y - 6);
      for (let i = 0; i < b.cells.length; i++) {
        const d = b.cells[i]!;
        const cx = b.x + (i % b.cols) * CELL;
        const cy = b.y + Math.floor(i / b.cols) * CELL;
        const s = CELL - geo.gap;
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
          if (s >= 3) {
            ctx.strokeStyle = MAP_COLORS.vacantEdge;
            ctx.strokeRect(cx + 0.5, cy + 0.5, s - 1, s - 1);
          }
        } else {
          ctx.fillStyle = MAP_COLORS.owner;
          ctx.fillRect(cx, cy, s, s);
        }
      }
    }
  }, [geo, snapshot, layout]);

  const counts = snapshot.series.zones.map((z) => z.strListings[z.strListings.length - 1] ?? 0);
  const alt = layout.zoneNames
    .map((n, i) => `${n}: about ${Math.round(counts[i]! / layout.scale)} STR listings`)
    .join('; ');
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
