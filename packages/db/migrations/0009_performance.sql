-- Bloco 11: performance (métricas manuais/CSV, metas, aprendizados).
CREATE TABLE IF NOT EXISTS "learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"content_id" uuid,
	"title" text NOT NULL,
	"evidence" text,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'hypothesis' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learnings_ws_id" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"target" numeric(16, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_goals_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "performance_goals_period" UNIQUE("client_id","metric","period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"content_id" uuid,
	"platform" text,
	"metric" text NOT NULL,
	"value" numeric(16, 2) NOT NULL,
	"date" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_metrics_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "performance_metrics_point" UNIQUE NULLS NOT DISTINCT("client_id","content_id","metric","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_ws_id" UNIQUE("workspace_id","id"),
	CONSTRAINT "social_accounts_handle" UNIQUE("client_id","platform","handle")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learnings" ADD CONSTRAINT "learnings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learnings" ADD CONSTRAINT "learnings_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learnings" ADD CONSTRAINT "learnings_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_content_id_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_client_id_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learnings_client" ON "learnings" USING btree ("workspace_id","client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_metrics_client" ON "performance_metrics" USING btree ("workspace_id","client_id","date");
--> statement-breakpoint
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE performance_goals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE learnings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['social_accounts','performance_metrics','performance_goals','learnings'] LOOP
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Portal: resultados e metas do próprio cliente; aprendizados são internos.
CREATE POLICY portal_scope ON social_accounts AS RESTRICTIVE USING (app.current_client_id() IS NULL OR client_id = app.current_client_id()) WITH CHECK (app.current_client_id() IS NULL OR client_id = app.current_client_id());
--> statement-breakpoint
CREATE POLICY portal_scope ON performance_metrics AS RESTRICTIVE USING (app.current_client_id() IS NULL OR client_id = app.current_client_id()) WITH CHECK (app.current_client_id() IS NULL);
--> statement-breakpoint
CREATE POLICY portal_scope ON performance_goals AS RESTRICTIVE USING (app.current_client_id() IS NULL OR client_id = app.current_client_id()) WITH CHECK (app.current_client_id() IS NULL);
--> statement-breakpoint
CREATE POLICY portal_scope ON learnings AS RESTRICTIVE USING (app.current_client_id() IS NULL) WITH CHECK (app.current_client_id() IS NULL);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON social_accounts, performance_metrics, performance_goals, learnings TO aos_app;
