import { eq } from 'drizzle-orm';
import { adminDb, schema as s } from '@aos/db';
import { createLead, createProposal, decideProposal, markWon, sendProposal } from './crm';
import { convertOpportunity } from './convert';
import { memberOptions } from './members';
import type { Ctx } from './context';
import { uniq } from './test-helpers';

/** Lead → proposta aceita → ganho (sem converter). */
export async function wonOpportunity(ctx: Ctx, name = uniq('Empresa Teste')) {
  const l = await createLead(ctx, {
    companyName: name,
    contactName: 'Pessoa Teste',
    email: 'pessoa@teste.demo.local',
  });
  const p = await createProposal(ctx, l.opportunityId, {
    title: 'Plano teste',
    items: [
      { description: 'Gestão mensal', kind: 'recurring', quantity: 1, unitCents: 500_000 },
      { description: 'Setup', kind: 'setup', quantity: 1, unitCents: 120_000 },
    ],
  });
  await sendProposal(ctx, p.id);
  await decideProposal(ctx, p.id, 'accepted');
  await markWon(ctx, l.opportunityId);
  return { ...l, proposalId: p.id, name };
}

export async function teamFor(ctx: Ctx) {
  const ms = await memberOptions(ctx);
  const id = (n: string) => ms.find((m) => m.name === n)!.id;
  return [
    { function: 'atendimento', memberId: id('Bia') },
    { function: 'design', memberId: id('Rafa') },
    { function: 'copy', memberId: id('Caio') },
  ];
}

/** Cliente novo convertido (contrato aguardando o Financeiro). */
export async function convertedClient(ctx: Ctx) {
  const o = await wonOpportunity(ctx);
  const r = await convertOpportunity(ctx, {
    opportunityId: o.opportunityId,
    idempotencyKey: crypto.randomUUID(),
    team: await teamFor(ctx),
  });
  return { ...o, ...r };
}

/** PNG mínimo válido para os testes de upload (assinatura correta). */
export const PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
]);

export async function eventsOf(type: string, entityId: string) {
  return adminDb()
    .select()
    .from(s.domainEvents)
    .where(eq(s.domainEvents.type, type))
    .then((r) => r.filter((e) => e.entityId === entityId || JSON.stringify(e.payload).includes(entityId)));
}
