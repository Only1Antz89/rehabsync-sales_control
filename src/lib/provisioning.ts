import { eq } from 'drizzle-orm';
import { crmContacts, getDb, salesCompanies, salesDeals, salesTenantProvisions } from '@/db';

type ProvisionRow = typeof salesTenantProvisions.$inferSelect;

/** The platform tenant-creation endpoint. Configurable so it can point at the real bootstrap
 *  route, a future admin-create endpoint, or a stub in tests. */
function provisionUrl(): string | null {
  const base = process.env['REHABSYNC_API_URL'];
  if (!base) return null;
  const path = process.env['REHABSYNC_TENANT_PROVISION_PATH'] ?? '/api/v1/tenants/bootstrap';
  return `${base.replace(/\/+$/, '')}${path}`;
}

export function provisioningConfigured(): boolean {
  return provisionUrl() !== null;
}

async function callBootstrap(
  name: string,
  billingEmail: string,
): Promise<{ tenantId: string; tenantSlug: string | null } | { error: string; unconfigured?: boolean }> {
  const url = provisionUrl();
  if (!url) return { error: 'Platform API not configured — complete this manually.', unconfigured: true };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, billingEmail }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => null)) as
      | { tenantId?: string; tenantSlug?: string; message?: string; error?: string }
      | null;
    if (!res.ok || !data?.tenantId) {
      return { error: data?.message ?? data?.error ?? `HTTP ${res.status}` };
    }
    return { tenantId: data.tenantId, tenantSlug: data.tenantSlug ?? null };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * Stamp the resulting tenant id back onto the linked contact and company (closes the loop).
 * Best-effort: `crm_contacts.tenant_id` is FK-constrained to the platform's `tenants` table, so a
 * tenant id that isn't a real tenant (a bad manual link) must never fail the whole provision —
 * the tenant creation is the real outcome, the cross-link is a convenience.
 */
async function linkBack(tenantId: string, contactId: string | null, companyId: string | null): Promise<void> {
  const db = getDb();
  try {
    if (contactId) await db.update(crmContacts).set({ tenantId, updatedAt: new Date() }).where(eq(crmContacts.id, contactId));
  } catch (err) {
    console.warn('[provisioning] contact link failed:', (err as Error).message);
  }
  try {
    if (companyId) await db.update(salesCompanies).set({ tenantId, updatedAt: new Date() }).where(eq(salesCompanies.id, companyId));
  } catch (err) {
    console.warn('[provisioning] company link failed:', (err as Error).message);
  }
}

/** Run the bootstrap call for a provision row and record the outcome + links. */
async function attempt(row: ProvisionRow): Promise<ProvisionRow> {
  const db = getDb();
  const result = await callBootstrap(row.clinicName, row.billingEmail);
  if ('error' in result) {
    if (result.unconfigured) return row; // stay pending for manual completion
    const [failed] = await db
      .update(salesTenantProvisions)
      .set({ status: 'failed', error: result.error.slice(0, 500) })
      .where(eq(salesTenantProvisions.id, row.id))
      .returning();
    return failed!;
  }
  await linkBack(result.tenantId, row.contactId, row.companyId);
  const [done] = await db
    .update(salesTenantProvisions)
    .set({ status: 'provisioned', tenantId: result.tenantId, tenantSlug: result.tenantSlug, error: null, provisionedAt: new Date() })
    .where(eq(salesTenantProvisions.id, row.id))
    .returning();
  return done!;
}

/** Provision (or return the existing provision for) a won deal. Idempotent: one per deal. */
export async function provisionForDeal(
  dealId: string,
  opts: { billingEmail?: string },
  actorEmail: string,
): Promise<{ provision: ProvisionRow } | { error: string }> {
  const db = getDb();
  const [deal] = await db.select().from(salesDeals).where(eq(salesDeals.id, dealId)).limit(1);
  if (!deal) return { error: 'Deal not found.' };

  const [existing] = await db.select().from(salesTenantProvisions).where(eq(salesTenantProvisions.dealId, dealId)).limit(1);
  if (existing && existing.status === 'provisioned') return { provision: existing };

  const [contact] = deal.contactId
    ? await db.select().from(crmContacts).where(eq(crmContacts.id, deal.contactId)).limit(1)
    : [];
  const [company] = deal.companyId
    ? await db.select().from(salesCompanies).where(eq(salesCompanies.id, deal.companyId)).limit(1)
    : [];
  const clinicName = (company?.name || contact?.clinicName || contact?.name || deal.title).slice(0, 200);
  const billingEmail = (opts.billingEmail || contact?.email || '').trim().toLowerCase();
  if (!billingEmail) return { error: 'A billing email is required — add one to the linked contact or supply it.' };

  const row =
    existing ??
    (
      await db
        .insert(salesTenantProvisions)
        .values({
          dealId,
          contactId: deal.contactId,
          companyId: deal.companyId,
          clinicName,
          billingEmail,
          status: 'pending',
          requestedBy: actorEmail,
        })
        .returning()
    )[0]!;

  return { provision: await attempt(row) };
}

/** Retry a pending/failed provision (re-calls the platform API). */
export async function retryProvision(id: string): Promise<{ provision: ProvisionRow } | { error: string }> {
  const db = getDb();
  const [row] = await db.select().from(salesTenantProvisions).where(eq(salesTenantProvisions.id, id)).limit(1);
  if (!row) return { error: 'Not found.' };
  if (row.status === 'provisioned') return { provision: row };
  return { provision: await attempt(row) };
}

/** Manually complete a provision with a tenant id created by hand in Admin Centre. */
export async function linkProvision(id: string, tenantId: string): Promise<{ provision: ProvisionRow } | { error: string }> {
  const db = getDb();
  const [row] = await db.select().from(salesTenantProvisions).where(eq(salesTenantProvisions.id, id)).limit(1);
  if (!row) return { error: 'Not found.' };
  await linkBack(tenantId, row.contactId, row.companyId);
  const [done] = await db
    .update(salesTenantProvisions)
    .set({ status: 'provisioned', tenantId, error: null, provisionedAt: new Date() })
    .where(eq(salesTenantProvisions.id, id))
    .returning();
  return { provision: done! };
}
