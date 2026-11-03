-- Bloco 12: profundidade de eventos (anti-loop), preferências e entregas de notificação.
ALTER TABLE domain_events ADD COLUMN depth integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  event_type text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  whatsapp boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_ws_id UNIQUE (workspace_id, id),
  CONSTRAINT notification_preferences_key UNIQUE (member_id, event_type),
  CONSTRAINT notification_preferences_member_fk FOREIGN KEY (workspace_id, member_id) REFERENCES workspace_members(workspace_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  provider text,
  provider_id text,
  attempts integer NOT NULL DEFAULT 1,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_ws_id UNIQUE (workspace_id, id),
  CONSTRAINT notification_deliveries_once UNIQUE (notification_id, channel),
  CONSTRAINT notification_deliveries_notification_fk FOREIGN KEY (workspace_id, notification_id) REFERENCES notifications(workspace_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_preferences USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id());
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_deliveries USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id());
--> statement-breakpoint
CREATE POLICY portal_scope ON notification_preferences AS RESTRICTIVE USING (app.current_client_id() IS NULL) WITH CHECK (app.current_client_id() IS NULL);
--> statement-breakpoint
CREATE POLICY portal_scope ON notification_deliveries AS RESTRICTIVE USING (app.current_client_id() IS NULL) WITH CHECK (app.current_client_id() IS NULL);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO aos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON notification_deliveries TO aos_app;
