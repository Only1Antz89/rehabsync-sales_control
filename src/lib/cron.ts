import { eq } from 'drizzle-orm';
import { getDb, salesCronJobs } from '@/db';
import { processSequences } from './sequences';
import { processCampaigns } from './campaigns';
import { evaluateSla } from './sla';

export interface CronJobMeta {
  key: string;
  label: string;
  description: string;
}

/** The scheduled jobs this app exposes. Keys match rows seeded in migration 0009. */
export const CRON_JOBS: CronJobMeta[] = [
  { key: 'sequences', label: 'Sequences', description: 'Advance due sequence steps (automated emails + follow-up tasks).' },
  { key: 'campaigns', label: 'Campaigns', description: 'Send the next batch of scheduled email campaigns.' },
  { key: 'sla', label: 'SLA checks', description: 'Flag new leads left unanswered past the first-response threshold.' },
];

const RUNNERS: Record<string, () => Promise<Record<string, unknown>>> = {
  sequences: async () => processSequences(),
  campaigns: async () => processCampaigns(),
  sla: async () => evaluateSla(),
};

export function isKnownJob(key: string): key is string {
  return Object.prototype.hasOwnProperty.call(RUNNERS, key);
}

type JobRow = typeof salesCronJobs.$inferSelect;

async function ensureRow(key: string): Promise<JobRow | null> {
  const db = getDb();
  const [existing] = await db.select().from(salesCronJobs).where(eq(salesCronJobs.key, key)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(salesCronJobs)
    .values({ key })
    .onConflictDoNothing({ target: salesCronJobs.key })
    .returning();
  if (created) return created;
  const [row] = await db.select().from(salesCronJobs).where(eq(salesCronJobs.key, key)).limit(1);
  return row ?? null;
}

/** Jobs with their live state, for the admin console. Seeds any missing rows. */
export async function listCronJobs(): Promise<(CronJobMeta & { enabled: boolean; lastRunAt: Date | null; lastStatus: string | null; lastDetail: Record<string, unknown> | null })[]> {
  const out = [];
  for (const meta of CRON_JOBS) {
    const row = await ensureRow(meta.key);
    out.push({
      ...meta,
      enabled: row?.enabled ?? true,
      lastRunAt: row?.lastRunAt ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastDetail: row?.lastDetail ?? null,
    });
  }
  return out;
}

export async function setCronEnabled(key: string, enabled: boolean, actorEmail: string): Promise<boolean> {
  if (!isKnownJob(key)) return false;
  await ensureRow(key);
  await getDb()
    .update(salesCronJobs)
    .set({ enabled, updatedBy: actorEmail, updatedAt: new Date() })
    .where(eq(salesCronJobs.key, key));
  return true;
}

/** Run a job now and record the outcome. Ignores the enabled flag (used by the manual admin trigger). */
export async function runJob(key: string): Promise<{ ok: boolean; detail?: Record<string, unknown>; error?: string }> {
  const runner = RUNNERS[key];
  if (!runner) return { ok: false, error: 'Unknown job.' };
  const db = getDb();
  await ensureRow(key);
  try {
    const detail = await runner();
    await db
      .update(salesCronJobs)
      .set({ lastRunAt: new Date(), lastStatus: 'ok', lastDetail: detail, updatedAt: new Date() })
      .where(eq(salesCronJobs.key, key));
    return { ok: true, detail };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await db
      .update(salesCronJobs)
      .set({ lastRunAt: new Date(), lastStatus: 'error', lastDetail: { error: message }, updatedAt: new Date() })
      .where(eq(salesCronJobs.key, key));
    return { ok: false, error: message };
  }
}

/**
 * Cron-endpoint entry point: skips (records `skipped`) when the job is disabled in the admin
 * console, otherwise runs it. This is the controller that lets automation be paused centrally.
 */
export async function guardedRun(key: string): Promise<Record<string, unknown>> {
  if (!isKnownJob(key)) return { ok: false, error: 'Unknown job.' };
  const row = await ensureRow(key);
  if (row && !row.enabled) {
    await getDb()
      .update(salesCronJobs)
      .set({ lastRunAt: new Date(), lastStatus: 'skipped', updatedAt: new Date() })
      .where(eq(salesCronJobs.key, key));
    return { ok: true, skipped: true, disabled: true };
  }
  const res = await runJob(key);
  return res.ok ? { ok: true, ...(res.detail ?? {}) } : { ok: false, error: res.error };
}
