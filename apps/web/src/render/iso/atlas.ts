/** Loads the generated sprite atlas (tools/art → public/atlas) and draws frames from it. */

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  roof?: [number, number];
}

export interface Atlas {
  image: HTMLImageElement;
  frames: Record<string, Frame>;
  /** The pixel font tinted dark, for outlined labels. */
  inkFont: HTMLCanvasElement;
}

let cached: Promise<Atlas> | null = null;

export function loadAtlas(): Promise<Atlas> {
  cached ??= (async () => {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}atlas/atlas.json`);
    if (!res.ok) throw new Error(`atlas.json: HTTP ${res.status}`);
    const json = (await res.json()) as { frames: Record<string, Frame> };
    const image = new Image();
    image.src = `${base}atlas/atlas.png`;
    await image.decode();
    // Dark copy of the whole atlas (only the font frames are used from it).
    const ink = document.createElement('canvas');
    ink.width = image.width;
    ink.height = image.height;
    const ctx = ink.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#1b1b2a';
    ctx.fillRect(0, 0, ink.width, ink.height);
    return { image, frames: json.frames, inkFont: ink };
  })();
  return cached;
}

/** Draw frame `name` with its anchor at (x, y). */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  name: string,
  x: number,
  y: number,
  source: CanvasImageSource = atlas.image,
): Frame | undefined {
  const f = atlas.frames[name];
  if (!f) return undefined;
  ctx.drawImage(source, f.x, f.y, f.w, f.h, x - f.ax, y - f.ay, f.w, f.h);
  return f;
}

/** Width in pixels of `text` in the 5x7 pixel font (1 px spacing). */
export function textWidth(text: string): number {
  return text.length * 6 - 1;
}

/** Pixel-font text (upper case) at integer scale k, white with a dark outline; (x, y) is the top-left. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  text: string,
  x: number,
  y: number,
  k = 1,
) {
  const up = text.toUpperCase();
  const glyph = (src: CanvasImageSource, ox: number, oy: number) => {
    for (let i = 0; i < up.length; i++) {
      const f = atlas.frames[`font_${up.charCodeAt(i)}`];
      if (f)
        ctx.drawImage(src, f.x, f.y, f.w, f.h, x + (i * 6 + ox) * k, y + oy * k, f.w * k, f.h * k);
    }
  };
  for (const [ox, oy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [1, 1],
  ] as const)
    glyph(atlas.inkFont, ox, oy);
  glyph(atlas.image, 0, 0);
}
