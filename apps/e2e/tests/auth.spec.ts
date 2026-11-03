import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('autenticação', () => {
  test('rota protegida sem sessão vai para o login', async ({ page }) => {
    await page.goto('/clientes');
    await expect(page).toHaveURL(/\/login\?next=%2Fclientes/);
  });

  test('senha errada mostra erro e não entra', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('manuella@demo.local');
    await page.getByLabel('Senha').fill('senha-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('login, sessão e logout', async ({ page }) => {
    await login(page, 'manuella@demo.local');
    await expect(page.getByRole('heading', { name: /Manuella/ })).toBeVisible();
    await page.getByRole('button', { name: /Manuella/ }).click();
    await page.getByRole('menuitem', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/hoje');
    await expect(page).toHaveURL(/\/login/);
  });

  test('recuperação de senha confirma o envio (link no log em dev)', async ({ page }) => {
    await page.goto('/recuperar-senha');
    await page.getByLabel('E-mail').fill('bia@demo.local');
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByText('Verifique seu e-mail')).toBeVisible();
  });

  test('cadastro sem convite é recusado', async ({ request }) => {
    const r = await request.post('/api/auth/sign-up/email', {
      data: { email: `intruso${Date.now()}@demo.local`, password: 'senha-forte-123', name: 'Intruso' },
    });
    expect(r.ok()).toBe(false);
  });

  test('convite por link: admin convida, pessoa cria a senha e entra com o cargo', async ({
    page,
    browser,
  }) => {
    const email = `convidado${Date.now()}@demo.local`;
    await login(page, 'manuella@demo.local');
    await page.goto('/configuracoes');
    await page.getByRole('button', { name: 'Convidar' }).click();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Nome').fill('Pessoa Convidada');
    await page.getByLabel('Cargo inicial').selectOption('designer');
    await page.getByRole('button', { name: 'Gerar link' }).click();
    const link = await page.locator('input[readonly]').inputValue();
    expect(link).toContain('/convite/');
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto(new URL(link).pathname);
    await p2.getByLabel(/Crie uma senha/).fill('senha-forte-123');
    await p2.getByRole('button', { name: 'Aceitar convite' }).click();
    await expect(p2).toHaveURL(/\/hoje/);
    await expect(p2.getByText('Pessoa Convidada').first()).toBeVisible();
    await p2.goto('/financeiro');
    await expect(p2).toHaveURL(/sem-permissao/);
    await ctx.close();
  });
});
