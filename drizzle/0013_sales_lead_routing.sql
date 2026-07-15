-- Lead routing: auto-assign an owner to unowned inbound leads (capture-form submissions),
-- round-robin across a configured pool. Single-row config table (id is pinned to 1).

CREATE TABLE IF NOT EXISTS "sales_routing" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "enabled" boolean NOT NULL DEFAULT false,
  "strategy" varchar(20) NOT NULL DEFAULT 'round_robin',
  "pool" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cursor" integer NOT NULL DEFAULT 0,
  "updated_by" varchar(255),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "sales_routing_singleton" CHECK ("id" = 1)
);
INSERT INTO "sales_routing" ("id") VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE "sales_routing" ENABLE ROW LEVEL SECURITY;
