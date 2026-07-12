import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, salesReports } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { runReport } from '@/lib/reports';

type Params = { params: Promise<{ id: string }> };

/** Fetch a saved report and run it. */
export async function GET(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const [report] = await getDb().select().from(salesReports).where(eq(salesReports.id, id)).limit(1);
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await runReport(report.config);
  if ('error' in result) return NextResponse.json({ report, error: result.error }, { status: 200 });
  return NextResponse.json({ report, result });
}

/** Delete a saved report. */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const deleted = await getDb()
    .delete(salesReports)
    .where(eq(salesReports.id, id))
    .returning({ name: salesReports.name });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'report_deleted', 'sales_report', id, { name: deleted[0]?.name });
  return NextResponse.json({ ok: true });
}
