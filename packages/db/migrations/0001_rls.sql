-- Isolamento por workspace (V3, seção 4). Fail-closed: sem app.workspace_id, nada é visível.
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO aos_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO aos_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_workspace_id() TO aos_app;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspace_members','roles','role_permissions','member_roles','member_permission_overrides',
                           'business_calendars','holidays','sla_policies','domain_events','audit_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_self ON workspaces USING (id = app.current_workspace_id());
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_same_workspace ON users USING (
  id IN (SELECT user_id FROM workspace_members WHERE workspace_id = app.current_workspace_id())
);
--> statement-breakpoint
-- Privilégios do papel da aplicação.
GRANT SELECT ON workspaces, users, permissions TO aos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_members, roles, role_permissions, member_roles,
  member_permission_overrides, business_calendars, holidays, sla_policies TO aos_app;
--> statement-breakpoint
-- Outbox: a aplicação só grava e lê; quem marca como processado é o relay (papel dono).
GRANT SELECT, INSERT ON domain_events TO aos_app;
--> statement-breakpoint
-- Auditoria: somente inclusão.
GRANT SELECT, INSERT ON audit_logs TO aos_app;
