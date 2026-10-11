import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  commitTurn,
  compositeScore,
  fiscalBalance,
  MANDATES,
  newGame,
  quote,
  RULES,
  scorecard,
  settleTurn,
  shockCard,
  shockEvents,
} from '@zoned-out/sim';
import type { Decision, GameState, MandateId, PolicyEvent, Quote, Scorecard } from '@zoned-out/sim';
import { SimClient } from './client.ts';
import { makeNews } from './news.ts';
import type { NewsItem } from './news.ts';
import { researcherView } from './observe.ts';
import type { Final, Snapshot, WorldLayout } from './protocol.ts';

export const TICKS_PER_TURN = RULES.ticksPerTurn;
export const TOTAL_TURNS = RULES.turns;
export const SCENARIO = 'victoria';

export interface LogEntry {
  turn: number;
  /** Tick at which the change takes effect. */
  tick: number;
  text: string;
  kind: 'decision' | 'shock';
}

export interface FinalResult {
  card: Scorecard;
  composite: number;
  runs: Final['runs'];
}

export interface UiState {
  phase: 'setup' | 'loading' | 'playing' | 'busy' | 'over' | 'error';
  seed: number;
  mandate: MandateId;
  game: GameState | null;
  layout: WorldLayout | null;
  snapshot: Snapshot | null;
  draft: Decision | null;
  log: LogEntry[];
  /** Every policy event the player committed (replayed in the debrief). */
  events: PolicyEvent[];
  /** Ticks at which the player changed a lever (chart markers). */
  changes: { tick: number; label: string }[];
  /** Asking-rent data bought so far covers ticks up to this one (-1 = none). */
  dataThroughTick: number;
  /** Shock card revealed at the start of the current turn, if any. */
  currentShock: number | null;
  final: FinalResult | null;
  /** One briefing per completed turn (flavour, news.ts). */
  news: NewsItem[];
  /** Change in budget and capital over the last completed turn (HUD floaters). */
  lastDelta: { turn: number; budget: number; capital: number } | null;
  error?: string;
}

const REGIME_NAMES = ['Open', 'Principal-residence rule', 'PR rule + registry'];
const CAP_NAMES = ['Low (1%)', 'Medium (3%)', 'High (6%)'];
const UPZONE_NAMES = ['none', 'moderate', 'aggressive'];

export function regimeName(v: number): string {
  return REGIME_NAMES[v] ?? '?';
}
export function capName(v: number): string {
  return CAP_NAMES[v] ?? '?';
}
export function upzoneName(v: number): string {
  return UPZONE_NAMES[v] ?? '?';
}

/** Mandate from ?mandate=id (shared links), else Balanced. */
export function initialMandate(): MandateId {
  const q = new URLSearchParams(window.location.search).get('mandate');
  return q !== null && q in MANDATES ? (q as MandateId) : 'balanced';
}

/** Seed from ?seed=N, else a fresh random one (randomness is fine in the UI, never in the sim). */
export function initialSeed(): number {
  const q = new URLSearchParams(window.location.search).get('seed');
  if (q !== null && /^\d+$/.test(q)) return Number(q) >>> 0;
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
}

function describe(e: PolicyEvent, layout: WorldLayout): string {
  switch (e.lever) {
    case 'strRegime':
      return `STR regime set to "${regimeName(e.value)}"`;
    case 'enforcement':
      return `Enforcement budget set to ${e.value}`;
    case 'vacancyTax':
      return `Vacancy tax set to ${e.value}%`;
    case 'rentCap':
      return `Rent-increase cap set to ${capName(e.value)}`;
    case 'upzone':
      return `${layout.zoneNames[e.zone ?? 0]}: ${upzoneName(e.value)} upzoning`;
    case 'nonMarket':
      return `Non-market homes: ${e.value} per quarter`;
    default:
      return `${e.lever} = ${e.value}`;
  }
}

/** Revenue (fines + vacancy tax) of the last `ticks` months, $M real. */
function revenueOf(s: Snapshot, ticks: number, scale: number): number {
  const n = s.series.fines.length;
  let r = 0;
  for (let i = Math.max(0, n - ticks); i < n; i++)
    r += s.series.fines[i]! + s.series.vacancyTaxRevenue[i]!;
  return r / scale / 1000;
}

export function useGame() {
  const client = useRef<SimClient | null>(null);
  const [state, setState] = useState<UiState>(() => ({
    phase: 'setup',
    seed: initialSeed(),
    mandate: initialMandate(),
    game: null,
    layout: null,
    snapshot: null,
    draft: null,
    log: [],
    events: [],
    changes: [],
    dataThroughTick: -1,
    currentShock: null,
    final: null,
    news: [],
    lastDelta: null,
  }));

  useEffect(() => () => client.current?.dispose(), []);

  const start = useCallback(async (seed: number, mandate: MandateId) => {
    client.current?.dispose();
    const c = new SimClient();
    client.current = c;
    setState((s) => ({
      ...s,
      phase: 'loading',
      seed,
      mandate,
      log: [],
      events: [],
      changes: [],
      dataThroughTick: -1,
      currentShock: null,
      final: null,
      news: [],
      lastDelta: null,
    }));
    try {
      // The zone count is needed for the game state; Victoria has 8 zones, but ask the sim.
      const probe = newGame(seed, mandate, 0);
      const { layout, snapshot } = await c.init(SCENARIO, seed, shockEvents(probe));
      const game = newGame(seed, mandate, layout.zoneNames.length);
      setState((s) => ({
        ...s,
        phase: 'playing',
        layout,
        snapshot,
        game,
        draft: { ...game.current, upzone: [...game.current.upzone] },
      }));
    } catch (e) {
      setState((s) => ({ ...s, phase: 'error', error: String(e) }));
    }
  }, []);

  const setDraft = useCallback((d: Partial<Decision>) => {
    setState((s) => (s.draft ? { ...s, draft: { ...s.draft, ...d } } : s));
  }, []);

  const endTurn = useCallback(async () => {
    const s = state;
    if (s.phase !== 'playing' || !s.game || !s.draft || !s.layout || !client.current) return;
    const q = quote(s.game, s.draft);
    if (q.errors.length > 0) return;
    const { game: committed, events } = commitTurn(s.game, s.draft);
    const layout = s.layout;
    const newLog: LogEntry[] = events.map((e) => ({
      turn: s.game!.turn + 1,
      tick: e.tick,
      text: describe(e, layout),
      kind: 'decision',
    }));
    if (s.draft.buyData !== s.game.current.buyData)
      newLog.push({
        turn: s.game.turn + 1,
        tick: s.game.turn * TICKS_PER_TURN,
        text: s.draft.buyData
          ? 'Started buying asking-rent data'
          : 'Stopped buying asking-rent data',
        kind: 'decision',
      });
    const buyData = s.draft.buyData;
    setState((p) => ({ ...p, phase: 'busy' }));
    try {
      const snapshot = await client.current.advance(events, TICKS_PER_TURN);
      const game = settleTurn(committed, revenueOf(snapshot, TICKS_PER_TURN, layout.scale));
      // A purchase reveals asking rents with a one-quarter lag.
      const lastTick = snapshot.tick - 1;
      const shock = game.shocks.find((x) => x.turn === game.turn)?.code ?? null;
      const shockLog: LogEntry[] =
        shock === null
          ? []
          : [
              {
                turn: game.turn + 1,
                tick: game.turn * TICKS_PER_TURN,
                text: `Shock: ${shockCard(shock).name}`,
                kind: 'shock',
              },
            ];
      let final: FinalResult | null = null;
      if (game.turn >= TOTAL_TURNS) {
        const f = await client.current.finish();
        const card = scorecard({
          policy: f.policy,
          base: f.base,
          fiscalBalance: fiscalBalance(game),
          capital: game.capital,
        });
        final = { card, composite: compositeScore(card, game.mandate), runs: f.runs };
      }
      const dataThroughTick = buyData
        ? Math.max(s.dataThroughTick, lastTick - TICKS_PER_TURN)
        : s.dataThroughTick;
      const news = makeNews({
        turn: game.turn,
        events,
        before: s.game.current,
        zoneNames: layout.zoneNames,
        view: researcherView(snapshot, layout, s.seed, dataThroughTick),
      });
      const lastDelta = {
        turn: game.turn,
        budget: game.budget - s.game.budget,
        capital: game.capital - s.game.capital,
      };
      setState((p) => ({
        ...p,
        snapshot,
        game,
        news: [...p.news, news],
        lastDelta,
        phase: final ? 'over' : 'playing',
        draft: { ...game.current, upzone: [...game.current.upzone], buyData },
        dataThroughTick,
        currentShock: shock,
        log: [...p.log, ...newLog, ...shockLog],
        events: [...p.events, ...events],
        changes: [
          ...p.changes,
          ...events.map((e) => ({ tick: e.tick, label: describe(e, layout) })),
        ],
        final,
      }));
    } catch (e) {
      setState((p) => ({ ...p, phase: 'error', error: String(e) }));
    }
  }, [state]);

  const currentQuote: Quote | null =
    state.game && state.draft ? quote(state.game, state.draft) : null;

  return {
    state,
    quote: currentQuote,
    start,
    setDraft,
    endTurn,
    mandates: MANDATES,
    setup: () => setState((s) => ({ ...s, phase: 'setup', seed: s.seed + 1 })),
    setMandate: (mandate: MandateId) => setState((s) => ({ ...s, mandate })),
  };
}
