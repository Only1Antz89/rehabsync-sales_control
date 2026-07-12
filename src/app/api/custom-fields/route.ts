import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, salesCustomFields } from '@/db';
import { isResponse, requireAdmin, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { isCustomFieldType, slugifyKey } from '@/lib/custom-fields';

/** List custom-field definitions for an entity (default `contact`). Any authenticated session. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const entity = new URL(req.url).searchParams.get('entity')?.trim() || 'contact';

  const fields = await getDb()
    .select()
    .from(salesCustomFields)
    .where(eq(salesCustomFields.entity, entity))
    .orderBy(asc(salesCustomFields.sortOrder), asc(salesCustomFields.createdAt));
  return NextResponse.json({ fields });
}

/** Create a custom field (admin only). */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    label?: string;
    type?: string;
    options?: unknown;
    entity?: string;
  } | null;

  const label = body?.label?.trim();
  if (!label) return NextResponse.json({ error: 'Label is required.' }, { status: 400 });
  const type = isCustomFieldType(body?.type) ? body!.type : 'text';
  const key = slugifyKey(label);
  if (!key) return NextResponse.json({ error: 'Label must contain letters or numbers.' }, { status: 400 });
  const entity = body?.entity?.trim() || 'contact';
  const options =
    type === 'select' && Array.isArray(body?.options)
      ? [...new Set(body.options.map((o) => String(o).trim()).filter(Boolean))].slice(0, 50)
      : [];
  if (type === 'select' && options.length === 0) {
    return NextResponse.json({ error: 'Select fields need at least one option.' }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: salesCustomFields.id })
    .from(salesCustomFields)
    .where(and(eq(salesCustomFields.entity, entity), eq(salesCustomFields.key, key)))
    .limit(1);
  if (existing) return NextResponse.json({ error: `A field named “${label}” already exists.` }, { status: 409 });

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(salesCustomFields)
    .where(eq(salesCustomFields.entity, entity));
  const [created] = await db
    .insert(salesCustomFields)
    .values({ entity, key, label: label.slice(0, 120), type, options, sortOrder: count, createdBy: session.email })
    .returning({ id: salesCustomFields.id });

  await recordAudit(session, 'custom_field_created', 'sales_custom_field', created?.id ?? null, { key, type });
  return NextResponse.json({ ok: true, id: created?.id, key }, { status: 201 });
}
