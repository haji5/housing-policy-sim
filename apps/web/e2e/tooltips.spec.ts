import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Every tooltip (evidence badges and glossary terms) opens fully inside the viewport, whichever
 * column or panel its trigger sits in. Regression test for tips clipped at the right edge of the
 * levers column.
 */
async function checkAllTips(page: Page, where: string) {
  const triggers = page.locator('button.badge:visible, button.term:visible');
  const n = await triggers.count();
  expect(n, `${where}: tooltip triggers`).toBeGreaterThan(3);
  const vp = page.viewportSize()!;
  for (let i = 0; i < n; i++) {
    const t = triggers.nth(i);
    await t.scrollIntoViewIfNeeded();
    await t.focus();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    // Wait for the measured placement (the first frame is hidden while it is measured).
    await expect(tip).toHaveCSS('visibility', 'visible');
    const box = (await tip.boundingBox())!;
    const name = (await t.getAttribute('aria-label')) ?? `#${i}`;
    // On <body>, so no scrolling column (overflow: auto) can clip it.
    expect(await tip.evaluate((el) => el.parentElement === document.body), name).toBe(true);
    expect(box.x, `${where}: ${name} left edge`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${where}: ${name} top edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${where}: ${name} right edge`).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height, `${where}: ${name} bottom edge`).toBeLessThanOrEqual(vp.height);
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
  }
  return n;
}

for (const vp of [
  { width: 1366, height: 768 },
  { width: 1024, height: 700 },
]) {
  test(`tooltips stay on screen at ${vp.width}x${vp.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await page.goto('/?seed=1');
    await page.getByTestId('start').click();
    const endTurn = page.getByTestId('end-turn');
    await expect(endTurn).toBeEnabled({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Skip the tutorial' }).click();
    // One turn so the charts and the city panel have data and their tips are present.
    await endTurn.click();
    await expect(endTurn).toBeEnabled({ timeout: 15_000 });
    await checkAllTips(page, 'game');
  });
}
