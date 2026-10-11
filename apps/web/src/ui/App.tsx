import { useMemo, useState } from 'preact/hooks';
import { MANDATES, OBJECTIVES, shockCard, tickToYearMonth } from '@zoned-out/sim';
import type { MandateId, Objective } from '@zoned-out/sim';
import { MapCanvas } from '../render/MapCanvas.tsx';
import { IsoMap } from '../render/iso/IsoMap.tsx';
import { firstLastValid, researcherView } from '../game/observe.ts';
import { capName, regimeName, TICKS_PER_TURN, TOTAL_TURNS, useGame } from '../game/useGame.ts';
import type { UiState } from '../game/useGame.ts';
import { AtlasSprite, SHOCK_ICON } from './AtlasSprite.tsx';
import { Debrief } from './Debrief.tsx';
import { Badge, Term } from './Tips.tsx';
import { Tutorial } from './Tutorial.tsx';
import { Levers } from './Levers.tsx';
import { LineChart } from './LineChart.tsx';
import { Logo } from './Logo.tsx';
import type { Point } from './LineChart.tsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const XMAX = TOTAL_TURNS * TICKS_PER_TURN;
/** ?map=flat keeps the M2 placeholder map (fallback and debugging). */
const FLAT_MAP =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('map') === 'flat';

function pct(a: number, b: number): string {
  const v = (100 * (b - a)) / a;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
}

/** Signed number with a real minus sign. */
function signed(v: number, digits: number): string {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(digits)}`;
}

/** Rounded count with thousands separators. */
function fmt(v: number): string {
  return Math.round(v).toLocaleString('en-CA');
}

export function App() {
  const game = useGame();
  const { state } = game;

  if (state.phase === 'error') {
    return (
      <main class="center">
        <div>
          <p role="alert">Something went wrong: {state.error}</p>
          <button onClick={game.setup}>Back to the start</button>
        </div>
      </main>
    );
  }
  if (state.phase === 'setup') return <Setup {...game} />;
  if (!state.snapshot || !state.layout || !state.game || !state.draft) {
    return (
      <main class="center">
        <p aria-live="polite">Building the city…</p>
      </main>
    );
  }
  return <Play {...game} />;
}

type Game = ReturnType<typeof useGame>;

function Setup({ state, start, setMandate }: Game) {
  return (
    <main class="setup">
      <h1>
        <Logo scale={4} />
      </h1>
      <p class="lede">
        You run housing policy for the Capital Regional District (Greater Victoria, BC) for five
        years (20 quarters), starting in September 2023. The region is stylised as eight zones, with
        starting numbers from public data where available. Set short-term rental rules, enforcement,
        a vacancy tax, a rent cap, upzoning and non-market homes. Your results are compared with
        what would have happened with no policy changes: same city, same luck.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void start(state.seed, state.mandate);
        }}
      >
        <fieldset>
          <legend>Choose your mandate</legend>
          {(Object.keys(MANDATES) as MandateId[]).map((id) => (
            <label class="radio" key={id}>
              <input
                type="radio"
                name="mandate"
                value={id}
                checked={state.mandate === id}
                onChange={() => setMandate(id)}
              />
              <span>
                <strong>{MANDATES[id].name}</strong>
                <small>{MANDATES[id].text}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <p class="muted">
          Seed {state.seed}. Each seed picks one calibrated variant of the model and one sequence of
          shocks.
        </p>
        <button class="primary" type="submit" data-testid="start">
          Take office
        </button>
      </form>
    </main>
  );
}

function Play({ state, quote, setDraft, endTurn, setup }: Game) {
  const [debrief, setDebrief] = useState(false);
  const snapshot = state.snapshot!;
  const layout = state.layout!;
  const g = state.game!;
  const draft = state.draft!;
  const label = (x: number) => {
    const ym = tickToYearMonth(layout.start, x);
    return `${MONTHS[ym.month - 1]} ${String(ym.year).slice(2)}`;
  };
  const view = useMemo(
    () => researcherView(snapshot, layout, state.seed, state.dataThroughTick),
    [snapshot, layout, state.seed, state.dataThroughTick],
  );
  const markers = state.changes.map((c) => ({ x: c.tick, label: c.label }));
  const blocked = (quote?.errors.length ?? 0) > 0;
  const lastOf = (p: Point[]) => p[p.length - 1]?.y;
  const cov = firstLastValid(view.covered);
  const ex = firstLastValid(view.exempt);
  const cpiLast = lastOf(view.cpi);

  return (
    <div class="app">
      <header class="topbar">
        <h1>
          <Logo scale={2} />
        </h1>
        <span>
          Turn <strong data-testid="turn">{Math.min(g.turn + 1, TOTAL_TURNS)}</strong> /{' '}
          {TOTAL_TURNS}
        </span>
        <span>
          Date <strong data-testid="date">{label(snapshot.tick)}</strong>
        </span>
        <span>
          <AtlasSprite name="icon_budget" />
          Budget <strong data-testid="budget">${g.budget.toFixed(1)}M</strong>
        </span>
        <span>
          <AtlasSprite name="icon_capital" />
          Political capital <strong data-testid="capital">{g.capital}</strong> / 12
        </span>
        <span>
          Mandate <strong>{MANDATES[g.mandate].name}</strong>
        </span>
        <span class="seed">
          seed {state.seed}
          {layout.ensembleMember >= 0 && (
            <>
              {' · '}
              <Term id="variant">model variant</Term> {layout.ensembleMember + 1} of{' '}
              {layout.ensembleSize}
            </>
          )}
        </span>
      </header>

      {debrief && state.final ? (
        <main class="debrief-main">
          <Debrief state={state} />
        </main>
      ) : (
        <main class="layout">
          <section class="left">
            {state.phase !== 'over' && <Tutorial turn={g.turn} />}
            {state.currentShock !== null && state.phase !== 'over' && (
              <aside class="shock-card" role="status" aria-labelledby="shock-h">
                <h2 id="shock-h">
                  {SHOCK_ICON[shockCard(state.currentShock).id] && (
                    <AtlasSprite name={SHOCK_ICON[shockCard(state.currentShock).id]!} />
                  )}
                  Shock: {shockCard(state.currentShock).name}
                </h2>
                <p>{shockCard(state.currentShock).text}</p>
                <small>
                  The same shock hits the <Term id="counterfactual">no-policy comparison run</Term>,
                  so it does not affect your score.
                </small>
              </aside>
            )}
            {state.final && <ScorecardPanel state={state} />}
            <div class="charts">
              <LineChart
                title="Entire-home STR listings (quarterly scrape)"
                badge={
                  <Badge
                    level="measured"
                    why="The listing response to the STR rules is calibrated to the Bill 35 data from the first project."
                  />
                }
                xMax={XMAX}
                xLabel={label}
                yFormat={(y) => fmt(y)}
                markers={markers}
                lines={[
                  { label: 'Covered areas', points: view.covered, color: '#d55e00', dots: true },
                  {
                    label: 'Exempt areas',
                    points: view.exempt,
                    color: '#009e73',
                    dash: '6 4',
                    dots: true,
                  },
                ]}
                summary={
                  cov && ex
                    ? `Covered-area listings ${pct(cov[0].y, cov[1].y)} since the first snapshot; exempt areas ${pct(ex[0].y, ex[1].y)}.`
                    : 'No snapshots yet.'
                }
                note={`Scraped counts are noisy. ${view.flagged > 0 ? `${view.flagged} snapshot${view.flagged === 1 ? ' was' : 's were'} flagged incomplete and left out.` : 'Incomplete scrapes are flagged and left out.'}`}
              />
              <LineChart
                title="Rent indices (start = 100)"
                badge={
                  <Badge
                    level="assumed"
                    why="How rents respond to STR rules, taxes and supply is assumed: the real data cannot detect an STR rent effect this small."
                  />
                }
                xMax={XMAX}
                xLabel={label}
                yFormat={(y) => y.toFixed(0)}
                markers={markers}
                lines={[
                  {
                    label: 'All-tenant rents (published, quarterly)',
                    points: view.cpi,
                    color: '#cc79a7',
                    dash: '6 4',
                    dots: true,
                  },
                  ...(view.asking.length > 0
                    ? [
                        {
                          label: 'Asking rents (bought data)',
                          points: view.asking,
                          color: '#0072b2',
                        },
                      ]
                    : []),
                ]}
                summary={`Published all-tenant rents ${cpiLast !== undefined ? pct(100, cpiLast) : 'not yet available'}${view.asking.length > 0 ? `; asking rents ${pct(100, lastOf(view.asking)!)} (through ${label(state.dataThroughTick)})` : ''}.`}
                note={
                  view.asking.length > 0
                    ? `Asking-rent data covers months up to ${label(state.dataThroughTick)}.`
                    : 'Buy asking-rent data to see what new leases cost.'
                }
              />
            </div>
            {FLAT_MAP ? (
              <MapCanvas layout={layout} snapshot={snapshot} />
            ) : (
              <IsoMap layout={layout} snapshot={snapshot} />
            )}
          </section>

          <aside class="right">
            {state.phase !== 'over' && (
              <Levers
                draft={draft}
                game={g}
                quote={quote}
                zoneNames={layout.zoneNames}
                zoneCovered={layout.zoneCovered}
                disabled={state.phase !== 'playing'}
                onChange={setDraft}
              />
            )}
            <section class="panel" aria-labelledby="sum-h">
              <h2 id="sum-h">Since you took office</h2>
              <dl class="kpis">
                {[
                  { name: 'Covered-area listings', v: cov },
                  { name: 'Exempt-area listings', v: ex },
                ].map((r) => (
                  <div key={r.name}>
                    <dt>{r.name}</dt>
                    <dd>
                      {r.v
                        ? `${fmt(r.v[0].y)} → ${fmt(r.v[1].y)} (${pct(r.v[0].y, r.v[1].y)})`
                        : '–'}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>
                    <Term id="cpi">All-tenant rents</Term>
                  </dt>
                  <dd>{cpiLast !== undefined ? pct(100, cpiLast) : '–'}</dd>
                </div>
                <div>
                  <dt>STR rules</dt>
                  <dd>{regimeName(snapshot.levers.strRegime)}</dd>
                </div>
                <div>
                  <dt>Rent cap</dt>
                  <dd>{capName(snapshot.levers.rentCap)}</dd>
                </div>
                <div>
                  <dt>Fines and vacancy tax so far</dt>
                  <dd>${g.revenue.toFixed(2)}M</dd>
                </div>
              </dl>
              <p class="muted">
                Listings are <Term id="snapshot">scraped counts</Term>; they move for many reasons
                besides your rules.
              </p>
            </section>
            <section class="panel" aria-labelledby="log-h">
              <h2 id="log-h">Decisions</h2>
              {state.log.length === 0 ? (
                <p class="muted">No changes yet.</p>
              ) : (
                <ol class="log">
                  {state.log.map((l, i) => (
                    <li key={i} class={l.kind}>
                      Turn {l.turn} ({label(l.tick)}): {l.text}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </main>
      )}

      <footer class="bottombar">
        {state.phase === 'over' ? (
          <>
            <p data-testid="over">Your term is over.</p>
            <button class="primary" onClick={() => setDebrief((d) => !d)}>
              {debrief ? 'Back to the city' : 'Open the debrief'}
            </button>
            <button onClick={setup}>New term (new seed)</button>
          </>
        ) : (
          <>
            <p class="muted">
              {blocked
                ? 'Fix the problems in the levers panel to end the turn.'
                : 'Each turn is one quarter (3 months). Changes take effect when you end the turn.'}
            </p>
            <button
              class="primary"
              data-testid="end-turn"
              disabled={state.phase !== 'playing' || blocked}
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

const OBJECTIVE_LABEL: Record<Objective, string> = {
  affordability: 'Renters paying over 30% of income',
  stress: 'Housing-stress rate (doubled up or left)',
  supply: 'Homes completed',
  fiscal: 'Fiscal balance vs status quo',
  visitors: 'Visitor beds (STR listings)',
  capital: 'Political capital left',
};

function ScorecardPanel({ state }: { state: UiState }) {
  const f = state.final!;
  const e = f.card.effects;
  const weights = MANDATES[state.mandate].weights;
  const effect: Record<Objective, string> = {
    affordability: `${signed(e.rentBurdenPp, 2)} pp`,
    stress: `${signed(e.stressRatePp, 2)} pp`,
    supply: `${signed(e.completions, 0)} homes`,
    fiscal: `${signed(f.card.fiscalBalance, 1)} $M`,
    visitors: `${signed(e.strListingsPct, 1)}%`,
    capital: `${f.card.capital}`,
  };
  return (
    <section class="panel scorecard" aria-labelledby="score-h" data-testid="scorecard">
      <h2 id="score-h">End of term: your scorecard</h2>
      <p class="muted">
        Each effect compares your term with a no-policy run of the same city: same seed, same model
        variant, same shocks.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Objective</th>
            <th scope="col">Effect</th>
            <th scope="col">Points</th>
            <th scope="col">Weight</th>
          </tr>
        </thead>
        <tbody>
          {OBJECTIVES.map((k) => (
            <tr key={k}>
              <th scope="row">{OBJECTIVE_LABEL[k]}</th>
              <td>{effect[k]}</td>
              <td>{signed(f.card.points[k], 1)}</td>
              <td>×{weights[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="composite">
        Mandate score ({MANDATES[state.mandate].name}):{' '}
        <strong data-testid="composite">{signed(f.composite, 2)}</strong> points
      </p>
      <p class="muted">
        Asking rents ended {signed(e.askingRentPct, 1)} index points (start = 100) versus no policy
        (not scored directly). Open the debrief to see the uncertainty across model variants and
        what the data could have told you.
      </p>
    </section>
  );
}
