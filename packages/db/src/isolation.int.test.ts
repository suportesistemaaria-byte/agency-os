import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { adminDb, appDb, closeAll, withTenant } from './client';
import { auditLogs, holidays, memberRoles, roles, slaPolicies, workspaceMembers, workspaces } from './schema';
import { hasDb, seededWorkspaces } from './test-utils';

/**
 * Base dos testes de isolamento (V3, seção 4). A cada nova tabela de negócio,
 * adicione-a em TENANT_TABLES: o teste "toda tabela tem RLS" falha se esquecer.
 */
const TENANT_TABLES = [
  'workspace_members',
  'roles',
  'role_permissions',
  'member_roles',
  'member_permission_overrides',
  'business_calendars',
  'holidays',
  'sla_policies',
  'domain_events',
  'audit_logs',
  // Blocos 1 a 7
  'invitations',
  'notifications',
  'organizations',
  'people',
  'pipelines',
  'pipeline_stages',
  'lost_reasons',
  'leads',
  'opportunities',
  'commercial_activities',
  'next_actions',
  'proposals',
  'proposal_versions',
  'proposal_items',
  'sales_goals',
  'services',
  'clients',
  'client_contacts',
  'client_team',
  'onboarding_templates',
  'onboarding_template_steps',
  'client_onboardings',
  'onboarding_steps',
  'client_health_scores',
  'contracts',
  'contract_items',
  'files',
  'file_links',
  'campaigns',
  'contents',
  'content_versions',
  'content_copies',
  'content_assets',
  'content_comments',
  'content_annotations',
  'content_approvals',
  'content_stage_history',
  'sla_clocks',
  'sla_intervals',
  'sla_overrides',
  'requests',
  'request_status_history',
  'tasks',
  'task_assignees',
  'task_dependencies',
  'task_blocks',
  'task_comments',
  'meetings',
  'meeting_participants',
  'meeting_decisions',
  'contract_amendments',
  'invoices',
  'invoice_items',
  'payments',
  'expense_categories',
  'expenses',
  'automation_rules',
  'automation_executions',
];

describe.skipIf(!hasDb())('isolamento por workspace (RLS)', () => {
  let A = '';
  let B = '';
  beforeAll(async () => ({ a: A, b: B } = await seededWorkspaces()));
  afterAll(closeAll);

  it('toda tabela com workspace_id tem RLS ativa e política', async () => {
    const rows = await adminDb().execute<{ table_name: string; rls: boolean; policies: number }>(sql`
      select c.relname as table_name, c.relrowsecurity as rls,
             (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
      from pg_class c join information_schema.columns col on col.table_name = c.relname and col.column_name = 'workspace_id'
      where c.relkind = 'r' and c.relnamespace = 'public'::regnamespace`);
    const missing = rows.rows.filter((r) => !r.rls || r.policies === 0).map((r) => r.table_name);
    expect(missing).toEqual([]);
    for (const t of TENANT_TABLES) expect(rows.rows.map((r) => r.table_name)).toContain(t);
  });

  it('toda tabela com workspace_id tem a política restritiva do portal (fail-closed)', async () => {
    const rows = await adminDb().execute<{ table_name: string; portal: number }>(sql`
      select c.relname as table_name,
             (select count(*)::int from pg_policies p where p.tablename = c.relname and p.policyname = 'portal_scope' and p.permissive = 'RESTRICTIVE') as portal
      from pg_class c join information_schema.columns col on col.table_name = c.relname and col.column_name = 'workspace_id' and col.table_schema = 'public'
      where c.relkind = 'r' and c.relnamespace = 'public'::regnamespace`);
    expect(rows.rows.filter((r) => r.portal !== 1).map((r) => r.table_name)).toEqual([]);
  });

  it('o papel da aplicação não ignora RLS nem é dono das tabelas', async () => {
    const r = await appDb().execute<{ bypass: boolean; owner: boolean }>(sql`
      select rolbypassrls as bypass,
             exists(select 1 from pg_tables where tableowner = current_user and schemaname = 'public') as owner
      from pg_roles where rolname = current_user`);
    expect(r.rows[0]).toEqual({ bypass: false, owner: false });
  });

  it('sem contexto de workspace, nada é visível (fail-closed)', async () => {
    const rows = await appDb().select().from(holidays);
    expect(rows).toHaveLength(0);
  });

  it('workspace A não lê dados do workspace B', async () => {
    const rows = await withTenant(appDb(), { workspaceId: A }, (tx) => tx.select().from(slaPolicies));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.workspaceId === A)).toBe(true);
    const ws = await withTenant(appDb(), { workspaceId: A }, (tx) => tx.select().from(workspaces));
    expect(ws.map((w) => w.id)).toEqual([A]);
  });

  it('workspace A não grava com workspace_id de B', async () => {
    await expect(
      withTenant(appDb(), { workspaceId: A }, (tx) =>
        tx.insert(holidays).values({ workspaceId: B, date: '2030-01-01', name: 'x', kind: 'recess' }),
      ),
    ).rejects.toThrow();
  });

  it('workspace A não altera nem apaga dados de B', async () => {
    const updated = await withTenant(appDb(), { workspaceId: A }, (tx) =>
      tx.execute(sql`update sla_policies set name = 'hack' where workspace_id = ${B}`),
    );
    expect(updated.rowCount).toBe(0);
    const deleted = await withTenant(appDb(), { workspaceId: A }, (tx) =>
      tx.execute(sql`delete from holidays where workspace_id = ${B}`),
    );
    expect(deleted.rowCount).toBe(0);
  });

  it('workspace A não cria relação com entidade de B (FK composta)', async () => {
    const admin = adminDb();
    const [memberA] = await admin.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, A));
    const [roleB] = await admin.select().from(roles).where(eq(roles.workspaceId, B));
    await expect(
      withTenant(appDb(), { workspaceId: A }, (tx) =>
        tx.insert(memberRoles).values({ workspaceId: A, memberId: memberA!.id, roleId: roleB!.id }),
      ),
    ).rejects.toThrow();
  });

  it('workspace A não move os próprios dados para B', async () => {
    await expect(
      withTenant(appDb(), { workspaceId: A }, (tx) =>
        tx.execute(sql`update sla_policies set workspace_id = ${B} where workspace_id = ${A}`),
      ),
    ).rejects.toThrow();
  });

  it('operações legítimas dentro do próprio workspace funcionam', async () => {
    const rows = await withTenant(appDb(), { workspaceId: A }, (tx) =>
      tx
        .insert(holidays)
        .values({ workspaceId: A, date: '2039-03-19', name: 'Legítimo', kind: 'municipal' })
        .onConflictDoNothing()
        .returning(),
    );
    expect(rows.length).toBeLessThanOrEqual(1);
  });

  it('auditoria é somente inclusão para a aplicação', async () => {
    await expect(
      withTenant(appDb(), { workspaceId: A }, (tx) => tx.execute(sql`update audit_logs set action = 'x'`)),
    ).rejects.toThrow();
    await expect(
      withTenant(appDb(), { workspaceId: A }, (tx) => tx.execute(sql`delete from audit_logs`)),
    ).rejects.toThrow();
    await withTenant(appDb(), { workspaceId: A }, (tx) =>
      tx
        .insert(auditLogs)
        .values({ workspaceId: A, actorType: 'system', action: 'test.ok', entityType: 'test' }),
    );
  });

  it('workspaceId inválido é rejeitado antes de chegar ao banco', async () => {
    await expect(withTenant(appDb(), { workspaceId: "x' or 1=1" }, async () => 1)).rejects.toThrow(
      'workspaceId inválido',
    );
  });
});
