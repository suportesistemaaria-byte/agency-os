# SPRINT 0 — FINAL VALIDATION REPORT

Data: 2026-11-02

## Limitação do ambiente

Este ambiente não executa Node.js, pnpm, Docker nem o Next.js. Por isso, **não foi possível** rodar `pnpm install`, gerar o lockfile, rodar ESLint, o `tsc` completo, o Vitest real, o build do Next.js e `pnpm verify`.

O que foi possível, e foi feito:
- Rodar as **migrações reais do projeto** num **PostgreSQL 16.4 de verdade** (PGlite, o Postgres compilado para WebAssembly), testando RLS, isolamento, outbox, runCommand e auditoria com SQL real. Resultado bruto em `postgres-results.json`.
- Rodar os testes da biblioteca de SLA e os unitários com o compilador TypeScript 5.6 e um executor compatível com o Vitest.

## Correções feitas nesta rodada

| Problema | Causa | Correção |
|---|---|---|
| Migração 0000 falhava: `extension "pgcrypto" is not available` | extensão desnecessária; `gen_random_uuid()` é nativo do PostgreSQL 13+ | linha removida da migração |
| Teste de isolamento não cobria "relação com entidade de B", "mover dados para B" nem "operação legítima" | lacuna de cobertura | 3 testes adicionados em `isolation.int.test.ts` |

## Tabela de validação

| Validação | Resultado | Evidência |
|---|---|---|
| pnpm install | NÃO EXECUTADO | requer Node/pnpm; rodar localmente |
| lockfile (pnpm-lock.yaml) | NÃO EXECUTADO | gerado pelo primeiro `pnpm install` |
| Migrações | PASSOU | 0000 + 0001 aplicadas sem erro em PostgreSQL 16.4; 13 tabelas |
| Seed | PASSOU (via SQL equivalente) | 19 permissões, 22 cargos (11 × 2 workspaces), 176 concessões, 16 políticas de SLA, 26 feriados, membros. O `seed.ts` com Drizzle ainda precisa rodar localmente |
| RLS | PASSOU | 10/10 tabelas com `workspace_id` com RLS e política; `aos_app` sem BYPASSRLS e sem tabelas próprias |
| Isolamento entre workspaces | PASSOU | 11 casos (abaixo) |
| Outbox | PASSOU | 7 casos (abaixo) |
| runCommand (transação) | PASSOU (SQL equivalente) | commit grava 1+1+1; falha deixa 0/0/0 |
| Auditoria | PASSOU | 6 casos (abaixo) |
| SLA | PASSOU no executor compatível · Vitest real NÃO EXECUTADO | 38/38 |
| Testes unitários (logger, audit, events, env) | PASSOU no executor compatível · Vitest real NÃO EXECUTADO | 13/13 |
| Typecheck | PARCIAL | 0 erros em `@aos/sla`, `redact`, `auditDiff`; demais pacotes precisam de `pnpm install` |
| Lint | NÃO EXECUTADO | requer `pnpm install` |
| Testes de integração (Vitest + Drizzle) | NÃO EXECUTADO | o comportamento foi comprovado com SQL real; os arquivos `*.int.test.ts` precisam rodar localmente |
| Build Next.js | NÃO EXECUTADO | requer `pnpm install` |
| pnpm verify | NÃO EXECUTADO | — |
| Inngest, Sentry, Neon, Vercel | DEPENDE DE SERVIÇO EXTERNO | funcionam em modo local (Inngest Dev Server, Sentry desligado sem DSN, Docker Postgres) |

### Isolamento (PostgreSQL real, papel aos_app)
| Caso | Resultado |
|---|---|
| Sem contexto de workspace, nada é visível | PASSOU (0 linhas) |
| A lê só os próprios dados | PASSOU (8 políticas, todas de A) |
| A não lê registro de B com ID conhecido | PASSOU (0 linhas) |
| A só enxerga o próprio workspace | PASSOU |
| A só enxerga usuários membros de A | PASSOU |
| A não altera dados de B | PASSOU (0 linhas afetadas) |
| A não apaga dados de B | PASSOU (B manteve 13 feriados) |
| A não cria registro com workspace_id de B | PASSOU (bloqueado pela política RLS) |
| A não cria relação com entidade de B | PASSOU (bloqueado pela FK composta) |
| A não move os próprios dados para B | PASSOU (bloqueado pela política RLS) |
| Operações legítimas em A funcionam | PASSOU |

### Outbox e runCommand
| Caso | Resultado |
|---|---|
| Commit grava dado + evento + auditoria | PASSOU (1/1/1) |
| Falha no meio da transação | PASSOU (0/0/0: sem alteração parcial nem evento órfão) |
| Evento com workspace, tipo e ator corretos, pendente | PASSOU |
| idempotency_key evita duplicata | PASSOU |
| Nome de evento inválido rejeitado pelo banco | PASSOU |
| Relay reserva lote sem entregar duas vezes (SKIP LOCKED) | PASSOU (2 e depois 0) |
| markProcessed e backoff após falha | PASSOU |
| Aplicação não pode marcar evento como processado | PASSOU (permission denied) |

### Auditoria
| Caso | Resultado |
|---|---|
| actor, workspace, action, entity, entity_id corretos | PASSOU |
| before/after coerentes | PASSOU |
| Nenhum segredo armazenado | PASSOU (password, token e authorization = [REDACTED]) |
| Alteração guarda só campos mudados | PASSOU |
| Aplicação não altera nem apaga audit_logs | PASSOU (permission denied) |

## Para fechar a Sprint 0 (na sua máquina, ~10 minutos)

```bash
corepack enable && pnpm install
cp .env.example .env && set -a && . ./.env && set +a
pnpm db:up && pnpm db:roles && pnpm db:migrate && pnpm db:seed
pnpm verify
```
Envie a saída completa. Corrijo qualquer erro e atualizo este relatório.

## STATUS DO SPRINT 0

**SPRINT 0 NÃO CONCLUÍDO**

Banco, RLS, isolamento, outbox, transação e auditoria estão comprovados em PostgreSQL real. Faltam pnpm install, lockfile, lint, typecheck completo, Vitest real, testes de integração com Drizzle, build e `pnpm verify`, que precisam de um ambiente com Node.js.
