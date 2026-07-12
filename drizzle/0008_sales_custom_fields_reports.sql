-- P4: custom fields + saved report builder.
-- ADDITIVE on crm_contacts (owned by the main RehabSync repo): a jsonb bag of user-defined
-- values keyed by sales_custom_fields.key. The main app ignores this column.
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- Admin-defined custom field definitions (contact-scoped for now).
CREATE TABLE IF NOT EXISTS "sales_custom_fields" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity" varchar(20) DEFAULT 'contact' NOT NULL,
  "key" varchar(60) NOT NULL,
  "label" varchar(120) NOT NULL,
  "type" varchar(20) DEFAULT 'text' NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_custom_fields_entity_key_idx" ON "sales_custom_fields" ("entity", "key");
ALTER TABLE "sales_custom_fields" ENABLE ROW LEVEL SECURITY;

-- Saved ad-hoc reports (config-driven aggregation over contacts/deals).
CREATE TABLE IF NOT EXISTS "sales_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "config" jsonb NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "sales_reports" ENABLE ROW LEVEL SECURITY;
