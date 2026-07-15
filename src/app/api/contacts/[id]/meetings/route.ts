import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { bookMeeting, listMeetings } from '@/lib/meetings';

/** Meetings for a contact. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  return NextResponse.json({ meetings: await listMeetings({ contactId: id }) });
}

/** Book a meeting on a contact. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await bookMeeting(
    id,
    {
      title: typeof body?.title === 'string' ? body.title : undefined,
      startsAt: typeof body?.startsAt === 'string' ? body.startsAt : undefined,
      durationMin: typeof body?.durationMin === 'number' ? body.durationMin : undefined,
      location: typeof body?.location === 'string' ? body.location : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    },
    { email: session.email, name: session.name },
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  await recordAudit(session, 'meeting_booked', 'sales_meeting', result.meeting.id, {
    contactId: id,
    startsAt: result.meeting.startsAt,
  });
  return NextResponse.json({ meeting: result.meeting }, { status: 201 });
}
