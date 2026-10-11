import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m7');

/** Scroll the scrolling containers back to the top before a screenshot. */
async function scrollTop(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('main, .right, .left').forEach((el) => el.scrollTo(0, 0));
    window.scrollTo(0, 0);
  });
}

test('onboarding, evidence badges, glossary and the debrief', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=1');
  await page.getByTestId('start').click();
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });

  // Tutorial: tip 1, dismiss it, tip 2 arrives with the next turn.
  const tutorial = page.getByTestId('tutorial');
  await expect(tutorial).toContainText('Tip 1 of 4');
  await page.screenshot({ path: `${SHOTS}/01-tutorial.png` });
  await tutorial.getByRole('button', { name: 'Got it' }).click();
  await expect(tutorial).toHaveCount(0);
  await endTurn.click();
  await expect(endTurn).toBeEnabled();
  await expect(tutorial).toContainText('Tip 2 of 4');

  // Evidence badges on all six levers and both charts; tooltips open on focus.
  const levers = page.getByRole('region', { name: 'Policy levers' });
  await expect(levers.getByRole('button', { name: /^Evidence:/ })).toHaveCount(6);
  await expect(levers.getByRole('button', { name: 'Evidence: Measured here' })).toHaveCount(2);
  await levers.getByRole('button', { name: 'Evidence: Assumed' }).first().focus();
  await expect(page.getByRole('tooltip')).toContainText(/Assumed\./);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', { name: 'All-tenant (CPI) rent: definition' }).focus();
  await expect(page.getByRole('tooltip')).toContainText(/consumer price index/);
  await page.screenshot({ path: `${SHOTS}/02-badges-glossary.png` });
  await page.keyboard.press('Escape');

  // The rule from turn 2 on, the registry later, so the DiD card has something to estimate.
  await page.getByRole('button', { name: 'Skip the tutorial' }).click();
  await page.getByLabel(/Principal-residence rule/).check();
  await page.getByRole('slider', { name: 'Enforcement level' }).fill('3');
  for (let turn = 2; turn <= 20; turn++) {
    await endTurn.click();
    if (turn < 20) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
  }
  await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Open the debrief' }).click();
  const debrief = page.getByTestId('debrief');
  await expect(debrief).toBeVisible();
  await expect(debrief).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  console.log(`debrief: 32 variants x 2 runs ready in ${Date.now() - t0} ms`);

  // The player's own variant, replayed by the debrief workers, reproduces "your world" exactly.
  const gap = Number(await debrief.getAttribute('data-own-variant-gap'));
  expect(gap).toBeLessThan(1e-9);

  // DiD card: estimate and truth are both clearly negative, and the error is of the size
  // VALIDATION §3 reports for single runs (|error| well under 0.3 log points).
  const card = page.getByTestId('did-card');
  const est = Number((await card.getByTestId('did-estimate').textContent())!.replace('−', '-'));
  const truth = Number((await card.getByTestId('did-truth').textContent())!.replace('−', '-'));
  expect(truth).toBeLessThan(-0.1);
  expect(est).toBeLessThan(-0.1);
  expect(Math.abs(est - truth)).toBeLessThan(0.3);
  // Honesty rule: rents are "too small to detect", never "no effect".
  await expect(debrief).toContainText('too small to detect');
  await expect(debrief).not.toContainText(/no effect/i);

  await scrollTop(page);
  await page.screenshot({ path: `${SHOTS}/03-debrief.png` });
  // The debrief scrolls inside <main>: a tall viewport shows all of it in one image.
  await page.setViewportSize({ width: 1366, height: 2600 });
  await page.screenshot({ path: `${SHOTS}/04-debrief-full.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/05-debrief-did.png` });

  // Back to the city and to the debrief again (the runs are not repeated).
  await page.getByRole('button', { name: 'Back to the city' }).click();
  await expect(page.getByTestId('scorecard')).toBeVisible();
});
