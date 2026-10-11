/**
 * Palette-indexed sprite canvas and the isometric drawing primitives (2:1 projection, 32x16
 * ground tile). Everything is integer pixel work; nothing here uses floating-point blending.
 */

export class Sprite {
  readonly px: Uint8Array;
  /** Anchor: the pixel that sits on the tile centre (ground tiles) or footprint centre (buildings). */
  ax = 0;
  ay = 0;
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h);
  }

  set(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x]!;
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Copy the non-transparent pixels of `s` with its top-left at (x, y). */
  blit(s: Sprite, x: number, y: number): void {
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const c = s.px[j * s.w + i]!;
        if (c !== 0) this.set(x + i, y + j, c);
      }
  }

  /** Replace every pixel of colour `from` with `to`. */
  recolor(from: number, to: number): Sprite {
    const s = this.clone();
    for (let i = 0; i < s.px.length; i++) if (s.px[i] === from) s.px[i] = to;
    return s;
  }

  clone(): Sprite {
    const s = new Sprite(this.w, this.h);
    s.px.set(this.px);
    s.ax = this.ax;
    s.ay = this.ay;
    return s;
  }
}

/**
 * Sprite from rows of characters. `key` maps characters to palette indices; '.' and ' ' are
 * transparent.
 */
export function fromGrid(rows: readonly string[], key: Record<string, number>): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const s = new Sprite(w, h);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const ch = r[x]!;
      if (ch === '.' || ch === ' ') continue;
      const c = key[ch];
      if (c === undefined) throw new Error(`fromGrid: no colour for '${ch}'`);
      s.set(x, y, c);
    }
  });
  return s;
}

/** Deterministic 32-bit hash of small integers (procedural variation; not the sim's RNG). */
export function hash(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= x | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

/**
 * Columns of a diamond of width 2*halfW centred on cx with its top vertex at row `top`: calls
 * fn(x, y0, y1) with the inclusive row range of each column, and whether it is the left half.
 * Column dx (from the tip) spans 2*floor(dx/2)+1 rows around the centre row, so 2:1 diamonds
 * tile the plane exactly (256 px per 32x16 cell, no shared rows between neighbours).
 */
export function diamondColumns(
  cx: number,
  top: number,
  halfW: number,
  fn: (x: number, y0: number, y1: number, left: boolean) => void,
): void {
  if (halfW % 2 !== 0 || !Number.isInteger(top))
    throw new Error(`diamond needs an even half-width and integer top (got ${halfW}, ${top})`);
  const mid = top + halfW / 2 - 1;
  for (let dx = 0; dx < halfW; dx++) {
    const f = Math.floor(dx / 2);
    fn(cx - halfW + dx, mid - f, mid + f, true);
    fn(cx + halfW - 1 - dx, mid - f, mid + f, false);
  }
}

export function diamond(s: Sprite, cx: number, top: number, halfW: number, c: number): void {
  diamondColumns(cx, top, halfW, (x, y0, y1) => {
    for (let y = y0; y <= y1; y++) s.set(x, y, c);
  });
}

/** One-pixel outline of a diamond (its top and bottom edge pixels per column). */
export function diamondEdge(
  s: Sprite,
  cx: number,
  top: number,
  halfW: number,
  cTop: number,
  cBottom = cTop,
): void {
  diamondColumns(cx, top, halfW, (x, y0, y1) => {
    s.set(x, y0, cTop);
    s.set(x, y1, cBottom);
  });
}

export interface BoxColors {
  top: number;
  left: number;
  right: number;
  /** Optional 1px edge on the top face rim. */
  rim?: number;
}

/**
 * An isometric box: footprint diamond of half-width `halfW`, walls `height` px tall, roof diamond
 * top vertex at row `top`. Returns the row of the footprint's bottom vertex.
 */
export function box(
  s: Sprite,
  cx: number,
  top: number,
  halfW: number,
  height: number,
  col: BoxColors,
): number {
  diamondColumns(cx, top, halfW, (x, _y0, y1, left) => {
    for (let y = y1 + 1; y <= y1 + height; y++) s.set(x, y, left ? col.left : col.right);
  });
  diamond(s, cx, top, halfW, col.top);
  if (col.rim !== undefined) diamondEdge(s, cx, top, halfW, col.rim);
  return top + halfW + height - 1;
}

export interface WindowOpts {
  /** Column pitch along the wall (windows are 2 px wide). */
  pitchX: number;
  /** Row pitch (one floor). */
  pitchY: number;
  /** Window height. */
  wh: number;
  marginTop: number;
  marginBottom: number;
  /** Palette index of window (face 0 = left wall, 1 = right wall), or 0 to skip it. */
  pick: (face: 0 | 1, col: number, row: number) => number;
}

/** Windows on the two visible walls of a box drawn with box(), sheared along the wall slope. */
export function windows(
  s: Sprite,
  cx: number,
  top: number,
  halfW: number,
  height: number,
  o: WindowOpts,
): void {
  diamondColumns(cx, top, halfW, (x, _y0, y1, left) => {
    // Distance from the building's front corner (the central vertical edge).
    const d = left ? cx - 1 - x : x - cx;
    if (d < 2 || d > halfW - 3) return;
    const k = (d - 2) % o.pitchX;
    if (k > 1) return;
    const col = Math.floor((d - 2) / o.pitchX);
    let row = 0;
    for (let oy = o.marginTop; oy + o.wh <= height - o.marginBottom; oy += o.pitchY, row++) {
      const c = o.pick(left ? 0 : 1, col, row);
      if (c === 0) continue;
      for (let j = 0; j < o.wh; j++) s.set(x, y1 + 1 + oy + j, c);
    }
  });
}

/**
 * Hipped roof over a footprint whose top vertex is at row `top`: stacked diamonds, each 2 px
 * narrower and 1 px higher, left half dark and right half light. Returns the rows it rises.
 */
export function hipRoof(
  s: Sprite,
  cx: number,
  top: number,
  halfW: number,
  light: number,
  dark: number,
): number {
  let k = 0;
  for (let w = halfW; w >= 2; w -= 2, k++) {
    // Each layer's centre rises 1.5 rows on average while its half-height shrinks by 1.
    diamondColumns(cx, top + (halfW - w) / 2 - k - (k >> 1), w, (x, y0, y1, left) => {
      for (let y = y0; y <= y1; y++) s.set(x, y, left ? dark : light);
    });
  }
  return k;
}
