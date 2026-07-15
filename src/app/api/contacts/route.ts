import { NextResponse } from 'next/server';
import { and, desc } from 'drizzle-orm';
import { CRM_STAGES, crmContacts, getDb } from '@/db';
import type { CrmStage } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { buildContactConditions } from '@/lib/contact-query';

export async function GET(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const conditions = buildContactConditions(url.searchParams.get('q'), url.searchParams.get('stage'));

  const rows = await getDb()
    .select({
      id: crmContacts.id,
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
      updatedAt: crmContacts.updatedAt,
    })
    .from(crmContacts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(crmContacts.updatedAt))
    .limit(500);

  return NextResponse.json({ contacts: rows });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    clinicName?: string;
    stage?: string;
    estimatedValuePence?: number | null;
    message?: string;
    tags?: string[];
  } | null;

  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  if (!name || !email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 });
  }
  const stage: CrmStage = (CRM_STAGES as readonly string[]).includes(body?.stage ?? '')
    ? (body!.stage as CrmStage)
    : 'new';
  const value =
    typeof body?.estimatedValuePence === 'number' && Number.isInteger(body.estimatedValuePence) && body.estimatedValuePence >= 0
      ? body.estimatedValuePence
      : null;

  const [inserted] = await getDb()
    .insert(crmContacts)
    .values({
      name,
      email,
      phone: body?.phone?.trim() || null,
      clinicName: body?.clinicName?.trim() || null,
      stage,
      source: 'manual',
      sourceDetail: `added by ${session.email}`,
      ownerName: session.name,
      estimatedValuePence: value,
      message: body?.message?.trim() || null,
      tags: (body?.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20),
    })
    .returning();

  await recordAudit(session, 'contact_created', 'crm_contact', inserted!.id, { email, stage });
  return NextResponse.json({ contact: inserted }, { status: 201 });
}
