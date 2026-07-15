-- Lead scoring: a transparent 0–100 score per contact plus the per-factor breakdown that produced
-- it. Additive + defaulted so existing rows start at 0 until the next recompute.

ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "lead_score" integer DEFAULT 0 NOT NULL;
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "score_factors" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS "crm_contacts_score_idx" ON "crm_contacts" ("lead_score");
