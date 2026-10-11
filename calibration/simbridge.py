"""Run the Node sim in parallel batch processes (JSON lines in, JSON lines out)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from common import CAL_SEEDS, ROOT

CLI = ROOT / "packages" / "sim" / "src" / "cli.ts"


def default_workers() -> int:
    return max(1, min(16, (os.cpu_count() or 2) - 2))


def evaluate(
    draws: list[dict],
    seeds: tuple[int, ...] = CAL_SEEDS,
    counterfactual: bool = False,
    workers: int | None = None,
    scenario: str = "victoria",
) -> list[dict]:
    """Evaluate parameter overrides. Returns one result dict per draw, in input order."""
    if not draws:
        return []
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("node not found on PATH (Node >= 24 is required)")
    workers = min(workers or default_workers(), len(draws))
    size = -(-len(draws) // workers)
    with tempfile.TemporaryDirectory(prefix="zo-batch-") as tmp:
        procs = []
        for w in range(workers):
            chunk = draws[w * size : (w + 1) * size]
            if not chunk:
                continue
            inp = Path(tmp) / f"in{w}.jsonl"
            out = Path(tmp) / f"out{w}.jsonl"
            with inp.open("w", encoding="utf-8", newline="\n") as f:
                for i, d in enumerate(chunk):
                    f.write(json.dumps({"id": w * size + i, "params": d}) + "\n")
            cmd = [node, str(CLI), "batch", "--scenario", scenario, "--in", str(inp), "--out", str(out),
                   "--seeds", ",".join(map(str, seeds))]
            if counterfactual:
                cmd.append("--counterfactual")
            procs.append((subprocess.Popen(cmd, cwd=ROOT, stderr=subprocess.PIPE, text=True), out))
        results: dict[int, dict] = {}
        for p, out in procs:
            _, err = p.communicate()
            if p.returncode != 0:
                raise RuntimeError(f"sim batch failed ({p.returncode}): {err[-2000:]}")
            for line in out.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    r = json.loads(line)
                    results[int(r["id"])] = r
    return [results[i] for i in range(len(draws))]
