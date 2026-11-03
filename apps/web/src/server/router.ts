import 'server-only';
import { z } from 'zod';
import * as d from '@aos/domain';
import { schema as s } from '@aos/db';
import { protectedProcedure as p, router } from './trpc';

const id = z.string().uuid();
const date = z.coerce.date();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int();
const scope = z.enum(['all', 'team', 'own']);

const crm = router({
  createLead: p
    .input(
      z.object({
        companyName: z.string().min(1),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        segment: z.string().optional(),
        city: z.string().optional(),
        source: z.string().optional(),
        campaign: z.string().optional(),
        temperature: z.enum(s.temperature.enumValues).optional(),
        ownerId: id.optional(),
        need: z.string().optional(),
        budget: z.string().optional(),
        service: z.string().optional(),
        mrrCents: cents.optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.createLead(ctx.ctx, input)),
  createClientOpportunity: p
    .input(
      z.object({
        clientId: id,
        type: z.enum(['upsell', 'renewal']),
        title: z.string().min(1),
        mrrCents: cents,
        setupCents: cents.optional(),
        service: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.createClientOpportunity(ctx.ctx, input)),
  move: p
    .input(z.object({ id, stageId: id, position: z.number().int().optional() }))
    .mutation(({ ctx, input }) => d.moveOpportunity(ctx.ctx, input.id, input.stageId, input.position)),
  setState: p
    .input(
      z.object({
        id,
        state: z.enum(['open', 'no_response', 'paused', 'lost']),
        lostReasonId: id.optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.setOpportunityState(ctx.ctx, input.id, input.state, input)),
  markWon: p.input(z.object({ id })).mutation(({ ctx, input }) => d.markWon(ctx.ctx, input.id)),
  update: p
    .input(
      z.object({
        id,
        temperature: z.enum(s.temperature.enumValues).optional(),
        ownerId: id.optional(),
        service: z.string().optional(),
        expectedCloseOn: day.nullable().optional(),
      }),
    )
    .mutation(({ ctx, input: { id: oid, ...patch } }) => d.updateOpportunity(ctx.ctx, oid, patch)),
  logActivity: p
    .input(
      z.object({ opportunityId: id, type: z.enum(s.activityType.enumValues), summary: z.string().min(1) }),
    )
    .mutation(({ ctx, input }) => d.logActivity(ctx.ctx, input.opportunityId, input.type, input.summary)),
  completeNextAction: p
    .input(z.object({ id, next: z.object({ title: z.string(), dueAt: date }).optional() }))
    .mutation(({ ctx, input }) => d.completeNextAction(ctx.ctx, input.id, input.next)),
  rescheduleNextAction: p
    .input(z.object({ id, dueAt: date }))
    .mutation(({ ctx, input }) => d.rescheduleNextAction(ctx.ctx, input.id, input.dueAt)),
  addNextAction: p
    .input(z.object({ opportunityId: id, title: z.string().min(1), dueAt: date }))
    .mutation(({ ctx, input }) => d.addNextAction(ctx.ctx, input.opportunityId, input.title, input.dueAt)),
  createProposal: p
    .input(
      z.object({
        opportunityId: id,
        title: z.string().min(1),
        notes: z.string().optional(),
        validUntil: day.optional(),
        items: z
          .array(
            z.object({
              description: z.string().min(1),
              kind: z.enum(['setup', 'recurring']),
              quantity: z.number().int().min(1),
              unitCents: cents.min(0),
            }),
          )
          .min(1),
      }),
    )
    .mutation(({ ctx, input: { opportunityId, ...rest } }) => d.createProposal(ctx.ctx, opportunityId, rest)),
  newProposalVersion: p
    .input(
      z.object({
        proposalId: id,
        notes: z.string().optional(),
        items: z
          .array(
            z.object({
              description: z.string().min(1),
              kind: z.enum(['setup', 'recurring']),
              quantity: z.number().int().min(1),
              unitCents: cents.min(0),
            }),
          )
          .min(1),
      }),
    )
    .mutation(({ ctx, input }) => d.newProposalVersion(ctx.ctx, input.proposalId, input)),
  sendProposal: p.input(z.object({ id })).mutation(({ ctx, input }) => d.sendProposal(ctx.ctx, input.id)),
  decideProposal: p
    .input(z.object({ id, decision: z.enum(['accepted', 'refused']) }))
    .mutation(({ ctx, input }) => d.decideProposal(ctx.ctx, input.id, input.decision)),
  convert: p
    .input(
      z.object({
        opportunityId: id,
        idempotencyKey: z.string().min(8),
        missingData: z
          .object({
            legalName: z.string().optional(),
            cnpj: z.string().optional(),
            address: z.string().optional(),
          })
          .optional(),
        team: z.array(z.object({ function: z.string(), memberId: id })),
        startOn: day.optional(),
        billingDay: z.number().int().min(1).max(28).optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.convertOpportunity(ctx.ctx, input)),
});

const clients = router({
  update: p
    .input(
      z.object({
        id,
        status: z.enum(s.clientStatus.enumValues).optional(),
        plan: z.string().optional(),
        segment: z.string().optional(),
        ownerId: id.optional(),
      }),
    )
    .mutation(({ ctx, input: { id: cid, ...patch } }) => d.updateClient(ctx.ctx, cid, patch)),
  setTeam: p
    .input(z.object({ clientId: id, fn: z.string(), memberId: id.nullable() }))
    .mutation(({ ctx, input }) => d.setTeamMember(ctx.ctx, input.clientId, input.fn, input.memberId)),
  contactFlags: p
    .input(
      z.object({
        contactId: id,
        flags: z.object({
          canView: z.boolean().optional(),
          canComment: z.boolean().optional(),
          canRequest: z.boolean().optional(),
          canApprove: z.boolean().optional(),
          receivesFinance: z.boolean().optional(),
          receivesNotifications: z.boolean().optional(),
          isPrimary: z.boolean().optional(),
        }),
      }),
    )
    .mutation(({ ctx, input }) => d.updateContactFlags(ctx.ctx, input.contactId, input.flags)),
  addContact: p
    .input(
      z.object({
        clientId: id,
        name: z.string().min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
        roleTitle: z.string().optional(),
        canApprove: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input: { clientId, ...rest } }) => d.addContact(ctx.ctx, clientId, rest)),
  completeStep: p
    .input(z.object({ stepId: id, done: z.boolean() }))
    .mutation(({ ctx, input }) => d.completeOnboardingStep(ctx.ctx, input.stepId, input.done)),
});

const tasks = router({
  create: p
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        clientId: id.nullable().optional(),
        assigneeId: id.nullable().optional(),
        participantIds: z.array(id).optional(),
        priority: z.enum(s.priority.enumValues).optional(),
        dueAt: date.nullable().optional(),
        slaPolicyKey: z.string().optional(),
        dependsOn: z.array(id).optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.createTask(ctx.ctx, input)),
  update: p
    .input(
      z.object({
        id,
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.enum(s.priority.enumValues).optional(),
        dueAt: date.nullable().optional(),
      }),
    )
    .mutation(({ ctx, input: { id: tid, ...patch } }) => d.updateTask(ctx.ctx, tid, patch)),
  setStatus: p
    .input(z.object({ id, status: z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled']) }))
    .mutation(({ ctx, input }) => d.setTaskStatus(ctx.ctx, input.id, input.status)),
  assign: p
    .input(z.object({ id, assigneeId: id }))
    .mutation(({ ctx, input }) => d.assignTask(ctx.ctx, input.id, input.assigneeId)),
  block: p
    .input(
      z.object({
        id,
        reason: z.string().min(1),
        resolver: z.string().min(1),
        resolverMemberId: id.nullable().optional(),
        external: z.boolean().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input: { id: tid, ...rest } }) => d.blockTask(ctx.ctx, tid, rest)),
  unblock: p.input(z.object({ id })).mutation(({ ctx, input }) => d.unblockTask(ctx.ctx, input.id)),
  comment: p
    .input(z.object({ id, body: z.string().min(1) }))
    .mutation(({ ctx, input }) => d.commentTask(ctx.ctx, input.id, input.body)),
  overrideSla: p
    .input(z.object({ clockId: id, dueAt: date, reason: z.string().min(5) }))
    .mutation(({ ctx, input }) => d.overrideClock(ctx.ctx, input.clockId, input.dueAt, input.reason)),
});

const requests = router({
  create: p
    .input(
      z.object({
        clientId: id,
        type: z.enum(s.requestType.enumValues),
        title: z.string().min(1),
        description: z.string().optional(),
        urgent: z.boolean().optional(),
        inScope: z.boolean().optional(),
        origin: z.enum(['internal', 'portal', 'whatsapp', 'email']).optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.createRequest(ctx.ctx, input)),
  triage: p
    .input(
      z.object({
        id,
        assigneeId: id.nullable().optional(),
        inScope: z.boolean().optional(),
        urgent: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input: { id: rid, ...rest } }) => d.triageRequest(ctx.ctx, rid, rest)),
  setStatus: p
    .input(z.object({ id, status: z.enum(s.requestStatus.enumValues), note: z.string().optional() }))
    .mutation(({ ctx, input }) => d.setRequestStatus(ctx.ctx, input.id, input.status, input.note)),
});

const content = router({
  create: p
    .input(
      z.object({
        clientId: id,
        campaignId: id.nullable().optional(),
        title: z.string().min(1),
        platform: z.string(),
        format: z.string(),
        scheduledAt: date.nullable().optional(),
        ownerId: id.nullable().optional(),
        copywriterId: id.nullable().optional(),
        designerId: id.nullable().optional(),
        priority: z.enum(s.priority.enumValues).optional(),
        objective: z.string().optional(),
        pillar: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.createContent(ctx.ctx, input)),
  update: p
    .input(
      z.object({
        id,
        title: z.string().optional(),
        scheduledAt: date.nullable().optional(),
        platform: z.string().optional(),
        format: z.string().optional(),
        designerId: id.nullable().optional(),
        copywriterId: id.nullable().optional(),
      }),
    )
    .mutation(({ ctx, input: { id: cid, ...patch } }) => d.updateContent(ctx.ctx, cid, patch)),
  move: p
    .input(z.object({ id, stage: z.enum(s.contentStage.enumValues) }))
    .mutation(({ ctx, input }) => d.moveContentStage(ctx.ctx, input.id, input.stage)),
  addVersion: p
    .input(
      z.object({
        id,
        fileIds: z.array(id),
        hook: z.string().optional(),
        caption: z.string().optional(),
        cta: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input: { id: cid, ...rest } }) => d.addVersion(ctx.ctx, cid, rest)),
  reorderFeed: p
    .input(z.object({ clientId: id, orderedIds: z.array(id).min(2) }))
    .mutation(({ ctx, input }) => d.reorderFeed(ctx.ctx, input.clientId, input.orderedIds)),
  submit: p.input(z.object({ id })).mutation(({ ctx, input }) => d.submitForApproval(ctx.ctx, input.id)),
  internalAdjust: p
    .input(z.object({ id, note: z.string() }))
    .mutation(({ ctx, input }) => d.requestInternalAdjust(ctx.ctx, input.id, input.note)),
  approveOnBehalf: p
    .input(z.object({ ids: z.array(id).min(1), justification: z.string().min(10) }))
    .mutation(({ ctx, input }) => d.approveOnBehalf(ctx.ctx, input.ids, input.justification)),
  requestChange: p
    .input(
      z.object({
        id,
        comment: z.string().optional(),
        annotations: z
          .array(
            z.object({
              assetIndex: z.number().int().optional(),
              xPct: z.number().min(0).max(100).optional(),
              yPct: z.number().min(0).max(100).optional(),
              videoMs: z.number().int().optional(),
              body: z.string().min(1),
            }),
          )
          .optional(),
      }),
    )
    .mutation(({ ctx, input: { id: cid, ...rest } }) => d.requestChange(ctx.ctx, cid, rest)),
  comment: p
    .input(z.object({ id, body: z.string().min(1), visibility: z.enum(['internal', 'client']).optional() }))
    .mutation(({ ctx, input }) => d.addComment(ctx.ctx, input.id, input.body, input.visibility)),
  annotate: p
    .input(
      z.object({
        id,
        version: z.number().int(),
        assetIndex: z.number().int().optional(),
        xPct: z.number().min(0).max(100).optional(),
        yPct: z.number().min(0).max(100).optional(),
        videoMs: z.number().int().optional(),
        body: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input: { id: cid, version, ...a } }) => d.addAnnotation(ctx.ctx, cid, version, a)),
});

const finance = router({
  confirmContract: p
    .input(z.object({ id }))
    .mutation(({ ctx, input }) => d.confirmContract(ctx.ctx, input.id)),
  recordPayment: p
    .input(
      z.object({
        invoiceId: id,
        amountCents: cents.positive(),
        paidOn: day,
        method: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input: { invoiceId, ...rest } }) => d.recordPayment(ctx.ctx, invoiceId, rest)),
  createInvoice: p
    .input(
      z.object({ clientId: id, description: z.string().min(1), amountCents: cents.positive(), dueOn: day }),
    )
    .mutation(({ ctx, input }) => d.createInvoice(ctx.ctx, input)),
  cancelInvoice: p
    .input(z.object({ id, reason: z.string().min(5) }))
    .mutation(({ ctx, input }) => d.cancelInvoice(ctx.ctx, input.id, input.reason)),
  createExpense: p
    .input(
      z.object({
        description: z.string().min(1),
        supplier: z.string().optional(),
        categoryId: id.optional(),
        amountCents: cents.positive(),
        dueOn: day,
        paidOn: day.nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => d.createExpense(ctx.ctx, input)),
  payExpense: p
    .input(z.object({ id, paidOn: day }))
    .mutation(({ ctx, input }) => d.payExpense(ctx.ctx, input.id, input.paidOn)),
});

const members = router({
  setRoles: p
    .input(z.object({ memberId: id, roleKeys: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => d.setMemberRoles(ctx.ctx, input.memberId, input.roleKeys)),
  setStatus: p
    .input(z.object({ memberId: id, status: z.enum(['active', 'suspended']) }))
    .mutation(({ ctx, input }) => d.setMemberStatus(ctx.ctx, input.memberId, input.status)),
  setOverride: p
    .input(
      z.object({
        memberId: id,
        permission: z.string(),
        effect: z.enum(['grant', 'deny']).nullable(),
        scope: scope.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      d.setOverride(ctx.ctx, input.memberId, input.permission, input.effect, input.scope),
    ),
  setRolePermission: p
    .input(z.object({ roleId: id, permission: z.string(), scope: scope.nullable() }))
    .mutation(({ ctx, input }) => d.setRolePermission(ctx.ctx, input.roleId, input.permission, input.scope)),
  invite: p
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        roleKeys: z.array(z.string()).min(1),
      }),
    )
    .mutation(({ ctx, input }) => d.createInvite(ctx.ctx, input)),
  revokeInvite: p.input(z.object({ id })).mutation(({ ctx, input }) => d.revokeInvite(ctx.ctx, input.id)),
});

const settings = router({
  addHoliday: p
    .input(
      z.object({
        date: day,
        name: z.string().min(1),
        kind: z.enum(['national', 'state', 'municipal', 'recess']),
      }),
    )
    .mutation(({ ctx, input }) => d.addHoliday(ctx.ctx, input)),
  removeHoliday: p.input(z.object({ id })).mutation(({ ctx, input }) => d.removeHoliday(ctx.ctx, input.id)),
  updatePolicy: p
    .input(z.object({ id, amount: z.number().int().min(1) }))
    .mutation(({ ctx, input }) => d.updatePolicy(ctx.ctx, input.id, input.amount)),
});

export const appRouter = router({
  crm,
  clients,
  tasks,
  requests,
  content,
  finance,
  members,
  settings,
  meetings: router({
    create: p
      .input(
        z.object({
          title: z.string().min(1),
          startsAt: date,
          endsAt: date.optional(),
          clientId: id.nullable().optional(),
          opportunityId: id.nullable().optional(),
          location: z.string().optional(),
          participantIds: z.array(id).optional(),
        }),
      )
      .mutation(({ ctx, input }) => d.createMeeting(ctx.ctx, input)),
  }),
  notifications: router({
    list: p.query(({ ctx }) => d.listNotifications(ctx.ctx)),
    markRead: p
      .input(z.object({ ids: z.array(id).optional() }))
      .mutation(({ ctx, input }) => d.markNotificationsRead(ctx.ctx, input.ids)),
  }),
  search: p.input(z.object({ q: z.string() })).query(({ ctx, input }) => d.search(ctx.ctx, input.q)),
});

export type AppRouter = typeof appRouter;
