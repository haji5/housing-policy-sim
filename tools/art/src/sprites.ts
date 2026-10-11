/** Every sprite in the atlas, by category. */
import type { AtlasEntry } from './atlas.ts';
import { buildings, construction } from './buildings.ts';
import { glyphs } from './font.ts';
import { groundTiles } from './ground.ts';
import { EFFECTS, ICONS, MARKERS, SIGNS, TREES } from './icons.ts';
import { uiSprites } from './ui.ts';

export function allSprites(): AtlasEntry[] {
  const out: AtlasEntry[] = [];
  for (const g of groundTiles()) out.push({ name: g.name, sprite: g.sprite });
  for (const b of buildings()) out.push({ name: b.name, sprite: b.sprite, meta: { roof: b.roof } });
  for (const size of ['small', 'large'] as const)
    for (let f = 0; f < 3; f++) {
      const b = construction(size, f);
      out.push({ name: b.name, sprite: b.sprite, meta: { roof: b.roof } });
    }
  for (const group of [MARKERS, SIGNS, EFFECTS, ICONS, TREES, glyphs(), uiSprites()])
    for (const [name, sprite] of Object.entries(group)) out.push({ name, sprite });
  return out;
}
