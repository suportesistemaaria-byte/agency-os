/**
 * Seed de negócio e demonstração (fictício, e-mails @demo.local, senha só de dev).
 * Configuração por workspace (pipeline, templates, regras) + dados do protótipo via serviços de domínio
 * (runCommand: auditoria e eventos reais). Idempotente: se já houver clientes, não recria a demonstração.
 */
import { and, eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { adminDb, closeAll, schema as s } from '@aos/db';
import * as d from '@aos/domain';
import { calculateDueAt, type SlaPolicy } from '@aos/sla';
import { makePng } from './png';

export const DEMO_PASSWORD = 'demo1234';
const db = adminDb();
const log = (...a: unknown[]) => console.log('·', ...a);

const STAGES = [
  ['new', 'Novo lead', 10],
  ['contact', 'Contato', 20],
  ['qualification', 'Qualificação', 30],
  ['meeting', 'Reunião', 40],
  ['proposal', 'Proposta', 60],
  ['negotiation', 'Negociação', 80],
  ['won', 'Ganho', 100],
] as const;
const ONBOARDING = [
  ['Reunião de kickoff', 'atendimento', 1],
  ['Coletar acessos das redes', 'atendimento', 1],
  ['Receber logo, brandbook e fotos', 'atendimento', 1],
  ['Briefing de marca e público', 'estrategista', 2],
  ['Análise de concorrentes', 'estrategista', 2],
  ['Definir pilares de conteúdo', 'estrategista', 1],
  ['Tom de voz e guia de copy', 'copy', 2],
  ['Ajustes de identidade para social', 'design', 2],
  ['Templates de posts e stories', 'design', 2],
  ['Configurar contas de anúncio', 'trafego', 1],
  ['Calendário do primeiro mês', 'social_media', 2],
  ['Aprovação do calendário com o cliente', 'atendimento', 2],
  ['Convite do portal e treinamento', 'atendimento', 1],
] as const;

async function workspaceConfig(ws: string) {
  const [pipe] = await db.select().from(s.pipelines).where(eq(s.pipelines.workspaceId, ws));
  if (pipe) return;
  await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(s.pipelines)
      .values({ workspaceId: ws, name: 'Vendas', isDefault: true })
      .returning();
    await tx.insert(s.pipelineStages).values(
      STAGES.map(([key, name, probability], position) => ({
        workspaceId: ws,
        pipelineId: p!.id,
        key,
        name,
        probability,
        position,
        isWon: key === 'won',
      })),
    );
    await tx
      .insert(s.lostReasons)
      .values(
        ['Preço', 'Escolheu concorrente', 'Sem orçamento agora', 'Sem resposta', 'Escopo não atende'].map(
          (name) => ({ workspaceId: ws, name }),
        ),
      );
    const [t] = await tx
      .insert(s.onboardingTemplates)
      .values({ workspaceId: ws, name: 'Onboarding padrão (13 etapas)', isDefault: true })
      .returning();
    await tx.insert(s.onboardingTemplateSteps).values(
      ONBOARDING.map(([title, fn, businessDays], i) => ({
        workspaceId: ws,
        templateId: t!.id,
        position: i + 1,
        title,
        function: fn,
        businessDays,
      })),
    );
    await tx.insert(s.services).values([
      { workspaceId: ws, name: 'Social media', kind: 'recurring', defaultCents: 390_000 },
      { workspaceId: ws, name: 'Branding + social', kind: 'recurring', defaultCents: 650_000 },
      { workspaceId: ws, name: 'Tráfego pago', kind: 'recurring', defaultCents: 200_000 },
      { workspaceId: ws, name: 'Setup de marca', kind: 'setup', defaultCents: 1_200_000 },
    ]);
    await tx.insert(s.expenseCategories).values([
      { workspaceId: ws, name: 'Pessoal', kind: 'fixed' },
      { workspaceId: ws, name: 'Software', kind: 'fixed' },
      { workspaceId: ws, name: 'Administrativo', kind: 'fixed' },
      { workspaceId: ws, name: 'Freelancers', kind: 'variable' },
      { workspaceId: ws, name: 'Mídia', kind: 'variable' },
      { workspaceId: ws, name: 'Impostos', kind: 'variable' },
    ]);
    await tx
      .insert(s.automationRules)
      .values(
        d.DEFAULT_RULES.map((r) => ({
          workspaceId: ws,
          key: r.key,
          name: r.name,
          trigger: r.trigger,
          actions: r.actions as unknown as Record<string, unknown>[],
        })),
      )
      .onConflictDoNothing();
  });
}

async function ensureUser(ws: string, email: string, name: string, roleKeys: string[]) {
  await db.insert(s.users).values({ email, name, emailVerified: true }).onConflictDoNothing();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email));
  const [acc] = await db
    .select()
    .from(s.authAccounts)
    .where(and(eq(s.authAccounts.userId, u!.id), eq(s.authAccounts.providerId, 'credential')));
  if (!acc)
    await db.insert(s.authAccounts).values({
      userId: u!.id,
      accountId: u!.id,
      providerId: 'credential',
      password: await hashPassword(DEMO_PASSWORD),
    });
  await db.insert(s.workspaceMembers).values({ workspaceId: ws, userId: u!.id }).onConflictDoNothing();
  const [m] = await db
    .select()
    .from(s.workspaceMembers)
    .where(and(eq(s.workspaceMembers.workspaceId, ws), eq(s.workspaceMembers.userId, u!.id)));
  for (const key of roleKeys) {
    const [r] = await db
      .select()
      .from(s.roles)
      .where(and(eq(s.roles.workspaceId, ws), eq(s.roles.key, key)));
    await db
      .insert(s.memberRoles)
      .values({ workspaceId: ws, memberId: m!.id, roleId: r!.id })
      .onConflictDoNothing();
  }
  return { userId: u!.id, memberId: m!.id };
}

// ── tempo relativo ──
const DAY = 86_400_000;
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
const iso = (dt: Date) => dt.toISOString().slice(0, 10);
const at = (offsetDays: number, h: number, m = 0) => {
  const local = new Date(now.getTime() + offsetDays * DAY);
  const ds = local.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${ds}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`);
};

/**
 * Volta o relógio de SLA no tempo até o status pedido (o seed simula itens criados antes).
 * Usa a própria @aos/sla: funciona em qualquer dia/hora, inclusive à noite e em feriados.
 */
async function backdateClock(
  ctx: d.Ctx,
  clockId: string,
  target: 'NEAR_DUE' | 'OVERDUE',
  overdueMinutes = 0,
) {
  const [clock] = await db.select().from(s.slaClocks).where(eq(s.slaClocks.id, clockId));
  const cal = await d.read(ctx, (tx) => d.loadCalendar(tx));
  const policy = clock!.policySnapshot as unknown as SlaPolicy;
  let from = new Date(now);
  for (let i = 0; i < 4000; i++) {
    from = new Date(from.getTime() - 15 * 60_000);
    const r = calculateDueAt({ calendar: cal, policy, createdAt: from, now });
    if (r.status === target && (target !== 'OVERDUE' || -r.remainingBusinessMinutes >= overdueMinutes)) break;
  }
  await db.update(s.slaClocks).set({ createdFrom: from, startAt: from }).where(eq(s.slaClocks.id, clockId));
}

const COLORS: Record<string, [[number, number, number], [number, number, number]]> = {
  'Terra Mar': [
    [183, 110, 80],
    [240, 214, 170],
  ],
  'Café Aurora': [
    [96, 120, 80],
    [232, 220, 196],
  ],
  'Clínica Vitta': [
    [176, 70, 80],
    [246, 222, 226],
  ],
  'Studio Nobre': [
    [60, 90, 140],
    [222, 228, 240],
  ],
  'Ótica Prisma': [
    [140, 96, 160],
    [236, 226, 244],
  ],
  'Pão de Casa': [
    [170, 130, 40],
    [246, 232, 200],
  ],
  'Academia Ritmo': [
    [30, 120, 120],
    [210, 238, 236],
  ],
  'Empório Sabiá': [
    [110, 110, 60],
    [232, 230, 206],
  ],
};
const hex = (c: [number, number, number]) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;

async function main() {
  const [w4p] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, 'agencia-4p'));
  const [wTest] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, 'workspace-teste'));
  if (!w4p || !wTest) throw new Error('Rode o seed de plataforma antes (pnpm --filter @aos/db seed).');
  for (const w of [w4p, wTest]) await workspaceConfig(w.id);

  const team = {
    manuella: await ensureUser(w4p.id, 'manuella@demo.local', 'Manuella', ['gestor', 'admin']),
    bia: await ensureUser(w4p.id, 'bia@demo.local', 'Bia', ['atendimento']),
    leo: await ensureUser(w4p.id, 'leo@demo.local', 'Leo', ['comercial']),
    nina: await ensureUser(w4p.id, 'nina@demo.local', 'Nina', ['social_media']),
    caio: await ensureUser(w4p.id, 'caio@demo.local', 'Caio', ['copywriter']),
    rafa: await ensureUser(w4p.id, 'rafa@demo.local', 'Rafa', ['designer']),
    duda: await ensureUser(w4p.id, 'duda@demo.local', 'Duda', ['editor']),
    theo: await ensureUser(w4p.id, 'theo@demo.local', 'Theo', ['trafego']),
    lia: await ensureUser(w4p.id, 'lia@demo.local', 'Lia', ['financeiro']),
  };
  await ensureUser(wTest.id, 'teste@demo.local', 'Usuária do workspace de teste', ['admin']);

  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.clients)
    .where(eq(s.clients.workspaceId, w4p.id))) as [{ n: number }];
  if (n > 0) {
    log('Demonstração já existe; nada a fazer.');
    return;
  }

  const ctx = (await d.loadCtx(team.manuella.userId, w4p.id))!;
  const as = async (u: { userId: string }) => (await d.loadCtx(u.userId, w4p.id))!;
  const drain = () => d.drainOutbox(50);

  // ───────── Clientes (venda → proposta aceita → ganho → conversão → contrato confirmado) ─────────
  const clientSpec = [
    {
      name: 'Clínica Vitta',
      segment: 'Saúde',
      plan: 'Growth',
      mrr: 720_000,
      started: 307,
      att: 'bia',
      design: true,
    },
    {
      name: 'Empório Sabiá',
      segment: 'Empório',
      plan: 'Essencial',
      mrr: 390_000,
      started: 268,
      att: 'bia',
      design: false,
      status: 'paused' as const,
    },
    {
      name: 'Terra Mar',
      segment: 'Restaurante',
      plan: 'Growth',
      mrr: 650_000,
      started: 338,
      att: 'bia',
      design: true,
    },
    {
      name: 'Ótica Prisma',
      segment: 'Varejo óptico',
      plan: 'Growth',
      mrr: 650_000,
      started: 277,
      att: 'nina',
      design: false,
    },
    {
      name: 'Academia Ritmo',
      segment: 'Fitness',
      plan: 'Growth',
      mrr: 550_000,
      started: 346,
      att: 'nina',
      design: true,
    },
    {
      name: 'Café Aurora',
      segment: 'Cafeteria',
      plan: 'Essencial',
      mrr: 390_000,
      started: 223,
      att: 'bia',
      design: true,
    },
    {
      name: 'Studio Nobre',
      segment: 'Arquitetura',
      plan: 'Premium',
      mrr: 1_100_000,
      started: 162,
      att: 'nina',
      design: true,
    },
    {
      name: 'Pão de Casa',
      segment: 'Padaria',
      plan: 'Essencial',
      mrr: 390_000,
      started: 4,
      att: 'bia',
      design: true,
      pending: true,
    },
  ];
  const clients: Record<string, { clientId: string; contractId: string }> = {};
  for (const c of clientSpec) {
    const lead = await d.createLead(ctx, {
      companyName: c.name,
      contactName: `Contato ${c.name.split(' ')[0]}`,
      email: `contato@${c.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z]/g, '')}.demo.local`,
      phone: '(19) 90000-0000',
      segment: c.segment,
      source: 'Indicação',
      temperature: 'hot',
      ownerId: team.leo.memberId,
      service: c.plan === 'Premium' ? 'Branding + social' : 'Social media',
    });
    const prop = await d.createProposal(ctx, lead.opportunityId, {
      title: `Plano ${c.plan}`,
      items: [
        {
          description: `Plano ${c.plan} · gestão de redes`,
          kind: 'recurring',
          quantity: 1,
          unitCents: c.mrr,
        },
        ...(c.plan !== 'Essencial'
          ? [{ description: 'Setup de marca', kind: 'setup' as const, quantity: 1, unitCents: 150_000 }]
          : []),
      ],
    });
    await d.sendProposal(ctx, prop.id);
    await d.decideProposal(ctx, prop.id, 'accepted');
    await d.markWon(ctx, lead.opportunityId);
    const conv = await d.convertOpportunity(ctx, {
      opportunityId: lead.opportunityId,
      idempotencyKey: `seed-${lead.opportunityId}`,
      missingData: { legalName: `${c.name} Ltda.`, cnpj: '00.000.000/0001-00' },
      team: [
        { function: 'atendimento', memberId: team[c.att as 'bia'].memberId },
        { function: 'social_media', memberId: team.nina.memberId },
        { function: 'copy', memberId: team.caio.memberId },
        ...(c.design ? [{ function: 'design', memberId: team.rafa.memberId }] : []),
        { function: 'editor', memberId: team.duda.memberId },
        { function: 'trafego', memberId: team.theo.memberId },
      ],
      startOn: iso(daysAgo(c.started)),
    });
    clients[c.name] = { clientId: conv.clientId, contractId: conv.contractId! };
    await db
      .update(s.clients)
      .set({ color: hex(COLORS[c.name]![0]) })
      .where(eq(s.clients.id, conv.clientId));
    // Histórico coerente: venda e conversão no passado.
    await db
      .update(s.opportunities)
      .set({
        wonAt: daysAgo(c.started + 2),
        convertedAt: daysAgo(c.started),
        createdAt: daysAgo(c.started + 30),
      })
      .where(eq(s.opportunities.id, lead.opportunityId));
    if (!c.pending) {
      await d.confirmContract(await as(team.lia), conv.contractId!);
      // Onboarding concluído para clientes antigos.
      const steps = await db
        .select({ id: s.onboardingSteps.id })
        .from(s.onboardingSteps)
        .innerJoin(s.clientOnboardings, eq(s.clientOnboardings.id, s.onboardingSteps.onboardingId))
        .where(eq(s.clientOnboardings.clientId, conv.clientId));
      await db
        .update(s.onboardingSteps)
        .set({ doneAt: daysAgo(c.started - 20) })
        .where(sql`${s.onboardingSteps.id} in ${steps.map((x) => x.id)}`);
      await db
        .update(s.clientOnboardings)
        .set({ completedAt: daysAgo(c.started - 20) })
        .where(eq(s.clientOnboardings.clientId, conv.clientId));
      await db
        .update(s.clients)
        .set({ status: c.status ?? 'active' })
        .where(eq(s.clients.id, conv.clientId));
    } else {
      // Pão de Casa: onboarding em andamento (3 etapas feitas).
      const steps = await db
        .select({ id: s.onboardingSteps.id })
        .from(s.onboardingSteps)
        .innerJoin(s.clientOnboardings, eq(s.clientOnboardings.id, s.onboardingSteps.onboardingId))
        .where(eq(s.clientOnboardings.clientId, conv.clientId))
        .orderBy(s.onboardingSteps.position)
        .limit(3);
      for (const st of steps) await d.completeOnboardingStep(await as(team.bia), st.id);
    }
    await drain();
    log('cliente', c.name);
  }

  // Pagamentos: tudo vencido foi pago, exceto Clínica Vitta (2 atrasadas). Competência atual fica a receber.
  const invoices = await db.select().from(s.invoices).where(eq(s.invoices.workspaceId, w4p.id));
  const lia = await as(team.lia);
  const vitta = invoices
    .filter((i) => i.clientId === clients['Clínica Vitta']!.clientId && i.dueOn < iso(now))
    .sort((a, b) => b.dueOn.localeCompare(a.dueOn));
  const unpaidVitta = new Set(vitta.slice(0, 2).map((i) => i.id));
  for (const inv of invoices) {
    if (unpaidVitta.has(inv.id) || inv.dueOn >= iso(now)) continue;
    const paidOn = iso(new Date(Date.parse(inv.dueOn) - 2 * DAY));
    if (inv.kind === 'setup') {
      await d.recordPayment(lia, inv.id, { amountCents: inv.amountCents / 2, paidOn, method: 'PIX' });
      await d.recordPayment(lia, inv.id, {
        amountCents: inv.amountCents / 2,
        paidOn: inv.dueOn,
        method: 'PIX',
      });
    } else await d.recordPayment(lia, inv.id, { amountCents: inv.amountCents, paidOn, method: 'Boleto' });
  }
  await d.markOverdueInvoices();
  await drain();
  log('faturas e pagamentos', invoices.length);

  // ───────── Comercial: pipeline aberto ─────────
  const leads: [string, string, number, 'cold' | 'warm' | 'hot', string, number?][] = [
    ['Padaria Grão', 'new', 390_000, 'warm', 'leo'],
    ['Barbearia Navalha', 'new', 290_000, 'cold', 'bia'],
    ['Academia Forte', 'contact', 550_000, 'cold', 'leo'],
    ['Pet Shop Lulu', 'contact', 320_000, 'warm', 'bia'],
    ['Clínica Sorriso', 'qualification', 450_000, 'hot', 'leo', 150_000],
    ['Vinícola Serra', 'meeting', 400_000, 'hot', 'leo', 1_800_000],
    ['Construtora Alfa', 'meeting', 800_000, 'warm', 'leo'],
    ['Hotel Brisa', 'proposal', 800_000, 'warm', 'leo'],
    ['Empresa X', 'negotiation', 600_000, 'hot', 'leo', 400_000],
    ['Studio K', 'negotiation', 480_000, 'hot', 'leo'],
  ];
  const board = await d.pipelineBoard(ctx);
  const stageId = (k: string) => board.stages.find((x) => x.key === k)!.id;
  const opps: Record<string, string> = {};
  for (const [name, stage, mrr, temp, owner, setup] of leads) {
    const l = await d.createLead(ctx, {
      companyName: name,
      contactName:
        name === 'Empresa X' ? 'Ana' : name === 'Vinícola Serra' ? 'Paulo' : `Contato ${name.split(' ')[0]}`,
      email: `contato@${name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z]/g, '')}.demo.local`,
      source: ['Instagram', 'Site', 'Indicação', 'WhatsApp'][name.length % 4],
      campaign: name === 'Vinícola Serra' ? 'Diagnóstico grátis' : undefined,
      temperature: temp,
      ownerId: team[owner as 'leo'].memberId,
      mrrCents: mrr,
      setupCents: setup,
      service: 'Branding + social',
      need: 'Escalar as vendas online',
      budget: 'R$ 5 a 6 mil/mês',
    });
    opps[name] = l.opportunityId;
    if (stage !== 'new') await d.moveOpportunity(ctx, l.opportunityId, stageId(stage));
    await d.logActivity(
      ctx,
      l.opportunityId,
      'whatsapp',
      'Primeiro contato em 18 minutos (SLA de 2h úteis cumprido).',
    );
    if (['proposal', 'negotiation'].includes(stage)) {
      const p = await d.createProposal(ctx, l.opportunityId, {
        title: 'Branding + social',
        items: [
          { description: 'Gestão de redes', kind: 'recurring', quantity: 1, unitCents: mrr },
          ...(setup
            ? [{ description: 'Setup de marca', kind: 'setup' as const, quantity: 1, unitCents: setup }]
            : []),
        ],
      });
      await d.sendProposal(ctx, p.id);
      if (name === 'Studio K') {
        await d.decideProposal(ctx, p.id, 'accepted');
        await d.markWon(ctx, l.opportunityId);
      }
    }
    await db
      .update(s.opportunities)
      .set({ lastInteractionAt: daysAgo(name.length % 6), createdAt: daysAgo(10 + name.length) })
      .where(eq(s.opportunities.id, l.opportunityId));
  }
  // Empresa X: "Responder Ana sobre o desconto" vencido hoje 09:00.
  await d.logActivity(
    ctx,
    opps['Empresa X']!,
    'email',
    'Ana pediu 10% de desconto no setup. Quer fechar até o dia 15.',
  );
  await d.addNextAction(ctx, opps['Empresa X']!, 'Responder Ana sobre o desconto', at(0, 9));
  // Estados paralelos.
  const reasons = await db.select().from(s.lostReasons).where(eq(s.lostReasons.workspaceId, w4p.id));
  for (const [name, state, reason] of [
    ['Mercado Bom Preço', 'lost', 'Preço'],
    ['Loja Vértice', 'lost', 'Escolheu concorrente'],
    ['Restaurante Brasa', 'no_response', null],
    ['Floricultura Íris', 'no_response', null],
    ['Escola Aprender', 'paused', null],
  ] as const) {
    const l = await d.createLead(ctx, {
      companyName: name,
      ownerId: team.leo.memberId,
      mrrCents: 300_000,
      temperature: 'cold',
    });
    await d.setOpportunityState(ctx, l.opportunityId, state, {
      lostReasonId: reasons.find((r) => r.name === reason)?.id,
    });
  }
  // Upsell Café Aurora em Proposta.
  const ups = await d.createClientOpportunity(ctx, {
    clientId: clients['Café Aurora']!.clientId,
    type: 'upsell',
    title: 'Café Aurora · tráfego pago',
    mrrCents: 120_000,
  });
  await d.moveOpportunity(ctx, ups.id, stageId('proposal'));
  const upP = await d.createProposal(ctx, ups.id, {
    title: 'Tráfego pago',
    items: [{ description: 'Gestão de tráfego', kind: 'recurring', quantity: 1, unitCents: 120_000 }],
  });
  await d.sendProposal(ctx, upP.id);
  await db
    .insert(s.salesGoals)
    .values({ workspaceId: w4p.id, period: iso(now).slice(0, 7), mrrTargetCents: 3_000_000 })
    .onConflictDoNothing();
  await drain();
  log('pipeline comercial');

  // ───────── Conteúdos (todas as etapas) com artes e versões ─────────
  const C = (n: string) => clients[n]!.clientId;
  const art = async (client: string, contentId: string) => {
    const [a, b] = COLORS[client]!;
    const f = await d.uploadFile(ctx, {
      name: `arte-${contentId.slice(0, 6)}.png`,
      bytes: makePng(432, 540, a, b),
      clientId: C(client),
      category: 'arte',
      link: { entityType: 'content', entityId: contentId },
    });
    return f.id;
  };
  type CS = [string, string, string, string, number | null, string];
  const contentSpec: CS[] = [
    ['Terra Mar', 'Depoimento cliente', 'Instagram', 'Reels', 13, 'idea'],
    ['Terra Mar', 'Happy hour sexta', 'Instagram', 'Post', 10, 'planning'],
    ['Academia Ritmo', 'Desafio 30 dias', 'TikTok', 'Reels', 5, 'production'],
    ['Terra Mar', 'Post institucional', 'Instagram', 'Post', 7, 'copy'],
    ['Clínica Vitta', 'Reels bastidores', 'Instagram', 'Reels', 2, 'copy'],
    ['Terra Mar', 'Reels prato do dia', 'Instagram', 'Reels', 6, 'design'],
    ['Café Aurora', 'Stories Black Friday', 'Instagram', 'Stories', 3, 'design'],
    ['Studio Nobre', 'Projeto Casa Alto', 'Instagram', 'Carrossel', 4, 'internal_review'],
    ['Café Aurora', 'Oferta Black Friday', 'Instagram', 'Carrossel', 24, 'client_approval'],
    ['Studio Nobre', 'Antes e depois sala', 'Instagram', 'Post', 2, 'client_approval'],
    ['Academia Ritmo', 'Aula experimental', 'Instagram', 'Post', 3, 'client_approval'],
    ['Clínica Vitta', 'Dica de saúde bucal', 'Instagram', 'Post', 1, 'client_approval'],
    ['Terra Mar', 'Menu Kids', 'Instagram', 'Carrossel', 2, 'change_requested'],
    ['Café Aurora', 'Novo blend de outono', 'Instagram', 'Post', 1, 'approved'],
    ['Studio Nobre', 'Equipe Studio Nobre', 'LinkedIn', 'Post', -1, 'scheduled'],
    ['Terra Mar', 'Feijoada de sábado', 'Instagram', 'Post', -3, 'posted'],
    ['Café Aurora', 'Ideia: latte art', 'Instagram', 'Reels', null, 'idea'],
    ['Terra Mar', 'Rascunho: chef convidado', 'Instagram', 'Post', null, 'planning'],
  ];
  const contentIds: Record<string, string> = {};
  for (const [client, title, platform, format, inDays, stage] of contentSpec) {
    const c = await d.createContent(ctx, {
      clientId: C(client),
      title,
      platform,
      format,
      scheduledAt: inDays === null ? null : at(inDays, 12),
      ownerId: team.nina.memberId,
      copywriterId: team.caio.memberId,
      designerId: team.rafa.memberId,
      pillar: ['Cardápio', 'Bastidores', 'Oferta', 'Institucional'][title.length % 4],
      objective: 'Conversão',
      priority: title.includes('Black') ? 'high' : 'normal',
    });
    contentIds[title] = c.id;
    const order: string[] = ['idea', 'planning', 'production', 'copy', 'design', 'internal_review'];
    const target = order.includes(stage) ? stage : 'internal_review';
    if (order.indexOf(target) >= 3 || !order.includes(stage)) {
      await d.addVersion(ctx, c.id, {
        fileIds:
          format === 'Carrossel'
            ? [await art(client, c.id), await art(client, c.id)]
            : [await art(client, c.id)],
        hook: `${title}: o que ninguém te contou.`,
        caption: `Novidade na ${client}: ${title.toLowerCase()}. Vem conferir!`,
        cta: 'Saiba mais pelo link da bio',
      });
    }
    for (const st of order.slice(1, order.indexOf(target) + 1))
      await d.moveContentStage(ctx, c.id, st as d.Stage);
    if (!order.includes(stage)) {
      await d.submitForApproval(ctx, c.id);
      if (stage === 'change_requested')
        await d.requestChange(await as(team.bia), c.id, {
          comment: 'Cliente pediu trocar a foto do prato principal e aumentar o preço na arte.',
          annotations: [
            { assetIndex: 0, xPct: 48, yPct: 40, body: 'Trocar esta foto pelo prato kids novo' },
            { assetIndex: 0, xPct: 70, yPct: 82, body: 'Preço maior e em negrito' },
          ],
        });
      if (['approved', 'scheduled', 'posted'].includes(stage))
        await d.approveOnBehalf(ctx, [c.id], 'Cliente aprovou por WhatsApp em reunião de alinhamento.');
      if (stage === 'scheduled' || stage === 'posted') await d.moveContentStage(ctx, c.id, 'scheduled');
      if (stage === 'posted') await d.moveContentStage(ctx, c.id, 'posted');
    }
  }
  // Aprovações aguardando há mais tempo (atrasadas no cliente).
  await db.execute(
    sql`update content_approvals set created_at = now() - interval '4 days' where action = 'submitted' and content_id in (${contentIds['Antes e depois sala']!}::uuid, ${contentIds['Dica de saúde bucal']!}::uuid)`,
  );
  await d.createContent(ctx, {
    clientId: C('Studio Nobre'),
    title: 'Campanha de verão',
    platform: 'Instagram',
    format: 'Post',
    ownerId: team.nina.memberId,
  });
  await drain();
  // Tarefa de alteração do Menu Kids atrasada 1h20 (relógio de SLA voltado no tempo).
  const [kids] = await db
    .select()
    .from(s.tasks)
    .where(and(eq(s.tasks.contentId, contentIds['Menu Kids']!), eq(s.tasks.originType, 'content_change')));
  if (kids?.slaClockId) await backdateClock(ctx, kids.slaClockId, 'OVERDUE', 80);
  log('conteúdos', contentSpec.length);

  // ───────── Solicitações em todos os status de SLA ─────────
  // Bia só enxerga clientes da equipe dela (escopo team): as solicitações do seed entram pela gestora.
  const bia = ctx;
  const reqs: [string, d.CreateRequestInput['type'], string, number | null, string][] = [
    ['Terra Mar', 'arte_estatica', 'Post do almoço executivo', 0, 'on_time'],
    ['Café Aurora', 'arte_estatica', 'Arte cardápio de bebidas', 7.2, 'near_due'],
    ['Academia Ritmo', 'video', 'Vídeo aula de spinning', 30, 'overdue'],
    ['Studio Nobre', 'arte_impresso', 'Folder para feira de decoração', 2, 'paused'],
    ['Clínica Vitta', 'fotos_editadas', 'Fotos do consultório novo', 3, 'blocked'],
    ['Terra Mar', 'cardapio', 'Cardápio de fim de ano', 1, 'in_production'],
    ['Café Aurora', 'outro', 'Ajuda com bio do Instagram', null, 'triage'],
    ['Ótica Prisma', 'alteracao', 'Ajustar preço na arte dos óculos', 0.5, 'review'],
    ['Studio Nobre', 'arte_estatica', 'Post premiação', 5, 'delivered'],
  ];
  for (const [client, type, title, , target] of reqs) {
    const r = await d.createRequest(bia, {
      clientId: C(client),
      type,
      title,
      description: 'Pedido recebido pelo WhatsApp do cliente.',
      origin: target === 'triage' ? 'portal' : 'whatsapp',
    });
    if (target === 'triage') continue;
    await d.triageRequest(bia, r.id, client === 'Ótica Prisma' ? { assigneeId: team.rafa.memberId } : {});
    const [row] = await db.select().from(s.requests).where(eq(s.requests.id, r.id));
    if (target === 'near_due') await backdateClock(ctx, row!.slaClockId!, 'NEAR_DUE');
    if (target === 'overdue') await backdateClock(ctx, row!.slaClockId!, 'OVERDUE', 200);
    if (['in_production', 'review', 'paused', 'delivered', 'blocked'].includes(target))
      await d.setRequestStatus(bia, r.id, 'in_production');
    if (['review', 'paused', 'delivered'].includes(target)) await d.setRequestStatus(bia, r.id, 'review');
    if (target === 'paused') await d.setRequestStatus(bia, r.id, 'client_approval');
    if (target === 'delivered') await d.setRequestStatus(bia, r.id, 'delivered');
    if (target === 'blocked') {
      const [t] = await db.select().from(s.tasks).where(eq(s.tasks.requestId, r.id));
      await d.blockTask(bia, t!.id, {
        reason: 'Aguardando o cliente enviar as fotos originais',
        resolver: 'Cliente (Dra. Vitta)',
        external: true,
        note: 'Cobrado por WhatsApp ontem.',
      });
    }
  }
  await d.slaTick();
  await drain();
  log('solicitações', reqs.length);

  // ───────── Tarefas avulsas por pessoa ─────────
  const taskSpec: [
    keyof typeof team,
    string,
    string | null,
    number,
    'low' | 'normal' | 'high' | 'urgent',
    boolean?,
  ][] = [
    ['bia', 'Enviar relatório mensal Terra Mar', 'Terra Mar', -1, 'high'],
    ['bia', 'Confirmar pauta da reunião de alinhamento', 'Terra Mar', 0.1, 'normal'],
    ['bia', 'Cobrar briefing da campanha de verão', 'Studio Nobre', 0.2, 'normal'],
    ['nina', 'Planejar calendário de dezembro', 'Café Aurora', 2, 'normal'],
    ['nina', 'Responder comentários do fim de semana', 'Academia Ritmo', 0.15, 'high'],
    ['caio', 'Legendas da semana Black Friday', 'Café Aurora', 1, 'high'],
    ['caio', 'Roteiro do Reels bastidores', 'Clínica Vitta', -0.5, 'normal'],
    ['rafa', 'Templates de stories Pão de Casa', 'Pão de Casa', 3, 'normal'],
    ['duda', 'Editar vídeo aula experimental', 'Academia Ritmo', 0.25, 'high'],
    ['theo', 'Relatório de campanha Ótica Prisma', 'Ótica Prisma', 1, 'normal'],
    ['theo', 'Subir campanha Black Friday', 'Café Aurora', 4, 'urgent'],
    ['lia', 'Conferir notas fiscais de outubro', null, 0.3, 'normal'],
    ['leo', 'Preparar apresentação Vinícola Serra', null, 0.3, 'high'],
    ['manuella', 'Revisar metas do trimestre', null, 2, 'normal'],
    ['manuella', 'Feedback 1:1 com a equipe', null, -2, 'normal', true],
    ['rafa', 'Logo em alta para impressão', 'Studio Nobre', -3, 'normal', true],
  ];
  for (const [who, title, client, inDays, priority, done] of taskSpec) {
    const t = await d.createTask(ctx, {
      title,
      clientId: client ? C(client) : null,
      assigneeId: team[who].memberId,
      priority,
      dueAt: new Date(now.getTime() + inDays * DAY),
    });
    if (done) {
      await d.setTaskStatus(ctx, t.id, 'done');
      await db
        .update(s.tasks)
        .set({ completedAt: new Date(now.getTime() + inDays * DAY) })
        .where(eq(s.tasks.id, t.id));
    }
  }
  const t1 = await d.createTask(ctx, {
    title: 'Aprovar roteiro antes da gravação',
    clientId: C('Academia Ritmo'),
    assigneeId: team.nina.memberId,
    participantIds: [team.duda.memberId],
    dueAt: at(1, 15),
  });
  await d.createTask(ctx, {
    title: 'Gravar vídeo da aula',
    clientId: C('Academia Ritmo'),
    assigneeId: team.duda.memberId,
    dueAt: at(2, 15),
    dependsOn: [t1.id],
  });
  await d.commentTask(await as(team.duda), t1.id, 'Preciso do roteiro aprovado até amanhã cedo para gravar.');
  log('tarefas', taskSpec.length + 2);

  // ───────── Reuniões de hoje ─────────
  for (const [title, h, m, client, opp, who] of [
    ['Alinhamento mensal · Terra Mar', 11, 0, 'Terra Mar', null, ['bia']],
    ['Daily de produção', 14, 30, null, null, ['nina', 'caio', 'rafa', 'duda']],
    ['Reunião comercial · Vinícola Serra', 16, 0, null, 'Vinícola Serra', ['leo']],
    ['Fechamento mensal', 17, 0, null, null, ['lia']],
  ] as const) {
    await d.createMeeting(ctx, {
      title,
      startsAt: at(0, h, m),
      endsAt: at(0, h + 1, m),
      clientId: client ? C(client) : null,
      opportunityId: opp ? opps[opp] : null,
      location: client ? 'Meet' : 'Sala 2',
      participantIds: who.map((w) => team[w as 'bia'].memberId),
    });
  }

  // ───────── Despesas (6 meses) ─────────
  const cats = await db.select().from(s.expenseCategories).where(eq(s.expenseCategories.workspaceId, w4p.id));
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  for (let mo = 5; mo >= 0; mo--) {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mo, 1));
    const comp = base.toISOString().slice(0, 7);
    const current = mo === 0;
    const due = (day: number) => `${comp}-${String(day).padStart(2, '0')}`;
    for (const [desc, supplier, catName, cents, day] of [
      ['Folha de pagamento', 'Equipe', 'Pessoal', 3_200_000, 5],
      ['Adobe Creative Cloud', 'Adobe', 'Software', 89_000, 8],
      ['Coworking', 'Coworking Centro', 'Administrativo', 325_000, 10],
      ['Freelancer de vídeo', 'Estúdio Lumen', 'Freelancers', 180_000 + mo * 15_000, 15],
      ['Impostos (Simples)', 'Receita Federal', 'Impostos', 520_000, 20],
    ] as const) {
      const paid = !current || due(day) < iso(now);
      await d.createExpense(lia, {
        description: desc,
        supplier,
        categoryId: cat(catName),
        amountCents: cents,
        dueOn: due(day),
        paidOn: paid ? due(day) : null,
      });
    }
  }
  await drain();
  log('despesas');
  log(`Pronto. Usuários: *@demo.local · senha de dev: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeAll);
