import { expect, test } from '@playwright/test';

/**
 * PLAN §11 budgets that only a browser can measure, and the privacy promise (PLAN §10 M8: no
 * analytics): every request the game makes goes to its own origin.
 */
test('first interaction budget and no third-party requests', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const origins = new Set<string>();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'http:' || u.protocol === 'https:') origins.add(u.origin);
  });

  await page.goto('/?seed=4');
  const start = page.getByTestId('start');
  await expect(start).toBeEnabled();
  // Navigation start -> start screen interactive (PLAN §11: first interaction < 2 s).
  const interactive = await page.evaluate(() => performance.now());
  console.log(`start screen interactive after ${interactive.toFixed(0)} ms`);
  expect(interactive).toBeLessThan(2000);

  const t0 = Date.now();
  await start.click();
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 30_000 });
  console.log(`city built (worker init incl. 24-month spin-up) in ${Date.now() - t0} ms`);

  const t1 = Date.now();
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 15_000 });
  console.log(`one turn (3 months, player + no-policy runs) in ${Date.now() - t1} ms`);

  expect([...origins]).toEqual([new URL(baseURL!).origin]);
});
