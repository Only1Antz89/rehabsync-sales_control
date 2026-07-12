import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  crmActivities,
  crmContacts,
  getDb,
  salesEmailTemplates,
  salesEmails,
  salesSuppressions,
} from '@/db';
import { recordAudit } from '@/lib/audit';
import { sendEmail } from '@/lib/email';
import { renderCampaignEmail } from '@/lib/merge';
import { isResponse, requireSession } from '@/lib/route-auth';
import { unsubscribeToken } from '@/lib/tokens';

function appUrl(): string {
  return (process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Send a tracked 1:1 email to a contact. Optionally rendered from a template; suppression-checked;
 *  logged to the timeline and to sales_emails for delivery/open/click tracking via the webhook. */
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

  const email = contact.email.trim().toLowerCase();
  const [suppressed] = await db
    .select({ email: salesSuppressions.email })
    .from(salesSuppressions)
    .where(eq(salesSuppressions.email, email))
    .limit(1);
  if (suppressed) {
    return NextResponse.json({ error: 'This address is on the suppression list — cannot email.' }, { status: 409 });
  }

  let subject = body?.subject?.trim() ?? '';
  let html = body?.html ?? '';
  if (body?.templateId) {
    const [template] = await db.select().from(salesEmailTemplates).where(eq(salesEmailTemplates.id, body.templateId)).limit(1);
    if (!template) return NextResponse.json({ error: 'Template not found.' }, { status: 400 });
    subject = subject || template.subject;
    html = html || template.html;
  }
  if (!subject || !html.trim()) {
    return NextResponse.json({ error: 'Subject and body are required.' }, { status: 400 });
  }

  const unsubscribeUrl = `${appUrl()}/unsubscribe/${unsubscribeToken(email)}`;
  const rendered = renderCampaignEmail(
    { subject, html },
    { name: contact.name, clinicName: contact.clinicName, email, unsubscribeUrl },
  );
  const result = await sendEmail({ to: email, subject: rendered.subject, html: rendered.html });

  const [record] = await db
    .insert(salesEmails)
    .values({
      contactId: id,
      toEmail: email,
      subject: rendered.subject.slice(0, 255),
      status: result.sent ? 'sent' : 'failed',
      messageId: result.messageId ?? null,
      error: result.sent ? null : (result.error ?? (result.skipped ? 'Email provider not configured' : 'send failed'))?.slice(0, 500),
      createdBy: session.email,
      sentAt: result.sent ? new Date() : null,
    })
    .returning({ id: salesEmails.id });

  // Timeline entry + last-contacted bump (mirrors the notes route's call/email behaviour).
  await db.insert(crmActivities).values({
    contactId: id,
    type: 'email',
    body: result.sent ? `Sent: ${rendered.subject}` : `Failed to send: ${rendered.subject}`,
    actorName: session.name,
  });
  if (result.sent) {
    await db.update(crmContacts).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmContacts.id, id));
  }

  await recordAudit(session, 'email_sent', 'crm_contact', id, { emailId: record?.id, ok: result.sent });

  if (!result.sent && !result.skipped) {
    return NextResponse.json({ error: result.error ?? 'Could not send the email.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: result.sent, skipped: result.skipped ?? false });
}

/** Recent tracked emails for this contact (status timeline). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const db = getDb();
  const rows = await db
    .select()
    .from(salesEmails)
    .where(eq(salesEmails.contactId, id))
    .orderBy(salesEmails.createdAt);
  return NextResponse.json({ emails: rows });
}
