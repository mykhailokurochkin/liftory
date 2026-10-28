import { expect, test } from '@playwright/test';

test('records a workout offline, survives reload, and synchronizes the latest sets', async ({
  page,
  context,
}) => {
  const exercise = 'Жим ногами ' + Date.now();
  const title = 'Offline тренування ' + Date.now();
  const navigation = page.getByRole('navigation', { name: 'Мобільна навігація' });
  await page.goto('/');
  await expect(page.getByText('Локальний режим розробки', { exact: false })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await navigation.getByRole('button', { name: 'Вправи', exact: true }).click();
  await page.getByRole('button', { name: 'Додати вправу', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Нова вправа' });
  await dialog.getByRole('textbox', { name: 'Назва вправи' }).fill('   ');
  await dialog.getByRole('button', { name: 'Зберегти вправу' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Назва вправи' }).fill(exercise);
  await dialog.getByRole('textbox', { name: 'Група м’язів' }).fill('Ноги');
  await dialog.getByRole('textbox', { name: 'Нотатка' }).fill('Сидіння 4');
  await dialog.getByRole('button', { name: 'Зберегти вправу' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: exercise, exact: true })).toBeVisible();

  await navigation.getByRole('button', { name: 'Тренування', exact: true }).click();
  if (await page.getByRole('button', { name: 'Завершити', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Завершити', exact: true }).click();
    await navigation.getByRole('button', { name: 'Тренування', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Почати тренування', exact: true }).click();
  await page.getByRole('textbox', { name: 'Назва тренування' }).fill(title);
  await page.getByRole('button', { name: 'Додати вправу', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Додати вправу' })
    .getByRole('button', { name: new RegExp(exercise) })
    .click();
  await page.getByRole('textbox', { name: `${exercise}: вага підходу 1`, exact: true }).fill('40');
  await page
    .getByRole('textbox', { name: `${exercise}: повтори підходу 1`, exact: true })
    .fill('8');
  await expect(
    page.getByRole('button', { name: 'Синхронізувати', exact: true }).first(),
  ).toContainText('Синхронізовано');

  await context.setOffline(true);
  await page
    .getByRole('textbox', { name: `${exercise}: вага підходу 1`, exact: true })
    .fill('60.5');
  await page
    .getByRole('textbox', { name: `${exercise}: повтори підходу 1`, exact: true })
    .fill('9');
  await page.getByRole('button', { name: `${exercise}: виконати підхід 1`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `${exercise}: виконати підхід 1`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Назва тренування' })).toHaveValue(title);
  await expect(
    page.getByRole('textbox', { name: `${exercise}: вага підходу 1`, exact: true }),
  ).toHaveValue('60.5');
  await expect(
    page.getByRole('textbox', { name: `${exercise}: повтори підходу 1`, exact: true }),
  ).toHaveValue('9');
  await expect(
    page.getByRole('button', { name: `${exercise}: виконати підхід 1`, exact: true }),
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

  await page.getByRole('button', { name: 'Зберегти план', exact: true }).click();
  const plan = page.getByRole('dialog', { name: 'Зберегти як план' });
  await plan.getByRole('textbox', { name: 'Назва плану' }).fill('Ноги ' + Date.now());
  await plan.getByRole('button', { name: 'Зберегти план', exact: true }).click();
  await expect(plan).not.toBeVisible();
  await page.getByRole('button', { name: 'Завершити', exact: true }).click();
  await navigation.getByRole('button', { name: 'Історія', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
  await page.screenshot({ path: 'test-results/workout-mobile.png', fullPage: true });
});
