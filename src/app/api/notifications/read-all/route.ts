import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { markAllRead } from '@/lib/notifications';

/** Mark all of the current user's notifications read. */
export async function POST() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const updated = await markAllRead(session.email);
  return NextResponse.json({ updated });
}
