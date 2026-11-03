-- contract.expiring passa a criar a oportunidade de renovação (V3, seção 9) além de avisar.
UPDATE automation_rules SET actions = '[{"type":"create_renewal","withinDays":90},{"type":"notify_owner"}]'::jsonb, name = 'Contrato vencendo (90 dias, sem renovação) → oportunidade de renovação e aviso'
WHERE key = 'contract_expiring_renewal';
