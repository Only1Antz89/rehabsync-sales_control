import {
  boolean,
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
    // Columns below are ADDITIVE, owned by this app (migration 0003).
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    utm: jsonb('utm').$type<Record<string, string>>(),
    sourceDetail: varchar('source_detail', { length: 160 }),
    lastContactedAt: timestamp('last_contacted_at'),
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

// ── Sales Centre tables (owned by this repo) ───────────────────────────────────────────

export const SALES_TASK_TYPES = ['call', 'email', 'todo'] as const;
export type SalesTaskType = (typeof SALES_TASK_TYPES)[number];

export const SALES_TASK_STATUSES = ['open', 'done', 'cancelled'] as const;
export type SalesTaskStatus = (typeof SALES_TASK_STATUSES)[number];

export const salesTasks = pgTable(
  'sales_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id').references(() => crmContacts.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    type: varchar('type', { length: 20 }).notNull().default('todo'),
    assigneeEmail: varchar('assignee_email', { length: 255 }),
    dueAt: timestamp('due_at'),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    createdBy: varchar('created_by', { length: 255 }),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('sales_tasks_status_due_idx').on(table.status, table.dueAt),
    index('sales_tasks_contact_idx').on(table.contactId),
  ],
);

/** Audience filter stored on a campaign: empty arrays / missing keys mean "no filter". */
export interface CampaignSegment {
  stages?: string[];
  tags?: string[];
  sources?: string[];
}

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const salesCaptureForms = pgTable('sales_capture_forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 60 }).unique().notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  headline: varchar('headline', { length: 200 }),
  sourceTag: varchar('source_tag', { length: 40 }).notNull().default('form'),
  redirectUrl: text('redirect_url'),
  active: boolean('active').notNull().default(true),
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const salesEmailTemplates = pgTable('sales_email_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  html: text('html').notNull().default(''),
  updatedBy: varchar('updated_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const salesCampaigns = pgTable(
  'sales_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    templateId: uuid('template_id').references(() => salesEmailTemplates.id, { onDelete: 'set null' }),
    segment: jsonb('segment').$type<CampaignSegment>().default({}).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    scheduledAt: timestamp('scheduled_at'),
    sentAt: timestamp('sent_at'),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('sales_campaigns_status_idx').on(table.status, table.scheduledAt)],
);

export const salesCampaignRecipients = pgTable(
  'sales_campaign_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => salesCampaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    messageId: varchar('message_id', { length: 160 }),
    error: text('error'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('sales_campaign_recipients_unique_idx').on(table.campaignId, table.email),
    index('sales_campaign_recipients_status_idx').on(table.campaignId, table.status),
    index('sales_campaign_recipients_msg_idx').on(table.messageId),
  ],
);

export const salesEmailEvents = pgTable(
  'sales_email_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').references(() => salesCampaigns.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').references(() => salesCampaignRecipients.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    event: varchar('event', { length: 20 }).notNull(),
    url: text('url'),
    raw: jsonb('raw').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('sales_email_events_campaign_idx').on(table.campaignId, table.event)],
);

export const salesSuppressions = pgTable('sales_suppressions', {
  email: varchar('email', { length: 255 }).primaryKey(),
  reason: varchar('reason', { length: 30 }).notNull().default('unsubscribed'),
  source: varchar('source', { length: 60 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
