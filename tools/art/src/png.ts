/**
 * Minimal indexed-colour PNG encoder (colour type 3, 8 bits per pixel, PLTE + tRNS). Uses only
 * node:zlib (deflate and crc32), so the art pipeline needs no third-party dependency. Output is
 * byte-for-byte deterministic for the same input.
 */
import { crc32, deflateSync } from 'node:zlib';

export interface IndexedImage {
  width: number;
  height: number;
  /** Palette index per pixel, row-major. Index 0 is fully transparent by convention. */
  pixels: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/**
 * Encode `img` with `palette` (RGBA, 0-255). Palette entries with alpha 0 become transparent via
 * tRNS. Scanlines use filter 0 (none): palette images compress well without prediction.
 */
export function encodePng(
  img: IndexedImage,
  palette: readonly [number, number, number, number][],
): Buffer {
  if (palette.length === 0 || palette.length > 256)
    throw new Error('palette must have 1-256 entries');
  if (img.pixels.length !== img.width * img.height) throw new Error('pixel buffer size mismatch');
  for (const p of img.pixels)
    if (p >= palette.length) throw new Error(`pixel index ${p} outside palette`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed colour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], i) => plte.set([r, g, b], i * 3));
  // tRNS only needs entries up to the last non-opaque one.
  let lastAlpha = -1;
  palette.forEach(([, , , a], i) => {
    if (a !== 255) lastAlpha = i;
  });
  const trns = Buffer.from(palette.slice(0, lastAlpha + 1).map(([, , , a]) => a));
  const raw = Buffer.alloc((img.width + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width + 1)] = 0;
    raw.set(img.pixels.subarray(y * img.width, (y + 1) * img.width), y * (img.width + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    ...(trns.length > 0 ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
