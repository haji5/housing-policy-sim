/**
 * Counter-based hashed RNG (PLAN §5.1).
 *
 * Every random number is a pure function of (seed, agentId, tick, purpose, sub). There is no
 * stateful stream, so changing a policy lever never shifts the draws of unrelated agents. This
 * gives common random numbers across counterfactual runs that share a seed.
 */

/** 32-bit avalanche finaliser (lowbias32 by C. Wellons, public domain). */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad);
  h ^= h >>> 15;
  h = Math.imul(h, 0x735a2d97);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Hash of up to five integer keys to an unsigned 32-bit integer. */
export function hash32(
  seed: number,
  agent: number,
  tick: number,
  purpose: number,
  sub = 0,
): number {
  let h = mix((seed ^ 0x9e3779b9) >>> 0);
  h = mix((h ^ Math.imul(agent | 0, 0x85ebca6b)) + 0x27d4eb2f);
  h = mix((h ^ Math.imul(tick | 0, 0xc2b2ae35)) + 0x165667b1);
  h = mix((h ^ Math.imul(purpose | 0, 0x27d4eb2d)) + 0x61c88647);
  h = mix((h ^ Math.imul(sub | 0, 0x9e3779b1)) + 0x7f4a7c15);
  return h;
}

/** Uniform draw strictly inside (0, 1). */
export function uniform(
  seed: number,
  agent: number,
  tick: number,
  purpose: number,
  sub = 0,
): number {
  return (hash32(seed, agent, tick, purpose, sub) + 0.5) / 4294967296;
}

/** Standard normal via Box–Muller on two keyed uniforms (sub and sub + 1 are both consumed). */
export function normal(
  seed: number,
  agent: number,
  tick: number,
  purpose: number,
  sub = 0,
): number {
  const u1 = uniform(seed, agent, tick, purpose, sub * 2);
  const u2 = uniform(seed, agent, tick, purpose, sub * 2 + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Standard Gumbel draw; argmax(U_k + scale * gumbel_k) gives exact multinomial-logit choices. */
export function gumbel(
  seed: number,
  agent: number,
  tick: number,
  purpose: number,
  sub = 0,
): number {
  return -Math.log(-Math.log(uniform(seed, agent, tick, purpose, sub)));
}

/**
 * Poisson draw. Inversion with keyed uniforms for small lambda; normal approximation with
 * continuity correction above 60 (error is negligible for household-arrival counts).
 */
export function poisson(
  lambda: number,
  seed: number,
  agent: number,
  tick: number,
  purpose: number,
): number {
  if (lambda <= 0) return 0;
  if (lambda > 60) {
    const z = normal(seed, agent, tick, purpose);
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
  }
  const u = uniform(seed, agent, tick, purpose);
  let k = 0;
  let p = Math.exp(-lambda);
  let cdf = p;
  while (u > cdf && k < 1000) {
    k++;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}

/**
 * Purpose codes. Each random decision in the model has its own code so that draws for different
 * purposes never collide. Append new codes; never renumber (that would change every run).
 */
export const Purpose = {
  HOST_REVIEW: 1,
  HOST_CHOICE: 2, // sub = alternative index
  HOST_COMPLIANT: 3, // fixed per dwelling (tick 0)
  DETECT: 4,
  DELIST: 5,
  TENANT_MOVE: 6,
  TENANT_EXIT: 7,
  ARRIVALS: 8,
  HH_INCOME: 9,
  HH_PREF_ZONE: 10,
  SEARCH_ZONE: 11,
  MATCH_ORDER: 12,
  MATCH_UNIT: 13,
  MATCH_ROUND: 14,
  INIT_QUALITY: 15,
  INIT_RENT: 16,
  INIT_LEASE: 17,
  PR_REVIEW: 18,
  PR_CHOICE: 19,
  INIT_CLASS: 20, // sub 0: multi vs single, sub 1: commercial vs small multi
  INIT_EXEMPT_CLAIM: 21,
  REG_TAKEUP: 22,
  INVESTOR_ENTRY: 23,
  ANTICIPATE: 24,
  // Observation layer (researcher view, ADR 0006): never used by the model itself.
  OBS_COMPLETE: 25,
  OBS_ZONE: 26,
  OBS_TRUNCATED: 27,
  OBS_CPI: 28,
  // Full mechanics (M5, ADRs 0007-0009).
  DEV_START: 29, // sub = zone
  DEV_LAG: 30,
  DEV_TENURE: 31,
  BUY: 32,
  INIT_PIPELINE: 33, // sub 0: lag, 1: age, 2: tenure
  NONMARKET_START: 34,
  NONMARKET_ZONE: 35,
  SHOCK_DRAW: 36, // agent 0, tick = turn; sub 0: whether, sub 1: which card
  RENTER_BUYER: 37, // per sold dwelling; sub 0: whether a renter buys, sub 1..: buyer draws
} as const;
