import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { getDb, salesCaptureForms } from '@/db';
import { isResponse, requireAdmin, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const forms = await getDb().select().from(salesCaptureForms).orderBy(desc(salesCaptureForms.createdAt));
  return NextResponse.json({ forms });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    headline?: string;
    sourceTag?: string;
    redirectUrl?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) +
    '-' +
    Math.random().toString(36).slice(2, 6);

  const [form] = await getDb()
    .insert(salesCaptureForms)
    .values({
      slug,
      name,
      headline: body?.headline?.trim() || null,
      sourceTag: body?.sourceTag?.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40) || 'form',
      redirectUrl: body?.redirectUrl?.trim() || null,
      createdBy: session.email,
    })
    .returning();

  await recordAudit(session, 'form_created', 'sales_capture_form', form!.id, { slug });
  return NextResponse.json({ form }, { status: 201 });
}
