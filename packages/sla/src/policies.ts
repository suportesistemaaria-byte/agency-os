import type { SlaPolicy } from './types';

/** Políticas padrão aprovadas (V3). Persistidas em sla_policies; aqui servem para seed e testes. */
export const DEFAULT_POLICIES = {
  arte_estatica: { model: 'business_days', amount: 1, rule: 'A1_same_time' },
  arte_impresso: { model: 'business_days', amount: 3, rule: 'A1_same_time' },
  video: { model: 'business_days', amount: 3, rule: 'A1_same_time' },
  alteracao: { model: 'business_days', amount: 1, rule: 'A1_same_time' },
  alteracao_urgente: { model: 'business_hours', amount: 4 },
  fotos_editadas: { model: 'business_days', amount: 7, rule: 'A1_same_time' },
  cardapio_catalogo: { model: 'business_days', amount: 20, rule: 'A1_same_time' },
  triagem: { model: 'business_hours', amount: 2 },
} as const satisfies Record<string, SlaPolicy>;

export type DefaultPolicyKey = keyof typeof DEFAULT_POLICIES;

/** Feriados nacionais de 2026 usados no seed (municipais são cadastrados por workspace). */
export const BR_NATIONAL_HOLIDAYS_2026 = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01',
  '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
];
