import { NextResponse } from 'next/server';
import {
  generateRecurringExpenses,
  kickDispatcher,
  markOverdueInvoices,
  monthlyBilling,
  slaTick,
} from '@aos/domain';

export const dynamic = 'force-dynamic';

/** Gatilho manual dos jobs (dev/CI). Em produção os crons rodam no Inngest. */
export async function POST() {
  if (process.env.APP_ENV !== 'local' && process.env.APP_ENV !== 'ci')
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const sla = await slaTick();
  const overdue = await markOverdueInvoices();
  const billed = await monthlyBilling();
  const recurring = await generateRecurringExpenses();
  const drained = await kickDispatcher();
  return NextResponse.json({ sla, overdue, billed, recurring, drained });
}
