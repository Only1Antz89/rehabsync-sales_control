import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { linkProvision, retryProvision } from '@/lib/provisioning';

/** Retry a failed/pending provision, or manually link a tenant id created by hand (admin only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { action?: 'retry'; tenantId?: string } | null;

  if (body?.action === 'retry') {
    const result = await retryProvision(id);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    await recordAudit(session, 'tenant_provision_retried', 'sales_tenant_provision', id, { status: result.provision.status });
    return NextResponse.json({ provision: result.provision });
  }

  const tenantId = body?.tenantId?.trim();
  if (!tenantId) return NextResponse.json({ error: 'Provide a tenantId to link, or action "retry".' }, { status: 400 });
  const result = await linkProvision(id, tenantId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await recordAudit(session, 'tenant_provision_linked', 'sales_tenant_provision', id, { tenantId });
  return NextResponse.json({ provision: result.provision });
}
