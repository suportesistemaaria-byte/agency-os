# Decisões

## Aprovadas na V3 (não alterar sem aprovação)

| #   | Decisão                                                                         |
| --- | ------------------------------------------------------------------------------- |
| 1   | Neon (Postgres) + Better Auth + Cloudflare R2                                   |
| 2   | SLA após pausa: saldo restante em minutos úteis a partir da retomada            |
| 3   | A1: horário que cai na lacuna (almoço) vence no fim do período anterior (13:00) |
| 4   | NEAR_DUE: ≤ 25% do prazo ou ≤ 2 horas úteis, o que vier antes                   |
| 5   | Faturas geradas após confirmação do Financeiro                                  |
| 6   | Ordem das sprints da V3 (arquivos na S3, notificações in-app na S4)             |
| 7   | Sessão do portal: 30 dias, reautenticação para aprovar                          |
| 8   | Leads perdidos: 24 meses, depois anonimização                                   |

## Decisões de implementação da Sprint 0 (dentro da V3, sem mudar arquitetura)

| Tema                  | Escolha                                    | Motivo                                                                               |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Driver Postgres       | `pg` (node-postgres) + Drizzle             | Transações interativas (necessárias para `SET LOCAL`) e compatível com Neon e Docker |
| Dois papéis no banco  | `aos_owner` / `aos_app`                    | RLS só vale para quem não é dono e não tem BYPASSRLS                                 |
| RLS fail-closed       | `NULLIF(current_setting(...), '')::uuid`   | Sem contexto, nenhuma linha                                                          |
| Migrações             | SQL versionado + journal do Drizzle        | Políticas RLS e grants não são geradas pelo drizzle-kit                              |
| Entrega de eventos    | pelo menos uma vez, id = `domain_event.id` | Inngest deduplica; consumidores idempotentes                                         |
| Calendário SLA        | períodos semiabertos `[início, fim)`       | 13:00 e 19:00 exatos não contam como expediente                                      |
| Pausa após vencimento | ignorada no cálculo, status segue OVERDUE  | Não esconder atraso                                                                  |
| Feriados              | por workspace (nacionais no seed)          | Municipais e recessos variam por agência                                             |
| Arrays em SQL bruto   | `sql.join` em vez de `any(${array})`       | O Drizzle expande arrays em lista `($1, $2…)`; `any(...::uuid[])` quebrava o relay   |

## Decisões de implementação dos Blocos 1 a 7 (baixo risco, dentro da V3)

| Tema                         | Escolha                                                                                                                                       | Motivo                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Serviços de domínio          | pacote único `@aos/domain` com módulos por domínio (crm, clients, tasks, requests, content, approvals, finance, sla-clock, automation…)       | V3 prevê `packages/domain/*`; um pacote com fronteiras por arquivo acelera sem acoplar tabelas entre módulos |
| Leitura × escrita            | Server Components leem os serviços direto; mutações por tRPC (`/api/trpc`) com Zod                                                            | V3, seção 3: "Server Components para leitura; Client Components para Kanban, calendário e feed"              |
| Better Auth                  | adaptador nativo `pg` (Kysely) no papel dono, tabelas `users` + `auth_*` com nomes snake_case                                                 | Identidade é global (sem `workspace_id`); evita o peer `drizzle-orm >= 0.45` do adaptador Drizzle            |
| Cadastro                     | só por convite (hook `user.create.before` exige convite pendente)                                                                             | Sem cadastro aberto na equipe                                                                                |
| Workspace da sessão          | cookie `aos_ws` se o usuário for membro; senão o primeiro vínculo ativo                                                                       | Um workspace no MVP; seletor depois                                                                          |
| Membro desativado            | `status = suspended` → sem contexto (não entra)                                                                                               | Ativar/desativar sem apagar histórico                                                                        |
| Permissões                   | `can(ctx, perm, recurso)` puro + `scopeWhere` nas listagens; `own` ⊂ `team`                                                                   | Mesma regra no serviço e nas listas; RLS segue como segunda barreira                                         |
| Despacho de eventos em dev   | `EVENT_DISPATCH=local`: o outbox é despachado no próprio processo após o commit e por intervalo (5 min: SLA, inadimplência)                   | Inngest Dev Server indisponível offline; consumidor é o mesmo `handleEvent` (mockado)                        |
| Gancho pós-commit            | registrado em `globalThis`                                                                                                                    | Next empacota instrumentation e rotas separadamente                                                          |
| Idempotência das automações  | `automation_executions` único por (regra, evento) quando `ok/skipped`; falhas ficam no histórico e podem ser refeitas                         | "Nenhum envio duplicado" sem perder rastreabilidade                                                          |
| Notificações                 | in-app com polling de 30 s (TanStack Query) e `dedupe_key`                                                                                    | SSE fica para depois; polling atende o MVP                                                                   |
| Storage                      | adaptador local em disco (`.data/storage`) atrás da interface `StorageAdapter`; tipo real por magic bytes; SVG bloqueado                      | R2 entra trocando o adaptador (mockado)                                                                      |
| E-mail                       | links de recuperação no log (`adapter: email-log`)                                                                                            | Resend entra por adaptador (mockado)                                                                         |
| Ícones e fonte               | `lucide-react` no lugar de Material Symbols; Geist pelo pacote `geist` (local)                                                                | Sem dependência de CDN; visual equivalente                                                                   |
| Contas a pagar               | despesa com `paid_on` nulo é conta a pagar (tabela `expenses`)                                                                                | Mesma entidade; tabela separada só se o Bloco 8 exigir                                                       |
| Prazo de resposta do cliente | 2 dias úteis após o envio, pela `@aos/sla`, define "Atrasado" na central de aprovações                                                        | Regra objetiva para a aba Atrasado                                                                           |
| Health score                 | calculado na leitura com fatores explicados (financeiro, tarefas, aprovações, alterações, renovação)                                          | Snapshot diário em `client_health_scores` fica para o Bloco 9                                                |
| Upsell/renovação ganho       | não vira cliente novo (exige aditivo, Bloco 8)                                                                                                | V3: "upsell atualiza o contrato por aditivo"                                                                 |
| Faturas                      | geradas pela automação `contract.confirmed` (setup na competência de início + mensalidades até a atual), únicas por contrato+competência+tipo | Decisão 5 da V3 e idempotência                                                                               |

| Rate limit do login | limitador nativo do Better Auth (memória, ativo em produção) com mensagem própria na tela | Upstash entra quando houver mais de uma instância |

## Pendentes de confirmação (não bloqueiam a Sprint 1)

- Repositório Git e organização Vercel/Neon/Inngest/Sentry em nome da Agência 4P.
- Feriados municipais/estaduais da cidade da agência.
