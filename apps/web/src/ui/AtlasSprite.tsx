import { useEffect, useRef, useState } from 'preact/hooks';
import type { Atlas } from '../render/iso/atlas.ts';
import { loadAtlas } from '../render/iso/atlas.ts';

/** One atlas frame drawn at an integer scale (decorative: the surrounding text carries meaning). */
export function AtlasSprite({ name, scale = 2 }: { name: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  useEffect(() => {
    loadAtlas().then(setAtlas, () => setAtlas(null));
  }, []);
  useEffect(() => {
    const c = ref.current;
    const f = atlas?.frames[name];
    if (!c || !atlas || !f) return;
    c.width = f.w * scale;
    c.height = f.h * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, 0, 0, f.w * scale, f.h * scale);
  }, [atlas, name, scale]);
  return <canvas ref={ref} class="atlas-sprite" aria-hidden="true" />;
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
