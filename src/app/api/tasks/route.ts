import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { SALES_TASK_TYPES, crmContacts, getDb, salesTasks } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'open'; // open | mine | all
  const conditions = [];
  if (scope === 'open' || scope === 'mine') conditions.push(eq(salesTasks.status, 'open'));
  if (scope === 'mine') conditions.push(eq(salesTasks.assigneeEmail, session.email));

  const rows = await getDb()
    .select({
      id: salesTasks.id,
      title: salesTasks.title,
      type: salesTasks.type,
      status: salesTasks.status,
      dueAt: salesTasks.dueAt,
      assigneeEmail: salesTasks.assigneeEmail,
      createdBy: salesTasks.createdBy,
      completedAt: salesTasks.completedAt,
      createdAt: salesTasks.createdAt,
      contactId: salesTasks.contactId,
      contactName: crmContacts.name,
      clinicName: crmContacts.clinicName,
    })
    .from(salesTasks)
    .leftJoin(crmContacts, eq(crmContacts.id, salesTasks.contactId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${salesTasks.dueAt} asc nulls last`, asc(salesTasks.createdAt))
    .limit(300);

  return NextResponse.json({ tasks: rows });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    type?: string;
    contactId?: string | null;
    dueAt?: string | null;
    assigneeEmail?: string | null;
  } | null;
  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  const type = (SALES_TASK_TYPES as readonly string[]).includes(body?.type ?? '') ? body!.type! : 'todo';

  const [task] = await getDb()
    .insert(salesTasks)
    .values({
      title: title.slice(0, 200),
      type,
      contactId: body?.contactId || null,
      dueAt: body?.dueAt ? new Date(body.dueAt) : null,
      assigneeEmail: body?.assigneeEmail?.trim().toLowerCase() || session.email,
      createdBy: session.email,
    })
    .returning();

  await recordAudit(session, 'task_created', 'sales_task', task!.id, { type, contactId: body?.contactId ?? null });
  return NextResponse.json({ task }, { status: 201 });
}
