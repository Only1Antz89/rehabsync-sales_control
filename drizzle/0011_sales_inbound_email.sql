-- Two-way email: capture inbound replies from contacts. Additive columns on sales_emails so one
-- table holds both outbound (direction='outbound', the default) and inbound (direction='inbound')
-- mail. Existing rows keep the default direction, so this is backwards-compatible.

ALTER TABLE "sales_emails" ADD COLUMN IF NOT EXISTS "direction" varchar(10) DEFAULT 'outbound' NOT NULL;
ALTER TABLE "sales_emails" ADD COLUMN IF NOT EXISTS "from_email" varchar(255);
ALTER TABLE "sales_emails" ADD COLUMN IF NOT EXISTS "body_text" text;
ALTER TABLE "sales_emails" ADD COLUMN IF NOT EXISTS "body_html" text;
ALTER TABLE "sales_emails" ADD COLUMN IF NOT EXISTS "in_reply_to" varchar(255);
ALTER TABLE "sales_emails" ADD COLUMN IF NOT EXISTS "received_at" timestamp;

CREATE INDEX IF NOT EXISTS "sales_emails_direction_idx" ON "sales_emails" ("contact_id", "direction");
