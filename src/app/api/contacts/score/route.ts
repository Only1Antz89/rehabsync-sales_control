import { NextResponse } from 'next/server';
import { isResponse, requireAdmin } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { recomputeAllLeadScores } from '@/lib/lead-score';

/** Recompute every contact's lead score (backfill / manual refresh). Admin-only. */
export async function POST() {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const updated = await recomputeAllLeadScores();
  await recordAudit(session, 'lead_scores_recomputed', 'crm_contact', null, { updated });
  return NextResponse.json({ updated });
}
