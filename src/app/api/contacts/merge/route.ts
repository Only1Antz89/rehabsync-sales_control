import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { mergeContacts } from '@/lib/contact-dedupe';

interface MergeBody {
  primaryId?: unknown;
  mergeIds?: unknown;
}

/** Merge duplicate contacts into a primary (admin-only — it deletes the merged records). */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as MergeBody | null;
  const primaryId = typeof body?.primaryId === 'string' ? body.primaryId : '';
  const mergeIds = Array.isArray(body?.mergeIds)
    ? body!.mergeIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];

  if (!primaryId) return NextResponse.json({ error: 'A primary contact is required.' }, { status: 400 });

  const outcome = await mergeContacts(primaryId, mergeIds);
  if ('error' in outcome) return NextResponse.json({ error: outcome.error }, { status: 400 });

  await recordAudit(session, 'contacts_merged', 'crm_contact', primaryId, {
    merged: outcome.result.merged,
    reassigned: outcome.result.reassigned,
  });
  return NextResponse.json(outcome.result);
}
