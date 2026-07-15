import { NextResponse } from 'next/server';
import { inArray, sql } from 'drizzle-orm';
import { CRM_STAGES, crmContacts, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { enrollContact } from '@/lib/sequences';

const BULK_ACTIONS = ['tag', 'untag', 'stage', 'owner', 'enroll', 'delete'] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

interface BulkBody {
  ids?: unknown;
  action?: unknown;
  value?: unknown;
}

/** Apply an action to many contacts at once. Destructive `delete` is admin-only; the rest need any session. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as BulkBody | null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body!.ids.filter((v): v is string => typeof v === 'string' && v.length > 0))]
    : [];
  const action = body?.action as BulkAction | undefined;
  const rawValue = typeof body?.value === 'string' ? body.value.trim() : '';

  if (!action || !(BULK_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: 'Unknown bulk action.' }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: 'Select at least one contact.' }, { status: 400 });
  if (ids.length > 1000) return NextResponse.json({ error: 'Select at most 1000 contacts.' }, { status: 400 });

  const db = getDb();
  const isAdmin = session.role === 'admin' || session.role === 'super_admin';

  switch (action) {
    case 'tag': {
      if (!rawValue) return NextResponse.json({ error: 'Provide a tag.' }, { status: 400 });
      const tag = rawValue.slice(0, 40);
      // Append the tag then collapse to a distinct set, all in the database.
      const updated = await db
        .update(crmContacts)
        .set({
          tags: sql`(select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
                     from jsonb_array_elements_text(${crmContacts.tags} || ${JSON.stringify([tag])}::jsonb) as e)`,
          updatedAt: new Date(),
        })
        .where(inArray(crmContacts.id, ids))
        .returning({ id: crmContacts.id });
      await recordAudit(session, 'contacts_bulk_tag', 'crm_contact', null, { count: updated.length, tag });
      return NextResponse.json({ updated: updated.length, tag });
    }
    case 'untag': {
      if (!rawValue) return NextResponse.json({ error: 'Provide a tag to remove.' }, { status: 400 });
      const tag = rawValue.slice(0, 40);
      const updated = await db
        .update(crmContacts)
        .set({
          tags: sql`(select coalesce(jsonb_agg(e), '[]'::jsonb)
                     from jsonb_array_elements_text(${crmContacts.tags}) as e where e <> ${tag})`,
          updatedAt: new Date(),
        })
        .where(inArray(crmContacts.id, ids))
        .returning({ id: crmContacts.id });
      await recordAudit(session, 'contacts_bulk_untag', 'crm_contact', null, { count: updated.length, tag });
      return NextResponse.json({ updated: updated.length, tag });
    }
    case 'stage': {
      if (!(CRM_STAGES as readonly string[]).includes(rawValue)) {
        return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 });
      }
      const updated = await db
        .update(crmContacts)
        .set({ stage: rawValue, updatedAt: new Date() })
        .where(inArray(crmContacts.id, ids))
        .returning({ id: crmContacts.id });
      await recordAudit(session, 'contacts_bulk_stage', 'crm_contact', null, { count: updated.length, stage: rawValue });
      return NextResponse.json({ updated: updated.length, stage: rawValue });
    }
    case 'owner': {
      const owner = rawValue ? rawValue.slice(0, 120) : null; // empty value clears the owner
      const updated = await db
        .update(crmContacts)
        .set({ ownerName: owner, updatedAt: new Date() })
        .where(inArray(crmContacts.id, ids))
        .returning({ id: crmContacts.id });
      await recordAudit(session, 'contacts_bulk_owner', 'crm_contact', null, { count: updated.length, owner });
      return NextResponse.json({ updated: updated.length, owner });
    }
    case 'enroll': {
      if (!rawValue) return NextResponse.json({ error: 'Choose a sequence.' }, { status: 400 });
      if (ids.length > 500) return NextResponse.json({ error: 'Enroll at most 500 contacts at once.' }, { status: 400 });
      let enrolled = 0;
      let skipped = 0;
      let seqError: string | undefined;
      for (const id of ids) {
        const res = await enrollContact(rawValue, id, session.email);
        if (res.ok) enrolled += 1;
        else {
          skipped += 1;
          // A structural problem (missing/inactive/empty sequence) applies to all — stop early.
          if (res.error && res.error !== 'Contact is already enrolled.') {
            seqError = res.error;
            break;
          }
        }
      }
      if (enrolled === 0 && seqError) return NextResponse.json({ error: seqError }, { status: 400 });
      await recordAudit(session, 'contacts_bulk_enroll', 'crm_contact', null, {
        sequenceId: rawValue,
        enrolled,
        skipped,
      });
      return NextResponse.json({ enrolled, skipped });
    }
    case 'delete': {
      if (!isAdmin) return NextResponse.json({ error: 'Only admins can bulk-delete contacts.' }, { status: 403 });
      // Cascades remove the contact's activities/emails/tasks/enrollments; deals & campaign
      // recipients are detached (set null) so historical revenue/sends survive.
      const deleted = await db
        .delete(crmContacts)
        .where(inArray(crmContacts.id, ids))
        .returning({ id: crmContacts.id });
      await recordAudit(session, 'contacts_bulk_delete', 'crm_contact', null, { count: deleted.length });
      return NextResponse.json({ deleted: deleted.length });
    }
    default:
      return NextResponse.json({ error: 'Unknown bulk action.' }, { status: 400 });
  }
}
