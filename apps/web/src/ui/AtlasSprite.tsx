import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Atlas } from '../render/iso/atlas.ts';
import { loadAtlas, peekAtlas } from '../render/iso/atlas.ts';

/**
 * One atlas frame drawn at an integer scale (decorative: the surrounding text carries meaning).
 * The canvas is sized in markup from the frame (0 x 0 until the atlas has loaded), never the
 * browser default of 300 x 150, and drawn before paint, so a new sprite does not shift the layout.
 */
export function AtlasSprite({ name, scale = 2 }: { name: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(peekAtlas);
  useEffect(() => {
    if (!atlas) loadAtlas().then(setAtlas, () => setAtlas(null));
  }, []);
  const f = atlas?.frames[name];
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !atlas || !f) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, 0, 0, f.w * scale, f.h * scale);
  }, [atlas, f, scale]);
  return (
    <canvas
      ref={ref}
      class="atlas-sprite"
      width={f ? f.w * scale : 0}
      height={f ? f.h * scale : 0}
      aria-hidden="true"
    />
  );
}

/** Atlas icon for a shock card id (shocks.json). */
export const SHOCK_ICON: Record<string, string> = {
  rateHike: 'shock_rate',
  migrationSurge: 'shock_migration',
  recession: 'shock_recession',
  courtChallenge: 'shock_court',
  tourismBoom: 'shock_tourism',
  wildfire: 'shock_wildfire',
};
