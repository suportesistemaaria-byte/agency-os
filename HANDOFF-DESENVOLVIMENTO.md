# Handoff — Desenvolvimento acelerado (Blocos 0 a 12)

Substitui a estratégia de "parar a cada sprint". A V3 (`docs/reference/Agency OS Arquitetura Tecnica.dc.html`) e o protótipo aprovado (`docs/reference/Agency OS Prototipo.dc.html`, direção D) continuam sendo a fonte de verdade. Abra o protótipo no navegador: a barra preta do topo troca perfil (Gestora, Designer, Comercial, Financeiro), roda os fluxos guiados e alterna para o Portal.

## Como trabalhar

- Implemente código funcional. Nada de novas especificações.
- Decisões técnicas de baixo risco: decida e registre em uma linha em `docs/DECISIONS.md`.
- Pare e pergunte só em: mudança relevante da V3 · risco de perda de dados · decisão financeira relevante · credencial ou serviço externo · decisão irreversível · conflito entre requisitos.
- Commit por bloco: `bloco-N: resumo`. Rode `pnpm verify` antes de cada commit.
- Não fazer agora: microanimações, pixel perfection, otimização prematura, integrações sociais, IA, app nativo, P2, ajustes cosméticos.

## Stack já definida (V3)

Next.js 15 App Router · tRPC + Zod · TanStack Query · Tailwind + Radix · Drizzle + Postgres (RLS) · Better Auth · Inngest (outbox já pronto) · R2 para arquivos (em dev: storage local em disco atrás da mesma interface) · Resend (em dev: e-mails no log) · Sentry.

Serviços externos ausentes **não bloqueiam**: use adaptadores locais (storage em disco, e-mail no console, Inngest Dev Server) e registre como "mockado" no relatório.

## Bloco 0 — Fechar a fundação (rápido, sem parada)

Siga `HANDOFF-SPRINT-0.md` até `pnpm verify` passar e atualize `docs/validation/SPRINT-0-FINAL-VALIDATION.md`. **Não pare para pedir aprovação**: siga direto para o Bloco 1. Se algo exigir mudar a V3, aí sim pare.

## Bloco 1 — Core utilizável

- **Auth (Better Auth):** login com e-mail e senha, logout, sessão em banco, recuperação de senha (link por e-mail; em dev aparece no log), proteção de rotas por middleware, 2FA preparado para Admin e Financeiro.
- **Workspace:** "Agência 4P" (seed). Resolver o workspace pela sessão e aplicar `withTenant` em toda requisição.
- **Usuários:** membros, cargos (os 11 da V3), permissões granulares com escopo all/team/own, múltiplos cargos por pessoa, exceções individuais, convite por link, ativar/desativar. Função `can(ctx, perm, resource?)` no servidor; a interface só esconde o que o servidor já bloqueia.
- **Layout D:** sidebar com grupos (Principal, Comercial, Clientes, Operação, Gestão, Financeiro, Inteligência, Conhecimento), header com breadcrumbs, ⌘K, botão Criar, notificações in-app (tabela `notifications` + SSE ou polling), componentes base (botão, input, select, badge/pill de status, tabela, card, drawer, modal, toast, skeleton, empty state, erro). Responsivo: sidebar recolhe em < 1024px.
- Tokens visuais (do protótipo): fundo #ffffff, sidebar #fafaf8, borda #ecebe7, texto #1a1a18, secundário #6f6e69, apagado #a3a19b; fonte Geist / Geist Mono; raio 8–10px; sem sombras exceto modais. Cores só com significado: verde ok, vermelho atraso/erro, âmbar atenção, azul informação, roxo alteração.

## Bloco 2 — Comercial / CRM

Telas do protótipo: Dashboard comercial, Pipeline, Leads, Oportunidade, Propostas.

- Tabelas da V3: `organizations`, `people`, `leads`, `pipelines`, `pipeline_stages`, `opportunities`, `lost_reasons`, `commercial_activities`, `next_actions`, `proposals`, `proposal_versions`, `proposal_items`, `sales_goals`.
- Etapas: Novo lead → Contato → Qualificação → Reunião → Proposta → Negociação → Ganho. Estados paralelos: Sem resposta, Pausado, Perdido (motivo obrigatório).
- Kanban com drag-and-drop (dnd-kit), atualização otimista e desfazer. O card mostra empresa, temperatura, MRR, responsável, última interação, próxima ação e prazo.
- Oportunidade: empresa, contato, responsável, serviço, valor, setup, MRR, temperatura, origem, última interação, próxima ação obrigatória, prazo, atividades (9 tipos), reuniões, propostas, arquivos, observações, histórico.
- Automação: `proposal.sent` cria follow-ups D+2, D+5 e D+10.

## Conversão Lead → Cliente

`crm.convertOpportunity`, exatamente como na V3, seção 7: uma transação, idempotente, reaproveitando `organization`/`people`, criando cliente (onboarding), contatos, contrato (aguardando confirmação do Financeiro), equipe, onboarding a partir de template, auditoria e eventos. **Teste de integração obrigatório**, cobrindo sucesso, falha no meio e chamada repetida.

## Bloco 3 — Clientes

Carteira (lista e cards, filtros, Health score), Workspace do cliente com as 13 abas, Onboarding (13 etapas), Contatos com as 6 permissões, Equipe da conta (responsável padrão por função), Contrato, Serviços, Arquivos, Histórico. **As abas reutilizam os módulos globais com `clientId` como filtro**: nada de entidades paralelas.

## Bloco 4 — Tarefas, solicitações e SLA

- Tarefas: título, descrição, cliente, responsável, participantes, prioridade, status, prazo, dependências, arquivos, comentários, histórico, "Bloqueado por" (motivo, quem resolve, início, observação). Visualizações Hoje, Próximas, Atrasadas e Concluídas.
- Solicitações: Arte estática, Arte para impresso, Vídeo, Alteração, Fotos editadas, Cardápio, Catálogo, Outro. Fluxo: Recebida → Triagem → Responsável → Em produção → Revisão → Aprovação → Entregue.
- SLA: `sla_clocks` + `sla_intervals`; prazo sempre por `@aos/sla`; pausa ao aguardar cliente ou bloqueio; cron de 5 minutos emite `sla.near_due` e `sla.overdue`. Status exibidos: No prazo, Próximo, Atrasado, Pausado, Bloqueado.

## Bloco 5 — Conteúdos

Calendário, Kanban, Feed (com gaveta: `scheduled_at` nulo = gaveta; reordenar troca datas) e Lista. Campos: cliente, campanha, plataforma, formato, data, horário, responsável, copy/legenda/CTA por versão, arquivos, thumbnail, status, versão, aprovação. Fluxo: Ideia → Produção → Revisão → Aprovação → Alteração → Aprovado → Agendado → Postado. Versões imutáveis.

## Bloco 6 — Aprovações

Central (Aguardando, Alteração, Aprovado, Atrasado), preview, legenda, data, plataforma, versão, comentários, anotação na arte (x/y em %, por versão), comentário em vídeo por timestamp, aprovação em lote, aprovação em nome do cliente com justificativa. `content.change_requested` cria tarefa com SLA de Alteração para o responsável padrão.

## Bloco 7 — Hoje

Conforme o protótipo: blocos por perfil (prioridades, atrasadas, para hoje, alterações, aprovações, aguardando cliente, reuniões, follow-ups, alertas financeiros). Um perfil só vê o que a permissão dele permite.

## ▶ CHECKPOINT (primeira parada obrigatória)

Com Login + Comercial + Clientes + Tarefas + Solicitações + SLA + Conteúdos + Aprovações + Calendário + Hoje + **Financeiro básico** (contratos → faturas, contas a receber, registrar pagamento, MRR e os 5 conceitos separados) funcionando, pare e entregue `docs/CHECKPOINT-1.md` com:

1. Como abrir (URL local e, se houver, preview).
2. Usuários de demonstração (um por perfil, senha só de dev).
3. Funcionalidades implementadas.
4. Pendentes.
5. Erros conhecidos.
6. Integrações mockadas.
7. Resultado dos testes críticos (saída real).
8. Instruções para executar.
9. Screenshots das principais telas em `docs/screenshots/` (use Playwright).
10. Próximos passos.

## Depois do checkpoint (sem nova parada até o fim)

- **Bloco 8 — Financeiro completo:** receitas, despesas, contas a pagar, inadimplência, fluxo de caixa básico, dashboard financeiro.
- **Bloco 9 — Gestão:** campanhas, reuniões (decisão vira tarefa), arquivos/assets, equipe (carga), painel executivo.
- **Bloco 10 — Portal do cliente:** Início, Conteúdos, Aprovações, Solicitações, Reuniões, Arquivos, Resultados; mobile-first. **Testes de isolamento do portal:** o cliente não vê outros clientes, custos, tarefas internas, notas privadas, dados comerciais, financeiro interno nem equipe não autorizada.
- **Bloco 11 — Performance:** métricas manuais e por CSV, melhores conteúdos, evolução, metas, aprendizados.
- **Bloco 12 — Automações:** motor TRIGGER + CONDITION + ACTION sobre o outbox, com histórico de execução. Regras iniciais: `proposal.sent`, `content.change_requested`, `task.assigned`, `invoice.overdue`, `contract.expiring`, `request.created`. Notificações in-app primeiro; WhatsApp só via adaptador desligado.

## Testes prioritários (obrigatórios)

Autenticação · permissões (`can` + escopos) · isolamento de workspace (cada tabela nova entra em `TENANT_TABLES`) · isolamento do portal · conversão Lead → Cliente · SLA · financeiro (MRR, os 5 conceitos não se misturam, pagamento parcial) · aprovações (versão, aprovação em nome com justificativa) · automações críticas (idempotência, sem envio duplicado). E2E com Playwright: venda → cliente e alteração pelo portal.

## Seed de demonstração (fictício)

Use os dados do protótipo: clientes Terra Mar, Café Aurora, Clínica Vitta, Studio Nobre, Ótica Prisma, Pão de Casa, Academia Ritmo, Empório Sabiá; oportunidades Empresa X, Hotel Brisa, Vinícola Serra, Studio K…; equipe Manuella (Gestora), Bia (Atendimento), Leo (Comercial), Nina (Social media), Caio (Copy), Rafa (Design), Duda (Editor), Theo (Tráfego), Lia (Financeiro). Inclua tarefas, solicitações em todos os status de SLA, conteúdos em todas as etapas, aprovações, contratos, faturas (pagas, a receber e atrasadas) e despesas. E-mails `@demo.local`; nenhum dado real.

## Prompt para colar no Claude Code

> Leia `CLAUDE.md` e `HANDOFF-DESENVOLVIMENTO.md`. Execute os blocos na ordem, começando pelo Bloco 0, implementando código funcional e testando as partes críticas. Faça um commit por bloco. Só pare nas condições listadas ou ao chegar ao CHECKPOINT, quando deve entregar `docs/CHECKPOINT-1.md` com screenshots e a saída real dos testes.
