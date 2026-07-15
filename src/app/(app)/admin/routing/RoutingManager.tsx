'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';

interface Routing {
  enabled: boolean;
  strategy: string;
  pool: string[];
  cursor: number;
  updatedBy: string | null;
  updatedAt: string;
}

export function RoutingManager() {
  const [routing, setRouting] = useState<Routing | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [poolText, setPoolText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(r: Routing) {
    setRouting(r);
    setEnabled(r.enabled);
    setPoolText(r.pool.join('\n'));
  }

  useEffect(() => {
    fetch('/api/admin/routing')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { routing: Routing }) => apply(d.routing))
      .catch(() => setError('Could not load routing settings.'));
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const pool = poolText.split('\n').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/admin/routing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, pool }),
      });
      const d = (await res.json().catch(() => null)) as { routing?: Routing; error?: string } | null;
      if (!res.ok || !d?.routing) {
        setError(d?.error ?? 'Could not save.');
        return;
      }
      apply(d.routing);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!routing && !error) {
    return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;
  }

  const pool = poolText.split('\n').map((s) => s.trim()).filter(Boolean);
  const nextUp = routing && routing.enabled && routing.pool.length ? routing.pool[routing.cursor % routing.pool.length] : null;

  return (
    <Card title="Round-robin assignment" description="New capture-form leads are handed to these reps in turn.">
      <div className="space-y-4">
        {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable automatic routing
        </label>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Owner pool — one rep name per line
          </label>
          <textarea
            value={poolText}
            onChange={(e) => setPoolText(e.target.value)}
            rows={5}
            placeholder={'Jane Smith\nRavi Patel\nMorgan Lee'}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {pool.length} rep{pool.length === 1 ? '' : 's'} in the pool. Names should match how owners appear on contacts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy}>Save routing</Button>
          {saved && <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Saved.</span>}
          {nextUp && (
            <span className="text-sm inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              Next up: <Badge variant="info">{nextUp}</Badge>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
