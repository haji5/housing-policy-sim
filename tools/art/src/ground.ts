/**
 * Ground tiles (ADR 0010): 32x16 isometric diamonds. Roads are described by which of the four
 * diamond edges they reach (N = upper-right, E = lower-right, S = lower-left, W = upper-left), so
 * straights, corners, T-junctions and the cross all come from one function.
 */
import { diamond, diamondColumns, hash, Sprite } from './draw.ts';
import { C } from './palette.ts';

export interface GroundSprite {
  name: string;
  sprite: Sprite;
}

function tile(): Sprite {
  const s = new Sprite(32, 16);
  s.ax = 16;
  s.ay = 7;
  return s;
}

/** Diamond fill with hashed speckles of `dots` colours. */
function speckled(base: number, dots: number[], seed: number, density: number): Sprite {
  const s = tile();
  diamond(s, 16, 0, 16, base);
  diamondColumns(16, 0, 16, (x, y0, y1) => {
    for (let y = y0 + 1; y < y1; y++) {
      const h = hash(seed, x, y);
      if (h % 100 < density) s.set(x, y, dots[h % dots.length]!);
    }
  });
  return s;
}

/**
 * Position inside the diamond: u grows towards the E (lower-right) edge, v towards the S
 * (lower-left) edge, both in [0, 1]. Returns null outside.
 */
function iso(x: number, y: number): { u: number; v: number } {
  // Diamond centre (16, 8); u axis along (+2, +1), v axis along (-2, +1).
  const dx = (x + 0.5 - 16) / 16;
  const dy = (y + 0.5 - 7.5) / 7.5;
  const clamp = (t: number) => Math.min(1, Math.max(0, t));
  return { u: clamp((dx + dy + 1) / 2), v: clamp((dy - dx + 1) / 2) };
}

/** Calls fn for every pixel of the tile's diamond mask. */
function eachPixel(fn: (x: number, y: number, p: { u: number; v: number }) => void): void {
  diamondColumns(16, 0, 16, (x, y0, y1) => {
    for (let y = y0; y <= y1; y++) fn(x, y, iso(x, y));
  });
}

type Edge = 'N' | 'E' | 'S' | 'W';

/** Road tile reaching the given edges, with a dashed centre line and kerbs. */
function road(edges: Edge[]): Sprite {
  const s = speckled(C.grass1, [C.grass2, C.grass3], 1, 10);
  const has = (e: Edge) => edges.includes(e);
  const half = 0.23;
  eachPixel((x, y, p) => {
    // The N-S road runs along v (u ≈ 0.5); N is small v. The E-W road runs along u; W is small u.
    const onNS =
      Math.abs(p.u - 0.5) < half &&
      ((has('N') && p.v <= 0.5 + half) || (has('S') && p.v >= 0.5 - half));
    const onEW =
      Math.abs(p.v - 0.5) < half &&
      ((has('W') && p.u <= 0.5 + half) || (has('E') && p.u >= 0.5 - half));
    if (!onNS && !onEW) return;
    const kerbNS = onNS && Math.abs(p.u - 0.5) > half - 0.06;
    const kerbEW = onEW && Math.abs(p.v - 0.5) > half - 0.06;
    const kerb = (kerbNS && !onEW) || (kerbEW && !onNS) || (kerbNS && kerbEW);
    s.set(x, y, kerb ? C.sidewalk : C.road);
    const dashNS = onNS && !onEW && Math.abs(p.u - 0.5) < 0.04 && Math.floor(p.v * 8) % 2 === 0;
    const dashEW = onEW && !onNS && Math.abs(p.v - 0.5) < 0.04 && Math.floor(p.u * 8) % 2 === 0;
    if (edges.length === 2 && (dashNS || dashEW)) s.set(x, y, C.roadLine);
  });
  return s;
}

/** Four animated water frames: sparse wavelets drift sideways. */
function water(frame: number): Sprite {
  const s = tile();
  diamond(s, 16, 0, 16, C.water1);
  diamondColumns(16, 0, 16, (x, y0, y1) => {
    for (let y = y0; y <= y1; y++) {
      // Sparse 4 px wavelets that drift 2 px per frame.
      const cell = Math.floor(((x + frame * 2) % 32) / 4);
      const h = hash(3, y, cell) % 27;
      if (h < 3 && y % 2 === 0) s.set(x, y, h === 0 ? C.foam : C.water2);
    }
  });
  return s;
}

/** Shoreline: water on the side away from `land` with a sand strip, grass beyond. */
function shore(land: Edge): Sprite {
  const s = tile();
  eachPixel((x, y, p) => {
    const t = land === 'N' ? 1 - p.v : land === 'S' ? p.v : land === 'W' ? 1 - p.u : p.u;
    s.set(x, y, t > 0.62 ? C.grass1 : t > 0.45 ? C.sand : t > 0.4 ? C.foam : C.water1);
  });
  return s;
}

function park(): Sprite {
  const s = speckled(C.grass3, [C.grass1, C.white, C.strYellow], 11, 6);
  // Gravel path along the N-S axis.
  eachPixel((x, y, p) => {
    if (Math.abs(p.v - 0.5) < 0.08) s.set(x, y, C.sand);
  });
  return s;
}

function farmland(): Sprite {
  const s = tile();
  eachPixel((x, y, p) => {
    s.set(x, y, Math.floor(p.v * 6) % 2 === 0 ? C.sand : C.grass2);
  });
  return s;
}

function rock(): Sprite {
  const s = speckled(C.grass2, [C.grass1], 13, 10);
  // Two boulders.
  for (const [cx, cy, r] of [
    [12, 8, 3],
    [20, 7, 2],
  ] as const)
    for (let y = -r; y <= r; y++)
      for (let x = -r * 2; x <= r * 2; x++)
        if ((x * x) / 4 + y * y <= r * r) s.set(cx + x, cy + y, y < 0 ? C.concLight : C.concShade);
  return s;
}

export function groundTiles(): GroundSprite[] {
  const out: GroundSprite[] = [];
  out.push({ name: 'grass1', sprite: speckled(C.grass1, [C.grass2, C.grass3], 1, 10) });
  out.push({ name: 'grass2', sprite: speckled(C.grass2, [C.grass1, C.forest], 2, 12) });
  out.push({ name: 'grass3', sprite: speckled(C.grass1, [C.grass3, C.strYellow, C.white], 3, 7) });
  out.push({ name: 'sidewalk', sprite: speckled(C.sidewalk, [C.concShade], 4, 8) });
  out.push({ name: 'park', sprite: park() });
  out.push({ name: 'forest', sprite: speckled(C.forest, [C.grass2], 5, 25) });
  out.push({ name: 'rock', sprite: rock() });
  out.push({ name: 'farmland', sprite: farmland() });
  out.push({ name: 'sand', sprite: speckled(C.sand, [C.wallShade], 6, 8) });
  for (let f = 0; f < 4; f++) out.push({ name: `water${f}`, sprite: water(f) });
  for (const e of ['N', 'E', 'S', 'W'] as const) out.push({ name: `shore_${e}`, sprite: shore(e) });
  const roads: [string, Edge[]][] = [
    ['road_NS', ['N', 'S']],
    ['road_EW', ['E', 'W']],
    ['road_NE', ['N', 'E']],
    ['road_ES', ['E', 'S']],
    ['road_SW', ['S', 'W']],
    ['road_WN', ['W', 'N']],
    ['road_T_N', ['E', 'S', 'W']],
    ['road_T_E', ['N', 'S', 'W']],
    ['road_T_S', ['N', 'E', 'W']],
    ['road_T_W', ['N', 'E', 'S']],
    ['road_X', ['N', 'E', 'S', 'W']],
  ];
  for (const [name, edges] of roads) out.push({ name, sprite: road(edges) });
  return out;
}
