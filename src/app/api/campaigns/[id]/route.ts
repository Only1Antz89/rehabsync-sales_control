import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb, salesCampaignRecipients, salesCampaigns, salesEmailEvents, salesEmailTemplates } from '@/db';
import { isResponse, requireAdmin, requireSession } from '@/lib/route-auth';
import { processCampaigns } from '@/lib/campaigns';
import { recordAudit } from '@/lib/audit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const { id } = await params;
  const db = getDb();

  const [campaign] = await db
    .select({
      id: salesCampaigns.id,
      name: salesCampaigns.name,
      status: salesCampaigns.status,
      segment: salesCampaigns.segment,
      scheduledAt: salesCampaigns.scheduledAt,
      sentAt: salesCampaigns.sentAt,
      templateId: salesCampaigns.templateId,
      templateName: salesEmailTemplates.name,
    })
    .from(salesCampaigns)
    .leftJoin(salesEmailTemplates, eq(salesEmailTemplates.id, salesCampaigns.templateId))
    .where(eq(salesCampaigns.id, id))
    .limit(1);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const [recipientStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where status in ('sent','delivered','opened','clicked'))::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      suppressed: sql<number>`count(*) filter (where status = 'suppressed')::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    })
    .from(salesCampaignRecipients)
    .where(eq(salesCampaignRecipients.campaignId, id));

  const events = await db
    .select({ event: salesEmailEvents.event, count: sql<number>`count(distinct ${salesEmailEvents.email})::int` })
    .from(salesEmailEvents)
    .where(eq(salesEmailEvents.campaignId, id))
    .groupBy(salesEmailEvents.event);

  return NextResponse.json({
    campaign,
    recipients: recipientStats,
    events: Object.fromEntries(events.map((e) => [e.event, e.count])),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    action?: 'send_now' | 'schedule' | 'cancel';
    scheduledAt?: string | null;
    name?: string;
    segment?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const db = getDb();
  const [campaign] = await db.select().from(salesCampaigns).where(eq(salesCampaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Sending/scheduling/cancelling is admin-only; editing a draft is open to all users.
  if (body.action) {
    const admin = await requireAdmin();
    if (isResponse(admin)) return admin;

    if (body.action === 'send_now') {
      if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
        return NextResponse.json({ error: `Cannot send a ${campaign.status} campaign` }, { status: 400 });
      }
      await db
        .update(salesCampaigns)
        .set({ status: 'scheduled', scheduledAt: new Date(), updatedAt: new Date() })
        .where(eq(salesCampaigns.id, id));
      await processCampaigns(id);
      await recordAudit(admin, 'campaign_sent', 'sales_campaign', id, {});
      const [after] = await db.select().from(salesCampaigns).where(eq(salesCampaigns.id, id)).limit(1);
      return NextResponse.json({ campaign: after });
    }
    if (body.action === 'schedule') {
      if (!body.scheduledAt) return NextResponse.json({ error: 'scheduledAt required' }, { status: 400 });
      const [after] = await db
        .update(salesCampaigns)
        .set({ status: 'scheduled', scheduledAt: new Date(body.scheduledAt), updatedAt: new Date() })
        .where(eq(salesCampaigns.id, id))
        .returning();
      await recordAudit(admin, 'campaign_scheduled', 'sales_campaign', id, { scheduledAt: body.scheduledAt });
      return NextResponse.json({ campaign: after });
    }
    // cancel
    const [after] = await db
      .update(salesCampaigns)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(salesCampaigns.id, id))
      .returning();
    await recordAudit(admin, 'campaign_cancelled', 'sales_campaign', id, {});
    return NextResponse.json({ campaign: after });
  }

  const session = await requireSession();
  if (isResponse(session)) return session;
  if (campaign.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft campaigns can be edited' }, { status: 400 });
  }
  const values: Partial<typeof salesCampaigns.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) values.name = body.name.trim();
  if (body.segment !== undefined) {
    const raw = (body.segment ?? {}) as Record<string, unknown>;
    const arr = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
    values.segment = {
      ...(arr(raw['stages']).length ? { stages: arr(raw['stages']) } : {}),
      ...(arr(raw['tags']).length ? { tags: arr(raw['tags']) } : {}),
      ...(arr(raw['sources']).length ? { sources: arr(raw['sources']) } : {}),
    };
  }
  const [after] = await db.update(salesCampaigns).set(values).where(eq(salesCampaigns.id, id)).returning();
  return NextResponse.json({ campaign: after });
}
