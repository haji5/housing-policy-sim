import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m8');

/** Automated WCAG 2.1 A/AA audit (axe-core) of each screen: start, game, end of term, debrief. */
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = r.violations.map(
    (v) =>
      `${name}: ${v.id} (${v.impact}) ${v.help} — ${v.nodes
        .map((n) => `${n.target.join(' ')} [${n.any[0]?.message ?? ''}]`)
        .join(', ')}`,
  );
  console.log(summary.length ? summary.join('\n') : `${name}: no violations`);
  expect(summary).toEqual([]);
}

test('axe: no WCAG 2.1 AA violations on any screen', async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=5');
  await audit(page, 'start');
  await page.screenshot({ path: `${SHOTS}/start.png` });
  await page.getByRole('link', { name: 'About, data sources and licences' }).click();
  await expect(page.getByRole('heading', { name: 'About Zoned Out' })).toBeVisible();
  await expect(page.getByText(/not affiliated with or commissioned by/)).toBeVisible();
  await audit(page, 'about');
  await page.screenshot({ path: `${SHOTS}/about.png`, fullPage: true });
  await page.goto('/?seed=5');
  await page.getByTestId('start').click();
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });
  await audit(page, 'game (tutorial)');
  await page.getByRole('button', { name: 'Skip the tutorial' }).click();
  await page.getByLabel(/Principal-residence rule/).check();
  for (let turn = 1; turn <= 20; turn++) {
    await endTurn.click();
    if (turn === 8) {
      await expect(endTurn).toBeEnabled({ timeout: 15_000 });
      await audit(page, 'game (mid-term)');
    } else if (turn < 20) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
  }
  await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
  await audit(page, 'end of term');
  await page.screenshot({ path: `${SHOTS}/end-of-term.png` });
  await page.getByRole('button', { name: 'Open the debrief' }).click();
  await expect(page.getByTestId('debrief')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
  await audit(page, 'debrief');
});
