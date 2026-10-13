/**
 * Building sprites (ADR 0010). Each building type is drawn procedurally from iso boxes, roofs and
 * windows, in two window states: occupied (glass windows) and vacant (dark windows). Anchors are
 * the centre of the ground footprint; `roof` is where rooftop markers sit.
 */
import { box, diamond, diamondColumns, hash, hipRoof, Sprite, windows } from './draw.ts';
import { C } from './palette.ts';

export interface BuildingSprite {
  name: string;
  sprite: Sprite;
  /** Rooftop marker position (sprite pixels). */
  roof: [number, number];
}

type WindowState = 'lit' | 'dark';

interface Walls {
  light: number;
  shade: number;
}

const PLASTER: Walls = { light: C.wallLight, shade: C.wallShade };
const BRICK: Walls = { light: C.brickLight, shade: C.brickShade };
const CONCRETE: Walls = { light: C.concLight, shade: C.concShade };
const GLASS: Walls = { light: C.glassLight, shade: C.glassShade };

/** Window colour: occupied buildings show glass (a few warm lights), vacant ones are dark. */
function pane(state: WindowState, seed: number, face: number, col: number, row: number): number {
  if (state === 'dark') return C.shadow;
  const h = hash(seed, face, col, row) % 10;
  return h < 2 ? C.windowLit : face === 0 ? C.glassShade : C.glassLight;
}

/** Sprite tall enough for a box of `halfW`, wall `height` and `rise` rows above the roof diamond. */
function canvas(halfW: number, height: number, rise: number): { s: Sprite; top: number } {
  const s = new Sprite(32, rise + halfW + height + 1);
  const top = rise;
  s.ax = 16;
  s.ay = top + height + halfW / 2 - 1;
  return { s, top };
}

/** Door on the left wall near the front corner. */
function door(s: Sprite, cx: number, groundY: number, offset: number, c = C.roofSlateDark): void {
  // groundY = row just below the wall at the front corner; walls slope up-left 1 px per 2 px.
  for (let k = 0; k < 2; k++) {
    const x = cx - 1 - offset - k;
    const yb = groundY - Math.floor((offset + k) / 2) - 1;
    for (let j = 0; j < 4; j++) s.set(x, yb - j, c);
  }
}

function house(variant: number, state: WindowState): BuildingSprite {
  const halfW = 10;
  const height = 7;
  const rise = 6;
  const { s, top } = canvas(halfW, height, rise);
  const walls = variant % 2 === 0 ? PLASTER : BRICK;
  box(s, 16, top, halfW, height, { top: walls.light, left: walls.shade, right: walls.light });
  windows(s, 16, top, halfW, height, {
    pitchX: 4,
    pitchY: 6,
    wh: 3,
    marginTop: 2,
    marginBottom: 1,
    pick: (f, c, r) => (f === 0 && c === 0 ? 0 : pane(state, variant * 7 + 1, f, c, r)),
  });
  door(s, 16, top + halfW + height, 2);
  const [light, dark] = variant < 2 ? [C.roofRed, C.roofRedDark] : [C.roofSlate, C.roofSlateDark];
  const layers = hipRoof(s, 16, top - 1, halfW + 2, light, dark);
  if (variant === 3) {
    // Chimney.
    s.rect(19, top - layers + 1, 2, 4, C.brickShade);
    s.set(19, top - layers + 1, C.brickLight);
  }
  return { name: `house${variant + 1}`, sprite: s, roof: [16, top - layers + 2] };
}

function duplex(state: WindowState): BuildingSprite {
  const halfW = 12;
  const height = 8;
  const rise = 8;
  const { s, top } = canvas(halfW, height, rise);
  box(s, 16, top, halfW, height, { top: C.wallLight, left: C.wallShade, right: C.wallLight });
  windows(s, 16, top, halfW, height, {
    pitchX: 4,
    pitchY: 6,
    wh: 3,
    marginTop: 2,
    marginBottom: 1,
    pick: (f, c, r) => (f === 0 && (c === 0 || c === 2) ? 0 : pane(state, 21, f, c, r)),
  });
  door(s, 16, top + halfW + height, 2);
  door(s, 16, top + halfW + height, 10);
  const layers = hipRoof(s, 16, top - 1, halfW + 2, C.roofSlate, C.roofSlateDark);
  // Party wall line on the roof.
  return { name: 'duplex', sprite: s, roof: [16, top - layers + 3] };
}

/** Flat roof with a rim, plus rooftop details. */
function flatRoof(s: Sprite, cx: number, top: number, halfW: number, seed: number): void {
  diamond(s, cx, top, halfW, C.concShade);
  diamond(s, cx, top + 1, halfW - 2, C.concLight);
  // HVAC box.
  const ox = (hash(seed, 9) % 5) - 2;
  s.rect(cx + ox - 1, top + halfW / 2 - 2, 3, 2, C.concShade);
  s.set(cx + ox - 1, top + halfW / 2 - 3, C.concLight);
}

function apartment(
  name: string,
  halfW: number,
  height: number,
  walls: Walls,
  state: WindowState,
  seed: number,
  pitchY = 6,
): BuildingSprite {
  const { s, top } = canvas(halfW, height, 2);
  box(s, 16, top, halfW, height, { top: walls.light, left: walls.shade, right: walls.light });
  windows(s, 16, top, halfW, height, {
    pitchX: 4,
    pitchY,
    wh: 3,
    marginTop: 3,
    marginBottom: 3,
    pick: (f, c, r) => pane(state, seed, f, c, r),
  });
  door(s, 16, top + halfW + height, 2, C.glassShade);
  flatRoof(s, 16, top, halfW, seed);
  return { name, sprite: s, roof: [16, top + halfW / 2] };
}

function tower(state: WindowState): BuildingSprite {
  const halfW = 12;
  const height = 56;
  const { s, top } = canvas(halfW, height, 6);
  box(s, 16, top, halfW, height, { top: C.concLight, left: GLASS.shade, right: GLASS.light });
  // Mullions: vertical concrete lines every 4 columns, and floor bands.
  diamondColumns(16, top, halfW, (x, _y0, y1, left) => {
    const d = left ? 15 - x : x - 16;
    for (let y = y1 + 1; y <= y1 + height; y++) {
      const band = (y - y1) % 5 === 0;
      if (d % 4 === 0 || band) s.set(x, y, left ? C.concShade : C.concLight);
      else if (state === 'dark') s.set(x, y, C.shadow);
      else if (hash(77, x, Math.floor((y - y1) / 5)) % 12 === 0) s.set(x, y, C.windowLit);
    }
  });
  flatRoof(s, 16, top, halfW, 5);
  // Antenna.
  s.rect(16, top - 5, 1, 6, C.ink);
  s.set(16, top - 6, C.roofRed);
  return { name: 'tower', sprite: s, roof: [16, top + halfW / 2] };
}

function hotel(state: WindowState): BuildingSprite {
  const b = apartment('hotel', 14, 40, CONCRETE, state, 31, 5);
  const s = b.sprite;
  // Rooftop sign: a red board with white bars (reads "HOTEL" at a glance, no text needed).
  const y = b.roof[1] - 9;
  s.rect(10, y, 13, 5, C.roofRedDark);
  s.rect(11, y + 1, 11, 3, C.roofRed);
  for (let x = 12; x < 21; x += 2) s.set(x, y + 2, C.white);
  s.rect(12, y + 5, 1, 3, C.ink);
  s.rect(20, y + 5, 1, 3, C.ink);
  // Rooftop markers sit beside the sign, on the right half of the roof.
  return { ...b, roof: [22, b.roof[1] + 3] };
}

function commercial(state: WindowState): BuildingSprite {
  const halfW = 16;
  const height = 12;
  const { s, top } = canvas(halfW, height, 2);
  box(s, 16, top, halfW, height, { top: C.concLight, left: C.brickShade, right: C.brickLight });
  // Shopfront glass along the ground floor and a striped awning above it.
  diamondColumns(16, top, halfW, (x, _y0, y1, left) => {
    const d = left ? 15 - x : x - 16;
    if (d < 1 || d > halfW - 2) return;
    const awning = (Math.floor(d / 2) % 2 === 0 ? C.white : C.ltrBlue) as number;
    s.set(x, y1 + 5, awning);
    s.set(x, y1 + 6, awning);
    for (let y = y1 + 7; y <= y1 + height - 1; y++)
      s.set(x, y, state === 'dark' ? C.shadow : left ? C.glassShade : C.glassLight);
  });
  flatRoof(s, 16, top, halfW, 41);
  return { name: 'commercial', sprite: s, roof: [16, top + halfW / 2] };
}

function townhouses(state: WindowState): BuildingSprite {
  const halfW = 14;
  const height = 11;
  const rise = 4;
  const { s, top } = canvas(halfW, height, rise);
  box(s, 16, top, halfW, height, { top: C.roofSlate, left: C.brickShade, right: C.brickLight });
  windows(s, 16, top, halfW, height, {
    pitchX: 4,
    pitchY: 5,
    wh: 3,
    marginTop: 1,
    marginBottom: 1,
    pick: (f, c, r) => (f === 0 && r === 1 && c % 2 === 0 ? 0 : pane(state, 51, f, c, r)),
  });
  for (const off of [2, 10, 18, 26])
    if (off < halfW * 2 - 4) door(s, 16, top + halfW + height, off % (halfW - 1), C.roofSlateDark);
  // Stepped roofline: three slate roof segments with dark ridges.
  diamond(s, 16, top, halfW, C.roofSlate);
  diamondColumns(16, top, halfW, (x, y0, y1, left) => {
    if (left && (15 - x) % 5 === 4) for (let y = y0; y <= y1; y++) s.set(x, y, C.roofSlateDark);
  });
  return { name: 'townhouses', sprite: s, roof: [16, top + halfW / 2] };
}

export function buildings(): BuildingSprite[] {
  const out: BuildingSprite[] = [];
  for (const state of ['lit', 'dark'] as const) {
    const sfx = state === 'lit' ? '' : '_dark';
    const add = (b: BuildingSprite) => out.push({ ...b, name: b.name + sfx });
    for (let v = 0; v < 4; v++) add(house(v, state));
    add(duplex(state));
    add(townhouses(state));
    add(apartment('lowrise1', 14, 12, BRICK, state, 61));
    add(apartment('lowrise2', 14, 18, PLASTER, state, 62));
    add(apartment('lowrise3', 14, 24, CONCRETE, state, 63));
    add(apartment('midrise', 14, 36, CONCRETE, state, 71, 5));
    add(tower(state));
    add(hotel(state));
    add(commercial(state));
  }
  return out;
}

/** Scaffolding over a box of the given size, with purple safety netting, 3 crane frames. */
export function construction(size: 'small' | 'large', frame: number): BuildingSprite {
  const halfW = size === 'small' ? 10 : 14;
  const height = size === 'small' ? 10 : 22;
  const rise = size === 'small' ? 4 : 18;
  const { s, top } = canvas(halfW, height, rise);
  // Concrete core (unfinished), then a lattice of scaffold poles and netting.
  box(s, 16, top + 4, halfW, height - 4, {
    top: C.concShade,
    left: C.concShade,
    right: C.concLight,
  });
  diamondColumns(16, top, halfW, (x, _y0, y1, left) => {
    const d = left ? 15 - x : x - 16;
    for (let y = y1 + 1; y <= y1 + height; y++) {
      const oy = y - y1;
      if (d % 4 === 0 || oy % 4 === 0) s.set(x, y, C.ink);
      else if ((d + oy) % 2 === 0 && oy < height - 1) s.set(x, y, C.purple);
    }
  });
  if (size === 'large') {
    // Tower crane: mast at the back corner, jib swinging over three frames.
    const mx = 16;
    const my = top - rise + 2;
    for (let y = my; y < top + halfW / 2; y++) s.set(mx, y, C.ink);
    const jib = [
      [-12, 0],
      [-8, 2],
      [-4, 3],
    ][frame]!;
    const dir = frame === 1 ? 1 : -1;
    for (let k = 0; k <= 13; k++) s.set(mx + dir * k, my + Math.round((jib[1]! * k) / 13), C.ink);
    for (let k = 1; k <= 4; k++) s.set(mx - dir * k, my, C.ink);
    s.rect(mx - dir * 5 - (dir < 0 ? 0 : 1), my, 2, 2, C.concShade);
    // Hook line and load.
    const hx = mx + dir * (6 + frame * 3);
    const hy = my + Math.round((jib[1]! * (6 + frame * 3)) / 13);
    for (let y = hy + 1; y < hy + 5 + frame; y++) s.set(hx, y, C.ink);
    s.rect(hx - 1, hy + 5 + frame, 3, 2, C.purple);
  } else {
    // Small rig: a hoist that bobs.
    s.rect(16, top - 3 + (frame % 2), 1, 4, C.ink);
    s.rect(15, top - 4 + (frame % 2), 3, 1, C.ink);
  }
  return { name: `construction_${size}${frame}`, sprite: s, roof: [16, top + halfW / 2] };
}
