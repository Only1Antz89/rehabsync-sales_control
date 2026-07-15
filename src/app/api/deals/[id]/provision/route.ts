import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { provisionForDeal } from '@/lib/provisioning';

/** Provision a platform tenant from a won deal (idempotent — one provision per deal). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { billingEmail?: string } | null;
  const result = await provisionForDeal(id, { billingEmail: body?.billingEmail }, session.email);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  await recordAudit(session, 'tenant_provision_requested', 'sales_deal', id, {
    status: result.provision.status,
    tenantId: result.provision.tenantId,
  });
  return NextResponse.json({ provision: result.provision });
}
