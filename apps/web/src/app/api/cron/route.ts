import { NextResponse } from 'next/server';
import {
  generateRecurringExpenses,
  kickDispatcher,
  markOverdueInvoices,
  monthlyBilling,
  snapshotHealth,
  checkExpiringContracts,
  slaTick,
} from '@aos/domain';

export const dynamic = 'force-dynamic';

/**
 * Jobs agendados (SLA, cobranças atrasadas, mensalidades, recorrências, health score, contratos vencendo) + despacho do outbox.
 * Dev/CI: POST livre. Publicado: só com o segredo CRON_SECRET (a Vercel Cron envia "Authorization: Bearer <CRON_SECRET>").
 */
async function run(req: Request) {
  const local = process.env.APP_ENV === 'local' || process.env.APP_ENV === 'ci';
  const secret = process.env.CRON_SECRET;
  const ok = local || (secret && req.headers.get('authorization') === `Bearer ${secret}`);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sla = await slaTick();
  const overdue = await markOverdueInvoices();
  const billed = await monthlyBilling();
  const recurring = await generateRecurringExpenses();
  const health = await snapshotHealth();
  const expiring = await checkExpiringContracts();
  const drained = await kickDispatcher();
  return NextResponse.json({ sla, overdue, billed, recurring, health, expiring, drained });
}

export const GET = run;
export const POST = run;
