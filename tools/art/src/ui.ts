/**
 * UI kit pieces (ADR 0010): a 9-slice panel frame and button states (used through CSS
 * border-image, slice 4 px), a tab, and slider parts. Generated, so they share the palette.
 */
import { Sprite } from './draw.ts';
import { C } from './palette.ts';

/** 12x12 bevelled frame: 1 px ink border, light top-left bevel, dark bottom-right bevel. */
function frame(face: number, hi: number, lo: number, pressed = false): Sprite {
  const s = new Sprite(12, 12);
  s.rect(0, 0, 12, 12, C.ink);
  s.rect(1, 1, 10, 10, face);
  const [a, b] = pressed ? [lo, hi] : [hi, lo];
  for (let i = 1; i < 11; i++) {
    s.set(i, 1, a);
    s.set(1, i, a);
    s.set(i, 10, b);
    s.set(10, i, b);
  }
  // Rounded corners: clear the outer corner pixels.
  for (const [x, y] of [
    [0, 0],
    [11, 0],
    [0, 11],
    [11, 11],
  ] as const)
    s.set(x, y, 0);
  return s;
}

export function uiSprites(): Record<string, Sprite> {
  const tab = new Sprite(12, 12);
  tab.rect(0, 0, 12, 12, C.ink);
  tab.rect(1, 1, 10, 11, C.wallLight);
  for (let i = 1; i < 11; i++) tab.set(i, 1, C.white);
  tab.set(0, 0, 0);
  tab.set(11, 0, 0);
  const track = new Sprite(12, 6);
  track.rect(0, 1, 12, 4, C.ink);
  track.rect(1, 2, 10, 2, C.concShade);
  const thumb = new Sprite(8, 12);
  thumb.rect(0, 0, 8, 12, C.ink);
  thumb.rect(1, 1, 6, 10, C.ltrBlue);
  thumb.rect(1, 1, 6, 1, C.glassLight);
  thumb.rect(3, 4, 2, 4, C.white);
  return {
    ui_panel: frame(C.white, C.white, C.wallShade),
    ui_button: frame(C.wallLight, C.white, C.concShade),
    ui_button_hover: frame(C.white, C.white, C.wallShade),
    ui_button_pressed: frame(C.wallShade, C.white, C.concShade, true),
    ui_button_disabled: frame(C.concLight, C.concLight, C.concShade),
    ui_button_primary: frame(C.ltrBlue, C.glassShade, C.ink),
    // Game chrome: the dark HUD bar, cream lever cards and the green "end turn" button.
    ui_panel_dark: frame(C.shadow, C.roofSlate, C.ink),
    ui_card: frame(C.wallLight, C.white, C.wallShade),
    ui_button_go: frame(C.forest, C.grass2, C.ink),
    ui_button_go_pressed: frame(C.forest, C.grass2, C.ink, true),
    ui_tab: tab,
    ui_slider_track: track,
    ui_slider_thumb: thumb,
  };
}
