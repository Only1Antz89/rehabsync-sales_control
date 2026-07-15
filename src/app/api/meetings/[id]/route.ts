import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { updateMeeting } from '@/lib/meetings';

/** Reschedule, relocate, or change the status of a meeting. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await updateMeeting(
    id,
    {
      title: typeof body?.title === 'string' ? body.title : undefined,
      startsAt: typeof body?.startsAt === 'string' ? body.startsAt : undefined,
      durationMin: typeof body?.durationMin === 'number' ? body.durationMin : undefined,
      location: typeof body?.location === 'string' ? body.location : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
      status: typeof body?.status === 'string' ? body.status : undefined,
    },
    { email: session.email, name: session.name },
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  await recordAudit(session, 'meeting_updated', 'sales_meeting', id, { status: result.meeting.status });
  return NextResponse.json({ meeting: result.meeting });
}
