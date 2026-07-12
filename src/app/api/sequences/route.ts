import { NextResponse } from 'next/server';
import { desc, inArray, sql } from 'drizzle-orm';
import { CRM_STAGES, getDb, salesSequenceEnrollments, salesSequences } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireSession } from '@/lib/route-auth';
import { cleanSteps } from '@/lib/sequence-steps';

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const db = getDb();
  const sequences = await db.select().from(salesSequences).orderBy(desc(salesSequences.createdAt)).limit(200);
  const ids = sequences.map((s) => s.id);
  const counts = ids.length
    ? await db
        .select({
          sequenceId: salesSequenceEnrollments.sequenceId,
          active: sql<number>`count(*) filter (where ${salesSequenceEnrollments.status} = 'active')::int`,
          completed: sql<number>`count(*) filter (where ${salesSequenceEnrollments.status} = 'completed')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(salesSequenceEnrollments)
        .where(inArray(salesSequenceEnrollments.sequenceId, ids))
        .groupBy(salesSequenceEnrollments.sequenceId)
    : [];
  const countMap = new Map(counts.map((c) => [c.sequenceId, c]));

  return NextResponse.json({
    sequences: sequences.map((s) => ({
      ...s,
      stepCount: s.steps.length,
      activeEnrollments: countMap.get(s.id)?.active ?? 0,
      completedEnrollments: countMap.get(s.id)?.completed ?? 0,
      totalEnrollments: countMap.get(s.id)?.total ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    steps?: unknown;
    enrollOnStage?: string | null;
    active?: boolean;
  } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'Sequence name is required.' }, { status: 400 });

  const cleaned = cleanSteps(body?.steps);
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });

  const enrollOnStage =
    body?.enrollOnStage && (CRM_STAGES as readonly string[]).includes(body.enrollOnStage) ? body.enrollOnStage : null;

  const db = getDb();
  const [created] = await db
    .insert(salesSequences)
    .values({
      name: name.slice(0, 160),
      steps: cleaned.steps,
      enrollOnStage,
      active: body?.active !== false,
      createdBy: session.email,
    })
    .returning({ id: salesSequences.id });

  await recordAudit(session, 'sequence_created', 'sales_sequence', created?.id ?? null, { name, steps: cleaned.steps.length });
  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}
