# Accessibility

Checklist for PLAN §6.7, verified at M7 (2026-10-11). "e2e" means a Playwright test in
`apps/web/e2e/` checks it on every run; screenshots are in `docs/screenshots/m6` and `m7`.

| Requirement                       | Status                   | How it is met / checked                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour-blind-safe palette         | done                     | Okabe-Ito colours for every meaningful series and map state (ADR 0010). `a11y.spec.ts` renders the game under protanopia, deuteranopia and tritanopia filters (Machado et al. 2009 matrices): `cvd-*.png`. Covered vs exempt listings stay distinct in all three (solid vs dashed).                                                                                                          |
| Never colour alone                | done                     | Chart series differ by dash pattern and markers as well as colour; dropped snapshots are hollow circles with a legend entry; map states differ by icon shape and luminance (greyscale check `m6/map-2x-greyscale.png`); evidence badges have an icon and a word. The tutorial names lines by style ("solid orange line", "dashed green line"), fixed in the M7 review.                       |
| Full keyboard operability         | done (e2e)               | Native controls throughout (radios, sliders, selects, buttons). Map canvas is focusable: arrows pan, + and − zoom, 0 recentres. Badges and glossary terms are buttons. `a11y.spec.ts` plays a whole term with the keyboard only: start, skip the tutorial, choose a rule with the arrow keys, end 20 turns, open the debrief.                                                                |
| Visible focus                     | done (e2e)               | `:focus-visible` draws a 3 px Okabe-Ito orange outline (contrast 3.9:1 on panels, 3.6:1 on the page background, above the 3:1 WCAG non-text minimum). e2e asserts the End turn button has an outline when focused.                                                                                                                                                                           |
| `prefers-reduced-motion`          | done (e2e)               | Map animation (water, cranes, signs, dust) and the title-screen diorama stop entirely; the HUD's budget and capital deltas appear without moving. The keyboard e2e runs with reduced motion emulated.                                                                                                                                                                                        |
| Minimum 16 px UI text             | done, with one exception | All HTML text is at least 1rem (16 px) after the M7 pass (it was 12.8-14.4 px for `small`, notes, legends, badges and the scorecard). **Exception:** chart axis tick labels are 14 SVG units, which render at about 12-16 px depending on the chart's width; the information they carry is also in each chart's text summary. Pixel-font map labels are part of the canvas image (see ARIA). |
| ARIA labels on charts             | done                     | Every chart is `role="img"` with an `aria-label` of its title plus a one-sentence takeaway computed from the data. The map canvas has `role="img"` and a label with the counts of each building state and the key bindings.                                                                                                                                                                  |
| Text alternatives for key insight | done                     | The panel "Since you took office" states the listing and rent changes in words; the scorecard is a table; the debrief states each result in prose (effect sizes, fan range, DiD error, the Bill 35 lesson).                                                                                                                                                                                  |
| Live updates announced            | done                     | Costs of the pending turn (`aria-live="polite"`), refusals (`role="alert"`), the shock card (`role="status"`), the change in budget and capital after each turn (HUD live region), debrief progress (`aria-live`).                                                                                                                                                                           |
| Text contrast                     | done                     | Computed WCAG ratios: body text 17.2:1, muted text 6.7:1 on panels (6.1:1 on the page), primary buttons 5.2:1, tooltips 17.0:1, badges 14.7:1, errors 7.9:1. The tutorial's secondary text was 4.2:1 and is now white.                                                                                                                                                                       |

## Game-feel UI pass (ADR 0012)

Checked after the HUD, tabs, briefing, title and results screens were added:

- **Tooltips** stay fully on screen and are never clipped by a scrolling column
  (`tooltips.spec.ts`, every badge and glossary term at 1366×768 and 1024×700).
- **Tabs** (Policies, City, Log) follow the WAI-ARIA tabs pattern: arrow keys, Home and End move
  and select (`game-ui.spec.ts`); inactive panels are `hidden`, so they leave the
  accessibility tree.
- **Not colour alone:** the capital pips about to be spent are striped; lever cards with a
  pending change carry a "Changed" tag; score losses are hatched bars and signed numbers;
  stakeholder moods are faces with different mouths plus the words "pleased", "wary",
  "unhappy".
- **Contrast** (computed WCAG ratios): HUD text 14.1:1, HUD labels 7.7:1, bottom-bar hint
  10.9:1, gain and loss floaters 11.0:1 and 10.0:1, green "go" button 5.7:1, selected mandate
  5.2:1, "Changed" tag 7.5:1, muted text on cream 5.5:1, inactive tabs 9.3:1, briefing 16.0:1.
  Focus rings on dark surfaces are yellow (9:1); elsewhere orange.
- **axe:** no violations on any screen after the floaters were made opaque (a fading text fails
  contrast mid-fade).

## Not verified

- **No screen-reader session.** Roles, names and live regions were checked through Playwright's
  accessibility tree, not with NVDA, JAWS or VoiceOver.
- **axe-core audit (M8): no WCAG 2.1 A/AA violations** on the start screen, About page, game
  (with tutorial and mid-term), end of term and debrief (`apps/web/e2e/axe.spec.ts`, every e2e
  run). It first flagged the pixel-art buttons: their fill is a CSS `border-image`, invisible to
  contrast checkers and lost if the image fails to load; each framed element now has a solid
  background of the same colour underneath. Lighthouse itself was not run (it would add a large
  tool for checks axe already covers); performance budgets are measured separately (README).
- **Phone layout** is a PLAN stretch goal; the layout is tested at 1366×768 only.
- The tutorial's blue background is a pixel-art image; its contrast was computed against the
  base colour `#0072b2`, not measured on the rendered image.
