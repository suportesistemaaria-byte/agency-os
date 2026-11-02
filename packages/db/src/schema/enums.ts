import { pgEnum } from 'drizzle-orm/pg-core';

export const memberStatus = pgEnum('member_status', ['invited', 'active', 'suspended']);
export const permissionScope = pgEnum('permission_scope', ['all', 'team', 'own']);
export const overrideEffect = pgEnum('override_effect', ['grant', 'deny']);
export const actorType = pgEnum('actor_type', ['user', 'client_contact', 'system', 'automation']);
export const slaModel = pgEnum('sla_model', ['business_days', 'business_hours']);
export const holidayKind = pgEnum('holiday_kind', ['national', 'state', 'municipal', 'recess']);
