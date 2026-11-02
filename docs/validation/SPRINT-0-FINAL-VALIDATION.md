# SPRINT 0 — FINAL VALIDATION REPORT

Data: 2026-11-02 · Ambiente: Linux, Node 22.23.4, pnpm 9.12.3, PostgreSQL 16 (nativo, mesmas credenciais do `docker-compose.yml`)

> O daemon do Docker não estava disponível no ambiente de validação. Foi usado um PostgreSQL 16 nativo com o mesmo usuário dono (`aos_owner`), banco (`agency_os`) e porta (5432) do `docker-compose.yml`. Os comandos `db:roles`, `db:migrate`, `db:seed` e os testes rodaram exatamente como no fluxo com Docker.

## Tabela de validação

| VALIDAÇÃO                   | RESULTADO                  | EVIDÊNCIA                                                                                                                                                                        |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm install                | PASSOU                     | `Done in 23.4s`. Só avisos de peer (`@opentelemetry/api` 1.10.0 vs `<1.10.0`, vindos de Inngest/Sentry); sem impacto no build nem nos testes                                     |
| pnpm-lock.yaml              | PASSOU                     | gerado e versionado                                                                                                                                                              |
| migrations                  | PASSOU                     | `pnpm db:migrate` → `Migrações aplicadas.`; `drizzle-kit check` → `Everything's fine`                                                                                            |
| seed                        | PASSOU                     | `pnpm db:roles` → `Papel aos_app pronto.`; `pnpm db:seed` (Drizzle real) → `Seed concluído.`                                                                                     |
| lint                        | PASSOU                     | `turbo run lint` → `Tasks: 9 successful, 9 total` (após correção abaixo)                                                                                                         |
| typecheck                   | PASSOU                     | `turbo run typecheck` → `Tasks: 9 successful, 9 total` (após correção abaixo)                                                                                                    |
| unit tests                  | PASSOU                     | Vitest real: logger 2/2 · audit 4/4 · env 3/3 · events 4/4 · sla 38/38 → **51 testes**                                                                                           |
| integration tests           | PASSOU                     | Vitest real + Drizzle + Postgres: `@aos/db` 11/11 · `@aos/core` 5/5 → **16 testes**. Segunda execução seguida: 11/11 e 5/5 (estável)                                             |
| SLA                         | PASSOU                     | `@aos/sla:test: Tests 38 passed (38)`                                                                                                                                            |
| RLS                         | PASSOU                     | "toda tabela com workspace_id tem RLS ativa e política" e "o papel da aplicação não ignora RLS nem é dono das tabelas"                                                           |
| isolamento                  | PASSOU                     | A não lê, não grava com workspace_id de B, não altera/apaga B, não cria relação com entidade de B, não move dados para B; sem contexto nada é visível; operações legítimas em A  |
| runCommand                  | PASSOU                     | commit grava dado+evento+auditoria (1/1/1); falha desfaz tudo; idempotencyKey evita duplicata                                                                                    |
| outbox                      | PASSOU                     | relay reserva lote, segundo claim retorna 0 (SKIP LOCKED), `markProcessed` marca o lote                                                                                          |
| auditoria                   | PASSOU                     | novo teste: actor/workspace/action/entity/entity_id corretos, before/after coerentes (criação e alteração só com campos mudados), nenhum segredo na linha                        |
| Next.js build               | PASSOU                     | `✓ Compiled successfully in 31.1s`; rotas `/`, `/_not-found`, `/api/debug/emit`, `/api/health`, `/api/inngest`; First Load JS 163 kB                                             |
| Smoke test do build         | PASSOU                     | `next start`: `GET /api/health` → `{"status":"ok","db":true,...}`; `POST /api/debug/emit` → `{"eventId":"…"}`; página inicial mostra outbox e SLA                                |
| pnpm verify                 | PASSOU                     | format → lint → typecheck → test → test:integration → build, exit code 0                                                                                                         |
| Inngest (relay em execução) | DEPENDE DE SERVIÇO EXTERNO | o smoke test com Inngest Dev Server (`pnpm dev:jobs`) não foi executado; o evento fica pendente no outbox até o relay rodar, como esperado. Lógica do relay coberta pelos testes |
| Sentry, Axiom, Neon, Vercel | DEPENDE DE SERVIÇO EXTERNO | Sentry desligado sem DSN; Postgres local no lugar do Neon                                                                                                                        |

## Correções feitas nesta rodada

| Problema                                                                               | Causa                                                                                                                                              | Correção                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `prettier --check` falhava em `.github/workflows/ci.yml` (`Unexpected flow-map-start`) | `concurrency: { group: ci-${{ github.ref }}, … }`: o `{{` dentro de um mapa inline é YAML inválido (o GitHub também rejeitaria)                    | `concurrency` reescrito em formato de bloco                                                                  |
| `prettier --check` acusava 55 arquivos                                                 | código escrito sem rodar o Prettier                                                                                                                | `prettier --write .` (só formatação); `.prettierignore` passou a ignorar `docs/reference`, `*.log`, `.turbo` |
| Lint: `'appDb' is defined but never used` em `command.int.test.ts`                     | import sobrando                                                                                                                                    | import removido                                                                                              |
| Typecheck: `ClaimedEvent does not satisfy the constraint Record<string, unknown>`      | `db.execute<T>` exige `Record<string, unknown>`; uma `interface` não satisfaz essa restrição                                                       | `ClaimedEvent` virou `type`                                                                                  |
| **Bug real:** `markProcessed` falhava com `malformed array literal`                    | o Drizzle expande arrays JS em lista `($1, $2…)`, então `any(${ids}::uuid[])` gerava SQL inválido. O relay nunca marcaria eventos como processados | `where id in (…)` com `sql.join` de `::uuid`. Sem enfraquecer o teste                                        |
| Lacuna conhecida: o teste do `runCommand` só conferia a existência do audit_log        | cobertura incompleta                                                                                                                               | novo teste com asserções de conteúdo: ator, workspace, ação, entidade, before/after e ausência de segredos   |

## Warnings relevantes

- Build: o Sentry recomenda um `global-error.js` com instrumentação para erros de renderização do React. Não bloqueia; fica para quando houver telas (Bloco 1).
- Install: avisos de peer do `@opentelemetry/api` (dependência transitiva do Inngest e do Sentry). Sem efeito observado.

## Comandos executados

```bash
pnpm install
cp .env.example .env && set -a && . ./.env && set +a
pnpm db:roles && pnpm db:migrate && pnpm db:seed
pnpm --filter @aos/db check
pnpm verify 2>&1 | tee verify.log
pnpm test:integration          # segunda execução (estabilidade)
```

## STATUS DO SPRINT 0

**SPRINT 0 CONCLUÍDO E VALIDADO**

Pronto para autorização do Sprint 1. Pendente apenas o que depende de serviço externo (Inngest Dev Server/Cloud, Sentry, Neon, Vercel).
