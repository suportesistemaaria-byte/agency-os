import { schema, type TenantContext, type Tx } from '@aos/db';
import { redact } from '@aos/logger';
import { auditDiff } from './diff';

export { auditDiff };

export interface AuditEntry {
  /** Verbo no formato entidade.acao. Ex.: content.approved_on_behalf, sla.overridden. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** ip, userAgent, reason, automationExecutionId… Segredos são removidos. */
  metadata?: Record<string, unknown>;
}

/**
 * Registra auditoria na MESMA transação da ação: se a ação falhar, o registro também não existe.
 * A tabela é somente inclusão para o papel da aplicação.
 */
export async function recordAudit(tx: Tx, ctx: TenantContext, e: AuditEntry): Promise<void> {
  if (!/^[a-z_]+\.[a-z_]+$/.test(e.action)) throw new Error(`Ação de auditoria inválida: ${e.action}`);
  const { before, after } = auditDiff(e.before, e.after);
  await tx.insert(schema.auditLogs).values({
    workspaceId: ctx.workspaceId,
    actorType: ctx.actorType ?? (ctx.userId ? 'user' : 'system'),
    actorId: ctx.userId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before,
    after,
    metadata: redact({ ...(e.metadata ?? {}), requestId: ctx.requestId }),
  });
}
