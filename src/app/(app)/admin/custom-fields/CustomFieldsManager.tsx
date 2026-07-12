'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { CUSTOM_FIELD_TYPES } from '@/db/schema';
import type { CustomFieldType } from '@/db/schema';

interface FieldRow {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  active: boolean;
  sortOrder: number;
}

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  boolean: 'Yes / No',
};

export function CustomFieldsManager() {
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [optionsCsv, setOptionsCsv] = useState('');

  const load = useCallback(() => {
    fetch('/api/custom-fields?entity=contact')
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d: { fields: FieldRow[] }) => setFields(d.fields))
      .catch(() => setFields([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const options = type === 'select' ? optionsCsv.split(',').map((o) => o.trim()).filter(Boolean) : [];
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, type, options }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? 'Create failed.');
        return;
      }
      setLabel('');
      setOptionsCsv('');
      setType('text');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(field: FieldRow) {
    setBusy(field.id);
    try {
      await fetch(`/api/custom-fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !field.active }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(field: FieldRow) {
    if (!window.confirm(`Delete “${field.label}”? Existing values on contacts are kept but hidden.`)) return;
    setBusy(field.id);
    try {
      await fetch(`/api/custom-fields/${field.id}`, { method: 'DELETE' });
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card title="New field">
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Referral source" required />
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CustomFieldType)}
                className="block w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          {type === 'select' && (
            <Input
              label="Options (comma separated)"
              value={optionsCsv}
              onChange={(e) => setOptionsCsv(e.target.value)}
              placeholder="Referral, Website, Event"
            />
          )}
          {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
          <Button type="submit" loading={busy === 'create'} disabled={!label.trim()}>Add field</Button>
        </form>
      </Card>

      <Card title="Fields" description="Inactive fields stay hidden on contacts and can't be used in reports.">
        {fields === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : fields.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No custom fields yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {fields.map((f) => (
              <li key={f.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {f.label}{' '}
                    <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{f.key}</span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {TYPE_LABELS[f.type]}
                    {f.type === 'select' && f.options.length ? ` · ${f.options.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={f.active ? 'success' : 'neutral'}>{f.active ? 'active' : 'hidden'}</Badge>
                  <Button size="sm" variant="secondary" disabled={busy === f.id} onClick={() => void toggleActive(f)}>
                    {f.active ? 'Hide' : 'Show'}
                  </Button>
                  <button onClick={() => void remove(f)} aria-label="Delete field" disabled={busy === f.id} style={{ color: 'var(--color-error-text)' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
