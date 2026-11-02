import { and, eq, sql } from 'drizzle-orm';
import { BR_NATIONAL_HOLIDAYS_2026, DEFAULT_POLICIES, defaultCalendar } from '@aos/sla';
import { adminDb, closeAll } from '../src/client';
import { PERMISSIONS, SYSTEM_ROLES } from '../src/permissions';
import * as s from '../src/schema';

/** Seed mínimo e idempotente: workspace 4P, workspace de teste, permissões, cargos, calendário, feriados e políticas. */
const db = adminDb();
const NAMES: Record<string, string> = {
  '2026-01-01': 'Confraternização Universal', '2026-02-16': 'Carnaval', '2026-02-17': 'Carnaval',
  '2026-04-03': 'Sexta-feira Santa', '2026-04-21': 'Tiradentes', '2026-05-01': 'Dia do Trabalho',
  '2026-06-04': 'Corpus Christi', '2026-09-07': 'Independência', '2026-10-12': 'Nossa Senhora Aparecida',
  '2026-11-02': 'Finados', '2026-11-15': 'Proclamação da República', '2026-11-20': 'Consciência Negra', '2026-12-25': 'Natal',
};
const POLICY_NAMES: Record<string, string> = {
  arte_estatica: 'Arte estática', arte_impresso: 'Arte para impresso', video: 'Vídeo', alteracao: 'Alteração',
  alteracao_urgente: 'Alteração urgente', fotos_editadas: 'Fotos editadas', cardapio_catalogo: 'Cardápios e catálogos', triagem: 'Triagem de solicitação',
};

await db.transaction(async (tx) => {
  await tx.insert(s.permissions).values(
    Object.entries(PERMISSIONS).map(([key, description]) => ({ key, module: key.split('.')[0]!, description })),
  ).onConflictDoNothing();

  for (const [slug, name] of [['agencia-4p', 'Agência 4P'], ['workspace-teste', 'Workspace de teste (isolamento)']] as const) {
    await tx.insert(s.workspaces).values({ slug, name }).onConflictDoNothing();
    const [ws] = await tx.select().from(s.workspaces).where(eq(s.workspaces.slug, slug));
    const w = ws!.id;

    for (const [key, role] of Object.entries(SYSTEM_ROLES)) {
      await tx.insert(s.roles).values({ workspaceId: w, key, name: role.name, isSystem: true }).onConflictDoNothing();
      const [r] = await tx.select().from(s.roles).where(and(eq(s.roles.workspaceId, w), eq(s.roles.key, key)));
      await tx.insert(s.rolePermissions)
        .values(role.grants.map(([permissionKey, scope]) => ({ workspaceId: w, roleId: r!.id, permissionKey, scope })))
        .onConflictDoNothing();
    }

    const cal = defaultCalendar();
    await tx.insert(s.businessCalendars)
      .values({ workspaceId: w, name: 'Expediente padrão', timezone: cal.timezone, periods: cal.periods, isDefault: true })
      .onConflictDoNothing();
    await tx.insert(s.holidays)
      .values(BR_NATIONAL_HOLIDAYS_2026.map((date) => ({ workspaceId: w, date, name: NAMES[date] ?? 'Feriado', kind: 'national' as const })))
      .onConflictDoNothing();
    await tx.insert(s.slaPolicies)
      .values(Object.entries(DEFAULT_POLICIES).map(([key, p]) => ({
        workspaceId: w, key, name: POLICY_NAMES[key] ?? key, model: p.model, amount: p.amount, rule: 'rule' in p ? p.rule : null,
      })))
      .onConflictDoNothing();
  }

  const users = [['manuella@agencia4p.local', 'Manuella', 'admin'], ['bia@agencia4p.local', 'Bia', 'atendimento'], ['rafa@agencia4p.local', 'Rafa', 'designer'], ['leo@agencia4p.local', 'Leo', 'comercial'], ['lia@agencia4p.local', 'Lia', 'financeiro']] as const;
  const [ws4p] = await tx.select().from(s.workspaces).where(eq(s.workspaces.slug, 'agencia-4p'));
  for (const [email, name, roleKey] of users) {
    await tx.insert(s.users).values({ email, name }).onConflictDoNothing();
    const [u] = await tx.select().from(s.users).where(eq(s.users.email, email));
    await tx.insert(s.workspaceMembers).values({ workspaceId: ws4p!.id, userId: u!.id }).onConflictDoNothing();
    const [m] = await tx.select().from(s.workspaceMembers).where(and(eq(s.workspaceMembers.workspaceId, ws4p!.id), eq(s.workspaceMembers.userId, u!.id)));
    const [r] = await tx.select().from(s.roles).where(and(eq(s.roles.workspaceId, ws4p!.id), eq(s.roles.key, roleKey)));
    await tx.insert(s.memberRoles).values({ workspaceId: ws4p!.id, memberId: m!.id, roleId: r!.id }).onConflictDoNothing();
  }
  await tx.execute(sql`select 1`);
});

console.log('Seed concluído.');
await closeAll();
