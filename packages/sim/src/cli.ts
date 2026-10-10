/**
 * CLI: `pnpm sim run --scenario two-zone --seed 1 --policy historical [--ticks 60]
 *       [--params file.json] [--policy-file events.json] [--out file.json] [--summary]`
 *       `pnpm sim bench [--runs 20]`
 *
 * Prints the run's JSON time series to stdout (or --out). --summary prints a readable table.
 * JSON in (params / policy files), JSON out: this is how the Python calibration calls the sim.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_PARAMS, runSim } from './index.ts';
import type { Params, PolicyEvent, RunOutput } from './index.ts';

function main(argv: string[]): void {
  const [command = 'run', ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      scenario: { type: 'string', default: 'two-zone' },
      seed: { type: 'string', default: '1' },
      policy: { type: 'string', default: 'historical' },
      'policy-file': { type: 'string' },
      params: { type: 'string' },
      ticks: { type: 'string', default: '60' },
      out: { type: 'string' },
      summary: { type: 'boolean', default: false },
      runs: { type: 'string', default: '20' },
    },
  });

  const params: Params = values.params
    ? (JSON.parse(readFileSync(values.params, 'utf8')) as Params)
    : DEFAULT_PARAMS;
  const policy: PolicyEvent[] | string = values['policy-file']
    ? (JSON.parse(readFileSync(values['policy-file'], 'utf8')) as PolicyEvent[])
    : values.policy;
  const base = {
    scenario: values.scenario,
    params,
    seed: Number(values.seed),
    policy,
    ticks: Number(values.ticks),
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
  if (command !== 'run') throw new Error(`Unknown command "${command}" (expected run | bench)`);

  const out = runSim(base);
  if (values.summary) process.stdout.write(summarise(out));
  else if (values.out) writeFileSync(values.out, JSON.stringify(out));
  else process.stdout.write(JSON.stringify(out) + '\n');
}

function summarise(out: RunOutput): string {
  const s = out.series;
  const lines: string[] = [];
  const zoneHeads = s.zones.map((z) => `${z.name}${z.covered ? '*' : ''}`.padStart(10));
  lines.push(
    `scenario=${out.meta.scenario} seed=${out.meta.seed} agents=${out.meta.agents} params=${out.meta.paramsHash}`,
    `policy=${JSON.stringify(out.meta.policy)}`,
    `STR listings by zone (* = covered when a rule is on), rents, households:`,
    `  date   ${zoneHeads.join('')}  askIdx  cpiIdx  search  dbl  gone`,
  );
  for (let t = 0; t < s.tick.length; t += 3) {
    const zs = s.zones.map((z) => String(z.strListings[t]).padStart(10)).join('');
    lines.push(
      `  ${s.date[t]}${zs}  ${s.askingRentIndex[t]!.toFixed(1).padStart(6)}  ${s.cpiRentIndex[t]!.toFixed(1).padStart(6)}` +
        `  ${String(s.searching[t]).padStart(6)} ${String(s.doubledUp[t]).padStart(4)} ${String(s.gone[t]).padStart(5)}`,
    );
  }
  return lines.join('\n') + '\n';
}

main(process.argv.slice(2));
