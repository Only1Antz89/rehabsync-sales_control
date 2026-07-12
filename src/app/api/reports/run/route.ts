import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { cleanReportConfig, runReport } from '@/lib/reports';

/** Run an unsaved report config — live preview in the builder. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { config?: unknown } | null;
  const config = cleanReportConfig(body?.config);
  if ('error' in config) return NextResponse.json({ error: config.error }, { status: 400 });

  const result = await runReport(config);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ result });
}
