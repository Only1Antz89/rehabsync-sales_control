-- P2: tracked 1:1 emails to a contact (distinct from bulk campaigns). Delivery/open/click land via
-- the same SMTP2GO webhook, matched by message_id. Idempotent; RLS enabled (service-role access).

CREATE TABLE IF NOT EXISTS "sales_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL REFERENCES "crm_contacts"("id") ON DELETE CASCADE,
  "to_email" varchar(255) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'sent' NOT NULL,
  "message_id" varchar(160),
  "error" text,
  "created_by" varchar(255),
  "sent_at" timestamp,
  "opened_at" timestamp,
  "clicked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_emails_contact_idx" ON "sales_emails" ("contact_id");
CREATE INDEX IF NOT EXISTS "sales_emails_msg_idx" ON "sales_emails" ("message_id");
ALTER TABLE "sales_emails" ENABLE ROW LEVEL SECURITY;
