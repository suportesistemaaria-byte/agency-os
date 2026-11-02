import { redact } from '@aos/logger';

type Obj = Record<string, unknown>;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Mantém só os campos alterados (V3, seção 15) e remove segredos.
 * Criação: before = null, after = objeto. Exclusão: before = objeto, after = null.
 */
export function auditDiff(
  before: Obj | null | undefined,
  after: Obj | null | undefined,
): { before: Obj | null; after: Obj | null } {
  const b = before ? redact(before) : null;
  const a = after ? redact(after) : null;
  if (!b || !a) return { before: b, after: a };
  const ob: Obj = {};
  const oa: Obj = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (k === 'updatedAt' || k === 'updated_at') continue;
    if (!same(b[k], a[k])) {
      ob[k] = b[k] ?? null;
      oa[k] = a[k] ?? null;
    }
  }
  return { before: ob, after: oa };
}
