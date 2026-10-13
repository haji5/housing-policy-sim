import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * README media: frames of one term for the GIF (assembled by scripts/make_gif.py)
 * and a debrief still. Opt-in, because it is slow and only needed when the UI changes:
 *   MEDIA=1 npx playwright test e2e/media.spec.ts && node scripts/py.mjs ... (see README)
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FRAMES = resolve(ROOT, 'apps/web/test-results/media-frames');
const MEDIA = resolve(ROOT, 'docs/media');

test.skip(!process.env.MEDIA, 'set MEDIA=1 to regenerate the README media');

test('README frames and stills', async ({ page }) => {
  test.setTimeout(240_000);
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
  const left = page.locator('section.left');
  let frame = 0;
  const shot = async () =>
    left.screenshot({ path: `${FRAMES}/f${String(frame++).padStart(3, '0')}.png` });
  await shot();
  for (let turn = 1; turn <= 20; turn++) {
    if (turn === 3) {
      await page.getByLabel(/Principal-residence rule/).check();
      await page.getByRole('slider', { name: 'Enforcement level' }).fill('4');
      await page.getByLabel(/Buy asking-rent data/).check();
    }
    await endTurn.click();
    if (turn < 20) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
    else await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.querySelector('section.left')?.scrollTo(0, 0));
    await shot();
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
