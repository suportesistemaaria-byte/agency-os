-- gen_random_uuid() é nativo do PostgreSQL 13+; nenhuma extensão necessária.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aos_app') THEN CREATE ROLE aos_app NOLOGIN NOBYPASSRLS; END IF;
END $$;
--> statement-breakpoint
CREATE TYPE member_status AS ENUM ('invited', 'active', 'suspended');
--> statement-breakpoint
CREATE TYPE permission_scope AS ENUM ('all', 'team', 'own');
--> statement-breakpoint
CREATE TYPE override_effect AS ENUM ('grant', 'deny');
--> statement-breakpoint
CREATE TYPE actor_type AS ENUM ('user', 'client_contact', 'system', 'automation');
--> statement-breakpoint
CREATE TYPE sla_model AS ENUM ('business_days', 'business_hours');
--> statement-breakpoint
CREATE TYPE holiday_kind AS ENUM ('national', 'state', 'municipal', 'recess');
--> statement-breakpoint
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  status member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_ws_user UNIQUE (workspace_id, user_id),
  CONSTRAINT workspace_members_ws_id UNIQUE (workspace_id, id)
);
--> statement-breakpoint
CREATE TABLE permissions (
  key text PRIMARY KEY,
  module text NOT NULL,
  description text NOT NULL
);
--> statement-breakpoint
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_ws_key UNIQUE (workspace_id, key),
  CONSTRAINT roles_ws_id UNIQUE (workspace_id, id)
);
--> statement-breakpoint
CREATE TABLE role_permissions (
  workspace_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES permissions(key),
  scope permission_scope NOT NULL DEFAULT 'all',
  PRIMARY KEY (role_id, permission_key),
  FOREIGN KEY (workspace_id, role_id) REFERENCES roles(workspace_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE member_roles (
  workspace_id uuid NOT NULL,
  member_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (member_id, role_id),
  FOREIGN KEY (workspace_id, member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, role_id) REFERENCES roles(workspace_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE member_permission_overrides (
  workspace_id uuid NOT NULL,
  member_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES permissions(key),
  effect override_effect NOT NULL,
  scope permission_scope NOT NULL DEFAULT 'all',
  PRIMARY KEY (member_id, permission_key),
  FOREIGN KEY (workspace_id, member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE business_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL,
  periods jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_calendars_ws_id UNIQUE (workspace_id, id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX business_calendars_one_default ON business_calendars (workspace_id) WHERE is_default;
--> statement-breakpoint
CREATE TABLE holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  kind holiday_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT holidays_ws_date UNIQUE (workspace_id, date)
);
--> statement-breakpoint
CREATE TABLE sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  model sla_model NOT NULL,
  amount integer NOT NULL CHECK (amount >= 1),
  rule text,
  near_due_ratio numeric(4,3) NOT NULL DEFAULT 0.250 CHECK (near_due_ratio > 0 AND near_due_ratio < 1),
  near_due_min_minutes integer NOT NULL DEFAULT 120 CHECK (near_due_min_minutes >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sla_policies_ws_key UNIQUE (workspace_id, key),
  CONSTRAINT sla_policies_ws_id UNIQUE (workspace_id, id),
  CONSTRAINT sla_policies_rule CHECK (rule IS NULL OR (rule = 'A1_same_time' AND model = 'business_days'))
);
--> statement-breakpoint
CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type ~ '^[a-z_]+\.[a-z_]+$'),
  version integer NOT NULL DEFAULT 1,
  entity_type text NOT NULL,
  entity_id uuid,
  actor_type actor_type NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT domain_events_idem UNIQUE (workspace_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX domain_events_pending ON domain_events (available_at) WHERE processed_at IS NULL;
--> statement-breakpoint
CREATE INDEX domain_events_entity ON domain_events (workspace_id, entity_type, entity_id);
--> statement-breakpoint
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_type actor_type NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX audit_logs_entity ON audit_logs (workspace_id, entity_type, entity_id, created_at);
