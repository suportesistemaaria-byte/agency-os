import { describe, expect, it } from 'vitest';
import { auditDiff } from './diff';

describe('auditDiff', () => {
  it('guarda só os campos alterados', () => {
    const r = auditDiff({ name: 'A', amount: 1, updatedAt: 'x' }, { name: 'A', amount: 2, updatedAt: 'y' });
    expect(r).toEqual({ before: { amount: 1 }, after: { amount: 2 } });
  });
  it('criação e exclusão guardam o objeto inteiro', () => {
    expect(auditDiff(null, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
    expect(auditDiff({ a: 1 }, null)).toEqual({ before: { a: 1 }, after: null });
  });
  it('nunca registra segredos', () => {
    const r = auditDiff({ password: 'old', apiKey: 'k1' }, { password: 'new', apiKey: 'k2' });
    expect(JSON.stringify(r)).not.toContain('old');
    expect(JSON.stringify(r)).not.toContain('k2');
  });
  it('campo removido aparece como null no after', () => {
    expect(auditDiff({ a: 1, b: 2 }, { a: 1 })).toEqual({ before: { b: 2 }, after: { b: null } });
  });
});
