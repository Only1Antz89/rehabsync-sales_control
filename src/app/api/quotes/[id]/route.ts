import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, salesQuotes } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { getQuote, updateQuote } from '@/lib/quotes';
import type { QuoteInput } from '@/lib/quotes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as (QuoteInput & { status?: string }) | null;
  const result = await updateQuote(id, body ?? {});
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  await recordAudit(session, 'quote_updated', 'sales_quote', id, { status: result.quote.status });
  return NextResponse.json({ quote: result.quote });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  await getDb().delete(salesQuotes).where(eq(salesQuotes.id, id));
  await recordAudit(session, 'quote_deleted', 'sales_quote', id, {});
  return NextResponse.json({ ok: true });
}
