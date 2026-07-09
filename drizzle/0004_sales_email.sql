-- M2 lead-gen + email marketing: capture forms, templates, campaigns, per-recipient tracking,
-- delivery events (SMTP2GO webhook) and the suppression list (UK GDPR/PECR — enforced at send).

CREATE TABLE IF NOT EXISTS "sales_capture_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(60) UNIQUE NOT NULL,
  "name" varchar(160) NOT NULL,
  "headline" varchar(200),
  "source_tag" varchar(40) DEFAULT 'form' NOT NULL,
  "redirect_url" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales_email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "html" text DEFAULT '' NOT NULL,
  "updated_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "template_id" uuid REFERENCES "sales_email_templates"("id") ON DELETE set null,
  "segment" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp,
  "sent_at" timestamp,
  "created_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_campaigns_status_idx" ON "sales_campaigns" USING btree ("status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "sales_campaign_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "sales_campaigns"("id") ON DELETE cascade,
  "contact_id" uuid REFERENCES "crm_contacts"("id") ON DELETE set null,
  "email" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "message_id" varchar(160),
  "error" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_campaign_recipients_unique_idx" ON "sales_campaign_recipients" USING btree ("campaign_id", "email");
CREATE INDEX IF NOT EXISTS "sales_campaign_recipients_status_idx" ON "sales_campaign_recipients" USING btree ("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "sales_campaign_recipients_msg_idx" ON "sales_campaign_recipients" USING btree ("message_id");

CREATE TABLE IF NOT EXISTS "sales_email_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid REFERENCES "sales_campaigns"("id") ON DELETE cascade,
  "recipient_id" uuid REFERENCES "sales_campaign_recipients"("id") ON DELETE cascade,
  "email" varchar(255) NOT NULL,
  "event" varchar(20) NOT NULL,
  "url" text,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sales_email_events_campaign_idx" ON "sales_email_events" USING btree ("campaign_id", "event");

CREATE TABLE IF NOT EXISTS "sales_suppressions" (
  "email" varchar(255) PRIMARY KEY NOT NULL,
  "reason" varchar(30) DEFAULT 'unsubscribed' NOT NULL,
  "source" varchar(60),
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "sales_capture_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_campaign_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_email_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_suppressions" ENABLE ROW LEVEL SECURITY;
