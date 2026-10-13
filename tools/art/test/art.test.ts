import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pack } from '../src/atlas.ts';
import { buildAtlas } from '../src/build.ts';
import { buildings } from '../src/buildings.ts';
import { diamond, Sprite } from '../src/draw.ts';
import { groundTiles } from '../src/ground.ts';
import { ICONS, MARKERS } from '../src/icons.ts';
import { C, PALETTE, rgba } from '../src/palette.ts';
import { encodePng } from '../src/png.ts';

/** Rec. 601 luma of a palette index (0-255). */
function luma(i: number): number {
  const [r, g, b] = rgba()[i]!;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('palette', () => {
  it('has at most 32 colours including transparency, with unique names', () => {
    expect(PALETTE.length).toBeLessThanOrEqual(32);
    expect(new Set(PALETTE.map(([n]) => n)).size).toBe(PALETTE.length);
    expect(rgba()[0]![3]).toBe(0);
    expect(
      rgba()
        .slice(1)
        .every(([, , , a]) => a === 255),
    ).toBe(true);
  });
});

describe('png encoder', () => {
  it('writes a valid indexed PNG whose pixels round-trip', () => {
    const pixels = Uint8Array.from({ length: 12 }, (_, i) => i % 4);
    const png = encodePng({ width: 4, height: 3, pixels }, rgba().slice(0, 4));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Pull out IDAT and inflate: rows are [filter 0, 4 indices].
    let off = 8;
    let idat = Buffer.alloc(0);
    while (off < png.length) {
      const len = png.readUInt32BE(off);
      const type = png.toString('ascii', off + 4, off + 8);
      if (type === 'IDAT') idat = Buffer.concat([idat, png.subarray(off + 8, off + 8 + len)]);
      off += 12 + len;
    }
    const raw = inflateSync(idat);
    for (let y = 0; y < 3; y++) {
      expect(raw[y * 5]).toBe(0);
      expect([...raw.subarray(y * 5 + 1, y * 5 + 5)]).toEqual([
        ...pixels.subarray(y * 4, y * 4 + 4),
      ]);
    }
  });

  it('rejects indices outside the palette', () => {
    expect(() =>
      encodePng({ width: 1, height: 1, pixels: Uint8Array.of(5) }, rgba().slice(0, 2)),
    ).toThrow();
  });
});

describe('atlas', () => {
  it('is deterministic (same bytes on every build)', () => {
    const a = buildAtlas();
    const b = buildAtlas();
    expect(a.png.equals(b.png)).toBe(true);
    expect(a.json).toBe(b.json);
  });

  it('packs every sprite without overlaps and keeps anchors inside frames', () => {
    const { atlas } = buildAtlas();
    const frames = Object.entries(atlas.frames);
    expect(frames.length).toBeGreaterThan(100);
    for (const [, f] of frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(atlas.image.width);
      expect(f.y + f.h).toBeLessThanOrEqual(atlas.image.height);
      expect(f.ax).toBeGreaterThanOrEqual(0);
      expect(f.ax).toBeLessThanOrEqual(f.w);
      expect(f.ay).toBeGreaterThanOrEqual(0);
      expect(f.ay).toBeLessThanOrEqual(f.h);
    }
    for (let i = 0; i < frames.length; i++)
      for (let j = i + 1; j < frames.length; j++) {
        const a = frames[i]![1];
        const b = frames[j]![1];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${frames[i]![0]} overlaps ${frames[j]![0]}`).toBe(false);
      }
  });

  it('stays within the 300 KB size budget', () => {
    expect(buildAtlas().png.length).toBeLessThan(300 * 1024);
  });

  it('refuses duplicate names', () => {
    const s = new Sprite(1, 1);
    expect(() =>
      pack([
        { name: 'a', sprite: s },
        { name: 'a', sprite: s },
      ]),
    ).toThrow();
  });
});

describe('iso grid', () => {
  it('ground tiles fill the 32x16 diamond exactly, so neighbours meet without gaps or overlaps', () => {
    const ref = new Sprite(32, 16);
    diamond(ref, 16, 0, 16, 1);
    for (const g of groundTiles()) {
      expect([g.sprite.w, g.sprite.h, g.sprite.ax, g.sprite.ay], g.name).toEqual([32, 16, 16, 7]);
      for (let i = 0; i < ref.px.length; i++)
        expect(g.sprite.px[i]! !== 0, `${g.name} pixel ${i}`).toBe(ref.px[i] !== 0);
    }
    // Tiling: the diamond and its four neighbours cover a region with no double-covered pixels.
    const W = 96;
    const H = 48;
    const cover = new Uint8Array(W * H);
    for (const [cx, cy] of [
      [48, 24],
      [64, 16],
      [64, 32],
      [32, 16],
      [32, 32],
    ] as const)
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 32; x++)
          if (ref.px[y * 32 + x]) cover[(cy - 8 + y) * W + (cx - 16 + x)]! += 1;
    expect(Math.max(...cover)).toBe(1);
    // The centre tile is fully surrounded: every pixel in its bounding box is covered once.
    for (let y = 16; y < 31; y++) for (let x = 32; x < 64; x++) expect(cover[y * W + x]).toBe(1);
  });

  it('buildings are 32 px wide and their footprint centre is inside the sprite', () => {
    for (const b of buildings()) {
      expect(b.sprite.w, b.name).toBe(32);
      expect(b.sprite.ax).toBe(16);
      expect(b.sprite.ay).toBeLessThan(b.sprite.h);
      // The anchor pixel itself is painted (the building stands on it).
      expect(b.sprite.get(b.sprite.ax, b.sprite.ay - 1), b.name).not.toBe(0);
    }
  });
});

describe('greyscale distinguishability', () => {
  it('vacant buildings are much darker than occupied ones in greyscale', () => {
    const all = buildings();
    for (const b of all.filter((x) => !x.name.endsWith('_dark'))) {
      const dark = all.find((x) => x.name === `${b.name}_dark`)!;
      const mean = (s: Sprite) => {
        let t = 0;
        let n = 0;
        for (const p of s.px)
          if (p !== 0) {
            t += luma(p);
            n++;
          }
        return t / n;
      };
      // Window pixels differ; the whole-sprite mean must drop noticeably.
      expect(mean(b.sprite) - mean(dark.sprite), b.name).toBeGreaterThan(4);
    }
  });

  it('state markers differ in luminance and shape', () => {
    const fill = (s: Sprite) => [...s.px].filter((p) => p !== 0 && p !== C.ink);
    const avg = (xs: number[]) => xs.reduce((a, p) => a + luma(p), 0) / xs.length;
    const str = avg(fill(MARKERS.marker_str!));
    const held = avg(fill(MARKERS.marker_held!));
    expect(str - held).toBeGreaterThan(60);
    // STR investor vs principal residence: different interior shapes (key hole vs house).
    const a = MARKERS.marker_str!.px.map((p) => (p === C.ink ? 1 : 0));
    const b = MARKERS.marker_str_pr!.px.map((p) => (p === C.ink ? 1 : 0));
    expect(a.some((v, i) => v !== b[i])).toBe(true);
  });

  it('stakeholder moods differ by mouth shape, not colour alone', () => {
    const ink = (n: string) => ICONS[n]!.px.map((p) => (p === C.ink ? 1 : 0));
    const moods = ['face_happy', 'face_neutral', 'face_angry'].map(ink);
    for (let i = 0; i < moods.length; i++)
      for (let j = i + 1; j < moods.length; j++) {
        const diff = moods[i]!.reduce((n, v, k) => n + (v !== moods[j]![k] ? 1 : 0), 0);
        expect(diff, `moods ${i} and ${j}`).toBeGreaterThanOrEqual(6);
      }
  });
});
