# Relatório — Sprint 0 (Fundação)

> Leia primeiro a seção **Validação**: parte da verificação foi executada; build, lint, typecheck completo e testes de integração ainda precisam rodar numa máquina com Node, pnpm e Postgres.

## 1. O que foi implementado

Monorepo pnpm + Turborepo; TypeScript estrito; Next.js 15 (página técnica, `/api/health`, `/api/inngest`, rota de teste de eventos só local); ESLint + Prettier; validação de env (zod); Postgres + Drizzle + migrações SQL; multi-tenancy com RLS e dois papéis; outbox (`domain_events`) com relay no Inngest; Audit Service; `runCommand`; biblioteca de SLA com 38 testes; logger com redação; Sentry; ambientes; CI e workflow de migração; seeds; documentação.

## 2. Estrutura

Veja README → Estrutura.

## 3. Banco e migrações

- `0000_foundation.sql`: extensões, papel `aos_app`, enums, `workspaces`, `users`, `workspace_members`, `permissions`, `roles`, `role_permissions`, `member_roles`, `member_permission_overrides`, `business_calendars`, `holidays`, `sla_policies`, `domain_events`, `audit_logs` + índices.
- `0001_rls.sql`: `app.current_workspace_id()`, RLS e políticas em todas as tabelas com `workspace_id`, grants mínimos.
- Seed: permissões (19), 11 cargos de sistema com a matriz da V3, workspace "Agência 4P" e "Workspace de teste", expediente padrão, feriados nacionais 2026, 8 políticas de SLA, 5 usuários de exemplo.

## 4. Multi-tenancy · 5. Outbox · 6. Auditoria · 7. SLA

Veja `docs/ARCHITECTURE.md`.

## 8–12. Validação

| Verificação                                                          | Resultado                                                | Onde rodou                                                                                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes de SLA (38 casos)                                             | **38/38 passando**                                       | Executados no ambiente do assistente (TypeScript transpilado + executor compatível com Vitest). Rodar `pnpm --filter @aos/sla test` para confirmar com Vitest real. |
| Typecheck do `@aos/sla`, `redact` e `auditDiff`                      | **0 erros** (compilador TS 5.6, modo estrito do projeto) | Ambiente do assistente                                                                                                                                              |
| Testes unitários logger (2), audit (4), events (4), env (3)          | **13/13 passando**                                       | Ambiente do assistente                                                                                                                                              |
| Lint (ESLint)                                                        | **não executado**                                        | requer `pnpm install`                                                                                                                                               |
| Typecheck dos pacotes com dependências (db, events, core, jobs, web) | **não executado**                                        | requer `pnpm install`                                                                                                                                               |
| Testes de integração (RLS/isolamento 8, runCommand/outbox 4)         | **não executados**                                       | requer Postgres                                                                                                                                                     |
| Build Next.js                                                        | **não executado**                                        | requer `pnpm install`                                                                                                                                               |

**A Sprint 0 só deve ser considerada concluída depois de `pnpm verify` passar** (localmente ou no CI).

## 13. Variáveis de ambiente

Veja `.env.example`. Obrigatórias agora: `DATABASE_URL`, `DATABASE_ADMIN_URL`, `APP_DB_PASSWORD`. Produção também exige `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` e `SENTRY_DSN`.

## 14. Serviços externos a criar

GitHub (repositório) · Neon (projeto, branches main/staging) · Vercel (projeto ligado ao repo, Pro) · Inngest (app, chaves) · Sentry (projeto Next.js) · Axiom (dataset + log drain na Vercel) · Better Stack ou similar (uptime em `/api/health`). Depois: Upstash (S1), R2 (S3), Resend (S6), Meta WhatsApp (F1.5).

## 15. Mockado ou provisório

- Página inicial é técnica (não é a tela Hoje).
- `users` é mínima; Better Auth estende na Sprint 1.
- `/api/debug/emit` existe só para validar eventos em local/ci.
- Consumidor `event-probe` apenas registra log.
- Datas de 2026 nos feriados do seed.

## 16. Pendências

- Rodar `pnpm install` e versionar o `pnpm-lock.yaml`.
- Rodar `pnpm verify` e corrigir o que aparecer (lint, tipos, build).
- Conferir o journal do Drizzle com `pnpm --filter @aos/db check` na primeira execução.

## 17. Riscos técnicos

- **Neon e papéis:** `CREATE ROLE` via SQL depende das permissões do plano; alternativa: criar `aos_app` pelo console do Neon.
- **Pooler do Neon (PgBouncer em modo transação):** `set_config(..., true)` funciona por ser local à transação; não usar `SET` de sessão.
- **Inngest:** dependência de fornecedor mitigada pelo outbox no banco (eventos não se perdem se o Inngest cair).
- **Versões:** intervalos `^` nos pacotes; o lockfile gerado no primeiro install fixa as versões.

## 18. Evidências

Saída dos testes executados está na mensagem de entrega. Para reproduzir: `pnpm test`. Para o fluxo completo: seção "Como validar o caminho de eventos" do README.

## 19. Como testar localmente

README → Primeira execução, depois `pnpm verify` e `curl -X POST localhost:3000/api/debug/emit`.

## 20. Sprint 1 (aguardando autorização)

Better Auth (e-mail + senha, convites, 2FA para Admin/Financeiro), sessões, `can()` com escopos all/team/own, matriz de permissões editável, tRPC + Zod, rate limit (Upstash), shell do app na direção D (sidebar, ⌘K, breadcrumbs), Hoje vazia, Configurações (usuários, expediente, feriados, políticas de SLA) e testes de isolamento por rota.
