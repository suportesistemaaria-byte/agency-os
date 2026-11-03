-- Bloco 9: decisões de reunião que viram tarefa.
CREATE TABLE meeting_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL,
  description text NOT NULL,
  owner_id uuid,
  task_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_decisions_ws_id UNIQUE (workspace_id, id),
  CONSTRAINT meeting_decisions_meeting_id_fk FOREIGN KEY (workspace_id, meeting_id) REFERENCES meetings(workspace_id, id),
  CONSTRAINT meeting_decisions_owner_id_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES workspace_members(workspace_id, id),
  CONSTRAINT meeting_decisions_task_id_fk FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, id)
);
--> statement-breakpoint
ALTER TABLE meeting_decisions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON meeting_decisions USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_decisions TO aos_app;
--> statement-breakpoint
-- Snapshot diário do health score: a aplicação grava pelo job (papel da aplicação, com workspace fixado).
CREATE INDEX client_health_scores_date ON client_health_scores (workspace_id, date);
