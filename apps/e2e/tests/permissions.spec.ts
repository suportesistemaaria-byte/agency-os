import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('designer: sem Financeiro e sem Comercial; vê só clientes da equipe', async ({ page }) => {
  await login(page, 'rafa@demo.local');
  const nav = page.locator('aside nav');
  await expect(nav.getByText('Visão geral')).toHaveCount(0);
  await expect(nav.getByText('Pipeline')).toHaveCount(0);
  await page.goto('/financeiro');
  await expect(page).toHaveURL(/sem-permissao/);
  await page.goto('/clientes');
  await expect(page.getByText('Terra Mar').first()).toBeVisible();
  await expect(page.getByText('Ótica Prisma')).toHaveCount(0);
});

test('financeiro: vê o Financeiro e não vê Conteúdos', async ({ page }) => {
  await login(page, 'lia@demo.local');
  await page.goto('/financeiro');
  await expect(page.getByText('Do potencial ao caixa')).toBeVisible();
  await page.goto('/conteudos');
  await expect(page).toHaveURL(/sem-permissao/);
});
