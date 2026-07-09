-- M1 CRM core: follow-up tasks + additive lead-gen columns on the platform's crm_contacts.
-- ADDITIVE ONLY on crm_contacts (owned by the main RehabSync repo) — the marketing-site
-- demo-request flow and the admin CRM console keep reading/writing it unchanged.

ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "utm" jsonb;
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "source_detail" varchar(160);
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp;

CREATE TABLE IF NOT EXISTS "sales_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid REFERENCES "crm_contacts"("id") ON DELETE cascade,
  "title" varchar(200) NOT NULL,
  "type" varchar(20) DEFAULT 'todo' NOT NULL,
  "assignee_email" varchar(255),
  "due_at" timestamp,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "created_by" varchar(255),
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_tasks_status_due_idx" ON "sales_tasks" USING btree ("status", "due_at");
CREATE INDEX IF NOT EXISTS "sales_tasks_contact_idx" ON "sales_tasks" USING btree ("contact_id");

ALTER TABLE "sales_tasks" ENABLE ROW LEVEL SECURITY;
