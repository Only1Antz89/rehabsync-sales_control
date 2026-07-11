import { NextResponse } from 'next/server';
import { desc, ilike, inArray, or, sql } from 'drizzle-orm';
import { crmContacts, getDb, salesCompanies, salesDeals } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireSession } from '@/lib/route-auth';

/** List companies with contact + open-deal roll-ups. ?q= filters by name or domain. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const q = new URL(req.url).searchParams.get('q')?.trim();
  const db = getDb();
  const companies = await db
    .select({
      id: salesCompanies.id,
      name: salesCompanies.name,
      domain: salesCompanies.domain,
      industry: salesCompanies.industry,
      ownerName: salesCompanies.ownerName,
      tags: salesCompanies.tags,
      createdAt: salesCompanies.createdAt,
    })
    .from(salesCompanies)
    .where(q ? or(ilike(salesCompanies.name, `%${q}%`), ilike(salesCompanies.domain, `%${q}%`)) : undefined)
    .orderBy(desc(salesCompanies.updatedAt))
    .limit(500);

  // Roll-ups via explicit aggregate queries (correlated subqueries in a projection render
  // unreliably through the ORM) merged in JS.
  const ids = companies.map((c) => c.id);
  const [contactCounts, dealRollups] = ids.length
    ? await Promise.all([
        db
          .select({ companyId: crmContacts.companyId, n: sql<number>`count(*)::int` })
          .from(crmContacts)
          .where(inArray(crmContacts.companyId, ids))
          .groupBy(crmContacts.companyId),
        db
          .select({
            companyId: salesDeals.companyId,
            openDeals: sql<number>`count(*) filter (where ${salesDeals.status} = 'open')::int`,
            openValuePence: sql<number>`coalesce(sum(${salesDeals.amountPence}) filter (where ${salesDeals.status} = 'open'), 0)::int`,
          })
          .from(salesDeals)
          .where(inArray(salesDeals.companyId, ids))
          .groupBy(salesDeals.companyId),
      ])
    : [[], []];

  const contactMap = new Map(contactCounts.map((r) => [r.companyId, r.n]));
  const dealMap = new Map(dealRollups.map((r) => [r.companyId, r]));

  const rows = companies.map((c) => ({
    ...c,
    contactCount: contactMap.get(c.id) ?? 0,
    openDeals: dealMap.get(c.id)?.openDeals ?? 0,
    openValuePence: dealMap.get(c.id)?.openValuePence ?? 0,
  }));

  return NextResponse.json({ companies: rows });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    domain?: string;
    website?: string;
    industry?: string;
    size?: string;
    phone?: string;
    address?: string;
    ownerName?: string;
    tags?: string[];
    notes?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });

  const tags = [...new Set((body?.tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  const db = getDb();
  const [created] = await db
    .insert(salesCompanies)
    .values({
      name: name.slice(0, 200),
      domain: body?.domain?.trim() || null,
      website: body?.website?.trim() || null,
      industry: body?.industry?.trim() || null,
      size: body?.size?.trim() || null,
      phone: body?.phone?.trim() || null,
      address: body?.address?.trim() || null,
      ownerName: body?.ownerName?.trim() || null,
      tags,
      notes: body?.notes?.trim() || null,
      createdBy: session.email,
    })
    .returning({ id: salesCompanies.id });

  await recordAudit(session, 'company_created', 'sales_company', created?.id ?? null, { name });
  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}
