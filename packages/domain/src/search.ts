import { and, ilike, isNull } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import { read, type Ctx } from './context';
import { can } from './permissions';
import { scopeWhere } from './scope';

/** Busca do ⌘K: só devolve o que a permissão do usuário já permite ver. */
export async function search(ctx: Ctx, q: string) {
  const term = `%${q.trim().replace(/[%_]/g, '')}%`;
  if (q.trim().length < 2) return [];
  return read(ctx, async (tx) => {
    const out: { kind: string; id: string; label: string; href: string }[] = [];
    if (can(ctx, 'clientes.view')) {
      const rows = await tx
        .select({ id: s.clients.id, name: s.clients.name })
        .from(s.clients)
        .where(
          and(
            isNull(s.clients.deletedAt),
            ilike(s.clients.name, term),
            scopeWhere(ctx, 'clientes.view', { client: s.clients.id, owners: [s.clients.ownerId] }),
          ),
        )
        .limit(5);
      out.push(...rows.map((r) => ({ kind: 'Cliente', id: r.id, label: r.name, href: `/clientes/${r.id}` })));
    }
    if (can(ctx, 'comercial.view')) {
      const rows = await tx
        .select({ id: s.opportunities.id, name: s.opportunities.title })
        .from(s.opportunities)
        .where(
          and(
            ilike(s.opportunities.title, term),
            scopeWhere(ctx, 'comercial.view', { owners: [s.opportunities.ownerId] }),
          ),
        )
        .limit(5);
      out.push(
        ...rows.map((r) => ({
          kind: 'Oportunidade',
          id: r.id,
          label: r.name,
          href: `/comercial/oportunidades/${r.id}`,
        })),
      );
    }
    if (can(ctx, 'conteudo.view')) {
      const rows = await tx
        .select({ id: s.contents.id, name: s.contents.title })
        .from(s.contents)
        .where(
          and(
            isNull(s.contents.deletedAt),
            ilike(s.contents.title, term),
            scopeWhere(ctx, 'conteudo.view', {
              client: s.contents.clientId,
              owners: [s.contents.ownerId, s.contents.designerId, s.contents.copywriterId],
            }),
          ),
        )
        .limit(5);
      out.push(
        ...rows.map((r) => ({ kind: 'Conteúdo', id: r.id, label: r.name, href: `/conteudos/${r.id}` })),
      );
    }
    if (can(ctx, 'tasks.view')) {
      const rows = await tx
        .select({ id: s.tasks.id, name: s.tasks.title })
        .from(s.tasks)
        .where(
          and(
            ilike(s.tasks.title, term),
            scopeWhere(ctx, 'tasks.view', { client: s.tasks.clientId, owners: [s.tasks.assigneeId] }),
          ),
        )
        .limit(5);
      out.push(...rows.map((r) => ({ kind: 'Tarefa', id: r.id, label: r.name, href: `/tarefas/${r.id}` })));
    }
    return out;
  });
}
