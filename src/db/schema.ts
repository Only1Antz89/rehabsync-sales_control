import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ── Shared staff identity (owned jointly with Ads Centre; DDL in drizzle/0001) ─────────

export const STAFF_TOOLS = ['sales', 'ads'] as const;
export type StaffTool = (typeof STAFF_TOOLS)[number];

export const STAFF_ROLES = ['admin', 'user'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).unique().notNull(),
    tool: varchar('tool', { length: 20 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    lastSeenAt: timestamp('last_seen_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('staff_sessions_user_idx').on(table.userId),
    index('staff_sessions_expires_idx').on(table.expiresAt),
  ],
);

export const staffToolRoles = pgTable(
  'staff_tool_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    tool: varchar('tool', { length: 20 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('staff_tool_roles_user_tool_idx').on(table.userId, table.tool)],
);

// ── Existing platform CRM tables (owned by the main RehabSync repo — mapped read/write,
//    NEVER migrated from this app; column defs mirror packages/db/src/schema/crm.ts) ────

export const CRM_STAGES = [
  'new',
  'contacted',
  'demo_scheduled',
  'demo_completed',
  'onboarding',
  'customer',
  'churned',
  'lost',
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export const crmContacts = pgTable(
  'crm_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    clinicName: varchar('clinic_name', { length: 200 }),
    stage: varchar('stage', { length: 30 }).default('new').notNull(),
    source: varchar('source', { length: 40 }).default('demo_request').notNull(),
    ownerName: varchar('owner_name', { length: 120 }),
    estimatedValuePence: integer('estimated_value_pence'),
    message: text('message'),
    scheduledAt: timestamp('scheduled_at'),
    meetingUrl: varchar('meeting_url', { length: 500 }),
    // Plain uuid (no FK import) — tenants is a main-platform table.
    tenantId: uuid('tenant_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('crm_contacts_stage_idx').on(table.stage),
    index('crm_contacts_email_idx').on(table.email),
  ],
);

export const crmActivities = pgTable(
  'crm_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 30 }).notNull(),
    body: text('body'),
    actorName: varchar('actor_name', { length: 120 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('crm_activities_contact_idx').on(table.contactId)],
);

// ── Sales Centre tables (owned by this repo; DDL lands in migration 0002 at M1) ────────

export const salesAuditLogs = pgTable(
  'sales_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorEmail: varchar('actor_email', { length: 255 }).notNull(),
    actorKind: varchar('actor_kind', { length: 30 }).notNull(),
    action: varchar('action', { length: 60 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('sales_audit_logs_created_idx').on(table.createdAt)],
);
