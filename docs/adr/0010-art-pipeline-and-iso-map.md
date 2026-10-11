# ADR 0010: Procedural art pipeline and the isometric map (M6)

- **Status:** accepted
- **Date:** 2026-10-11
- **Milestone:** m6

## Context

PLAN §9 asks for a small-palette isometric pixel-art city generated entirely by code (original,
reproducible, editable), an atlas PNG + JSON, an isometric renderer with pan/zoom, animations and
overlays, and a screenshot-driven review loop. WORKING_AGREEMENTS.md forbids third-party sprites and fonts
without an OFL-compatible licence.

## Decision

1. **No image dependency.** PLAN §9.2 suggests `pngjs`. `tools/art/src/png.ts` instead writes
   indexed-colour PNGs (colour type 3 with PLTE and tRNS) using only `node:zlib` (`deflateSync`,
   `crc32`), about 60 lines. No package is added.
2. **Palette.** 31 named colours plus transparency (`tools/art/src/palette.ts`). Meaningful
   overlay colours are Okabe-Ito (STR orange, principal-residence STR yellow, long-term rental
   blue, construction purple). Every building state also has its own shape and luminance:
   orange key pin (investor STR), yellow house pin (host's own home), dark padlock and dark
   windows (held empty), dark windows plus a "for rent" board (vacant for rent), scaffold and
   netting (construction), survey stakes (upzoned lot). A test checks the luminance gaps.
3. **Sprites in code.** Buildings come from iso primitives (`box`, `hipRoof`, `windows`) with
   hashed variation; markers, icons (overlay, resource, six shock cards, three evidence badges),
   effects and trees are character grids; ground tiles are procedural. 13 building types × 2
   window states, 6 construction frames, 28 ground tiles, 17 icons, 51 glyphs, 9 UI-kit pieces.
4. **Exact iso tiling.** A diamond column `dx` pixels from the tip spans `2⌊dx/2⌋+1` rows, so
   32×16 diamonds partition the plane (256 px per lattice cell). The more common `2⌊dx/2⌋+2`
   spans 288 px and makes neighbours share a row. A test tiles five diamonds and checks that every
   pixel is covered exactly once.
5. **Own pixel font.** "Zoned Out Mono", a 5×7 upper-case font drawn for this project (CC BY 4.0
   with the rest of the art), used only for the title and map labels. Body text stays in the
   system UI font (PLAN §6.7 asks for 16 px readable UI text). This avoids shipping a third-party
   font and its licence file.
6. **Representative lots.** The city is about 1,250 tiles of buildings, not one per dwelling
   (Victoria has 39,000 dwelling agents). Each lot stands for about 250 real homes (fewer for
   districts at the 16-lot floor) and shows one sampled home of its zone, taken from a fixed
   hashed order of the starting stock. So the share of lots in each state matches the zone's share
   of homes in that state, and a lot keeps its home all game. About 20% of lots per district are
   reserved for construction and show new dwellings as they are started, one lot per lot-sized
   group of new homes. The legend says so in words.
7. **Layout.** Covered zones form one mainland of districts that share border streets; exempt
   zones are islands across the water (stylised, not geographic). Density comes from the zone's
   renter share (towers downtown, houses on the islands).
8. **Renderer.** Canvas 2D (`apps/web/src/render/iso/IsoMap.tsx`), drawn back to front along the
   diagonals with integer zoom (1×, 2×, 3×) plus a 0.5× overview, culling off-screen tiles. Pan by
   drag or arrow keys, zoom by wheel, buttons or +/−. Water, cranes and "for rent" boards animate
   at 4 frames per second, and not at all under `prefers-reduced-motion`. Overlays dim the city
   and tint the ground under lots in the chosen state (STR, empty, construction).
9. **Determinism.** The atlas is byte-identical across builds (tested); the PNG is committed so
   the site builds without running the art tools (`pnpm art` regenerates it).

## Consequences

- No model change: ODD.md and ASSUMPTIONS.md are unaffected. The map is a god view of sampled
  homes; the charts remain the researcher view (ADR 0006).
- The flat placeholder map (`render/MapCanvas.tsx`) stays as a fallback (`?map=flat`).
- Licence: generated art is CC BY 4.0 (PLAN D4); code stays MIT.
