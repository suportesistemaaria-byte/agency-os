-- FKs compostas que dependem de tabelas declaradas depois (oportunidade ↔ cliente).
ALTER TABLE opportunities ADD CONSTRAINT opportunities_client_id_fk
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id);
--> statement-breakpoint
ALTER TABLE opportunities ADD CONSTRAINT opportunities_converted_client_id_fk
  FOREIGN KEY (workspace_id, converted_client_id) REFERENCES clients(workspace_id, id);
--> statement-breakpoint
-- RLS em toda tabela com workspace_id que ainda não tem (fail-closed, mesma política da 0001).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN information_schema.columns col ON col.table_name = c.relname AND col.column_name = 'workspace_id' AND col.table_schema = 'public'
    WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Privilégios do papel da aplicação nas tabelas de negócio.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  invitations, notifications,
  organizations, people, pipelines, pipeline_stages, lost_reasons, leads, opportunities, commercial_activities,
  next_actions, proposals, proposal_items, sales_goals,
  services, clients, client_contacts, client_team, onboarding_templates, onboarding_template_steps,
  client_onboardings, onboarding_steps, client_health_scores, contracts, contract_items,
  files, file_links, campaigns, contents, content_copies, content_assets, content_comments, content_annotations,
  content_stage_history,
  sla_clocks, sla_intervals, requests, request_status_history, tasks, task_assignees, task_dependencies,
  task_blocks, task_comments, meetings, meeting_participants,
  invoices, invoice_items, expense_categories, expenses,
  automation_rules
TO aos_app;
--> statement-breakpoint
-- Registros-prova: somente inclusão para a aplicação (versões imutáveis, aprovações, pagamentos, overrides).
GRANT SELECT, INSERT ON proposal_versions, content_versions, content_approvals, payments, sla_overrides,
  automation_executions TO aos_app;
--> statement-breakpoint
-- Soma de pagamentos nunca ultrapassa a fatura (V3, seção 6: validado no serviço + trigger).
CREATE OR REPLACE FUNCTION app.check_payment_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total bigint; limit_cents bigint;
BEGIN
  SELECT amount_cents INTO limit_cents FROM invoices WHERE id = NEW.invoice_id AND workspace_id = NEW.workspace_id FOR UPDATE;
  SELECT coalesce(sum(amount_cents), 0) + NEW.amount_cents INTO total FROM payments WHERE invoice_id = NEW.invoice_id;
  IF total > limit_cents THEN
    RAISE EXCEPTION 'Pagamentos (%) ultrapassam o valor da fatura (%)', total, limit_cents USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_total_check BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION app.check_payment_total();
--> statement-breakpoint
-- Versões de conteúdo: o arquivo nunca recebe UPDATE (garantido também para o dono fora de migrações).
CREATE OR REPLACE FUNCTION app.forbid_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: %', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER content_versions_immutable BEFORE UPDATE ON content_versions FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
--> statement-breakpoint
CREATE TRIGGER content_assets_immutable BEFORE UPDATE ON content_assets FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
