import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('marcar como perdida exige motivo e fecha o modal ao concluir', async ({ page }) => {
  await login(page, 'manuella@demo.local');
  await page.getByRole('button', { name: 'Criar' }).click();
  await page.getByRole('menuitem', { name: 'Lead' }).click();
  const company = `E2E Perda ${Date.now().toString(36)}`;
  await page.getByLabel('Empresa').fill(company);
  await page.getByRole('button', { name: 'Criar', exact: true }).last().click();
  await expect(page).toHaveURL(/\/comercial\/oportunidades\//, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Perder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar como perdida' });
  await expect(dialog.getByRole('button', { name: 'Confirmar perda' })).toBeDisabled();
  await dialog.getByLabel('Motivo (obrigatório)').selectOption({ label: 'Preço' });
  await dialog.getByRole('button', { name: 'Confirmar perda' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Perdida', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible();
});
