import type { IndexedImage } from './png.ts';

/** Nearest-neighbour integer upscale (previews and screenshot checks). */
export function upscale(img: IndexedImage, k: number): IndexedImage {
  const w = img.width * k;
  const h = img.height * k;
  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      pixels[y * w + x] = img.pixels[Math.floor(y / k) * img.width + Math.floor(x / k)]!;
  return { width: w, height: h, pixels };
}
