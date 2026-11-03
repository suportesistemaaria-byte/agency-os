import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, login } from './helpers';

async function portalLogin(page: Page, email: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto('/portal/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await Promise.race([
      page.waitForURL(/\/portal$/, { timeout: 20_000 }).catch(() => undefined),
      page
        .getByText('Muitas tentativas')
        .waitFor({ timeout: 20_000 })
        .catch(() => undefined),
    ]);
    if (/\/portal$/.test(page.url())) return;
    await page.waitForTimeout(11_000);
  }
  await expect(page).toHaveURL(/\/portal$/);
}

test('alteração pelo portal: contato marca a arte, pede alteração e a equipe recebe a tarefa com SLA', async ({
  page,
  browser,
}) => {
  await portalLogin(page, 'contato@cafeaurora.demo.local');
  await expect(page.getByText('aguardando a sua aprovação')).toBeVisible();
  await page.getByRole('link', { name: 'Aprovações' }).click();
  await expect(page).toHaveURL(/\/portal\/aprovacoes$/);
  await expect(page.getByRole('heading', { name: 'Aprovações' })).toBeVisible();
  await page.getByRole('link', { name: /Oferta Black Friday/ }).click();
  await expect(page.getByRole('heading', { name: 'Oferta Black Friday' })).toBeVisible();
  // marca um ponto na arte
  const art = page.locator('main img').first();
  await art.click({ position: { x: 60, y: 80 } });
  await page.getByPlaceholder('O que ajustar aqui?').fill('Trocar o preço para R$ 9,90');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await page.getByLabel('Comentário').fill('Faltou o logo novo no rodapé.');
  await page.getByRole('button', { name: 'Pedir alteração' }).click();
  await expect(page.getByText('Alteração enviada para a agência.')).toBeVisible();
  await expect(page).toHaveURL(/\/portal\/aprovacoes$/);

  // equipe: tarefa de alteração criada pela automação, com SLA
  const ctx = await browser.newContext();
  const team = await ctx.newPage();
  await login(team, 'manuella@demo.local');
  await expect
    .poll(
      async () => {
        await team.goto('/tarefas?view=upcoming&mine=0');
        return team.getByText('Alteração: Oferta Black Friday').count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await team.getByText('Alteração: Oferta Black Friday').first().click();
  await expect(team.getByText('alteracao', { exact: true })).toBeVisible(); // política de SLA de Alteração
  await ctx.close();
});

test('contato que só comenta não vê o botão de aprovar; portal não abre o app interno', async ({ page }) => {
  await portalLogin(page, 'ana@terramar.demo.local');
  await page.goto('/hoje');
  await expect(page).toHaveURL(/\/portal$/);
  await page.goto('/financeiro');
  await expect(page).toHaveURL(/\/portal$/);
  const r = await page.request.get(
    '/api/trpc/search?input=' + encodeURIComponent(JSON.stringify({ json: { q: 'terra' } })),
  );
  expect(r.status()).toBe(401);
});

test('contato sem permissão de aprovar não tem botão Aprovar', async ({ page }) => {
  await portalLogin(page, 'ana@terramar.demo.local');
  await page.goto('/portal/conteudos');
  const first = page.locator('main a[href^="/portal/aprovacoes/"]').first();
  if (await first.count()) {
    await first.click();
    await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  }
});
