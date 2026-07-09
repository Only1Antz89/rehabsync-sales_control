'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { STAGE_LABELS, STAGE_ORDER } from '@/lib/stages';

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  templateName: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  recipients: number;
}

interface Template {
  id: string;
  name: string;
}

interface Report {
  campaign: { id: string; name: string; status: string };
  recipients: { total: number; sent: number; failed: number; suppressed: number; pending: number };
  events: Record<string, number>;
}

function statusVariant(status: string): BadgeVariant {
  if (status === 'sent') return 'success';
  if (status === 'cancelled') return 'error';
  if (status === 'sending' || status === 'scheduled') return 'info';
  return 'neutral';
}

export function CampaignsManager({ isAdmin }: { isAdmin: boolean }) {
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // New-campaign form
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [stages, setStages] = useState<Set<string>>(new Set());
  const [tagsCsv, setTagsCsv] = useState('');
  const [audience, setAudience] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch('/api/campaigns')
      .then((res) => (res.ok ? res.json() : { campaigns: [] }))
      .then((d: { campaigns: CampaignRow[] }) => setCampaigns(d.campaigns))
      .catch(() => setCampaigns([]));
    fetch('/api/templates')
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((d: { templates: Template[] }) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const segment = useCallback(() => {
    const tags = tagsCsv.split(',').map((t) => t.trim()).filter(Boolean);
    return {
      ...(stages.size ? { stages: [...stages] } : {}),
      ...(tags.length ? { tags } : {}),
    };
  }, [stages, tagsCsv]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment: segment() }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((d: { count: number } | null) => setAudience(d?.count ?? null))
        .catch(() => setAudience(null));
    }, 300);
    return () => clearTimeout(t);
  }, [segment]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, templateId, segment: segment() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Create failed.');
        return;
      }
      setName('');
      setStages(new Set());
      setTagsCsv('');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: 'send_now' | 'cancel') {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Action failed.');
      }
      load();
      if (report?.campaign.id === id) void openReport(id);
    } finally {
      setBusy(null);
    }
  }

  async function openReport(id: string) {
    const res = await fetch(`/api/campaigns/${id}`);
    if (res.ok) setReport((await res.json()) as Report);
  }

  return (
    <div className="space-y-5">
      <Card title="New campaign" description="Pick a template and an audience. Suppressed/unsubscribed contacts are always excluded.">
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="July demo-follow-ups" required />
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
                className="block w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                <option value="">Choose…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Stages (empty = all)</p>
            <div className="flex flex-wrap gap-2">
              {STAGE_ORDER.map((stage) => (
                <button
                  type="button"
                  key={stage}
                  onClick={() =>
                    setStages((prev) => {
                      const next = new Set(prev);
                      if (next.has(stage)) next.delete(stage);
                      else next.add(stage);
                      return next;
                    })
                  }
                  className="rounded-full px-3 py-1 text-xs font-medium border"
                  style={
                    stages.has(stage)
                      ? { backgroundColor: 'var(--brand-primary)', color: '#fff', borderColor: 'var(--brand-primary)' }
                      : { borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }
                  }
                >
                  {STAGE_LABELS[stage]}
                </button>
              ))}
            </div>
          </div>
          <Input label="Tags (comma separated, empty = all)" value={tagsCsv} onChange={(e) => setTagsCsv(e.target.value)} placeholder="north, priority" />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Audience: <strong style={{ color: 'var(--text-primary)' }}>{audience ?? '…'}</strong> contact{audience === 1 ? '' : 's'} after suppressions.
          </p>
          {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
          <Button type="submit" loading={busy === 'create'}>Create draft</Button>
        </form>
      </Card>

      <Card title="Campaigns">
        {campaigns === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No campaigns yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => void openReport(campaign.id)} className="text-left min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{campaign.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {campaign.templateName ?? 'no template'} · {campaign.recipients} recipient{campaign.recipients === 1 ? '' : 's'}
                    {campaign.sentAt ? ` · sent ${new Date(campaign.sentAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                  {isAdmin && (campaign.status === 'draft' || campaign.status === 'scheduled') && (
                    <Button size="sm" disabled={busy === campaign.id} onClick={() => void act(campaign.id, 'send_now')}>
                      Send now
                    </Button>
                  )}
                  {isAdmin && campaign.status !== 'sent' && campaign.status !== 'cancelled' && (
                    <Button size="sm" variant="secondary" disabled={busy === campaign.id} onClick={() => void act(campaign.id, 'cancel')}>
                      Cancel
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isAdmin && (
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            You can draft campaigns; sending needs an admin.
          </p>
        )}
      </Card>

      {report && (
        <Card title={`Report: ${report.campaign.name}`} description="Delivery and engagement (unique recipients per event).">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ['Recipients', report.recipients.total],
              ['Sent', report.recipients.sent],
              ['Delivered', report.events['delivered'] ?? 0],
              ['Opened', report.events['open'] ?? 0],
              ['Clicked', report.events['click'] ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3 text-center" style={{ borderColor: 'var(--border-primary)' }}>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Failed: {report.recipients.failed} · Suppressed: {report.recipients.suppressed} · Pending: {report.recipients.pending} · Unsubscribed: {report.events['unsub'] ?? 0} · Bounced: {report.events['bounce'] ?? 0}
          </p>
        </Card>
      )}
    </div>
  );
}
