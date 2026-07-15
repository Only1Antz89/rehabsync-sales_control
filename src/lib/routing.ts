import { eq, sql } from 'drizzle-orm';
import { getDb, salesRouting } from '@/db';

export interface RoutingConfig {
  enabled: boolean;
  strategy: string;
  pool: string[];
  cursor: number;
  updatedBy: string | null;
  updatedAt: Date;
}

const ROW_ID = 1;

/** Read the singleton routing config, lazily creating it if the migration seed didn't run. */
export async function getRouting(): Promise<RoutingConfig> {
  const db = getDb();
  const [row] = await db.select().from(salesRouting).where(eq(salesRouting.id, ROW_ID)).limit(1);
  if (row) return row;
  await db.insert(salesRouting).values({ id: ROW_ID }).onConflictDoNothing();
  const [created] = await db.select().from(salesRouting).where(eq(salesRouting.id, ROW_ID)).limit(1);
  return created!;
}

/** Update enable state and/or the owner pool. Changing the pool resets the rotation cursor. */
export async function setRouting(
  input: { enabled?: boolean; pool?: string[] },
  actorEmail: string,
): Promise<RoutingConfig> {
  const db = getDb();
  await getRouting(); // ensure the row exists
  const values: Partial<typeof salesRouting.$inferInsert> = { updatedBy: actorEmail, updatedAt: new Date() };
  if (typeof input.enabled === 'boolean') values.enabled = input.enabled;
  if (Array.isArray(input.pool)) {
    values.pool = [...new Set(input.pool.map((p) => p.trim()).filter(Boolean))].slice(0, 100);
    values.cursor = 0;
  }
  await db.update(salesRouting).set(values).where(eq(salesRouting.id, ROW_ID));
  return getRouting();
}

/**
 * Pick the next owner round-robin and advance the cursor atomically. Returns null when routing is
 * off or the pool is empty (the caller then leaves the lead unassigned). The cursor bump is a
 * single UPDATE … RETURNING, so two inbound leads racing never receive the same owner.
 */
export async function assignOwner(): Promise<string | null> {
  const db = getDb();
  const cfg = await getRouting();
  if (!cfg.enabled || cfg.pool.length === 0) return null;

  const [row] = await db
    .update(salesRouting)
    .set({ cursor: sql`${salesRouting.cursor} + 1` })
    .where(eq(salesRouting.id, ROW_ID))
    .returning({ cursor: salesRouting.cursor, pool: salesRouting.pool });
  if (!row || row.pool.length === 0) return null;

  // `row.cursor` is the post-increment value; index the owner the cursor advanced *from*.
  const idx = (((row.cursor - 1) % row.pool.length) + row.pool.length) % row.pool.length;
  return row.pool[idx] ?? null;
}
