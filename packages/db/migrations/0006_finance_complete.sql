-- Bloco 8: aditivos de contrato (upsell/renovação) e índices de inadimplência/fluxo de caixa.
CREATE TABLE contract_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL,
  opportunity_id uuid UNIQUE,
  kind text NOT NULL,
  description text NOT NULL,
  mrr_delta_cents bigint NOT NULL DEFAULT 0,
  setup_cents bigint NOT NULL DEFAULT 0,
  previous_end_on date,
  new_end_on date,
  effective_on date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_amendments_ws_id UNIQUE (workspace_id, id),
  CONSTRAINT contract_amendments_contract_id_fk FOREIGN KEY (workspace_id, contract_id) REFERENCES contracts(workspace_id, id),
  CONSTRAINT contract_amendments_opportunity_id_fk FOREIGN KEY (workspace_id, opportunity_id) REFERENCES opportunities(workspace_id, id)
);
--> statement-breakpoint
ALTER TABLE contract_items ADD COLUMN amendment_id uuid;
--> statement-breakpoint
ALTER TABLE contract_items ADD CONSTRAINT contract_items_amendment_id_fk FOREIGN KEY (workspace_id, amendment_id) REFERENCES contract_amendments(workspace_id, id);
--> statement-breakpoint
ALTER TABLE contract_amendments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contract_amendments USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id());
--> statement-breakpoint
-- Aditivo é registro-prova: somente inclusão.
GRANT SELECT, INSERT ON contract_amendments TO aos_app;
--> statement-breakpoint
CREATE INDEX payments_paid_on ON payments (workspace_id, paid_on);
--> statement-breakpoint
CREATE INDEX expenses_due ON expenses (workspace_id, paid_on, due_on);
