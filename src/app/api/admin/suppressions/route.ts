import { NextResponse } from 'next/server';
import { desc, eq, ilike } from 'drizzle-orm';
import { getDb, salesSuppressions } from '@/db';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireAdmin } from '@/lib/route-auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** List suppressions (admin). ?q= filters by email substring. */
export async function GET(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
  const db = getDb();
  const rows = await db
    .select()
    .from(salesSuppressions)
    .where(q ? ilike(salesSuppressions.email, `%${q.replace(/[%_]/g, '\\$&')}%`) : undefined)
    .orderBy(desc(salesSuppressions.createdAt))
    .limit(200);

  return NextResponse.json({ suppressions: rows });
}

/** Manually suppress an address (admin) — e.g. verbal opt-outs or complaint handling. */
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { email?: string; reason?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? '';
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  const reason = body?.reason === 'unsubscribed' ? 'unsubscribed' : 'manual';

  const db = getDb();
  await db
    .insert(salesSuppressions)
    .values({ email, reason, source: `admin:${session.email}` })
    .onConflictDoNothing();
  await recordAudit(session, 'suppression_added', 'suppression', null, { email, reason });

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Remove a suppression (admin). Re-enables sending to the address, so it is audited. */
export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? '';
  if (!email) {
    return NextResponse.json({ error: 'email is required.' }, { status: 400 });
  }

  const db = getDb();
  const deleted = await db
    .delete(salesSuppressions)
    .where(eq(salesSuppressions.email, email))
    .returning({ email: salesSuppressions.email });
  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not suppressed.' }, { status: 404 });
  }
  await recordAudit(session, 'suppression_removed', 'suppression', null, { email });

  return NextResponse.json({ ok: true });
}
