/** Chaves que nunca podem aparecer em logs ou na auditoria. */
export const SENSITIVE_KEY =
  /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|session|cpf|cnpj_raw|card)/i;

export const REDACTED = '[REDACTED]';

/** Copia profunda removendo valores de chaves sensíveis. Seguro contra ciclos. */
export function redact<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value as object)) return '[Circular]' as T;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, seen);
  }
  return out as T;
}
