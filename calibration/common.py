"""Shared helpers: paths, file hashes (identical to packages/sim/src/hash.ts), priors and distance."""
from __future__ import annotations

import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CAL = ROOT / "calibration"
PRIORS_PATH = CAL / "priors.json"
TARGETS_PATH = CAL / "inputs" / "targets.json"
REPORTS = CAL / "reports"
SIM = ROOT / "packages" / "sim" / "src"
ENSEMBLE_PATH = SIM / "params" / "ensemble.json"
DEFAULTS_PATH = SIM / "params" / "defaults.json"
SCENARIO_PATH = SIM / "scenarios" / "victoria.json"

CAL_SEEDS = (1, 2, 3, 4)
VALIDATION_SEEDS = (101, 102, 103, 104)


def fnv1a64(text: str) -> str:
    """64-bit FNV-1a over UTF-16 code units, matching fnv1a64() in packages/sim/src/hash.ts."""
    h = 0xCBF29CE484222325
    data = text.encode("utf-16-le")
    for i in range(0, len(data), 2):
        h ^= data[i] | (data[i + 1] << 8)
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def file_hash(path: Path) -> str:
    """Hash of a text file with line endings normalised to LF (stable across Windows/Linux)."""
    return fnv1a64(path.read_text(encoding="utf-8").replace("\r\n", "\n"))


def git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:  # noqa: BLE001 - metadata only
        return "unknown"


# --------------------------------------------------------------------------- priors


@dataclass(frozen=True)
class Prior:
    name: str
    dist: str
    lo: float
    hi: float

    def from_unit(self, u: np.ndarray) -> np.ndarray:
        if self.dist == "loguniform":
            return np.exp(np.log(self.lo) + u * (np.log(self.hi) - np.log(self.lo)))
        return self.lo + u * (self.hi - self.lo)

    def to_unit(self, x: np.ndarray) -> np.ndarray:
        if self.dist == "loguniform":
            return (np.log(x) - np.log(self.lo)) / (np.log(self.hi) - np.log(self.lo))
        return (x - self.lo) / (self.hi - self.lo)


def load_priors(path: Path = PRIORS_PATH) -> list[Prior]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [Prior(p["name"], p["dist"], float(p["lo"]), float(p["hi"])) for p in raw["parameters"]]


def to_overrides(priors: list[Prior], u: np.ndarray) -> dict:
    """Unit-cube point -> nested ParamOverrides dict for the sim."""
    out: dict = {}
    for p, ui in zip(priors, u):
        group, key = p.name.split(".")
        out.setdefault(group, {})[key] = float(f"{float(p.from_unit(np.array(ui))):.6g}")
    return out


# --------------------------------------------------------------------------- targets / distance


def load_targets(path: Path = TARGETS_PATH) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["targets"]


def get_moment(result: dict, name: str):
    if name.startswith("effects."):
        return (result.get("effects") or {}).get(name.split(".", 1)[1])
    return result["moments"][name]


def contributions(result: dict, targets: list[dict]) -> dict[str, float]:
    """Weighted squared standardised deviations per target (only fit + constraint roles)."""
    out: dict[str, float] = {}
    for t in targets:
        if t["role"] not in ("fit", "constraint"):
            continue
        sim = np.atleast_1d(np.asarray(get_moment(result, t["moment"]), dtype=float))
        val = np.atleast_1d(np.asarray(t["value"], dtype=float))
        z = (sim - val) / t["se"]
        out[t["id"]] = float(t["weight"] * np.sum(z * z))
    return out


def distance(result: dict, targets: list[dict]) -> float:
    d = sum(contributions(result, targets).values())
    return d if math.isfinite(d) else float("inf")
