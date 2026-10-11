"""Cross-platform task runner for the calibration pipeline (PLAN D9: replaces `make`).

    python calibration/run.py setup        # create calibration/.venv and install pinned deps
    python calibration/run.py calibrate    # full calibration -> packages/sim/src/params/ensemble.json
    python calibration/run.py smoke        # tiny calibration for CI (does not touch the ensemble)
    python calibration/run.py validate     # PLAN §8.1-8.2 checks -> calibration/reports/validation.md
    python calibration/run.py sobol        # Sobol indices (PLAN §8.1) -> calibration/reports/sobol.md

Extra arguments after the task are passed through, e.g. `calibrate --stage1 2048`.
`pnpm calibrate` / `pnpm validate` call this through scripts/py.mjs.
"""
from __future__ import annotations

import os
import subprocess
import sys
import venv
from pathlib import Path

CAL = Path(__file__).resolve().parent
VENV = CAL / ".venv"
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

TASKS = {
    "calibrate": ["calibrate.py"],
    "smoke": ["calibrate.py", "--smoke"],
    "validate": ["validate.py"],
    "did": ["did_recovery.py"],
    "sobol": ["sobol.py"],
}


def setup() -> int:
    if not PY.exists():
        venv.create(VENV, with_pip=True)
    return subprocess.call([str(PY), "-m", "pip", "install", "--disable-pip-version-check", "-q",
                            "-r", str(CAL / "requirements.txt")])


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in (*TASKS, "setup"):
        print(__doc__)
        return 2
    task, extra = sys.argv[1], sys.argv[2:]
    if task == "setup":
        return setup()
    if not PY.exists():
        print("calibration/.venv missing: running setup first", flush=True)
        if setup():
            return 1
    return subprocess.call([str(PY), *TASKS[task], *extra], cwd=CAL)


if __name__ == "__main__":
    sys.exit(main())
