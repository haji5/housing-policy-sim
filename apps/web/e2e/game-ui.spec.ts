import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The game chrome (ADR 0012): title screen, HUD, briefing, city-hall tabs, lever cards and the
 * results card. Saves screenshots for the visual review rounds.
 */
const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/game-ui');

async function scrollTop(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('main, .right, .left').forEach((el) => el.scrollTo(0, 0));
    window.scrollTo(0, 0);
  });
}

test('title screen, HUD, briefing, tabs and results', async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=1');
  await expect(page.getByRole('heading', { name: 'Zoned Out' })).toBeVisible();
  await expect(page.locator('canvas.title-scene')).toBeVisible();
  // Mandates are cards, still plain radios underneath.
  await page.getByLabel(/Affordability first/).check();
  await page.screenshot({ path: `${SHOTS}/01-title.png` });

  await page.getByTestId('start').click();
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });
  // HUD: capital pips preview the draft's cost (striped) before the turn ends.
  await expect(page.locator('.pip.full')).toHaveCount(6);
  await page.screenshot({ path: `${SHOTS}/02-turn1.png` });
  await page.getByLabel(/Principal-residence rule/).check();
  await expect(page.locator('.pip.spend')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: /Policies/ })).toContainText('1 changed');
  await expect(page.locator('.lever-card.changed')).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/03-pending.png` });

  // End the turn: the paper reports the decision with stakeholder reactions; the HUD floats
  // the change in budget and capital.
  await endTurn.click();
  await expect(endTurn).toBeEnabled({ timeout: 15_000 });
  const paper = page.getByTestId('briefing');
  await expect(paper).toContainText('The Daily Zoning');
  await expect(paper.getByRole('heading')).toHaveText(/hosts’ own homes/);
  await expect(paper.getByRole('list', { name: 'Reactions' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.locator('.floater').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-briefing.png` });
  // With the tutorial and the paper both showing, the charts still start above the fold.
  const charts = (await page.locator('.charts').boundingBox())!;
  expect(charts.y).toBeLessThan(768 - 64 - 150);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.screenshot({ path: `${SHOTS}/04b-briefing-1024.png` });
  // The HUD stays on one row on a small laptop.
  expect((await page.locator('.hud').boundingBox())!.height).toBeLessThan(80);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Skip the tutorial' }).click();

  // Tabs work from the keyboard (arrow keys move and select).
  await page.getByRole('tab', { name: /Policies/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'City' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Since you took office' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-city-tab.png` });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('region', { name: 'Decisions' })).toContainText(
    /Principal-residence rule/,
  );
  await expect(page.getByRole('region', { name: 'Past front pages' })).toContainText(
    /hosts’ own homes/,
  );
  await page.screenshot({ path: `${SHOTS}/06-log-tab.png` });
  await page.getByRole('tab', { name: /Policies/ }).click();

  // Play on to the first shock card (seed 1: turn 9) and to the end.
  for (let turn = 2; turn <= 20; turn++) {
    await endTurn.click();
    if (turn < 20) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
    if (turn === 8) {
      await expect(page.getByRole('status').getByText(/^Shock:/)).toBeVisible();
      await scrollTop(page);
      await page.screenshot({ path: `${SHOTS}/07-shock.png` });
    }
  }
  await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId('scorecard');
  await expect(card).toContainText(/than doing nothing|as doing nothing/);
  await expect(card).toContainText(/first finished term|best on this city/);
  await scrollTop(page);
  await page.screenshot({ path: `${SHOTS}/08-results.png` });

  // Narrower window (small laptop).
  await page.setViewportSize({ width: 1024, height: 700 });
  await scrollTop(page);
  await page.screenshot({ path: `${SHOTS}/09-results-1024.png` });
});
