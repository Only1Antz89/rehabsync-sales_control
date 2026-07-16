import { NextResponse } from 'next/server';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { createQuote, listQuotes } from '@/lib/quotes';
import type { QuoteInput } from '@/lib/quotes';

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  return NextResponse.json({ quotes: await listQuotes() });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as QuoteInput | null;
  const result = await createQuote(body ?? {}, session.email);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  await recordAudit(session, 'quote_created', 'sales_quote', result.quote.id, { number: result.quote.number });
  return NextResponse.json({ quote: result.quote }, { status: 201 });
}
