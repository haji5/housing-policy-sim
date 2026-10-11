// Runs calibration/run.py with whichever Python 3.10-3.13 is available (py launcher on Windows,
// python3 elsewhere). Usage: node scripts/py.mjs <task> [args...]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runPy = fileURLToPath(new URL('../calibration/run.py', import.meta.url));
const args = process.argv.slice(2);
const candidates =
  process.platform === 'win32'
    ? [
        ['py', ['-3.11']],
        ['py', ['-3.13']],
        ['py', ['-3.12']],
        ['python', []],
      ]
    : [
        ['python3.11', []],
        ['python3', []],
        ['python', []],
      ];

for (const [cmd, pre] of candidates) {
  const probe = spawnSync(cmd, [
    ...pre,
    '-c',
    'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] < (3,14) else 1)',
  ]);
  if (probe.status !== 0) continue;
  const r = spawnSync(cmd, [...pre, runPy, ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
console.error('No Python 3.10-3.13 found. Install one, then run: node scripts/py.mjs setup');
process.exit(1);
