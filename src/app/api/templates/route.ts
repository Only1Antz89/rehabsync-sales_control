import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { getDb, salesEmailTemplates } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const templates = await getDb()
    .select()
    .from(salesEmailTemplates)
    .orderBy(desc(salesEmailTemplates.updatedAt));
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    subject?: string;
    html?: string;
  } | null;
  const name = body?.name?.trim();
  const subject = body?.subject?.trim();
  if (!name || !subject) {
    return NextResponse.json({ error: 'name and subject are required' }, { status: 400 });
  }

  const [template] = await getDb()
    .insert(salesEmailTemplates)
    .values({ name, subject, html: body?.html ?? '', updatedBy: session.email })
    .returning();
  await recordAudit(session, 'template_created', 'sales_email_template', template!.id, { name });
  return NextResponse.json({ template }, { status: 201 });
}
