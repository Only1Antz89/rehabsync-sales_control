import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { crmContacts, getDb, salesEmails } from '@/db';
import { recordAudit } from '@/lib/audit';
import { sendContactEmail } from '@/lib/contact-email';
import { isResponse, requireSession } from '@/lib/route-auth';

/** Send a tracked 1:1 email to a contact (optionally from a template); suppression-checked and
 *  logged to the timeline + sales_emails for delivery/open/click tracking via the webhook. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    subject?: string;
    html?: string;
    templateId?: string;
  } | null;

  const result = await sendContactEmail(
    contact,
    { subject: body?.subject, html: body?.html, templateId: body?.templateId ?? null },
    { email: session.email, name: session.name },
  );

  if (result.suppressed) {
    return NextResponse.json({ error: 'This address is on the suppression list — cannot email.' }, { status: 409 });
  }
  await recordAudit(session, 'email_sent', 'crm_contact', id, { emailId: result.emailId, ok: result.sent });

  if (!result.sent && !result.skipped) {
    return NextResponse.json({ error: result.error ?? 'Could not send the email.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: result.sent, skipped: result.skipped });
}

/** Recent tracked emails for this contact (status timeline). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const rows = await db.select().from(salesEmails).where(eq(salesEmails.contactId, id)).orderBy(salesEmails.createdAt);
  return NextResponse.json({ emails: rows });
}
