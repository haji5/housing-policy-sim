import { expect, test } from '@playwright/test';

test('game loads with the title and an End turn button', async ({ page }) => {
  await page.goto('/?seed=1');
  await expect(page.getByRole('heading', { name: 'Zoned Out' })).toBeVisible();
  await expect(page.getByTestId('end-turn')).toBeEnabled();
});
