import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { findDuplicateGroups } from '@/lib/contact-dedupe';

/** List groups of likely-duplicate contacts (shared email, or same name + clinic). */
export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const groups = await findDuplicateGroups();
  return NextResponse.json({ groups });
}
