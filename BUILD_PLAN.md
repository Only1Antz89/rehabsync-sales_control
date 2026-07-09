# RehabSync Sales Centre — Build Plan

**Repo:** `Only1Antz89/rehabsync-sales_control` · **URL:** `https://salescentre.rehabsync.app`
**What it is:** IntAillium's in-house sales lead-generation and CRM tool — a standalone app that
spins the existing super-admin CRM console out of RehabSync into a full sales workspace with lead
capture, pipeline management, email marketing, and analytics.

---

## 1. Context & goals

RehabSync's super-admin panel has a minimal CRM today (`crm_contacts` + `crm_activities` tables, a
~250-line API module and one console page). Sales work has outgrown it. This app takes over the CRM
domain and extends it into a proper lead-gen tool, while the main RehabSync platform keeps feeding
it (marketing-site demo requests already insert into `crm_contacts`).

Sister app: **Ads Centre** (`rehabsync-ads_control` → `adscentre.rehabsync.app`) for social
publishing + newsletters. Both apps share the same foundations (§3) — keep them consistent.

### Locked decisions
1. **Shared Supabase Postgres** with the main RehabSync platform. New tables use the `sales_*`
   prefix (plus shared `staff_*` identity tables). Existing `crm_contacts`, `crm_activities`,
   `platform_admins`, `platform_admin_sessions` are reused in place — a true spin-out, no data
   migration.
2. **Standalone full-stack Next.js app** (no NestJS API of its own): route handlers + server
   components talk to Postgres via Drizzle.
3. **SMTP2GO** for all campaign email (already RehabSync's transactional provider). We build the
   campaign/list/suppression layer ourselves (required for UK GDPR/PECR anyway).
4. **`anthony@intaillium.com` works day one**: any `platform_admins` row with role `super_admin`
   gets automatic super-admin access via SSO (§4). No seeding needed.

## 2. Stack (parity with RehabSync)

Next.js 15 App Router · React 19 · TypeScript strict (no `any`) · Tailwind v4 · Drizzle ORM
(`drizzle-orm` ^0.45, `postgres` driver → Supabase pooler) · lucide-react · recharts for analytics.
Conventions: currency GBP as pence integers; env vars `REHABSYNC_` prefix via `process.env['VAR']`;
manual SQL migrations (§10).

## 3. Architecture

```
salescentre.rehabsync.app ──► Vercel project (this repo)
adscentre.rehabsync.app  ──► Vercel project (ads_control)
admin.rehabsync.app      ──► main RehabSync web app
        │                         │
        └──────► shared Supabase Postgres ◄──────┘
                 crm_* (existing) · sales_* (this app) · ads_* · staff_* (shared)
                 platform_admins / platform_admin_sessions (SSO)
```

- DNS: `salescentre` CNAME → Vercel. The main app's middleware must reserve the subdomain so no
  clinic tenant can claim it (§11).
- Background jobs: **Vercel Cron** → `/api/cron/*` route handlers guarded by a `CRON_SECRET`
  bearer check. No Redis/queues needed at this scale.
- File/media storage: none needed for MVP (email images by URL); revisit if template assets needed
  (Supabase Storage bucket `sales-assets`).

## 4. Identity & access

Two ways in, one guard (`lib/auth.ts`, used by middleware + every route handler):

1. **Platform super-admin SSO.** The main API's session cookie `rs_platform_session` is widened to
   `Domain=.rehabsync.app` (main-repo change, §11). This app forwards the cookie to
   `GET {REHABSYNC_API_URL}/api/v1/admin/auth/me` (same pattern as the main web app's
   `admin-route-proxy.ts:requireAdminSession`). Role `super_admin` → full access to everything,
   including user management. This is how `anthony@intaillium.com` gets in by default.
2. **Staff login (tool users).** Local email+password auth mirroring
   `apps/api/src/modules/platform-auth/platform-auth.service.ts` in the main repo: bcrypt password
   hash, opaque 32-byte token, sha256 token hash stored server-side, httpOnly cookie
   `rs_sales_session`.

**Shared identity tables** (`staff_*`, shared with Ads Centre — DDL is idempotent
`CREATE TABLE IF NOT EXISTS` and shipped in both repos' migration 0001):
- `staff_users` — id, email (unique), password_hash, name, status(active|disabled), timestamps
- `staff_sessions` — id, user_id, token_hash (unique), expires_at, last_seen_at
- `staff_tool_roles` — user_id, tool(`sales`|`ads`), role(`admin`|`user`), unique(user_id, tool)

**RBAC (this tool):**
| Capability | user | admin | super_admin |
|---|---|---|---|
| View pipeline/contacts/analytics, work leads, add notes/tasks | ✓ | ✓ | ✓ |
| Draft campaigns & templates | ✓ | ✓ | ✓ |
| Send/schedule campaigns | — | ✓ | ✓ |
| Manage capture forms, senders, settings | — | ✓ | ✓ |
| Invite/disable users, set roles | — | ✓ | ✓ |
| View audit log; manage suppressions | — | ✓ | ✓ |

Every mutation writes `sales_audit_logs` (actor, action, entity, metadata — same shape as
RehabSync's `equipment_audit_logs`).

## 5. Branding

RehabSync look-and-feel, badged **"RehabSync Sales Centre"**:
- Copy the CSS custom-property tokens from `apps/web/src/app/globals.css` (light/dark:
  `--brand-primary #0d9488`, `--brand-secondary #102a43`, `--bg-card`, `--text-*`, etc.).
- Copy the small UI kit from `packages/ui/src` (Button, Card, Badge, Input — ~200 lines) into
  `src/components/ui/` and the `RehabSyncWordmark` + dark-sidebar shell pattern from
  `apps/web/src/app/(platform)/Sidebar.tsx`.
- These are deliberate copies (repos are decoupled); note provenance in a comment.

## 6. Data model (new tables, `sales_*`)

- `sales_tasks` — contact_id→crm_contacts, assignee (staff/admin ref by email), type(call|email|todo),
  title, due_at, status(open|done|cancelled), timestamps. Index (status, due_at).
- `sales_capture_forms` — id, slug/token (public), name, headline, fields jsonb, source_tag,
  redirect_url, active, created_by, timestamps.
- `sales_email_templates` — id, name, subject, html, text, merge-tag docs, updated_by, timestamps.
- `sales_campaigns` — id, name, template_id, segment jsonb (filter snapshot), status(draft|
  scheduled|sending|sent|cancelled), scheduled_at, sent_at, created_by, counts (denormalised),
  timestamps.
- `sales_campaign_recipients` — campaign_id, contact_id, email, status(pending|sent|delivered|
  opened|clicked|bounced|failed|unsubscribed), message_id, updated_at. Unique(campaign_id, contact_id).
- `sales_email_events` — id, campaign_id?, recipient_id?, email, event(sent|delivered|open|click|
  bounce|spam|unsub), url?, raw jsonb, created_at. (Fed by the SMTP2GO webhook.)
- `sales_suppressions` — email (unique), reason(unsubscribed|bounced|manual|spam), source, created_at.
- `sales_audit_logs` — actor_email, actor_kind(staff|platform_admin), action, entity_type,
  entity_id?, metadata jsonb, created_at.

**Additive columns on the existing `crm_contacts`** (safe for the main app — it selects explicit
columns): `tags jsonb default '[]'`, `utm jsonb`, `source_detail varchar(160)`,
`last_contacted_at timestamp`. Never rename/retype existing columns — the main platform's
demo-request flow and admin console still write/read them during the transition.

## 7. Feature modules

### 7.1 CRM spin-out (parity + upgrade) — M1
- **Pipeline kanban** over the existing stages (`new → contacted → demo_scheduled → demo_completed
  → onboarding → customer`, plus `churned`/`lost` columns collapsed). Drag between stages writes a
  `crm_activities` `stage_change` row (same convention the main console uses today).
- **Contact list** with filters (stage, source, owner, tag, free-text) + CSV export.
- **Contact detail**: profile, estimated value, owner, tags; activity timeline (`crm_activities`);
  quick actions (note, schedule call w/ meeting URL, log email); linked tenant (when they convert —
  `crm_contacts.tenant_id` already exists).
- **Tasks**: due-today panel, per-contact follow-ups, overdue nudges on the dashboard.

### 7.2 Lead generation — M1/M2
- **Hosted capture forms**: public page `/f/[slug]` + embeddable `<script>`/iframe snippet; posts
  create `crm_contacts` (source = form's source_tag, `utm` captured), rate-limited + honeypot.
- **CSV import** with column mapping and email-dedupe (merge into existing contacts).
- **Existing ingress unchanged**: the marketing site's demo-request POST (main API `POST
  /api/v1/crm`) keeps writing `crm_contacts` — Sales Centre sees new demo requests instantly.

### 7.3 Email marketing — M2
- **Templates**: rich-text/markdown editor with merge tags (`{{name}}`, `{{clinic_name}}`) and
  plain-text alternative; test-send to self.
- **Segments**: saved filters over contacts (stage/source/tags/last-contacted).
- **Campaigns**: pick template + segment → preview audience (suppressions excluded) → send now or
  schedule. Sending runs in cron batches via the SMTP2GO HTTP API; per-recipient **signed
  unsubscribe link** → `/unsubscribe/[token]` → `sales_suppressions`.
- **Tracking**: SMTP2GO webhook → `POST /api/webhooks/smtp2go` (shared-secret verified) →
  `sales_email_events` + recipient status rollups; bounces/spam auto-suppress.
- **Compliance (UK GDPR/PECR)**: business-contact basis documented per contact source; company
  address + unsubscribe in every footer; suppression enforced at send time; no purchased lists.

### 7.4 Analytics — M1 basic, M3 full
Dashboard (recharts): funnel by stage + stage-conversion %, time-in-stage; leads by source/UTM over
time; pipeline value (sum `estimated_value_pence` by stage) and won value per month; campaign
performance (delivered/open/click/unsub rates); owner leaderboard (activities logged).

### 7.5 Admin area — M1 (users) / M3 (rest)
User management (invite by email → set-password link via SMTP2GO, role assignment, disable);
settings (sender identity/reply-to, default footer, signature); suppression-list viewer; audit log.

## 8. App layout (routes)

```
/login                      staff login (+ "Platform admin? You're already signed in" SSO path)
/dashboard                  KPIs, due tasks, recent leads, campaign snapshots
/pipeline                   kanban
/contacts                   list · /contacts/[id] detail
/tasks                      my tasks / all (admin)
/campaigns                  list · /campaigns/new · /campaigns/[id] (report)
/templates                  list/editor
/forms                      capture forms · public: /f/[slug]
/analytics                  full dashboards
/admin                      users · settings · suppressions · audit  (admin+)
/api/cron/send-campaigns    batch sender (CRON_SECRET)
/api/webhooks/smtp2go       event ingest
/unsubscribe/[token]        public one-click unsubscribe
```

## 9. Environment variables

```
REHABSYNC_DATABASE_URL          Supabase pooler connection string (same DB as main app)
REHABSYNC_API_URL               main API origin (SSO verify), e.g. https://api.rehabsync.app
REHABSYNC_SMTP2GO_API_KEY       sending
REHABSYNC_SMTP2GO_WEBHOOK_SECRET  webhook verification
REHABSYNC_SALES_SESSION_SECRET  cookie signing for staff sessions
REHABSYNC_ENCRYPTION_KEY        AES-256-GCM at-rest secrets (copy apps/api/src/common/crypto/encrypt.ts)
CRON_SECRET                     Vercel cron auth
NEXT_PUBLIC_APP_URL             https://salescentre.rehabsync.app
```

## 10. Migrations

Manual SQL files in `drizzle/` applied by a copy of the main repo's
`packages/db/src/deploy-migrate.ts` runner with tracking table `_sales_applied_migrations`
(never touches the main app's `_rs_applied_migrations`). Each file idempotent. Order:
- `0001_staff_identity.sql` (shared `staff_*` — `IF NOT EXISTS`, identical DDL to ads repo's 0001)
- `0002_sales_core.sql` (tasks, capture forms, audit; `crm_contacts` additive columns)
- `0003_sales_email.sql` (templates, campaigns, recipients, events, suppressions)
All tables `ENABLE ROW LEVEL SECURITY` (no policies — app connects as owner; matches main repo).

## 11. Main-repo integration (single small PR on `Only1Antz89/RehabSync`)

1. `apps/api/src/modules/platform-auth/platform-auth.controller.ts` — set the session cookie with
   `domain: process.env['REHABSYNC_SESSION_COOKIE_DOMAIN']` when configured (`.rehabsync.app` in
   prod; unset locally → host-only, no behaviour change). Apply to login + logout clear.
2. `apps/web/middleware.ts` — `RESERVED_SUBDOMAINS` += `'salescentre', 'adscentre'`.
3. `apps/web/src/app/(admin)/AdminSidebar.tsx` — external links to both tools.
4. `(admin)/admin/crm` console — banner "CRM has moved to Sales Centre" + link; keep read-only
   during transition; remove after cutover (M3).

## 12. External prerequisites (Anthony)

- DNS: `salescentre.rehabsync.app` CNAME → `cname.vercel-dns.com`.
- Vercel: project linked to this repo, domain attached, env vars set, crons enabled.
- SMTP2GO: dedicated sender domain (e.g. `mail.rehabsync.app`) with SPF/DKIM verified; webhook
  pointed at `https://salescentre.rehabsync.app/api/webhooks/smtp2go`.

## 13. Milestones & acceptance

- **M0 Foundations**: repo scaffold, brand kit, migrations 0001, auth (SSO + staff login + RBAC),
  deployed on the subdomain, `/health` green. *Accept: anthony@intaillium.com opens the dashboard
  with no extra signup; a staff `user` can log in and is blocked from /admin.*
- **M1 CRM MVP**: pipeline kanban, contacts, detail + timeline, tasks, basic dashboard. *Accept:
  a demo request submitted on the marketing site appears in the pipeline; stage drag writes an
  activity; existing admin console still works.*
- **M2 Lead-gen + Email**: capture forms + CSV import; templates, segments, campaigns, webhook
  tracking, unsubscribe/suppression. *Accept: a test campaign to a segment delivers, records open/
  click events, and honours an unsubscribe on the next send.*
- **M3 Analytics + Admin polish**: full dashboards, user management UI, audit log, suppressions
  viewer; main-repo integration PR merged; admin CRM console banner.
- Every milestone: `tsc --noEmit` clean, ESLint clean, vitest for pure logic (segment filters,
  merge-tag rendering, unsubscribe tokens, suppression enforcement).

## 14. Non-negotiables

- No patient/clinical data in this tool — CRM contacts are business leads (clinic staff), never
  RehabSync patients.
- Suppression respected at send time, always; one-click unsubscribe works logged-out.
- Additive-only changes to `crm_*` tables while the main admin console still uses them.
- Secrets encrypted at rest; webhooks verified; public endpoints rate-limited.
