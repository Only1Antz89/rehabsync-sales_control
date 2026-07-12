import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { crmContacts, getDb, salesCustomFields, salesDeals } from '@/db';
import type { ReportConfig, ReportEntity, ReportMetric } from '@/db';
import { STAGE_LABELS } from './stages';

export interface ReportRow {
  key: string;
  label: string;
  value: number;
}

export interface ReportResult {
  rows: ReportRow[];
  metric: ReportMetric;
  metricLabel: string;
  valueIsPence: boolean;
  total: number;
  groupByLabel: string;
}

/** Group-by dimensions offered per entity (custom `select` fields are appended at runtime). */
export const REPORT_DIMENSIONS: Record<ReportEntity, { key: string; label: string }[]> = {
  contact: [
    { key: 'stage', label: 'Stage' },
    { key: 'owner', label: 'Owner' },
    { key: 'source', label: 'Source' },
    { key: 'month', label: 'Month created' },
  ],
  deal: [
    { key: 'stage', label: 'Stage' },
    { key: 'status', label: 'Status' },
    { key: 'owner', label: 'Owner' },
    { key: 'month', label: 'Month created' },
  ],
};

type DimKind = 'stage' | 'month' | 'plain';

function contactDimension(groupBy: string, customKeys: Set<string>): { expr: SQL; kind: DimKind } | null {
  switch (groupBy) {
    case 'stage':
      return { expr: sql`${crmContacts.stage}`, kind: 'stage' };
    case 'owner':
      return { expr: sql`coalesce(nullif(${crmContacts.ownerName}, ''), 'Unassigned')`, kind: 'plain' };
    case 'source':
      return { expr: sql`${crmContacts.source}`, kind: 'plain' };
    case 'month':
      return { expr: sql`to_char(date_trunc('month', ${crmContacts.createdAt}), 'YYYY-MM')`, kind: 'month' };
    default:
      if (groupBy.startsWith('cf:')) {
        const key = groupBy.slice(3);
        if (!/^[a-z0-9_]{1,60}$/.test(key) || !customKeys.has(key)) return null;
        return { expr: sql`coalesce(nullif(${crmContacts.customFields} ->> ${key}, ''), '(none)')`, kind: 'plain' };
      }
      return null;
  }
}

function dealDimension(groupBy: string): { expr: SQL; kind: DimKind } | null {
  switch (groupBy) {
    case 'stage':
      return { expr: sql`${salesDeals.stage}`, kind: 'stage' };
    case 'status':
      return { expr: sql`${salesDeals.status}`, kind: 'plain' };
    case 'owner':
      return { expr: sql`coalesce(nullif(${salesDeals.ownerName}, ''), 'Unassigned')`, kind: 'plain' };
    case 'month':
      return { expr: sql`to_char(date_trunc('month', ${salesDeals.createdAt}), 'YYYY-MM')`, kind: 'month' };
    default:
      return null;
  }
}

function labelFor(kind: DimKind, key: string): string {
  if (kind === 'stage') return STAGE_LABELS[key] ?? key.replace(/_/g, ' ');
  if (kind === 'month') {
    const d = new Date(`${key}-01T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  return key;
}

function dimensionLabel(entity: ReportEntity, groupBy: string): string {
  const known = REPORT_DIMENSIONS[entity].find((d) => d.key === groupBy);
  if (known) return known.label;
  if (groupBy.startsWith('cf:')) return groupBy.slice(3);
  return groupBy;
}

/**
 * Run an ad-hoc report. Dimensions and metrics are whitelisted (never free-text), so there's no
 * SQL-injection surface; filter values are always bound parameters.
 */
export async function runReport(config: ReportConfig): Promise<ReportResult | { error: string }> {
  const db = getDb();
  const entity: ReportEntity = config.entity === 'deal' ? 'deal' : 'contact';
  const metric: ReportMetric = config.metric === 'sum_value' ? 'sum_value' : 'count';

  // Custom select-field keys are valid contact dimensions.
  const customKeys = new Set<string>();
  if (entity === 'contact') {
    const defs = await db
      .select({ key: salesCustomFields.key })
      .from(salesCustomFields)
      .where(and(eq(salesCustomFields.entity, 'contact'), eq(salesCustomFields.active, true)));
    for (const d of defs) customKeys.add(d.key);
  }

  const dim = entity === 'contact' ? contactDimension(config.groupBy, customKeys) : dealDimension(config.groupBy);
  if (!dim) return { error: 'Unknown group-by dimension.' };

  const valueCol = entity === 'deal' ? salesDeals.amountPence : crmContacts.estimatedValuePence;
  const metricSql =
    metric === 'sum_value' ? sql<number>`coalesce(sum(${valueCol}), 0)::int` : sql<number>`count(*)::int`;

  const stageCol = entity === 'deal' ? salesDeals.stage : crmContacts.stage;
  const ownerCol = entity === 'deal' ? salesDeals.ownerName : crmContacts.ownerName;
  const createdCol = entity === 'deal' ? salesDeals.createdAt : crmContacts.createdAt;

  const conds: SQL[] = [];
  if (Array.isArray(config.stages) && config.stages.length) conds.push(inArray(stageCol, config.stages));
  if (config.owner) conds.push(eq(ownerCol, config.owner));
  if (typeof config.sinceDays === 'number' && config.sinceDays > 0) {
    conds.push(gte(createdCol, new Date(Date.now() - config.sinceDays * 86400000)));
  }

  const table = entity === 'deal' ? salesDeals : crmContacts;
  // Group/order by ordinal position: the dimension expression may bind a parameter (custom
  // fields), and re-rendering it in GROUP BY would emit a second, distinct placeholder that
  // Postgres treats as a different expression. Referencing output positions renders it once.
  const rows = await db
    .select({ key: sql<string>`${dim.expr}`, value: metricSql })
    .from(table)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(100);

  const mapped: ReportRow[] = rows.map((r) => {
    const key = r.key ?? '(none)';
    return { key, label: labelFor(dim.kind, key), value: Number(r.value) || 0 };
  });

  return {
    rows: mapped,
    metric,
    metricLabel: metric === 'sum_value' ? 'Value' : 'Count',
    valueIsPence: metric === 'sum_value',
    total: mapped.reduce((s, r) => s + r.value, 0),
    groupByLabel: dimensionLabel(entity, config.groupBy),
  };
}

/** Normalise/validate an incoming report config; returns an error string on invalid shape. */
export function cleanReportConfig(input: unknown): ReportConfig | { error: string } {
  const c = (input ?? {}) as Record<string, unknown>;
  const entity: ReportEntity = c['entity'] === 'deal' ? 'deal' : 'contact';
  const metric: ReportMetric = c['metric'] === 'sum_value' ? 'sum_value' : 'count';
  const groupBy = typeof c['groupBy'] === 'string' ? c['groupBy'] : '';
  if (!groupBy) return { error: 'Choose a group-by dimension.' };
  const stages = Array.isArray(c['stages'])
    ? (c['stages'] as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 20)
    : undefined;
  const owner = typeof c['owner'] === 'string' && c['owner'].trim() ? c['owner'].trim() : null;
  const sinceDaysRaw = Number(c['sinceDays']);
  const sinceDays = Number.isFinite(sinceDaysRaw) && sinceDaysRaw > 0 ? Math.min(3650, Math.round(sinceDaysRaw)) : null;
  return { entity, metric, groupBy, stages, owner, sinceDays };
}
