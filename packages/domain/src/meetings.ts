import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import { command, read, type Ctx } from './context';
import { badRequest } from './errors';

export async function createMeeting(
  ctx: Ctx,
  input: {
    title: string;
    startsAt: Date;
    endsAt?: Date;
    clientId?: string | null;
    opportunityId?: string | null;
    location?: string;
    participantIds?: string[];
  },
) {
  if (!input.title.trim()) throw badRequest('Informe o título da reunião.');
  return command('meetings.create', ctx, async (kit) => {
    const [m] = await kit.tx
      .insert(s.meetings)
      .values({
        workspaceId: ctx.workspaceId,
        title: input.title.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        clientId: input.clientId ?? null,
        opportunityId: input.opportunityId ?? null,
        location: input.location,
        createdBy: ctx.userId,
      })
      .returning();
    const parts = [...new Set([ctx.memberId, ...(input.participantIds ?? [])])].filter(
      (x) => x && !x.startsWith('00000000'),
    );
    if (parts.length)
      await kit.tx
        .insert(s.meetingParticipants)
        .values(parts.map((memberId) => ({ workspaceId: ctx.workspaceId, meetingId: m!.id, memberId })));
    await kit.emit({
      type: 'meeting.created',
      entityType: 'meeting',
      entityId: m!.id,
      payload: { meetingId: m!.id },
    });
    return m!;
  });
}

/** Reuniões no intervalo. Gestão (clientes.view all) vê todas; demais, as que participam. */
export async function listMeetings(ctx: Ctx, from: Date, to: Date, opts: { clientId?: string } = {}) {
  return read(ctx, async (tx) => {
    const conds = [gte(s.meetings.startsAt, from), lt(s.meetings.startsAt, to)];
    if (opts.clientId) conds.push(eq(s.meetings.clientId, opts.clientId));
    const rows = await tx
      .select({ m: s.meetings, client: s.clients.name })
      .from(s.meetings)
      .leftJoin(s.clients, eq(s.clients.id, s.meetings.clientId))
      .where(and(...conds))
      .orderBy(asc(s.meetings.startsAt));
    const parts = rows.length
      ? await tx
          .select({
            meetingId: s.meetingParticipants.meetingId,
            memberId: s.meetingParticipants.memberId,
            name: s.users.name,
          })
          .from(s.meetingParticipants)
          .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.meetingParticipants.memberId))
          .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
          .where(
            inArray(
              s.meetingParticipants.meetingId,
              rows.map((r) => r.m.id),
            ),
          )
      : [];
    const seeAll = ctx.perms.get('clientes.view') === 'all';
    return rows
      .map((r) => ({
        ...r.m,
        clientName: r.client,
        participants: parts.filter((p) => p.meetingId === r.m.id),
      }))
      .filter((m) => seeAll || m.participants.some((p) => p.memberId === ctx.memberId));
  });
}
