import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { listMeetings } from '@/lib/meetings';

/** Upcoming scheduled meetings across all contacts (default), or all recent when scope=all. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const scope = new URL(req.url).searchParams.get('scope');
  const meetings = await listMeetings({ upcoming: scope !== 'all', limit: 200 });
  return NextResponse.json({ meetings });
}
