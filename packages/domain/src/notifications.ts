import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import { command, read, type Ctx } from './context';
import { channels, disabledWhatsApp } from './channels';

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

/**
 * Notification Service (V3, seção 10): respeita a preferência de cada pessoa por tipo de evento,
 * grava o in-app (dedupe) e registra uma entrega por canal extra (e-mail; WhatsApp desligado) — nunca duplicada.
 */
export async function notifyIn(tx: Tx, workspaceId: string, n: NotifyInput): Promise<number> {
  const all = [...new Set(n.memberIds.filter((x): x is string => Boolean(x)))];
  if (!all.length) return 0;
  const prefs = await tx
    .select()
    .from(s.notificationPreferences)
    .where(
      and(inArray(s.notificationPreferences.memberId, all), eq(s.notificationPreferences.eventType, n.type)),
    );
  const pref = (m: string) => prefs.find((p) => p.memberId === m);
  const ids = all.filter((m) => pref(m)?.inApp !== false || pref(m)?.email || pref(m)?.whatsapp);
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
    .returning({ id: s.notifications.id, memberId: s.notifications.memberId });
  const ch = channels();
  for (const r of rows) {
    const p = pref(r.memberId);
    const extra: ('email' | 'whatsapp')[] = [];
    if (p?.email) extra.push('email');
    if (p?.whatsapp) extra.push('whatsapp');
    for (const channel of extra) {
      const [u] = await tx
        .select({ email: s.users.email })
        .from(s.workspaceMembers)
        .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
        .where(eq(s.workspaceMembers.id, r.memberId));
      const res =
        channel === 'email'
          ? await ch.email.send(u?.email ?? '', n.title, n.body ?? '')
          : ch.whatsappEnabled
            ? await ch.whatsapp.sendTemplate('', n.type, 'pt_BR', { title: n.title })
            : await disabledWhatsApp.sendTemplate('', n.type, 'pt_BR', {});
      await tx
        .insert(s.notificationDeliveries)
        .values({
          workspaceId,
          notificationId: r.id,
          channel,
          status: res.status,
          provider: res.provider,
          providerId: res.providerId,
          error: res.error,
        })
        .onConflictDoNothing();
    }
    // Quem desligou o in-app recebe só pelos canais extras: a linha in-app fica marcada como lida.
    if (p && p.inApp === false)
      await tx.update(s.notifications).set({ readAt: new Date() }).where(eq(s.notifications.id, r.id));
  }
  return rows.length;
}

export const NOTIFICATION_TYPES: Record<string, string> = {
  'task.assigned': 'Tarefa atribuída a mim',
  'sla.near_due': 'Prazo de SLA perto do vencimento',
  'sla.overdue': 'Prazo de SLA atrasado',
  'request.created': 'Nova solicitação para triagem',
  'content.submitted': 'Conteúdo enviado ao cliente',
  'opportunity.won': 'Venda ganha',
  'invoice.overdue': 'Cobrança atrasada',
  'contract.expiring': 'Contrato vencendo',
};

export async function getPreferences(ctx: Ctx) {
  return read(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(s.notificationPreferences)
      .where(eq(s.notificationPreferences.memberId, ctx.memberId));
    return Object.entries(NOTIFICATION_TYPES).map(([type, label]) => {
      const r = rows.find((x) => x.eventType === type);
      return {
        type,
        label,
        inApp: r?.inApp ?? true,
        email: r?.email ?? false,
        whatsapp: r?.whatsapp ?? false,
      };
    });
  });
}

export async function setPreference(
  ctx: Ctx,
  eventType: string,
  channel: 'inApp' | 'email' | 'whatsapp',
  value: boolean,
) {
  if (!NOTIFICATION_TYPES[eventType]) throw new Error('Tipo de notificação inválido.');
  return command('notifications.setPreference', ctx, async (kit) => {
    await kit.tx
      .insert(s.notificationPreferences)
      .values({ workspaceId: ctx.workspaceId, memberId: ctx.memberId, eventType, [channel]: value })
      .onConflictDoUpdate({
        target: [s.notificationPreferences.memberId, s.notificationPreferences.eventType],
        set: { [channel]: value, updatedAt: new Date() },
      });
  });
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
