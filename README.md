# Agency OS

Sistema operacional da Agência 4P: Comercial → Clientes → Operação → Conteúdo → Aprovações → Financeiro → Performance.
A **arquitetura técnica V3** (`docs/ARCHITECTURE.md`) é a fonte de verdade. Decisões em `docs/DECISIONS.md`.

Status: **Blocos 1 a 12 implementados** (CHECKPOINT 1 em `docs/CHECKPOINT-1.md`; entrega final em `docs/ENTREGA-FINAL.md`). Equipe: `manuella@demo.local` · Portal: `contato@cafeaurora.demo.local` (senha de dev `demo1234`).

## Requisitos

- Node 20.11+ (`.nvmrc`) e pnpm 9 (`corepack enable`)
- Docker (Postgres local) — ou uma branch do Neon
- Opcional: conta Inngest, Sentry e Axiom (veja `.env.example`)

## Primeira execução

```bash
corepack enable
pnpm install                 # gera o pnpm-lock.yaml na primeira vez
cp .env.example .env         # ajuste se não usar os padrões do Docker
pnpm db:up                   # Postgres 16 em localhost:5432
pnpm db:roles                # cria o papel aos_app (RLS vale para ele)
pnpm db:migrate              # aplica packages/db/migrations
pnpm db:seed                 # plataforma (cargos, expediente, feriados, SLA) + demonstração da Agência 4P
pnpm dev                     # http://localhost:3000 → login com manuella@demo.local / demo1234
pnpm dev:jobs                # em outro terminal: servidor local do Inngest (http://localhost:8288)
```

As variáveis são carregadas pelo seu shell/gerenciador (ex.: `direnv`, `dotenv -e .env --`, ou `export $(cat .env | xargs)`). O Next lê `.env` sozinho; os scripts de banco precisam das variáveis exportadas.

## Comandos

| Comando                     | O que faz                                                   |
| --------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                  | Next.js em modo desenvolvimento                             |
| `pnpm dev:jobs`             | Inngest Dev Server apontando para `/api/inngest`            |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                           |
| `pnpm typecheck`            | `tsc --noEmit` em todos os pacotes                          |
| `pnpm test`                 | testes unitários (inclui os 38 casos de SLA)                |
| `pnpm test:integration`     | RLS, isolamento, outbox e auditoria em Postgres real        |
| `pnpm build`                | build de produção                                           |
| `pnpm verify`               | tudo acima, na ordem do CI                                  |
| `pnpm db:generate`          | gera migração a partir do schema Drizzle                    |
| `pnpm db:reset`             | zera o banco local e recria (bloqueado em staging/produção) |
| `pnpm db:studio`            | Drizzle Studio                                              |

## Como validar o caminho de eventos localmente

```bash
curl -X POST http://localhost:3000/api/debug/emit   # só funciona com APP_ENV=local
```

No painel do Inngest (localhost:8288) aparecem: `aos/outbox.flush` → `outbox-relay` → `aos/system.healthcheck` → `event-probe`.
A página inicial mostra "Eventos pendentes no outbox" voltando a 0.

## Estrutura

```
apps/
  web/                 Next.js (App Router): UI, tRPC, Better Auth, endpoint do Inngest
  e2e/                 testes Playwright
packages/
  sla/                 engine de SLA (pura, sem I/O) + testes
  db/                  schema Drizzle, migrações SQL, RLS, seeds, testes de isolamento
  events/              catálogo de eventos + outbox (emit, claim, mark)
  audit/               Audit Service (diff + redação de segredos)
  core/                runCommand: transação + evento + auditoria
  domain/              serviços de domínio (crm, clientes, tarefas, SLA, conteúdo, aprovações, financeiro, automações)
  jobs/                Inngest: relay do outbox, watchdog, consumidores
  logger/              logs estruturados (pino) com redação
  env/                 validação de variáveis de ambiente (zod)
docs/                  arquitetura, decisões, relatório da sprint
.github/workflows/     CI (verify) e migração de produção
```

## Regras de código

1. Toda ação de negócio passa por `runCommand` (transação + `emit` + `audit`). Nenhum módulo envia e-mail/WhatsApp direto.
2. Toda tabela de negócio tem `workspace_id`, FK composta `(workspace_id, id)`, RLS e entra em `TENANT_TABLES` no teste de isolamento.
3. Prazos só pelo `@aos/sla`. Nunca "+24h".
4. `adminDb()` só em migração, seed, relay e jobs entre workspaces. Rotas de usuário usam `appDb()` + `withTenant`.
5. Segredos só no servidor. Nada sensível com prefixo `NEXT_PUBLIC_`.
6. Mudou uma decisão da V3? Pare e registre em `docs/DECISIONS.md` com aprovação.
