import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { getDb, salesReports } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { cleanReportConfig } from '@/lib/reports';

/** List saved reports. */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const reports = await getDb().select().from(salesReports).orderBy(desc(salesReports.createdAt)).limit(200);
  return NextResponse.json({ reports });
}

/** Save a report. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { name?: string; config?: unknown } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'Report name is required.' }, { status: 400 });

  const config = cleanReportConfig(body?.config);
  if ('error' in config) return NextResponse.json({ error: config.error }, { status: 400 });

  const db = getDb();
  const [created] = await db
    .insert(salesReports)
    .values({ name: name.slice(0, 160), config, createdBy: session.email })
    .returning({ id: salesReports.id });
  await recordAudit(session, 'report_created', 'sales_report', created?.id ?? null, { name });
  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}
