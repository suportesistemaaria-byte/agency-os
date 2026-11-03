import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import { command, read, type Ctx } from './context';

export interface NotifyInput {
  memberIds: (string | null | undefined)[];
  type: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  /** Mesmo aviso não se repete para a mesma pessoa (ex.: id do evento). */
  dedupeKey: string;
}

/** In-app primeiro (V3, seção 10). E-mail/WhatsApp entram por adaptador; aqui só in-app. */
export async function notifyIn(tx: Tx, workspaceId: string, n: NotifyInput): Promise<number> {
  const ids = [...new Set(n.memberIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return 0;
  const rows = await tx
    .insert(s.notifications)
    .values(
      ids.map((memberId) => ({
        workspaceId,
        memberId,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        entityType: n.entityType,
        entityId: n.entityId,
        dedupeKey: n.dedupeKey,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: s.notifications.id });
  return rows.length;
}

export async function listNotifications(ctx: Ctx, limit = 30) {
  return read(ctx, async (tx) => {
    const items = await tx
      .select()
      .from(s.notifications)
      .where(eq(s.notifications.memberId, ctx.memberId))
      .orderBy(desc(s.notifications.createdAt))
      .limit(limit);
    const [{ unread }] = (await tx
      .select({ unread: sql<number>`count(*)::int` })
      .from(s.notifications)
      .where(and(eq(s.notifications.memberId, ctx.memberId), isNull(s.notifications.readAt)))) as [
      { unread: number },
    ];
    return { items, unread };
  });
}

export async function markNotificationsRead(ctx: Ctx, ids?: string[]) {
  return command('notifications.markRead', ctx, async ({ tx }) => {
    const conds = [eq(s.notifications.memberId, ctx.memberId), isNull(s.notifications.readAt)];
    if (ids?.length) conds.push(inArray(s.notifications.id, ids));
    await tx
      .update(s.notifications)
      .set({ readAt: new Date() })
      .where(and(...conds));
  });
}

/** Membros com um cargo (ex.: todos do Financeiro), para avisos por função. */
export async function membersWithRole(tx: Tx, roleKeys: string[]): Promise<string[]> {
  const rows = await tx
    .select({ id: s.memberRoles.memberId })
    .from(s.memberRoles)
    .innerJoin(s.roles, eq(s.roles.id, s.memberRoles.roleId))
    .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.memberRoles.memberId))
    .where(and(inArray(s.roles.key, roleKeys), eq(s.workspaceMembers.status, 'active')));
  return [...new Set(rows.map((r) => r.id))];
}
