import { NextResponse } from 'next/server';
import { ingestInboundEmail } from '@/lib/inbound-email';

/**
 * Inbound email webhook — a contact's reply, threaded onto their timeline.
 * Verified via a shared secret (`?secret=` query or `x-webhook-secret` header matching
 * REHABSYNC_INBOUND_EMAIL_SECRET). Accepts JSON or form-encoded provider inbound-parse payloads.
 */
export async function POST(req: Request) {
  const secret = process.env['REHABSYNC_INBOUND_EMAIL_SECRET'];
  const url = new URL(req.url);
  const provided = url.searchParams.get('secret') ?? req.headers.get('x-webhook-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      payload = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      payload = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
    }
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const result = await ingestInboundEmail(payload);
  // Always 200 so the provider doesn't retry an unmatched (but well-formed) delivery.
  return NextResponse.json({ ok: true, ...result });
}
