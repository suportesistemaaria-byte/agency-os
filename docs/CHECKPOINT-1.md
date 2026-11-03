# CHECKPOINT 1 — Agency OS

Data: 2026-11-02 · Blocos 1 a 7 + Financeiro básico · base: V3 aprovada e protótipo (direção D)

> Este é o primeiro ponto de parada do handoff: **aguardando sua validação para seguir com os Blocos 8 a 12.**

## 1. Como abrir

- **Local:** http://localhost:3000. A raiz leva a `/hoje`; sem sessão, a tela é o `/login`.
- **Preview:** não há. Vercel, Neon e o repositório GitHub ainda não estão conectados (veja a seção 5).
- Página técnica da fundação (outbox, SLA, Sentry): `/sistema`.

## 2. Usuários de demonstração (senha só de dev: `demo1234`)

| Perfil       | E-mail                | Cargos                   | O que mostra                                                                  |
| ------------ | --------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| Gestora      | `manuella@demo.local` | Gestor + Admin           | Vê e configura tudo, inclusive a aprovação em nome do cliente                 |
| Atendimento  | `bia@demo.local`      | Atendimento              | Clientes da equipe dela; solicitações e conteúdos                             |
| Comercial    | `leo@demo.local`      | Comercial                | Pipeline, leads e propostas; clientes sem valores; sem Financeiro             |
| Social media | `nina@demo.local`     | Social media             | Conteúdos dos clientes da equipe                                              |
| Copywriter   | `caio@demo.local`     | Copywriter               | Conteúdos da equipe e as próprias tarefas                                     |
| Designer     | `rafa@demo.local`     | Designer                 | Só os clientes em que está na equipe (5 de 8); sem Financeiro e sem Comercial |
| Editor       | `duda@demo.local`     | Editor                   | Próprias tarefas (vídeo)                                                      |
| Tráfego      | `theo@demo.local`     | Tráfego                  | Clientes da equipe e próprias tarefas                                         |
| Financeiro   | `lia@demo.local`      | Financeiro               | Financeiro completo; sem Conteúdos e sem Comercial                            |
| Workspace B  | `teste@demo.local`    | Admin de outro workspace | Usado para provar o isolamento (não vê nada da Agência 4P)                    |

Os dados são fictícios e seguem o protótipo:

- **8 clientes:** Terra Mar, Café Aurora, Clínica Vitta, Studio Nobre, Ótica Prisma, Pão de Casa (em onboarding, com contrato aguardando o Financeiro), Academia Ritmo e Empório Sabiá (pausado).
- **Pipeline:** Empresa X, Hotel Brisa, Vinícola Serra, Studio K (ganha, ainda sem conversão) e outras. Também há oportunidades sem resposta, pausadas e perdidas.
- **Solicitações** em todos os status de SLA: No prazo, Próximo, Atrasado, Pausado, Bloqueado e Cumprido.
- **Conteúdos** nas 11 etapas, com artes, versões, marcações e aprovações.
- **Financeiro:** faturas pagas, a receber e atrasadas (Clínica Vitta), além de 6 meses de despesas.

## 3. Funcionalidades implementadas

**Bloco 0: Fundação.** Validada no commit `bloco-0`, com o `pnpm verify` passando.

**Bloco 1: Core utilizável**

- **Better Auth** no nosso Postgres:
  - login com e-mail e senha, logout e sessão no banco (expira em 12h);
  - recuperação de senha, com o link no log em dev;
  - middleware de proteção de rotas e limitador de tentativas de login;
  - plugin de 2FA instalado e com tabelas criadas. A obrigatoriedade para Admin e Financeiro aparece como "pendente" na tela de usuários.
- **Workspace pela sessão:** toda leitura passa por `withTenant` (RLS) e toda escrita por `runCommand`.
- **Usuários e permissões:**
  - os 11 cargos da V3 e permissões com escopo `all/team/own`;
  - vários cargos por pessoa e exceções individuais (conceder ou negar);
  - matriz editável de cargos × permissões;
  - convite por link (cadastro só por convite) e ativar/desativar membro.
  - `can(ctx, perm, recurso)` roda no servidor e a interface só esconde o que o servidor já bloqueia. Página sem permissão leva a `/sem-permissao`.
- **Layout D:**
  - sidebar por grupos, filtrada por permissão e recolhível abaixo de 1024px;
  - breadcrumbs, busca ⌘K (respeita permissões), botão Criar e notificações in-app (polling de 30 s);
  - componentes base: botão, input, select, pill de status, tabela, card, drawer, modal, toast com "Desfazer", skeleton, estado vazio e tela de erro.
- **Configurações de expediente, feriados e políticas de SLA.** Mudar a política vale só para relógios novos.

**Bloco 2: Comercial**

- **Dashboard:**
  - pipeline potencial e forecast;
  - MRR vendido no mês contra a meta;
  - funil por etapa e follow-ups vencidos;
  - propostas por status e perdas por motivo.
- **Pipeline Kanban:**
  - arrastar e soltar com dnd-kit, atualização otimista e "Desfazer";
  - estados paralelos (Sem resposta, Pausado, Perdido com motivo obrigatório);
  - o card mostra empresa, temperatura, MRR, responsável, última interação, próxima ação e prazo.
- **Oportunidade:**
  - próxima ação obrigatória ("Concluir e definir a próxima", "Reagendar");
  - registro de atividades dos 9 tipos e timeline;
  - abas de propostas, reuniões e histórico (auditoria).
- **Propostas:** versões imutáveis (v1, v2…), itens de setup e mensais, enviar, registrar aceite e registrar recusa.
- **Automação `proposal.sent`:** follow-ups D+2, D+5 e D+10 em dias úteis, sem duplicar.
- **Lead novo** já nasce com a próxima ação "1º contato" em 2 horas úteis, calculada pela `@aos/sla`.

**Conversão Lead → Cliente (`crm.convertOpportunity`, V3 seção 7)**

- Tudo em uma transação, com `SELECT … FOR UPDATE`.
- Exige oportunidade ganha com proposta aceita.
- Reaproveita a empresa e as pessoas do lead (sem recadastro).
- Cria em um único passo:
  - cliente em onboarding;
  - contatos, com o principal podendo aprovar e recebendo o financeiro;
  - contrato a partir da proposta aceita, aguardando o Financeiro;
  - equipe da conta;
  - onboarding de 13 etapas com prazos em dias úteis;
  - auditoria e os 4 eventos.
- É idempotente.

**Bloco 3: Clientes**

- **Carteira:** lista e cards; filtros Saudáveis, Atenção, Críticos e Onboarding; health score com fatores explicados; MRR só para quem tem `financeiro.view`.
- **Workspace com as 13 abas:** Visão geral, Conteúdos (prévia do feed), Calendário, Kanban, Solicitações, Tarefas, Aprovações, Campanhas, Reuniões, Arquivos, Performance (Bloco 11), Financeiro e Configurações.
  - A aba Configurações reúne os contatos com as 6 permissões do portal, a equipe da conta (responsável padrão por função), contrato e serviços, dados da empresa e histórico.
- **Sem entidades paralelas:** as abas reutilizam os módulos globais filtrados por `clientId`.
- **Onboarding:** quadro com progresso e etapas marcáveis. Ao concluir todas, o cliente passa a Ativo.

**Bloco 4: Tarefas, solicitações e SLA**

- **Tarefas:**
  - visões Hoje, Próximas, Atrasadas e Concluídas, com "Minhas" ou "Todas que posso ver";
  - participantes, prioridade, dependências (bloqueiam a conclusão), arquivos, comentários e histórico;
  - troca de responsável e alteração manual de SLA (exige `sla.override` e motivo, que vai para a auditoria);
  - "Bloqueado por" registra motivo, quem resolve, início e observação, e pausa o SLA.
- **Solicitações:**
  - os 8 tipos, no fluxo Recebida → Triagem → Responsável → Em produção → Revisão → Aprovação → Entregue;
  - a triagem fecha o relógio de 2 horas úteis, abre o de produção pela política do tipo e cria a tarefa no mesmo relógio, com o responsável padrão da equipe;
  - em "Aprovação" o relógio pausa como aguardando cliente.
- **SLA persistido** em `sla_clocks` e `sla_intervals`, sempre pela `@aos/sla`:
  - snapshot da política e status ao vivo (No prazo, Próximo, Atrasado, Pausado, Bloqueado);
  - cron de 5 min que emite `sla.near_due` e `sla.overdue` uma única vez cada.

**Bloco 5: Conteúdos**

- Visões Calendário (mês), Kanban (arrastar entre as etapas de produção), Feed e Lista.
- No Feed, `scheduled_at` nulo vai para a gaveta e reordenar troca as datas.
- Detalhe com:
  - versões imutáveis, cada uma com hook, legenda e CTA próprios e com arquivos (carrossel por página);
  - etapas Ideia → Planejamento → Produção → Copy → Design → Revisão interna → Aprovação do cliente → Alteração → Aprovado → Agendado → Postado.

**Bloco 6: Aprovações**

- **Central** com as abas Aguardando, Alteração, Aprovado e Atrasado. O prazo de resposta do cliente é de 2 dias úteis, pela `@aos/sla`.
- **No conteúdo:**
  - prévia, legenda, data, plataforma e versão;
  - comentários internos ou visíveis ao cliente;
  - marcação na arte por clique (x/y em %, por versão e por página do carrossel).
- **Aprovação em nome do cliente:** exige permissão e justificativa (CHECK no banco + auditoria), também em lote e de forma atômica.
- **`content.change_requested`:** cria a tarefa para o designer padrão da conta com SLA de Alteração. A V2 volta para revisão interna sem sobrescrever a V1.
- **Comentário por timestamp de vídeo:** o banco (`video_ms`) e a API já suportam, mas a interface faz só marcação em imagem.

**Bloco 7: Hoje**

- Blocos por perfil, cada um só se a permissão permitir:
  - indicadores e "Minhas prioridades" (Atrasadas, Para hoje, Alterações), com conclusão rápida e "Desfazer";
  - aguardando cliente e reuniões de hoje;
  - follow-ups comerciais e alertas financeiros.

**Financeiro básico**

- Contratos: o Financeiro confirma e a automação gera o setup e as mensalidades, de forma idempotente.
- Contas a receber: registrar pagamento (inclusive parcial, nunca acima do saldo, com trigger no banco), cobrança avulsa e cancelamento com motivo.
- MRR e os **5 conceitos separados** (Pipeline potencial, Forecast, Contratado, Faturado, Recebido).
- Despesas e contas a pagar básicas.
- Cron diário marca as cobranças atrasadas (`invoice.overdue` uma vez).

**Motor de automações (antecipado do Bloco 12, porque os Blocos 2 e 6 dependem dele)**

- `automation_rules` com 10 regras iniciais e histórico em `automation_executions`.
- Idempotência por regra e evento, com falhas registradas e possibilidade de nova tentativa.

## 4. Pendentes

- **Commits por bloco:** os Blocos 1 a 7 ficaram num commit consolidado (`bloco-1-a-7`). O modelo de dados, o router e o motor de automações são compartilhados entre os blocos e foram escritos juntos, então separar por bloco geraria commits que não compilam sozinhos. A partir do Bloco 8, volta a ser um commit por bloco.
- **2FA:** preparado (plugin e tabelas), mas a tela de ativação e a obrigatoriedade efetiva para Admin e Financeiro ainda não existem.
- **Portal do cliente (Bloco 10)** e o E2E "alteração pelo portal". O serviço `contactDecision` (aprovar ou pedir alteração como contato, respeitando as flags) já existe e está pronto para a interface.
- **Interface:**
  - comentário em vídeo por timestamp (só falta a interface);
  - criação de campanhas (só listagem por enquanto);
  - geração de PDF da proposta;
  - paginação por cursor e "ver mais" no Kanban (as listas carregam até 200 itens).
- **Health score:** calculado na leitura. O snapshot diário em `client_health_scores` fica para o Bloco 9.
- **Notificações:** só in-app, por polling. SSE, resumo diário, preferências e horário de silêncio entram no Bloco 12.
- **Telas reservadas na navegação para os blocos seguintes:** Painel executivo, Equipe, Reuniões, Arquivos, Performance e Conhecimento.

## 5. Erros e limitações conhecidos

- **Nada foi enviado ao GitHub.** A sessão não tem acesso ao repositório `suportesistemaaria-byte/agency-os`: o GitHub responde "you don't have access" e a lista de repositórios visíveis vem vazia. Todo o histórico está em git local e em `/home/user/agency-os.bundle`.
- O Docker não estava disponível neste ambiente, então foi usado Postgres 16 nativo com as mesmas credenciais do `docker-compose.yml`.
- **O seed usa datas relativas ao momento em que roda.** Ele foi gerado em 02/11 (Finados) à noite, por isso algumas telas mostram "Nada atrasado" para a gestora. Os itens atrasados são de outras pessoas, como a alteração do Menu Kids, da equipe de Design.
- **Os testes de integração gravam dados de teste** ("Empresa Teste …") no banco local. Para voltar à demonstração limpa, rode `pnpm db:reset && pnpm db:seed`.
- **O limitador de login do Better Auth fica em memória:** muitos logins seguidos com o mesmo usuário recebem "Muitas tentativas" por cerca de 10 s. É intencional.
- **Aviso no build:** "Next.js plugin was not detected in your ESLint configuration". O lint usa a configuração do projeto e o aviso não afeta o build.

## 6. Integrações mockadas (adaptadores locais, atrás das interfaces da V3)

| Serviço                        | Em dev                                                                                                                                                              | Produção                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Inngest                        | `EVENT_DISPATCH=local`: o outbox é despachado no próprio processo após cada commit e a cada 5 min (SLA e cobranças atrasadas); `POST /api/cron` dispara manualmente | Relay + Inngest (`EVENT_DISPATCH=inngest`), mesmo consumidor `handleEvent` |
| R2 (arquivos)                  | disco local `apps/web/.data/storage`, tipo real por magic bytes, SVG bloqueado                                                                                      | adaptador R2 com URL assinada                                              |
| Resend (e-mail)                | link de recuperação no log (`adapter: email-log`)                                                                                                                   | adaptador Resend                                                           |
| WhatsApp                       | não conectado (fase F1.5)                                                                                                                                           | adaptador desligado por feature flag                                       |
| Sentry / Axiom / Neon / Vercel | desligados ou locais                                                                                                                                                | conforme `.env.example`                                                    |

## 7. Resultado dos testes críticos (saída real)

`pnpm verify` (format → lint → typecheck → unit → integration → build): **exit code 0**

```
@aos/events:test:  ✓ src/catalog.test.ts (5 tests)
@aos/audit:test:   ✓ src/diff.test.ts (4 tests)
@aos/logger:test:  ✓ src/redact.test.ts (2 tests)
@aos/env:test:     ✓ src/env.test.ts (3 tests)
@aos/sla:test:     ✓ src/engine.test.ts (38 tests)
@aos/domain:test:  ✓ src/finance-calc.test.ts (13 tests)   ← 5 conceitos, MRR, pagamento parcial
@aos/domain:test:  ✓ src/health.test.ts (4 tests)
@aos/domain:test:  ✓ src/permissions.test.ts (10 tests)    ← can() + escopos all/team/own
@aos/db:test:integration:     ✓ src/isolation.int.test.ts (11 tests)   ← RLS em todas as tabelas com workspace_id (66 em TENANT_TABLES)
@aos/core:test:integration:   ✓ src/command.int.test.ts (5 tests)
@aos/domain:test:integration: ✓ src/convert.int.test.ts (5 tests)      ← sucesso, falha no meio, chamada repetida
@aos/domain:test:integration: ✓ src/approvals.int.test.ts (4 tests)    ← versão imutável, em nome com justificativa, lote atômico
@aos/domain:test:integration: ✓ src/sla.int.test.ts (5 tests)          ← triagem 2h úteis, pausa/retomada, bloqueio, cron 1×
@aos/domain:test:integration: ✓ src/finance.int.test.ts (3 tests)      ← confirmação → faturas, parcial, trigger anti-sobrepagamento
@aos/domain:test:integration: ✓ src/permissions.int.test.ts (6 tests)  ← escopos reais, exceções, desativação, workspace B
@aos/domain:test:integration: ✓ src/automation.int.test.ts (3 tests)   ← follow-ups sem duplicar, notificação única, outbox vazio
@aos/web:build:  ✓ Compiled successfully in 26.8s
```

Totais: **unitários 79/79 · integração 42/42 · build OK (47 rotas)**.

E2E com Playwright, contra o build de produção (`next start`):

```
  ✓  1 auth › rota protegida sem sessão vai para o login
  ✓  2 auth › senha errada mostra erro e não entra
  ✓  3 auth › login, sessão e logout
  ✓  4 auth › recuperação de senha confirma o envio (link no log em dev)
  ✓  5 auth › cadastro sem convite é recusado
  ✓  6 auth › convite por link: admin convida, pessoa cria a senha e entra com o cargo
  ✓  7 permissões › designer: sem Financeiro e sem Comercial; vê só clientes da equipe
  ✓  8 permissões › financeiro: vê o Financeiro e não vê Conteúdos
  ✓  9 venda → cliente: lead, proposta aceita, ganho, conversão e contrato confirmado pelo Financeiro
  9 passed (1.4m)
```

O CI (`.github/workflows/ci.yml`) roda o `verify` e em seguida o E2E.

## 8. Instruções para executar

```bash
corepack enable && pnpm install
cp .env.example .env && set -a && . ./.env && set +a
pnpm db:up            # ou um Postgres 16 local com as mesmas credenciais
pnpm db:roles && pnpm db:migrate && pnpm db:seed    # seed de plataforma + demonstração
pnpm dev              # http://localhost:3000  → entre com manuella@demo.local / demo1234
```

Outros comandos:

- `pnpm verify`: pipeline completo do CI.
- `pnpm build && pnpm --filter @aos/e2e test:e2e`: E2E. Sobe o `next start` na porta 3100, ou usa `E2E_BASE_URL`.
- `pnpm db:reset && pnpm db:seed`: volta à demonstração limpa.
- `curl -X POST localhost:3000/api/cron`: roda SLA, cobranças atrasadas e o despacho do outbox na hora.

## 9. Screenshots (`docs/screenshots/`)

| #                      | Tela                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| 01                     | Login                                                                                        |
| 02 · 03 · 30 · 31      | Hoje: Gestora, Designer, Financeiro e Comercial (blocos diferentes por perfil)               |
| 04 · 05 · 06 · 07      | Dashboard comercial · Pipeline Kanban · Oportunidade (próxima ação vencida) · Leads          |
| 08 · 09 · 10 · 11 · 12 | Carteira · Cliente (visão geral) · Prévia do feed · Contatos, equipe e contrato · Onboarding |
| 13 · 14                | Tarefas atrasadas · Tarefa bloqueada (SLA pausado)                                           |
| 15 · 16                | Solicitações com status de SLA · Solicitação atrasada (relógios e pausas)                    |
| 17 · 18 · 19           | Conteúdos Kanban · Calendário · Alteração com marcadores na arte                             |
| 20 · 21                | Central de aprovações · Calendário geral                                                     |
| 22 · 23 · 24 · 25      | Financeiro (5 conceitos) · Contas a receber · Despesas · Contratos                           |
| 26 · 27 · 28           | Usuários e convites · Cargos × permissões (escopos) · Expediente, feriados e SLA             |
| 29                     | Designer sem permissão no Financeiro                                                         |
| 32 · 33 · 34 · 35      | Busca ⌘K · Notificações · Criar solicitação · Responsivo em 390px                            |

## 10. Próximos passos (após a sua validação)

1. **Conectar o GitHub** e enviar o histórico (Bloco 0 + este checkpoint) para a `main`.
2. **Bloco 8: Financeiro completo.** Receitas, contas a pagar com recorrência, inadimplência por cliente, fluxo de caixa (`cash_movements`), dashboard financeiro e aditivo de upsell.
3. **Bloco 9: Gestão.** Campanhas, reuniões (decisão vira tarefa), arquivos e assets, carga da equipe, painel executivo e snapshot diário do health score.
4. **Bloco 10: Portal do cliente** (mobile-first).
   - Usa o `contactDecision` já pronto.
   - Testes de isolamento do portal e E2E "alteração pelo portal".
5. **Bloco 11: Performance.** Métricas manuais e por CSV, melhores conteúdos, metas e aprendizados.
6. **Bloco 12: Automações.** Tela de regras, histórico de execuções, preferências e resumo das notificações, e regras `task.assigned`, `invoice.overdue`, `contract.expiring` e `request.created` editáveis por ativação.
7. **Em paralelo, decisões externas:**
   - contas Neon, Vercel, Inngest, Sentry e R2 em nome da Agência 4P;
   - feriados municipais;
   - ativação obrigatória do 2FA.
