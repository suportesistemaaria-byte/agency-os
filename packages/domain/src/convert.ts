import { and, desc, eq, sql } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import { assertCan, command, type Ctx } from './context';
import { badRequest, must } from './errors';
import { instantiateOnboarding, TEAM_FUNCTIONS } from './clients';

export interface ConvertInput {
  opportunityId: string;
  /** Repetir a chamada com a mesma chave (ou para a mesma oportunidade) devolve o mesmo cliente. */
  idempotencyKey: string;
  missingData?: { legalName?: string; cnpj?: string; address?: string };
  team: { function: string; memberId: string }[];
  onboardingTemplateId?: string;
  startOn?: string;
  endOn?: string;
  billingDay?: number;
}

export interface ConvertResult {
  clientId: string;
  contractId: string | null;
  onboardingId: string | null;
  created: boolean;
}

/**
 * crm.convertOpportunity — V3, seção 7. Uma transação; se qualquer passo falhar, nada é gravado.
 * Idempotente: se a oportunidade já gerou cliente, devolve o mesmo cliente sem criar nada.
 */
export async function convertOpportunity(ctx: Ctx, input: ConvertInput): Promise<ConvertResult> {
  assertCan(ctx, 'comercial.edit');
  assertCan(ctx, 'clientes.edit');
  for (const t of input.team)
    if (!TEAM_FUNCTIONS[t.function]) throw badRequest(`Função inválida: ${t.function}`);
  return command('crm.convertOpportunity', ctx, async (kit) => {
    const { tx } = kit;
    const ws = ctx.workspaceId;
    // 1. trava a oportunidade; exige ganho e proposta aceita
    const locked = await tx.execute<{ id: string }>(
      sql`select id from opportunities where id = ${input.opportunityId} for update`,
    );
    if (!locked.rows.length) throw badRequest('Oportunidade não encontrada.');
    const [opp] = await tx.select().from(s.opportunities).where(eq(s.opportunities.id, input.opportunityId));
    const o = opp!;
    // 2. idempotência
    const [existing] = await tx.select().from(s.clients).where(eq(s.clients.opportunityId, o.id));
    if (existing) {
      const [ct] = await tx.select().from(s.contracts).where(eq(s.contracts.clientId, existing.id)).limit(1);
      const [ob] = await tx
        .select()
        .from(s.clientOnboardings)
        .where(eq(s.clientOnboardings.clientId, existing.id))
        .limit(1);
      return {
        clientId: existing.id,
        contractId: ct?.id ?? null,
        onboardingId: ob?.id ?? null,
        created: false,
      };
    }
    if (o.type !== 'new')
      throw badRequest('Upsell e renovação viram aditivo do contrato, não um novo cliente.');
    if (o.state !== 'won') throw badRequest('Só oportunidades ganhas viram cliente.');
    const [proposal] = await tx
      .select()
      .from(s.proposals)
      .where(and(eq(s.proposals.opportunityId, o.id), eq(s.proposals.status, 'accepted')))
      .orderBy(desc(s.proposals.acceptedAt))
      .limit(1);
    const prop = must(proposal, 'A conversão exige uma proposta aceita.');
    // 3. reaproveita organização e pessoas; completa só o que falta
    const [org] = await tx.select().from(s.organizations).where(eq(s.organizations.id, o.organizationId));
    const patch: Record<string, string> = {};
    if (input.missingData?.legalName && !org!.legalName) patch.legalName = input.missingData.legalName;
    if (input.missingData?.cnpj && !org!.cnpj) patch.cnpj = input.missingData.cnpj;
    if (input.missingData?.address && !org!.address) patch.address = input.missingData.address;
    if (Object.keys(patch).length)
      await tx
        .update(s.organizations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(s.organizations.id, org!.id));
    // 4. cliente em onboarding, origem preservada
    const team = new Map(input.team.map((t) => [t.function, t.memberId]));
    const [client] = await tx
      .insert(s.clients)
      .values({
        workspaceId: ws,
        organizationId: org!.id,
        opportunityId: o.id,
        name: org!.name,
        segment: org!.segment,
        plan: o.service,
        status: 'onboarding',
        ownerId: team.get('atendimento') ?? o.ownerId,
        startedOn: input.startOn ?? new Date().toISOString().slice(0, 10),
        createdBy: ctx.userId,
      })
      .returning();
    const clientId = client!.id;
    // 5. contatos a partir das pessoas (o principal recebe aprovar e financeiro)
    const people = await tx.select().from(s.people).where(eq(s.people.organizationId, org!.id));
    for (const p of people) {
      const primary = p.id === o.personId || people.length === 1;
      await tx.insert(s.clientContacts).values({
        workspaceId: ws,
        clientId,
        personId: p.id,
        isPrimary: primary,
        canApprove: primary,
        receivesFinance: primary,
      });
    }
    // 6. contrato a partir da proposta aceita (aguardando confirmação do Financeiro)
    const [version] = await tx
      .select()
      .from(s.proposalVersions)
      .where(
        and(eq(s.proposalVersions.proposalId, prop.id), eq(s.proposalVersions.number, prop.currentVersion)),
      );
    const items = await tx.select().from(s.proposalItems).where(eq(s.proposalItems.versionId, version!.id));
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(s.contracts)) as [{ n: number }];
    const start = input.startOn ?? new Date().toISOString().slice(0, 10);
    const end = input.endOn ?? new Date(Date.parse(start) + 365 * 86_400_000).toISOString().slice(0, 10);
    const [contract] = await tx
      .insert(s.contracts)
      .values({
        workspaceId: ws,
        clientId,
        opportunityId: o.id,
        proposalId: prop.id,
        number: `C-${String(n + 1).padStart(4, '0')}`,
        status: 'pending_finance_confirmation',
        startOn: start,
        endOn: end,
        billingDay: input.billingDay ?? 10,
        createdBy: ctx.userId,
      })
      .returning();
    if (items.length)
      await tx.insert(s.contractItems).values(
        items.map((i) => ({
          workspaceId: ws,
          contractId: contract!.id,
          description: i.description,
          kind: i.kind === 'setup' ? ('setup' as const) : ('recurring' as const),
          amountCents: i.quantity * i.unitCents,
        })),
      );
    // 7. equipe da conta
    for (const t of input.team)
      await tx
        .insert(s.clientTeam)
        .values({ workspaceId: ws, clientId, function: t.function, memberId: t.memberId });
    // 8. onboarding a partir do template
    let templateId = input.onboardingTemplateId;
    if (!templateId) {
      const [tpl] = await tx
        .select()
        .from(s.onboardingTemplates)
        .where(eq(s.onboardingTemplates.isDefault, true))
        .limit(1);
      templateId = tpl?.id;
    }
    const onboarding = templateId ? await instantiateOnboarding(tx, ws, clientId, templateId, team) : null;
    // 9. oportunidade aponta para o cliente
    const now = new Date();
    await tx
      .update(s.opportunities)
      .set({ convertedClientId: clientId, convertedAt: now, updatedAt: now })
      .where(eq(s.opportunities.id, o.id));
    // 10. auditoria
    await kit.audit({
      action: 'opportunity.converted',
      entityType: 'opportunity',
      entityId: o.id,
      before: { convertedClientId: null },
      after: { convertedClientId: clientId, contractId: contract!.id, team: input.team },
      metadata: { idempotencyKey: input.idempotencyKey },
    });
    // 11. eventos
    await kit.emit({
      type: 'opportunity.converted',
      entityType: 'opportunity',
      entityId: o.id,
      payload: { opportunityId: o.id, clientId },
      idempotencyKey: `convert:${input.idempotencyKey}`,
    });
    await kit.emit({
      type: 'client.created',
      entityType: 'client',
      entityId: clientId,
      payload: { clientId, opportunityId: o.id },
    });
    await kit.emit({
      type: 'contract.created',
      entityType: 'contract',
      entityId: contract!.id,
      payload: { contractId: contract!.id, clientId },
    });
    if (onboarding)
      await kit.emit({
        type: 'onboarding.started',
        entityType: 'client',
        entityId: clientId,
        payload: { clientId, onboardingId: onboarding.id },
      });
    return { clientId, contractId: contract!.id, onboardingId: onboarding?.id ?? null, created: true };
  });
}
