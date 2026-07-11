-- P1: Deals & Companies as first-class CRM objects (accounts + opportunities), with associations.
-- Additive only: crm_contacts gains a nullable company_id. All idempotent; RLS enabled (service-role).

CREATE TABLE IF NOT EXISTS "sales_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "domain" varchar(255),
  "website" varchar(500),
  "industry" varchar(120),
  "size" varchar(40),
  "phone" varchar(40),
  "address" text,
  "owner_name" varchar(120),
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_companies_name_idx" ON "sales_companies" ("name");
CREATE INDEX IF NOT EXISTS "sales_companies_domain_idx" ON "sales_companies" (lower("domain"));
ALTER TABLE "sales_companies" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "sales_deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(200) NOT NULL,
  "company_id" uuid REFERENCES "sales_companies"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "crm_contacts"("id") ON DELETE SET NULL,
  "stage" varchar(30) DEFAULT 'qualification' NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "amount_pence" integer DEFAULT 0 NOT NULL,
  "currency" varchar(3) DEFAULT 'GBP' NOT NULL,
  "probability" integer,
  "expected_close_date" date,
  "source" varchar(40),
  "owner_name" varchar(120),
  "lost_reason" text,
  "created_by" varchar(255),
  "closed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_deals_stage_status_idx" ON "sales_deals" ("status", "stage");
CREATE INDEX IF NOT EXISTS "sales_deals_company_idx" ON "sales_deals" ("company_id");
CREATE INDEX IF NOT EXISTS "sales_deals_contact_idx" ON "sales_deals" ("contact_id");
ALTER TABLE "sales_deals" ENABLE ROW LEVEL SECURITY;

-- Additive association: a contact optionally belongs to a company (the clinic/account).
ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "sales_companies"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "crm_contacts_company_idx" ON "crm_contacts" ("company_id");
