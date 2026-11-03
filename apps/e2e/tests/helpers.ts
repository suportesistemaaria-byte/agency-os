import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'demo1234';

/** Login pela tela. O limitador de tentativas (429) é proteção real: aguarda a janela e tenta de novo. */
export async function login(page: Page, email: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    const limited = page.getByText('Muitas tentativas');
    await Promise.race([
      page.waitForURL(/\/hoje/, { timeout: 20_000 }).catch(() => undefined),
      limited.waitFor({ timeout: 20_000 }).catch(() => undefined),
    ]);
    if (/\/hoje/.test(page.url())) return;
    await page.waitForTimeout(11_000);
  }
  await expect(page).toHaveURL(/\/hoje/);
}
