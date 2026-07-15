'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { DEAL_STAGE_LABELS, DEAL_STAGE_ORDER, dealStageProbability, weightedValuePence } from '@/lib/deals';
import { formatGbp } from '@/lib/stages';

interface DealCard {
  id: string;
  title: string;
  stage: string;
  status: string;
  amountPence: number;
  probability: number | null;
  expectedCloseDate: string | null;
  ownerName: string | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
}

interface Option {
  id: string;
  name: string;
}

export function DealsBoard() {
  const [deals, setDeals] = useState<DealCard[] | null>(null);
  const [closed, setClosed] = useState<DealCard[]>([]);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [contacts, setContacts] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [provBusy, setProvBusy] = useState<string | null>(null);
  const [provNotice, setProvNotice] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [stage, setStage] = useState<string>('qualification');
  const [closeDate, setCloseDate] = useState('');

  const load = useCallback(() => {
    fetch('/api/deals?status=open')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { deals: DealCard[] }) => setDeals(d.deals))
      .catch(() => setError('Could not load deals.'));
    fetch('/api/deals?status=won')
      .then((res) => (res.ok ? res.json() : { deals: [] }))
      .then((d: { deals: DealCard[] }) => setClosed((prev) => [...prev.filter((x) => x.status !== 'won'), ...d.deals]))
      .catch(() => undefined);
    fetch('/api/deals?status=lost')
      .then((res) => (res.ok ? res.json() : { deals: [] }))
      .then((d: { deals: DealCard[] }) => setClosed((prev) => [...prev.filter((x) => x.status !== 'lost'), ...d.deals]))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    fetch('/api/companies')
      .then((res) => (res.ok ? res.json() : { companies: [] }))
      .then((d: { companies: Option[] }) => setCompanies(d.companies))
      .catch(() => undefined);
    fetch('/api/contacts')
      .then((res) => (res.ok ? res.json() : { contacts: [] }))
      .then((d: { contacts: Option[] }) => setContacts(d.contacts))
      .catch(() => undefined);
  }, [load]);

  const totals = useMemo(() => {
    const open = deals ?? [];
    const openValue = open.reduce((s, d) => s + d.amountPence, 0);
    const weighted = open.reduce((s, d) => s + weightedValuePence(d.amountPence, d.stage, d.probability), 0);
    const won = closed.filter((d) => d.status === 'won');
    const lost = closed.filter((d) => d.status === 'lost');
    const wonValue = won.reduce((s, d) => s + d.amountPence, 0);
    const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
    return { openValue, weighted, wonValue, winRate, wonCount: won.length, lostCount: lost.length };
  }, [deals, closed]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/deals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    return Boolean(res && res.ok);
  }

  async function moveStage(id: string, toStage: string) {
    const current = deals?.find((d) => d.id === id);
    if (!current || current.stage === toStage) return;
    const previous = current.stage;
    setDeals((prev) => prev?.map((d) => (d.id === id ? { ...d, stage: toStage, probability: dealStageProbability(toStage) } : d)) ?? null);
    if (!(await patch(id, { stage: toStage }))) {
      setDeals((prev) => prev?.map((d) => (d.id === id ? { ...d, stage: previous } : d)) ?? null);
      setError('Stage change failed — reverted.');
    }
  }

  async function provision(id: string) {
    setProvBusy(id);
    setProvNotice(null);
    try {
      const res = await fetch(`/api/deals/${id}/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = (await res.json().catch(() => null)) as { provision?: { status: string; tenantId: string | null }; error?: string } | null;
      if (!res.ok) {
        setProvNotice(d?.error ?? 'Could not provision.');
        return;
      }
      const p = d?.provision;
      setProvNotice(
        p?.status === 'provisioned'
          ? `Tenant provisioned (${p.tenantId}) — linked to the contact & company.`
          : p?.status === 'failed'
            ? 'Provisioning failed — open the Provisioning queue to retry.'
            : 'Queued for provisioning — complete it in the Provisioning queue.',
      );
    } finally {
      setProvBusy(null);
    }
  }

  async function close(id: string, status: 'won' | 'lost') {
    let lostReason: string | undefined;
    if (status === 'lost') {
      lostReason = window.prompt('Reason for losing this deal? (optional)') ?? undefined;
    }
    if (!(await patch(id, status === 'lost' ? { status, lostReason } : { status }))) {
      setError('Could not close the deal.');
      return;
    }
    setClosed([]); // reload closed sets
    load();
  }

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const amountPence = Math.round((parseFloat(amount || '0') || 0) * 100);
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          amountPence,
          companyId: companyId || null,
          contactId: contactId || null,
          stage,
          expectedCloseDate: closeDate || null,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? 'Could not create deal.');
        return;
      }
      setTitle('');
      setAmount('');
      setCompanyId('');
      setContactId('');
      setCloseDate('');
      setShowNew(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-64">
          {(
            [
              ['Open value', formatGbp(totals.openValue)],
              ['Weighted', formatGbp(totals.weighted)],
              ['Won', formatGbp(totals.wonValue)],
              ['Win rate', totals.winRate === null ? '—' : `${totals.winRate}%`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}>
              <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
        <Button onClick={() => setShowNew((v) => !v)}>
          <Plus size={14} className="mr-1" /> New deal
        </Button>
      </div>

      {showNew && (
        <Card title="New deal">
          <form onSubmit={createDeal} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Lakeside Clinic — annual plan" />
            <Input label="Amount (£)" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Company</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
                <option value="">— none —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Primary contact</label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Stage</label>
              <select value={stage} onChange={(e) => setStage(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
                {DEAL_STAGE_ORDER.map((s) => <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <Input label="Expected close" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" loading={busy}>Create deal</Button>
              <Button type="button" variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {deals === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading deals…</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar">
          {DEAL_STAGE_ORDER.map((s) => {
            const cards = deals.filter((d) => d.stage === s);
            const value = cards.reduce((sum, d) => sum + d.amountPence, 0);
            return (
              <div
                key={s}
                onDragOver={(e) => { e.preventDefault(); setOverStage(s); }}
                onDragLeave={() => setOverStage((x) => (x === s ? null : x))}
                onDrop={(e) => { e.preventDefault(); setOverStage(null); if (dragId) void moveStage(dragId, s); setDragId(null); }}
                className="w-72 shrink-0 rounded-xl border flex flex-col max-h-[70vh]"
                style={{ borderColor: overStage === s ? 'var(--brand-primary)' : 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}
              >
                <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{DEAL_STAGE_LABELS[s]}</span>
                    <Badge variant="neutral">{cards.length}</Badge>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatGbp(value)} · {dealStageProbability(s)}% weighting
                  </p>
                </div>
                <div className="p-2 space-y-2 overflow-y-auto custom-scrollbar">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => setDragId(null)}
                      className="rounded-lg border p-3 cursor-grab active:cursor-grabbing"
                      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', opacity: dragId === card.id ? 0.5 : 1 }}
                    >
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{card.title}</p>
                      {(card.companyName || card.contactName) && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {card.companyName ?? card.contactName}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatGbp(card.amountPence)}</span>
                        {card.expectedCloseDate && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {new Date(`${card.expectedCloseDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={() => void close(card.id, 'won')} className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success-text)' }}>Won</button>
                        <button onClick={() => void close(card.id, 'lost')} className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error-text)' }}>Lost</button>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Drop a deal here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <details className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}>
          <summary className="text-sm font-medium cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            Closed ({totals.wonCount} won · {totals.lostCount} lost)
          </summary>
          {provNotice && (
            <p className="mt-3 text-sm rounded-lg border-l-4 p-2" style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {provNotice} <a href="/provisioning" style={{ color: 'var(--brand-primary)' }}>Open queue →</a>
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {closed.map((card) => (
              <div key={card.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-primary)' }}>
                <span className="text-sm truncate min-w-0" style={{ color: 'var(--text-primary)' }}>{card.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatGbp(card.amountPence)}</span>
                  {card.status === 'won' && (
                    <button
                      onClick={() => void provision(card.id)}
                      disabled={provBusy === card.id}
                      className="text-xs font-medium px-2 py-1 rounded"
                      style={{ backgroundColor: 'var(--brand-primary)', color: '#fff' }}
                      title="Provision a platform tenant from this won deal"
                    >
                      {provBusy === card.id ? '…' : '→ Tenant'}
                    </button>
                  )}
                  <Badge variant={card.status === 'won' ? 'success' : 'error'}>{card.status}</Badge>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
