import { expect, test } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * README media: frames of one term for the GIF (assembled by scripts/make_gif.py), and stills of
 * the debrief. The GIF covers turns 1-19 through one fixed clip rectangle: the layout is stable
 * over those turns (the test checks it), so nothing jumps between frames. Turn 0 (no paper, empty
 * charts) and the end-of-term screen, where the scorecard takes the paper's place, are not turns
 * of play. Opt-in, because it is slow and only needed when the UI changes:
 *   MEDIA=1 npx playwright test e2e/media.spec.ts, then scripts/make_gif.py (see README)
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FRAMES = resolve(ROOT, 'apps/web/test-results/media-frames');
const MEDIA = resolve(ROOT, 'docs/media');

test.skip(!process.env.MEDIA, 'set MEDIA=1 to regenerate the README media');

test('README frames and stills', async ({ page }) => {
  test.setTimeout(240_000);
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  mkdirSync(MEDIA, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Tall enough that the charts and the whole map fit in the left column without scrolling.
  await page.setViewportSize({ width: 1366, height: 1180 });
  await page.goto('/?seed=1');
  await page.getByTestId('start').click();
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip the tutorial' }).click();
  let frame = 0;
  let clip: { x: number; y: number; width: number; height: number } | null = null;
  let anchor: number | null = null;
  const shot = async () => {
    await page.evaluate(() => document.querySelector('section.left')?.scrollTo(0, 0));
    const box = (await page.locator('section.left').boundingBox())!;
    const chartsTop = (await page.locator('.charts').boundingBox())!.y;
    clip ??= { x: box.x, y: box.y, width: box.width, height: 1000 };
    anchor ??= chartsTop;
    // A layout shift would make the GIF jump: fail instead of recording it.
    expect(Math.round(chartsTop)).toBe(Math.round(anchor));
    await page.screenshot({ path: `${FRAMES}/f${String(frame++).padStart(3, '0')}.png`, clip });
  };
  for (let turn = 1; turn <= 20; turn++) {
    if (turn === 3) {
      await page.getByLabel(/Principal-residence rule/).check();
      await page.getByRole('slider', { name: 'Enforcement level' }).fill('4');
      await page.getByLabel(/Buy asking-rent data/).check();
    }
    await endTurn.click();
    if (turn < 20) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
    else await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
    if (turn < 20) await shot();
  }
  await page.getByRole('button', { name: 'Open the debrief' }).click();
  const debrief = page.getByTestId('debrief');
  await expect(debrief).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await page
    .locator('.debrief article')
    .first()
    .screenshot({ path: `${MEDIA}/debrief-fans.png` });
  await page.getByTestId('did-card').screenshot({ path: `${MEDIA}/debrief-did.png` });
});
