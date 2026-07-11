import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic health check. `db` = can we connect at all; `migrated` = are this tool's tables/columns
 * present. The `hint` distinguishes the two common production failures so a 500 elsewhere is
 * self-explanatory without leaking connection details.
 */
export async function GET() {
  const result: { ok: boolean; app: string; db: boolean; migrated: boolean; hint?: string } = {
    ok: true,
    app: 'sales-centre',
    db: false,
    migrated: false,
  };

  try {
    await getDb().execute(sql`select 1`);
    result.db = true;
  } catch {
    result.hint = 'Database unreachable — check REHABSYNC_DATABASE_URL is set and SSL is allowed.';
    return NextResponse.json(result);
  }

  try {
    // A tool-owned table + an additive column prove the migration chain (0001..0004) ran.
    await getDb().execute(sql`select tags from crm_contacts limit 1`);
    await getDb().execute(sql`select 1 from sales_campaigns limit 1`);
    result.migrated = true;
  } catch {
    result.hint = 'Connected, but expected tables/columns are missing — run `pnpm db:deploy`.';
  }

  return NextResponse.json(result);
}
