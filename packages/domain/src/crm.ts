import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, must } from './errors';
import { scopeWhere } from './scope';
import { dueFromPolicy } from './sla-clock';
import { ACTIVITY_LABEL } from './labels';
export { ACTIVITY_LABEL };

type Temperature = (typeof s.temperature.enumValues)[number];
type ActivityType = (typeof s.activityType.enumValues)[number];
type OppState = (typeof s.opportunityState.enumValues)[number];

async function defaultPipeline(tx: Tx) {
  const [p] = await tx.select().from(s.pipelines).where(eq(s.pipelines.isDefault, true)).limit(1);
  const pipe = must(p, 'Pipeline padrão não configurado.');
  const stages = await tx
    .select()
    .from(s.pipelineStages)
    .where(eq(s.pipelineStages.pipelineId, pipe.id))
    .orderBy(asc(s.pipelineStages.position));
  return { pipeline: pipe, stages };
}

async function getOpp(tx: Tx, id: string) {
  const [o] = await tx.select().from(s.opportunities).where(eq(s.opportunities.id, id));
  return must(o, 'Oportunidade não encontrada.');
}

const oppResource = (o: { ownerId: string | null; clientId: string | null }) => ({
  ownerMemberIds: [o.ownerId],
  clientId: o.clientId,
});

// ───────────────────────────── Leitura ─────────────────────────────

export async function pipelineBoard(ctx: Ctx, filter: 'all' | 'new' | 'upsell' = 'all') {
  assertCan(ctx, 'comercial.view');
  return read(ctx, async (tx) => {
    const { pipeline, stages } = await defaultPipeline(tx);
    const conds = [eq(s.opportunities.pipelineId, pipeline.id)];
    if (filter === 'new') conds.push(eq(s.opportunities.type, 'new'));
    if (filter === 'upsell') conds.push(ne(s.opportunities.type, 'new'));
    const sc = scopeWhere(ctx, 'comercial.view', { owners: [s.opportunities.ownerId] });
    if (sc) conds.push(sc);
    const opps = await tx
      .select({
        o: s.opportunities,
        org: s.organizations.name,
        owner: s.users.name,
      })
      .from(s.opportunities)
      .innerJoin(s.organizations, eq(s.organizations.id, s.opportunities.organizationId))
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.opportunities.ownerId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(and(...conds))
      .orderBy(asc(s.opportunities.position), desc(s.opportunities.createdAt));
    const ids = opps.map((x) => x.o.id);
    const actions = ids.length
      ? await tx
          .select()
          .from(s.nextActions)
          .where(and(inArray(s.nextActions.opportunityId, ids), isNull(s.nextActions.doneAt)))
          .orderBy(asc(s.nextActions.dueAt))
      : [];
    const nextOf = new Map<string, (typeof actions)[number]>();
    for (const a of actions) if (!nextOf.has(a.opportunityId)) nextOf.set(a.opportunityId, a);
    const cards = opps.map(({ o, org, owner }) => ({
      ...o,
      organizationName: org,
      ownerName: owner,
      nextAction: nextOf.get(o.id) ?? null,
    }));
    const open = cards.filter((c) => c.state === 'open');
    const prob = new Map(stages.map((st) => [st.id, st.probability]));
    const now = new Date();
    return {
      pipeline,
      stages: stages.map((st) => {
        const inStage = open.filter((c) => c.stageId === st.id);
        return { ...st, count: inStage.length, mrrCents: inStage.reduce((a, c) => a + c.mrrCents, 0) };
      }),
      cards: open,
      parallel: {
        no_response: cards.filter((c) => c.state === 'no_response'),
        paused: cards.filter((c) => c.state === 'paused'),
        lost: cards.filter((c) => c.state === 'lost'),
      },
      totals: {
        openCount: open.length,
        potentialMrrCents: open.reduce((a, c) => a + c.mrrCents, 0),
        forecastCents: Math.round(
          open.reduce((a, c) => a + (c.mrrCents * (prob.get(c.stageId) ?? 0)) / 100, 0),
        ),
        overdueFollowups: open.filter((c) => c.nextAction && c.nextAction.dueAt < now),
      },
    };
  });
}

export async function listLeads(ctx: Ctx) {
  assertCan(ctx, 'comercial.view');
  return read(ctx, async (tx) => {
    const sc = scopeWhere(ctx, 'comercial.view', { owners: [s.leads.ownerId] });
    return tx
      .select({
        lead: s.leads,
        org: s.organizations,
        person: s.people,
        owner: s.users.name,
        opportunityId: s.opportunities.id,
        stage: s.pipelineStages.name,
        state: s.opportunities.state,
      })
      .from(s.leads)
      .innerJoin(s.organizations, eq(s.organizations.id, s.leads.organizationId))
      .leftJoin(s.people, eq(s.people.id, s.leads.personId))
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.leads.ownerId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .leftJoin(s.opportunities, eq(s.opportunities.leadId, s.leads.id))
      .leftJoin(s.pipelineStages, eq(s.pipelineStages.id, s.opportunities.stageId))
      .where(sc)
      .orderBy(desc(s.leads.createdAt));
  });
}

export async function getOpportunity(ctx: Ctx, id: string) {
  assertCan(ctx, 'comercial.view');
  return read(ctx, async (tx) => {
    const o = await getOpp(tx, id);
    assertCan(ctx, 'comercial.view', oppResource(o));
    const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, o.organizationId));
    const person = o.personId
      ? (await tx.select().from(s.people).where(eq(s.people.id, o.personId)))[0]
      : undefined;
    const [lead] = o.leadId ? await tx.select().from(s.leads).where(eq(s.leads.id, o.leadId)) : [];
    const { stages } = await defaultPipeline(tx);
    const activities = await tx
      .select({ a: s.commercialActivities, actor: s.users.name })
      .from(s.commercialActivities)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.commercialActivities.actorId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.commercialActivities.organizationId, o.organizationId))
      .orderBy(desc(s.commercialActivities.occurredAt));
    const actions = await tx
      .select()
      .from(s.nextActions)
      .where(eq(s.nextActions.opportunityId, id))
      .orderBy(asc(s.nextActions.dueAt));
    const proposals = await tx
      .select()
      .from(s.proposals)
      .where(eq(s.proposals.opportunityId, id))
      .orderBy(desc(s.proposals.createdAt));
    const versions = proposals.length
      ? await tx
          .select()
          .from(s.proposalVersions)
          .where(
            inArray(
              s.proposalVersions.proposalId,
              proposals.map((p) => p.id),
            ),
          )
          .orderBy(desc(s.proposalVersions.number))
      : [];
    const items = versions.length
      ? await tx
          .select()
          .from(s.proposalItems)
          .where(
            inArray(
              s.proposalItems.versionId,
              versions.map((v) => v.id),
            ),
          )
      : [];
    const meetings = await tx.select().from(s.meetings).where(eq(s.meetings.opportunityId, id));
    const lostReasons = await tx.select().from(s.lostReasons).orderBy(asc(s.lostReasons.name));
    const history = await tx
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.entityType, 'opportunity'), eq(s.auditLogs.entityId, id)))
      .orderBy(desc(s.auditLogs.createdAt));
    const [owner] = o.ownerId
      ? await tx
          .select({ name: s.users.name })
          .from(s.workspaceMembers)
          .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
          .where(eq(s.workspaceMembers.id, o.ownerId))
      : [];
    return {
      opportunity: o,
      organization: org!,
      person: person ?? null,
      lead: lead ?? null,
      ownerName: owner?.name ?? null,
      stages,
      activities,
      nextActions: actions,
      proposals: proposals.map((p) => ({
        ...p,
        versions: versions
          .filter((v) => v.proposalId === p.id)
          .map((v) => ({ ...v, items: items.filter((i) => i.versionId === v.id) })),
      })),
      meetings,
      lostReasons,
      history,
    };
  });
}

export async function listProposals(ctx: Ctx) {
  assertCan(ctx, 'comercial.view');
  return read(ctx, (tx) =>
    tx
      .select({
        p: s.proposals,
        org: s.organizations.name,
        mrr: s.opportunities.mrrCents,
        setup: s.opportunities.setupCents,
        opportunityId: s.opportunities.id,
      })
      .from(s.proposals)
      .innerJoin(s.opportunities, eq(s.opportunities.id, s.proposals.opportunityId))
      .innerJoin(s.organizations, eq(s.organizations.id, s.opportunities.organizationId))
      .where(scopeWhere(ctx, 'comercial.view', { owners: [s.opportunities.ownerId] }))
      .orderBy(desc(s.proposals.createdAt)),
  );
}

export async function commercialDashboard(ctx: Ctx) {
  const board = await pipelineBoard(ctx);
  return read(ctx, async (tx) => {
    const month = new Date().toISOString().slice(0, 7);
    const [goal] = await tx
      .select()
      .from(s.salesGoals)
      .where(and(eq(s.salesGoals.period, month), isNull(s.salesGoals.ownerId)));
    const won = await tx
      .select({ mrr: s.opportunities.mrrCents })
      .from(s.opportunities)
      .where(
        and(
          eq(s.opportunities.state, 'won'),
          sql`to_char(${s.opportunities.wonAt} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ${month}`,
        ),
      );
    const proposals = await tx
      .select({ status: s.proposals.status, n: sql<number>`count(*)::int` })
      .from(s.proposals)
      .groupBy(s.proposals.status);
    const lost = await tx
      .select({ reason: s.lostReasons.name, n: sql<number>`count(*)::int` })
      .from(s.opportunities)
      .innerJoin(s.lostReasons, eq(s.lostReasons.id, s.opportunities.lostReasonId))
      .groupBy(s.lostReasons.name);
    const soldCents = won.reduce((a, w) => a + w.mrr, 0);
    return {
      ...board,
      goalCents: goal?.mrrTargetCents ?? 0,
      soldCents,
      proposalsByStatus: proposals,
      lostByReason: lost,
    };
  });
}

// ───────────────────────────── Comandos ─────────────────────────────

export interface CreateLeadInput {
  companyName: string;
  organizationId?: string;
  contactName?: string;
  contactRole?: string;
  email?: string;
  phone?: string;
  segment?: string;
  city?: string;
  instagram?: string;
  source?: string;
  campaign?: string;
  temperature?: Temperature;
  ownerId?: string;
  need?: string;
  budget?: string;
  mrrCents?: number;
  setupCents?: number;
  service?: string;
}

/** Cria organização (ou reaproveita), pessoa, lead e oportunidade em "Novo lead" com a 1ª próxima ação. */
export async function createLead(ctx: Ctx, input: CreateLeadInput) {
  assertCan(ctx, 'comercial.edit');
  if (!input.companyName.trim() && !input.organizationId) throw badRequest('Informe a empresa.');
  return command('crm.createLead', ctx, async (kit) => {
    const { tx } = kit;
    const ws = ctx.workspaceId;
    let orgId = input.organizationId;
    if (!orgId) {
      const [org] = await tx
        .insert(s.organizations)
        .values({
          workspaceId: ws,
          name: input.companyName.trim(),
          segment: input.segment,
          city: input.city,
          instagram: input.instagram,
          createdBy: ctx.userId,
        })
        .returning();
      orgId = org!.id;
    }
    let personId: string | undefined;
    if (input.contactName?.trim()) {
      const [p] = await tx
        .insert(s.people)
        .values({
          workspaceId: ws,
          organizationId: orgId,
          name: input.contactName.trim(),
          roleTitle: input.contactRole,
          email: input.email,
          phone: input.phone,
        })
        .returning();
      personId = p!.id;
    }
    const ownerId = input.ownerId ?? (ctx.actorType === 'user' ? ctx.memberId : undefined);
    const [lead] = await tx
      .insert(s.leads)
      .values({
        workspaceId: ws,
        organizationId: orgId,
        personId,
        source: input.source,
        campaign: input.campaign,
        temperature: input.temperature ?? 'warm',
        ownerId,
        need: input.need,
        budget: input.budget,
        createdBy: ctx.userId,
      })
      .returning();
    const { pipeline, stages } = await defaultPipeline(tx);
    const [opp] = await tx
      .insert(s.opportunities)
      .values({
        workspaceId: ws,
        pipelineId: pipeline.id,
        stageId: stages[0]!.id,
        leadId: lead!.id,
        organizationId: orgId,
        personId,
        type: 'new',
        temperature: input.temperature ?? 'warm',
        ownerId,
        title: input.companyName.trim(),
        service: input.service,
        mrrCents: input.mrrCents ?? 0,
        setupCents: input.setupCents ?? 0,
        source: input.source,
        createdBy: ctx.userId,
      })
      .returning();
    // Regra aprovada: 1º contato em 2 horas úteis (prazo pelo @aos/sla).
    const due = await dueFromPolicy(tx, { model: 'business_hours', amount: 2 }, new Date());
    await tx.insert(s.nextActions).values({
      workspaceId: ws,
      opportunityId: opp!.id,
      title: '1º contato',
      dueAt: due,
      ownerId,
      source: 'automation',
    });
    await tx.insert(s.commercialActivities).values({
      workspaceId: ws,
      opportunityId: opp!.id,
      organizationId: orgId,
      type: 'note',
      summary: `Lead criado${input.source ? ` · ${input.source}` : ''}${input.campaign ? ` · ${input.campaign}` : ''}`,
      actorId: ctx.actorType === 'user' ? ctx.memberId : null,
    });
    await kit.audit({ action: 'lead.created', entityType: 'lead', entityId: lead!.id, after: lead });
    await kit.emit({
      type: 'lead.created',
      entityType: 'lead',
      entityId: lead!.id,
      payload: { leadId: lead!.id, opportunityId: opp!.id, ownerId: ownerId ?? null },
    });
    await kit.emit({
      type: 'opportunity.created',
      entityType: 'opportunity',
      entityId: opp!.id,
      payload: { opportunityId: opp!.id },
    });
    return { leadId: lead!.id, opportunityId: opp!.id, organizationId: orgId };
  });
}

/** Upsell ou renovação para cliente existente (client_id obrigatório). */
export async function createClientOpportunity(
  ctx: Ctx,
  input: {
    clientId: string;
    type: 'upsell' | 'renewal';
    title: string;
    mrrCents: number;
    setupCents?: number;
    service?: string;
  },
) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.createClientOpportunity', ctx, async (kit) => {
    const { tx } = kit;
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, input.clientId));
    const c = must(client, 'Cliente não encontrado.');
    const { pipeline, stages } = await defaultPipeline(tx);
    const [opp] = await tx
      .insert(s.opportunities)
      .values({
        workspaceId: ctx.workspaceId,
        pipelineId: pipeline.id,
        stageId: stages[0]!.id,
        organizationId: c.organizationId,
        clientId: c.id,
        type: input.type,
        ownerId: ctx.memberId,
        title: input.title,
        mrrCents: input.mrrCents,
        setupCents: input.setupCents ?? 0,
        service: input.service,
        createdBy: ctx.userId,
      })
      .returning();
    const due = await dueFromPolicy(
      tx,
      { model: 'business_days', amount: 1, rule: 'A1_same_time' },
      new Date(),
    );
    await tx.insert(s.nextActions).values({
      workspaceId: ctx.workspaceId,
      opportunityId: opp!.id,
      title: 'Apresentar proposta ao cliente',
      dueAt: due,
      ownerId: ctx.memberId,
    });
    await kit.audit({
      action: 'opportunity.created',
      entityType: 'opportunity',
      entityId: opp!.id,
      after: opp,
    });
    await kit.emit({
      type: 'opportunity.created',
      entityType: 'opportunity',
      entityId: opp!.id,
      payload: { opportunityId: opp!.id },
    });
    return opp!;
  });
}

export async function moveOpportunity(ctx: Ctx, id: string, stageId: string, position?: number) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.moveOpportunity', ctx, async (kit) => {
    const { tx } = kit;
    const o = await getOpp(tx, id);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    if (o.state !== 'open') throw badRequest('Reative a oportunidade antes de mover.');
    const [stage] = await tx.select().from(s.pipelineStages).where(eq(s.pipelineStages.id, stageId));
    const st = must(stage, 'Etapa não encontrada.');
    if (st.isWon) throw badRequest('Use "Marcar como ganho" para fechar a venda.');
    const [after] = await tx
      .update(s.opportunities)
      .set({ stageId, position: position ?? o.position, updatedAt: new Date() })
      .where(eq(s.opportunities.id, id))
      .returning();
    if (o.stageId !== stageId) {
      await kit.audit({
        action: 'opportunity.stage_changed',
        entityType: 'opportunity',
        entityId: id,
        before: { stageId: o.stageId },
        after: { stageId },
      });
      await kit.emit({
        type: 'opportunity.stage_changed',
        entityType: 'opportunity',
        entityId: id,
        payload: { opportunityId: id, fromStageId: o.stageId, toStageId: stageId },
      });
    }
    return after!;
  });
}

/** Estados paralelos: Sem resposta, Pausado, Perdido (motivo obrigatório) e reabrir. */
export async function setOpportunityState(
  ctx: Ctx,
  id: string,
  state: Exclude<OppState, 'won'>,
  opts: { lostReasonId?: string; note?: string } = {},
) {
  assertCan(ctx, 'comercial.edit');
  if (state === 'lost' && !opts.lostReasonId) throw badRequest('Motivo da perda é obrigatório.');
  return command('crm.setOpportunityState', ctx, async (kit) => {
    const o = await getOpp(kit.tx, id);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    if (o.state === 'won') throw badRequest('Oportunidade ganha não muda de estado.');
    const [after] = await kit.tx
      .update(s.opportunities)
      .set({
        state,
        lostReasonId: state === 'lost' ? opts.lostReasonId : null,
        lostNote: state === 'lost' ? (opts.note ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(s.opportunities.id, id))
      .returning();
    await kit.audit({
      action: 'opportunity.state_changed',
      entityType: 'opportunity',
      entityId: id,
      before: { state: o.state },
      after: { state, lostReasonId: opts.lostReasonId ?? null },
    });
    await kit.emit({
      type: 'opportunity.state_changed',
      entityType: 'opportunity',
      entityId: id,
      payload: { opportunityId: id, from: o.state, to: state },
    });
    if (state === 'lost')
      await kit.emit({
        type: 'opportunity.lost',
        entityType: 'opportunity',
        entityId: id,
        payload: { opportunityId: id, lostReasonId: opts.lostReasonId! },
      });
    return after!;
  });
}

/** Ganho: exige proposta aceita (fluxo aprovado lead → proposta aceita → ganho). */
export async function markWon(ctx: Ctx, id: string) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.markWon', ctx, async (kit) => {
    const { tx } = kit;
    const o = await getOpp(tx, id);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    if (o.state === 'won') return o;
    const accepted = await tx
      .select()
      .from(s.proposals)
      .where(and(eq(s.proposals.opportunityId, id), eq(s.proposals.status, 'accepted')));
    if (!accepted.length) throw badRequest('Registre a proposta aceita antes de marcar como ganho.');
    const { stages } = await defaultPipeline(tx);
    const won = must(
      stages.find((st) => st.isWon),
      'Etapa "Ganho" não configurada.',
    );
    const now = new Date();
    const [after] = await tx
      .update(s.opportunities)
      .set({ state: 'won', stageId: won.id, wonAt: now, updatedAt: now })
      .where(eq(s.opportunities.id, id))
      .returning();
    await tx
      .update(s.nextActions)
      .set({ doneAt: now })
      .where(and(eq(s.nextActions.opportunityId, id), isNull(s.nextActions.doneAt)));
    await kit.audit({
      action: 'opportunity.won',
      entityType: 'opportunity',
      entityId: id,
      before: { state: o.state, stageId: o.stageId },
      after: { state: 'won', stageId: won.id },
    });
    await kit.emit({
      type: 'opportunity.won',
      entityType: 'opportunity',
      entityId: id,
      payload: { opportunityId: id },
    });
    return after!;
  });
}

export async function logActivity(ctx: Ctx, opportunityId: string, type: ActivityType, summary: string) {
  assertCan(ctx, 'comercial.edit');
  if (!summary.trim()) throw badRequest('Descreva a atividade.');
  return command('crm.logActivity', ctx, async (kit) => {
    const o = await getOpp(kit.tx, opportunityId);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    const now = new Date();
    const [a] = await kit.tx
      .insert(s.commercialActivities)
      .values({
        workspaceId: ctx.workspaceId,
        opportunityId,
        organizationId: o.organizationId,
        type,
        summary: summary.trim(),
        occurredAt: now,
        actorId: ctx.memberId,
      })
      .returning();
    await kit.tx
      .update(s.opportunities)
      .set({ lastInteractionAt: now, updatedAt: now })
      .where(eq(s.opportunities.id, opportunityId));
    await kit.emit({
      type: 'activity.logged',
      entityType: 'opportunity',
      entityId: opportunityId,
      payload: { opportunityId, type },
    });
    return a!;
  });
}

/** Conclui a próxima ação e define a seguinte (obrigatória enquanto a oportunidade estiver aberta). */
export async function completeNextAction(
  ctx: Ctx,
  nextActionId: string,
  next?: { title: string; dueAt: Date },
) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.completeNextAction', ctx, async (kit) => {
    const { tx } = kit;
    const [na] = await tx.select().from(s.nextActions).where(eq(s.nextActions.id, nextActionId));
    const action = must(na, 'Próxima ação não encontrada.');
    const o = await getOpp(tx, action.opportunityId);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    const open = await tx
      .select()
      .from(s.nextActions)
      .where(
        and(
          eq(s.nextActions.opportunityId, o.id),
          isNull(s.nextActions.doneAt),
          ne(s.nextActions.id, nextActionId),
        ),
      );
    if (o.state === 'open' && !open.length && !next?.title.trim())
      throw badRequest('Toda oportunidade aberta precisa de próxima ação. Defina a próxima.');
    await tx.update(s.nextActions).set({ doneAt: new Date() }).where(eq(s.nextActions.id, nextActionId));
    if (next?.title.trim())
      await tx.insert(s.nextActions).values({
        workspaceId: ctx.workspaceId,
        opportunityId: o.id,
        title: next.title.trim(),
        dueAt: next.dueAt,
        ownerId: o.ownerId ?? ctx.memberId,
      });
    await kit.audit({
      action: 'next_action.completed',
      entityType: 'opportunity',
      entityId: o.id,
      after: { done: action.title, next: next?.title ?? null },
    });
  });
}

export async function rescheduleNextAction(ctx: Ctx, nextActionId: string, dueAt: Date) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.rescheduleNextAction', ctx, async (kit) => {
    const [na] = await kit.tx
      .update(s.nextActions)
      .set({ dueAt, updatedAt: new Date() })
      .where(eq(s.nextActions.id, nextActionId))
      .returning();
    must(na);
  });
}

export async function addNextAction(ctx: Ctx, opportunityId: string, title: string, dueAt: Date) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.addNextAction', ctx, async (kit) => {
    const o = await getOpp(kit.tx, opportunityId);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    await kit.tx.insert(s.nextActions).values({
      workspaceId: ctx.workspaceId,
      opportunityId,
      title,
      dueAt,
      ownerId: o.ownerId ?? ctx.memberId,
    });
  });
}

// ───────────────────────────── Propostas ─────────────────────────────

export interface ProposalItemInput {
  description: string;
  kind: 'setup' | 'recurring';
  quantity: number;
  unitCents: number;
}

const totals = (items: ProposalItemInput[]) => ({
  setupCents: items.filter((i) => i.kind === 'setup').reduce((a, i) => a + i.quantity * i.unitCents, 0),
  mrrCents: items.filter((i) => i.kind === 'recurring').reduce((a, i) => a + i.quantity * i.unitCents, 0),
});

async function insertVersion(
  kit: { tx: Tx; ctx: { workspaceId: string; userId?: string | null } },
  proposalId: string,
  number: number,
  items: ProposalItemInput[],
  notes?: string,
) {
  if (!items.length) throw badRequest('A proposta precisa de ao menos um item.');
  const t = totals(items);
  const [v] = await kit.tx
    .insert(s.proposalVersions)
    .values({
      workspaceId: kit.ctx.workspaceId,
      proposalId,
      number,
      notes,
      ...t,
      createdBy: kit.ctx.userId ?? null,
    })
    .returning();
  await kit.tx.insert(s.proposalItems).values(
    items.map((i) => ({
      workspaceId: kit.ctx.workspaceId,
      versionId: v!.id,
      description: i.description,
      kind: i.kind,
      quantity: i.quantity,
      unitCents: i.unitCents,
    })),
  );
  return { version: v!, ...t };
}

export async function createProposal(
  ctx: Ctx,
  opportunityId: string,
  input: { title: string; items: ProposalItemInput[]; notes?: string; validUntil?: string },
) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.createProposal', ctx, async (kit) => {
    const { tx } = kit;
    const o = await getOpp(tx, opportunityId);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(s.proposals)) as [{ n: number }];
    const [p] = await tx
      .insert(s.proposals)
      .values({
        workspaceId: ctx.workspaceId,
        opportunityId,
        number: `P-${String(n + 1).padStart(4, '0')}`,
        title: input.title,
        status: 'draft',
        validUntil: input.validUntil,
        createdBy: ctx.userId,
      })
      .returning();
    const t = await insertVersion(kit, p!.id, 1, input.items, input.notes);
    await tx
      .update(s.opportunities)
      .set({ mrrCents: t.mrrCents, setupCents: t.setupCents, updatedAt: new Date() })
      .where(eq(s.opportunities.id, opportunityId));
    await kit.audit({
      action: 'proposal.created',
      entityType: 'proposal',
      entityId: p!.id,
      after: { ...p, ...t },
    });
    await kit.emit({
      type: 'proposal.created',
      entityType: 'proposal',
      entityId: p!.id,
      payload: { proposalId: p!.id, opportunityId },
    });
    return p!;
  });
}

export async function newProposalVersion(
  ctx: Ctx,
  proposalId: string,
  input: { items: ProposalItemInput[]; notes?: string },
) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.newProposalVersion', ctx, async (kit) => {
    const { tx } = kit;
    const [p] = await tx.select().from(s.proposals).where(eq(s.proposals.id, proposalId));
    const prop = must(p, 'Proposta não encontrada.');
    if (prop.status === 'accepted' || prop.status === 'refused') throw badRequest('Proposta já encerrada.');
    const number = prop.currentVersion + 1;
    const t = await insertVersion(kit, proposalId, number, input.items, input.notes);
    await tx
      .update(s.proposals)
      .set({ currentVersion: number, status: 'draft', updatedAt: new Date() })
      .where(eq(s.proposals.id, proposalId));
    await tx
      .update(s.opportunities)
      .set({ mrrCents: t.mrrCents, setupCents: t.setupCents, updatedAt: new Date() })
      .where(eq(s.opportunities.id, prop.opportunityId));
    await kit.audit({
      action: 'proposal.versioned',
      entityType: 'proposal',
      entityId: proposalId,
      before: { version: prop.currentVersion },
      after: { version: number, setupCents: t.setupCents, mrrCents: t.mrrCents },
    });
  });
}

export async function sendProposal(ctx: Ctx, proposalId: string) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.sendProposal', ctx, async (kit) => {
    const { tx } = kit;
    const [p] = await tx.select().from(s.proposals).where(eq(s.proposals.id, proposalId));
    const prop = must(p, 'Proposta não encontrada.');
    if (!['draft', 'ready', 'negotiation', 'sent', 'viewed'].includes(prop.status))
      throw badRequest('Esta proposta não pode ser enviada.');
    const now = new Date();
    await tx
      .update(s.proposals)
      .set({ status: 'sent', sentAt: now, updatedAt: now })
      .where(eq(s.proposals.id, proposalId));
    const o = await getOpp(tx, prop.opportunityId);
    const { stages } = await defaultPipeline(tx);
    const proposalStage = stages.find((st) => st.key === 'proposal');
    if (proposalStage && o.state === 'open') {
      const curPos = stages.find((st) => st.id === o.stageId)?.position ?? 0;
      if (curPos < proposalStage.position)
        await tx
          .update(s.opportunities)
          .set({ stageId: proposalStage.id })
          .where(eq(s.opportunities.id, o.id));
    }
    await tx.insert(s.commercialActivities).values({
      workspaceId: ctx.workspaceId,
      opportunityId: o.id,
      organizationId: o.organizationId,
      type: 'proposal',
      summary: `${prop.number} v${prop.currentVersion} enviada.`,
      actorId: ctx.memberId,
    });
    await tx.update(s.opportunities).set({ lastInteractionAt: now }).where(eq(s.opportunities.id, o.id));
    await kit.audit({
      action: 'proposal.sent',
      entityType: 'proposal',
      entityId: proposalId,
      before: { status: prop.status },
      after: { status: 'sent', version: prop.currentVersion },
    });
    await kit.emit({
      type: 'proposal.sent',
      entityType: 'proposal',
      entityId: proposalId,
      payload: { proposalId, opportunityId: o.id, version: prop.currentVersion },
    });
  });
}

export async function decideProposal(ctx: Ctx, proposalId: string, decision: 'accepted' | 'refused') {
  assertCan(ctx, 'comercial.edit');
  return command('crm.decideProposal', ctx, async (kit) => {
    const { tx } = kit;
    const [p] = await tx.select().from(s.proposals).where(eq(s.proposals.id, proposalId));
    const prop = must(p, 'Proposta não encontrada.');
    if (prop.status === 'accepted' || prop.status === 'refused') throw badRequest('Proposta já decidida.');
    const now = new Date();
    await tx
      .update(s.proposals)
      .set({ status: decision, acceptedAt: decision === 'accepted' ? now : null, updatedAt: now })
      .where(eq(s.proposals.id, proposalId));
    if (decision === 'accepted') {
      // Os demais follow-ups automáticos perdem o sentido.
      await tx
        .update(s.nextActions)
        .set({ doneAt: now })
        .where(
          and(
            eq(s.nextActions.opportunityId, prop.opportunityId),
            eq(s.nextActions.source, 'automation'),
            isNull(s.nextActions.doneAt),
          ),
        );
    }
    await kit.audit({
      action: `proposal.${decision}`,
      entityType: 'proposal',
      entityId: proposalId,
      before: { status: prop.status },
      after: { status: decision },
    });
    await kit.emit({
      type: decision === 'accepted' ? 'proposal.accepted' : 'proposal.refused',
      entityType: 'proposal',
      entityId: proposalId,
      payload: { proposalId, opportunityId: prop.opportunityId },
    });
  });
}

export async function updateOpportunity(
  ctx: Ctx,
  id: string,
  patch: Partial<{
    temperature: Temperature;
    ownerId: string;
    service: string;
    expectedCloseOn: string | null;
    title: string;
  }>,
) {
  assertCan(ctx, 'comercial.edit');
  return command('crm.updateOpportunity', ctx, async (kit) => {
    const o = await getOpp(kit.tx, id);
    assertCan(ctx, 'comercial.edit', oppResource(o));
    const [after] = await kit.tx
      .update(s.opportunities)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(s.opportunities.id, id))
      .returning();
    await kit.audit({
      action: 'opportunity.updated',
      entityType: 'opportunity',
      entityId: id,
      before: o as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after!;
  });
}

export async function listLostReasons(ctx: Ctx) {
  return read(ctx, (tx) => tx.select().from(s.lostReasons).orderBy(asc(s.lostReasons.name)));
}
