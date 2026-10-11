import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/m7');

/** Colour-vision deficiency simulations (Machado et al. 2009 matrices, severity 1). */
const CVD: Record<string, string> = {
  protanopia: '0.152 1.053 -0.205 0 0 0.115 0.786 0.099 0 0 -0.004 -0.048 1.052 0 0 0 0 0 1 0',
  deuteranopia: '0.367 0.861 -0.228 0 0 0.280 0.673 0.047 0 0 -0.012 0.043 0.969 0 0 0 0 0 1 0',
  tritanopia: '1.256 -0.077 -0.179 0 0 -0.078 0.931 0.148 0 0 0.005 0.691 0.304 0 0 0 0 0 1 0',
};

test('keyboard-only play: start, change a lever, end turns, reach the debrief', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?seed=2&mandate=tourism');
  // The shared-link mandate is preselected.
  await expect(page.getByLabel(/Tourism-dependent region/)).toBeChecked();
  await page.getByTestId('start').focus();
  await page.keyboard.press('Enter');
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });
  // Tutorial tip 1 is visible and can be dismissed from the keyboard.
  await expect(page.getByTestId('tutorial')).toBeVisible();
  await page.getByRole('button', { name: 'Skip the tutorial' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  // Arrow keys move between radio options; the rule is selected without a mouse.
  await page.getByLabel(/^Open/).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel(/Principal-residence rule/)).toBeChecked();
  // Focus is visible on the End turn button.
  await endTurn.focus();
  const outline = await endTurn.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  for (let i = 0; i < 20; i++) {
    await endTurn.focus();
    await page.keyboard.press('Enter');
    if (i < 19) await expect(endTurn).toBeEnabled({ timeout: 15_000 });
  }
  await expect(page.getByTestId('over')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open the debrief' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('debrief')).toBeVisible();
  // The rule started in the first quarter: no pre-period, so the card explains why a DiD is
  // not identified instead of estimating one.
  await expect(page.getByTestId('did-card')).toContainText('cannot separate');
  await expect(page.getByTestId('debrief')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
});

test('colour-vision simulations of the map and charts', async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(SHOTS, { recursive: true });
  await page.goto('/?seed=3');
  await page.getByTestId('start').click();
  const endTurn = page.getByTestId('end-turn');
  await expect(endTurn).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip the tutorial' }).click();
  await page.getByLabel(/Principal-residence rule/).check();
  for (let i = 0; i < 6; i++) {
    await endTurn.click();
    await expect(endTurn).toBeEnabled({ timeout: 15_000 });
  }
  await page.evaluate((cvd) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.innerHTML = Object.entries(cvd)
      .map(([id, m]) => `<filter id="${id}"><feColorMatrix type="matrix" values="${m}"/></filter>`)
      .join('');
    document.body.appendChild(svg);
  }, CVD);
  const map = page.locator('.isomap');
  await map.getByRole('button', { name: 'Zoom in' }).click();
  for (const id of Object.keys(CVD)) {
    await page.evaluate((f) => (document.body.style.filter = `url(#${f})`), id);
    await page.screenshot({ path: `${SHOTS}/cvd-${id}.png` });
  }
});
