'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface Provision {
  id: string;
  dealId: string | null;
  dealTitle: string | null;
  contactName: string | null;
  clinicName: string;
  billingEmail: string;
  tenantId: string | null;
  tenantSlug: string | null;
  status: string;
  error: string | null;
  requestedBy: string | null;
  createdAt: string;
  provisionedAt: string | null;
}

function statusVariant(status: string): BadgeVariant {
  if (status === 'provisioned') return 'success';
  if (status === 'failed') return 'error';
  return 'warning';
}

export function ProvisioningQueue() {
  const [rows, setRows] = useState<Provision[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/provisioning')
      .then((r) => (r.ok ? r.json() : { provisions: [], configured: true }))
      .then((d: { provisions: Provision[]; configured: boolean }) => {
        setRows(d.provisions);
        setConfigured(d.configured);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/provisioning/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function link(id: string) {
    const tenantId = window.prompt('Tenant ID created in Admin Centre (UUID):')?.trim();
    if (!tenantId) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/provisioning/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        window.alert(d?.error ?? 'Could not link.');
      }
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      {!configured && (
        <p className="mb-3 text-sm rounded-lg border-l-4 p-2" style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
          Automatic provisioning isn&apos;t configured (set <code>REHABSYNC_API_URL</code>). Requests are queued as
          pending — create the tenant in Admin Centre and use “Link tenant” to complete them.
        </p>
      )}
      {rows === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nothing yet — win a deal and use “→ Tenant” on it to provision a customer.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
          {rows.map((r) => (
            <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {r.clinicName}
                  {r.dealTitle ? <span className="font-normal" style={{ color: 'var(--text-muted)' }}> · {r.dealTitle}</span> : ''}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {r.billingEmail}
                  {r.tenantId ? ` · tenant ${r.tenantSlug ?? r.tenantId}` : ''}
                  {r.error ? ` · ${r.error}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                {r.status !== 'provisioned' && (
                  <>
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => void retry(r.id)}>Retry</Button>
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void link(r.id)}>Link tenant</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
