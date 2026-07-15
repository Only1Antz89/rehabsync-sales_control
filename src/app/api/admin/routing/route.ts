import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { getRouting, setRouting } from '@/lib/routing';

export const dynamic = 'force-dynamic';

/** Lead-routing config (admin only). */
export async function GET() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  return NextResponse.json({ routing: await getRouting() });
}

export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { enabled?: unknown; pool?: unknown } | null;
  const input: { enabled?: boolean; pool?: string[] } = {};
  if (typeof body?.enabled === 'boolean') input.enabled = body.enabled;
  if (Array.isArray(body?.pool)) input.pool = body.pool.filter((p): p is string => typeof p === 'string');

  const routing = await setRouting(input, session.email);
  await recordAudit(session, 'routing_updated', 'sales_routing', null, {
    enabled: routing.enabled,
    poolSize: routing.pool.length,
  });
  return NextResponse.json({ routing });
}
