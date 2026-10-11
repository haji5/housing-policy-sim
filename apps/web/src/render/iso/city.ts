/**
 * Stylised isometric city layout (M6). Deterministic from the zone list: each zone becomes a
 * district of building lots separated by streets; covered zones form one mainland and exempt
 * zones sit across the water. Each lot stands for about HOMES_PER_LOT real homes and shows one
 * sampled home of its zone (a fixed hashed order), so the share of lots in each state matches the
 * zone's share of homes in that state. Lots reserved for construction show new homes as they are
 * built.
 */
import { hash32 } from '@zoned-out/sim';

export const HOMES_PER_LOT = 250;

export type Kind =
  | 'house1'
  | 'house2'
  | 'house3'
  | 'house4'
  | 'duplex'
  | 'townhouses'
  | 'lowrise1'
  | 'lowrise2'
  | 'lowrise3'
  | 'midrise'
  | 'tower'
  | 'hotel'
  | 'commercial';

export interface Lot {
  c: number;
  r: number;
  zone: number;
  /** Index among the zone's lots (sampled home k of the zone's hashed order). */
  slot: number;
  /** Reserved for construction: index among the zone's reserved lots, else -1. */
  reserved: number;
  kind: Kind;
}

export interface District {
  zone: number;
  c0: number;
  r0: number;
  w: number;
  h: number;
  island: boolean;
  /** Real homes each lot stands for in this zone. */
  homesPerLot: number;
}

export type Ground = string;

export interface City {
  cols: number;
  rows: number;
  /** Ground sprite name per tile, row-major. */
  ground: Ground[];
  /** Decorations (trees) per tile, or ''. */
  deco: string[];
  lots: Lot[];
  districts: District[];
}

export interface ZoneInfo {
  name: string;
  covered: boolean;
  /** Real dwellings at the start. */
  dwellings: number;
  /** Renter households / dwellings: a proxy for density. */
  renterShare: number;
}

const DENSE: Kind[] = [
  'tower',
  'midrise',
  'midrise',
  'hotel',
  'commercial',
  'lowrise3',
  'lowrise2',
];
const URBAN: Kind[] = [
  'lowrise1',
  'lowrise2',
  'lowrise3',
  'townhouses',
  'duplex',
  'house1',
  'house3',
  'commercial',
];
const SUBURB: Kind[] = [
  'house1',
  'house2',
  'house3',
  'house4',
  'duplex',
  'townhouses',
  'house2',
  'house4',
];
const RURAL: Kind[] = ['house1', 'house2', 'house3', 'house4'];

function kindsFor(z: ZoneInfo): Kind[] {
  if (z.renterShare > 0.6) return DENSE;
  if (z.renterShare > 0.4) return URBAN;
  if (z.renterShare > 0.22) return SUBURB;
  return RURAL;
}

/** New construction on reserved lots: rentals and condos, so mid-density types. */
export function builtKind(zone: number, reserved: number, dense: boolean): Kind {
  const opts: Kind[] = dense ? ['lowrise3', 'midrise'] : ['lowrise1', 'lowrise2', 'townhouses'];
  return opts[hash32(11, zone, reserved, 3) % opts.length]!;
}

/** Lots per district, from its size. */
function lotCount(z: ZoneInfo): number {
  return Math.max(16, Math.min(420, Math.round(z.dwellings / HOMES_PER_LOT)));
}

/** Tile is a street inside a district: every 4th column and every 3rd row. */
const isStreet = (lc: number, lr: number) => lc % 4 === 0 || lr % 3 === 0;

export function buildCity(zones: ZoneInfo[]): City {
  // District sizes: lots plus ~20% reserved for construction, at 1/2 lot density (streets).
  const sizes = zones.map((z) => {
    const lots = lotCount(z);
    const reserved = Math.max(3, Math.round(lots * 0.2));
    let w = Math.max(5, Math.ceil(Math.sqrt((lots + reserved) / 0.5)) + 1);
    // Round w up so the district ends on a street column.
    w += (4 - (w % 4)) % 4;
    let h = 3;
    const cap = () => {
      let n = 0;
      for (let lr = 1; lr < h; lr++) for (let lc = 1; lc < w; lc++) if (!isStreet(lc, lr)) n++;
      return n;
    };
    while (cap() < lots + reserved) h += 3;
    return { lots, reserved, w: w + 1, h: h + 1 };
  });

  // Mainland: covered zones shelf-packed with a one-tile gap (shared streets); islands after.
  const MARGIN = 3;
  const districts: District[] = [];
  const mainland = zones.map((_, i) => i).filter((i) => zones[i]!.covered);
  const islands = zones.map((_, i) => i).filter((i) => !zones[i]!.covered);
  const totalArea = mainland.reduce((a, i) => a + sizes[i]!.w * sizes[i]!.h, 0);
  const maxW = Math.max(
    ...mainland.map((i) => sizes[i]!.w),
    Math.ceil(Math.sqrt(totalArea) * 1.15),
  );
  let c = MARGIN;
  let r = MARGIN;
  let rowH = 0;
  let mainRight = 0;
  for (const i of mainland) {
    const s = sizes[i]!;
    if (c > MARGIN && c + s.w > MARGIN + maxW) {
      c = MARGIN;
      r += rowH - 1;
      rowH = 0;
    }
    districts.push({ zone: i, c0: c, r0: r, w: s.w, h: s.h, island: false, homesPerLot: 0 });
    // Neighbouring districts share their border street.
    c += s.w - 1;
    rowH = Math.max(rowH, s.h);
    mainRight = Math.max(mainRight, c + 1);
  }
  const mainBottom = r + rowH;
  // Islands in a column to the east of the mainland, separated by water.
  let ir = MARGIN;
  const ic = mainRight + 3;
  let islandRight = ic;
  for (const i of islands) {
    const s = sizes[i]!;
    districts.push({ zone: i, c0: ic, r0: ir, w: s.w, h: s.h, island: true, homesPerLot: 0 });
    ir += s.h + 3;
    islandRight = Math.max(islandRight, ic + s.w);
  }
  const cols = (islands.length ? islandRight : mainRight) + MARGIN;
  const rows = Math.max(mainBottom, ir - 3) + MARGIN;

  const ground: Ground[] = new Array<Ground>(cols * rows).fill('');
  const deco: string[] = new Array<string>(cols * rows).fill('');
  const land = new Uint8Array(cols * rows);
  const road = new Uint8Array(cols * rows);
  const at = (cc: number, rr: number) => rr * cols + cc;
  const lots: Lot[] = [];

  for (const d of districts) {
    const z = zones[d.zone]!;
    const s = sizes[d.zone]!;
    d.homesPerLot = z.dwellings / s.lots;
    const kinds = kindsFor(z);
    let slot = 0;
    let reserved = 0;
    const cells: [number, number][] = [];
    for (let lr = 0; lr < d.h; lr++)
      for (let lc = 0; lc < d.w; lc++) {
        const cc = d.c0 + lc;
        const rr = d.r0 + lr;
        land[at(cc, rr)] = 1;
        if (isStreet(lc, lr)) road[at(cc, rr)] = 1;
        else cells.push([cc, rr]);
      }
    // Reserved lots spread through the district (every k-th cell), the rest are built lots.
    const every = Math.max(2, Math.floor(cells.length / s.reserved));
    cells.forEach(([cc, rr], k) => {
      const isRes = k % every === every - 1 && reserved < s.reserved;
      if (isRes) {
        lots.push({
          c: cc,
          r: rr,
          zone: d.zone,
          slot: -1,
          reserved: reserved++,
          kind: builtKind(d.zone, reserved, kinds === DENSE),
        });
      } else if (slot < s.lots) {
        const kind = kinds[hash32(5, d.zone, slot, 2) % kinds.length]!;
        lots.push({ c: cc, r: rr, zone: d.zone, slot: slot++, reserved: -1, kind });
      } else {
        // Spare cells: parks and trees.
        ground[at(cc, rr)] = hash32(6, cc, rr, 1) % 3 === 0 ? 'park' : 'grass3';
        deco[at(cc, rr)] = hash32(6, cc, rr, 2) % 2 === 0 ? 'tree_round' : '';
      }
    });
    // Islands and rural districts: drop the inner streets to a single loop road.
    if (d.island || kinds === RURAL)
      for (let lr = 1; lr < d.h - 1; lr++)
        for (let lc = 1; lc < d.w - 1; lc++) {
          const i = at(d.c0 + lc, d.r0 + lr);
          if (road[i] && lr % 3 !== 0) {
            road[i] = 0;
            ground[i] = 'grass2';
            deco[i] = hash32(7, lc, lr, d.zone) % 3 === 0 ? 'tree_conifer' : '';
          }
        }
  }

  // Ground: roads by neighbour, land grass, water with shorelines next to land.
  const isRoad = (cc: number, rr: number) =>
    cc >= 0 && rr >= 0 && cc < cols && rr < rows && road[at(cc, rr)] === 1;
  const isLand = (cc: number, rr: number) =>
    cc >= 0 && rr >= 0 && cc < cols && rr < rows && land[at(cc, rr)] === 1;
  for (let rr = 0; rr < rows; rr++)
    for (let cc = 0; cc < cols; cc++) {
      const i = at(cc, rr);
      if (ground[i]) continue;
      if (road[i]) {
        const n = isRoad(cc, rr - 1);
        const e = isRoad(cc + 1, rr);
        const s = isRoad(cc, rr + 1);
        const w = isRoad(cc - 1, rr);
        ground[i] = roadPiece(n, e, s, w);
      } else if (land[i]) {
        const h = hash32(8, cc, rr, 0) % 10;
        ground[i] = h < 6 ? 'grass1' : h < 9 ? 'grass2' : 'grass3';
      } else {
        // Water; a shore piece where land is directly adjacent (land side named by edge).
        if (isLand(cc, rr - 1)) ground[i] = 'shore_N';
        else if (isLand(cc - 1, rr)) ground[i] = 'shore_W';
        else if (isLand(cc + 1, rr)) ground[i] = 'shore_E';
        else if (isLand(cc, rr + 1)) ground[i] = 'shore_S';
        else ground[i] = 'water';
      }
    }
  return { cols, rows, ground, deco, lots, districts };
}

export function roadPiece(n: boolean, e: boolean, s: boolean, w: boolean): string {
  const k = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
  if (k === 4) return 'road_X';
  if (k === 3) return !n ? 'road_T_N' : !e ? 'road_T_E' : !s ? 'road_T_S' : 'road_T_W';
  if (n && e) return 'road_NE';
  if (e && s) return 'road_ES';
  if (s && w) return 'road_SW';
  if (w && n) return 'road_WN';
  if (e || w) return n || s ? 'road_X' : 'road_EW';
  return 'road_NS';
}
