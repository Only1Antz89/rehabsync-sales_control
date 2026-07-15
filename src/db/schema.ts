import {
  boolean,
  date,
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
    // Columns below are ADDITIVE, owned by this app (migrations 0003, 0005).
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    utm: jsonb('utm').$type<Record<string, string>>(),
    sourceDetail: varchar('source_detail', { length: 160 }),
    lastContactedAt: timestamp('last_contacted_at'),
    companyId: uuid('company_id'),
    // User-defined custom field values, keyed by sales_custom_fields.key (migration 0008).
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('crm_contacts_stage_idx').on(table.stage),
    index('crm_contacts_email_idx').on(table.email),
    index('crm_contacts_company_idx').on(table.companyId),
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

// Companies (accounts) — the clinic/organisation a set of contacts and deals belongs to.
export const salesCompanies = pgTable(
  'sales_companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    domain: varchar('domain', { length: 255 }),
    website: varchar('website', { length: 500 }),
    industry: varchar('industry', { length: 120 }),
    size: varchar('size', { length: 40 }),
    phone: varchar('phone', { length: 40 }),
    address: text('address'),
    ownerName: varchar('owner_name', { length: 120 }),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    notes: text('notes'),
    // Set when a won deal for this company provisions a platform tenant (migration 0010).
    tenantId: uuid('tenant_id'),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('sales_companies_name_idx').on(table.name)],
);

// ── Won-deal → tenant provisioning bridge (links Sales to Admin Centre / the platform) ──
export const TENANT_PROVISION_STATUSES = ['pending', 'provisioned', 'failed'] as const;
export type TenantProvisionStatus = (typeof TENANT_PROVISION_STATUSES)[number];

export const salesTenantProvisions = pgTable(
  'sales_tenant_provisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id').references(() => salesDeals.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id'),
    companyId: uuid('company_id'),
    clinicName: varchar('clinic_name', { length: 200 }).notNull(),
    billingEmail: varchar('billing_email', { length: 255 }).notNull(),
    tenantId: uuid('tenant_id'),
    tenantSlug: varchar('tenant_slug', { length: 200 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    error: text('error'),
    requestedBy: varchar('requested_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    provisionedAt: timestamp('provisioned_at'),
  },
  (table) => [uniqueIndex('sales_tenant_provisions_deal_idx').on(table.dealId)],
);

// Deals (opportunities) — first-class revenue objects, separate from a contact's lifecycle stage.
export const DEAL_STAGES = ['qualification', 'discovery', 'proposal', 'negotiation'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const salesDeals = pgTable(
  'sales_deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    companyId: uuid('company_id').references(() => salesCompanies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
    stage: varchar('stage', { length: 30 }).notNull().default('qualification'),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    amountPence: integer('amount_pence').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('GBP'),
    probability: integer('probability'),
    expectedCloseDate: date('expected_close_date'),
    source: varchar('source', { length: 40 }),
    ownerName: varchar('owner_name', { length: 120 }),
    lostReason: text('lost_reason'),
    createdBy: varchar('created_by', { length: 255 }),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('sales_deals_stage_status_idx').on(table.status, table.stage),
    index('sales_deals_company_idx').on(table.companyId),
    index('sales_deals_contact_idx').on(table.contactId),
  ],
);

// Tracked 1:1 emails to a contact (distinct from bulk campaigns). SMTP2GO events update status.
export const salesEmails = pgTable(
  'sales_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    toEmail: varchar('to_email', { length: 255 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('sent'),
    messageId: varchar('message_id', { length: 160 }),
    error: text('error'),
    createdBy: varchar('created_by', { length: 255 }),
    sentAt: timestamp('sent_at'),
    openedAt: timestamp('opened_at'),
    clickedAt: timestamp('clicked_at'),
    // Two-way email (migration 0011): 'outbound' (sent by us) | 'inbound' (a contact's reply).
    direction: varchar('direction', { length: 10 }).notNull().default('outbound'),
    fromEmail: varchar('from_email', { length: 255 }),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    inReplyTo: varchar('in_reply_to', { length: 255 }),
    receivedAt: timestamp('received_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('sales_emails_contact_idx').on(table.contactId),
    index('sales_emails_msg_idx').on(table.messageId),
    index('sales_emails_direction_idx').on(table.contactId, table.direction),
  ],
);

// Sequences (cadences) — an ordered list of steps run against enrolled contacts on a schedule.
export interface SequenceStep {
  type: 'email' | 'task';
  delayDays: number; // days after the previous step (or enrolment) before this step runs
  templateId?: string | null; // email steps: use a template…
  subject?: string; // …or an inline subject/body
  html?: string;
  taskTitle?: string; // task steps
}

export const salesSequences = pgTable('sales_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  active: boolean('active').notNull().default(true),
  steps: jsonb('steps').$type<SequenceStep[]>().default([]).notNull(),
  enrollOnStage: varchar('enroll_on_stage', { length: 30 }),
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const SEQUENCE_ENROLLMENT_STATUSES = ['active', 'completed', 'stopped'] as const;
export type SequenceEnrollmentStatus = (typeof SEQUENCE_ENROLLMENT_STATUSES)[number];

export const salesSequenceEnrollments = pgTable(
  'sales_sequence_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sequenceId: uuid('sequence_id')
      .notNull()
      .references(() => salesSequences.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    currentStep: integer('current_step').notNull().default(0),
    nextRunAt: timestamp('next_run_at'),
    lastError: text('last_error'),
    enrolledBy: varchar('enrolled_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('sales_seq_enroll_unique_idx').on(table.sequenceId, table.contactId),
    index('sales_seq_enroll_due_idx').on(table.status, table.nextRunAt),
  ],
);

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

// ── P4: Custom fields (admin-defined fields on a contact) ──────────────────────────────
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const salesCustomFields = pgTable(
  'sales_custom_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entity: varchar('entity', { length: 20 }).notNull().default('contact'),
    key: varchar('key', { length: 60 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    type: varchar('type', { length: 20 }).notNull().default('text'),
    options: jsonb('options').$type<string[]>().default([]).notNull(), // for `select`
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('sales_custom_fields_entity_key_idx').on(table.entity, table.key)],
);

// ── P4: Saved reports (ad-hoc report builder over contacts/deals) ───────────────────────
export const REPORT_ENTITIES = ['contact', 'deal'] as const;
export type ReportEntity = (typeof REPORT_ENTITIES)[number];

export const REPORT_METRICS = ['count', 'sum_value'] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export interface ReportConfig {
  entity: ReportEntity;
  metric: ReportMetric;
  groupBy: string; // dimension key (see lib/reports.ts DIMENSIONS)
  stages?: string[]; // optional stage/status filter
  owner?: string | null; // optional owner filter
  sinceDays?: number | null; // only rows created within the last N days
}

export const salesReports = pgTable('sales_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  config: jsonb('config').$type<ReportConfig>().notNull(),
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Cron controller: per-job enable switch + last-run telemetry (managed in /admin/automation) ──
export const salesCronJobs = pgTable('sales_cron_jobs', {
  key: varchar('key', { length: 40 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at'),
  lastStatus: varchar('last_status', { length: 20 }),
  lastDetail: jsonb('last_detail').$type<Record<string, unknown>>(),
  updatedBy: varchar('updated_by', { length: 255 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
