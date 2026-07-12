-- P3: sequences (cadences) — multi-step automated outreach (email + task steps with delays),
-- plus optional stage-triggered auto-enrolment. Idempotent; RLS enabled (service-role access).

CREATE TABLE IF NOT EXISTS "sales_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "enroll_on_stage" varchar(30),
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_sequences_enroll_stage_idx" ON "sales_sequences" ("enroll_on_stage");
ALTER TABLE "sales_sequences" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "sales_sequence_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_id" uuid NOT NULL REFERENCES "sales_sequences"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "crm_contacts"("id") ON DELETE CASCADE,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "current_step" integer DEFAULT 0 NOT NULL,
  "next_run_at" timestamp,
  "last_error" text,
  "enrolled_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_seq_enroll_unique_idx" ON "sales_sequence_enrollments" ("sequence_id", "contact_id");
CREATE INDEX IF NOT EXISTS "sales_seq_enroll_due_idx" ON "sales_sequence_enrollments" ("status", "next_run_at");
ALTER TABLE "sales_sequence_enrollments" ENABLE ROW LEVEL SECURITY;
