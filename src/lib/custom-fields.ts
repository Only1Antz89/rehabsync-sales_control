import type { CustomFieldType, salesCustomFields } from '@/db/schema';
import { CUSTOM_FIELD_TYPES } from '@/db/schema';

export type FieldDef = typeof salesCustomFields.$inferSelect;

/** Turn a label into a stable snake_case key (a–z, 0–9, _). */
export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export function isCustomFieldType(v: unknown): v is CustomFieldType {
  return typeof v === 'string' && (CUSTOM_FIELD_TYPES as readonly string[]).includes(v);
}

/**
 * Coerce a single incoming value to the field's type. Returns `null` to clear the value
 * (empty/invalid), or the normalised value. `select` values must be one of the field's options.
 */
export function coerceFieldValue(def: Pick<FieldDef, 'type' | 'options'>, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (def.type) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === 1 || raw === '1';
    case 'date': {
      const s = String(raw).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime()) ? s : null;
    }
    case 'select': {
      const s = String(raw);
      return def.options.includes(s) ? s : null;
    }
    default: {
      const s = String(raw).trim();
      return s ? s.slice(0, 500) : null;
    }
  }
}

/**
 * Merge incoming custom-field values onto the existing bag, keeping only keys that map to an
 * active definition. Keys coerced to `null` are removed. Returns a fresh object.
 */
export function mergeCustomFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  defs: FieldDef[],
): Record<string, unknown> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, unknown> = { ...existing };
  for (const [key, raw] of Object.entries(incoming)) {
    const def = byKey.get(key);
    if (!def) continue; // ignore unknown/inactive keys
    const value = coerceFieldValue(def, raw);
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}
