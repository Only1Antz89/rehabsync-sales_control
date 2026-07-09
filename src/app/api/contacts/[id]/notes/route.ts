import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { crmActivities, crmContacts, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

const NOTE_TYPES = ['note', 'call', 'email'] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [contact] = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(eq(crmContacts.id, id))
    .limit(1);
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { body?: string; type?: string } | null;
  const text = body?.body?.trim();
  if (!text) return NextResponse.json({ error: 'Note body is required' }, { status: 400 });
  const type = (NOTE_TYPES as readonly string[]).includes(body?.type ?? '') ? body!.type! : 'note';

  const [activity] = await db
    .insert(crmActivities)
    .values({ contactId: id, type, body: text.slice(0, 4000), actorName: session.name })
    .returning();

  // A logged call/email counts as contact — used by "last contacted" filters and analytics.
  if (type === 'call' || type === 'email') {
    await db
      .update(crmContacts)
      .set({ lastContactedAt: new Date(), updatedAt: new Date() })
      .where(eq(crmContacts.id, id));
  }

  await recordAudit(session, 'note_added', 'crm_contact', id, { type });
  return NextResponse.json({ activity }, { status: 201 });
}
