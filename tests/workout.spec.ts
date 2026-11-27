import { expect, test } from '@playwright/test';

test('records a workout offline, survives reload, and synchronizes the latest sets', async ({
  page,
  context,
}) => {
  const exercise = 'Leg Press ' + Date.now();
  const title = 'Offline Workout ' + Date.now();
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await page.goto('/');
  await expect(page.getByText('Local development mode', { exact: false })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await navigation.getByRole('button', { name: 'Exercises', exact: true }).click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New exercise' });
  await dialog.getByRole('textbox', { name: 'Exercise name' }).fill('   ');
  await dialog.getByRole('button', { name: 'Save exercise' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Exercise name' }).fill(exercise);
  await dialog.getByRole('textbox', { name: 'Muscle group' }).fill('Legs');
  await dialog.getByRole('textbox', { name: 'Notes' }).fill('Seat 4');
  await dialog.getByRole('button', { name: 'Save exercise' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: exercise, exact: true })).toBeVisible();

  await navigation.getByRole('button', { name: 'Workouts', exact: true }).click();
  if (await page.getByRole('button', { name: 'Finish', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await navigation.getByRole('button', { name: 'Workouts', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workout title' }).fill(title);
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add exercise' })
    .getByRole('button', { name: new RegExp(exercise) })
    .click();
  await page.getByRole('textbox', { name: `${exercise}: set 1 weight`, exact: true }).fill('40');
  await page.getByRole('textbox', { name: `${exercise}: set 1 reps`, exact: true }).fill('8');
  await expect(page.getByRole('button', { name: 'Sync', exact: true }).first()).toContainText(
    'Synced',
  );

  await context.setOffline(true);
  await page.getByRole('textbox', { name: `${exercise}: set 1 weight`, exact: true }).fill('60.5');
  await page.getByRole('textbox', { name: `${exercise}: set 1 reps`, exact: true }).fill('9');
  await page.getByRole('button', { name: `${exercise}: complete set 1`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `${exercise}: complete set 1`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Workout title' })).toHaveValue(title);
  await expect(
    page.getByRole('textbox', { name: `${exercise}: set 1 weight`, exact: true }),
  ).toHaveValue('60.5');
  await expect(
    page.getByRole('textbox', { name: `${exercise}: set 1 reps`, exact: true }),
  ).toHaveValue('9');
  await expect(
    page.getByRole('button', { name: `${exercise}: complete set 1`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  await context.setOffline(false);
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/records', {
        headers: { 'X-Liftory-Owner': 'local-developer' },
      });
      const body = await response.json();
      const workout = body.records.find(
        (record: { entity: { kind: string; data: { title?: string } } }) =>
          record.entity.kind === 'workout' && record.entity.data.title === title,
      );
      return workout?.entity.data.exercises[0]?.sets[0];
    })
    .toMatchObject({ weightKg: 60.5, reps: 9, completed: true });

  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  const plan = page.getByRole('dialog', { name: 'Save as plan' });
  await plan.getByRole('textbox', { name: 'Plan name' }).fill('Legs ' + Date.now());
  await plan.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(plan).not.toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await navigation.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
  await page.screenshot({ path: 'test-results/workout-mobile.png', fullPage: true });
});
