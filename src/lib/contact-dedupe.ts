import { eq, inArray } from 'drizzle-orm';
import {
  crmActivities,
  crmContacts,
  getDb,
  salesCampaignRecipients,
  salesDeals,
  salesEmails,
  salesSequenceEnrollments,
  salesTasks,
  salesTenantProvisions,
} from '@/db';

type Contact = typeof crmContacts.$inferSelect;

export interface DuplicateContact {
  id: string;
  name: string;
  email: string;
  clinicName: string | null;
  stage: string;
  ownerName: string | null;
  estimatedValuePence: number | null;
  createdAt: Date;
}

export interface DuplicateGroup {
  key: string;
  reason: 'email' | 'name_clinic';
  contacts: DuplicateContact[];
}

const normEmail = (e: string): string => e.trim().toLowerCase();
const normName = (n: string): string => n.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Detect duplicate contacts by (a) exact normalised email or (b) same normalised name + clinic.
 * Grouping is done in-process (simple, and it sidesteps the drizzle bound-fragment GROUP BY gotcha).
 * Email groups are preferred; a name+clinic group with an identical member set is suppressed.
 */
export async function findDuplicateGroups(limit = 5000): Promise<DuplicateGroup[]> {
  const rows = await getDb()
    .select({
      id: crmContacts.id,
      name: crmContacts.name,
      email: crmContacts.email,
      clinicName: crmContacts.clinicName,
      stage: crmContacts.stage,
      ownerName: crmContacts.ownerName,
      estimatedValuePence: crmContacts.estimatedValuePence,
      createdAt: crmContacts.createdAt,
    })
    .from(crmContacts)
    .orderBy(crmContacts.createdAt)
    .limit(limit);

  const byEmail = new Map<string, DuplicateContact[]>();
  const byNameClinic = new Map<string, DuplicateContact[]>();
  for (const r of rows) {
    const ek = normEmail(r.email);
    if (ek) {
      const list = byEmail.get(ek) ?? [];
      list.push(r);
      byEmail.set(ek, list);
    }
    const clinic = (r.clinicName ?? '').trim().toLowerCase();
    if (clinic) {
      const nk = `${normName(r.name)}|${clinic}`;
      const list = byNameClinic.get(nk) ?? [];
      list.push(r);
      byNameClinic.set(nk, list);
    }
  }

  const groups: DuplicateGroup[] = [];
  const signatures = new Set<string>(); // canonical member-set signature ⇒ skip identical groups
  const signature = (list: DuplicateContact[]): string =>
    list.map((c) => c.id).sort().join(',');

  for (const [key, list] of byEmail) {
    if (list.length > 1 && !signatures.has(signature(list))) {
      signatures.add(signature(list));
      groups.push({ key: `email:${key}`, reason: 'email', contacts: list });
    }
  }
  for (const [key, list] of byNameClinic) {
    if (list.length > 1 && !signatures.has(signature(list))) {
      signatures.add(signature(list));
      groups.push({ key: `nameclinic:${key}`, reason: 'name_clinic', contacts: list });
    }
  }
  // Most-recently-active-looking groups first (largest, then most recent contact).
  groups.sort((a, b) => b.contacts.length - a.contacts.length);
  return groups;
}

export interface MergeReassignCounts {
  activities: number;
  deals: number;
  emails: number;
  tasks: number;
  enrollments: number;
  campaignRecipients: number;
  provisions: number;
}

export interface MergeResult {
  primaryId: string;
  merged: number;
  reassigned: MergeReassignCounts;
}

const firstTruthy = (vals: (string | null | undefined)[]): string | null =>
  vals.find((v) => typeof v === 'string' && v.trim() !== '') ?? null;

function firstNotNull<T>(vals: (T | null | undefined)[]): T | null {
  for (const v of vals) if (v != null) return v;
  return null;
}

/**
 * Merge one or more duplicate contacts into a primary contact. All rows that reference a merged
 * contact are re-pointed at the primary, the survivor is enriched from the duplicates (never
 * overwriting an existing value), and the merged rows are deleted — atomically.
 *
 * The (sequence_id, contact_id) unique index on enrollments means enrollments can't be blindly
 * reassigned: any duplicate-side enrollment whose sequence the primary (or another duplicate) is
 * already in is dropped first, so re-pointing the survivors can never violate the constraint.
 */
export async function mergeContacts(
  primaryId: string,
  mergeIds: string[],
): Promise<{ result: MergeResult } | { error: string }> {
  const db = getDb();
  const ids = [...new Set(mergeIds.filter((id) => id && id !== primaryId))];
  if (ids.length === 0) return { error: 'Select at least one other contact to merge into the primary.' };
  if (ids.length > 50) return { error: 'Merge at most 50 contacts at once.' };

  const [primary] = await db.select().from(crmContacts).where(eq(crmContacts.id, primaryId)).limit(1);
  if (!primary) return { error: 'Primary contact not found.' };
  const dupes: Contact[] = await db.select().from(crmContacts).where(inArray(crmContacts.id, ids));
  if (dupes.length === 0) return { error: 'None of the selected contacts to merge were found.' };

  const result = await db.transaction(async (tx) => {
    // 1) Sequence enrollments — resolve unique-constraint conflicts before reassigning.
    const primaryEnrollments = await tx
      .select({ sequenceId: salesSequenceEnrollments.sequenceId })
      .from(salesSequenceEnrollments)
      .where(eq(salesSequenceEnrollments.contactId, primaryId));
    const primarySeqIds = new Set(primaryEnrollments.map((e) => e.sequenceId));

    const mergeEnrollments = await tx
      .select({ id: salesSequenceEnrollments.id, sequenceId: salesSequenceEnrollments.sequenceId })
      .from(salesSequenceEnrollments)
      .where(inArray(salesSequenceEnrollments.contactId, ids));

    const dropIds: string[] = [];
    const keepBySeq = new Map<string, string>(); // sequenceId ⇒ enrollment id to keep
    for (const e of mergeEnrollments) {
      if (primarySeqIds.has(e.sequenceId) || keepBySeq.has(e.sequenceId)) {
        dropIds.push(e.id); // primary already enrolled, or a sibling duplicate already kept for this seq
      } else {
        keepBySeq.set(e.sequenceId, e.id);
      }
    }
    if (dropIds.length) {
      await tx.delete(salesSequenceEnrollments).where(inArray(salesSequenceEnrollments.id, dropIds));
    }
    const enrollKeepIds = [...keepBySeq.values()];
    let enrollments = 0;
    if (enrollKeepIds.length) {
      const updated = await tx
        .update(salesSequenceEnrollments)
        .set({ contactId: primaryId, updatedAt: new Date() })
        .where(inArray(salesSequenceEnrollments.id, enrollKeepIds))
        .returning({ id: salesSequenceEnrollments.id });
      enrollments = updated.length;
    }

    // 2) Straightforward FK reassignment for the remaining referencing tables.
    const activities = (
      await tx
        .update(crmActivities)
        .set({ contactId: primaryId })
        .where(inArray(crmActivities.contactId, ids))
        .returning({ id: crmActivities.id })
    ).length;
    const deals = (
      await tx
        .update(salesDeals)
        .set({ contactId: primaryId, updatedAt: new Date() })
        .where(inArray(salesDeals.contactId, ids))
        .returning({ id: salesDeals.id })
    ).length;
    const emails = (
      await tx
        .update(salesEmails)
        .set({ contactId: primaryId })
        .where(inArray(salesEmails.contactId, ids))
        .returning({ id: salesEmails.id })
    ).length;
    const tasks = (
      await tx
        .update(salesTasks)
        .set({ contactId: primaryId, updatedAt: new Date() })
        .where(inArray(salesTasks.contactId, ids))
        .returning({ id: salesTasks.id })
    ).length;
    const campaignRecipients = (
      await tx
        .update(salesCampaignRecipients)
        .set({ contactId: primaryId, updatedAt: new Date() })
        .where(inArray(salesCampaignRecipients.contactId, ids))
        .returning({ id: salesCampaignRecipients.id })
    ).length;
    // Provisions reference contacts by a plain uuid (no FK); re-point them so history follows the survivor.
    const provisions = (
      await tx
        .update(salesTenantProvisions)
        .set({ contactId: primaryId })
        .where(inArray(salesTenantProvisions.contactId, ids))
        .returning({ id: salesTenantProvisions.id })
    ).length;

    // 3) Enrich the survivor from the duplicates without overwriting existing values.
    const allTags = new Set<string>(primary.tags ?? []);
    for (const d of dupes) for (const t of d.tags ?? []) allTags.add(t);
    const mergedCustom: Record<string, unknown> = {};
    for (const d of dupes) Object.assign(mergedCustom, d.customFields ?? {});
    Object.assign(mergedCustom, primary.customFields ?? {}); // primary wins on key conflicts

    const lastContactedAt =
      [primary.lastContactedAt, ...dupes.map((d) => d.lastContactedAt)]
        .filter((v): v is Date => v instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    await tx
      .update(crmContacts)
      .set({
        phone: firstTruthy([primary.phone, ...dupes.map((d) => d.phone)]),
        clinicName: firstTruthy([primary.clinicName, ...dupes.map((d) => d.clinicName)]),
        ownerName: firstTruthy([primary.ownerName, ...dupes.map((d) => d.ownerName)]),
        message: firstTruthy([primary.message, ...dupes.map((d) => d.message)]),
        meetingUrl: firstTruthy([primary.meetingUrl, ...dupes.map((d) => d.meetingUrl)]),
        companyId: firstNotNull([primary.companyId, ...dupes.map((d) => d.companyId)]),
        tenantId: firstNotNull([primary.tenantId, ...dupes.map((d) => d.tenantId)]),
        estimatedValuePence: firstNotNull([
          primary.estimatedValuePence,
          ...dupes.map((d) => d.estimatedValuePence),
        ]),
        scheduledAt: firstNotNull([primary.scheduledAt, ...dupes.map((d) => d.scheduledAt)]),
        tags: [...allTags].slice(0, 30),
        customFields: mergedCustom,
        lastContactedAt,
        updatedAt: new Date(),
      })
      .where(eq(crmContacts.id, primaryId));

    // 4) Delete the merged duplicates (their references now all point at the survivor).
    await tx.delete(crmContacts).where(inArray(crmContacts.id, ids));

    return {
      primaryId,
      merged: dupes.length,
      reassigned: { activities, deals, emails, tasks, enrollments, campaignRecipients, provisions },
    } satisfies MergeResult;
  });

  return { result };
}
