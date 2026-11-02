# CLAUDE.md — Agency OS

Instruções permanentes para o Claude Code neste repositório.

## Fonte de verdade
- Arquitetura técnica **V3 aprovada**: `docs/reference/Agency OS Arquitetura Tecnica.dc.html` (abrir no navegador) e o resumo em `docs/ARCHITECTURE.md`.
- Decisões aprovadas: `docs/DECISIONS.md`. **Não altere nenhuma decisão da V3 silenciosamente.** Se precisar mudar, PARE e informe: qual decisão, por quê, impacto, alternativa, recomendação. Aguarde aprovação.
- Protótipo visual aprovado (referência para sprints futuras, NÃO para agora): `docs/reference/Agency OS Prototipo.dc.html`.

## Fase atual
**Desenvolvimento acelerado em blocos** — siga `HANDOFF-DESENVOLVIMENTO.md`.
Fluxo: IMPLEMENTAR → TESTAR → CORRIGIR → CONTINUAR. Não parar entre blocos para pedir autorização.
Pare SOMENTE para: mudança relevante da V3, risco de perda de dados, decisão financeira relevante, credencial/serviço externo, decisão irreversível, conflito entre requisitos.
Primeira parada obrigatória: o CHECKPOINT definido no handoff.

## Regras de código
1. Toda ação de negócio passa por `runCommand` (transação + `emit` + `audit`).
2. Toda tabela de negócio: `workspace_id`, FK composta `(workspace_id, id)`, RLS, e entra em `TENANT_TABLES` no teste de isolamento.
3. Prazos só pelo `@aos/sla`. Nunca "+24h".
4. `adminDb()` só em migração, seed, relay e jobs entre workspaces.
5. Segredos só no servidor; nunca no Git; nunca com prefixo `NEXT_PUBLIC_`.
6. Visual: direção D — Branco Minimalista, seguindo `docs/reference/Agency OS Prototipo.dc.html` (não redesenhar).
7. Commit ao fim de cada bloco (mensagem `bloco-N: …`) para facilitar rollback.
8. **Não enfraquecer testes** para fazê-los passar. Se um teste revela bug real, corrija a implementação.
9. Respostas e documentação em português do Brasil.
