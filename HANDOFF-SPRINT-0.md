# Handoff para o Claude Code — Validação final do Sprint 0

## Contexto

Agency OS é o sistema operacional da Agência 4P. A arquitetura V3 foi aprovada e o código da fundação (Sprint 0) foi escrito num ambiente **sem terminal**. Parte da validação foi feita lá (SLA em executor compatível; banco em PostgreSQL 16.4 via PGlite). O resto nunca foi executado: `pnpm install`, lockfile, lint, typecheck completo, Vitest real, testes de integração com Drizzle, build do Next.js e `pnpm verify`.

Estado atual e evidências anteriores: `docs/validation/SPRINT-0-FINAL-VALIDATION.md` e `docs/validation/postgres-results.json`.

## Sua tarefa (única)

Finalizar a validação do Sprint 0 no ambiente real. **Não iniciar o Sprint 1.**

### 1. Dependências

```bash
node --version        # exigido: >= 20.11 (.nvmrc = 20.18.0)
corepack enable
pnpm --version        # exigido: 9.x
pnpm install
```

- Gere e mantenha o `pnpm-lock.yaml` (versionável).
- Resolva incompatibilidades. Os intervalos de versão são `^`; se uma versão nova quebrar a API usada (Drizzle, Next 15, Inngest 3, Sentry 8, typescript-eslint 8), ajuste o código ou fixe a versão e registre em `docs/DECISIONS.md` → "Decisões de implementação".

### 2. Ambiente local

```bash
cp .env.example .env    # valores padrão já são locais (Docker); nada de credencial real
set -a && . ./.env && set +a
```

- Inngest, Sentry, Neon e Vercel ficam **desligados/locais** (chaves vazias são aceitas fora de produção).

### 3. PostgreSQL local

```bash
pnpm db:up && pnpm db:roles && pnpm db:migrate && pnpm db:seed
```

Tudo precisa rodar sem erro. Rode `pnpm --filter @aos/db check` para conferir o journal do Drizzle (as migrações 0000/0001 foram escritas à mão em SQL).

### 4. Validação completa

```bash
pnpm verify 2>&1 | tee verify.log
```

Cobre: format, lint, typecheck, unit, integration, build. Não pare no primeiro erro: **investigue → corrija → rode de novo** até passar.

### 5. Confirme explicitamente (testes oficiais do repositório, Vitest real)

| Área                | Comando                                    | Arquivo                                 |
| ------------------- | ------------------------------------------ | --------------------------------------- |
| SLA (38 casos)      | `pnpm --filter @aos/sla test`              | `packages/sla/src/engine.test.ts`       |
| RLS + isolamento    | `pnpm --filter @aos/db test:integration`   | `packages/db/src/isolation.int.test.ts` |
| runCommand + outbox | `pnpm --filter @aos/core test:integration` | `packages/core/src/command.int.test.ts` |
| Audit Service       | `pnpm --filter @aos/audit test`            | `packages/audit/src/diff.test.ts`       |
| Logger              | `pnpm --filter @aos/logger test`           | `packages/logger/src/redact.test.ts`    |
| Events              | `pnpm --filter @aos/events test`           | `packages/events/src/catalog.test.ts`   |
| Env                 | `pnpm --filter @aos/env test`              | `packages/env/src/env.test.ts`          |
| Build               | `pnpm --filter @aos/web build`             | —                                       |

Isolamento precisa provar: A não lê, não altera, não apaga, não cria com `workspace_id` de B, não cria relação com entidade de B, não move dados para B; sem contexto nada é visível; operações legítimas em A funcionam.

Auditoria precisa provar: ação feita, audit_log criado, actor/workspace/action/entity/entity_id corretos, before/after coerentes, nenhum segredo armazenado. **Lacuna conhecida:** hoje o teste de integração do `runCommand` só confere que o audit_log existe. Acrescente as asserções de conteúdo (actor, action, entity, before/after, ausência de segredo) — isso fortalece o teste, não enfraquece.

Smoke test opcional do caminho completo de eventos:

```bash
pnpm dev                       # terminal 1
pnpm dev:jobs                  # terminal 2 (Inngest Dev Server)
curl -X POST localhost:3000/api/debug/emit
```

Esperado no painel do Inngest: `outbox-relay` → `aos/system.healthcheck` → `event-probe`.

### 6. Pontos de atenção prováveis (verifique primeiro)

- `packages/db/package.json`: os scripts de `test` e `test:integration` usam `vitest.config.ts` e `vitest.int.config.ts`. Confira se os configs não se sobrepõem.
- O Turbo precisa repassar `DATABASE_URL`, `DATABASE_ADMIN_URL` e `APP_DB_PASSWORD` para `test:integration` (ver `turbo.json` → `env`/`passThroughEnv`).
- `apps/web`: `src/instrumentation.ts` importa `../sentry.*.config`. Confira com Next 15 + `@sentry/nextjs` 8.
- `server-only` no `apps/web/src/lib/foundation.ts`.
- ESLint flat config na raiz; o pacote `apps/web` usa `eslint .`. Confira se `.next` está ignorado.
- Os scripts `db:*` usam `tsx` com top-level await (ESM). O pacote `@aos/db` tem `"type": "module"`.
- `users` tem RLS ligada a `workspace_members`. Confira se o seed (papel dono) e o teste de isolamento continuam corretos.
- Em PGlite, `CREATE EXTENSION pgcrypto` falhou e foi removido (`gen_random_uuid()` é nativo no PG13+).

### 7. Não esconder erros

- Não altere testes para passar se isso enfraquecer o comportamento esperado.
- Se surgir necessidade de mudar decisão da V3 (Neon/Better Auth/R2, regra de pausa do SLA, A1 no almoço, NEAR_DUE, faturas após confirmação, ordem das sprints, sessão do portal, retenção de leads): **pare e reporte** antes de alterar.

### 8. Relatório final

Atualize `docs/validation/SPRINT-0-FINAL-VALIDATION.md` com a tabela **VALIDAÇÃO | RESULTADO | EVIDÊNCIA**, usando trechos reais de saída (contagem de testes, tempo de build, rotas geradas):

pnpm install · pnpm-lock.yaml · migrations · seed · lint · typecheck · unit tests · integration tests · SLA · RLS · isolamento · runCommand · outbox · auditoria · Next.js build · pnpm verify.

Cada item: **PASSOU**, **FALHOU** ou **DEPENDE DE SERVIÇO EXTERNO** (só Neon/Vercel/Inngest Cloud/Sentry/Axiom). Liste também as correções feitas (problema → causa → correção) e os warnings relevantes do build.

Termine com:

## STATUS DO SPRINT 0

`SPRINT 0 CONCLUÍDO E VALIDADO` + "Pronto para autorização do Sprint 1." — **somente** se tudo passou.
Caso contrário: `SPRINT 0 NÃO CONCLUÍDO`.

**Não inicie o Sprint 1.**

## Prompt sugerido para colar no Claude Code

> Leia `CLAUDE.md` e `HANDOFF-SPRINT-0.md`. Execute exclusivamente a validação final do Sprint 0 descrita no handoff, corrigindo o que falhar até `pnpm verify` passar por completo. Não enfraqueça testes, não altere decisões da V3 sem me consultar e não inicie o Sprint 1. No fim, atualize `docs/validation/SPRINT-0-FINAL-VALIDATION.md` com evidências reais e o status.
