import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { getSlaSettings, setSlaSettings } from '@/lib/sla';

export const dynamic = 'force-dynamic';

/** SLA first-response settings (admin only). */
export async function GET() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  return NextResponse.json({ sla: await getSlaSettings() });
}

export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { enabled?: unknown; firstResponseHours?: unknown } | null;
  const input: { enabled?: boolean; firstResponseHours?: number } = {};
  if (typeof body?.enabled === 'boolean') input.enabled = body.enabled;
  if (typeof body?.firstResponseHours === 'number') input.firstResponseHours = body.firstResponseHours;

  const sla = await setSlaSettings(input, session.email);
  await recordAudit(session, 'sla_updated', 'sales_sla', null, {
    enabled: sla.enabled,
    firstResponseHours: sla.firstResponseHours,
  });
  return NextResponse.json({ sla });
}
