import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import { read, type Ctx } from './context';
import { can } from './permissions';
import { listTasks } from './tasks';
import { approvalCenter } from './approvals';
import { listMeetings } from './meetings';
import { listRequests } from './requests';
import { scopeWhere } from './scope';

function dayBounds(tz: string) {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const shift = now.getTime() - local.getTime();
  const start = new Date(local);
  start.setHours(0, 0, 0, 0);
  return { start: new Date(start.getTime() + shift), end: new Date(start.getTime() + shift + 86_400_000) };
}

/**
 * Tela Hoje (Bloco 7): blocos por perfil. Cada bloco só aparece se a permissão permitir,
 * e o conteúdo de cada bloco já vem filtrado pelo escopo (all/team/own) no serviço.
 */
export async function todayView(ctx: Ctx) {
  const { start, end } = dayBounds(ctx.timezone);
  const canTasks = can(ctx, 'tasks.view');
  const canContent = can(ctx, 'conteudo.view');
  const canComercial = can(ctx, 'comercial.view');
  const canFinance = can(ctx, 'financeiro.view');
  const canRequests = can(ctx, 'requests.view');

  const [overdue, today, approvals, meetings, requests] = await Promise.all([
    canTasks ? listTasks(ctx, { view: 'overdue', mine: true }) : [],
    canTasks ? listTasks(ctx, { view: 'today', mine: true }) : [],
    canContent ? approvalCenter(ctx) : null,
    listMeetings(ctx, start, end),
    canRequests ? listRequests(ctx, { open: true }) : [],
  ]);
  const changeTasks = canTasks
    ? (await listTasks(ctx, { view: 'all', mine: true })).filter(
        (t) => t.originType === 'content_change' && t.status !== 'done' && t.status !== 'cancelled',
      )
    : [];

  const extra = await read(ctx, async (tx) => {
    const followups = canComercial
      ? await tx
          .select({
            a: s.nextActions,
            org: s.organizations.name,
            opp: s.opportunities.title,
            oppId: s.opportunities.id,
          })
          .from(s.nextActions)
          .innerJoin(s.opportunities, eq(s.opportunities.id, s.nextActions.opportunityId))
          .innerJoin(s.organizations, eq(s.organizations.id, s.opportunities.organizationId))
          .where(
            and(
              isNull(s.nextActions.doneAt),
              lt(s.nextActions.dueAt, end),
              eq(s.opportunities.state, 'open'),
              scopeWhere(ctx, 'comercial.view', { owners: [s.opportunities.ownerId] }),
            ),
          )
          .orderBy(asc(s.nextActions.dueAt))
          .limit(8)
      : [];
    const finance = canFinance
      ? {
          overdue: await tx
            .select({ i: s.invoices, client: s.clients.name })
            .from(s.invoices)
            .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
            .where(eq(s.invoices.status, 'overdue'))
            .orderBy(asc(s.invoices.dueOn))
            .limit(6),
          dueSoon: await tx
            .select({ i: s.invoices, client: s.clients.name })
            .from(s.invoices)
            .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
            .where(
              and(
                inArray(s.invoices.status, ['issued', 'partially_paid']),
                sql`${s.invoices.dueOn} <= (current_date + 7)`,
              ),
            )
            .orderBy(asc(s.invoices.dueOn))
            .limit(6),
          pendingContracts: await tx
            .select({ c: s.contracts, client: s.clients.name })
            .from(s.contracts)
            .innerJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
            .where(eq(s.contracts.status, 'pending_finance_confirmation')),
        }
      : null;
    return { followups, finance };
  });

  const waitingClient = [
    ...(approvals?.waiting ?? []).map((c) => ({
      kind: 'content' as const,
      id: c.id,
      title: c.title,
      clientName: c.clientName,
      clientColor: c.clientColor,
      since: c.submittedAt,
      late: c.late,
    })),
    ...requests
      .filter((r) => r.status === 'client_approval')
      .map((r) => ({
        kind: 'request' as const,
        id: r.id,
        title: r.title,
        clientName: r.clientName,
        clientColor: r.clientColor,
        since: r.updatedAt,
        late: false,
      })),
  ];

  const oldestOverdue = overdue.reduce<Date | null>(
    (a, t) => (t.dueAt && (!a || t.dueAt < a) ? t.dueAt : a),
    null,
  );
  const headline = overdue[0]
    ? `Comece por ${overdue[0].title}: está atrasada.${waitingClient.length ? ` Depois, ${waitingClient.length} item(ns) parado(s) no cliente.` : ''}`
    : today.length
      ? `${today.length} entrega(s) para hoje.`
      : 'Nada atrasado. Bom dia para adiantar o que vem pela frente.';

  return {
    name: ctx.name,
    headline,
    blocks: {
      tasks: canTasks,
      content: canContent,
      comercial: canComercial,
      finance: canFinance,
    },
    stats: {
      overdue: overdue.length,
      oldestOverdue,
      today: today.length,
      waitingClient: waitingClient.length,
      changes: changeTasks.length,
    },
    overdue,
    today,
    changes: changeTasks,
    waitingClient,
    toReview: approvals ? (approvals.changes ?? []) : [],
    meetings,
    followups: extra.followups,
    finance: extra.finance,
  };
}
