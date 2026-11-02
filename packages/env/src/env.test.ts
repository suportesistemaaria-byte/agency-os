import { describe, expect, it } from 'vitest';
import { serverEnv } from './index';

describe('env', () => {
  it('aceita configuração mínima local', () => {
    const e = serverEnv({ DATABASE_URL: 'postgres://a:b@localhost:5432/x' });
    expect(e.APP_ENV).toBe('local');
  });
  it('rejeita DATABASE_URL ausente', () => {
    expect(() => serverEnv({})).toThrow();
  });
  it('produção exige chaves de Inngest e Sentry', () => {
    expect(() => serverEnv({ APP_ENV: 'production', DATABASE_URL: 'postgres://a:b@h:5432/x' })).toThrow();
  });
});
