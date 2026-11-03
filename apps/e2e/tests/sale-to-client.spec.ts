import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('venda → cliente: lead, proposta aceita, ganho, conversão e contrato confirmado pelo Financeiro', async ({
  page,
  browser,
}) => {
  const company = `E2E Padaria ${Date.now().toString(36)}`;
  await login(page, 'manuella@demo.local');

  // Lead
  await page.getByRole('button', { name: 'Criar' }).click();
  await page.getByRole('menuitem', { name: 'Lead' }).click();
  await page.getByLabel('Empresa').fill(company);
  await page.getByLabel('Contato').fill('Joana');
  await page.getByLabel('MRR potencial (R$)').fill('4.500');
  await page.getByRole('button', { name: 'Criar', exact: true }).last().click();
  await expect(page).toHaveURL(/\/comercial\/oportunidades\//);
  await expect(page.getByRole('heading', { name: company })).toBeVisible();
  await expect(page.getByText('1º contato', { exact: true })).toBeVisible();

  // Proposta
  await page.locator('main a[href="?tab=propostas"]').click();
  await page.getByRole('button', { name: 'Nova proposta' }).click();
  await page.getByPlaceholder('R$').first().fill('4.500');
  await page.getByPlaceholder('R$').first().blur();
  await page.getByRole('button', { name: 'Criar proposta' }).click();
  await expect(page.getByText('Proposta criada (v1).')).toBeVisible();
  await page.getByRole('button', { name: 'Ações', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Enviar ao cliente' }).click();
  await expect(page.getByText(/Follow-ups D\+2/)).toBeVisible();
  await page.getByRole('button', { name: 'Ações', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Registrar aceite' }).click();
  await expect(page.getByText('Proposta aceita.')).toBeVisible();

  // Ganho e conversão
  await page.getByRole('button', { name: 'Marcar como ganho' }).click();
  await expect(page.getByRole('button', { name: 'Transformar em cliente' })).toBeVisible();
  await page.getByRole('button', { name: 'Transformar em cliente' }).click();
  await page.getByLabel('Atendimento (obrigatório)').selectOption({ label: 'Bia' });
  await page.getByLabel('Design').selectOption({ label: 'Rafa' });
  await page.getByRole('button', { name: 'Criar cliente' }).click();
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { name: company })).toBeVisible();
  await expect(page.getByText('Onboarding').first()).toBeVisible();

  // Financeiro confirma o contrato → cobranças
  const ctx = await browser.newContext();
  const fin = await ctx.newPage();
  await login(fin, 'lia@demo.local');
  await fin.goto('/financeiro/contratos');
  const row = fin.locator('tr', { hasText: company });
  await expect(row.getByText('Aguardando Financeiro')).toBeVisible();
  await row.getByRole('button', { name: 'Confirmar contrato' }).click();
  await expect(row.getByText('Vigente')).toBeVisible();
  await expect
    .poll(async () => {
      await fin.goto('/financeiro/receber?s=all');
      return fin.locator('tr', { hasText: company }).count();
    })
    .toBeGreaterThan(0);
  await ctx.close();
});
