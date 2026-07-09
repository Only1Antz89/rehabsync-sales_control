'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface SuppressionRow {
  email: string;
  reason: string;
  source: string | null;
  createdAt: string;
}

const REASON_VARIANTS: Record<string, BadgeVariant> = {
  unsubscribed: 'neutral',
  bounced: 'warning',
  spam: 'error',
  manual: 'info',
};

export function SuppressionsManager() {
  const [rows, setRows] = useState<SuppressionRow[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('manual');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/admin/suppressions?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { suppressions: SuppressionRow[] }) => setRows(d.suppressions))
      .catch(() => setError('Could not load suppressions.'));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  async function addSuppression(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/suppressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, reason: newReason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Could not add suppression.');
        return;
      }
      setNewEmail('');
      setShowAdd(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeSuppression(email: string) {
    if (!window.confirm(`Remove ${email} from the suppression list?\n\nCampaigns will be able to email this address again.`)) {
      return;
    }
    setError(null);
    const res = await fetch('/api/admin/suppressions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not remove suppression.');
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-56">
          <Input placeholder="Search email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>
          <Plus size={14} className="mr-1" /> Suppress an address
        </Button>
      </div>

      {showAdd && (
        <Card
          title="Suppress an address"
          description="Use for verbal opt-outs or complaint handling. The address is excluded from every future send."
        >
          <form onSubmit={addSuppression} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Reason
              </label>
              <select
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                <option value="manual">Manual opt-out</option>
                <option value="unsubscribed">Unsubscribed</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" loading={busy}>
                Suppress
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {rows === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No suppressed addresses{q ? ' match your search' : ' yet'}. Unsubscribes, bounces and spam
            complaints land here automatically.
          </p>
        </Card>
      ) : (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wide border-b"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border-primary)' }}
              >
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {row.email}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={REASON_VARIANTS[row.reason] ?? 'neutral'}>{row.reason}</Badge>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {row.source ?? '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(row.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" onClick={() => removeSuppression(row.email)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
