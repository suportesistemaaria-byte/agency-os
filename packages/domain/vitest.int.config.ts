import { defineConfig } from 'vitest/config';

/** Integração: Postgres real, depois de db:roles, db:migrate e db:seed. */
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
