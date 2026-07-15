import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, salesNotifications, staffToolRoles, staffUsers } from '@/db';

type Notification = typeof salesNotifications.$inferSelect;

export interface CreateNotification {
  recipientEmail: string;
  kind: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** When true (with entityId), skip if this recipient already has an unread one of the same kind+entity. */
  dedupe?: boolean;
}

/** Insert a notification for one recipient. Returns false when deduped or the recipient is empty. */
export async function createNotification(input: CreateNotification): Promise<boolean> {
  const db = getDb();
  const recipient = input.recipientEmail?.trim().toLowerCase();
  if (!recipient) return false;

  if (input.dedupe && input.entityId) {
    const [existing] = await db
      .select({ id: salesNotifications.id })
      .from(salesNotifications)
      .where(
        and(
          eq(salesNotifications.recipientEmail, recipient),
          eq(salesNotifications.kind, input.kind),
          eq(salesNotifications.entityId, input.entityId),
          isNull(salesNotifications.readAt),
        ),
      )
      .limit(1);
    if (existing) return false;
  }

  await db.insert(salesNotifications).values({
    recipientEmail: recipient,
    kind: input.kind,
    title: input.title.slice(0, 200),
    body: input.body?.slice(0, 1000) ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
  });
  return true;
}

export async function listNotifications(email: string, limit = 50): Promise<Notification[]> {
  return getDb()
    .select()
    .from(salesNotifications)
    .where(eq(salesNotifications.recipientEmail, email.toLowerCase()))
    .orderBy(desc(salesNotifications.createdAt))
    .limit(limit);
}

export async function unreadCount(email: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(salesNotifications)
    .where(and(eq(salesNotifications.recipientEmail, email.toLowerCase()), isNull(salesNotifications.readAt)));
  return row?.n ?? 0;
}

export async function markRead(id: string, email: string): Promise<void> {
  await getDb()
    .update(salesNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(salesNotifications.id, id), eq(salesNotifications.recipientEmail, email.toLowerCase())));
}

export async function markAllRead(email: string): Promise<number> {
  const rows = await getDb()
    .update(salesNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(salesNotifications.recipientEmail, email.toLowerCase()), isNull(salesNotifications.readAt)))
    .returning({ id: salesNotifications.id });
  return rows.length;
}

/** Resolve a contact owner's display name to an active staff email (case-insensitive), if any. */
export async function resolveOwnerEmail(ownerName: string): Promise<string | null> {
  const name = ownerName.trim();
  if (!name) return null;
  const [row] = await getDb()
    .select({ email: staffUsers.email })
    .from(staffUsers)
    .where(and(sql`lower(${staffUsers.name}) = ${name.toLowerCase()}`, eq(staffUsers.status, 'active')))
    .limit(1);
  return row?.email ?? null;
}

/** Emails of active staff who hold an admin role in the Sales tool. */
export async function adminEmails(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ email: staffUsers.email })
    .from(staffUsers)
    .innerJoin(staffToolRoles, eq(staffToolRoles.userId, staffUsers.id))
    .where(and(eq(staffUsers.status, 'active'), sql`${staffToolRoles.role} in ('admin','super_admin')`));
  return rows.map((r) => r.email);
}
