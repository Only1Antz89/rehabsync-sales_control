import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb, salesCampaignRecipients, salesCampaigns, salesEmailTemplates } from '@/db';
import type { CampaignSegment } from '@/db';
import { isResponse, requireSession } from '@/lib/route-auth';
import { recordAudit } from '@/lib/audit';

function cleanSegment(input: unknown): CampaignSegment {
  const raw = (input ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : undefined;
  const segment: CampaignSegment = {};
  const stages = arr(raw['stages']);
  const tags = arr(raw['tags']);
  const sources = arr(raw['sources']);
  if (stages?.length) segment.stages = stages;
  if (tags?.length) segment.tags = tags;
  if (sources?.length) segment.sources = sources;
  return segment;
}

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const db = getDb();

  const campaigns = await db
    .select({
      id: salesCampaigns.id,
      name: salesCampaigns.name,
      status: salesCampaigns.status,
      segment: salesCampaigns.segment,
      scheduledAt: salesCampaigns.scheduledAt,
      sentAt: salesCampaigns.sentAt,
      createdBy: salesCampaigns.createdBy,
      createdAt: salesCampaigns.createdAt,
      templateName: salesEmailTemplates.name,
      recipients: sql<number>`(select count(*)::int from ${salesCampaignRecipients} r where r.campaign_id = ${salesCampaigns.id})`,
    })
    .from(salesCampaigns)
    .leftJoin(salesEmailTemplates, eq(salesEmailTemplates.id, salesCampaigns.templateId))
    .orderBy(desc(salesCampaigns.createdAt))
    .limit(100);

  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (isResponse(session)) return session;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    templateId?: string;
    segment?: unknown;
  } | null;
  const name = body?.name?.trim();
  if (!name || !body?.templateId) {
    return NextResponse.json({ error: 'name and templateId are required' }, { status: 400 });
  }

  const [campaign] = await getDb()
    .insert(salesCampaigns)
    .values({
      name,
      templateId: body.templateId,
      segment: cleanSegment(body.segment),
      createdBy: session.email,
    })
    .returning();
  await recordAudit(session, 'campaign_created', 'sales_campaign', campaign!.id, { name });
  return NextResponse.json({ campaign }, { status: 201 });
}
