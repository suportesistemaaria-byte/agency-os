# Entrega final — Blocos 8 a 12

Data: 2026-11-03 · Continuação do `docs/CHECKPOINT-1.md` (Blocos 1 a 7), sem parada entre blocos, conforme o handoff.

Repositório: https://github.com/suportesistemaaria-byte/agency-os (`main`). Há um commit por bloco: `bloco-8` até `bloco-12`.

## Como abrir

```bash
corepack enable && pnpm install
cp .env.example .env && set -a && . ./.env && set +a
pnpm db:up && pnpm db:roles && pnpm db:migrate && pnpm db:seed
pnpm dev            # http://localhost:3000
```

| Acesso                        | Usuário                                                         | Senha (só dev) |
| ----------------------------- | --------------------------------------------------------------- | -------------- |
| Equipe: Gestora/Admin         | `manuella@demo.local` (demais perfis no CHECKPOINT 1)           | `demo1234`     |
| Portal: aprova e comenta      | `contato@cafeaurora.demo.local` · `contato@terramar.demo.local` | `demo1234`     |
| Portal: só comenta e solicita | `ana@terramar.demo.local`                                       | `demo1234`     |

O portal fica em http://localhost:3000/portal e é pensado primeiro para o celular.

## O que foi implementado

**Bloco 8: Financeiro completo**

- **Aditivo de contrato:** upsell e renovação ganhos viram aditivo do contrato vigente, sem criar um cliente novo.
  - É idempotente e fica registrado (somente inclusão).
  - O setup do aditivo vira uma cobrança.
  - A renovação estende a vigência em 12 meses e guarda a data anterior.
- **Recorrência:** despesas recorrentes mensais e mensalidades são geradas pelo cron diário, sem duplicar.
- **Inadimplência:** saldo vencido por cliente em faixas de 1–30, 31–60, 61–90 e 90+ dias, com a taxa de inadimplência.
- **Fluxo de caixa:** realizado por mês, projeção semanal pelos vencimentos e menor saldo projetado.
- **Resultado da competência:** faturado menos despesas, por categoria.
- **Recebimentos:** lista de pagamentos, e o dashboard financeiro ganhou atalhos para inadimplência, saldo projetado e resultado.

**Bloco 9: Gestão**

- **Campanhas** por cliente, com conteúdos vinculados (só do mesmo cliente) e progresso.
- **Reuniões** com ata. Cada decisão vira uma tarefa do responsável, com prazo pela `@aos/sla`.
- **Arquivos e assets**, com filtro por cliente. O escopo vem do cliente dono do arquivo.
- **Equipe:** carga por pessoa (abertas, atrasadas, vencendo na semana, em revisão, bloqueadas e concluídas em 30 dias).
- **Painel executivo por perfil:**
  - MRR e inadimplência;
  - SLA cumprido em 30 dias e taxa de aprovação de primeira;
  - forecast, saúde da carteira, clientes em risco com os fatores e relógios de SLA abertos.
- **Health score:** snapshot diário salvo em `client_health_scores` e evento quando varia 10 pontos ou mais.

**Bloco 10: Portal do cliente**

- **Isolamento no banco:** política RESTRITIVA `portal_scope` em todas as tabelas com `workspace_id`.
  - O contato só enxerga uma lista explícita do próprio cliente; qualquer tabela fora da lista fica vazia.
  - Conteúdos aparecem só a partir do envio ao cliente, e comentários só os marcados como "visível ao cliente".
  - Faturas aparecem só para quem recebe o financeiro.
  - Os nomes da equipe interna ficam ocultos.
- **Telas:** Início, Conteúdos, Aprovações (em lote e com marcação na arte por toque), Solicitações (entram em triagem com SLA de 2 horas úteis), Reuniões, Arquivos (e cobranças, se o contato tiver a flag) e Resultados.
- **Flags do contato respeitadas:** visualizar, comentar, solicitar, aprovar, financeiro e notificações.
- **Sessão:** 30 dias para o portal, e aprovar exige sessão recente ou a senha de novo (decisão 7 da V3).
- **Acesso:** o convite é enviado pelo contato, na aba Configurações do cliente. Usuário de portal nunca entra no app interno.

**Bloco 11: Performance**

- **Métricas** manuais e por CSV.
  - O CSV aceita separador `;` ou `,`, data DD/MM/AAAA e decimal com vírgula, e aponta a linha com erro.
  - Reimportar o mesmo ponto corrige o valor em vez de duplicar.
- **Visão de performance:** KPIs com variação mensal, evolução de 6 meses, melhores conteúdos por engajamento, metas do mês com progresso e aprendizados (hipótese → validado ou descartado).
- **Onde aparece:** no módulo Inteligência, na aba Performance do cliente e em Resultados no portal. Os aprendizados ficam só para a equipe.

**Bloco 12: Automações**

- **Tela de automações** (Configurações → Automações): regras com ativação, contadores, histórico filtrável (ok, ignoradas, falhas) e "Reprocessar".
- **Regras iniciais ativas:** `proposal.sent`, `content.change_requested`, `task.assigned`, `invoice.overdue`, `contract.expiring` e `request.created`, além de alertas de SLA, venda ganha e conteúdo enviado.
- **`contract.expiring`:** o cron emite uma vez por contrato e marco (90, 60, 30, 15 e 7 dias), e a regra cria a oportunidade de renovação uma única vez.
- **Proteções:**
  - limite de profundidade 3 (regra disparando regra);
  - condições simples sobre o payload;
  - uma execução bem-sucedida por regra e evento.
- **Preferências de notificação** por pessoa e tipo de aviso (app, e-mail, WhatsApp).
  - Cada canal extra tem no máximo uma entrega por notificação.
  - E-mail usa um adaptador que escreve no log; WhatsApp usa um adaptador desligado (`WHATSAPP_ENABLED=0`).

## Resultado dos testes (saída real)

`pnpm verify` (format → lint → typecheck → unitários → integração → build): **exit code 0**

```
@aos/audit:test:       Tests  4 passed (4)
@aos/logger:test:      Tests  2 passed (2)
@aos/sla:test:         Tests  38 passed (38)
@aos/env:test:         Tests  3 passed (3)
@aos/events:test:      Tests  5 passed (5)
@aos/domain:test:      Tests  33 passed (33)
@aos/core:test:integration:    Tests  5 passed (5)
@aos/db:test:integration:      Tests  12 passed (12)     ← RLS + política do portal em todas as tabelas
@aos/domain:test:integration:  Tests  54 passed (54)
@aos/web:build:  ✓ Compiled successfully
```

Totais: **85 unitários · 71 de integração · 13 E2E**.

Novos testes de integração nos Blocos 8 a 12:

- `finance-plus`: 5 (aditivo idempotente, renovação, recorrência, inadimplência e caixa, permissões);
- `management`: 6 (decisão vira tarefa, campanha, carga, snapshot, painel por perfil, arquivos por escopo);
- `portal`: 8 (isolamento total, notas internas, faturas pela flag, escrita em outro cliente, aprovação pela flag com reautenticação, alteração vira tarefa, solicitação, contato sem "visualizar");
- `performance`: 4;
- `automation-admin`: 5 (condições, `contract.expiring` uma vez, anti-loop, regra desativada e reprocessamento, preferências e entregas únicas).

E2E (Playwright, contra o build de produção):

```
  ✓  auth › rota protegida · senha errada · login/sessão/logout · recuperação · cadastro sem convite · convite por link
  ✓  comercial › marcar como perdida exige motivo e fecha o modal ao concluir
  ✓  permissões › designer · financeiro
  ✓  portal › alteração pelo portal: contato marca a arte, pede alteração e a equipe recebe a tarefa com SLA
  ✓  portal › contato que só comenta não vê Aprovar; portal não abre o app interno
  ✓  venda → cliente
  13 passed
```

## Correções relevantes feitas no caminho

| Problema                                                       | Causa                                                                         | Correção                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Modais de ações sem retorno não fechavam depois do sucesso     | `useAction` devolvia `undefined` no sucesso, que as telas tratavam como falha | Sucesso nunca devolve `undefined`; E2E novo garante que o modal fecha |
| `contract_amendments` faltava em `TENANT_TABLES`               | Edição do Bloco 8 não aplicada por causa da formatação                        | Incluída (a tabela já tinha RLS, que o teste verifica para todas)     |
| Alteração da regra de renovação não chegava ao banco existente | `UPDATE` acrescentado a uma migração já aplicada                              | Movido para a migração `0011`                                         |
| Barras de evolução sem altura                                  | Coluna flex sem altura definida                                               | Coluna com `h-full`                                                   |

## Integrações mockadas (sem mudança desde o CHECKPOINT 1)

| Integração           | Estado                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Inngest              | Despacho local do outbox, mais crons de SLA, cobranças atrasadas, mensalidades, despesas recorrentes, health score e contratos vencendo |
| R2                   | Disco local                                                                                                                             |
| Resend               | Log                                                                                                                                     |
| WhatsApp             | Adaptador desligado                                                                                                                     |
| Sentry, Neon, Vercel | Desligados ou locais                                                                                                                    |

Para ligar em produção, troque os adaptadores e defina as variáveis de ambiente do `.env.example`.

## Pendências conhecidas

- **2FA:** preparado, mas ainda sem tela de ativação e sem a obrigatoriedade efetiva para Admin e Financeiro.
- **Interface:**
  - comentário em vídeo por timestamp (o banco e a API já suportam);
  - geração de PDF da proposta;
  - construtor visual de regras (na fase 1, as regras são editáveis só por ativação, como na V3).
- **Notificações:** SSE em vez de polling, resumo diário às 10h e horário de silêncio.
- **Escala:** paginação por cursor, rate limit por regra/entidade/hora e conexão com Neon, Vercel, Inngest Cloud, R2 e Resend.
- **Contas e dados externos:** a Agência 4P ainda precisa abrir as contas desses serviços e informar os feriados municipais.

## Screenshots

As 51 telas estão em `docs/screenshots/`:

- 01 a 35: Blocos 1 a 7;
- 36 a 42: portal;
- 43: performance;
- 44 e 45: automações e preferências;
- 46 a 51: painel executivo, fluxo de caixa, inadimplência, equipe, reuniões e campanhas.
