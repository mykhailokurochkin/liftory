import { expect, test } from '@playwright/test';

test('fits the screen and exposes navigation for its viewport', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByText('Local development mode', { exact: false })).toBeVisible();
  const mobile = info.project.name.startsWith('mobile');
  const navigation = page.getByRole('navigation', {
    name: mobile ? 'Mobile navigation' : 'Main navigation',
  });
  await expect(navigation).toBeVisible();
  for (const name of ['Exercises', 'Plans', 'Profile', 'History', 'Workouts']) {
    await navigation
      .getByRole('button', {
        name: name === 'Workouts' ? /^Workouts(?: \d+)?$/ : name,
        exact: true,
      })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: `test-results/layout-${info.project.name}.png`, fullPage: true });
});
