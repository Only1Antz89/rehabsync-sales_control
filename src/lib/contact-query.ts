import { ilike, or, eq, type SQL } from 'drizzle-orm';
import { CRM_STAGES, crmContacts } from '@/db';

/**
 * Shared WHERE builder for contact search — used by the list route and the CSV export so both honour
 * exactly the same `q` (name/email/clinic) + `stage` filter. Returns an array of conditions to be
 * combined with `and(...)` (empty ⇒ no filter).
 */
export function buildContactConditions(q?: string | null, stage?: string | null): SQL[] {
  const conditions: SQL[] = [];
  const term = q?.trim();
  if (term) {
    conditions.push(
      or(
        ilike(crmContacts.name, `%${term}%`),
        ilike(crmContacts.email, `%${term}%`),
        ilike(crmContacts.clinicName, `%${term}%`),
      )!,
    );
  }
  const s = stage?.trim();
  if (s && (CRM_STAGES as readonly string[]).includes(s)) {
    conditions.push(eq(crmContacts.stage, s));
  }
  return conditions;
}

export interface ExportableContact {
  name: string;
  email: string;
  phone: string | null;
  clinicName: string | null;
  stage: string;
  source: string;
  ownerName: string | null;
  estimatedValuePence: number | null;
  tags: string[];
  lastContactedAt: Date | string | null;
  createdAt: Date | string;
}

const CSV_HEADERS = [
  'Name',
  'Email',
  'Phone',
  'Clinic',
  'Stage',
  'Source',
  'Owner',
  'Estimated value (GBP)',
  'Tags',
  'Last contacted',
  'Created',
] as const;

/** RFC-4180 cell encoding with a spreadsheet formula-injection guard. */
function csvCell(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  // Neutralise cells that a spreadsheet would interpret as a formula (=, +, -, @, tab, CR).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isoOrEmpty(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Serialise contacts to a CSV string (CRLF line endings; caller may prepend a UTF-8 BOM). */
export function contactsToCsv(rows: ExportableContact[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.name),
        csvCell(r.email),
        csvCell(r.phone),
        csvCell(r.clinicName),
        csvCell(r.stage),
        csvCell(r.source),
        csvCell(r.ownerName),
        csvCell(r.estimatedValuePence != null ? (r.estimatedValuePence / 100).toFixed(2) : ''),
        csvCell((r.tags ?? []).join('; ')),
        csvCell(isoOrEmpty(r.lastContactedAt)),
        csvCell(isoOrEmpty(r.createdAt)),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}
