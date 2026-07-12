import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { CRM_STAGES, crmContacts, getDb, salesSequenceEnrollments, salesSequences } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireSession } from '@/lib/route-auth';
import { cleanSteps } from '@/lib/sequence-steps';

type Params = { params: Promise<{ id: string }> };

/** Sequence with its current enrolments (contact name + progress). */
export async function GET(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const [sequence] = await db.select().from(salesSequences).where(eq(salesSequences.id, id)).limit(1);
  if (!sequence) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const enrollments = await db
    .select({
      id: salesSequenceEnrollments.id,
      contactId: salesSequenceEnrollments.contactId,
      contactName: crmContacts.name,
      status: salesSequenceEnrollments.status,
      currentStep: salesSequenceEnrollments.currentStep,
      nextRunAt: salesSequenceEnrollments.nextRunAt,
      lastError: salesSequenceEnrollments.lastError,
    })
    .from(salesSequenceEnrollments)
    .leftJoin(crmContacts, eq(crmContacts.id, salesSequenceEnrollments.contactId))
    .where(eq(salesSequenceEnrollments.sequenceId, id))
    .orderBy(desc(salesSequenceEnrollments.updatedAt))
    .limit(500);

  return NextResponse.json({ sequence, enrollments });
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    steps?: unknown;
    enrollOnStage?: string | null;
    active?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const updates: Partial<typeof salesSequences.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 160);
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (body.enrollOnStage !== undefined) {
    updates.enrollOnStage =
      body.enrollOnStage && (CRM_STAGES as readonly string[]).includes(body.enrollOnStage) ? body.enrollOnStage : null;
  }
  if (body.steps !== undefined) {
    const cleaned = cleanSteps(body.steps);
    if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    updates.steps = cleaned.steps;
  }

  const db = getDb();
  const [updated] = await db.update(salesSequences).set(updates).where(eq(salesSequences.id, id)).returning({ id: salesSequences.id });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'sequence_updated', 'sales_sequence', id, {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const deleted = await db.delete(salesSequences).where(eq(salesSequences.id, id)).returning({ name: salesSequences.name });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'sequence_deleted', 'sales_sequence', id, { name: deleted[0]?.name });
  return NextResponse.json({ ok: true });
}
