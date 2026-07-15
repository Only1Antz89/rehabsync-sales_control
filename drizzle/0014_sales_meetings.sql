-- Meeting booking: scheduled meetings against a contact (distinct from ad-hoc "meeting logged"
-- timeline notes). Cancelling a contact cascades their meetings.

CREATE TABLE IF NOT EXISTS "sales_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL REFERENCES "crm_contacts"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "starts_at" timestamp NOT NULL,
  "duration_min" integer NOT NULL DEFAULT 30,
  "location" varchar(500),
  "notes" text,
  "status" varchar(20) NOT NULL DEFAULT 'scheduled',
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_meetings_contact_idx" ON "sales_meetings" ("contact_id");
CREATE INDEX IF NOT EXISTS "sales_meetings_upcoming_idx" ON "sales_meetings" ("status", "starts_at");
ALTER TABLE "sales_meetings" ENABLE ROW LEVEL SECURITY;
