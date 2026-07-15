import { and, desc, eq } from 'drizzle-orm';
import { crmActivities, crmContacts, getDb, salesEmails } from '@/db';
import { recomputeLeadScore } from './lead-score';

export interface NormalizedInbound {
  fromEmail: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  messageId: string | null;
  inReplyTo: string | null;
}

function pick(payload: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Extract a bare address from a raw header value like `"Dr Ada" <ada@clinic.com>`. */
export function parseAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  const addr = (angle ? angle[1]! : raw).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) ? addr : '';
}

/**
 * Normalise a provider inbound-parse payload into a canonical shape. Field names cover SMTP2GO,
 * Mailgun-style and generic JSON so the same webhook works whatever provider is wired up.
 */
export function normalizeInbound(payload: Record<string, unknown>): NormalizedInbound {
  const from = pick(payload, ['from', 'sender', 'From', 'from_email', 'From-Email']);
  const to = pick(payload, ['to', 'recipient', 'To', 'to_email']);
  return {
    fromEmail: parseAddress(from),
    toEmail: parseAddress(to) || to.slice(0, 255),
    subject: pick(payload, ['subject', 'Subject']).slice(0, 255),
    text: pick(payload, ['text', 'plain', 'body-plain', 'body_text', 'TextBody']),
    html: pick(payload, ['html', 'body-html', 'body_html', 'HtmlBody']),
    messageId: pick(payload, ['message_id', 'Message-Id', 'message-id', 'messageId']) || null,
    inReplyTo: pick(payload, ['in_reply_to', 'In-Reply-To', 'in-reply-to', 'inReplyTo']) || null,
  };
}

export interface IngestResult {
  matched: boolean;
  contactId?: string;
  emailId?: string;
  duplicate?: boolean;
}

/**
 * Persist an inbound reply against the contact it came from (matched by from-address), threading it
 * onto the timeline and bumping last-contacted. Idempotent on the provider message id so a webhook
 * retry never double-records. Unmatched senders are acknowledged but not stored (no auto-created
 * contacts — keeps junk out of the CRM).
 */
export async function ingestInboundEmail(payload: Record<string, unknown>): Promise<IngestResult> {
  const msg = normalizeInbound(payload);
  if (!msg.fromEmail) return { matched: false };
  const db = getDb();

  if (msg.messageId) {
    const [existing] = await db
      .select({ id: salesEmails.id })
      .from(salesEmails)
      .where(and(eq(salesEmails.messageId, msg.messageId.slice(0, 160)), eq(salesEmails.direction, 'inbound')))
      .limit(1);
    if (existing) return { matched: true, emailId: existing.id, duplicate: true };
  }

  const [contact] = await db
    .select()
    .from(crmContacts)
    .where(eq(crmContacts.email, msg.fromEmail))
    .orderBy(desc(crmContacts.updatedAt))
    .limit(1);
  if (!contact) return { matched: false };

  const snippet = (msg.text || msg.html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const subject = msg.subject || '(no subject)';

  const [record] = await db
    .insert(salesEmails)
    .values({
      contactId: contact.id,
      toEmail: msg.toEmail || 'inbound',
      subject,
      status: 'received',
      direction: 'inbound',
      fromEmail: msg.fromEmail,
      messageId: msg.messageId ? msg.messageId.slice(0, 160) : null,
      inReplyTo: msg.inReplyTo,
      bodyText: msg.text || null,
      bodyHtml: msg.html || null,
      receivedAt: new Date(),
    })
    .returning({ id: salesEmails.id });

  await db.insert(crmActivities).values({
    contactId: contact.id,
    type: 'email_in',
    body: `Received: ${subject}${snippet ? ` — ${snippet}` : ''}`,
    actorName: contact.name,
  });
  await db
    .update(crmContacts)
    .set({ lastContactedAt: new Date(), updatedAt: new Date() })
    .where(eq(crmContacts.id, contact.id));
  // An inbound reply is a strong intent signal — refresh the lead score.
  await recomputeLeadScore(contact.id);

  return { matched: true, contactId: contact.id, ...(record?.id ? { emailId: record.id } : {}) };
}
