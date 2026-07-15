-- Won-deal → tenant provisioning bridge: when a deal is won, Sales can provision a platform
-- tenant (via the platform bootstrap API) and link the resulting tenant back onto the contact
-- and company.

ALTER TABLE "sales_companies" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;

CREATE TABLE IF NOT EXISTS "sales_tenant_provisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid REFERENCES "sales_deals"("id") ON DELETE SET NULL,
  "contact_id" uuid,
  "company_id" uuid,
  "clinic_name" varchar(200) NOT NULL,
  "billing_email" varchar(255) NOT NULL,
  "tenant_id" uuid,
  "tenant_slug" varchar(200),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "error" text,
  "requested_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "provisioned_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_tenant_provisions_deal_idx" ON "sales_tenant_provisions" ("deal_id");
ALTER TABLE "sales_tenant_provisions" ENABLE ROW LEVEL SECURITY;
