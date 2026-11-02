# Arquitetura (resumo operacional da V3)

O documento completo e aprovado é o **Agency OS Arquitetura Técnica V3**. Este arquivo descreve como a fundação o implementa.

## Visão geral

Monólito modular em TypeScript. Um deploy Next.js; domínios em `packages/*`; PostgreSQL (Neon) com RLS; arquivos no R2 (Sprint 3); jobs e eventos no Inngest.

```
navegador → Next.js (tRPC a partir da Sprint 1) → serviço de domínio
                                         └─ runCommand ─ BEGIN
                                                          ├─ dados (appDb + RLS)
                                                          ├─ domain_events (outbox)
                                                          └─ audit_logs
                                                         COMMIT → inngest.send('aos/outbox.flush') (melhor esforço)
Inngest cron (1 min) + flush → outbox-relay → claimBatch (SKIP LOCKED) → sendEvent(id = event.id) → markProcessed
                                            → consumidores (automações, notificações, analytics)
```

## Multi-tenancy

- Banco compartilhado; `workspace_id NOT NULL` em toda tabela de negócio; FKs compostas impedem ligação entre workspaces.
- Dois papéis: `aos_owner` (dono, migrações/seed/relay) e `aos_app` (aplicação, **sem BYPASSRLS, não é dono**).
- `withTenant(db, ctx, fn)` abre transação e faz `set_config('app.workspace_id', …, true)` (escopo da transação).
- Políticas `tenant_isolation`: `workspace_id = app.current_workspace_id()`. Sem contexto ⇒ `NULL` ⇒ nenhuma linha (fail-closed).
- `isolation.int.test.ts` falha se uma tabela com `workspace_id` não tiver RLS e política.

## Outbox

- `emit(tx, ctx, event)` valida o payload pelo catálogo (zod) e grava em `domain_events` na transação corrente.
- `idempotency_key` opcional evita duplicar o mesmo evento.
- O relay reserva lotes com `FOR UPDATE SKIP LOCKED` e empurra `available_at` 2 minutos: se morrer, o lote volta sozinho.
- Entrega ao Inngest com `id = domain_event.id` (deduplicação do lado do Inngest). Falha ⇒ `last_error` + backoff exponencial (teto 1h).
- `outbox-watchdog` registra erro se houver evento pendente há mais de 10 minutos.
- Garantia: **pelo menos uma vez**. Consumidores devem ser idempotentes (`idempotency: 'event.data.eventId'`).

## Auditoria

`recordAudit(tx, ctx, entry)` grava `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `metadata`, `created_at`, `workspace_id`.
Guarda só campos alterados; remove chaves sensíveis (senha, token, segredo, chave de API, cookie, credencial…). O papel `aos_app` só tem `INSERT/SELECT` em `audit_logs`.

## SLA (`@aos/sla`)

`calculateDueAt({ calendar, policy, createdAt, pausedIntervals, now })` → `{ startAt, dueAt, totalBusinessMinutes, remainingBusinessMinutes, consumedBusinessMinutes, status }`.

1. Início normalizado para o próximo instante útil (expediente semiaberto: 13:00 e 19:00 já são fora).
2. Dias úteis (A1): mesmo horário N dias úteis depois; se cair numa lacuna, vence no fim do período anterior.
3. Horas úteis: soma N×60 minutos úteis.
4. Pausas/bloqueios: consome até o início da pausa; ao retomar, o saldo em minutos úteis volta a correr. Pausa em aberto ⇒ `PAUSED`/`BLOCKED`, `dueAt = null`.
5. Pausa iniciada após o vencimento não altera prazo nem esconde atraso.
6. `NEAR_DUE` quando restante ≤ max(25% do total, 120 min); `OVERDUE` quando `now > dueAt` (atraso medido em minutos úteis).
7. Fuso horário via `Intl` (sem dependências); feriados por data local.

Persistência dos relógios (`sla_clocks`, `sla_intervals`) entra na Sprint 4, junto com solicitações e tarefas.

## Logs e monitoramento

- `@aos/logger` (pino, JSON, redação). Em produção: stdout → log drain da Vercel → Axiom.
- Sentry no servidor, edge e cliente (`sendDefaultPii: false`). Desligado sem DSN.
- `/api/health` para o monitor de uptime (200/503).

## Ambientes

| Ambiente | Banco | Deploy |
|---|---|---|
| local | Docker Postgres 16 | `pnpm dev` |
| ci | serviço Postgres do GitHub Actions | `pnpm verify` |
| preview | branch Neon por PR | Vercel preview |
| staging | branch Neon `staging` | Vercel (branch staging) |
| production | Neon `main` | Vercel (main) após `migrate` |
