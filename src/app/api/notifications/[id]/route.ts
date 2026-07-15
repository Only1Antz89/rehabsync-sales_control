import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { markRead } from '@/lib/notifications';

/** Mark a single notification read (scoped to the current user). */
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  await markRead(id, session.email);
  return NextResponse.json({ ok: true });
}
