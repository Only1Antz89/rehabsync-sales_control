import { NextResponse } from 'next/server';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { DEAL_STAGES, crmContacts, getDb, salesCompanies, salesDeals } from '@/db';
import { recordAudit } from '@/lib/audit';
import { dealStageProbability } from '@/lib/deals';
import { isResponse, requireSession } from '@/lib/route-auth';

/** List deals with company + contact names. Filters: ?status= ?stage= ?companyId= ?contactId= ?q= */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get('status')?.trim();
  const stage = url.searchParams.get('stage')?.trim();
  const companyId = url.searchParams.get('companyId')?.trim();
  const contactId = url.searchParams.get('contactId')?.trim();
  const q = url.searchParams.get('q')?.trim();

  const conditions = [];
  if (status && (['open', 'won', 'lost'] as string[]).includes(status)) conditions.push(eq(salesDeals.status, status));
  if (stage && (DEAL_STAGES as readonly string[]).includes(stage)) conditions.push(eq(salesDeals.stage, stage));
  if (companyId) conditions.push(eq(salesDeals.companyId, companyId));
  if (contactId) conditions.push(eq(salesDeals.contactId, contactId));
  if (q) conditions.push(ilike(salesDeals.title, `%${q}%`));

  const db = getDb();
  const rows = await db
    .select({
      id: salesDeals.id,
      title: salesDeals.title,
      stage: salesDeals.stage,
      status: salesDeals.status,
      amountPence: salesDeals.amountPence,
      currency: salesDeals.currency,
      probability: salesDeals.probability,
      expectedCloseDate: salesDeals.expectedCloseDate,
      ownerName: salesDeals.ownerName,
      companyId: salesDeals.companyId,
      companyName: salesCompanies.name,
      contactId: salesDeals.contactId,
      contactName: crmContacts.name,
      updatedAt: salesDeals.updatedAt,
    })
    .from(salesDeals)
    .leftJoin(salesCompanies, eq(salesCompanies.id, salesDeals.companyId))
    .leftJoin(crmContacts, eq(crmContacts.id, salesDeals.contactId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(salesDeals.updatedAt))
    .limit(1000);

  return NextResponse.json({ deals: rows });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    companyId?: string | null;
    contactId?: string | null;
    stage?: string;
    amountPence?: number;
    expectedCloseDate?: string | null;
    ownerName?: string;
    source?: string;
  } | null;

  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: 'Deal title is required.' }, { status: 400 });
  const stage = body?.stage && (DEAL_STAGES as readonly string[]).includes(body.stage) ? body.stage : 'qualification';
  const amountPence = Number.isFinite(body?.amountPence) ? Math.max(0, Math.round(Number(body?.amountPence))) : 0;

  const db = getDb();
  const [created] = await db
    .insert(salesDeals)
    .values({
      title: title.slice(0, 200),
      companyId: body?.companyId || null,
      contactId: body?.contactId || null,
      stage,
      status: 'open',
      amountPence,
      probability: dealStageProbability(stage),
      expectedCloseDate: body?.expectedCloseDate || null,
      ownerName: body?.ownerName?.trim() || session.name || null,
      source: body?.source?.trim() || null,
      createdBy: session.email,
    })
    .returning({ id: salesDeals.id });

  await recordAudit(session, 'deal_created', 'sales_deal', created?.id ?? null, { title, amountPence, stage });
  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}
