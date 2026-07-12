import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, salesCustomFields } from '@/db';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/** Update a custom field (label, options, active, order). Admin only. Key/type are immutable. */
export async function PATCH(req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    label?: string;
    options?: unknown;
    active?: boolean;
    sortOrder?: number;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const updates: Partial<typeof salesCustomFields.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim().slice(0, 120);
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder)) updates.sortOrder = body.sortOrder;
  if (Array.isArray(body.options)) {
    updates.options = [...new Set(body.options.map((o) => String(o).trim()).filter(Boolean))].slice(0, 50);
  }

  const db = getDb();
  const [updated] = await db
    .update(salesCustomFields)
    .set(updates)
    .where(eq(salesCustomFields.id, id))
    .returning({ id: salesCustomFields.id });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'custom_field_updated', 'sales_custom_field', id, {});
  return NextResponse.json({ ok: true });
}

/** Delete a custom field definition (values already stored on contacts are left untouched). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const deleted = await db
    .delete(salesCustomFields)
    .where(eq(salesCustomFields.id, id))
    .returning({ key: salesCustomFields.key });
  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit(session, 'custom_field_deleted', 'sales_custom_field', id, { key: deleted[0]?.key });
  return NextResponse.json({ ok: true });
}
