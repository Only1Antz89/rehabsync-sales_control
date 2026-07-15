import { and, eq, isNull, lt } from 'drizzle-orm';
import { crmContacts, getDb, salesSlaSettings } from '@/db';
import { adminEmails, createNotification, resolveOwnerEmail } from './notifications';

export interface SlaSettings {
  enabled: boolean;
  firstResponseHours: number;
  updatedBy: string | null;
  updatedAt: Date;
}

const ROW_ID = 1;

export async function getSlaSettings(): Promise<SlaSettings> {
  const db = getDb();
  const [row] = await db.select().from(salesSlaSettings).where(eq(salesSlaSettings.id, ROW_ID)).limit(1);
  if (row) return row;
  await db.insert(salesSlaSettings).values({ id: ROW_ID }).onConflictDoNothing();
  const [created] = await db.select().from(salesSlaSettings).where(eq(salesSlaSettings.id, ROW_ID)).limit(1);
  return created!;
}

export async function setSlaSettings(
  input: { enabled?: boolean; firstResponseHours?: number },
  actorEmail: string,
): Promise<SlaSettings> {
  const db = getDb();
  await getSlaSettings();
  const values: Partial<typeof salesSlaSettings.$inferInsert> = { updatedBy: actorEmail, updatedAt: new Date() };
  if (typeof input.enabled === 'boolean') values.enabled = input.enabled;
  if (Number.isInteger(input.firstResponseHours) && (input.firstResponseHours as number) > 0) {
    values.firstResponseHours = Math.min(720, input.firstResponseHours as number);
  }
  await db.update(salesSlaSettings).set(values).where(eq(salesSlaSettings.id, ROW_ID));
  return getSlaSettings();
}

/**
 * Find new leads left unanswered beyond the first-response threshold and raise an `sla_breach`
 * notification for each admin (and the lead's owner, if resolvable). Deduped per recipient so a
 * breach is only raised once until it's read. A lead counts as unanswered when it's still `new`
 * and has no `lastContactedAt` (any outbound email, reply, or booked meeting sets that).
 */
export async function evaluateSla(): Promise<Record<string, unknown>> {
  const cfg = await getSlaSettings();
  if (!cfg.enabled) return { ok: true, skipped: true, reason: 'disabled' };

  const db = getDb();
  const cutoff = new Date(Date.now() - cfg.firstResponseHours * 3_600_000);
  const leads = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.stage, 'new'), isNull(crmContacts.lastContactedAt), lt(crmContacts.createdAt, cutoff)))
    .limit(500);

  const admins = await adminEmails();
  let notified = 0;
  for (const lead of leads) {
    const recipients = new Set(admins);
    if (lead.ownerName) {
      const ownerEmail = await resolveOwnerEmail(lead.ownerName);
      if (ownerEmail) recipients.add(ownerEmail);
    }
    for (const email of recipients) {
      const created = await createNotification({
        recipientEmail: email,
        kind: 'sla_breach',
        title: `Lead needs a response: ${lead.name}`,
        body: `${lead.name} (${lead.email}) has waited over ${cfg.firstResponseHours}h with no first response.`,
        entityType: 'crm_contact',
        entityId: lead.id,
        dedupe: true,
      });
      if (created) notified += 1;
    }
  }
  return { ok: true, breached: leads.length, notified };
}
