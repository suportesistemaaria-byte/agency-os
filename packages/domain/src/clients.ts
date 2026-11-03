import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, must } from './errors';
import { computeHealth } from './health';
import { scopeWhere } from './scope';
import { dueFromPolicy } from './sla-clock';
import { can } from './permissions';
import { TEAM_FUNCTIONS, CLIENT_STATUS_LABEL } from './labels';
export { TEAM_FUNCTIONS, CLIENT_STATUS_LABEL };

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Dados agregados por cliente para carteira e health score (uma query por agregado, não por cliente). */
async function clientStats(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof emptyStats>>();
  const now = new Date();
  const t = today();
  const mrr = await tx
    .select({
      clientId: s.contracts.clientId,
      v: sql<number>`coalesce(sum(${s.contractItems.amountCents}),0)::bigint`,
    })
    .from(s.contracts)
    .innerJoin(s.contractItems, eq(s.contractItems.contractId, s.contracts.id))
    .where(
      and(
        inArray(s.contracts.clientId, ids),
        eq(s.contracts.status, 'active'),
        eq(s.contractItems.kind, 'recurring'),
      ),
    )
    .groupBy(s.contracts.clientId);
  const renew = await tx
    .select({ clientId: s.contracts.clientId, endOn: sql<string>`min(${s.contracts.endOn})` })
    .from(s.contracts)
    .where(
      and(
        inArray(s.contracts.clientId, ids),
        inArray(s.contracts.status, ['active', 'pending_finance_confirmation']),
      ),
    )
    .groupBy(s.contracts.clientId);
  const overdueInv = await tx
    .select({
      clientId: s.invoices.clientId,
      n: sql<number>`count(*)::int`,
      oldest: sql<string>`min(${s.invoices.dueOn})`,
      cents: sql<number>`sum(${s.invoices.amountCents} - ${s.invoices.paidCents})::bigint`,
    })
    .from(s.invoices)
    .where(and(inArray(s.invoices.clientId, ids), eq(s.invoices.status, 'overdue')))
    .groupBy(s.invoices.clientId);
  const dueSoon = await tx
    .select({ clientId: s.invoices.clientId, due: sql<string>`min(${s.invoices.dueOn})` })
    .from(s.invoices)
    .where(and(inArray(s.invoices.clientId, ids), inArray(s.invoices.status, ['issued', 'partially_paid'])))
    .groupBy(s.invoices.clientId);
  const tasks = await tx
    .select({
      clientId: s.tasks.clientId,
      open: sql<number>`count(*) filter (where ${s.tasks.status} not in ('done','cancelled'))::int`,
      overdue: sql<number>`count(*) filter (where ${s.tasks.status} not in ('done','cancelled') and ${s.tasks.dueAt} < ${now})::int`,
    })
    .from(s.tasks)
    .where(inArray(s.tasks.clientId, ids))
    .groupBy(s.tasks.clientId);
  const content = await tx
    .select({
      clientId: s.contents.clientId,
      waiting: sql<number>`count(*) filter (where ${s.contents.stage} = 'client_approval')::int`,
    })
    .from(s.contents)
    .where(and(inArray(s.contents.clientId, ids), isNull(s.contents.deletedAt)))
    .groupBy(s.contents.clientId);
  const changes = await tx
    .select({ clientId: s.contents.clientId, n: sql<number>`count(*)::int` })
    .from(s.contentApprovals)
    .innerJoin(s.contents, eq(s.contents.id, s.contentApprovals.contentId))
    .where(
      and(
        inArray(s.contents.clientId, ids),
        eq(s.contentApprovals.action, 'change_requested'),
        sql`${s.contentApprovals.createdAt} > now() - interval '30 days'`,
      ),
    )
    .groupBy(s.contents.clientId);
  const out = new Map<string, ReturnType<typeof emptyStats>>();
  for (const id of ids) {
    const st = emptyStats();
    st.mrrCents = Number(mrr.find((x) => x.clientId === id)?.v ?? 0);
    const r = renew.find((x) => x.clientId === id)?.endOn;
    st.renewalDays = r ? daysBetween(t, r) : null;
    const inv = overdueInv.find((x) => x.clientId === id);
    st.overdueInvoices = inv?.n ?? 0;
    st.overdueInvoiceDays = inv?.oldest ? daysBetween(inv.oldest, t) : 0;
    st.overdueCents = Number(inv?.cents ?? 0);
    const ds = dueSoon.find((x) => x.clientId === id)?.due;
    st.nextDueDays = ds ? daysBetween(t, ds) : null;
    const tk = tasks.find((x) => x.clientId === id);
    st.openTasks = tk?.open ?? 0;
    st.overdueTasks = tk?.overdue ?? 0;
    st.waitingApprovals = content.find((x) => x.clientId === id)?.waiting ?? 0;
    st.changeRequests30d = changes.find((x) => x.clientId === id)?.n ?? 0;
    out.set(id, st);
  }
  return out;
}
function emptyStats() {
  return {
    mrrCents: 0,
    renewalDays: null as number | null,
    overdueInvoices: 0,
    overdueInvoiceDays: 0,
    overdueCents: 0,
    nextDueDays: null as number | null,
    openTasks: 0,
    overdueTasks: 0,
    waitingApprovals: 0,
    changeRequests30d: 0,
  };
}

export async function portfolio(ctx: Ctx) {
  assertCan(ctx, 'clientes.view');
  const showFinance = can(ctx, 'financeiro.view');
  return read(ctx, async (tx) => {
    const rows = await tx
      .select({ c: s.clients, owner: s.users.name })
      .from(s.clients)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.clients.ownerId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(
        and(
          isNull(s.clients.deletedAt),
          scopeWhere(ctx, 'clientes.view', { client: s.clients.id, owners: [s.clients.ownerId] }),
        ),
      )
      .orderBy(asc(s.clients.name));
    const stats = await clientStats(
      tx,
      rows.map((r) => r.c.id),
    );
    return {
      showFinance,
      clients: rows.map(({ c, owner }) => {
        const st = stats.get(c.id)!;
        const health = computeHealth({ ...st, onboarding: c.status === 'onboarding' });
        return {
          ...c,
          ownerName: owner,
          ...st,
          mrrCents: showFinance ? st.mrrCents : null,
          overdueCents: showFinance ? st.overdueCents : null,
          health,
        };
      }),
    };
  });
}

export async function getClient(ctx: Ctx, id: string) {
  assertCan(ctx, 'clientes.view');
  return read(ctx, async (tx) => {
    const [row] = await tx.select().from(s.clients).where(eq(s.clients.id, id));
    const client = must(row, 'Cliente não encontrado.');
    assertCan(ctx, 'clientes.view', { clientId: id, ownerMemberIds: [client.ownerId] });
    const [org] = await tx
      .select()
      .from(s.organizations)
      .where(eq(s.organizations.id, client.organizationId));
    const contacts = await tx
      .select({ contact: s.clientContacts, person: s.people })
      .from(s.clientContacts)
      .innerJoin(s.people, eq(s.people.id, s.clientContacts.personId))
      .where(eq(s.clientContacts.clientId, id))
      .orderBy(desc(s.clientContacts.isPrimary), asc(s.people.name));
    const team = await tx
      .select({ t: s.clientTeam, name: s.users.name })
      .from(s.clientTeam)
      .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.clientTeam.memberId))
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.clientTeam.clientId, id));
    const showFinance = can(ctx, 'financeiro.view');
    const contracts = await tx
      .select()
      .from(s.contracts)
      .where(and(eq(s.contracts.clientId, id), isNull(s.contracts.deletedAt)))
      .orderBy(desc(s.contracts.startOn));
    const items = contracts.length
      ? await tx
          .select()
          .from(s.contractItems)
          .where(
            inArray(
              s.contractItems.contractId,
              contracts.map((c) => c.id),
            ),
          )
      : [];
    const [onboarding] = await tx
      .select()
      .from(s.clientOnboardings)
      .where(eq(s.clientOnboardings.clientId, id))
      .orderBy(desc(s.clientOnboardings.startedAt))
      .limit(1);
    const steps = onboarding
      ? await tx
          .select({ step: s.onboardingSteps, assignee: s.users.name })
          .from(s.onboardingSteps)
          .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.onboardingSteps.assigneeId))
          .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
          .where(eq(s.onboardingSteps.onboardingId, onboarding.id))
          .orderBy(asc(s.onboardingSteps.position))
      : [];
    const stats = (await clientStats(tx, [id])).get(id)!;
    const health = computeHealth({ ...stats, onboarding: client.status === 'onboarding' });
    const [owner] = client.ownerId
      ? await tx
          .select({ name: s.users.name })
          .from(s.workspaceMembers)
          .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
          .where(eq(s.workspaceMembers.id, client.ownerId))
      : [];
    return {
      client,
      ownerName: owner?.name ?? null,
      organization: org!,
      contacts,
      team,
      showFinance,
      contracts: contracts.map((c) => ({
        ...c,
        items: showFinance ? items.filter((i) => i.contractId === c.id) : [],
      })),
      onboarding: onboarding ? { ...onboarding, steps } : null,
      stats: { ...stats, mrrCents: showFinance ? stats.mrrCents : null },
      health,
    };
  });
}

/** Histórico do cliente: eventos de domínio ligados a ele (oportunidade de origem inclusa). */
export async function clientHistory(ctx: Ctx, clientId: string) {
  assertCan(ctx, 'clientes.view', { clientId });
  return read(ctx, async (tx) => {
    const [c] = await tx.select().from(s.clients).where(eq(s.clients.id, clientId));
    const client = must(c);
    const events = await tx
      .select()
      .from(s.domainEvents)
      .where(
        sql`(${s.domainEvents.payload}->>'clientId' = ${clientId} OR ${s.domainEvents.entityId} = ${clientId}
          OR (${client.opportunityId}::uuid IS NOT NULL AND ${s.domainEvents.payload}->>'opportunityId' = ${client.opportunityId}::text))`,
      )
      .orderBy(desc(s.domainEvents.occurredAt))
      .limit(100);
    const activities = await tx
      .select()
      .from(s.commercialActivities)
      .where(eq(s.commercialActivities.organizationId, client.organizationId))
      .orderBy(desc(s.commercialActivities.occurredAt));
    return { events, activities };
  });
}

export async function onboardingBoard(ctx: Ctx) {
  assertCan(ctx, 'clientes.view');
  return read(ctx, async (tx) => {
    const obs = await tx
      .select({ o: s.clientOnboardings, client: s.clients })
      .from(s.clientOnboardings)
      .innerJoin(s.clients, eq(s.clients.id, s.clientOnboardings.clientId))
      .where(scopeWhere(ctx, 'clientes.view', { client: s.clients.id, owners: [s.clients.ownerId] }))
      .orderBy(desc(s.clientOnboardings.startedAt));
    const steps = obs.length
      ? await tx
          .select({ step: s.onboardingSteps, assignee: s.users.name })
          .from(s.onboardingSteps)
          .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.onboardingSteps.assigneeId))
          .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
          .where(
            inArray(
              s.onboardingSteps.onboardingId,
              obs.map((o) => o.o.id),
            ),
          )
          .orderBy(asc(s.onboardingSteps.position))
      : [];
    return obs.map((o) => ({ ...o, steps: steps.filter((x) => x.step.onboardingId === o.o.id) }));
  });
}

export async function completeOnboardingStep(ctx: Ctx, stepId: string, done = true) {
  return command('clients.completeOnboardingStep', ctx, async (kit) => {
    const { tx } = kit;
    const [st] = await tx.select().from(s.onboardingSteps).where(eq(s.onboardingSteps.id, stepId));
    const step = must(st, 'Etapa não encontrada.');
    const [ob] = await tx
      .select()
      .from(s.clientOnboardings)
      .where(eq(s.clientOnboardings.id, step.onboardingId));
    const onboarding = must(ob);
    assertCan(ctx, 'clientes.edit', { clientId: onboarding.clientId, ownerMemberIds: [step.assigneeId] });
    const now = new Date();
    await tx
      .update(s.onboardingSteps)
      .set({ doneAt: done ? now : null, doneBy: done ? ctx.memberId : null, updatedAt: now })
      .where(eq(s.onboardingSteps.id, stepId));
    await kit.audit({
      action: done ? 'onboarding.step_completed' : 'onboarding.step_reopened',
      entityType: 'client',
      entityId: onboarding.clientId,
      after: { step: step.title },
    });
    if (done)
      await kit.emit({
        type: 'onboarding.step_completed',
        entityType: 'client',
        entityId: onboarding.clientId,
        payload: { clientId: onboarding.clientId, stepId },
      });
    const pending = await tx
      .select({ id: s.onboardingSteps.id })
      .from(s.onboardingSteps)
      .where(and(eq(s.onboardingSteps.onboardingId, onboarding.id), isNull(s.onboardingSteps.doneAt)));
    if (!pending.length && !onboarding.completedAt) {
      await tx
        .update(s.clientOnboardings)
        .set({ completedAt: now })
        .where(eq(s.clientOnboardings.id, onboarding.id));
      await tx
        .update(s.clients)
        .set({ status: 'active', updatedAt: now })
        .where(and(eq(s.clients.id, onboarding.clientId), eq(s.clients.status, 'onboarding')));
      await kit.emit({
        type: 'onboarding.completed',
        entityType: 'client',
        entityId: onboarding.clientId,
        payload: { clientId: onboarding.clientId, onboardingId: onboarding.id },
      });
    }
  });
}

export type ContactFlags = Partial<{
  canView: boolean;
  canComment: boolean;
  canRequest: boolean;
  canApprove: boolean;
  receivesFinance: boolean;
  receivesNotifications: boolean;
  isPrimary: boolean;
}>;

export async function updateContactFlags(ctx: Ctx, contactId: string, flags: ContactFlags) {
  return command('clients.updateContactFlags', ctx, async (kit) => {
    const [c] = await kit.tx.select().from(s.clientContacts).where(eq(s.clientContacts.id, contactId));
    const contact = must(c, 'Contato não encontrado.');
    assertCan(ctx, 'clientes.edit', { clientId: contact.clientId });
    const [after] = await kit.tx
      .update(s.clientContacts)
      .set({ ...flags, updatedAt: new Date() })
      .where(eq(s.clientContacts.id, contactId))
      .returning();
    await kit.audit({
      action: 'contact.permissions_changed',
      entityType: 'client_contact',
      entityId: contactId,
      before: contact,
      after: after!,
    });
    await kit.emit({
      type: 'contact.permissions_changed',
      entityType: 'client',
      entityId: contact.clientId,
      payload: { clientId: contact.clientId, contactId },
    });
  });
}

export async function addContact(
  ctx: Ctx,
  clientId: string,
  input: { name: string; email?: string; phone?: string; roleTitle?: string } & ContactFlags,
) {
  assertCan(ctx, 'clientes.edit', { clientId });
  if (!input.name.trim()) throw badRequest('Informe o nome do contato.');
  return command('clients.addContact', ctx, async (kit) => {
    const [c] = await kit.tx.select().from(s.clients).where(eq(s.clients.id, clientId));
    const client = must(c);
    const [p] = await kit.tx
      .insert(s.people)
      .values({
        workspaceId: ctx.workspaceId,
        organizationId: client.organizationId,
        name: input.name.trim(),
        email: input.email,
        phone: input.phone,
        roleTitle: input.roleTitle,
      })
      .returning();
    const { name: _n, email: _e, phone: _p, roleTitle: _r, ...flags } = input;
    const [contact] = await kit.tx
      .insert(s.clientContacts)
      .values({ workspaceId: ctx.workspaceId, clientId, personId: p!.id, ...flags })
      .returning();
    await kit.audit({
      action: 'contact.created',
      entityType: 'client_contact',
      entityId: contact!.id,
      after: contact!,
    });
    return contact!;
  });
}

/** Define o responsável padrão de uma função na equipe da conta. */
export async function setTeamMember(ctx: Ctx, clientId: string, fn: string, memberId: string | null) {
  assertCan(ctx, 'clientes.edit', { clientId });
  if (!TEAM_FUNCTIONS[fn]) throw badRequest('Função inválida.');
  return command('clients.setTeamMember', ctx, async (kit) => {
    const before = await kit.tx
      .select()
      .from(s.clientTeam)
      .where(and(eq(s.clientTeam.clientId, clientId), eq(s.clientTeam.function, fn)));
    await kit.tx
      .delete(s.clientTeam)
      .where(and(eq(s.clientTeam.clientId, clientId), eq(s.clientTeam.function, fn)));
    if (memberId)
      await kit.tx
        .insert(s.clientTeam)
        .values({ workspaceId: ctx.workspaceId, clientId, function: fn, memberId, isDefault: true });
    await kit.audit({
      action: 'client.team_changed',
      entityType: 'client',
      entityId: clientId,
      before: { [fn]: before.map((b) => b.memberId) },
      after: { [fn]: memberId },
    });
  });
}

export async function updateClient(
  ctx: Ctx,
  clientId: string,
  patch: Partial<{
    status: (typeof s.clientStatus.enumValues)[number];
    plan: string;
    segment: string;
    ownerId: string;
  }>,
) {
  assertCan(ctx, 'clientes.edit', { clientId });
  return command('clients.update', ctx, async (kit) => {
    const [c] = await kit.tx.select().from(s.clients).where(eq(s.clients.id, clientId));
    const client = must(c);
    const [after] = await kit.tx
      .update(s.clients)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(s.clients.id, clientId))
      .returning();
    await kit.audit({
      action: 'client.updated',
      entityType: 'client',
      entityId: clientId,
      before: client,
      after: after!,
    });
    if (patch.status && patch.status !== client.status)
      await kit.emit({
        type: 'client.status_changed',
        entityType: 'client',
        entityId: clientId,
        payload: { clientId, from: client.status, to: patch.status },
      });
  });
}

export async function listClientsBasic(ctx: Ctx) {
  return read(ctx, (tx) =>
    tx
      .select({ id: s.clients.id, name: s.clients.name, color: s.clients.color, status: s.clients.status })
      .from(s.clients)
      .where(
        and(
          isNull(s.clients.deletedAt),
          scopeWhere(ctx, 'clientes.view', { client: s.clients.id, owners: [s.clients.ownerId] }),
        ),
      )
      .orderBy(asc(s.clients.name)),
  );
}

/** Usado pela conversão e pelo seed: cria etapas do onboarding a partir do template com prazos pelo @aos/sla. */
export async function instantiateOnboarding(
  tx: Tx,
  workspaceId: string,
  clientId: string,
  templateId: string,
  team: Map<string, string>,
  from = new Date(),
) {
  const [ob] = await tx
    .insert(s.clientOnboardings)
    .values({ workspaceId, clientId, templateId, startedAt: from })
    .returning();
  const tsteps = await tx
    .select()
    .from(s.onboardingTemplateSteps)
    .where(eq(s.onboardingTemplateSteps.templateId, templateId))
    .orderBy(asc(s.onboardingTemplateSteps.position));
  let cumulative = 0;
  for (const st of tsteps) {
    cumulative += st.businessDays;
    const due = await dueFromPolicy(
      tx,
      { model: 'business_days', amount: cumulative, rule: 'A1_same_time' },
      from,
    );
    await tx.insert(s.onboardingSteps).values({
      workspaceId,
      onboardingId: ob!.id,
      position: st.position,
      title: st.title,
      function: st.function,
      assigneeId: team.get(st.function) ?? team.get('atendimento') ?? null,
      dueAt: due,
    });
  }
  return ob!;
}
