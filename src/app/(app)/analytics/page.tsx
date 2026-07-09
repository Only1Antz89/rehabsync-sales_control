import { desc, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  crmContacts,
  getDb,
  salesCampaignRecipients,
  salesCampaigns,
  salesEmailEvents,
} from '@/db';
import { Badge, Card } from '@/components/ui';
import { PIPELINE_STAGES, STAGE_LABELS, formatGbp } from '@/lib/stages';

export const dynamic = 'force-dynamic';

interface StageRow {
  stage: string;
  count: number;
  valuePence: number;
}

interface FunnelStep {
  stage: string;
  atOrBeyond: number;
  stepConversion: number | null; // % from the previous step; null on the first
}

interface WeekRow {
  week: string; // YYYY-MM-DD (Monday)
  count: number;
}

interface SourceRow {
  source: string;
  count: number;
}

interface UtmRow {
  campaign: string;
  source: string;
  count: number;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  sentAt: Date | null;
  recipients: number;
  sent: number;
  opens: number;
  clicks: number;
  unsubs: number;
  bounced: number;
}

interface OwnerRow {
  owner: string;
  contacts: number;
  customers: number;
  openValuePence: number;
}

interface AnalyticsData {
  totals: { total: number; new30: number; customers: number; openValuePence: number };
  funnel: FunnelStep[];
  churned: number;
  lost: number;
  byStageValue: StageRow[];
  weekly: WeekRow[];
  sources: SourceRow[];
  utm: UtmRow[];
  campaigns: CampaignRow[];
  owners: OwnerRow[];
  dbError: boolean;
}

function isoWeekStartUTC(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

async function loadAnalytics(): Promise<AnalyticsData> {
  try {
    const db = getDb();
    const since30 = new Date(Date.now() - 30 * 86400000);
    const since8w = new Date(Date.now() - 8 * 7 * 86400000);

    const weekExpr = sql<string>`(date_trunc('week', ${crmContacts.createdAt}))::date::text`;
    const utmCampaignExpr = sql<string>`coalesce(nullif(${crmContacts.utm}->>'utm_campaign', ''), '(no campaign)')`;
    const utmSourceExpr = sql<string>`coalesce(nullif(${crmContacts.utm}->>'utm_source', ''), '—')`;
    const ownerExpr = sql<string>`coalesce(nullif(${crmContacts.ownerName}, ''), 'Unassigned')`;

    const [byStage, totalsRes, weeklyRes, sourcesRes, utmRes, campaignList, ownersRes] =
      await Promise.all([
        db
          .select({
            stage: crmContacts.stage,
            count: sql<number>`count(*)::int`,
            valuePence: sql<number>`coalesce(sum(${crmContacts.estimatedValuePence}), 0)::int`,
          })
          .from(crmContacts)
          .groupBy(crmContacts.stage),
        db
          .select({
            total: sql<number>`count(*)::int`,
            new30: sql<number>`count(*) filter (where ${gte(crmContacts.createdAt, since30)})::int`,
            openValuePence: sql<number>`coalesce(sum(${crmContacts.estimatedValuePence}) filter (where ${crmContacts.stage} not in ('churned','lost')), 0)::int`,
          })
          .from(crmContacts),
        db
          .select({ week: weekExpr, count: sql<number>`count(*)::int` })
          .from(crmContacts)
          .where(gte(crmContacts.createdAt, since8w))
          .groupBy(weekExpr)
          .orderBy(weekExpr),
        db
          .select({ source: crmContacts.source, count: sql<number>`count(*)::int` })
          .from(crmContacts)
          .where(gte(crmContacts.createdAt, since30))
          .groupBy(crmContacts.source)
          .orderBy(desc(sql`count(*)`)),
        db
          .select({ campaign: utmCampaignExpr, source: utmSourceExpr, count: sql<number>`count(*)::int` })
          .from(crmContacts)
          .where(isNotNull(crmContacts.utm))
          .groupBy(utmCampaignExpr, utmSourceExpr)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
        db
          .select({
            id: salesCampaigns.id,
            name: salesCampaigns.name,
            status: salesCampaigns.status,
            sentAt: salesCampaigns.sentAt,
          })
          .from(salesCampaigns)
          .where(inArray(salesCampaigns.status, ['scheduled', 'sending', 'sent']))
          .orderBy(desc(salesCampaigns.createdAt))
          .limit(8),
        db
          .select({
            owner: ownerExpr,
            contacts: sql<number>`count(*)::int`,
            customers: sql<number>`count(*) filter (where ${crmContacts.stage} = 'customer')::int`,
            openValuePence: sql<number>`coalesce(sum(${crmContacts.estimatedValuePence}) filter (where ${crmContacts.stage} not in ('churned','lost')), 0)::int`,
          })
          .from(crmContacts)
          .groupBy(ownerExpr)
          .orderBy(desc(sql`count(*)`))
          .limit(8),
      ]);

    // Funnel: contacts currently AT OR BEYOND each pipeline stage (stage history isn't stored,
    // so this is the standard current-snapshot proxy; churned/lost sit outside the funnel).
    const countByStage = new Map(byStage.map((r) => [r.stage, r.count]));
    const funnel: FunnelStep[] = [];
    for (let i = 0; i < PIPELINE_STAGES.length; i += 1) {
      let atOrBeyond = 0;
      for (let j = i; j < PIPELINE_STAGES.length; j += 1) {
        const stage = PIPELINE_STAGES[j];
        if (stage) atOrBeyond += countByStage.get(stage) ?? 0;
      }
      const stage = PIPELINE_STAGES[i];
      if (!stage) continue;
      const prev = funnel[funnel.length - 1];
      funnel.push({
        stage,
        atOrBeyond,
        stepConversion: prev && prev.atOrBeyond > 0 ? Math.round((atOrBeyond / prev.atOrBeyond) * 100) : null,
      });
    }

    // Weekly new leads, gaps filled with zeroes (8 ISO weeks ending this week).
    const weekCounts = new Map(weeklyRes.map((r) => [r.week, r.count]));
    const weekly: WeekRow[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const key = isoWeekStartUTC(new Date(Date.now() - i * 7 * 86400000));
      weekly.push({ week: key, count: weekCounts.get(key) ?? 0 });
    }

    // Campaign performance: recipient statuses give sends; events give opens/clicks/unsubs.
    const campaignIds = campaignList.map((c) => c.id);
    const [recipAgg, eventAgg] = campaignIds.length
      ? await Promise.all([
          db
            .select({
              campaignId: salesCampaignRecipients.campaignId,
              total: sql<number>`count(*)::int`,
              sent: sql<number>`count(*) filter (where ${salesCampaignRecipients.status} not in ('pending','failed','suppressed'))::int`,
              bounced: sql<number>`count(*) filter (where ${salesCampaignRecipients.status} = 'bounced')::int`,
            })
            .from(salesCampaignRecipients)
            .where(inArray(salesCampaignRecipients.campaignId, campaignIds))
            .groupBy(salesCampaignRecipients.campaignId),
          db
            .select({
              campaignId: salesEmailEvents.campaignId,
              event: salesEmailEvents.event,
              uniques: sql<number>`count(distinct ${salesEmailEvents.email})::int`,
            })
            .from(salesEmailEvents)
            .where(inArray(salesEmailEvents.campaignId, campaignIds))
            .groupBy(salesEmailEvents.campaignId, salesEmailEvents.event),
        ])
      : [[], []];

    const recipByCampaign = new Map(recipAgg.map((r) => [r.campaignId, r]));
    const eventKey = (id: string | null, event: string) => `${id ?? ''}:${event}`;
    const eventsByCampaign = new Map(eventAgg.map((r) => [eventKey(r.campaignId, r.event), r.uniques]));

    const campaigns: CampaignRow[] = campaignList.map((c) => {
      const recip = recipByCampaign.get(c.id);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        sentAt: c.sentAt,
        recipients: recip?.total ?? 0,
        sent: recip?.sent ?? 0,
        opens: eventsByCampaign.get(eventKey(c.id, 'open')) ?? 0,
        clicks: eventsByCampaign.get(eventKey(c.id, 'click')) ?? 0,
        unsubs: eventsByCampaign.get(eventKey(c.id, 'unsub')) ?? 0,
        bounced: recip?.bounced ?? 0,
      };
    });

    return {
      totals: {
        total: totalsRes[0]?.total ?? 0,
        new30: totalsRes[0]?.new30 ?? 0,
        customers: countByStage.get('customer') ?? 0,
        openValuePence: totalsRes[0]?.openValuePence ?? 0,
      },
      funnel,
      churned: countByStage.get('churned') ?? 0,
      lost: countByStage.get('lost') ?? 0,
      byStageValue: byStage.filter((r) => !['churned', 'lost'].includes(r.stage) && r.valuePence > 0),
      weekly,
      sources: sourcesRes,
      utm: utmRes,
      campaigns,
      owners: ownersRes,
      dbError: false,
    };
  } catch (err) {
    console.error('[analytics] load failed', err);
    return {
      totals: { total: 0, new30: 0, customers: 0, openValuePence: 0 },
      funnel: [],
      churned: 0,
      lost: 0,
      byStageValue: [],
      weekly: [],
      sources: [],
      utm: [],
      campaigns: [],
      owners: [],
      dbError: true,
    };
  }
}

function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: color ?? 'var(--brand-primary)' }}
      />
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

function rate(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

export default async function AnalyticsPage() {
  const data = await loadAnalytics();
  const funnelMax = Math.max(...data.funnel.map((s) => s.atOrBeyond), 1);
  const weeklyMax = Math.max(...data.weekly.map((w) => w.count), 1);
  const sourceMax = Math.max(...data.sources.map((s) => s.count), 1);
  const valueMax = Math.max(...data.byStageValue.map((s) => s.valuePence), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Analytics
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Funnel, lead sources, pipeline value, campaign performance and owner activity.
        </p>
      </div>

      {data.dbError && (
        <p
          className="rounded-lg border-l-4 p-3 text-sm"
          style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}
        >
          Could not reach the database — showing empty metrics.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(
          [
            ['Total contacts', fmt(data.totals.total)],
            ['New (30 days)', fmt(data.totals.new30)],
            ['Customers', fmt(data.totals.customers)],
            ['Open pipeline value', formatGbp(data.totals.openValuePence)],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {label}
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
              {value}
            </p>
          </Card>
        ))}
      </div>

      <Card
        title="Funnel"
        description="Contacts currently at or beyond each stage, with step-to-step conversion. Churned and lost sit outside the funnel."
      >
        {data.totals.total === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No contacts yet.
          </p>
        ) : (
          <div className="space-y-3">
            {data.funnel.map((step) => (
              <div key={step.stage}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {STAGE_LABELS[step.stage] ?? step.stage}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {fmt(step.atOrBeyond)}
                    {step.stepConversion !== null && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {step.stepConversion}% of previous
                      </span>
                    )}
                  </span>
                </div>
                <Bar value={step.atOrBeyond} max={funnelMax} />
              </div>
            ))}
            <p className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
              Outside the funnel: {fmt(data.churned)} churned · {fmt(data.lost)} lost
            </p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="New leads per week" description="Last 8 ISO weeks (week commencing).">
          <div className="flex items-end gap-2 h-32">
            {data.weekly.map((w) => (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {w.count}
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(4, Math.round((w.count / weeklyMax) * 88))}px`,
                    backgroundColor: w.count > 0 ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                  }}
                />
                <span className="text-[10px] truncate w-full text-center" style={{ color: 'var(--text-muted)' }}>
                  {new Date(`${w.week}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline value by stage" description="Estimated value of open contacts (excludes churned/lost).">
          {data.byStageValue.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No estimated values recorded yet — set them on contacts to see value by stage.
            </p>
          ) : (
            <div className="space-y-3">
              {data.byStageValue.map((row) => (
                <div key={row.stage}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {STAGE_LABELS[row.stage] ?? row.stage}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {formatGbp(row.valuePence)} · {row.count} contact{row.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Bar value={row.valuePence} max={valueMax} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Lead sources (30 days)" description="Where new contacts came from.">
          {data.sources.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No new leads in the last 30 days.
            </p>
          ) : (
            <div className="space-y-3">
              {data.sources.map((row) => (
                <div key={row.source}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {row.source.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{fmt(row.count)}</span>
                  </div>
                  <Bar value={row.count} max={sourceMax} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="UTM campaigns" description="Contacts captured with UTM parameters (all time).">
          {data.utm.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No UTM-tagged leads yet — capture forms record utm_source / utm_campaign automatically.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1.5 pr-2">Campaign</th>
                  <th className="py-1.5 pr-2">Source</th>
                  <th className="py-1.5 text-right">Leads</th>
                </tr>
              </thead>
              <tbody>
                {data.utm.map((row, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="py-2 pr-2" style={{ color: 'var(--text-primary)' }}>
                      {row.campaign}
                    </td>
                    <td className="py-2 pr-2" style={{ color: 'var(--text-secondary)' }}>
                      {row.source}
                    </td>
                    <td className="py-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(row.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card title="Campaign performance" description="Latest campaigns — opens and clicks are unique recipients, from SMTP2GO events.">
        {data.campaigns.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No campaigns sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1.5 pr-3">Campaign</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3 text-right">Recipients</th>
                  <th className="py-1.5 pr-3 text-right">Sent</th>
                  <th className="py-1.5 pr-3 text-right">Open rate</th>
                  <th className="py-1.5 pr-3 text-right">Click rate</th>
                  <th className="py-1.5 pr-3 text-right">Unsubs</th>
                  <th className="py-1.5 text-right">Bounced</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td className="py-2 pr-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {c.name}
                      {c.sentAt && (
                        <span className="block text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                          {c.sentAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={c.status === 'sent' ? 'success' : c.status === 'sending' ? 'info' : 'neutral'}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {fmt(c.recipients)}
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {fmt(c.sent)}
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {rate(c.opens, c.sent)}
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {rate(c.clicks, c.sent)}
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                      {fmt(c.unsubs)}
                    </td>
                    <td className="py-2 text-right" style={{ color: 'var(--text-secondary)' }}>
                      {fmt(c.bounced)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Owner leaderboard" description="Contacts, customers won, and open pipeline value per owner.">
        {data.owners.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No contacts yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1.5 pr-3">Owner</th>
                  <th className="py-1.5 pr-3 text-right">Contacts</th>
                  <th className="py-1.5 pr-3 text-right">Customers</th>
                  <th className="py-1.5 text-right">Open value</th>
                </tr>
              </thead>
              <tbody>
                {data.owners.map((o) => (
                  <tr key={o.owner} className="border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                    <td
                      className="py-2 pr-3 font-medium"
                      style={{ color: o.owner === 'Unassigned' ? 'var(--text-muted)' : 'var(--text-primary)' }}
                    >
                      {o.owner}
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {fmt(o.contacts)}
                    </td>
                    <td className="py-2 pr-3 text-right" style={{ color: 'var(--text-primary)' }}>
                      {fmt(o.customers)}
                    </td>
                    <td className="py-2 text-right" style={{ color: 'var(--text-primary)' }}>
                      {formatGbp(o.openValuePence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
