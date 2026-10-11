import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ZONES = [
  'Downtown & James Bay',
  'Inner Victoria & Esquimalt',
  'Saanich & Oak Bay',
  'Westshore & Sooke',
  'Saanich Peninsula',
];
/** Scroll both layout columns back to the top before a screenshot. */
async function scrollTop(page: Page): Promise<void> {
  for (const sel of ['.left', '.right'])
    await page.locator(sel).evaluate((el) => el.scrollTo(0, 0));
}

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m6');

test('play a full 20-turn term with the principal-residence rule', async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=1');
  await expect(page.getByRole('heading', { name: 'Zoned Out' })).toBeVisible();
  await page.getByLabel(/Affordability first/).check();
  await page.screenshot({ path: `${SHOTS}/00-setup.png` });
  await page.getByTestId('start').click();

  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled();
  await expect(page.getByTestId('budget')).toHaveText('$8.0M');
  await page.screenshot({ path: `${SHOTS}/01-start.png` });

  // Two quiet turns, then introduce the rule, raise enforcement and buy the rent data.
  for (let i = 0; i < 2; i++) {
    await endTurn.click();
    await expect(endTurn).toBeEnabled();
  }
  await page.getByLabel(/Principal-residence rule/).check();
  await page.getByRole('slider', { name: 'Enforcement level' }).fill('4');
  await page.getByLabel(/Buy asking-rent data/).check();
  await expect(page.getByText(/This quarter costs/)).toContainText('3 of 10');
  await endTurn.click();
  await expect(endTurn).toBeEnabled();
  await expect(page.getByTestId('turn')).toHaveText('4');
  await expect(
    page
      .getByRole('region', { name: 'Decisions' })
      .getByText(/STR regime set to "Principal-residence rule"/),
  ).toBeVisible();
  // The STR rules are now in their legislative cooldown.
  await expect(page.getByText(/locked for 3 more turns/)).toBeVisible();

  // Asking for more capital than the player has is refused and blocks the turn.
  for (const zone of ZONES) await page.getByLabel(zone, { exact: true }).selectOption('2');
  await expect(page.getByRole('alert').first()).toHaveText(/Not enough political capital/);
  await expect(endTurn).toBeDisabled();
  for (const zone of ZONES.slice(1)) await page.getByLabel(zone, { exact: true }).selectOption('0');
  await expect(endTurn).toBeEnabled();

  for (let i = 0; i < 5; i++) {
    await endTurn.click();
    await expect(endTurn).toBeEnabled();
  }
  await expect(page.getByText('Asking rents (bought data)')).toBeVisible();
  // Seed 1 draws a migration surge at the start of turn 9.
  await expect(page.getByRole('status').getByText(/Shock: Migration surge/)).toBeVisible();
  await scrollTop(page);
  await page.screenshot({ path: `${SHOTS}/02-mid-term.png` });

  for (let turn = 9; turn <= 20; turn++) {
    await endTurn.click();
    if (turn < 20) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
  }
  // The last turn also scores the term (both runs' outcomes): allow for a slow machine.
  await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId('scorecard');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('composite')).toHaveText(/^[+−±]\d+\.\d\d$/);
  await scrollTop(page);
  await page.screenshot({ path: `${SHOTS}/03-end-of-term.png` });

  // Covered-area listings fell relative to exempt areas in the scraped counts: a DiD in log
  // points, as in the data (the calibrated Phase 1 effect is about -0.4).
  const summary = page.getByRole('region', { name: 'Since you took office' });
  const text = ((await summary.textContent()) ?? '').replace(/[\s,]+/g, '');
  const cov = /Covered-arealistings(\d+)→(\d+)/.exec(text);
  const ex = /Exempt-arealistings(\d+)→(\d+)/.exec(text);
  expect(cov).not.toBeNull();
  expect(ex).not.toBeNull();
  expect(Number(cov![1])).toBeGreaterThan(2000); // ~3,100 real covered listings at the start
  const did =
    Math.log(Number(cov![2]) / Number(cov![1])) - Math.log(Number(ex![2]) / Number(ex![1]));
  expect(did).toBeLessThan(-0.15);
});
