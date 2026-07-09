# RehabSync Sales Centre

IntAillium's in-house sales lead-generation & CRM tool — the spin-out of the RehabSync
super-admin CRM into a standalone app at **salescentre.rehabsync.app**.

- Pipeline & contact management (extends the platform's existing `crm_contacts` data in place)
- Lead capture (hosted/embeddable forms, CSV import, marketing-site demo requests)
- Email marketing (templates, segments, campaigns via SMTP2GO, open/click tracking, suppression)
- Sales analytics (funnel, sources, pipeline value, campaign performance)
- Access: RehabSync platform super-admins via SSO + per-tool `admin`/`user` staff accounts

**Start here → [BUILD_PLAN.md](./BUILD_PLAN.md)** (full architecture, data model, milestones).
Agent conventions → [CLAUDE.md](./CLAUDE.md).

Stack: Next.js 15 · React 19 · TypeScript (strict) · Tailwind v4 · Drizzle ORM · shared
RehabSync Supabase Postgres · Vercel.

## Running locally

```bash
pnpm install
cp .env.example .env           # fill in REHABSYNC_DATABASE_URL (+ REHABSYNC_API_URL for SSO)
pnpm db:deploy                 # applies drizzle/*.sql, tracked in _sales_applied_migrations
pnpm staff:create -- --email you@intaillium.com --name "You" --password 'changeme-now' --role admin
pnpm dev                       # http://localhost:3000
```

Platform super-admins (e.g. anthony@intaillium.com) need no staff account — with
`REHABSYNC_API_URL` set and the platform session cookie on `.rehabsync.app`, they are signed in
automatically with full access.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
