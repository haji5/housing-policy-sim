import { useEffect, useMemo, useState } from 'preact/hooks';
import { researcherCpi, researcherPanel, shockEvents, tickToYearMonth } from '@zoned-out/sim';
import type { MemberPaths } from '../workers/debrief.worker.ts';
import { debriefMembers, didCard, fan, runDebrief, ruleOnFrom } from '../game/debrief.ts';
import { SCENARIO, TICKS_PER_TURN, TOTAL_TURNS } from '../game/useGame.ts';
import type { UiState } from '../game/useGame.ts';
import { LineChart } from './LineChart.tsx';
import type { Band, Point } from './LineChart.tsx';
import { Badge, Term } from './Tips.tsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const XMAX = TOTAL_TURNS * TICKS_PER_TURN;
const FIRST_PROJECT = 'https://haji5.github.io/bc-str-ban-analysis/';

const pctOfLog = (v: number) => 100 * (Math.exp(v) - 1);
function signed(v: number, d: number): string {
  const r = Number(v.toFixed(d));
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(d)}`;
}

/** Fan bands (5-95% and 25-75%) plus the median, from per-member paths. */
function fanBands(paths: number[][], color: string, map: (v: number) => number) {
  const [q05, q25, q50, q75, q95] = fan(paths, [0.05, 0.25, 0.5, 0.75, 0.95]);
  const pts = (lo: number[], hi: number[]) =>
    lo.map((v, i) => ({ x: i, lo: map(v), hi: map(hi[i]!) }));
  const bands: Band[] = [
    { label: '5-95% of model variants', points: pts(q05!, q95!), color, opacity: 0.15 },
    { label: '25-75%', points: pts(q25!, q75!), color, opacity: 0.3 },
  ];
  return { bands, median: q50!.map((v, i) => ({ x: i, y: map(v) })), q05: q05!, q95: q95! };
}

export function Debrief({ state }: { state: UiState }) {
  const layout = state.layout!;
  const final = state.final!;
  const label = (x: number) => {
    const ym = tickToYearMonth(layout.start, x);
    return `${MONTHS[ym.month - 1]} ${String(ym.year).slice(2)}`;
  };
  const [paths, setPaths] = useState<MemberPaths[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const members = useMemo(() => debriefMembers(layout.ensembleMember), [layout]);

  useEffect(() => {
    if (members.length === 0) return;
    let live = true;
    runDebrief(
      {
        scenario: SCENARIO,
        seed: state.seed,
        ticks: XMAX,
        decisions: state.events,
        shocks: shockEvents(state.game!),
      },
      members,
      (done) => live && setProgress(done),
    ).then(
      (p) => live && setPaths(p),
      (e: unknown) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [members, state.seed, state.events, state.game]);

  const { policyRun, baseRun } = final.runs;
  const did = useMemo(
    () => didCard(policyRun, baseRun, state.seed, ruleOnFrom(state.events)),
    [policyRun, baseRun, state.seed, state.events],
  );

  // Your world: true effect paths (god view) against the paired no-policy run.
  const sumCov = (o: typeof policyRun, i: number, covered: boolean) =>
    o.series.zones.reduce((a, z) => (z.covered === covered ? a + z.strListings[i]! : a), 0);
  const n = policyRun.series.tick.length;
  const yourCov: Point[] = Array.from({ length: n }, (_, i) => ({
    x: i,
    y: pctOfLog(
      Math.log(Math.max(1, sumCov(policyRun, i, true)) / Math.max(1, sumCov(baseRun, i, true))),
    ),
  }));
  const yourAsk: Point[] = Array.from({ length: n }, (_, i) => ({
    x: i,
    y: policyRun.series.askingRentIndex[i]! - baseRun.series.askingRentIndex[i]!,
  }));
  const covFan = paths
    ? fanBands(
        paths.map((p) => p.covered),
        '#d55e00',
        pctOfLog,
      )
    : null;
  const askFan = paths
    ? fanBands(
        paths.map((p) => p.asking),
        '#0072b2',
        (v) => v,
      )
    : null;
  // Self-check: the player's own variant, replayed in the debrief worker, must reproduce "your
  // world" exactly (same params, seed, shocks and decisions; events up front ≡ turn by turn).
  const own = paths?.find((p) => p.member === layout.ensembleMember);
  const ownGap = own
    ? Math.max(
        ...own.covered.map((v, i) =>
          Math.abs(
            v -
              Math.log(
                Math.max(1, sumCov(policyRun, i, true)) / Math.max(1, sumCov(baseRun, i, true)),
              ),
          ),
        ),
      )
    : null;
  const endCov = yourCov[n - 1]?.y ?? 0;
  const endAsk = yourAsk[n - 1]?.y ?? 0;

  // What you could have known: scraped counts and noisy CPI vs the truth.
  const snaps: number[] = [];
  for (let t = 0; t < n; t += 3) snaps.push(t);
  const panel = researcherPanel(policyRun, state.seed, snaps);
  const scraped: Point[] = snaps.map((t, k) => ({
    x: t,
    y: panel.observed.reduce((a, z, zi) => (layout.zoneCovered[zi] ? a + z[k]! : a), 0),
    hollow: panel.incomplete[k]!,
  }));
  const truth: Point[] = snaps.map((t) => ({ x: t, y: sumCov(policyRun, t, true) / layout.scale }));
  const cpi = researcherCpi(policyRun, state.seed);
  const cpiPts: Point[] = cpi.tick.map((t, i) => ({ x: t, y: cpi.value[i]! }));
  const askTrue: Point[] = policyRun.series.askingRentIndex.map((y, i) => ({ x: i, y }));

  const share = `${window.location.origin}${window.location.pathname}?seed=${state.seed}&mandate=${state.mandate}`;
  const [copied, setCopied] = useState(false);

  return (
    <section
      class="debrief"
      aria-labelledby="debrief-h"
      data-testid="debrief"
      data-ready={paths ? 'true' : 'false'}
      data-own-variant-gap={ownGap ?? ''}
    >
      <h2 id="debrief-h">Debrief: what your policies did</h2>

      <div class="debrief-grid">
        <article class="panel">
          <h3>
            Your term against no policy{' '}
            <Badge
              level="measured"
              why="Listing effects are calibrated to the Bill 35 data; spread shows what the data cannot pin down."
            />
          </h3>
          <p>
            In your world, covered-area STR listings ended <strong>{signed(endCov, 0)}%</strong> and
            asking rents <strong>{signed(endAsk, 1)} index points</strong> against the{' '}
            <Term id="counterfactual">no-policy run</Term>.{' '}
            {covFan &&
              `Replaying your decisions in ${paths!.length} model variants (yours included) gives ${signed(pctOfLog(covFan.q05[n - 1]!), 0)}% to ${signed(pctOfLog(covFan.q95[n - 1]!), 0)}% for listings (5-95%).`}
          </p>
          {!paths && !error && (
            <p class="muted" aria-live="polite">
              Replaying your term in {members.length} model variants… {progress} of {members.length}
            </p>
          )}
          {error && <p role="alert">The debrief runs failed: {error}</p>}
          <div class="charts">
            <LineChart
              title="Effect on covered-area listings (%)"
              xMax={XMAX}
              xLabel={label}
              yFormat={(y) => y.toFixed(0)}
              zero
              bands={covFan?.bands ?? []}
              lines={[
                ...(covFan
                  ? [
                      {
                        label: 'Median variant',
                        points: covFan.median,
                        color: '#d55e00',
                        dash: '4 3',
                      },
                    ]
                  : []),
                { label: 'Your world', points: yourCov, color: '#1b1b2a' },
              ]}
              summary={`Your world ends at ${signed(endCov, 0)}%.`}
            />
            <LineChart
              title="Effect on asking rents (index points)"
              badge={
                <Badge
                  level="assumed"
                  why="Rent responses are assumed, not measured: the real data cannot detect an effect this small."
                />
              }
              xMax={XMAX}
              xLabel={label}
              yFormat={(y) => y.toFixed(1)}
              zero
              bands={askFan?.bands ?? []}
              lines={[
                ...(askFan
                  ? [
                      {
                        label: 'Median variant',
                        points: askFan.median,
                        color: '#0072b2',
                        dash: '4 3',
                      },
                    ]
                  : []),
                { label: 'Your world', points: yourAsk, color: '#1b1b2a' },
              ]}
              summary={`Your world ends at ${signed(endAsk, 1)} points.`}
            />
          </div>
          <p class="muted">
            {Math.abs(endAsk) < 2.2
              ? `Rents: an effect of ${signed(endAsk, 1)} points would be too small to detect in real data: the first project's CPI rent estimate has a standard error of about 1.1 points. Its size here rests on assumed rent responses.`
              : `Rents: an effect of ${signed(endAsk, 1)} points might be detectable in CPI data, but its size rests on assumed rent responses.`}
          </p>
        </article>

        <article class="panel">
          <h3>What you could have known</h3>
          <p>
            During the game you saw <Term id="snapshot">scraped snapshots</Term> and the noisy{' '}
            <Term id="cpi">published rent index</Term>. Here they are against the truth.
          </p>
          <div class="charts">
            <LineChart
              title="Covered-area listings: scraped vs true"
              xMax={XMAX}
              xLabel={label}
              yFormat={(y) => Math.round(y).toLocaleString('en-CA')}
              lines={[
                { label: 'True count', points: truth, color: '#1b1b2a' },
                { label: 'Scraped', points: scraped, color: '#d55e00', dash: '5 3', dots: true },
              ]}
              summary={`${panel.incomplete.filter(Boolean).length} snapshots were flagged incomplete.`}
            />
            <LineChart
              title="Rents: published CPI vs true asking rents"
              xMax={XMAX}
              xLabel={label}
              yFormat={(y) => y.toFixed(0)}
              lines={[
                { label: 'True asking rents', points: askTrue, color: '#0072b2' },
                {
                  label: 'Published CPI (noisy)',
                  points: cpiPts,
                  color: '#cc79a7',
                  dash: '5 3',
                  dots: true,
                },
              ]}
              summary="The published series is noisy; asking rents move smoothly."
            />
          </div>
        </article>

        <article class="panel" data-testid="did-card">
          <h3>
            Would a researcher&apos;s <Term id="did">DiD</Term> get it right in your world?
          </h3>
          {did.applicable ? (
            <>
              <dl class="kpis">
                <div>
                  <dt>DiD estimate (scraped data, covered vs exempt)</dt>
                  <dd data-testid="did-estimate">{signed(did.estimate, 3)}</dd>
                </div>
                <div>
                  <dt>True effect on covered listings</dt>
                  <dd data-testid="did-truth">{signed(did.truth, 3)}</dd>
                </div>
                <div>
                  <dt>Error (estimate − truth)</dt>
                  <dd>{signed(did.estimate - did.truth, 3)}</dd>
                </div>
                <div>
                  <dt>Spillover into exempt areas</dt>
                  <dd>{signed(did.spillover, 3)}</dd>
                </div>
              </dl>
              <p class="muted">
                Log points, over the snapshots with your rule in force ({did.dropped} of{' '}
                {did.snapshots} snapshots dropped as incomplete). When the rule pushes listings into
                exempt areas, the comparison group rises and the DiD overstates the fall. In the
                model&apos;s main experiment the bias averages about −0.04 log points, but a single
                estimate misses by about ±0.08 from noise alone (VALIDATION.md §3).
              </p>
            </>
          ) : did.reason === 'no-pre' ? (
            <p>
              You switched the short-term rental rule on in your first quarter, before any complete
              listing snapshot. With no &ldquo;before&rdquo; data a DiD cannot separate the rule
              from the difference between covered and exempt areas, so a researcher could not have
              estimated it. (The real Bill 35 study had data from before the rule: its baseline
              snapshot was taken in summer 2023, before Bill 35 was announced.) In your world the
              rule changed covered-area listings by <strong>{signed(endCov, 0)}%</strong> by the end
              of your term.
            </p>
          ) : (
            <p>
              You never switched the short-term rental rule on, so there is no effect to estimate.
            </p>
          )}
        </article>

        <article class="panel lesson">
          <h3>
            The Bill 35 lesson{' '}
            <Badge
              level="measured"
              why="Numbers from the first project (bc-str-ban-analysis README)."
            />
          </h3>
          <p>
            In the real data, covered-area entire-home listings in Greater Victoria fell about{' '}
            <strong>32%</strong> against the exempt areas when the principal-residence rule began
            (May 2024; −0.390 log points, randomization-inference p = 0.011). The listings lost
            equal about 1.7% of renter households, which caps any rent effect at −0.4% to −3.3%.
            That is below the noise in the CPI rent series: the rent effect is{' '}
            <strong>too small to detect</strong>, not shown to be zero.
          </p>
          <p>
            <a href={FIRST_PROJECT} target="_blank" rel="noopener noreferrer">
              See the evidence in the first project&apos;s dashboard
            </a>
            .
          </p>
        </article>

        <article class="panel">
          <h3>Share this city</h3>
          <p>Anyone with this link gets the same city, model variant and shocks.</p>
          <div class="share">
            <input
              type="text"
              readOnly
              value={share}
              aria-label="Shareable link"
              onFocus={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(share).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
