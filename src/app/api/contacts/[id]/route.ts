import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { CRM_STAGES, crmActivities, crmContacts, getDb, salesCustomFields, salesTasks } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';
import { enrollOnStageEntered } from '@/lib/sequences';
import { mergeCustomFields } from '@/lib/custom-fields';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const [activities, tasks] = await Promise.all([
    db
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.contactId, id))
      .orderBy(desc(crmActivities.createdAt))
      .limit(100),
    db
      .select()
      .from(salesTasks)
      .where(eq(salesTasks.contactId, id))
      .orderBy(desc(salesTasks.createdAt))
      .limit(50),
  ]);

  return NextResponse.json({ contact, activities, tasks });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [existing] = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string | null;
    clinicName?: string | null;
    stage?: string;
    ownerName?: string | null;
    estimatedValuePence?: number | null;
    message?: string | null;
    tags?: string[];
    meetingUrl?: string | null;
    scheduledAt?: string | null;
    companyId?: string | null;
    customFields?: Record<string, unknown> | null;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const values: Partial<typeof crmContacts.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    values.name = name;
  }
  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: 'email cannot be empty' }, { status: 400 });
    values.email = email;
  }
  if (body.phone !== undefined) values.phone = body.phone?.trim() || null;
  if (body.clinicName !== undefined) values.clinicName = body.clinicName?.trim() || null;
  if (body.ownerName !== undefined) values.ownerName = body.ownerName?.trim() || null;
  if (body.message !== undefined) values.message = body.message?.trim() || null;
  if (body.meetingUrl !== undefined) values.meetingUrl = body.meetingUrl?.trim() || null;
  if (body.scheduledAt !== undefined) {
    values.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  }
  if (body.estimatedValuePence !== undefined) {
    values.estimatedValuePence =
      typeof body.estimatedValuePence === 'number' &&
      Number.isInteger(body.estimatedValuePence) &&
      body.estimatedValuePence >= 0
        ? body.estimatedValuePence
        : null;
  }
  if (body.tags !== undefined) {
    values.tags = body.tags.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  }
  if (body.companyId !== undefined) values.companyId = body.companyId || null;
  if (body.customFields && typeof body.customFields === 'object') {
    const defs = await db
      .select()
      .from(salesCustomFields)
      .where(and(eq(salesCustomFields.entity, 'contact'), eq(salesCustomFields.active, true)));
    const current = (existing.customFields ?? {}) as Record<string, unknown>;
    values.customFields = mergeCustomFields(current, body.customFields, defs);
  }

  const stageChanged =
    body.stage !== undefined &&
    body.stage !== existing.stage &&
    (CRM_STAGES as readonly string[]).includes(body.stage);
  if (stageChanged) values.stage = body.stage;

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ contact: existing });
  }
  values.updatedAt = new Date();

  const [updated] = await db
    .update(crmContacts)
    .set(values)
    .where(eq(crmContacts.id, id))
    .returning();

  if (stageChanged) {
    // Same convention the platform's admin CRM console uses for its timeline.
    await db.insert(crmActivities).values({
      contactId: id,
      type: 'stage_change',
      body: `${existing.stage} → ${body.stage}`,
      actorName: session.name,
    });
    await recordAudit(session, 'stage_changed', 'crm_contact', id, {
      from: existing.stage,
      to: body.stage,
    });
    // Workflow automation: auto-enrol into any sequence configured for this stage.
    if (body.stage) await enrollOnStageEntered(id, body.stage).catch(() => undefined);
  } else {
    await recordAudit(session, 'contact_updated', 'crm_contact', id, {
      changed: Object.keys(values).filter((k) => k !== 'updatedAt'),
    });
  }

  return NextResponse.json({ contact: updated });
}
