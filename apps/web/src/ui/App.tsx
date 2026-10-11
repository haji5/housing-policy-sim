import { tickToYearMonth } from '@zoned-out/sim';
import { MapCanvas } from '../render/MapCanvas.tsx';
import { regimeName, TICKS_PER_TURN, TOTAL_TURNS, useGame } from '../game/useGame.ts';
import type { GameState } from '../game/useGame.ts';
import { Levers } from './Levers.tsx';
import { LineChart } from './LineChart.tsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const XMAX = TOTAL_TURNS * TICKS_PER_TURN;

function pct(a: number, b: number): string {
  const v = (100 * (b - a)) / a;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
}

export function App() {
  const { state, setDraft, endTurn, restart } = useGame();
  const { snapshot, layout } = state;

  if (state.phase === 'error') {
    return (
      <main class="center">
        <p role="alert">Something went wrong: {state.error}</p>
        <button onClick={() => void restart(state.seed)}>Restart</button>
      </main>
    );
  }
  if (!snapshot || !layout) {
    return (
      <main class="center">
        <p aria-live="polite">Building the city…</p>
      </main>
    );
  }

  const label = (x: number) => {
    const ym = tickToYearMonth(layout.start, x);
    return `${MONTHS[ym.month - 1]} ${String(ym.year).slice(2)}`;
  };
  const s = snapshot.series;
  const zones = s.zones;
  const coveredSeries = sumZones(zones, (z) => z.covered);
  const exemptSeries = sumZones(zones, (z) => !z.covered);
  const first = (xs: number[]) => xs[0] ?? 0;
  const lastv = (xs: number[]) => xs[xs.length - 1] ?? 0;
  const dirty =
    state.draft.strRegime !== snapshot.levers.strRegime ||
    state.draft.enforcement !== snapshot.levers.enforcement;

  return (
    <div class="app">
      <header class="topbar">
        <h1>Zoned Out</h1>
        <span>
          Turn <strong data-testid="turn">{Math.min(state.turn + 1, TOTAL_TURNS)}</strong> /{' '}
          {TOTAL_TURNS}
        </span>
        <span>
          Date <strong data-testid="date">{label(snapshot.tick)}</strong>
        </span>
        <span>
          Rule in force: <strong>{regimeName(snapshot.levers.strRegime)}</strong>, enforcement{' '}
          {snapshot.levers.enforcement}/5
        </span>
        <span class="seed">
          seed {state.seed}
          {layout.ensembleMember >= 0 &&
            ` · model variant ${layout.ensembleMember + 1} of ${layout.ensembleSize}`}
        </span>
      </header>

      <main class="layout">
        <section class="left">
          <MapCanvas layout={layout} snapshot={snapshot} />
          <div class="charts">
            <LineChart
              title="Active entire-home STR listings"
              xMax={XMAX}
              xLabel={label}
              markers={state.changes.map((c) => ({ x: c.tick, label: c.label }))}
              lines={[
                { label: 'Covered areas', values: coveredSeries, color: '#d55e00' },
                { label: 'Exempt areas', values: exemptSeries, color: '#009e73', dash: '6 4' },
              ]}
              summary={`Covered-area listings ${pct(first(coveredSeries), lastv(coveredSeries))} since the start; exempt areas ${pct(first(exemptSeries), lastv(exemptSeries))}.`}
            />
            <LineChart
              title="Rent indices (start = 100)"
              xMax={XMAX}
              xLabel={label}
              yFormat={(y) => y.toFixed(0)}
              markers={state.changes.map((c) => ({ x: c.tick, label: c.label }))}
              lines={[
                { label: 'Asking rents (new leases)', values: s.askingRentIndex, color: '#0072b2' },
                {
                  label: 'CPI-style (all tenants)',
                  values: s.cpiRentIndex,
                  color: '#cc79a7',
                  dash: '6 4',
                },
              ]}
              summary={`Asking rents ${pct(100, lastv(s.askingRentIndex))}, all-tenant rents ${pct(100, lastv(s.cpiRentIndex))} since the start.`}
            />
          </div>
        </section>

        <aside class="right">
          <Levers draft={state.draft} disabled={state.phase !== 'playing'} onChange={setDraft} />
          <Summary state={state} />
          <section class="panel" aria-labelledby="log-h">
            <h2 id="log-h">Decisions</h2>
            {state.log.length === 0 ? (
              <p class="muted">No changes yet.</p>
            ) : (
              <ol class="log">
                {state.log.map((l, i) => (
                  <li key={i}>
                    Turn {l.turn} ({label(l.tick)}): {l.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </main>

      <footer class="bottombar">
        {state.phase === 'over' ? (
          <>
            <p data-testid="over">Your term is over.</p>
            <button onClick={() => void restart(state.seed + 1)}>New term (new seed)</button>
          </>
        ) : (
          <>
            <p class="muted">
              {dirty
                ? 'Changes take effect when you end the turn.'
                : 'Each turn is one quarter (3 months).'}
            </p>
            <button
              class="primary"
              data-testid="end-turn"
              disabled={state.phase !== 'playing'}
              onClick={() => void endTurn()}
            >
              {state.phase === 'busy' ? 'Simulating…' : 'End turn'}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

function Summary({ state }: { state: GameState }) {
  const s = state.snapshot!.series;
  const z = s.zones;
  const first = (xs: number[]) => xs[0] ?? 0;
  const lastv = (xs: number[]) => xs[xs.length - 1] ?? 0;
  const last = s.housed.length - 1;
  if (last < 0) return null;
  return (
    <section class="panel" aria-labelledby="sum-h">
      <h2 id="sum-h">Since you took office</h2>
      <dl class="kpis">
        {[
          { name: 'Covered-area listings', values: sumZones(z, (x) => x.covered) },
          { name: 'Exempt-area listings', values: sumZones(z, (x) => !x.covered) },
        ].map((g) => (
          <div key={g.name}>
            <dt>{g.name}</dt>
            <dd>
              {first(g.values)} → {lastv(g.values)} ({pct(first(g.values), lastv(g.values))})
            </dd>
          </div>
        ))}
        <div>
          <dt>Asking rents</dt>
          <dd>{pct(100, lastv(s.askingRentIndex))}</dd>
        </div>
        <div>
          <dt>Renters paying &gt; 30% of income</dt>
          <dd>{(100 * lastv(s.rentBurdenShare)).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Households that left (housing stress)</dt>
          <dd>{lastv(s.gone)}</dd>
        </div>
      </dl>
      {state.phase === 'over' && (
        <p class="note">
          These are raw before/after changes. Rents move for many reasons besides STR rules; the
          debrief (coming later) compares your term with a no-policy counterfactual on the same
          seed.
        </p>
      )}
    </section>
  );
}

/** Element-wise sum of listings over the zones matching `pred`. */
function sumZones(
  zones: { covered: boolean; strListings: number[] }[],
  pred: (z: { covered: boolean }) => boolean,
): number[] {
  const n = zones[0]?.strListings.length ?? 0;
  const out = new Array<number>(n).fill(0);
  for (const z of zones) if (pred(z)) for (let i = 0; i < n; i++) out[i]! += z.strListings[i]!;
  return out;
}
