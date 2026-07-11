import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { crmContacts, getDb, salesCompanies, salesDeals } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireSession } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

/** Company record with its contacts and deals. */
export async function GET(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const [company] = await db.select().from(salesCompanies).where(eq(salesCompanies.id, id)).limit(1);
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [contacts, deals] = await Promise.all([
    db
      .select({
        id: crmContacts.id,
        name: crmContacts.name,
        email: crmContacts.email,
        stage: crmContacts.stage,
      })
      .from(crmContacts)
      .where(eq(crmContacts.companyId, id))
      .orderBy(desc(crmContacts.updatedAt)),
    db
      .select({
        id: salesDeals.id,
        title: salesDeals.title,
        stage: salesDeals.stage,
        status: salesDeals.status,
        amountPence: salesDeals.amountPence,
        expectedCloseDate: salesDeals.expectedCloseDate,
      })
      .from(salesDeals)
      .where(eq(salesDeals.companyId, id))
      .orderBy(desc(salesDeals.updatedAt)),
  ]);

  return NextResponse.json({ company, contacts, deals });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const updates: Partial<typeof salesCompanies.$inferInsert> = { updatedAt: new Date() };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
  if (str(body['name'])) updates.name = str(body['name'])!.slice(0, 200);
  for (const key of ['domain', 'website', 'industry', 'size', 'phone', 'address', 'ownerName', 'notes'] as const) {
    if (body[key] !== undefined) (updates as Record<string, unknown>)[key] = str(body[key]) || null;
  }
  if (Array.isArray(body['tags'])) {
    updates.tags = [...new Set((body['tags'] as unknown[]).map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  }

  const db = getDb();
  const [updated] = await db.update(salesCompanies).set(updates).where(eq(salesCompanies.id, id)).returning({ id: salesCompanies.id });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'company_updated', 'sales_company', id, {});
  return NextResponse.json({ ok: true });
}

/** Delete a company; its contacts/deals keep existing but lose the association (SET NULL). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const deleted = await db.delete(salesCompanies).where(eq(salesCompanies.id, id)).returning({ name: salesCompanies.name });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'company_deleted', 'sales_company', id, { name: deleted[0]?.name });
  void and;
  return NextResponse.json({ ok: true });
}
