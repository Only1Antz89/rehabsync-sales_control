# Sales Centre — deployment & integration runbook

Standalone Next.js app at **https://salescentre.rehabsync.app**, sharing the main platform's
Supabase Postgres and working directly on the platform's `crm_contacts` data (additive columns
only). All application code is complete (M0–M3); everything below is wiring.

## 1. One-time platform prerequisites (main RehabSync repo)

Merge the integration changes (branch `claude/rehabsync-equipment-mvp-5eww8m`), which provide:
- `rs_platform_session` cookie spanning `.rehabsync.app` in production (override with
  `REHABSYNC_PLATFORM_COOKIE_DOMAIN` on the API if ever needed) → super-admin SSO into this tool.
- `salescentre` reserved in the tenant-subdomain middleware.
- Admin sidebar "Internal tools" links (`NEXT_PUBLIC_SALES_CENTRE_URL`, defaults to the prod URL)
  and the "CRM has moved to the Sales Centre" banner on the old admin CRM console.

## 2. Vercel project

1. Import `Only1Antz89/rehabsync-sales_control`, framework Next.js, root `/`.
2. Attach domain `salescentre.rehabsync.app`; DNS: CNAME `salescentre` → `cname.vercel-dns.com`.
3. Scheduled sending — see **Scheduled jobs** below (external trigger on Hobby).

## 3. Environment variables (see `.env.example`)

| Variable | Notes |
|---|---|
| `REHABSYNC_DATABASE_URL` | Supabase **pooler** string (same DB as the platform) |
| `REHABSYNC_API_URL` | `https://api.rehabsync.app` — verifies super-admin SSO |
| `REHABSYNC_NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | `https://salescentre.rehabsync.app` (used in unsubscribe links) |
| `REHABSYNC_SESSION_SECRET` | random 32+ chars |
| `REHABSYNC_SALES_UNSUBSCRIBE_SECRET` | random 32+ chars — signs one-click unsubscribe links |
| `CRON_SECRET` | random — Vercel sends it as the cron Authorization bearer |
| `REHABSYNC_SMTP2GO_API_KEY` | campaign sending |
| `REHABSYNC_SMTP2GO_WEBHOOK_SECRET` | shared secret for the events webhook |
| `REHABSYNC_EMAIL_SENDER` | e.g. `RehabSync Sales <mail@rehabsync.app>` (SMTP2GO-verified domain) |
| `REHABSYNC_COMPANY_ADDRESS` | shown in the compliance footer |

## 4. Database

```bash
REHABSYNC_DATABASE_URL=<pooler-url> pnpm db:deploy   # applies drizzle/0001..0004, idempotent
pnpm staff:create -- --email <email> --name "<name>" --password '<pw>' --role admin
```

Notes:
- The chain only **adds** to `crm_contacts` (tags/utm/source_detail/last_contacted_at) — it never
  renames, retypes or drops anything the main app reads.
- `staff_*` tables are shared with Ads Centre (identical DDL — whichever repo migrates first
  creates them). Platform super-admins never need a staff account.

## Scheduled jobs (Vercel Hobby)

The campaign sender (`/api/cron/send-campaigns`) needs to run every few minutes. **Vercel's Hobby
plan runs cron jobs at most once per day**, which is too infrequent, so there is no `vercel.json`
in this repo — drive the job with an external scheduler hitting the secured endpoint:

- **Endpoint:** `GET https://salescentre.rehabsync.app/api/cron/send-campaigns`
- **Header:** `Authorization: Bearer <CRON_SECRET>`
- **Frequency:** every ~5 minutes
- Use any scheduler — [cron-job.org](https://cron-job.org), EasyCron, or a GitHub Actions
  `schedule` workflow. The endpoint is idempotent and safe to call when there's nothing due.

**On Vercel Pro** you can instead let Vercel run it — add `vercel.json`:

```json
{ "crons": [ { "path": "/api/cron/send-campaigns", "schedule": "*/5 * * * *" } ] }
```

## 5. SMTP2GO

- Verify the sender domain (SPF/DKIM), e.g. `mail.rehabsync.app`.
- Add an events webhook → `https://salescentre.rehabsync.app/api/webhooks/smtp2go?secret=<REHABSYNC_SMTP2GO_WEBHOOK_SECRET>`
  for delivered/open/click/bounce/spam/unsubscribe.

## 6. Post-deploy smoke test

1. `https://salescentre.rehabsync.app/api/health` → 200.
2. Log into `admin.rehabsync.app` as a super-admin, then open the Sales Centre — the dashboard
   must load with no second login (SSO via the shared cookie), showing the live CRM contacts.
3. Staff login works; a `user`-role account sees no Administration group.
4. Public capture form (`/f/<slug>`) creates a contact that appears in the pipeline.
5. Send a campaign to a one-contact segment; the report shows the send, and open/click events
   arrive via the webhook. One-click unsubscribe works logged-out and suppresses the address.
6. The old admin CRM console shows the "moved to Sales Centre" banner and both consoles see the
   same contact records.
