import { useEffect, useRef, useState } from 'preact/hooks';
import type { Atlas } from '../render/iso/atlas.ts';
import { loadAtlas, textWidth } from '../render/iso/atlas.ts';

/**
 * The title in the project's own pixel font (tools/art). The heading text stays in the DOM for
 * screen readers and as the fallback while the atlas loads.
 */
export function Logo({ scale = 3, text = 'Zoned Out' }: { scale?: number; text?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  useEffect(() => {
    loadAtlas().then(setAtlas, () => setAtlas(null));
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !atlas) return;
    c.width = textWidth(text) * scale;
    c.height = 7 * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    // Solid dark glyphs (no outline): crisper at small scales than the map-label style.
    const up = text.toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const f = atlas.frames[`font_${up.charCodeAt(i)}`];
      if (f)
        ctx.drawImage(
          atlas.inkFont,
          f.x,
          f.y,
          f.w,
          f.h,
          i * 6 * scale,
          0,
          f.w * scale,
          f.h * scale,
        );
    }
  }, [atlas, scale, text]);
  return (
    <span class="logo-wrap">
      {atlas ? <canvas ref={ref} class="logo" aria-hidden="true" /> : null}
      <span class={atlas ? 'sr-only' : ''}>{text}</span>
    </span>
  );
}
