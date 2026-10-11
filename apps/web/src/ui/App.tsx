import { useMemo, useState } from 'preact/hooks';
import { MANDATES, OBJECTIVES, shockCard, tickToYearMonth } from '@zoned-out/sim';
import type { MandateId, Objective } from '@zoned-out/sim';
import { MapCanvas } from '../render/MapCanvas.tsx';
import { IsoMap } from '../render/iso/IsoMap.tsx';
import { firstLastValid, researcherView } from '../game/observe.ts';
import { capName, regimeName, TICKS_PER_TURN, TOTAL_TURNS, useGame } from '../game/useGame.ts';
import type { UiState } from '../game/useGame.ts';
import { AtlasSprite, SHOCK_ICON } from './AtlasSprite.tsx';
import { Briefing } from './Briefing.tsx';
import { Debrief } from './Debrief.tsx';
import { Hud } from './Hud.tsx';
import { Badge, Term } from './Tips.tsx';
import { Tabs } from './Tabs.tsx';
import { TitleScene } from './TitleScene.tsx';
import { Tutorial } from './Tutorial.tsx';
import { Levers } from './Levers.tsx';
import { LineChart } from './LineChart.tsx';
import { Logo } from './Logo.tsx';
import type { Point } from './LineChart.tsx';

/** Atlas icon for each mandate card on the title screen. */
const MANDATE_ICON: Record<MandateId, string> = {
  balanced: 'icon_capital',
  affordability: 'icon_rentstress',
  budget: 'icon_budget',
  tourism: 'icon_tourist',
};

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
    <main class="title">
      <div class="title-art">
        <TitleScene scale={2} />
      </div>
      <div class="title-card">
        <h1>
          <Logo scale={5} />
        </h1>
        <p class="tagline">Five years. Twenty quarters. One housing crisis.</p>
        <p class="lede">
          You run housing policy for Greater Victoria, BC (the Capital Regional District) from
          September 2023. Set short-term rental rules, enforcement, a vacancy tax, a rent cap,
          upzoning and non-market homes. Every result is compared with the same city under no policy
          change: same luck, same shocks.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start(state.seed, state.mandate);
          }}
        >
          <fieldset class="mandates">
            <legend>Choose your mandate</legend>
            {(Object.keys(MANDATES) as MandateId[]).map((id) => (
              <label class="mandate-card" key={id}>
                <input
                  type="radio"
                  name="mandate"
                  value={id}
                  checked={state.mandate === id}
                  onChange={() => setMandate(id)}
                />
                <AtlasSprite name={MANDATE_ICON[id]} />
                <span>
                  <strong>{MANDATES[id].name}</strong>
                  <small>{MANDATES[id].text}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <p class="muted">
            Seed {state.seed}. Each seed picks one calibrated variant of the model and one sequence
            of shocks.
          </p>
          <button class="go" type="submit" data-testid="start">
            Take office <span aria-hidden="true">▶</span>
          </button>
        </form>
        <p class="muted about-link">
          A calibrated model, not a forecast and not policy advice. Not affiliated with the
          Government of British Columbia.{' '}
          <a href={`${import.meta.env.BASE_URL}about.html`}>About, data sources and licences</a>
        </p>
      </div>
    </main>
  );
}

function Play({ state, quote, setDraft, endTurn, setup }: Game) {
  const [debrief, setDebrief] = useState(false);
  const [tab, setTab] = useState('policies');
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
  const over = state.phase === 'over';
  const news = state.news[state.news.length - 1];
  const cur = g.current;
  const changed = [
    draft.strRegime !== cur.strRegime,
    draft.enforcement !== cur.enforcement,
    draft.vacancyTax !== cur.vacancyTax,
    draft.rentCap !== cur.rentCap,
    draft.upzone.some((u, i) => u !== (cur.upzone[i] ?? 0)),
    draft.nonMarket !== cur.nonMarket,
    draft.buyData !== cur.buyData,
  ].filter(Boolean).length;
  const shock = state.currentShock !== null && !over ? shockCard(state.currentShock) : null;

  const cityPanel = (
    <section aria-labelledby="sum-h">
      <h2 id="sum-h">Since you took office</h2>
      <p class="city-id">
        Seed {state.seed}
        {layout.ensembleMember >= 0 && (
          <>
            {' · '}
            <Term id="variant">model variant</Term> {layout.ensembleMember + 1} of{' '}
            {layout.ensembleSize}
          </>
        )}
      </p>
      <dl class="kpis">
        {[
          { name: 'Covered-area listings', v: cov },
          { name: 'Exempt-area listings', v: ex },
        ].map((r) => (
          <div key={r.name}>
            <dt>{r.name}</dt>
            <dd>
              {r.v ? `${fmt(r.v[0].y)} → ${fmt(r.v[1].y)} (${pct(r.v[0].y, r.v[1].y)})` : '–'}
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
        Listings are <Term id="snapshot">scraped counts</Term>; they move for many reasons besides
        your rules.
      </p>
    </section>
  );
  const logPanel = (
    <>
      <section aria-labelledby="log-h">
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
      <section aria-labelledby="papers-h">
        <h2 id="papers-h">Past front pages</h2>
        {state.news.length === 0 ? (
          <p class="muted">The first paper comes out when you end a turn.</p>
        ) : (
          <ul class="log papers">
            {[...state.news].reverse().map((n) => (
              <li key={n.turn}>
                <span class="paper-date">{label(n.turn * TICKS_PER_TURN)}:</span> {n.headline}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
  const tabs = [
    ...(over
      ? []
      : [
          {
            id: 'policies',
            label: 'Policies',
            extra: changed > 0 ? `${changed} changed` : undefined,
            panel: (
              <Levers
                draft={draft}
                game={g}
                quote={quote}
                zoneNames={layout.zoneNames}
                zoneCovered={layout.zoneCovered}
                disabled={state.phase !== 'playing'}
                onChange={setDraft}
              />
            ),
          },
        ]),
    { id: 'city', label: 'City', panel: cityPanel },
    { id: 'log', label: 'Log', panel: logPanel },
  ];
  const activeTab = over && tab === 'policies' ? 'city' : tab;

  return (
    <div class="app">
      <Hud state={state} g={g} quote={quote} date={label(snapshot.tick)} />

      {debrief && state.final ? (
        <main class="debrief-main">
          <Debrief state={state} />
        </main>
      ) : (
        <main class="layout">
          <section class="left">
            {!over && <Tutorial turn={g.turn} />}
            {(shock || (news && !over)) && (
              <div class={`news-row${shock && news ? ' two' : ''}`}>
                {shock && (
                  <aside class="shock-card" role="status" aria-labelledby="shock-h">
                    {SHOCK_ICON[shock.id] && <AtlasSprite name={SHOCK_ICON[shock.id]!} scale={3} />}
                    <div>
                      <h2 id="shock-h">Shock: {shock.name}</h2>
                      <p>{shock.text}</p>
                      <small>
                        The same shock hits the{' '}
                        <Term id="counterfactual">no-policy comparison run</Term>, so it does not
                        affect your score.
                      </small>
                    </div>
                  </aside>
                )}
                {news && !over && <Briefing item={news} date={label(snapshot.tick)} />}
              </div>
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

          <aside class="right side-panel">
            <Tabs tabs={tabs} active={activeTab} onChange={setTab} label="City hall" />
          </aside>
        </main>
      )}

      <footer class="bottombar">
        {over ? (
          <>
            <p data-testid="over">Your term is over.</p>
            <button class="primary" onClick={() => setDebrief((d) => !d)}>
              {debrief ? 'Back to the city' : 'Open the debrief'}
            </button>
            <button onClick={setup}>New term (new seed)</button>
          </>
        ) : (
          <>
            <p class={blocked ? 'error' : 'muted'}>
              {blocked
                ? 'Fix the problems in the Policies tab to end the turn.'
                : changed > 0
                  ? `${changed} change${changed === 1 ? '' : 's'} ready. They take effect when you end the turn.`
                  : 'Each turn is one quarter (3 months). Changes take effect when you end the turn.'}
            </p>
            <button
              class="go"
              data-testid="end-turn"
              disabled={state.phase !== 'playing' || blocked}
              onClick={() => void endTurn()}
            >
              {state.phase === 'busy' ? (
                'Simulating…'
              ) : (
                <>
                  End turn <span aria-hidden="true">▶</span>
                </>
              )}
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

const BEST_KEY = 'zonedout.best';

/**
 * The best mandate score this browser has recorded for a seed and mandate, before this term;
 * records this term's score if it is better (a per-viewer convenience, never game state).
 */
function bestBefore(seed: number, mandate: MandateId, score: number): number | null {
  const key = `${BEST_KEY}.${seed}.${mandate}`;
  try {
    const raw = window.localStorage.getItem(key);
    const prev = raw === null ? NaN : Number(raw);
    if (!Number.isFinite(prev) || score > prev) window.localStorage.setItem(key, String(score));
    return Number.isFinite(prev) ? prev : null;
  } catch {
    return null;
  }
}

function ScorecardPanel({ state }: { state: UiState }) {
  const f = state.final!;
  const e = f.card.effects;
  const weights = MANDATES[state.mandate].weights;
  // Read (and update) the stored best once per finished term.
  const [prevBest] = useState(() => bestBefore(state.seed, state.mandate, f.composite));
  const effect: Record<Objective, string> = {
    affordability: `${signed(e.rentBurdenPp, 2)} pp`,
    stress: `${signed(e.stressRatePp, 2)} pp`,
    supply: `${signed(e.completions, 0)} homes`,
    fiscal: `${signed(f.card.fiscalBalance, 1)} $M`,
    visitors: `${signed(e.strListingsPct, 1)}%`,
    capital: `${f.card.capital}`,
  };
  const maxAbs = Math.max(1, ...OBJECTIVES.map((k) => Math.abs(f.card.points[k])));
  const c = Number(f.composite.toFixed(2));
  const verdict =
    c > 0
      ? 'Better than doing nothing, by your mandate’s weights.'
      : c < 0
        ? 'Worse than doing nothing, by your mandate’s weights.'
        : 'No better or worse than doing nothing, by your mandate’s weights.';
  return (
    <section class="panel scorecard" aria-labelledby="score-h" data-testid="scorecard">
      <div class="results-head">
        <AtlasSprite name="icon_trophy" scale={3} />
        <div class="results-title">
          <h2 id="score-h">End of term: your scorecard</h2>
          <p class="verdict">{verdict}</p>
        </div>
        <p class="score-big">
          <span>Mandate score ({MANDATES[state.mandate].name})</span>
          <strong data-testid="composite">{signed(f.composite, 2)}</strong>
          <span>points</span>
        </p>
      </div>
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
          {OBJECTIVES.map((k) => {
            const p = f.card.points[k];
            const w = (50 * Math.abs(p)) / maxAbs;
            return (
              <tr key={k}>
                <th scope="row">{OBJECTIVE_LABEL[k]}</th>
                <td>{effect[k]}</td>
                <td class="points">
                  <span class="pbar" aria-hidden="true">
                    <span
                      class={`pbar-fill ${p >= 0 ? 'pos' : 'neg'}`}
                      style={{ width: `${w}%`, left: p >= 0 ? '50%' : `${50 - w}%` }}
                    />
                  </span>
                  <span class="pval">{signed(p, 1)}</span>
                </td>
                <td>×{weights[k]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="best">
        {prevBest === null
          ? 'Your first finished term on this city and mandate in this browser.'
          : f.composite > prevBest
            ? `New best on this city and mandate (previous ${signed(prevBest, 2)}).`
            : `Your best on this city and mandate: ${signed(prevBest, 2)}.`}
      </p>
      <p class="muted">
        Asking rents ended {signed(e.askingRentPct, 1)} index points (start = 100) versus no policy
        (not scored directly). Open the debrief to see the uncertainty across model variants and
        what the data could have told you.
      </p>
    </section>
  );
}
