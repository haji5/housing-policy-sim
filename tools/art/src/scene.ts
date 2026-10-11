/**
 * A small composed test scene from the atlas sprites, for the screenshot quality loop (PLAN §9.4):
 * checks that ground tiles meet without gaps and buildings sit on the grid.
 */
import type { Sprite } from './draw.ts';
import type { AtlasEntry } from './atlas.ts';
import type { IndexedImage } from './png.ts';

export function composeScene(
  entries: readonly AtlasEntry[],
  ground: string[][],
  objects: (string | null)[][],
  overlays: (string | null)[][] = [],
): IndexedImage {
  const by = new Map(entries.map((e) => [e.name, e]));
  const rows = ground.length;
  const cols = ground[0]!.length;
  const W = (rows + cols) * 16 + 32;
  const H = (rows + cols) * 8 + 96;
  const ox = rows * 16 + 16;
  const oy = 80;
  const pixels = new Uint8Array(W * H);
  const draw = (s: Sprite, x: number, y: number) => {
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const c = s.px[j * s.w + i]!;
        const px = x + i;
        const py = y + j;
        if (c !== 0 && px >= 0 && py >= 0 && px < W && py < H) pixels[py * W + px] = c;
      }
  };
  const get = (n: string) => {
    const e = by.get(n);
    if (!e) throw new Error(`scene: no sprite ${n}`);
    return e;
  };
  const centre = (r: number, c: number) => [ox + (c - r) * 16, oy + (c + r) * 8] as const;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const s = get(ground[r]![c]!).sprite;
      const [x, y] = centre(r, c);
      draw(s, x - s.ax, y - s.ay);
    }
  // Painter's order: back to front along the diagonal.
  for (let d = 0; d < rows + cols - 1; d++)
    for (let r = 0; r < rows; r++) {
      const c = d - r;
      if (c < 0 || c >= cols) continue;
      const name = objects[r]?.[c];
      const [x, y] = centre(r, c);
      if (name) {
        const e = get(name);
        draw(e.sprite, x - e.sprite.ax, y - e.sprite.ay);
        const ov = overlays[r]?.[c];
        if (ov) {
          const o = get(ov).sprite;
          const roof = (e.meta?.roof as [number, number] | undefined) ?? [e.sprite.ax, 0];
          const rx = x - e.sprite.ax + roof[0];
          const ry = y - e.sprite.ay + roof[1];
          draw(o, rx - o.ax, ry - o.ay);
        }
      }
    }
  return { width: W, height: H, pixels };
}
