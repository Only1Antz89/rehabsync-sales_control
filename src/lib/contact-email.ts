import { eq } from 'drizzle-orm';
import {
  crmActivities,
  crmContacts,
  getDb,
  salesEmailTemplates,
  salesEmails,
  salesSuppressions,
} from '@/db';
import { sendEmail } from './email';
import { renderCampaignEmail } from './merge';
import { unsubscribeToken } from './tokens';

export function appUrl(): string {
  return (process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export interface ContactEmailInput {
  subject?: string;
  html?: string;
  templateId?: string | null;
}

export interface ContactEmailResult {
  sent: boolean;
  skipped: boolean;
  suppressed: boolean;
  error?: string;
  emailId?: string;
}

type Contact = typeof crmContacts.$inferSelect;

/**
 * Send a tracked 1:1 email to a contact and record it (sales_emails + timeline + last-contacted).
 * Shared by the contact route and the sequence worker. `actor` identifies who/what sent it.
 */
export async function sendContactEmail(
  contact: Contact,
  input: ContactEmailInput,
  actor: { email: string; name: string | null },
): Promise<ContactEmailResult> {
  const db = getDb();
  const email = contact.email.trim().toLowerCase();

  const [suppressed] = await db
    .select({ email: salesSuppressions.email })
    .from(salesSuppressions)
    .where(eq(salesSuppressions.email, email))
    .limit(1);
  if (suppressed) return { sent: false, skipped: false, suppressed: true, error: 'Address is suppressed.' };

  let subject = input.subject?.trim() ?? '';
  let html = input.html ?? '';
  if (input.templateId) {
    const [template] = await db.select().from(salesEmailTemplates).where(eq(salesEmailTemplates.id, input.templateId)).limit(1);
    if (!template) return { sent: false, skipped: false, suppressed: false, error: 'Template not found.' };
    subject = subject || template.subject;
    html = html || template.html;
  }
  if (!subject || !html.trim()) {
    return { sent: false, skipped: false, suppressed: false, error: 'Subject and body are required.' };
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
      contactId: contact.id,
      toEmail: email,
      subject: rendered.subject.slice(0, 255),
      status: result.sent ? 'sent' : 'failed',
      messageId: result.messageId ?? null,
      error: result.sent ? null : (result.error ?? (result.skipped ? 'Email provider not configured' : 'send failed'))?.slice(0, 500),
      createdBy: actor.email,
      sentAt: result.sent ? new Date() : null,
    })
    .returning({ id: salesEmails.id });

  await db.insert(crmActivities).values({
    contactId: contact.id,
    type: 'email',
    body: result.sent ? `Sent: ${rendered.subject}` : `Failed to send: ${rendered.subject}`,
    actorName: actor.name,
  });
  if (result.sent) {
    await db.update(crmContacts).set({ lastContactedAt: new Date(), updatedAt: new Date() }).where(eq(crmContacts.id, contact.id));
  }

  const out: ContactEmailResult = {
    sent: result.sent,
    skipped: result.skipped ?? false,
    suppressed: false,
    ...(record?.id ? { emailId: record.id } : {}),
  };
  if (!result.sent && result.error) out.error = result.error;
  return out;
}
