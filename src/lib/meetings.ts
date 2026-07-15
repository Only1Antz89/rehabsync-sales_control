import { and, asc, desc, eq, gte } from 'drizzle-orm';
import { crmActivities, crmContacts, getDb, salesMeetings, MEETING_STATUSES } from '@/db';
import type { MeetingStatus } from '@/db';
import { recomputeLeadScore } from './lead-score';

type Meeting = typeof salesMeetings.$inferSelect;

export interface BookMeetingInput {
  title?: string;
  startsAt?: string | Date;
  durationMin?: number;
  location?: string | null;
  notes?: string | null;
}

function fmt(d: Date): string {
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Book a meeting on a contact: records it, threads a timeline note, and syncs the contact's
 *  next-scheduled time / meeting URL. */
export async function bookMeeting(
  contactId: string,
  input: BookMeetingInput,
  actor: { email: string; name: string | null },
): Promise<{ meeting: Meeting } | { error: string }> {
  const db = getDb();
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId)).limit(1);
  if (!contact) return { error: 'Contact not found.' };

  const title = input.title?.trim();
  if (!title) return { error: 'A meeting title is required.' };
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return { error: 'A valid start time is required.' };
  const durationMin = Number.isInteger(input.durationMin) && (input.durationMin as number) > 0 ? (input.durationMin as number) : 30;
  const location = input.location?.trim() || null;

  const [meeting] = await db
    .insert(salesMeetings)
    .values({
      contactId,
      title: title.slice(0, 200),
      startsAt,
      durationMin,
      location: location?.slice(0, 500) ?? null,
      notes: input.notes?.trim().slice(0, 2000) || null,
      status: 'scheduled',
      createdBy: actor.email,
    })
    .returning();

  await db.insert(crmActivities).values({
    contactId,
    type: 'meeting',
    body: `Meeting booked: ${title} — ${fmt(startsAt)}`,
    actorName: actor.name,
  });
  await db
    .update(crmContacts)
    .set({ scheduledAt: startsAt, meetingUrl: location ?? contact.meetingUrl, lastContactedAt: new Date(), updatedAt: new Date() })
    .where(eq(crmContacts.id, contactId));
  await recomputeLeadScore(contactId);

  return { meeting: meeting! };
}

/** Reschedule / relocate / restatus a meeting. Cancelling or completing logs a timeline note. */
export async function updateMeeting(
  id: string,
  input: BookMeetingInput & { status?: string },
  actor: { email: string; name: string | null },
): Promise<{ meeting: Meeting } | { error: string }> {
  const db = getDb();
  const [existing] = await db.select().from(salesMeetings).where(eq(salesMeetings.id, id)).limit(1);
  if (!existing) return { error: 'Meeting not found.' };

  const values: Partial<typeof salesMeetings.$inferInsert> = { updatedAt: new Date() };
  let rescheduled = false;
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { error: 'Title cannot be empty.' };
    values.title = t.slice(0, 200);
  }
  if (input.startsAt !== undefined) {
    const d = new Date(input.startsAt);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid start time.' };
    values.startsAt = d;
    rescheduled = d.getTime() !== new Date(existing.startsAt).getTime();
  }
  if (input.durationMin !== undefined && Number.isInteger(input.durationMin) && input.durationMin > 0) {
    values.durationMin = input.durationMin;
  }
  if (input.location !== undefined) values.location = input.location?.trim().slice(0, 500) || null;
  if (input.notes !== undefined) values.notes = input.notes?.trim().slice(0, 2000) || null;
  if (input.status !== undefined) {
    if (!(MEETING_STATUSES as readonly string[]).includes(input.status)) return { error: 'Unknown status.' };
    values.status = input.status as MeetingStatus;
  }

  const [meeting] = await db.update(salesMeetings).set(values).where(eq(salesMeetings.id, id)).returning();

  const statusChanged = input.status !== undefined && input.status !== existing.status;
  if (rescheduled || statusChanged) {
    const note = statusChanged
      ? `Meeting ${input.status}: ${meeting!.title}`
      : `Meeting rescheduled: ${meeting!.title} — ${fmt(new Date(meeting!.startsAt))}`;
    await db.insert(crmActivities).values({ contactId: existing.contactId, type: 'meeting', body: note, actorName: actor.name });
  }
  if (values.startsAt && (values.status ?? existing.status) === 'scheduled') {
    await db.update(crmContacts).set({ scheduledAt: values.startsAt, updatedAt: new Date() }).where(eq(crmContacts.id, existing.contactId));
  }

  return { meeting: meeting! };
}

export interface MeetingWithContact extends Meeting {
  contactName: string;
  contactEmail: string;
}

/** List meetings for a contact, or upcoming scheduled meetings across all contacts. */
export async function listMeetings(opts: { contactId?: string; upcoming?: boolean; limit?: number }): Promise<MeetingWithContact[]> {
  const db = getDb();
  const conditions = [];
  if (opts.contactId) conditions.push(eq(salesMeetings.contactId, opts.contactId));
  if (opts.upcoming) {
    conditions.push(eq(salesMeetings.status, 'scheduled'));
    conditions.push(gte(salesMeetings.startsAt, new Date()));
  }
  const rows = await db
    .select({
      id: salesMeetings.id,
      contactId: salesMeetings.contactId,
      title: salesMeetings.title,
      startsAt: salesMeetings.startsAt,
      durationMin: salesMeetings.durationMin,
      location: salesMeetings.location,
      notes: salesMeetings.notes,
      status: salesMeetings.status,
      createdBy: salesMeetings.createdBy,
      createdAt: salesMeetings.createdAt,
      updatedAt: salesMeetings.updatedAt,
      contactName: crmContacts.name,
      contactEmail: crmContacts.email,
    })
    .from(salesMeetings)
    .innerJoin(crmContacts, eq(crmContacts.id, salesMeetings.contactId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(opts.upcoming ? asc(salesMeetings.startsAt) : desc(salesMeetings.startsAt))
    .limit(opts.limit ?? 200);
  return rows;
}
