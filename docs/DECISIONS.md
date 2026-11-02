# Decisões

## Aprovadas na V3 (não alterar sem aprovação)

| # | Decisão |
|---|---|
| 1 | Neon (Postgres) + Better Auth + Cloudflare R2 |
| 2 | SLA após pausa: saldo restante em minutos úteis a partir da retomada |
| 3 | A1: horário que cai na lacuna (almoço) vence no fim do período anterior (13:00) |
| 4 | NEAR_DUE: ≤ 25% do prazo ou ≤ 2 horas úteis, o que vier antes |
| 5 | Faturas geradas após confirmação do Financeiro |
| 6 | Ordem das sprints da V3 (arquivos na S3, notificações in-app na S4) |
| 7 | Sessão do portal: 30 dias, reautenticação para aprovar |
| 8 | Leads perdidos: 24 meses, depois anonimização |

## Decisões de implementação da Sprint 0 (dentro da V3, sem mudar arquitetura)

| Tema | Escolha | Motivo |
|---|---|---|
| Driver Postgres | `pg` (node-postgres) + Drizzle | Transações interativas (necessárias para `SET LOCAL`) e compatível com Neon e Docker |
| Dois papéis no banco | `aos_owner` / `aos_app` | RLS só vale para quem não é dono e não tem BYPASSRLS |
| RLS fail-closed | `NULLIF(current_setting(...), '')::uuid` | Sem contexto, nenhuma linha |
| Migrações | SQL versionado + journal do Drizzle | Políticas RLS e grants não são geradas pelo drizzle-kit |
| Entrega de eventos | pelo menos uma vez, id = `domain_event.id` | Inngest deduplica; consumidores idempotentes |
| Calendário SLA | períodos semiabertos `[início, fim)` | 13:00 e 19:00 exatos não contam como expediente |
| Pausa após vencimento | ignorada no cálculo, status segue OVERDUE | Não esconder atraso |
| Feriados | por workspace (nacionais no seed) | Municipais e recessos variam por agência |

## Pendentes de confirmação (não bloqueiam a Sprint 1)

- Repositório Git e organização Vercel/Neon/Inngest/Sentry em nome da Agência 4P.
- Feriados municipais/estaduais da cidade da agência.
