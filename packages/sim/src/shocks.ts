/**
 * Shock cards (ODD §7.10, ADR 0009). The sim only applies them: a 'shock' policy event with a
 * card code switches the card's effects on for its duration. Which cards a game draws, and when,
 * is decided by the game rules (game.ts) from the seed, so draws are reproducible.
 */
import deck from './params/shocks.json' with { type: 'json' };
import type { ShockEffects } from './types.ts';

export interface ShockCard {
  code: number;
  id: string;
  name: string;
  text: string;
  durationTicks: number;
  effects: Partial<ShockEffects>;
}

export const SHOCK_CARDS: readonly ShockCard[] = (deck as { cards: ShockCard[] }).cards;

export const NO_SHOCK: Readonly<ShockEffects> = {
  rateShift: 0,
  arrivalsMult: 1,
  incomeMult: 1,
  detectMult: 1,
  strDemandMult: 1,
};

export function shockCard(code: number): ShockCard {
  const c = SHOCK_CARDS.find((x) => x.code === code);
  if (!c) throw new Error(`Unknown shock card ${code}`);
  return c;
}

/** Combined effects of the cards in force: shifts add, multipliers compound. */
export function combineShocks(codes: readonly number[]): ShockEffects {
  const out: ShockEffects = { ...NO_SHOCK };
  for (const code of codes) {
    const e = shockCard(code).effects;
    out.rateShift += e.rateShift ?? 0;
    out.arrivalsMult *= e.arrivalsMult ?? 1;
    out.incomeMult *= e.incomeMult ?? 1;
    out.detectMult *= e.detectMult ?? 1;
    out.strDemandMult *= e.strDemandMult ?? 1;
  }
  return out;
}
