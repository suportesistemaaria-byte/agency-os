-- Domínios de negócio (Blocos 1 a 7). Gerado do schema Drizzle; RLS, grants e FKs circulares em 0003.
ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT false NOT NULL;
ALTER TABLE users ADD COLUMN image text;
ALTER TABLE users ADD COLUMN two_factor_enabled boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('call', 'whatsapp', 'email', 'meeting', 'followup', 'proposal', 'note', 'task', 'negotiation');
--> statement-breakpoint
CREATE TYPE "public"."approval_action" AS ENUM('submitted', 'approved', 'change_requested', 'approved_on_behalf', 'reopened');
--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('onboarding', 'active', 'attention', 'critical', 'paused', 'churned');
--> statement-breakpoint
CREATE TYPE "public"."content_stage" AS ENUM('idea', 'planning', 'production', 'copy', 'design', 'internal_review', 'client_approval', 'change_requested', 'approved', 'scheduled', 'posted');
--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('pending_finance_confirmation', 'active', 'ended', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('ok', 'skipped', 'failed');
--> statement-breakpoint
CREATE TYPE "public"."expense_kind" AS ENUM('fixed', 'variable');
--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('setup', 'recurring', 'one_off');
--> statement-breakpoint
CREATE TYPE "public"."opportunity_state" AS ENUM('open', 'no_response', 'paused', 'lost', 'won');
--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('new', 'upsell', 'renewal');
--> statement-breakpoint
CREATE TYPE "public"."pause_kind" AS ENUM('client', 'blocked');
--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');
--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'ready', 'sent', 'viewed', 'negotiation', 'accepted', 'refused', 'expired');
--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('received', 'triage', 'assigned', 'in_production', 'review', 'client_approval', 'delivered', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('arte_estatica', 'arte_impresso', 'video', 'alteracao', 'fotos_editadas', 'cardapio', 'catalogo', 'outro');
--> statement-breakpoint
CREATE TYPE "public"."sla_status" AS ENUM('on_time', 'near_due', 'overdue', 'paused', 'blocked', 'met', 'missed');
--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."temperature" AS ENUM('cold', 'warm', 'hot');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_two_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role_keys" text[] NOT NULL,
	"token" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token"),
	CONSTRAINT "invitations_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"entity_type" text,
	"entity_id" uuid,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "notifications_dedupe" UNIQUE("workspace_id","member_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commercial_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"organization_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_activities_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid,
	"source" text,
	"campaign" text,
	"temperature" "temperature" DEFAULT 'warm' NOT NULL,
	"owner_id" uuid,
	"need" text,
	"budget" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lost_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lost_reasons_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "next_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"owner_id" uuid,
	"done_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "next_actions_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "next_actions_idem" UNIQUE("workspace_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"lead_id" uuid,
	"organization_id" uuid NOT NULL,
	"person_id" uuid,
	"client_id" uuid,
	"type" "opportunity_type" DEFAULT 'new' NOT NULL,
	"state" "opportunity_state" DEFAULT 'open' NOT NULL,
	"temperature" "temperature" DEFAULT 'warm' NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"service" text,
	"setup_cents" bigint DEFAULT 0 NOT NULL,
	"mrr_cents" bigint DEFAULT 0 NOT NULL,
	"source" text,
	"expected_close_on" date,
	"last_interaction_at" timestamp with time zone,
	"lost_reason_id" uuid,
	"lost_note" text,
	"position" integer DEFAULT 0 NOT NULL,
	"won_at" timestamp with time zone,
	"converted_client_id" uuid,
	"converted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "opportunities_lost_reason" CHECK (state <> 'lost' OR lost_reason_id IS NOT NULL),
	CONSTRAINT "opportunities_upsell_client" CHECK (type = 'new' OR client_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"cnpj" text,
	"segment" text,
	"city" text,
	"website" text,
	"instagram" text,
	"address" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"role_title" text,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_stages_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "pipeline_stages_key" UNIQUE("workspace_id","pipeline_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipelines_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"description" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_items_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"notes" text,
	"setup_cents" bigint DEFAULT 0 NOT NULL,
	"mrr_cents" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_versions_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "proposal_versions_number" UNIQUE("proposal_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"valid_until" date,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "proposals_number" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period" text NOT NULL,
	"owner_id" uuid,
	"mrr_target_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_goals_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "sales_goals_period" UNIQUE("workspace_id","period","owner_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"can_comment" boolean DEFAULT true NOT NULL,
	"can_request" boolean DEFAULT true NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL,
	"receives_finance" boolean DEFAULT false NOT NULL,
	"receives_notifications" boolean DEFAULT true NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_contacts_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_contacts_person" UNIQUE("client_id","person_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_health_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"score" integer NOT NULL,
	"factors" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_health_scores_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_health_scores_day" UNIQUE("client_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_onboardings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"template_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_onboardings_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"function" text NOT NULL,
	"member_id" uuid NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_team_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_team_member" UNIQUE("client_id","function","member_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"name" text NOT NULL,
	"segment" text,
	"plan" text,
	"status" "client_status" DEFAULT 'onboarding' NOT NULL,
	"owner_id" uuid,
	"color" text,
	"started_on" date,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_opportunity_id_unique" UNIQUE("opportunity_id"),
	CONSTRAINT "clients_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_items_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"proposal_id" uuid,
	"number" text NOT NULL,
	"status" "contract_status" DEFAULT 'pending_finance_confirmation' NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"billing_day" integer DEFAULT 10 NOT NULL,
	"change_limit" integer DEFAULT 2 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "contracts_number" UNIQUE("workspace_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"function" text NOT NULL,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_steps_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_template_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"function" text NOT NULL,
	"business_days" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_template_steps_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_templates_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "item_kind" DEFAULT 'recurring' NOT NULL,
	"default_cents" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_links_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"category" text,
	"uploaded_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"asset_index" integer DEFAULT 0 NOT NULL,
	"x_pct" numeric(6, 3),
	"y_pct" numeric(6, 3),
	"video_ms" integer,
	"body" text NOT NULL,
	"author_member_id" uuid,
	"author_contact_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_annotations_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "content_annotations_position" CHECK ((x_pct IS NOT NULL AND y_pct IS NOT NULL AND x_pct BETWEEN 0 AND 100 AND y_pct BETWEEN 0 AND 100) OR video_ms IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"action" "approval_action" NOT NULL,
	"actor_member_id" uuid,
	"actor_contact_id" uuid,
	"origin" text DEFAULT 'internal' NOT NULL,
	"justification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_approvals_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "content_approvals_on_behalf_justification" CHECK (action <> 'approved_on_behalf' OR length(trim(coalesce(justification, ''))) >= 10)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_assets_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"author_member_id" uuid,
	"author_contact_id" uuid,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_comments_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"hook" text,
	"caption" text,
	"cta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_copies_version_id_unique" UNIQUE("version_id"),
	CONSTRAINT "content_copies_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"from_stage" "content_stage",
	"to_stage" "content_stage" NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_stage_history_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "content_versions_number" UNIQUE("content_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"campaign_id" uuid,
	"title" text NOT NULL,
	"platform" text NOT NULL,
	"format" text NOT NULL,
	"stage" "content_stage" DEFAULT 'idea' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"feed_position" integer,
	"owner_id" uuid,
	"copywriter_id" uuid,
	"designer_id" uuid,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"objective" text,
	"pillar" text,
	"current_version" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contents_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_participants" (
	"workspace_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "meeting_participants_meeting_id_member_id_pk" PRIMARY KEY("meeting_id","member_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"opportunity_id" uuid,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "request_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"from_status" "request_status",
	"to_status" "request_status" NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_status_history_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "request_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "request_status" DEFAULT 'received' NOT NULL,
	"origin" text DEFAULT 'internal' NOT NULL,
	"in_scope" boolean DEFAULT true NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"assignee_id" uuid,
	"requested_by_contact_id" uuid,
	"sla_clock_id" uuid,
	"delivered_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_clocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"policy_key" text NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"created_from" timestamp with time zone NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone,
	"status" "sla_status" DEFAULT 'on_time' NOT NULL,
	"total_minutes" integer NOT NULL,
	"consumed_minutes" integer DEFAULT 0 NOT NULL,
	"near_due_notified_at" timestamp with time zone,
	"overdue_notified_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_clocks_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"clock_id" uuid NOT NULL,
	"kind" "pause_kind" NOT NULL,
	"reason" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_intervals_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"clock_id" uuid NOT NULL,
	"before_due" timestamp with time zone,
	"after_due" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_overrides_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_assignees" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "task_assignees_task_id_member_id_pk" PRIMARY KEY("task_id","member_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"resolver" text NOT NULL,
	"resolver_member_id" uuid,
	"external" boolean DEFAULT false NOT NULL,
	"note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_blocks_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_dependencies" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	CONSTRAINT "task_dependencies_task_id_depends_on_id_pk" PRIMARY KEY("task_id","depends_on_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"request_id" uuid,
	"content_id" uuid,
	"opportunity_id" uuid,
	"origin_type" text DEFAULT 'manual' NOT NULL,
	"origin_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"due_at" timestamp with time zone,
	"sla_clock_id" uuid,
	"completed_at" timestamp with time zone,
	"idempotency_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "expense_kind" DEFAULT 'variable' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "expense_categories_name" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid,
	"client_id" uuid,
	"description" text NOT NULL,
	"supplier" text,
	"amount_cents" bigint NOT NULL,
	"competence" text NOT NULL,
	"due_on" date NOT NULL,
	"paid_on" date,
	"recurring" text,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "expenses_amount_positive" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid,
	"number" text NOT NULL,
	"competence" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"description" text NOT NULL,
	"issue_on" date NOT NULL,
	"due_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"origin" text DEFAULT 'contract' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "invoices_number" UNIQUE("workspace_id","number"),
	CONSTRAINT "invoices_contract_competence" UNIQUE("workspace_id","contract_id","competence","kind"),
	CONSTRAINT "invoices_amount_positive" CHECK (amount_cents > 0),
	CONSTRAINT "invoices_paid_le_amount" CHECK (paid_cents >= 0 AND paid_cents <= amount_cents)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"method" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "payments_amount_positive" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"status" "execution_status" NOT NULL,
	"result" jsonb,
	"error" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_executions_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "automation_executions_once" UNIQUE("rule_id","event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_rules_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "automation_rules_key" UNIQUE("workspace_id","key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_two_factors" ADD CONSTRAINT "auth_two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fk" FOREIGN KEY ("workspace_id","invited_by") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_opportunity_id_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_organization_id_fk" FOREIGN KEY ("workspace_id","organization_id") REFERENCES "public"."organizations"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_actor_id_fk" FOREIGN KEY ("workspace_id","actor_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fk" FOREIGN KEY ("workspace_id","organization_id") REFERENCES "public"."organizations"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_person_id_fk" FOREIGN KEY ("workspace_id","person_id") REFERENCES "public"."people"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lost_reasons" ADD CONSTRAINT "lost_reasons_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_opportunity_id_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "next_actions" ADD CONSTRAINT "next_actions_owner_id_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_id_fk" FOREIGN KEY ("workspace_id","pipeline_id") REFERENCES "public"."pipelines"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fk" FOREIGN KEY ("workspace_id","stage_id") REFERENCES "public"."pipeline_stages"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_id_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_fk" FOREIGN KEY ("workspace_id","organization_id") REFERENCES "public"."organizations"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_person_id_fk" FOREIGN KEY ("workspace_id","person_id") REFERENCES "public"."people"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lost_reason_id_fk" FOREIGN KEY ("workspace_id","lost_reason_id") REFERENCES "public"."lost_reasons"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "people" ADD CONSTRAINT "people_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_fk" FOREIGN KEY ("workspace_id","organization_id") REFERENCES "public"."organizations"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fk" FOREIGN KEY ("workspace_id","pipeline_id") REFERENCES "public"."pipelines"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_items" ADD CONSTRAINT "proposal_items_version_id_fk" FOREIGN KEY ("workspace_id","version_id") REFERENCES "public"."proposal_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_fk" FOREIGN KEY ("workspace_id","proposal_id") REFERENCES "public"."proposals"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_opportunity_id_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_owner_id_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_person_id_fk" FOREIGN KEY ("workspace_id","person_id") REFERENCES "public"."people"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_health_scores" ADD CONSTRAINT "client_health_scores_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_health_scores" ADD CONSTRAINT "client_health_scores_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_template_id_fk" FOREIGN KEY ("workspace_id","template_id") REFERENCES "public"."onboarding_templates"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_team" ADD CONSTRAINT "client_team_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_team" ADD CONSTRAINT "client_team_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_team" ADD CONSTRAINT "client_team_member_id_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fk" FOREIGN KEY ("workspace_id","organization_id") REFERENCES "public"."organizations"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_opportunity_id_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_contract_id_fk" FOREIGN KEY ("workspace_id","contract_id") REFERENCES "public"."contracts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_items" ADD CONSTRAINT "contract_items_service_id_fk" FOREIGN KEY ("workspace_id","service_id") REFERENCES "public"."services"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_opportunity_id_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proposal_id_fk" FOREIGN KEY ("workspace_id","proposal_id") REFERENCES "public"."proposals"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_onboarding_id_fk" FOREIGN KEY ("workspace_id","onboarding_id") REFERENCES "public"."client_onboardings"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_assignee_id_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_template_steps" ADD CONSTRAINT "onboarding_template_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_template_steps" ADD CONSTRAINT "onboarding_template_steps_template_id_fk" FOREIGN KEY ("workspace_id","template_id") REFERENCES "public"."onboarding_templates"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "services" ADD CONSTRAINT "services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_links" ADD CONSTRAINT "file_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_links" ADD CONSTRAINT "file_links_file_id_fk" FOREIGN KEY ("workspace_id","file_id") REFERENCES "public"."files"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_annotations" ADD CONSTRAINT "content_annotations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_annotations" ADD CONSTRAINT "content_annotations_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_annotations" ADD CONSTRAINT "content_annotations_version_id_fk" FOREIGN KEY ("workspace_id","version_id") REFERENCES "public"."content_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_annotations" ADD CONSTRAINT "content_annotations_author_member_id_fk" FOREIGN KEY ("workspace_id","author_member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_annotations" ADD CONSTRAINT "content_annotations_author_contact_id_fk" FOREIGN KEY ("workspace_id","author_contact_id") REFERENCES "public"."client_contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_version_id_fk" FOREIGN KEY ("workspace_id","version_id") REFERENCES "public"."content_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_actor_member_id_fk" FOREIGN KEY ("workspace_id","actor_member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_actor_contact_id_fk" FOREIGN KEY ("workspace_id","actor_contact_id") REFERENCES "public"."client_contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_version_id_fk" FOREIGN KEY ("workspace_id","version_id") REFERENCES "public"."content_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_file_id_fk" FOREIGN KEY ("workspace_id","file_id") REFERENCES "public"."files"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_version_id_fk" FOREIGN KEY ("workspace_id","version_id") REFERENCES "public"."content_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_author_member_id_fk" FOREIGN KEY ("workspace_id","author_member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_comments" ADD CONSTRAINT "content_comments_author_contact_id_fk" FOREIGN KEY ("workspace_id","author_contact_id") REFERENCES "public"."client_contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_copies" ADD CONSTRAINT "content_copies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_copies" ADD CONSTRAINT "content_copies_version_id_fk" FOREIGN KEY ("workspace_id","version_id") REFERENCES "public"."content_versions"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_stage_history" ADD CONSTRAINT "content_stage_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_stage_history" ADD CONSTRAINT "content_stage_history_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contents" ADD CONSTRAINT "contents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contents" ADD CONSTRAINT "contents_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contents" ADD CONSTRAINT "contents_campaign_id_fk" FOREIGN KEY ("workspace_id","campaign_id") REFERENCES "public"."campaigns"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contents" ADD CONSTRAINT "contents_owner_id_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contents" ADD CONSTRAINT "contents_copywriter_id_fk" FOREIGN KEY ("workspace_id","copywriter_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contents" ADD CONSTRAINT "contents_designer_id_fk" FOREIGN KEY ("workspace_id","designer_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fk" FOREIGN KEY ("workspace_id","meeting_id") REFERENCES "public"."meetings"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_member_id_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meetings" ADD CONSTRAINT "meetings_opportunity_id_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_request_id_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "public"."requests"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_assignee_id_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_requested_by_contact_id_fk" FOREIGN KEY ("workspace_id","requested_by_contact_id") REFERENCES "public"."client_contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_sla_clock_id_fk" FOREIGN KEY ("workspace_id","sla_clock_id") REFERENCES "public"."sla_clocks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sla_intervals" ADD CONSTRAINT "sla_intervals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sla_intervals" ADD CONSTRAINT "sla_intervals_clock_id_fk" FOREIGN KEY ("workspace_id","clock_id") REFERENCES "public"."sla_clocks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sla_overrides" ADD CONSTRAINT "sla_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sla_overrides" ADD CONSTRAINT "sla_overrides_clock_id_fk" FOREIGN KEY ("workspace_id","clock_id") REFERENCES "public"."sla_clocks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_member_id_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_task_id_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_resolver_member_id_fk" FOREIGN KEY ("workspace_id","resolver_member_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_id_fk" FOREIGN KEY ("workspace_id","depends_on_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_request_id_fk" FOREIGN KEY ("workspace_id","request_id") REFERENCES "public"."requests"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_fk" FOREIGN KEY ("workspace_id","opportunity_id") REFERENCES "public"."opportunities"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."workspace_members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sla_clock_id_fk" FOREIGN KEY ("workspace_id","sla_clock_id") REFERENCES "public"."sla_clocks"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."expense_categories"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fk" FOREIGN KEY ("workspace_id","invoice_id") REFERENCES "public"."invoices"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fk" FOREIGN KEY ("workspace_id","contract_id") REFERENCES "public"."contracts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fk" FOREIGN KEY ("workspace_id","invoice_id") REFERENCES "public"."invoices"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_rule_id_fk" FOREIGN KEY ("workspace_id","rule_id") REFERENCES "public"."automation_rules"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_user" ON "auth_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_member" ON "notifications" USING btree ("workspace_id","member_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commercial_activities_org" ON "commercial_activities" USING btree ("workspace_id","organization_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "next_actions_due" ON "next_actions" USING btree ("workspace_id","owner_id","due_at") WHERE done_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_pipeline" ON "opportunities" USING btree ("workspace_id","stage_id","state") WHERE state = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name" ON "organizations" USING btree ("workspace_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_team_member_idx" ON "client_team" USING btree ("workspace_id","member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_links_entity" ON "file_links" USING btree ("workspace_id","entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contents_calendar" ON "contents" USING btree ("workspace_id","client_id","scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contents_stage" ON "contents" USING btree ("workspace_id","stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_day" ON "meetings" USING btree ("workspace_id","starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_status" ON "requests" USING btree ("workspace_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sla_clocks_entity" ON "sla_clocks" USING btree ("workspace_id","entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sla_clocks_active" ON "sla_clocks" USING btree ("workspace_id","status","due_at") WHERE status IN ('on_time','near_due');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_today" ON "tasks" USING btree ("workspace_id","assignee_id","status","due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_client" ON "tasks" USING btree ("workspace_id","client_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_idem" ON "tasks" USING btree ("workspace_id","idempotency_key") WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_receivable" ON "invoices" USING btree ("workspace_id","status","due_on");
