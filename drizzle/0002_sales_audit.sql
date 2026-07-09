-- Sales Centre audit trail — every mutation in this app records an audit row from day one.
CREATE TABLE IF NOT EXISTS "sales_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_email" varchar(255) NOT NULL,
  "actor_kind" varchar(30) NOT NULL,
  "action" varchar(60) NOT NULL,
  "entity_type" varchar(60) NOT NULL,
  "entity_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_audit_logs_created_idx" ON "sales_audit_logs" USING btree ("created_at");

ALTER TABLE "sales_audit_logs" ENABLE ROW LEVEL SECURITY;
