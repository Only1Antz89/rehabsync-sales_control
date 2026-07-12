import { NextResponse } from 'next/server';
import { recordAudit } from '@/lib/audit';
import { isResponse, requireSession } from '@/lib/route-auth';
import { enrollContact } from '@/lib/sequences';

/** Enrol a contact into this sequence. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { contactId?: string } | null;
  const contactId = body?.contactId?.trim();
  if (!contactId) return NextResponse.json({ error: 'contactId is required.' }, { status: 400 });

  const result = await enrollContact(id, contactId, session.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  await recordAudit(session, 'sequence_enrolled', 'sales_sequence', id, { contactId });
  return NextResponse.json({ ok: true }, { status: 201 });
}
