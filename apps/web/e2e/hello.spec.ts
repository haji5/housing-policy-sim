import { expect, test } from '@playwright/test';

test('start screen leads to the game with an End turn button', async ({ page }) => {
  await page.goto('/?seed=1');
  await expect(page.getByRole('heading', { name: 'Zoned Out' })).toBeVisible();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('end-turn')).toBeEnabled({ timeout: 30_000 });
});
