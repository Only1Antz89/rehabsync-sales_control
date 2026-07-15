import { eq, sql } from 'drizzle-orm';
import { crmContacts, getDb, salesDeals, salesEmails } from '@/db';

export interface ScoreSignals {
  hasPhone: boolean;
  hasClinic: boolean;
  estimatedValuePence: number | null;
  stage: string;
  emailsOpened: number;
  emailsClicked: number;
  inboundReplies: number;
  openDeals: number;
  wonDeals: number;
  daysSinceLastContact: number | null;
}

export interface ScoreResult {
  score: number;
  factors: Record<string, number>;
}

// Weights for the CRM contact lifecycle stages (see CRM_STAGES). Later stages = warmer.
const STAGE_WEIGHT: Record<string, number> = {
  new: 0,
  contacted: 5,
  demo_scheduled: 14,
  demo_completed: 20,
  onboarding: 24,
  customer: 25,
  churned: 0,
  lost: 0,
};

/**
 * Pure, transparent lead score (clamped 0–100) with a per-factor breakdown so a rep can see exactly
 * why a contact scores the way it does. Engagement (replies, clicks) and pipeline signals dominate;
 * commission or spend never enter into it.
 */
export function scoreFromSignals(s: ScoreSignals): ScoreResult {
  const f: Record<string, number> = {};
  if (s.hasPhone) f.phone = 8;
  if (s.hasClinic) f.clinic = 8;
  if (s.estimatedValuePence != null) {
    f.value = s.estimatedValuePence >= 100000 ? 15 : s.estimatedValuePence >= 25000 ? 8 : 3;
  }
  const stageWeight = STAGE_WEIGHT[s.stage] ?? 0;
  if (stageWeight) f.stage = stageWeight;
  if (s.emailsOpened) f.emails_opened = Math.min(12, s.emailsOpened * 3);
  if (s.emailsClicked) f.emails_clicked = Math.min(18, s.emailsClicked * 6);
  if (s.inboundReplies) f.inbound_replies = Math.min(20, s.inboundReplies * 10);
  if (s.openDeals) f.open_deals = Math.min(20, s.openDeals * 10);
  if (s.wonDeals) f.won_deals = 15;
  if (s.daysSinceLastContact != null) {
    if (s.daysSinceLastContact <= 7) f.recency = 8;
    else if (s.daysSinceLastContact <= 30) f.recency = 4;
    else if (s.daysSinceLastContact > 90) f.recency = -5;
  }
  const raw = Object.values(f).reduce((a, b) => a + b, 0);
  return { score: Math.max(0, Math.min(100, raw)), factors: f };
}

/** Gather a contact's signals and persist its recomputed score. Best-effort — never throws. */
export async function recomputeLeadScore(contactId: string): Promise<ScoreResult | null> {
  const db = getDb();
  try {
    const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId)).limit(1);
    if (!contact) return null;

    const [emailAgg] = await db
      .select({
        opened: sql<number>`count(*) filter (where ${salesEmails.openedAt} is not null and ${salesEmails.direction} = 'outbound')::int`,
        clicked: sql<number>`count(*) filter (where ${salesEmails.clickedAt} is not null and ${salesEmails.direction} = 'outbound')::int`,
        inbound: sql<number>`count(*) filter (where ${salesEmails.direction} = 'inbound')::int`,
      })
      .from(salesEmails)
      .where(eq(salesEmails.contactId, contactId));

    const [dealAgg] = await db
      .select({
        open: sql<number>`count(*) filter (where ${salesDeals.status} = 'open')::int`,
        won: sql<number>`count(*) filter (where ${salesDeals.status} = 'won')::int`,
      })
      .from(salesDeals)
      .where(eq(salesDeals.contactId, contactId));

    const days = contact.lastContactedAt
      ? Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / 86400000)
      : null;

    const result = scoreFromSignals({
      hasPhone: !!contact.phone,
      hasClinic: !!contact.clinicName,
      estimatedValuePence: contact.estimatedValuePence,
      stage: contact.stage,
      emailsOpened: emailAgg?.opened ?? 0,
      emailsClicked: emailAgg?.clicked ?? 0,
      inboundReplies: emailAgg?.inbound ?? 0,
      openDeals: dealAgg?.open ?? 0,
      wonDeals: dealAgg?.won ?? 0,
      daysSinceLastContact: days,
    });

    await db
      .update(crmContacts)
      .set({ leadScore: result.score, scoreFactors: result.factors })
      .where(eq(crmContacts.id, contactId));
    return result;
  } catch (err) {
    // Scoring is a derived convenience — never let it break the primary action.
    console.error('[lead-score] recompute failed', contactId, err);
    return null;
  }
}

/** Recompute scores for many contacts (backfill / manual refresh). Returns how many were updated. */
export async function recomputeAllLeadScores(limit = 5000): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: crmContacts.id }).from(crmContacts).limit(limit);
  let updated = 0;
  for (const row of rows) {
    if (await recomputeLeadScore(row.id)) updated += 1;
  }
  return updated;
}
