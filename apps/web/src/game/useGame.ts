import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { LeverState, PolicyEvent } from '@zoned-out/sim';
import { SimClient } from './client.ts';
import type { Snapshot, WorldLayout } from './protocol.ts';

export const TICKS_PER_TURN = 3;
export const TOTAL_TURNS = 20;
export const SCENARIO = 'victoria';

export type Draft = Pick<LeverState, 'strRegime' | 'enforcement'>;

export interface LogEntry {
  turn: number;
  /** Tick at which the change takes effect. */
  tick: number;
  text: string;
}

export interface GameState {
  phase: 'loading' | 'playing' | 'busy' | 'over' | 'error';
  seed: number;
  turn: number;
  layout: WorldLayout | null;
  snapshot: Snapshot | null;
  draft: Draft;
  log: LogEntry[];
  /** Ticks at which the player changed a lever (chart markers). */
  changes: { tick: number; label: string }[];
  error?: string;
}

const REGIME_NAMES = ['Open', 'Principal-residence rule', 'PR rule + registry'];

export function regimeName(v: number): string {
  return REGIME_NAMES[v] ?? '?';
}

/** Seed from ?seed=N, else a fresh random one (randomness is fine in the UI, never in the sim). */
export function initialSeed(): number {
  const q = new URLSearchParams(window.location.search).get('seed');
  if (q !== null && /^\d+$/.test(q)) return Number(q) >>> 0;
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
}

/** Events needed to move from the levers in force to the player's draft, effective at `tick`. */
export function diffEvents(current: LeverState, draft: Draft, tick: number): PolicyEvent[] {
  const ev: PolicyEvent[] = [];
  if (draft.strRegime !== current.strRegime)
    ev.push({ tick, lever: 'strRegime', value: draft.strRegime });
  if (draft.enforcement !== current.enforcement)
    ev.push({ tick, lever: 'enforcement', value: draft.enforcement });
  return ev;
}

export function useGame() {
  const client = useRef<SimClient | null>(null);
  const [state, setState] = useState<GameState>(() => ({
    phase: 'loading',
    seed: initialSeed(),
    turn: 0,
    layout: null,
    snapshot: null,
    draft: { strRegime: 0, enforcement: 2 },
    log: [],
    changes: [],
  }));

  const start = useCallback(async (seed: number) => {
    client.current?.dispose();
    const c = new SimClient();
    client.current = c;
    setState((s) => ({ ...s, phase: 'loading', seed, turn: 0, log: [], changes: [] }));
    try {
      const { layout, snapshot } = await c.init(SCENARIO, seed);
      setState((s) => ({
        ...s,
        phase: 'playing',
        layout,
        snapshot,
        draft: { strRegime: snapshot.levers.strRegime, enforcement: snapshot.levers.enforcement },
      }));
    } catch (e) {
      setState((s) => ({ ...s, phase: 'error', error: String(e) }));
    }
  }, []);

  useEffect(() => {
    void start(state.seed);
    return () => client.current?.dispose();
  }, []);

  const setDraft = useCallback((d: Partial<Draft>) => {
    setState((s) => ({ ...s, draft: { ...s.draft, ...d } }));
  }, []);

  const endTurn = useCallback(async () => {
    const s = state;
    if (s.phase !== 'playing' || !s.snapshot || !client.current) return;
    const tick = s.snapshot.tick;
    const events = diffEvents(s.snapshot.levers, s.draft, tick);
    const newLog = events.map((e) => ({
      turn: s.turn + 1,
      tick,
      text:
        e.lever === 'strRegime'
          ? `STR regime set to "${regimeName(e.value)}"`
          : `Enforcement budget set to ${e.value}`,
    }));
    setState((p) => ({ ...p, phase: 'busy' }));
    try {
      const snapshot = await client.current.advance(events, TICKS_PER_TURN);
      const turn = s.turn + 1;
      setState((p) => ({
        ...p,
        snapshot,
        turn,
        phase: turn >= TOTAL_TURNS ? 'over' : 'playing',
        log: [...p.log, ...newLog],
        changes: [...p.changes, ...newLog.map((l) => ({ tick, label: l.text }))],
      }));
    } catch (e) {
      setState((p) => ({ ...p, phase: 'error', error: String(e) }));
    }
  }, [state]);

  return { state, setDraft, endTurn, restart: start };
}
