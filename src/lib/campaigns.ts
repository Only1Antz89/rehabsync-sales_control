import { and, eq, inArray, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import {
  crmContacts,
  getDb,
  salesCampaignRecipients,
  salesCampaigns,
  salesEmailTemplates,
  salesSuppressions,
} from '@/db';
import type { CampaignSegment } from '@/db';
import { sendEmail } from './email';
import { renderCampaignEmail } from './merge';
import { unsubscribeToken } from './tokens';

const SEND_BATCH = 100;

function appUrl(): string {
  return (process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function segmentConditions(segment: CampaignSegment) {
  const conditions = [];
  if (segment.stages?.length) conditions.push(inArray(crmContacts.stage, segment.stages));
  if (segment.sources?.length) conditions.push(inArray(crmContacts.source, segment.sources));
  if (segment.tags?.length) {
    // jsonb array overlap: any of the requested tags present on the contact.
    conditions.push(
      or(...segment.tags.map((tag) => sql`${crmContacts.tags} @> ${JSON.stringify([tag])}::jsonb`)),
    );
  }
  return conditions;
}

/** Resolve a segment to its audience (deduped by email, suppressions excluded). */
export async function resolveAudience(segment: CampaignSegment) {
  const db = getDb();
  const rows = await db
    .select({
      id: crmContacts.id,
      name: crmContacts.name,
      email: sql<string>`lower(${crmContacts.email})`,
      clinicName: crmContacts.clinicName,
    })
    .from(crmContacts)
    .where(
      and(
        ...segmentConditions(segment),
        notExists(
          db
            .select({ one: sql`1` })
            .from(salesSuppressions)
            .where(eq(salesSuppressions.email, sql`lower(${crmContacts.email})`)),
        ),
      ),
    );

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.email)) return false;
    seen.add(row.email);
    return true;
  });
}

/** Materialise a campaign's audience into recipient rows (idempotent). */
async function buildRecipients(campaignId: string, segment: CampaignSegment): Promise<number> {
  const db = getDb();
  const audience = await resolveAudience(segment);
  if (audience.length === 0) return 0;
  await db
    .insert(salesCampaignRecipients)
    .values(
      audience.map((contact) => ({
        campaignId,
        contactId: contact.id,
        email: contact.email,
      })),
    )
    .onConflictDoNothing({
      target: [salesCampaignRecipients.campaignId, salesCampaignRecipients.email],
    });
  return audience.length;
}

/** Send one batch of a `sending` campaign. Returns how many recipients remain. */
async function sendBatch(campaign: typeof salesCampaigns.$inferSelect): Promise<number> {
  const db = getDb();
  const [template] = campaign.templateId
    ? await db.select().from(salesEmailTemplates).where(eq(salesEmailTemplates.id, campaign.templateId)).limit(1)
    : [];
  if (!template) {
    await db
      .update(salesCampaigns)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(salesCampaigns.id, campaign.id));
    return 0;
  }

  const pending = await db
    .select({
      id: salesCampaignRecipients.id,
      email: salesCampaignRecipients.email,
      contactId: salesCampaignRecipients.contactId,
      name: crmContacts.name,
      clinicName: crmContacts.clinicName,
    })
    .from(salesCampaignRecipients)
    .leftJoin(crmContacts, eq(crmContacts.id, salesCampaignRecipients.contactId))
    .where(and(eq(salesCampaignRecipients.campaignId, campaign.id), eq(salesCampaignRecipients.status, 'pending')))
    .limit(SEND_BATCH);

  for (const recipient of pending) {
    // Suppression check at SEND TIME (someone may unsubscribe mid-campaign).
    const [suppressed] = await db
      .select({ email: salesSuppressions.email })
      .from(salesSuppressions)
      .where(eq(salesSuppressions.email, recipient.email))
      .limit(1);
    if (suppressed) {
      await db
        .update(salesCampaignRecipients)
        .set({ status: 'suppressed', updatedAt: new Date() })
        .where(eq(salesCampaignRecipients.id, recipient.id));
      continue;
    }

    const unsubscribeUrl = `${appUrl()}/unsubscribe/${unsubscribeToken(recipient.email)}`;
    const rendered = renderCampaignEmail(template, {
      name: recipient.name,
      clinicName: recipient.clinicName,
      email: recipient.email,
      unsubscribeUrl,
    });
    const result = await sendEmail({ to: recipient.email, subject: rendered.subject, html: rendered.html });

    await db
      .update(salesCampaignRecipients)
      .set(
        result.sent
          ? { status: 'sent', messageId: result.messageId ?? null, updatedAt: new Date() }
          : result.skipped
            ? { status: 'failed', error: 'Email provider not configured', updatedAt: new Date() }
            : { status: 'failed', error: result.error?.slice(0, 500) ?? 'send failed', updatedAt: new Date() },
      )
      .where(eq(salesCampaignRecipients.id, recipient.id));
  }

  const [{ remaining }] = (await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(salesCampaignRecipients)
    .where(
      and(eq(salesCampaignRecipients.campaignId, campaign.id), eq(salesCampaignRecipients.status, 'pending')),
    )) as [{ remaining: number }];
  return remaining;
}

/** Claim due campaigns and push each forward one batch. Used by the cron and by "send now". */
export async function processCampaigns(campaignId?: string): Promise<{ processed: string[] }> {
  const db = getDb();
  const now = new Date();

  const claimed = await db.transaction(async (tx) => {
    const dueCondition = campaignId
      ? and(eq(salesCampaigns.id, campaignId), inArray(salesCampaigns.status, ['scheduled', 'sending']))
      : and(
          inArray(salesCampaigns.status, ['scheduled', 'sending']),
          or(isNull(salesCampaigns.scheduledAt), lte(salesCampaigns.scheduledAt, now)),
        );
    const rows = await tx
      .select()
      .from(salesCampaigns)
      .where(dueCondition)
      .limit(3)
      .for('update', { skipLocked: true });
    if (rows.length) {
      await tx
        .update(salesCampaigns)
        .set({ status: 'sending', updatedAt: now })
        .where(inArray(salesCampaigns.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  for (const campaign of claimed) {
    if (campaign.status === 'scheduled') {
      await buildRecipients(campaign.id, campaign.segment);
    } else {
      // Re-claimed mid-send: recipients may already exist; build is idempotent anyway.
      await buildRecipients(campaign.id, campaign.segment);
    }
    const remaining = await sendBatch({ ...campaign, status: 'sending' });
    if (remaining === 0) {
      await getDb()
        .update(salesCampaigns)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(salesCampaigns.id, campaign.id));
    }
    // else: leave as 'sending' — the next cron tick sends the next batch.
  }

  return { processed: claimed.map((c) => c.id) };
}
