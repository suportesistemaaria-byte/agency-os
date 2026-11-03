import { defineConfig } from '@playwright/test';

/**
 * E2E (handoff: venda → cliente; alteração pelo portal entra no Bloco 10).
 * Usa o app já rodando em E2E_BASE_URL ou sobe `next start` (precisa de `pnpm build` antes) com o banco do seed.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm --filter @aos/web exec next start -p 3100',
        url: `${baseURL}/login`,
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
