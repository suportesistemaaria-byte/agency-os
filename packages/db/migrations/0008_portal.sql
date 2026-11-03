-- Bloco 10: portal do cliente. Usuário do portal é ligado a client_contacts; a RLS ADICIONAL limita ao client_id dele (V3, seção 4).
CREATE OR REPLACE FUNCTION app.current_client_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.client_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.portal_finance() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.portal_finance', true), '') = '1' $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_client_id(), app.current_user_id(), app.portal_finance() TO aos_app;
--> statement-breakpoint
ALTER TABLE invitations ADD COLUMN kind text NOT NULL DEFAULT 'member';
--> statement-breakpoint
ALTER TABLE invitations ADD COLUMN contact_id uuid;
--> statement-breakpoint
ALTER TABLE invitations ADD CONSTRAINT invitations_contact_id_fk FOREIGN KEY (workspace_id, contact_id) REFERENCES client_contacts(workspace_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX client_contacts_user ON client_contacts (user_id) WHERE user_id IS NOT NULL;
--> statement-breakpoint
-- Política RESTRITIVA "portal_scope" em TODA tabela com workspace_id: sem cliente no contexto (equipe), não muda nada;
-- com cliente (portal), só o que está na lista abaixo, filtrado pelo cliente. Tabela fora da lista = nada (fail-closed).
DO $$
DECLARE
  t text;
  cond text;
  rules jsonb := jsonb_build_object(
    'clients', 'id = app.current_client_id()',
    'client_contacts', 'client_id = app.current_client_id()',
    'people', 'id IN (SELECT person_id FROM client_contacts)',
    'contents', $c$client_id = app.current_client_id() AND stage IN ('client_approval','change_requested','approved','scheduled','posted')$c$,
    'content_versions', 'content_id IN (SELECT id FROM contents)',
    'content_copies', 'version_id IN (SELECT id FROM content_versions)',
    'content_assets', 'version_id IN (SELECT id FROM content_versions)',
    'content_comments', $c$content_id IN (SELECT id FROM contents) AND visibility = 'client'$c$,
    'content_annotations', 'content_id IN (SELECT id FROM contents)',
    'content_approvals', 'content_id IN (SELECT id FROM contents)',
    'content_stage_history', 'content_id IN (SELECT id FROM contents)',
    'campaigns', 'client_id = app.current_client_id()',
    'requests', 'client_id = app.current_client_id()',
    'request_status_history', 'request_id IN (SELECT id FROM requests)',
    'sla_clocks', $c$entity_type = 'request' AND entity_id IN (SELECT id FROM requests)$c$,
    'sla_intervals', 'clock_id IN (SELECT id FROM sla_clocks)',
    'meetings', 'client_id = app.current_client_id()',
    'files', 'client_id = app.current_client_id() AND (category = ''portal'' OR id IN (SELECT file_id FROM content_assets))',
    'file_links', 'file_id IN (SELECT id FROM files)',
    'invoices', 'client_id = app.current_client_id() AND app.portal_finance()',
    'invoice_items', 'invoice_id IN (SELECT id FROM invoices)',
    'payments', 'invoice_id IN (SELECT id FROM invoices)',
    'business_calendars', 'true',
    'holidays', 'true',
    'sla_policies', 'true',
    'domain_events', 'actor_id = app.current_user_id()',
    'audit_logs', 'actor_id = app.current_user_id()'
  );
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN information_schema.columns col ON col.table_name = c.relname AND col.column_name = 'workspace_id' AND col.table_schema = 'public'
    WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
  LOOP
    cond := coalesce(rules ->> t, 'false');
    EXECUTE format('CREATE POLICY portal_scope ON %I AS RESTRICTIVE USING (app.current_client_id() IS NULL OR (%s)) WITH CHECK (app.current_client_id() IS NULL OR (%s))', t, cond, cond);
  END LOOP;
END $$;
--> statement-breakpoint
-- Usuários (identidade global): no portal, só o próprio registro (a equipe da agência não aparece).
CREATE POLICY portal_scope ON users AS RESTRICTIVE USING (app.current_client_id() IS NULL OR id = app.current_user_id());
