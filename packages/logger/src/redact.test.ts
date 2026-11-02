import { describe, expect, it } from 'vitest';
import { redact, REDACTED } from './redact';

describe('redact', () => {
  it('remove segredos em qualquer profundidade', () => {
    const r = redact({ name: 'Bia', password: 'x', nested: { apiKey: 'k', list: [{ token: 't', ok: 1 }] } });
    expect(r.password).toBe(REDACTED);
    expect(r.nested.apiKey).toBe(REDACTED);
    expect(r.nested.list[0]!.token).toBe(REDACTED);
    expect(r.nested.list[0]!.ok).toBe(1);
    expect(r.name).toBe('Bia');
  });
  it('não quebra com ciclos', () => {
    const a: Record<string, unknown> = { id: 1 };
    a.self = a;
    expect(redact(a).self).toBe('[Circular]');
  });
});
