"""Assemble the README GIF from the frames written by apps/web/e2e/media.spec.ts.

Uses Pillow, which matplotlib (pinned in calibration/requirements.txt) already installs, so no
new dependency. Run with the calibration venv:

    calibration/.venv/Scripts/python.exe scripts/make_gif.py      (Windows)
    calibration/.venv/bin/python scripts/make_gif.py              (macOS/Linux)
"""
from __future__ import annotations

import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRAMES = ROOT / "apps/web/test-results/media-frames"
OUT = ROOT / "docs/media/zoned-out.gif"


def main() -> int:
    paths = sorted(FRAMES.glob("f*.png"))
    if not paths:
        print(f"No frames in {FRAMES}: run MEDIA=1 npx playwright test e2e/media.spec.ts first")
        return 1
    # Native size: resampling pixel art blurs it and makes the GIF larger (smoothed edges add
    # colours). A palette per frame: a shared one shifted the Okabe-Ito colours (green -> blue).
    q = [
        Image.open(p).convert("RGB").quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        for p in paths
    ]
    durations = [1200] + [450] * (len(q) - 2) + [3000]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    q[0].save(OUT, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True)
    print(f"wrote {OUT} ({len(q)} frames, {OUT.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
