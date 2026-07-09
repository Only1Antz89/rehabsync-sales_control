import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, salesTasks } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [existing] = await db.select().from(salesTasks).where(eq(salesTasks.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    status?: string;
    title?: string;
    dueAt?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const values: Partial<typeof salesTasks.$inferInsert> = { updatedAt: new Date() };
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    values.title = title.slice(0, 200);
  }
  if (body.dueAt !== undefined) values.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  if (body.status === 'done' || body.status === 'cancelled' || body.status === 'open') {
    values.status = body.status;
    values.completedAt = body.status === 'done' ? new Date() : null;
  }

  const [task] = await db.update(salesTasks).set(values).where(eq(salesTasks.id, id)).returning();

  if (values.status && values.status !== existing.status) {
    const action =
      values.status === 'done' ? 'task_completed' : values.status === 'cancelled' ? 'task_cancelled' : 'task_reopened';
    await recordAudit(session, action, 'sales_task', id, {});
  }
  return NextResponse.json({ task });
}
