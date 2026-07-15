'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

interface Sla {
  enabled: boolean;
  firstResponseHours: number;
  updatedBy: string | null;
  updatedAt: string;
}

export function SlaManager() {
  const [sla, setSla] = useState<Sla | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(s: Sla) {
    setSla(s);
    setEnabled(s.enabled);
    setHours(String(s.firstResponseHours));
  }

  useEffect(() => {
    fetch('/api/admin/sla')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { sla: Sla }) => apply(d.sla))
      .catch(() => setError('Could not load SLA settings.'));
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/admin/sla', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, firstResponseHours: Number(hours) || 24 }),
      });
      const d = (await res.json().catch(() => null)) as { sla?: Sla; error?: string } | null;
      if (!res.ok || !d?.sla) {
        setError(d?.error ?? 'Could not save.');
        return;
      }
      apply(d.sla);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!sla && !error) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  return (
    <Card title="First-response SLA" description="A lead counts as unanswered while it is still ‘new’ with no logged contact.">
      <div className="space-y-4">
        {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable SLA breach alerts
        </label>

        <div className="max-w-xs">
          <Input
            label="First-response threshold (hours)"
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={busy}>Save SLA</Button>
          {saved && <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Saved.</span>}
        </div>
      </div>
    </Card>
  );
}
