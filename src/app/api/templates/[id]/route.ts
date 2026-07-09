import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, salesEmailTemplates } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { renderCampaignEmail } from '@/lib/merge';
import { sendEmail } from '@/lib/email';
import { unsubscribeToken } from '@/lib/tokens';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const [template] = await getDb().select().from(salesEmailTemplates).where(eq(salesEmailTemplates.id, id)).limit(1);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    subject?: string;
    html?: string;
    action?: 'test_send';
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const db = getDb();
  const [template] = await db.select().from(salesEmailTemplates).where(eq(salesEmailTemplates.id, id)).limit(1);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  if (body.action === 'test_send') {
    const appUrl = (process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');
    const rendered = renderCampaignEmail(template, {
      name: session.name,
      clinicName: 'Example Clinic',
      email: session.email,
      unsubscribeUrl: `${appUrl}/unsubscribe/${unsubscribeToken(session.email)}`,
    });
    const result = await sendEmail({
      to: session.email,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
    });
    return NextResponse.json(result, { status: result.sent ? 200 : 502 });
  }

  const values: Partial<typeof salesEmailTemplates.$inferInsert> = {
    updatedBy: session.email,
    updatedAt: new Date(),
  };
  if (body.name !== undefined) values.name = body.name.trim();
  if (body.subject !== undefined) values.subject = body.subject.trim();
  if (body.html !== undefined) values.html = body.html;

  const [updated] = await db
    .update(salesEmailTemplates)
    .set(values)
    .where(eq(salesEmailTemplates.id, id))
    .returning();
  await recordAudit(session, 'template_updated', 'sales_email_template', id, {});
  return NextResponse.json({ template: updated });
}
