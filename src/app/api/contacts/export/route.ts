import { NextResponse } from 'next/server';
import { and, desc } from 'drizzle-orm';
import { crmContacts, getDb } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { buildContactConditions, contactsToCsv } from '@/lib/contact-query';

/** Export the current contact list (honouring the same q/stage filter) as a CSV download. */
export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  const stage = url.searchParams.get('stage');
  const conditions = buildContactConditions(q, stage);

  const rows = await getDb()
    .select({
      name: crmContacts.name,
      email: crmContacts.email,
      phone: crmContacts.phone,
      clinicName: crmContacts.clinicName,
      stage: crmContacts.stage,
      source: crmContacts.source,
      ownerName: crmContacts.ownerName,
      estimatedValuePence: crmContacts.estimatedValuePence,
      tags: crmContacts.tags,
      lastContactedAt: crmContacts.lastContactedAt,
      createdAt: crmContacts.createdAt,
    })
    .from(crmContacts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(crmContacts.updatedAt))
    .limit(10000);

  await recordAudit(session, 'contacts_exported', 'crm_contact', null, {
    count: rows.length,
    q: q ?? undefined,
    stage: stage ?? undefined,
  });

  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const csv = `﻿${contactsToCsv(rows)}`;
  const filename = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
