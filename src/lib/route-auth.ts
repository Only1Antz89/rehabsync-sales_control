import { NextResponse } from 'next/server';
import { getSession } from './auth';
import type { Session } from './auth';

/** Route-handler guard: any authenticated Sales Centre session (user, admin, or platform SSO). */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

export function isResponse(value: Session | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Route-handler guard for admin-only endpoints (tool admin or platform super-admin). */
export async function requireAdmin(): Promise<Session | NextResponse> {
  const session = await requireSession();
  if (isResponse(session)) return session;
  if (session.role !== 'admin' && session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return session;
}
