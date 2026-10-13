import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m6');

test('isometric map: zoom levels, overlays, keyboard pan, sprite preview', async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=3');
  await page.getByTestId('start').click();
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });
  // A few turns with the rule on and some upzoning so the map has every state.
  await page.getByLabel(/Principal-residence rule/).check();
  await page.getByLabel('Inner Victoria & Esquimalt', { exact: true }).selectOption('2');
  const map = page.locator('.isomap');
  const canvas = map.locator('canvas').first();
  for (let i = 0; i < 8; i++) {
    await endTurn.click();
    await expect(endTurn).toBeEnabled({ timeout: 15_000 });
    if (i === 0) {
      // The rule's first quarter: some buildings stop short-term renting and get the stamp.
      await expect(canvas).toHaveAttribute('aria-label', /[1-9]\d* stopped short-term renting/);
      await map.scrollIntoViewIfNeeded();
      await map.getByRole('button', { name: 'Zoom out' }).click();
      await map.screenshot({ path: `${SHOTS}/map-delist-overview.png` });
      await map.getByLabel('Overlay').selectOption('str');
      await map.screenshot({ path: `${SHOTS}/map-delist-str-overlay.png` });
      await map.getByLabel('Overlay').selectOption('none');
      await map.getByRole('button', { name: 'Zoom in' }).click();
    }
  }
  await map.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveAttribute('aria-label', /each building stands for about \d+ homes/);
  await expect(canvas).toHaveAttribute('aria-label', /\d+ stopped short-term renting this quarter/);
  // Drawn 1:1: a rescaled canvas drops pixel columns from sprites and the pixel font.
  const sizes = await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.clientWidth]);
  expect(sizes[0]).toBe(sizes[1]);
  await map.screenshot({ path: `${SHOTS}/map-1x.png` });

  await map.getByRole('button', { name: 'Zoom in' }).click();
  await map.screenshot({ path: `${SHOTS}/map-2x.png` });
  await map.getByRole('button', { name: 'Zoom in' }).click();
  await map.screenshot({ path: `${SHOTS}/map-3x.png` });
  await expect(map.getByRole('button', { name: 'Zoom in' })).toBeDisabled();

  // Keyboard: focus the canvas, pan, back to overview.
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('0');
  for (let i = 0; i < 3; i++) await page.keyboard.press('-');
  await map.screenshot({ path: `${SHOTS}/map-overview.png` });

  for (const [value, name] of [
    ['str', 'overlay-str'],
    ['vacant', 'overlay-vacant'],
    ['construction', 'overlay-construction'],
  ] as const) {
    await map.getByLabel('Overlay').selectOption(value);
    await map.screenshot({ path: `${SHOTS}/${name}.png` });
  }

  // Greyscale check of the whole map (ADR 0010).
  await map.getByLabel('Overlay').selectOption('none');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.addStyleTag({ content: '.isomap canvas { filter: grayscale(1); }' });
  await map.screenshot({ path: `${SHOTS}/map-2x-greyscale.png` });

  await page.goto('/art-preview.html');
  await expect(page.getByRole('heading', { name: 'Zoned Out sprite atlas' })).toBeVisible();
  await expect(page.locator('canvas.sprite').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/art-preview.png`, fullPage: true });
  for (const k of ['2', '3']) {
    await page.locator('#scale').selectOption(k);
    await page.screenshot({ path: `${SHOTS}/art-preview-${k}x.png` });
  }
});
