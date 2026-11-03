import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, closeAll, schema as s } from '@aos/db';
import { convertOpportunity } from './convert';
import { createLead } from './crm';
import type { Ctx } from './context';
import { ctxOf, hasDb } from './test-helpers';
import { teamFor, wonOpportunity } from './flows.int-helpers';

describe.skipIf(!hasDb())('conversão Lead → Cliente (V3, seção 7)', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
  });
  afterAll(closeAll);
  const db = () => adminDb();

  it('sucesso: cliente, contatos, contrato aguardando o Financeiro, equipe, onboarding, auditoria e eventos', async () => {
    const o = await wonOpportunity(ctx);
    const team = await teamFor(ctx);
    const r = await convertOpportunity(ctx, {
      opportunityId: o.opportunityId,
      idempotencyKey: crypto.randomUUID(),
      team,
      missingData: { cnpj: '11.111.111/0001-11' },
    });
    expect(r.created).toBe(true);
    const [client] = await db().select().from(s.clients).where(eq(s.clients.id, r.clientId));
    expect(client).toMatchObject({
      status: 'onboarding',
      opportunityId: o.opportunityId,
      organizationId: o.organizationId,
      name: o.name,
    });
    // reaproveita organização e pessoa do lead (sem recadastro)
    const contacts = await db()
      .select()
      .from(s.clientContacts)
      .where(eq(s.clientContacts.clientId, r.clientId));
    const [lead] = await db().select().from(s.leads).where(eq(s.leads.id, o.leadId));
    expect(contacts.map((c) => c.personId)).toContain(lead!.personId);
    expect(contacts.find((c) => c.isPrimary)).toMatchObject({ canApprove: true, receivesFinance: true });
    const [org] = await db().select().from(s.organizations).where(eq(s.organizations.id, o.organizationId));
    expect(org!.cnpj).toBe('11.111.111/0001-11');
    // contrato a partir da proposta aceita, aguardando o Financeiro; nenhuma fatura ainda
    const [contract] = await db().select().from(s.contracts).where(eq(s.contracts.id, r.contractId!));
    expect(contract!.status).toBe('pending_finance_confirmation');
    const items = await db()
      .select()
      .from(s.contractItems)
      .where(eq(s.contractItems.contractId, r.contractId!));
    expect(items.map((i) => [i.kind, i.amountCents]).sort()).toEqual([
      ['recurring', 500_000],
      ['setup', 120_000],
    ]);
    expect(await db().select().from(s.invoices).where(eq(s.invoices.contractId, r.contractId!))).toHaveLength(
      0,
    );
    // equipe e onboarding de 13 etapas com responsáveis por função
    expect(await db().select().from(s.clientTeam).where(eq(s.clientTeam.clientId, r.clientId))).toHaveLength(
      team.length,
    );
    const steps = await db()
      .select()
      .from(s.onboardingSteps)
      .where(eq(s.onboardingSteps.onboardingId, r.onboardingId!));
    expect(steps).toHaveLength(13);
    expect(steps.every((st) => st.dueAt)).toBe(true);
    expect(steps.find((st) => st.function === 'design')!.assigneeId).toBe(
      team.find((t) => t.function === 'design')!.memberId,
    );
    // oportunidade aponta para o cliente; auditoria e eventos
    const [opp] = await db().select().from(s.opportunities).where(eq(s.opportunities.id, o.opportunityId));
    expect(opp!.convertedClientId).toBe(r.clientId);
    const audit = await db()
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.action, 'opportunity.converted'), eq(s.auditLogs.entityId, o.opportunityId)));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(ctx.userId);
    const types = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.workspaceId, ctx.workspaceId))
    )
      .filter(
        (e) => e.entityId === r.clientId || e.entityId === o.opportunityId || e.entityId === r.contractId,
      )
      .map((e) => e.type);
    for (const t of ['opportunity.converted', 'client.created', 'contract.created', 'onboarding.started'])
      expect(types).toContain(t);
  });

  it('falha no meio da transação não grava nada (nem cliente, nem contrato, nem eventos)', async () => {
    const o = await wonOpportunity(ctx);
    const [wsB] = await db().select().from(s.workspaces).where(eq(s.workspaces.slug, 'workspace-teste'));
    const [foreign] = await db()
      .select()
      .from(s.workspaceMembers)
      .where(eq(s.workspaceMembers.workspaceId, wsB!.id));
    const before = await db().select().from(s.contracts);
    // membro de OUTRO workspace na equipe: a FK composta falha no passo 7, depois de cliente e contrato
    await expect(
      convertOpportunity(ctx, {
        opportunityId: o.opportunityId,
        idempotencyKey: crypto.randomUUID(),
        team: [{ function: 'atendimento', memberId: foreign!.id }],
      }),
    ).rejects.toThrow();
    expect(
      await db().select().from(s.clients).where(eq(s.clients.opportunityId, o.opportunityId)),
    ).toHaveLength(0);
    expect(await db().select().from(s.contracts)).toHaveLength(before.length);
    const [opp] = await db().select().from(s.opportunities).where(eq(s.opportunities.id, o.opportunityId));
    expect(opp!.convertedClientId).toBeNull();
    const ev = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'opportunity.converted'))
    ).filter((e) => e.entityId === o.opportunityId);
    expect(ev).toHaveLength(0);
  });

  it('chamada repetida é idempotente: devolve o mesmo cliente sem duplicar nada', async () => {
    const o = await wonOpportunity(ctx);
    const team = await teamFor(ctx);
    const key = crypto.randomUUID();
    const a = await convertOpportunity(ctx, { opportunityId: o.opportunityId, idempotencyKey: key, team });
    const b = await convertOpportunity(ctx, { opportunityId: o.opportunityId, idempotencyKey: key, team });
    const c = await convertOpportunity(ctx, {
      opportunityId: o.opportunityId,
      idempotencyKey: crypto.randomUUID(),
      team,
    });
    expect(b).toEqual({ ...a, created: false });
    expect(c.clientId).toBe(a.clientId);
    expect(
      await db().select().from(s.clients).where(eq(s.clients.opportunityId, o.opportunityId)),
    ).toHaveLength(1);
    expect(await db().select().from(s.contracts).where(eq(s.contracts.clientId, a.clientId))).toHaveLength(1);
    expect(
      await db().select().from(s.clientOnboardings).where(eq(s.clientOnboardings.clientId, a.clientId)),
    ).toHaveLength(1);
  });

  it('exige oportunidade ganha com proposta aceita', async () => {
    const l = await createLead(ctx, { companyName: 'Sem proposta Ltda' });
    await expect(
      convertOpportunity(ctx, {
        opportunityId: l.opportunityId,
        idempotencyKey: crypto.randomUUID(),
        team: [],
      }),
    ).rejects.toThrow(/ganhas/);
  });

  it('designer não converte (permissão comercial.edit + clientes.edit)', async () => {
    const o = await wonOpportunity(ctx);
    const rafa = await ctxOf('rafa@demo.local');
    await expect(
      convertOpportunity(rafa, {
        opportunityId: o.opportunityId,
        idempotencyKey: crypto.randomUUID(),
        team: [],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
