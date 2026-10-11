/**
 * CLI (JSON in, JSON out; this is how the Python calibration calls the sim).
 *
 *   pnpm sim run   [--scenario victoria] [--seed 1] [--policy historical] [--ticks 60] [--pre 0]
 *                  [--params p.json | --overrides o.json] [--policy-file events.json]
 *                  [--out file.json] [--summary]
 *   pnpm sim bench [--runs 20] ...
 *   pnpm sim batch --in draws.jsonl --out moments.jsonl [--seeds 1,2,3,4] [--counterfactual]
 *       Each input line: {"id": any, "params": <ParamOverrides>}. Runs the historical policy
 *       (and with --counterfactual also "none") over the calibration window for every seed, and
 *       writes {"id", "moments" (mean over seeds), "sd" (sd over seeds), "effects"?} per line.
 *   pnpm sim panel --in draws.jsonl --out panels.jsonl
 *       Each input line: {"id", "params": <ParamOverrides>, "seed"}. Runs "historical" and "none"
 *       on the same seed over the calibration window and writes the researcher-view panel at the
 *       scenario's snapshot ticks (real units): {"id", "snapshotTicks", "zones", "observed",
 *       "hist", "none", "truncated", "incomplete"}. Used by calibration/did_recovery.py (M4).
 *   pnpm sim playtest [--seeds 1,2,...] [--out results.json]
 *       Plays the five balance-playtest strategies (playtest.ts) over a full term on each seed
 *       under the game rules, against the paired no-policy run, and prints the scorecards (M5).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { computeMoments, DEFAULT_PARAMS, mergeParams, researcherPanel, runSim } from './index.ts';
import type { Moments, ParamOverrides, Params, PolicyEvent, RunOutput } from './index.ts';
import { MANDATES, OBJECTIVES } from './index.ts';
import type { MandateId } from './index.ts';
import { playGame, STRATEGIES } from './playtest.ts';

/** Calibration window: Jun 2022 (tick -15) to Jun 2026 (tick 33). */
const CAL_PRE = 15;
const CAL_TICKS = 49;

function main(argv: string[]): void {
  const [command = 'run', ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      scenario: { type: 'string', default: 'victoria' },
      seed: { type: 'string', default: '1' },
      seeds: { type: 'string', default: '1,2,3,4' },
      policy: { type: 'string', default: 'historical' },
      'policy-file': { type: 'string' },
      params: { type: 'string' },
      overrides: { type: 'string' },
      ticks: { type: 'string', default: '60' },
      pre: { type: 'string', default: '0' },
      in: { type: 'string' },
      out: { type: 'string' },
      summary: { type: 'boolean', default: false },
      counterfactual: { type: 'boolean', default: false },
      runs: { type: 'string', default: '20' },
    },
  });

  let params: Params = values.params
    ? (JSON.parse(readFileSync(values.params, 'utf8')) as Params)
    : DEFAULT_PARAMS;
  if (values.overrides)
    params = mergeParams(
      params,
      JSON.parse(readFileSync(values.overrides, 'utf8')) as ParamOverrides,
    );
  const policy: PolicyEvent[] | string = values['policy-file']
    ? (JSON.parse(readFileSync(values['policy-file'], 'utf8')) as PolicyEvent[])
    : values.policy;
  const base = {
    scenario: values.scenario,
    params,
    seed: Number(values.seed),
    policy,
    ticks: Number(values.ticks),
    preTicks: Number(values.pre),
  };

  if (command === 'bench') {
    const runs = Number(values.runs);
    runSim(base);
    const times: number[] = [];
    let agents = 0;
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      agents = runSim({ ...base, seed: base.seed + i }).meta.agents;
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)]!;
    process.stdout.write(
      `${runs} runs, ${base.ticks} ticks, ~${agents} agents: median ${med.toFixed(1)} ms, ` +
        `min ${times[0]!.toFixed(1)} ms, max ${times[times.length - 1]!.toFixed(1)} ms\n`,
    );
    return;
  }

  if (command === 'batch') {
    if (!values.in || !values.out) throw new Error('batch needs --in and --out');
    const seeds = values.seeds.split(',').map(Number);
    const lines = readFileSync(values.in, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    const outLines: string[] = [];
    for (const line of lines) {
      const draw = JSON.parse(line) as { id: unknown; params: ParamOverrides };
      const p = mergeParams(params, draw.params);
      const cal = (seed: number, pol: string) =>
        runSim({
          scenario: values.scenario,
          params: p,
          seed,
          policy: pol,
          ticks: CAL_TICKS,
          preTicks: CAL_PRE,
        });
      const runs = seeds.map((s) => cal(s, 'historical'));
      const ms = runs.map(computeMoments);
      const result: Record<string, unknown> = {
        id: draw.id,
        moments: meanMoments(ms),
        sd: sdMoments(ms),
      };
      if (values.counterfactual) {
        const effects = seeds.map((s, i) => trueEffects(runs[i]!, cal(s, 'none')));
        result.effects = meanRecords(effects);
      }
      outLines.push(JSON.stringify(result));
    }
    writeFileSync(values.out, outLines.join('\n') + '\n');
    return;
  }

  if (command === 'playtest') {
    const seeds = values.seeds.split(',').map(Number);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const rows = Object.entries(STRATEGIES).map(([id, s]) => {
      const res = seeds.map((seed) => playGame(s.play, seed, values.scenario));
      const eff = (k: keyof (typeof res)[number]['card']['effects']) =>
        mean(res.map((r) => r.card.effects[k]));
      return {
        id,
        label: s.label,
        effects: {
          rentBurdenPp: eff('rentBurdenPp'),
          stressed: eff('stressed'),
          stressRatePp: eff('stressRatePp'),
          completions: eff('completions'),
          strListingsPct: eff('strListingsPct'),
          askingRentPct: eff('askingRentPct'),
          fiscalBalance: mean(res.map((r) => r.card.fiscalBalance)),
          capital: mean(res.map((r) => r.card.capital)),
        },
        points: Object.fromEntries(
          OBJECTIVES.map((k) => [k, mean(res.map((r) => r.card.points[k]))]),
        ),
        composite: Object.fromEntries(
          (Object.keys(MANDATES) as MandateId[]).map((m) => [
            m,
            mean(res.map((r) => r.composite[m])),
          ]),
        ),
        refusedTurns: mean(res.map((r) => r.refused)),
        perSeedComposite: res.map((r) => r.composite),
      };
    });
    // Pareto check over the six objectives (mean points).
    const dominated = rows.map((a) =>
      rows
        .filter(
          (b) =>
            b !== a &&
            OBJECTIVES.every((k) => b.points[k]! >= a.points[k]!) &&
            OBJECTIVES.some((k) => b.points[k]! > a.points[k]!),
        )
        .map((b) => b.id),
    );
    const f = (v: number, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
    const lines = [
      `Playtest: ${seeds.length} seeds (${seeds.join(',')}), scenario ${values.scenario}`,
      '',
    ];
    lines.push(
      'strategy      rentBurden pp  stressed  stressRate pp  completions  STR %  askRent %  fiscal $M  capital',
    );
    for (const r of rows)
      lines.push(
        `${r.id.padEnd(12)} ${f(r.effects.rentBurdenPp, 2).padStart(13)} ${f(r.effects.stressed, 0).padStart(9)} ${f(r.effects.stressRatePp, 2).padStart(14)} ${f(r.effects.completions, 0).padStart(12)} ${f(r.effects.strListingsPct).padStart(6)} ${f(r.effects.askingRentPct, 2).padStart(10)} ${f(r.effects.fiscalBalance).padStart(10)} ${r.effects.capital.toFixed(1).padStart(8)}`,
      );
    lines.push('', 'Mandate scores (mean points; best per mandate marked *):');
    lines.push(
      'strategy     ' + (Object.keys(MANDATES) as MandateId[]).map((m) => m.padStart(14)).join(''),
    );
    const best = Object.fromEntries(
      (Object.keys(MANDATES) as MandateId[]).map((m) => [
        m,
        rows.reduce((a, b) => (b.composite[m]! > a.composite[m]! ? b : a)).id,
      ]),
    );
    for (const r of rows)
      lines.push(
        r.id.padEnd(12) +
          ' ' +
          (Object.keys(MANDATES) as MandateId[])
            .map((m) => (f(r.composite[m]!, 2) + (best[m] === r.id ? '*' : ' ')).padStart(14))
            .join(''),
      );
    lines.push('', 'Pareto dominance over the six objectives:');
    rows.forEach((r, i) =>
      lines.push(
        `  ${r.id}: ${dominated[i]!.length ? 'dominated by ' + dominated[i]!.join(', ') : 'not dominated'}`,
      ),
    );
    process.stdout.write(lines.join('\n') + '\n');
    if (values.out)
      writeFileSync(values.out, JSON.stringify({ seeds, rows, best, dominated }, null, 1));
    return;
  }

  if (command === 'panel') {
    if (!values.in || !values.out) throw new Error('panel needs --in and --out');
    const lines = readFileSync(values.in, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    const outLines: string[] = [];
    for (const line of lines) {
      const draw = JSON.parse(line) as { id: unknown; params: ParamOverrides; seed: number };
      const p = mergeParams(params, draw.params);
      const cal = (pol: string) =>
        runSim({
          scenario: values.scenario,
          params: p,
          seed: draw.seed,
          policy: pol,
          ticks: CAL_TICKS,
          preTicks: CAL_PRE,
        });
      const hist = cal('historical');
      const none = cal('none');
      const ticks = hist.meta.observation?.snapshotTicks;
      if (!ticks) throw new Error(`Scenario "${values.scenario}" has no observation calendar`);
      const obs = researcherPanel(hist, draw.seed, ticks);
      outLines.push(
        JSON.stringify({
          id: draw.id,
          snapshotTicks: ticks,
          zones: hist.series.zones.map((z) => ({
            name: z.name,
            covered: z.covered,
            ...(z.optInTick !== undefined ? { optInTick: z.optInTick } : {}),
          })),
          observed: obs.observed,
          hist: obs.truth,
          none: researcherPanel(none, draw.seed, ticks).truth,
          truncated: obs.truncated,
          incomplete: obs.incomplete,
        }),
      );
    }
    writeFileSync(values.out, outLines.join('\n') + '\n');
    return;
  }

  if (command !== 'run')
    throw new Error(`Unknown command "${command}" (expected run | bench | batch | panel)`);
  const out = runSim(base);
  if (values.summary) process.stdout.write(summarise(out));
  else if (values.out) writeFileSync(values.out, JSON.stringify(out));
  else process.stdout.write(JSON.stringify(out) + '\n');
}

type Num = number | number[];

function meanRecords<T extends object>(xs: T[]): T {
  const out: Record<string, Num> = {};
  for (const [k, v] of Object.entries(xs[0]!) as [string, Num][]) {
    if (Array.isArray(v))
      out[k] = v.map(
        (_, j) =>
          xs.reduce((a, x) => a + ((x as Record<string, number[]>)[k]![j] ?? 0), 0) / xs.length,
      );
    else out[k] = xs.reduce((a, x) => a + (x as Record<string, number>)[k]!, 0) / xs.length;
  }
  return out as T;
}

function meanMoments(ms: Moments[]): Moments {
  return meanRecords(ms);
}

function sdMoments(ms: Moments[]): Moments {
  const m = meanRecords(ms) as unknown as Record<string, Num>;
  const sq = ms.map((x) => {
    const r: Record<string, Num> = {};
    for (const [k, v] of Object.entries(x) as [string, Num][]) {
      const mk = m[k]!;
      r[k] = Array.isArray(v)
        ? v.map((y, j) => (y - (mk as number[])[j]!) ** 2)
        : (v - (mk as number)) ** 2;
    }
    return r;
  });
  const n = Math.max(1, ms.length - 1);
  const v = meanRecords(sq);
  const out: Record<string, Num> = {};
  for (const [k, x] of Object.entries(v)) {
    out[k] = Array.isArray(x)
      ? x.map((y) => Math.sqrt((y * ms.length) / n))
      : Math.sqrt((x * ms.length) / n);
  }
  return out as unknown as Moments;
}

/**
 * True causal effects of the historical policy at the last snapshot, from a paired (same-seed)
 * no-policy run: covered listings, exempt listings, asking-rent and CPI-style index. Also two
 * levels of the policy run for sensitivity analysis: the end rent-burden share and completions over
 * the window (real units).
 */
function trueEffects(hist: RunOutput, none: RunOutput): Record<string, number> {
  const end = hist.series.tick.length - 1;
  const sum = (o: RunOutput, pred: (z: RunOutput['series']['zones'][number]) => boolean) =>
    o.series.zones.reduce((a, z) => a + (pred(z) ? z.strListings[end]! : 0), 0);
  const cov = (z: { covered: boolean }) => z.covered;
  const never = (z: { covered: boolean; optInTick?: number }) =>
    !z.covered && z.optInTick === undefined;
  return {
    coveredListings: Math.log(Math.max(1, sum(hist, cov)) / Math.max(1, sum(none, cov))),
    exemptListings: Math.log(Math.max(1, sum(hist, never)) / Math.max(1, sum(none, never))),
    askingRent: Math.log(hist.series.askingRentIndex[end]! / none.series.askingRentIndex[end]!),
    cpiRent: Math.log(hist.series.cpiRentIndex[end]! / none.series.cpiRentIndex[end]!),
    rentBurden: hist.series.rentBurdenShare[end]!,
    completions:
      hist.series.zones.reduce((a, z) => a + z.completions.reduce((x, y) => x + y, 0), 0) /
      hist.meta.scale,
  };
}

function summarise(out: RunOutput): string {
  const s = out.series;
  const lines: string[] = [];
  const zoneHeads = s.zones.map((z) => `${z.name.slice(0, 9)}${z.covered ? '*' : ''}`.padStart(11));
  lines.push(
    `scenario=${out.meta.scenario} seed=${out.meta.seed} agents=${out.meta.agents} params=${out.meta.paramsHash}`,
    `policy=${JSON.stringify(out.meta.policy)}`,
    `STR listings by zone (* = covered when a rule is on), rents, households:`,
    `  date   ${zoneHeads.join('')}  askIdx  cpiIdx  search  dbl  gone`,
  );
  for (let t = 0; t < s.tick.length; t += 3) {
    const zs = s.zones.map((z) => String(z.strListings[t]).padStart(11)).join('');
    lines.push(
      `  ${s.date[t]}${zs}  ${s.askingRentIndex[t]!.toFixed(1).padStart(6)}  ${s.cpiRentIndex[t]!.toFixed(1).padStart(6)}` +
        `  ${String(s.searching[t]).padStart(6)} ${String(s.doubledUp[t]).padStart(4)} ${String(s.gone[t]).padStart(5)}`,
    );
  }
  return lines.join('\n') + '\n';
}

main(process.argv.slice(2));
