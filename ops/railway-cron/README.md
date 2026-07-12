# RehabSync internal-tools cron runner (Railway)

A tiny, dependency-free service that pings the Sales & Ads Centre scheduled-job endpoints on a
schedule. It exists because Vercel's Hobby plan can't run frequent crons. Deploy it as its **own
new Railway service**, separate from `@rs/api` / `@rs/worker`.

Each target endpoint is guarded two ways:
1. **`CRON_SECRET`** — the runner sends `Authorization: Bearer <CRON_SECRET>`; the endpoint rejects
   anything else.
2. **The in-app Automation controller** (`/admin/automation` in each app) — a job paused there
   no-ops even when pinged. That's your kill-switch for holding automation and controlling spend;
   this runner stays cheap because it only wakes, curls, and exits.

## One-time setup on Railway

1. **New service → Deploy from GitHub repo** → pick `rehabsync-sales_control`.
2. In the service's **Settings → Build**, set **Root Directory** to `ops/railway-cron`.
   Railway reads `railway.toml` here (Nixpacks build, `node run.mjs`, `*/15 * * * *` schedule,
   restart policy `never`).
3. In **Settings → Variables**, add:
   - `CRON_SECRET` — the **same** value set on both the Sales and Ads Vercel projects.
   - `CRON_TARGETS` — comma- or newline-separated list of endpoints, e.g.:
     ```
     https://salescentre.rehabsync.app/api/cron/run-sequences,
     https://salescentre.rehabsync.app/api/cron/send-campaigns,
     https://adscentre.rehabsync.app/api/cron/publish-due,
     https://adscentre.rehabsync.app/api/cron/send-newsletters,
     https://adscentre.rehabsync.app/api/cron/sync-metrics
     ```
4. Deploy. Confirm in the service **Logs** you see `[cron] 200 …` lines after the first tick, then
   check each app's **Automation** page for updated "Last run" timestamps.

## Cost & cadence notes

- A Railway **Cron Job** only runs for the few seconds each tick takes, so its own cost is minimal.
- `*/15 * * * *` (every 15 min) suits sequences / campaigns / scheduled posts, whose delays are
  day- or minute-granular. Change the schedule in `railway.toml` if you prefer.
- `sync-metrics` calls social APIs and is the heaviest job. If you want it less often, either drop
  its URL from `CRON_TARGETS` (and run a second cron service for it hourly) or just **Pause** it in
  the Ads Centre Automation page whenever you need to.
- To hold *all* automation without touching Railway, pause the jobs in each app's Automation page.

## Local test

```bash
CRON_SECRET=dev \
CRON_TARGETS="http://localhost:3000/api/cron/run-sequences" \
node run.mjs
```
