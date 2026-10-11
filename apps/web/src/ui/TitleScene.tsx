import { useEffect, useRef, useState } from 'preact/hooks';
import type { Atlas } from '../render/iso/atlas.ts';
import { drawFrame, loadAtlas } from '../render/iso/atlas.ts';

/**
 * The title screen's diorama: a fixed little harbour town drawn from the atlas (decorative, so
 * aria-hidden). The water animates slowly unless the player prefers reduced motion; STR pins
 * blink on and off to hint at the game. Not a view of the model.
 */
const GROUND = [
  ['forest', 'grass1', 'road_NS', 'grass2', 'grass1', 'grass3', 'shore_W', 'water0'],
  ['grass2', 'park', 'road_NS', 'sidewalk', 'grass1', 'grass1', 'shore_W', 'water1'],
  ['road_EW', 'road_EW', 'road_X', 'road_EW', 'road_EW', 'road_EW', 'shore_W', 'water2'],
  ['grass1', 'grass2', 'road_NS', 'grass1', 'grass2', 'grass1', 'shore_W', 'water3'],
  ['farmland', 'grass1', 'road_NS', 'grass2', 'grass1', 'park', 'shore_W', 'water0'],
  ['farmland', 'rock', 'road_NS', 'grass1', 'grass3', 'grass1', 'shore_W', 'water1'],
  ['forest', 'grass1', 'road_NS', 'grass2', 'grass1', 'grass2', 'shore_W', 'water2'],
  ['forest', 'forest', 'road_NS', 'grass1', 'grass1', 'grass3', 'shore_W', 'water3'],
];
const OBJECTS: (string | null)[][] = [
  ['tree_conifer', 'house1', null, 'tower', 'midrise', 'hotel', null, null],
  ['house2', 'tree_round', null, null, 'lowrise3', 'tower', null, null],
  [null, null, null, null, null, null, null, null],
  ['house3', 'house4', null, 'lowrise1', 'commercial', 'lowrise2', null, null],
  [null, 'duplex', null, 'townhouses', 'construction_large1', 'tree_round', null, null],
  [null, null, null, 'house1_dark', 'house2', 'construction_small0', null, null],
  ['tree_conifer', 'house4', null, 'house3', 'tree_round', 'house1', null, null],
  ['tree_conifer', 'tree_conifer', null, 'tree_round', 'house2', 'tree_round', null, null],
];
/** Rooftop markers: [row, col, marker]. */
const PINS: [number, number, string][] = [
  [0, 1, 'marker_str'],
  [3, 0, 'marker_str_pr'],
  [5, 3, 'marker_held'],
  [6, 5, 'marker_str'],
];
const ROWS = GROUND.length;
const COLS = GROUND[0]!.length;
const W = (ROWS + COLS) * 16 + 8;
const H = (ROWS + COLS) * 8 + 72;
const OX = ROWS * 16 + 4;
const OY = 64;

function paint(ctx: CanvasRenderingContext2D, atlas: Atlas, frame: number) {
  ctx.clearRect(0, 0, W, H);
  const centre = (r: number, c: number) => [OX + (c - r) * 16, OY + (c + r) * 8] as const;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      let name = GROUND[r]![c]!;
      if (name.startsWith('water')) name = `water${(Number(name.slice(5)) + frame) % 4}`;
      const [x, y] = centre(r, c);
      drawFrame(ctx, atlas, name, x, y);
    }
  for (let d = 0; d < ROWS + COLS - 1; d++)
    for (let r = 0; r < ROWS; r++) {
      const c = d - r;
      if (c < 0 || c >= COLS) continue;
      const name = OBJECTS[r]![c];
      if (!name) continue;
      const [x, y] = centre(r, c);
      const f = drawFrame(ctx, atlas, name, x, y);
      const pin = PINS.find((p) => p[0] === r && p[1] === c);
      // STR pins blink (every other frame); the padlock stays.
      if (f && pin && (pin[2] === 'marker_held' || frame % 2 === 0)) {
        const roof = f.roof ?? [f.ax, 0];
        drawFrame(ctx, atlas, pin[2], x - f.ax + roof[0], y - f.ay + roof[1]);
      }
    }
}

export function TitleScene({ scale = 2 }: { scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  useEffect(() => {
    loadAtlas().then(setAtlas, () => setAtlas(null));
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !atlas) return;
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    let frame = 0;
    paint(ctx, atlas, frame);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => paint(ctx, atlas, ++frame), 700);
    return () => window.clearInterval(id);
  }, [atlas]);
  return (
    <canvas ref={ref} class="title-scene" aria-hidden="true" style={{ width: `${W * scale}px` }} />
  );
}
