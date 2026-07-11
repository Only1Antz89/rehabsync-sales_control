import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { DEAL_STAGES, getDb, salesDeals } from '@/db';
import { recordAudit } from '@/lib/audit';
import { dealStageProbability } from '@/lib/deals';
import { isResponse, requireSession } from '@/lib/route-auth';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const [deal] = await db.select().from(salesDeals).where(eq(salesDeals.id, id)).limit(1);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deal });
}

/**
 * Update a deal. Supports field edits, a stage move (which re-derives probability), and
 * won/lost transitions (which stamp closedAt and, for lost, a reason).
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    stage?: string;
    status?: string;
    amountPence?: number;
    probability?: number;
    expectedCloseDate?: string | null;
    ownerName?: string;
    companyId?: string | null;
    contactId?: string | null;
    lostReason?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const db = getDb();
  const [existing] = await db.select().from(salesDeals).where(eq(salesDeals.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Partial<typeof salesDeals.$inferInsert> = { updatedAt: new Date() };
  let action = 'deal_updated';

  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim().slice(0, 200);
  if (typeof body.amountPence === 'number' && Number.isFinite(body.amountPence)) {
    updates.amountPence = Math.max(0, Math.round(body.amountPence));
  }
  if (body.expectedCloseDate !== undefined) updates.expectedCloseDate = body.expectedCloseDate || null;
  if (body.ownerName !== undefined) updates.ownerName = body.ownerName?.trim() || null;
  if (body.companyId !== undefined) updates.companyId = body.companyId || null;
  if (body.contactId !== undefined) updates.contactId = body.contactId || null;

  if (body.stage && (DEAL_STAGES as readonly string[]).includes(body.stage)) {
    updates.stage = body.stage;
    updates.probability = typeof body.probability === 'number' ? body.probability : dealStageProbability(body.stage);
    action = 'deal_stage_changed';
  } else if (typeof body.probability === 'number') {
    updates.probability = Math.max(0, Math.min(100, Math.round(body.probability)));
  }

  if (body.status && (['open', 'won', 'lost'] as string[]).includes(body.status) && body.status !== existing.status) {
    updates.status = body.status;
    if (body.status === 'won') {
      updates.probability = 100;
      updates.closedAt = new Date();
      action = 'deal_won';
    } else if (body.status === 'lost') {
      updates.probability = 0;
      updates.closedAt = new Date();
      updates.lostReason = body.lostReason?.slice(0, 500) ?? null;
      action = 'deal_lost';
    } else {
      updates.closedAt = null; // reopened
      action = 'deal_reopened';
    }
  }

  await db.update(salesDeals).set(updates).where(eq(salesDeals.id, id));
  await recordAudit(session, action, 'sales_deal', id, {
    ...(updates.stage ? { stage: updates.stage } : {}),
    ...(updates.status ? { status: updates.status } : {}),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const deleted = await db.delete(salesDeals).where(eq(salesDeals.id, id)).returning({ title: salesDeals.title });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'deal_deleted', 'sales_deal', id, { title: deleted[0]?.title });
  return NextResponse.json({ ok: true });
}
