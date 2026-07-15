-- In-app notifications + SLA first-response settings. Notifications are addressed to a staff email;
-- the SLA job creates 'sla_breach' notifications for new leads left unanswered past the threshold.

CREATE TABLE IF NOT EXISTS "sales_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_email" varchar(255) NOT NULL,
  "kind" varchar(30) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text,
  "entity_type" varchar(40),
  "entity_id" uuid,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_notifications_recipient_idx" ON "sales_notifications" ("recipient_email", "read_at");
CREATE INDEX IF NOT EXISTS "sales_notifications_dedupe_idx" ON "sales_notifications" ("kind", "entity_id", "recipient_email");
ALTER TABLE "sales_notifications" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "sales_sla_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "enabled" boolean NOT NULL DEFAULT false,
  "first_response_hours" integer NOT NULL DEFAULT 24,
  "updated_by" varchar(255),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "sales_sla_singleton" CHECK ("id" = 1)
);
INSERT INTO "sales_sla_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE "sales_sla_settings" ENABLE ROW LEVEL SECURITY;
