/**
 * The art palette (PLAN §9.1): 31 named colours plus transparency, defined once. Meaningful
 * overlay colours use the Okabe-Ito colour-blind-safe set (STR orange #e69f00, principal-residence
 * STR yellow #f0e442, long-term rental blue #0072b2, construction purple #cc79a7), and every
 * building state also differs in shape and luminance, so nothing relies on hue alone.
 */
export const PALETTE = [
  ['clear', '#00000000'],
  ['ink', '#1b1b2a'],
  ['shadow', '#30364a'],
  ['grass1', '#6fae5a'],
  ['grass2', '#5d9a4c'],
  ['grass3', '#88c26b'],
  ['forest', '#3b733d'],
  ['water1', '#3d7fb8'],
  ['water2', '#5a9bd0'],
  ['foam', '#a9d6f0'],
  ['sand', '#e2cf9a'],
  ['road', '#6b6b73'],
  ['roadLine', '#ece6c8'],
  ['sidewalk', '#b9b5aa'],
  ['wallLight', '#f2e9d6'],
  ['wallShade', '#cdbf9f'],
  ['brickLight', '#c4704f'],
  ['brickShade', '#93503a'],
  ['concLight', '#cfd2d7'],
  ['concShade', '#9ba1aa'],
  ['glassLight', '#a3d5ea'],
  ['glassShade', '#6aa2c0'],
  ['roofRed', '#b5473a'],
  ['roofRedDark', '#82322a'],
  ['roofSlate', '#5d6678'],
  ['roofSlateDark', '#424958'],
  ['windowLit', '#ffd96b'],
  ['strOrange', '#e69f00'],
  ['strYellow', '#f0e442'],
  ['ltrBlue', '#0072b2'],
  ['white', '#ffffff'],
  ['purple', '#cc79a7'],
] as const;

export type ColorName = (typeof PALETTE)[number][0];

/** Palette index by name. */
export const C = Object.fromEntries(PALETTE.map(([n], i) => [n, i])) as Record<ColorName, number>;

/** RGBA tuples for the PNG encoder. */
export function rgba(): [number, number, number, number][] {
  return PALETTE.map(([, hex]) => {
    const v = hex.slice(1);
    const a = v.length === 8 ? parseInt(v.slice(6, 8), 16) : 255;
    return [
      parseInt(v.slice(0, 2), 16),
      parseInt(v.slice(2, 4), 16),
      parseInt(v.slice(4, 6), 16),
      a,
    ];
  });
}
