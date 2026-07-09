import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { crmContacts, getDb, salesCaptureForms } from '@/db';

// Public lead-capture endpoint: honeypot + per-IP rate limit; no auth by design.
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 20;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(`${ip}:${slug}`)) {
    return NextResponse.json({ error: 'Too many submissions — try again later' }, { status: 429 });
  }

  const [form] = await getDb()
    .select()
    .from(salesCaptureForms)
    .where(and(eq(salesCaptureForms.slug, slug), eq(salesCaptureForms.active, true)))
    .limit(1);
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    clinicName?: string;
    message?: string;
    website?: string; // honeypot — real users never fill this hidden field
    utm?: Record<string, string>;
  } | null;

  if (body?.website?.trim()) {
    return NextResponse.json({ ok: true }); // silently swallow bot submissions
  }
  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  if (!name || !email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'A name and valid email are required' }, { status: 400 });
  }

  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(body?.utm ?? {})) {
    if (/^utm_[a-z]+$/.test(k) && typeof v === 'string') utm[k] = v.slice(0, 120);
  }

  await getDb()
    .insert(crmContacts)
    .values({
      name: name.slice(0, 160),
      email,
      phone: body?.phone?.trim().slice(0, 40) || null,
      clinicName: body?.clinicName?.trim().slice(0, 200) || null,
      message: body?.message?.trim().slice(0, 2000) || null,
      source: form.sourceTag,
      sourceDetail: `capture form: ${form.name}`,
      utm: Object.keys(utm).length ? utm : null,
    });

  return NextResponse.json({ ok: true, redirectUrl: form.redirectUrl });
}
