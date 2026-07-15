import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { listNotifications, unreadCount } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/** The current user's notifications + unread count. */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const [notifications, unread] = await Promise.all([
    listNotifications(session.email),
    unreadCount(session.email),
  ]);
  return NextResponse.json({ notifications, unread });
}
