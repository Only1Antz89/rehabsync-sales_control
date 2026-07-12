#!/usr/bin/env node
/**
 * RehabSync internal-tools cron runner (deploy as a Railway Cron Job service).
 *
 * On each scheduled run it GETs every URL in CRON_TARGETS with an `Authorization: Bearer
 * <CRON_SECRET>` header. Those endpoints self-gate: a job paused in the app's /admin/automation
 * console simply no-ops, so this runner can keep ticking cheaply while you control the actual work
 * (and spend) from the UI.
 *
 * Env:
 *   CRON_SECRET   shared secret; must match each target app's CRON_SECRET
 *   CRON_TARGETS  comma- or newline-separated list of cron endpoint URLs
 *   CRON_TIMEOUT  per-request timeout ms (optional, default 55000)
 *
 * Exit code is non-zero if any target failed, so Railway surfaces the failure.
 */
const secret = process.env.CRON_SECRET;
const timeout = Number(process.env.CRON_TIMEOUT || 55000);
const targets = (process.env.CRON_TARGETS || '')
  .split(/[\n,]/)
  .map((s) => s.trim())
  .filter(Boolean);

if (!secret) {
  console.error('[cron] CRON_SECRET is not set');
  process.exit(1);
}
if (targets.length === 0) {
  console.error('[cron] CRON_TARGETS is empty');
  process.exit(1);
}

let failures = 0;
for (const url of targets) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(timeout),
    });
    const body = (await res.text()).slice(0, 300);
    const ms = Date.now() - started;
    console.log(`[cron] ${res.status} ${url} (${ms}ms) ${body}`);
    if (!res.ok) failures += 1;
  } catch (err) {
    failures += 1;
    console.error(`[cron] ERR ${url} ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`[cron] done — ${targets.length - failures}/${targets.length} ok`);
process.exit(failures > 0 ? 1 : 0);
