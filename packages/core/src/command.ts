import { appDb, withTenant, type Db, type TenantContext, type Tx } from '@aos/db';
import { recordAudit, type AuditEntry } from '@aos/audit';
import { emit, type EmitInput, type EventType } from '@aos/events';
import { childLogger } from '@aos/logger';

export interface CommandKit {
  tx: Tx;
  ctx: TenantContext;
  emit: <T extends EventType>(e: EmitInput<T>) => Promise<string>;
  audit: (e: AuditEntry) => Promise<void>;
}

export interface CommandOptions {
  db?: Db;
  /** Chamado depois do COMMIT. Falhar aqui nunca desfaz a ação: o cron do relay entrega de qualquer forma. */
  afterCommit?: () => Promise<void>;
}

let defaultAfterCommit: (() => Promise<void>) | undefined;

/** O app web registra aqui o "cutucão" no relay (inngest.send('aos/outbox.flush')). */
export function setAfterCommitHook(fn: () => Promise<void>): void {
  defaultAfterCommit = fn;
}

/**
 * Padrão obrigatório para toda ação de negócio (V3, seção 3):
 * AÇÃO → TRANSAÇÃO (dado + domain_event + audit_log) → COMMIT → relay → consumidores.
 */
export async function runCommand<R>(
  name: string,
  ctx: TenantContext,
  fn: (kit: CommandKit) => Promise<R>,
  opts: CommandOptions = {},
): Promise<R> {
  const log = childLogger({ workspaceId: ctx.workspaceId, requestId: ctx.requestId, module: name });
  const started = Date.now();
  let emitted = 0;
  const result = await withTenant(opts.db ?? appDb(), ctx, (tx) =>
    fn({
      tx,
      ctx,
      emit: (e) => {
        emitted++;
        return emit(tx, ctx, e);
      },
      audit: (e) => recordAudit(tx, ctx, e),
    }),
  );
  log.info({ ms: Date.now() - started, emitted }, 'command.ok');
  const hook = opts.afterCommit ?? defaultAfterCommit;
  if (emitted > 0 && hook) {
    hook().catch((err: unknown) => log.warn({ err: String(err) }, 'outbox.flush_failed (o cron entregará)'));
  }
  return result;
}
