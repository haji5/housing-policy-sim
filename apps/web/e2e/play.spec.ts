import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m2');

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

  // The covered zone's listings fell; the summary says so.
  const summary = page.getByRole('region', { name: 'Since you took office' });
  await expect(summary.getByText(/Covered-area listings/)).toBeVisible();
  const text = (await summary.textContent()) ?? '';
  const m = /Covered-arealistings(\d+)→(\d+)/.exec(text.replace(/\s+/g, ''));
  expect(m).not.toBeNull();
  expect(Number(m![2])).toBeLessThan(Number(m![1]) * 0.8);
});
