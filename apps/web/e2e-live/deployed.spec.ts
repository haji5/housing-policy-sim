import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m8');

/** Every `url(...)` in the page's own stylesheets, resolved against the stylesheet. */
async function cssUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    for (const sheet of Array.from(document.styleSheets)) {
      const base = sheet.href ?? document.baseURI;
      for (const rule of Array.from(sheet.cssRules)) {
        for (const m of rule.cssText.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          if (!m[1]!.startsWith('data:')) out.add(new URL(m[1]!, base).href);
        }
      }
    }
    return [...out];
  });
}

/** Scroll the scrolling containers back to the top before a screenshot. */
async function scrollTop(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('main, .right, .left').forEach((el) => el.scrollTo(0, 0));
    window.scrollTo(0, 0);
  });
}

test('the deployed site works from a clean browser', async ({ page, baseURL }) => {
  test.setTimeout(300_000);
  mkdirSync(SHOTS, { recursive: true });
  const site = new URL(baseURL!);

  // Collect everything that could go wrong quietly: console errors, uncaught exceptions,
  // failed or non-2xx requests, and any request that leaves the site's origin or base path.
  const consoleErrors: string[] = [];
  const failures: string[] = [];
  const offsite: string[] = [];
  const loaded = new Set<string>();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failures.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    if (u.origin !== site.origin || !u.pathname.startsWith(site.pathname)) offsite.push(r.url());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(`${r.url()} HTTP ${r.status()}`);
    else loaded.add(new URL(r.url()).pathname);
  });

  // Start screen (relative URLs keep the /housing-policy-sim/ base path).
  await page.goto('?seed=1');
  await expect(page.getByRole('heading', { name: 'Zoned Out' })).toBeVisible();
  await expect(page.getByTestId('start')).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/live-01-start.png` });

  // Every image the stylesheets reference resolves under the base path and loads.
  const urls = await cssUrls(page);
  expect(urls.length).toBeGreaterThan(5);
  for (const u of urls) {
    expect(u.startsWith(site.href), `${u} is under ${site.href}`).toBe(true);
    const res = await page.request.get(u);
    expect(res.status(), u).toBe(200);
    expect(res.headers()['content-type'], u).toBe('image/png');
  }

  // Play a full 20-turn term with the rule on from turn 2.
  await page.getByTestId('start').click();
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/live-02-game.png` });
  // The map fetched the atlas from under the base path.
  expect([...loaded].some((p) => p === `${site.pathname}atlas/atlas.png`)).toBe(true);
  await page.getByRole('button', { name: 'Skip the tutorial' }).click();
  await endTurn.click();
  await expect(endTurn).toBeEnabled({ timeout: 15_000 });
  await page.getByLabel(/Principal-residence rule/).check();
  await page.getByRole('slider', { name: 'Enforcement level' }).fill('3');
  for (let turn = 2; turn <= 20; turn++) {
    await endTurn.click();
    if (turn < 20) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
    if (turn === 10) await page.screenshot({ path: `${SHOTS}/live-03-midterm.png` });
  }
  await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('scorecard')).toBeVisible();
  await scrollTop(page);
  await page.screenshot({ path: `${SHOTS}/live-04-scorecard.png` });

  // The debrief opens and its workers finish.
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Open the debrief' }).click();
  const debrief = page.getByTestId('debrief');
  await expect(debrief).toHaveAttribute('data-ready', 'true', { timeout: 120_000 });
  console.log(`live debrief ready in ${Date.now() - t0} ms`);
  expect(Number(await debrief.getAttribute('data-own-variant-gap'))).toBeLessThan(1e-9);
  await expect(debrief).toContainText('too small to detect');
  await expect(debrief).not.toContainText(/no effect/i);
  await scrollTop(page);
  await page.screenshot({ path: `${SHOTS}/live-05-debrief.png` });
  await page.setViewportSize({ width: 1366, height: 2600 });
  await page.screenshot({ path: `${SHOTS}/live-06-debrief-full.png` });
  await page.setViewportSize({ width: 1366, height: 768 });

  // About page, reached through the start screen's link.
  await page.goto('?seed=1');
  await page.getByRole('link', { name: /About, data sources and licences/ }).click();
  await expect(page).toHaveURL(`${site.href}about.html`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((i) => !i.complete || i.naturalWidth === 0)
      .map((i) => i.src),
  );
  expect(broken).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/live-07-about.png`, fullPage: true });
  await page.getByRole('link', { name: /Back to the game/ }).click();
  await expect(page.getByTestId('start')).toBeEnabled();

  // The art preview page is published too: it fetches the atlas relative to the base path and
  // draws one canvas per sprite.
  await page.goto('art-preview.html');
  await expect(page.locator('canvas.sprite').first()).toBeVisible();
  expect(await page.locator('canvas.sprite').count()).toBeGreaterThan(50);
  await page.screenshot({ path: `${SHOTS}/live-08-art-preview.png` });

  console.log(`requests loaded: ${loaded.size}`);
  expect(consoleErrors).toEqual([]);
  expect(failures).toEqual([]);
  expect(offsite).toEqual([]);
});
