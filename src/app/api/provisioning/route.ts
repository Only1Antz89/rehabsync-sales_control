import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { crmContacts, getDb, salesDeals, salesTenantProvisions } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { provisioningConfigured } from '@/lib/provisioning';

export const dynamic = 'force-dynamic';

/** The tenant-provisioning queue: won deals turned into (or queued to become) platform tenants. */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const rows = await getDb()
    .select({
      id: salesTenantProvisions.id,
      dealId: salesTenantProvisions.dealId,
      dealTitle: salesDeals.title,
      contactName: crmContacts.name,
      clinicName: salesTenantProvisions.clinicName,
      billingEmail: salesTenantProvisions.billingEmail,
      tenantId: salesTenantProvisions.tenantId,
      tenantSlug: salesTenantProvisions.tenantSlug,
      status: salesTenantProvisions.status,
      error: salesTenantProvisions.error,
      requestedBy: salesTenantProvisions.requestedBy,
      createdAt: salesTenantProvisions.createdAt,
      provisionedAt: salesTenantProvisions.provisionedAt,
    })
    .from(salesTenantProvisions)
    .leftJoin(salesDeals, eq(salesDeals.id, salesTenantProvisions.dealId))
    .leftJoin(crmContacts, eq(crmContacts.id, salesTenantProvisions.contactId))
    .orderBy(desc(salesTenantProvisions.createdAt))
    .limit(200);

  return NextResponse.json({ provisions: rows, configured: provisioningConfigured() });
}
