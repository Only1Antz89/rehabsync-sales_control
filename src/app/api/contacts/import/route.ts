import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { crmContacts, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

interface ImportRow {
  name?: string;
  email?: string;
  phone?: string;
  clinicName?: string;
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as { rows?: ImportRow[]; tags?: string[] } | null;
  const rows = (body?.rows ?? []).slice(0, 500);
  const tags = (body?.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 10);
  if (rows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 });

  const db = getDb();
  const existing = await db
    .select({ email: sql<string>`lower(${crmContacts.email})` })
    .from(crmContacts);
  const known = new Set(existing.map((r) => r.email));

  let created = 0;
  let skipped = 0;
  const seenInBatch = new Set<string>();
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    const name = row.name?.trim();
    if (!email || !name || !/.+@.+\..+/.test(email) || known.has(email) || seenInBatch.has(email)) {
      skipped += 1;
      continue;
    }
    seenInBatch.add(email);
    await db.insert(crmContacts).values({
      name: name.slice(0, 160),
      email,
      phone: row.phone?.trim().slice(0, 40) || null,
      clinicName: row.clinicName?.trim().slice(0, 200) || null,
      source: 'import',
      sourceDetail: `CSV import by ${session.email}`,
      tags,
    });
    created += 1;
  }

  await recordAudit(session, 'contacts_imported', 'crm_contact', null, { created, skipped });
  return NextResponse.json({ created, skipped });
}
