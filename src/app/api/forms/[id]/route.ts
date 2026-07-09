import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, salesCaptureForms } from '@/db';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    headline?: string | null;
    redirectUrl?: string | null;
    active?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const values: Partial<typeof salesCaptureForms.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) values.name = body.name.trim() || undefined;
  if (body.headline !== undefined) values.headline = body.headline?.trim() || null;
  if (body.redirectUrl !== undefined) values.redirectUrl = body.redirectUrl?.trim() || null;
  if (body.active !== undefined) values.active = body.active;

  const [form] = await getDb()
    .update(salesCaptureForms)
    .set(values)
    .where(eq(salesCaptureForms.id, id))
    .returning();
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  await recordAudit(session, 'form_updated', 'sales_capture_form', id, {
    changed: Object.keys(values).filter((k) => k !== 'updatedAt'),
  });
  return NextResponse.json({ form });
}
