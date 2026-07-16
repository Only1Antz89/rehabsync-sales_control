-- Quotes / proposals with line items. Money is stored in pence (integers); totals are computed
-- server-side from the line items + discount + tax rate.

CREATE TABLE IF NOT EXISTS "sales_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "number" varchar(20) NOT NULL,
  "title" varchar(200) NOT NULL,
  "contact_id" uuid REFERENCES "crm_contacts"("id") ON DELETE SET NULL,
  "company_id" uuid,
  "deal_id" uuid REFERENCES "sales_deals"("id") ON DELETE SET NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "currency" varchar(3) NOT NULL DEFAULT 'GBP',
  "subtotal_pence" integer NOT NULL DEFAULT 0,
  "discount_pence" integer NOT NULL DEFAULT 0,
  "tax_rate_pct" integer NOT NULL DEFAULT 0,
  "tax_pence" integer NOT NULL DEFAULT 0,
  "total_pence" integer NOT NULL DEFAULT 0,
  "notes" text,
  "valid_until" date,
  "created_by" varchar(255),
  "sent_at" timestamp,
  "accepted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_quotes_number_idx" ON "sales_quotes" ("number");
CREATE INDEX IF NOT EXISTS "sales_quotes_status_idx" ON "sales_quotes" ("status");
CREATE INDEX IF NOT EXISTS "sales_quotes_contact_idx" ON "sales_quotes" ("contact_id");
ALTER TABLE "sales_quotes" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "sales_quote_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quote_id" uuid NOT NULL REFERENCES "sales_quotes"("id") ON DELETE CASCADE,
  "description" varchar(300) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price_pence" integer NOT NULL DEFAULT 0,
  "line_total_pence" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "sales_quote_line_items_quote_idx" ON "sales_quote_line_items" ("quote_id");
ALTER TABLE "sales_quote_line_items" ENABLE ROW LEVEL SECURITY;
