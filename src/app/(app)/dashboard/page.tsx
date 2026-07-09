import Link from 'next/link';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { crmContacts, getDb, salesTasks } from '@/db';
import { getSession } from '@/lib/auth';
import { Badge, Card } from '@/components/ui';
import { STAGE_LABELS, formatGbp, stageVariant } from '@/lib/stages';

export const dynamic = 'force-dynamic';

interface DueTask {
  id: string;
  title: string;
  dueAt: Date | null;
  contactId: string | null;
  contactName: string | null;
}

interface DashboardData {
  total: number;
  newThisMonth: number;
  byStage: Array<{ stage: string; count: number }>;
  pipelineValuePence: number;
  recent: Array<{
    id: string;
    name: string;
    clinicName: string | null;
    stage: string;
    source: string;
    createdAt: Date;
  }>;
  dueTasks: DueTask[];
  dbError: boolean;
}

async function loadDashboard(): Promise<DashboardData> {
  try {
    const db = getDb();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [totals, byStage, recent, dueTasks] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          newThisMonth: sql<number>`count(*) filter (where ${gte(crmContacts.createdAt, monthStart)})::int`,
          pipelineValuePence: sql<number>`coalesce(sum(${crmContacts.estimatedValuePence}) filter (where ${crmContacts.stage} not in ('churned','lost')), 0)::int`,
        })
        .from(crmContacts),
      db
        .select({ stage: crmContacts.stage, count: sql<number>`count(*)::int` })
        .from(crmContacts)
        .groupBy(crmContacts.stage),
      db
        .select({
          id: crmContacts.id,
          name: crmContacts.name,
          clinicName: crmContacts.clinicName,
          stage: crmContacts.stage,
          source: crmContacts.source,
          createdAt: crmContacts.createdAt,
        })
        .from(crmContacts)
        .orderBy(desc(crmContacts.createdAt))
        .limit(8),
      db
        .select({
          id: salesTasks.id,
          title: salesTasks.title,
          dueAt: salesTasks.dueAt,
          contactId: salesTasks.contactId,
          contactName: crmContacts.name,
        })
        .from(salesTasks)
        .leftJoin(crmContacts, eq(crmContacts.id, salesTasks.contactId))
        .where(and(eq(salesTasks.status, 'open'), lt(salesTasks.dueAt, endOfToday)))
        .orderBy(salesTasks.dueAt)
        .limit(6),
    ]);

    return {
      total: totals[0]?.total ?? 0,
      newThisMonth: totals[0]?.newThisMonth ?? 0,
      byStage,
      pipelineValuePence: totals[0]?.pipelineValuePence ?? 0,
      recent,
      dueTasks,
      dbError: false,
    };
  } catch {
    return {
      total: 0,
      newThisMonth: 0,
      byStage: [],
      pipelineValuePence: 0,
      recent: [],
      dueTasks: [],
      dbError: true,
    };
  }
}

export default async function DashboardPage() {
  const [session, data] = await Promise.all([getSession(), loadDashboard()]);
  const firstName = (session?.name ?? '').split(' ')[0] || 'there';

  const stageOrder = Object.keys(STAGE_LABELS);
  const byStage = [...data.byStage].sort(
    (a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Welcome back, {firstName}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Your sales pipeline at a glance.
        </p>
      </div>

      {data.dbError && (
        <div
          className="rounded-lg border-l-4 p-3 text-sm"
          style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}
        >
          Could not reach the database — check REHABSYNC_DATABASE_URL. Showing empty metrics.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Total contacts
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {data.total}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            New this month
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--brand-primary)' }}>
            {data.newThisMonth}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Open pipeline value
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {formatGbp(data.pipelineValuePence)}
          </p>
        </Card>
      </div>

      {data.dueTasks.length > 0 && (
        <Card title="Needs attention" description="Open tasks due today or overdue.">
          <ul className="space-y-2">
            {data.dueTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
                <span style={{ color: 'var(--text-primary)' }}>
                  {task.title}
                  {task.contactId && task.contactName && (
                    <Link href={`/contacts/${task.contactId}`} className="underline ml-1" style={{ color: 'var(--brand-primary)' }}>
                      {task.contactName}
                    </Link>
                  )}
                </span>
                <span className="text-xs shrink-0" style={{ color: 'var(--color-warning-text)' }}>
                  {task.dueAt ? task.dueAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/tasks" className="mt-3 inline-block text-sm underline" style={{ color: 'var(--brand-primary)' }}>
            All tasks →
          </Link>
        </Card>
      )}

      <Card title="Pipeline by stage" description="Contacts in each stage of the sales funnel.">
        {byStage.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No contacts yet — new demo requests from the marketing site land here automatically.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {byStage.map((row) => (
              <div
                key={row.stage}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <Badge variant={stageVariant(row.stage)}>{STAGE_LABELS[row.stage] ?? row.stage}</Badge>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Recent leads" description="Latest contacts across all sources.">
        {data.recent.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing yet.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {data.recent.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {contact.name}
                    {contact.clinicName ? (
                      <span style={{ color: 'var(--text-muted)' }}> · {contact.clinicName}</span>
                    ) : null}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {contact.source.replace(/_/g, ' ')} ·{' '}
                    {contact.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <Badge variant={stageVariant(contact.stage)}>
                  {STAGE_LABELS[contact.stage] ?? contact.stage}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
