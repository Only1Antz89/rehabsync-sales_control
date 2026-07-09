import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { resolveAudience } from '@/lib/campaigns';
import type { CampaignSegment } from '@/db';

/** Audience preview: how many contacts a segment reaches after suppressions + dedupe. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const body = (await req.json().catch(() => null)) as { segment?: CampaignSegment } | null;
  const audience = await resolveAudience(body?.segment ?? {});
  return NextResponse.json({
    count: audience.length,
    sample: audience.slice(0, 5).map((a) => ({ name: a.name, email: a.email })),
  });
}
