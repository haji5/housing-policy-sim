/** Shelf-packs sprites into one atlas image (deterministic: sorted by height, then name). */
import type { Sprite } from './draw.ts';
import type { IndexedImage } from './png.ts';

export interface AtlasEntry {
  name: string;
  sprite: Sprite;
  /** Extra per-frame metadata copied into the JSON (e.g. rooftop marker position). */
  meta?: Record<string, unknown>;
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor in frame pixels. */
  ax: number;
  ay: number;
  [k: string]: unknown;
}

export interface Atlas {
  image: IndexedImage;
  frames: Record<string, Frame>;
}

export function pack(entries: readonly AtlasEntry[], width = 512, pad = 1): Atlas {
  const names = new Set<string>();
  for (const e of entries) {
    if (names.has(e.name)) throw new Error(`duplicate sprite name ${e.name}`);
    names.add(e.name);
  }
  const sorted = [...entries].sort(
    (a, b) => b.sprite.h - a.sprite.h || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const frames: Record<string, Frame> = {};
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const e of sorted) {
    const { w, h } = e.sprite;
    if (w + 2 * pad > width) throw new Error(`${e.name} is wider than the atlas`);
    if (x + w + pad > width) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    frames[e.name] = { x, y, w, h, ax: e.sprite.ax, ay: e.sprite.ay, ...e.meta };
    x += w + pad;
    rowH = Math.max(rowH, h);
  }
  const height = y + rowH + pad;
  const pixels = new Uint8Array(width * height);
  for (const e of sorted) {
    const f = frames[e.name]!;
    for (let j = 0; j < f.h; j++)
      pixels.set(e.sprite.px.subarray(j * f.w, (j + 1) * f.w), (f.y + j) * width + f.x);
  }
  // Stable key order in the JSON.
  const ordered: Record<string, Frame> = {};
  for (const n of [...names].sort()) ordered[n] = frames[n]!;
  return { image: { width, height, pixels }, frames: ordered };
}
