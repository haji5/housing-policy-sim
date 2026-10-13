import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { hash32, Tenure } from '@zoned-out/sim';
import type { Snapshot, WorldLayout } from '../../game/protocol.ts';
import type { Atlas } from './atlas.ts';
import { drawFrame, drawText, loadAtlas, textWidth } from './atlas.ts';
import type { City, Lot } from './city.ts';
import { buildCity } from './city.ts';

/** Overlay modes (ADR 0010). */
export type Overlay = 'none' | 'str' | 'vacant' | 'construction';

const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: 'none', label: 'No overlay' },
  { id: 'str', label: 'Short-term rentals' },
  { id: 'vacant', label: 'Empty homes' },
  { id: 'construction', label: 'Construction' },
];

/** Zoom levels; 0 is the overview that fits the whole region (non-integer scale). */
const ZOOMS = [0, 1, 2, 3];
/** Screen-space scale of labels and overlay icons, so they stay legible at every zoom. */
const UI_SCALE = 2;
const WATER_BG = '#3d7fb8';

interface Props {
  layout: WorldLayout;
  snapshot: Snapshot;
}

/** What a lot shows this quarter. */
interface LotView {
  building: string | null;
  marker: string | null;
  sign: string | null;
  /** Was a short-term rental last quarter and is not now (delisted or converted). */
  delisted: boolean;
  state: 'owner' | 'ltr' | 'str' | 'forrent' | 'held' | 'construction' | 'empty';
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Per zone: starting-stock dwelling ids in a fixed hashed order, and new dwellings in id order. */
function dwellingOrder(zone: Uint8Array, nStart: number, nZones: number) {
  const start: number[][] = Array.from({ length: nZones }, () => []);
  const built: number[][] = Array.from({ length: nZones }, () => []);
  for (let d = 0; d < zone.length; d++) (d < nStart ? start : built)[zone[d]!]!.push(d);
  for (const ids of start) ids.sort((a, b) => hash32(7, a, 0, 1) - hash32(7, b, 0, 1) || a - b);
  return { start, built };
}

function viewOf(
  lot: Lot,
  d: number | undefined,
  s: Snapshot,
  prevTenure: Uint8Array | null,
  animT: number,
  upzoned: boolean,
): LotView {
  if (d === undefined)
    return {
      building: null,
      marker: null,
      sign: upzoned ? 'sign_upzone' : null,
      delisted: false,
      state: 'empty',
    };
  const v = baseView(lot, d, s, animT);
  v.delisted = v.state !== 'str' && prevTenure !== null && prevTenure[d] === Tenure.STR;
  return v;
}

function baseView(lot: Lot, d: number, s: Snapshot, animT: number): LotView {
  const big = ['midrise', 'tower', 'hotel', 'lowrise3'].includes(lot.kind);
  const t = s.tenure[d];
  if (t === Tenure.CONSTRUCTION)
    return {
      building: `construction_${big ? 'large' : 'small'}${animT % 3}`,
      marker: null,
      sign: null,
      delisted: false,
      state: 'construction',
    };
  if (t === Tenure.STR)
    return {
      building: lot.kind,
      marker: s.principalRes[d] ? 'marker_str_pr' : 'marker_str',
      sign: null,
      delisted: false,
      state: 'str',
    };
  if (t === Tenure.VACANT)
    return {
      building: `${lot.kind}_dark`,
      marker: 'marker_held',
      sign: null,
      delisted: false,
      state: 'held',
    };
  if (t === Tenure.LTR && !s.occupied[d])
    return {
      building: `${lot.kind}_dark`,
      marker: null,
      sign: `sign_forrent${animT % 8 === 0 ? 1 : 0}`,
      delisted: false,
      state: 'forrent',
    };
  return {
    building: lot.kind,
    marker: null,
    sign: null,
    delisted: false,
    state: t === Tenure.LTR ? 'ltr' : 'owner',
  };
}

const HIGHLIGHT: Record<Exclude<Overlay, 'none'>, LotView['state'][]> = {
  str: ['str'],
  vacant: ['forrent', 'held'],
  construction: ['construction'],
};
const TINT: Record<Exclude<Overlay, 'none'>, string> = {
  str: 'rgba(230,159,0,0.85)',
  vacant: 'rgba(255,255,255,0.9)',
  construction: 'rgba(204,121,167,0.9)',
};

export function IsoMap({ layout, snapshot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [cam, setCam] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 440 });
  const [animT, setAnimT] = useState(0);

  useEffect(() => {
    loadAtlas().then(setAtlas, (e: unknown) => setError(String(e)));
  }, []);

  const city: City = useMemo(
    () =>
      buildCity(
        layout.zoneNames.map((name, i) => ({
          name,
          covered: layout.zoneCovered[i]!,
          dwellings: layout.zoneDwellings[i]!,
          renterShare: layout.zoneRenters[i]! / Math.max(1, layout.zoneDwellings[i]!),
        })),
      ),
    [layout],
  );
  const nStart = useMemo(() => snapshot.zone.length, [layout]); // first snapshot of this game
  // The previous quarter's tenure, for the delisting stamp (reset when a new game starts).
  const hist = useRef<{ cur: Snapshot | null; prev: Snapshot | null }>({ cur: null, prev: null });
  if (hist.current.cur !== snapshot) {
    const last = hist.current.cur;
    hist.current = { cur: snapshot, prev: last && last.tick < snapshot.tick ? last : null };
  }
  const prevTenure = hist.current.prev?.tenure ?? null;
  const order = useMemo(
    () => dwellingOrder(snapshot.zone, nStart, layout.zoneNames.length),
    [snapshot.zone.length, nStart, layout],
  );

  // World geometry: tile (c, r) centre at ((c - r) * 16 + ox, (c + r) * 8 + oy).
  const ox = city.rows * 16 + 16;
  const oy = 96;
  const worldW = (city.cols + city.rows) * 16 + 32;
  const worldH = (city.cols + city.rows) * 8 + oy + 16;
  const centre = (c: number, r: number) => [ox + (c - r) * 16, oy + (c + r) * 8] as const;

  // Default camera: the first (most central) district's centre.
  const home = useMemo(() => {
    const d = city.districts[0]!;
    const [x, y] = centre(d.c0 + d.w / 2, d.r0 + d.h / 2);
    return { x, y };
  }, [city]);
  const fitZoom = Math.min(1, (0.96 * size.w) / worldW, (0.96 * size.h) / worldH);
  const z = zoom === 0 ? fitZoom : zoom;
  const view = zoom === 0 ? { x: worldW / 2, y: worldH / 2 } : (cam ?? home);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Content width (without the frame's padding): the canvas must be drawn 1:1 or the
      // browser rescales it and drops pixel columns from sprites and the pixel font.
      const cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const w = Math.max(320, Math.floor(inner));
      setSize({ w, h: Math.round(Math.min(520, Math.max(300, w * 0.52))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animation clock (water, cranes, sign flicker): 4 frames a second, off for reduced motion.
  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => setAnimT((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  const lotViews = useMemo(() => {
    const out: LotView[] = [];
    for (const lot of city.lots) {
      const d =
        lot.slot >= 0
          ? order.start[lot.zone]![lot.slot]
          : order.built[lot.zone]![
              Math.round(
                lot.reserved *
                  Math.max(
                    1,
                    city.districts.find((x) => x.zone === lot.zone)!.homesPerLot * layout.scale,
                  ),
              )
            ];
      out.push(
        viewOf(lot, d, snapshot, prevTenure, animT, (snapshot.levers.upzone[lot.zone] ?? 0) > 0),
      );
    }
    return out;
  }, [city, order, snapshot, prevTenure, animT, layout.scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !atlas) return;
    const dpr = 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = WATER_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // World → screen: integer offsets so pixels stay crisp.
    const tx = Math.round(size.w / 2 - view.x * z);
    const ty = Math.round(size.h / 2 - view.y * z);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    const minX = -tx / z - 40;
    const maxX = (size.w - tx) / z + 40;
    const minY = -ty / z - 120;
    const maxY = (size.h - ty) / z + 40;
    const toScreen = (x: number, y: number) =>
      [Math.round(x * z + tx), Math.round(y * z + ty)] as const;
    const visible = (x: number, y: number) => x > minX && x < maxX && y > minY && y < maxY;
    const water = `water${animT % 4}`;
    // Tile the whole visible area (not just the city grid) so the sea has no edge.
    // Inverse of centre(): c - r = (x - ox) / 16, c + r = (y - oy) / 8.
    const u0 = Math.floor((minX - ox) / 16) - 2;
    const u1 = Math.ceil((maxX - ox) / 16) + 2;
    const v0 = Math.floor((minY - oy) / 8) - 2;
    const v1 = Math.ceil((maxY - oy) / 8) + 2;
    for (let v = v0; v <= v1; v++)
      for (let u = u0; u <= u1; u++) {
        if ((u + v) % 2 !== 0) continue; // c and r are integers only when u + v is even
        const c = (u + v) / 2;
        const r = (v - u) / 2;
        const [x, y] = centre(c, r);
        const inside = c >= 0 && r >= 0 && c < city.cols && r < city.rows;
        const g = inside ? city.ground[r * city.cols + c]! : 'water';
        // At the non-integer overview scale, wavelets alias into stripes: leave the flat sea.
        if (g === 'water' && z < 1) continue;
        drawFrame(ctx, atlas, g === 'water' ? water : g, x, y);
      }
    // Overlay: dim everything, then tint the ground under highlighted lots.
    if (overlay !== 'none') {
      ctx.fillStyle = 'rgba(27,27,42,0.35)';
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.fillStyle = TINT[overlay];
      city.lots.forEach((lot, i) => {
        if (!HIGHLIGHT[overlay].includes(lotViews[i]!.state)) return;
        const [x, y] = centre(lot.c, lot.r);
        if (!visible(x, y)) return;
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 16, y);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x - 16, y);
        ctx.closePath();
        ctx.fill();
      });
    }
    // Objects back to front (painter's order along the diagonals).
    const byTile = new Map<number, number>();
    city.lots.forEach((lot, i) => byTile.set(lot.r * city.cols + lot.c, i));
    for (let dgl = 0; dgl < city.rows + city.cols - 1; dgl++)
      for (let r = Math.max(0, dgl - city.cols + 1); r <= Math.min(city.rows - 1, dgl); r++) {
        const c = dgl - r;
        const [x, y] = centre(c, r);
        if (!visible(x, y)) continue;
        const idx = r * city.cols + c;
        const deco = city.deco[idx];
        if (deco) drawFrame(ctx, atlas, deco, x, y + 2);
        const li = byTile.get(idx);
        if (li === undefined) continue;
        const v = lotViews[li]!;
        const dim = overlay !== 'none' && !HIGHLIGHT[overlay].includes(v.state);
        if (dim) ctx.globalAlpha = 0.45;
        if (v.building) {
          const f = drawFrame(ctx, atlas, v.building, x, y);
          if (f && v.marker) {
            const [rx, ry] = f.roof ?? [f.ax, 0];
            drawFrame(ctx, atlas, v.marker, x - f.ax + rx, y - f.ay + ry - 1);
          }
        }
        if (v.sign) drawFrame(ctx, atlas, v.sign, x - 9, y + 4);
        if (v.state === 'construction') drawFrame(ctx, atlas, `dust${animT % 3}`, x + 9, y + 5);
        if (v.delisted) drawFrame(ctx, atlas, 'stamp_delist', x + 8, y - 4);
        ctx.globalAlpha = 1;
      }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Overlay icons at a fixed screen size when zoomed out (world markers are too small there).
    if (overlay !== 'none' && z < 2) {
      city.lots.forEach((lot, i) => {
        const v = lotViews[i]!;
        if (!HIGHLIGHT[overlay].includes(v.state)) return;
        const [x, y] = centre(lot.c, lot.r);
        if (!visible(x, y)) return;
        const icon =
          v.state === 'construction'
            ? 'construction_small0'
            : v.state === 'forrent'
              ? 'sign_forrent0'
              : v.marker;
        const f = icon ? atlas.frames[icon] : undefined;
        if (!f) return;
        const [sx, sy] = toScreen(x, y - 10);
        const k = icon === 'construction_small0' ? 1 : UI_SCALE;
        ctx.drawImage(
          atlas.image,
          f.x,
          f.y,
          f.w,
          f.h,
          sx - f.ax * k,
          sy - f.ay * k,
          f.w * k,
          f.h * k,
        );
      });
    }
    // Delisting stamps at a fixed screen size when zoomed out or on the STR overlay, so the
    // rule's first-quarter exits are visible on the whole-region view.
    if (z < 1 || overlay === 'str') {
      const f = atlas.frames['stamp_delist'];
      const k = overlay === 'str' ? UI_SCALE : 1;
      if (f)
        city.lots.forEach((lot, i) => {
          if (!lotViews[i]!.delisted) return;
          const [x, y] = centre(lot.c, lot.r);
          if (!visible(x, y)) return;
          const [sx, sy] = toScreen(x, y - 10);
          ctx.drawImage(
            atlas.image,
            f.x,
            f.y,
            f.w,
            f.h,
            sx - f.ax * k,
            sy - f.ay * k,
            f.w * k,
            f.h * k,
          );
        });
    }
    // District labels above each district's top corner, in screen space.
    for (const d of city.districts) {
      const [wx, wy] = centre(d.c0, d.r0);
      const [x, y] = toScreen(wx, wy);
      const tag = layout.zoneCovered[d.zone]
        ? snapshot.levers.strRegime > 0
          ? 'rule applies'
          : 'covered if rule'
        : 'exempt';
      const name = layout.zoneNames[d.zone]!;
      const k = z < 1 ? 1 : UI_SCALE;
      drawText(ctx, atlas, name, Math.round(x - (textWidth(name) * k) / 2), y - 30 * k, k);
      drawText(ctx, atlas, tag, Math.round(x - (textWidth(tag) * k) / 2), y - 21 * k, k);
    }
  }, [
    atlas,
    city,
    lotViews,
    size,
    z,
    view.x,
    view.y,
    overlay,
    animT,
    layout,
    snapshot.levers.strRegime,
  ]);

  // Pointer drag to pan.
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const clampCam = (x: number, y: number) => ({
    x: Math.min(worldW, Math.max(0, x)),
    y: Math.min(worldH, Math.max(0, y)),
  });
  const zoomBy = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))]!);
  };

  const counts = { str: 0, forrent: 0, held: 0, construction: 0 };
  let delisted = 0;
  for (const v of lotViews) {
    if (v.delisted) delisted++;
    if (
      v.state === 'str' ||
      v.state === 'forrent' ||
      v.state === 'held' ||
      v.state === 'construction'
    )
      counts[v.state]++;
  }
  const homesPerLot = Math.round(
    city.districts.reduce((a, d) => a + d.homesPerLot, 0) / Math.max(1, city.districts.length),
  );
  const highlighted =
    overlay === 'none' ? 0 : lotViews.filter((v) => HIGHLIGHT[overlay].includes(v.state)).length;

  if (error) return <p role="alert">Could not load the map art: {error}</p>;
  return (
    <div class="isomap" ref={wrapRef}>
      <div class="map-tools" role="toolbar" aria-label="Map controls">
        <label>
          Overlay{' '}
          <select
            value={overlay}
            onChange={(e) => setOverlay((e.target as HTMLSelectElement).value as Overlay)}
          >
            {OVERLAYS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {overlay !== 'none' && <span class="muted">{highlighted} buildings</span>}
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom out"
          disabled={zoom === ZOOMS[0]}
        >
          −
        </button>
        <span aria-live="polite">{zoom === 0 ? 'whole region' : `${zoom}×`}</span>
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom in"
          disabled={zoom === ZOOMS[ZOOMS.length - 1]}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setCam(null);
            if (zoom === 0) setZoom(1);
          }}
        >
          Recentre
        </button>
      </div>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        style={{ width: `${size.w}px`, height: `${size.h}px` }}
        role="img"
        aria-label={`City map, each building stands for about ${homesPerLot} homes. Shown: ${counts.str} short-term rental buildings, ${counts.forrent} for rent, ${counts.held} held empty, ${counts.construction} under construction, ${delisted} stopped short-term renting this quarter. Arrow keys pan, plus and minus zoom.`}
        onPointerDown={(e) => {
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, cx: view.x, cy: view.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || zoom === 0) return;
          setCam(clampCam(d.cx - (e.clientX - d.x) / z, d.cy - (e.clientY - d.y) / z));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => {
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1 : -1);
        }}
        onKeyDown={(e) => {
          const step = 48 / z;
          const k = e.key;
          if (k === '+' || k === '=') zoomBy(1);
          else if (k === '-') zoomBy(-1);
          else if (k === '0') setCam(null);
          else if (k.startsWith('Arrow')) {
            if (zoom === 0) return;
            const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
            const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
            setCam(clampCam(view.x + dx, view.y + dy));
          } else return;
          e.preventDefault();
        }}
      />
      <ul class="legend map-legend">
        <li>
          <Swatch atlas={atlas} name="marker_str" /> Short-term rental (investor)
        </li>
        <li>
          <Swatch atlas={atlas} name="marker_str_pr" /> Short-term rental (host's own home)
        </li>
        <li>
          <Swatch atlas={atlas} name="sign_forrent0" /> For rent (dark windows)
        </li>
        <li>
          <Swatch atlas={atlas} name="marker_held" /> Held empty
        </li>
        <li>
          <Swatch atlas={atlas} name="construction_small0" /> Under construction
        </li>
        <li>
          <Swatch atlas={atlas} name="sign_upzone" /> Upzoned lot
        </li>
        <li>
          <Swatch atlas={atlas} name="stamp_delist" /> Stopped short-term renting this quarter
        </li>
      </ul>
      <p class="chart-note">
        Each building stands for about {homesPerLot} homes; one sampled home sets its look, so the
        share of buildings in each state matches the area. Lit windows: lived in (owner or tenant).
      </p>
    </div>
  );
}

/** A legend swatch cut from the atlas (decorative; the text carries the meaning). */
function Swatch({ atlas, name }: { atlas: Atlas | null; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const f = atlas?.frames[name];
    if (!c || !atlas || !f) return;
    const k = f.h > 14 ? 1 : 2;
    c.width = f.w * k;
    c.height = f.h * k;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, 0, 0, f.w * k, f.h * k);
  }, [atlas, name]);
  return <canvas ref={ref} class="swatch" aria-hidden="true" />;
}
