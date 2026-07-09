# RehabSync Sales Centre — agent working notes

## What this is
IntAillium's in-house sales lead-gen/CRM app at `salescentre.rehabsync.app` — the spin-out of the
RehabSync super-admin CRM console into a standalone tool (pipeline, lead capture, email marketing,
analytics). See BUILD_PLAN.md for the full design; build milestones in order, one PR per milestone.

## Non-negotiable rules
- **Shared DB, additive only**: this app connects to the SAME Supabase Postgres as the main
  RehabSync platform. It owns `sales_*` and shared `staff_*` tables. It may ADD columns to
  `crm_contacts`/`crm_activities` but must NEVER rename, retype, or drop anything the main app
  reads — the marketing-site demo-request flow and the admin CRM console keep working throughout.
- **Auth**: platform super-admins (`platform_admins.role = super_admin`, e.g.
  anthony@intaillium.com) get full access via the `rs_platform_session` cookie verified against
  `GET {REHABSYNC_API_URL}/api/v1/admin/auth/me`. Staff users live in shared `staff_users` +
  `staff_tool_roles` (tool `sales`, roles `admin`|`user`). Deny by default; audit every mutation
  to `sales_audit_logs`.
- **Email compliance (UK GDPR/PECR)**: suppression list enforced at send time, signed one-click
  unsubscribe that works logged out, company address in footers, no purchased lists.
- **No patient/clinical data** — CRM contacts are business leads (clinics), never patients.
- Migrations: manual idempotent SQL in `drizzle/`, tracked in `_sales_applied_migrations` (never
  touch the main app's `_rs_applied_migrations`). RLS enabled, no policies (owner connection).

## Stack & conventions (parity with the RehabSync monorepo)
- Next.js 15 App Router (full-stack — no separate API service), React 19, TypeScript strict
  (no `any`), Tailwind v4, Drizzle ORM + `postgres` driver, lucide-react, recharts.
- Env: `REHABSYNC_` prefix via `process.env['VAR']`. Currency: GBP pence integers.
- Branding: copied RehabSync tokens + UI kit in `src/components/ui/` (provenance noted) — teal
  `#0d9488` on navy `#102a43`, light/dark via CSS custom properties. Badge as "Sales Centre".
- Email: SMTP2GO HTTP API; webhooks verified with `REHABSYNC_SMTP2GO_WEBHOOK_SECRET`.
- Jobs: Vercel Cron → `/api/cron/*`, `CRON_SECRET` bearer-guarded.
- Tests: vitest for pure logic; `tsc --noEmit` + ESLint gate every PR.

## Sibling repos
- Main platform: `Only1Antz89/RehabSync` (source of the copied auth/crypto/UI patterns — see
  `apps/api/src/modules/platform-auth/`, `apps/api/src/common/crypto/encrypt.ts`,
  `packages/ui/src/`, `apps/web/src/app/globals.css`).
- Ads Centre: `Only1Antz89/rehabsync-ads_control` (shares the `staff_*` identity tables — keep
  migration 0001 DDL identical in both repos).
