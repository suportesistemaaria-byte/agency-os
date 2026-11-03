-- Falhas de automação ficam no histórico sem impedir a nova tentativa (só ok/skipped são únicos).
ALTER TABLE automation_executions DROP CONSTRAINT automation_executions_once;
--> statement-breakpoint
CREATE UNIQUE INDEX automation_executions_once ON automation_executions (rule_id, event_id) WHERE status <> 'failed';
