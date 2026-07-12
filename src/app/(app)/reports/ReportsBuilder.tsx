'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, Save, BarChart3 } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { STAGE_LABELS, STAGE_ORDER, formatGbp } from '@/lib/stages';
import { DEAL_STAGE_LABELS, DEAL_STAGE_ORDER } from '@/lib/deals';

type Entity = 'contact' | 'deal';
type Metric = 'count' | 'sum_value';

interface ReportConfig {
  entity: Entity;
  metric: Metric;
  groupBy: string;
  stages: string[];
  owner: string;
  sinceDays: number | null;
}

interface ReportRow {
  key: string;
  label: string;
  value: number;
}

interface ReportResult {
  rows: ReportRow[];
  metric: Metric;
  metricLabel: string;
  valueIsPence: boolean;
  total: number;
  groupByLabel: string;
}

interface SavedReport {
  id: string;
  name: string;
  config: ReportConfig;
  createdBy: string | null;
}

interface CustomField {
  id: string;
  key: string;
  label: string;
  type: string;
  active: boolean;
}

const BASE_DIMENSIONS: Record<Entity, { key: string; label: string }[]> = {
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

const SINCE_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'All time', value: null },
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 12 months', value: 365 },
];

const DEFAULT_CONFIG: ReportConfig = {
  entity: 'contact',
  metric: 'count',
  groupBy: 'stage',
  stages: [],
  owner: '',
  sinceDays: null,
};

function fmtValue(value: number, isPence: boolean): string {
  return isPence ? formatGbp(value) : new Intl.NumberFormat('en-GB').format(value);
}

export function ReportsBuilder() {
  const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadSaved = useCallback(() => {
    fetch('/api/reports')
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((d: { reports: SavedReport[] }) => setSaved(d.reports))
      .catch(() => setSaved([]));
  }, []);

  useEffect(() => {
    loadSaved();
    fetch('/api/custom-fields?entity=contact')
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d: { fields: CustomField[] }) => setCustomFields(d.fields))
      .catch(() => setCustomFields([]));
  }, [loadSaved]);

  // Dimensions available for the current entity (+ custom select fields for contacts).
  const dimensions = useMemo(() => {
    const base = BASE_DIMENSIONS[config.entity];
    if (config.entity !== 'contact') return base;
    const cf = customFields
      .filter((f) => f.active && f.type === 'select')
      .map((f) => ({ key: `cf:${f.key}`, label: f.label }));
    return [...base, ...cf];
  }, [config.entity, customFields]);

  const stageChoices = config.entity === 'deal' ? DEAL_STAGE_ORDER : STAGE_ORDER;
  const stageLabels = config.entity === 'deal' ? DEAL_STAGE_LABELS : STAGE_LABELS;

  // Auto-run a live preview when the config changes (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      setError(null);
      fetch('/api/reports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
        .then(async (r) => {
          const d = (await r.json().catch(() => null)) as { result?: ReportResult; error?: string } | null;
          if (!r.ok) {
            setError(d?.error ?? 'Could not run report.');
            setResult(null);
            return;
          }
          setResult(d?.result ?? null);
        })
        .catch(() => setError('Could not run report.'));
    }, 250);
    return () => clearTimeout(t);
  }, [config]);

  function update(patch: Partial<ReportConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      // Reset an incompatible group-by when switching entity.
      if (patch.entity && !BASE_DIMENSIONS[patch.entity].some((d) => d.key === next.groupBy) && !next.groupBy.startsWith('cf:')) {
        next.groupBy = 'stage';
      }
      if (patch.entity) next.stages = [];
      return next;
    });
  }

  function toggleStage(stage: string) {
    setConfig((prev) => ({
      ...prev,
      stages: prev.stages.includes(stage) ? prev.stages.filter((s) => s !== stage) : [...prev.stages, stage],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('save');
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? 'Save failed.');
        return;
      }
      setName('');
      loadSaved();
    } finally {
      setBusy(null);
    }
  }

  async function openSaved(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/reports/${id}`);
      if (res.ok) {
        const d = (await res.json()) as { report: SavedReport; result?: ReportResult };
        setConfig({ ...DEFAULT_CONFIG, ...d.report.config });
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this report?')) return;
    setBusy(id);
    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      loadSaved();
    } finally {
      setBusy(null);
    }
  }

  const max = Math.max(...(result?.rows.map((r) => r.value) ?? [0]), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Builder */}
      <div className="lg:col-span-1 space-y-5">
        <Card title="Build a report" description="Pick what to measure, how to break it down, and filter.">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Measure</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={config.entity}
                  onChange={(e) => update({ entity: e.target.value as Entity })}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="contact">Contacts</option>
                  <option value="deal">Deals</option>
                </select>
                <select
                  value={config.metric}
                  onChange={(e) => update({ metric: e.target.value as Metric })}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="count">Count</option>
                  <option value="sum_value">Total value</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Group by</label>
              <select
                value={config.groupBy}
                onChange={(e) => update({ groupBy: e.target.value })}
                className="block w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                {dimensions.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Created</label>
              <select
                value={config.sinceDays ?? ''}
                onChange={(e) => update({ sinceDays: e.target.value ? Number(e.target.value) : null })}
                className="block w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                {SINCE_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ''}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Filter by stage (empty = all)</p>
              <div className="flex flex-wrap gap-1.5">
                {stageChoices.map((stage) => (
                  <button
                    type="button"
                    key={stage}
                    onClick={() => toggleStage(stage)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium border"
                    style={
                      config.stages.includes(stage)
                        ? { backgroundColor: 'var(--brand-primary)', color: '#fff', borderColor: 'var(--brand-primary)' }
                        : { borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }
                    }
                  >
                    {stageLabels[stage] ?? stage}
                  </button>
                ))}
              </div>
            </div>

            <Input label="Owner (exact name, optional)" value={config.owner} onChange={(e) => update({ owner: e.target.value })} placeholder="e.g. Jane Doe" />
          </div>
        </Card>

        <Card title="Saved reports">
          <form onSubmit={save} className="flex gap-2 mb-3">
            <div className="flex-1"><Input placeholder="Name this report" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <Button type="submit" size="sm" loading={busy === 'save'} disabled={!name.trim()}>
              <Save size={14} className="mr-1" /> Save
            </Button>
          </form>
          {saved.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No saved reports yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
              {saved.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                  <button onClick={() => void openSaved(r.id)} disabled={busy === r.id} className="text-left text-sm font-medium min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
                    {r.name}
                  </button>
                  <button onClick={() => void remove(r.id)} aria-label="Delete report" style={{ color: 'var(--color-error-text)' }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Result */}
      <div className="lg:col-span-2">
        <Card
          title={result ? `${result.metricLabel} by ${result.groupByLabel}` : 'Report'}
          description={result ? `${config.entity === 'deal' ? 'Deals' : 'Contacts'} · total ${fmtValue(result.total, result.valueIsPence)}` : 'Adjust the builder to see results.'}
        >
          {error ? (
            <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>
          ) : !result ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Running…</p>
          ) : result.rows.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <BarChart3 size={28} style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>No matching {config.entity === 'deal' ? 'deals' : 'contacts'}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2.5">
                {result.rows.map((row) => {
                  const pct = Math.max(2, Math.round((row.value / max) * 100));
                  return (
                    <div key={row.key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium truncate pr-2" style={{ color: 'var(--text-primary)' }}>{row.label}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtValue(row.value, result.valueIsPence)}</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    <th className="py-1.5">{result.groupByLabel}</th>
                    <th className="py-1.5 text-right">{result.metricLabel}</th>
                    <th className="py-1.5 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.key} className="border-t" style={{ borderColor: 'var(--border-secondary)' }}>
                      <td className="py-2 pr-2" style={{ color: 'var(--text-primary)' }}>{row.label}</td>
                      <td className="py-2 text-right" style={{ color: 'var(--text-primary)' }}>{fmtValue(row.value, result.valueIsPence)}</td>
                      <td className="py-2 text-right" style={{ color: 'var(--text-muted)' }}>
                        {result.total > 0 ? `${Math.round((row.value / result.total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
