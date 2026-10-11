import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m3');

test('play a full 20-turn term with the principal-residence rule', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=1');
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/01-start.png`, fullPage: true });

  // Two quiet turns, then introduce the rule and raise enforcement.
  for (let i = 0; i < 2; i++) {
    await endTurn.click();
    await expect(endTurn).toBeEnabled();
  }
  await page.getByLabel(/Principal-residence rule/).check();
  await page.getByRole('slider').fill('4');
  await endTurn.click();
  await expect(endTurn).toBeEnabled();
  await expect(page.getByTestId('turn')).toHaveText('4');
  await expect(
    page
      .getByRole('region', { name: 'Decisions' })
      .getByText(/STR regime set to "Principal-residence rule"/),
  ).toBeVisible();

  for (let i = 0; i < 5; i++) {
    await endTurn.click();
    await expect(endTurn).toBeEnabled();
  }
  await page.screenshot({ path: `${SHOTS}/02-mid-term.png`, fullPage: true });

  for (let turn = 9; turn <= 20; turn++) {
    await page.getByTestId('end-turn').click();
    if (turn < 20) await expect(page.getByTestId('end-turn')).toBeEnabled();
  }
  await expect(page.getByTestId('over')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-end-of-term.png`, fullPage: true });

  // Covered-area listings fell relative to exempt areas: a DiD in log points, as in the data
  // (the calibrated Phase 1 effect is about -0.4). The summary shows real-unit counts.
  const summary = page.getByRole('region', { name: 'Since you took office' });
  await expect(summary.getByText(/Covered-area listings/)).toBeVisible();
  const text = ((await summary.textContent()) ?? '').replace(/[\s,]+/g, '');
  const cov = /Covered-arealistings(\d+)→(\d+)/.exec(text);
  const ex = /Exempt-arealistings(\d+)→(\d+)/.exec(text);
  expect(cov).not.toBeNull();
  expect(ex).not.toBeNull();
  expect(Number(cov![1])).toBeGreaterThan(2500); // ~3,133 real covered listings at the start
  const did =
    Math.log(Number(cov![2]) / Number(cov![1])) - Math.log(Number(ex![2]) / Number(ex![1]));
  expect(did).toBeLessThan(-0.15);
});
