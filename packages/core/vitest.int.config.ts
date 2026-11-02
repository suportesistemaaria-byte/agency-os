import { defineConfig } from 'vitest/config';

/** Integração: Postgres real (Docker local ou serviço do CI), depois de db:roles, db:migrate e db:seed. */
export default defineConfig({ test: { include: ['src/**/*.int.test.ts'], fileParallelism: false, testTimeout: 20_000 } });
