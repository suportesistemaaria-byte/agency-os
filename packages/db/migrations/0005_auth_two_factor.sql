-- Campos exigidos pelo plugin de 2FA do Better Auth 1.7 (bloqueio após tentativas falhas).
ALTER TABLE auth_two_factors ADD COLUMN verified boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE auth_two_factors ADD COLUMN failed_verification_count integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE auth_two_factors ADD COLUMN locked_until timestamptz;
