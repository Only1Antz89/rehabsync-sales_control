'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { formatGbp } from '@/lib/stages';

interface Row {
  description: string;
  qty: string;
  unit: string; // £, as typed
}

interface QuoteMeta {
  number: string;
  status: string;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
};

const penceFrom = (gbp: string): number => Math.max(0, Math.round((parseFloat(gbp) || 0) * 100));
const gbp = (pence: number): string => (pence / 100).toFixed(2);

export function QuoteEditor({ id }: { id: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<QuoteMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [discount, setDiscount] = useState('0.00');
  const [taxRate, setTaxRate] = useState('0');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/quotes/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((d: { quote: Record<string, unknown> & { lineItems: Record<string, unknown>[] } }) => {
        const q = d.quote;
        setMeta({ number: String(q.number), status: String(q.status), createdAt: String(q.createdAt) });
        setTitle(String(q.title ?? ''));
        setNotes(String(q.notes ?? ''));
        setValidUntil(q.validUntil ? String(q.validUntil).slice(0, 10) : '');
        setDiscount(gbp(Number(q.discountPence ?? 0)));
        setTaxRate(String(q.taxRatePct ?? 0));
        setRows(
          (q.lineItems ?? []).map((it) => ({
            description: String(it.description ?? ''),
            qty: String(it.quantity ?? 1),
            unit: gbp(Number(it.unitPricePence ?? 0)),
          })),
        );
      })
      .catch((e) => (String(e.message) === '404' ? setNotFound(true) : setError('Could not load the quote.')));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const subtotal = rows.reduce((s, r) => s + (parseInt(r.qty) || 0) * penceFrom(r.unit), 0);
    const disc = Math.min(penceFrom(discount), subtotal);
    const afterDiscount = subtotal - disc;
    const rate = Math.min(100, Math.max(0, parseInt(taxRate) || 0));
    const tax = Math.round((afterDiscount * rate) / 100);
    return { subtotal, disc, tax, total: afterDiscount + tax };
  }, [rows, discount, taxRate]);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { description: '', qty: '1', unit: '0.00' }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy('save');
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          notes,
          validUntil: validUntil || null,
          discountPence: penceFrom(discount),
          taxRatePct: parseInt(taxRate) || 0,
          lineItems: rows
            .filter((r) => r.description.trim())
            .map((r) => ({ description: r.description, quantity: parseInt(r.qty) || 0, unitPricePence: penceFrom(r.unit) })),
        }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(d?.error ?? 'Could not save the quote.');
        return;
      }
      setSaved(true);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: string) {
    setBusy(status);
    setError(null);
    try {
      await fetch(`/api/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this quote?')) return;
    setBusy('delete');
    await fetch(`/api/quotes/${id}`, { method: 'DELETE' }).catch(() => undefined);
    router.push('/quotes');
  }

  if (notFound) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Quote not found.</p>;
  if (!meta) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  const inputStyle = { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' } as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/quotes" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft size={14} /> Quotes
          </Link>
          <span className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>{meta.number}</span>
          <Badge variant={STATUS_VARIANT[meta.status] ?? 'neutral'}>{meta.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" loading={busy === 'sent'} onClick={() => setStatus('sent')}>Mark sent</Button>
          <Button size="sm" variant="secondary" loading={busy === 'accepted'} onClick={() => setStatus('accepted')}>Accepted</Button>
          <Button size="sm" variant="secondary" loading={busy === 'rejected'} onClick={() => setStatus('rejected')}>Rejected</Button>
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      <Card title="Quote details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Input label="Valid until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <Input label="Tax rate (%)" type="number" min={0} max={100} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </div>
      </Card>

      <Card title="Line items">
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No items yet.</p>}
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Description"
                value={r.description}
                onChange={(e) => setRow(i, { description: e.target.value })}
                className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-48"
                style={inputStyle}
              />
              <input
                type="number"
                min={0}
                value={r.qty}
                onChange={(e) => setRow(i, { qty: e.target.value })}
                title="Quantity"
                className="rounded-lg border px-3 py-2 text-sm w-20"
                style={inputStyle}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={r.unit}
                onChange={(e) => setRow(i, { unit: e.target.value })}
                title="Unit price (£)"
                className="rounded-lg border px-3 py-2 text-sm w-28"
                style={inputStyle}
              />
              <span className="text-sm w-24 text-right" style={{ color: 'var(--text-secondary)' }}>
                {formatGbp((parseInt(r.qty) || 0) * penceFrom(r.unit))}
              </span>
              <button type="button" onClick={() => removeRow(i)} className="p-1.5 cursor-pointer" style={{ color: 'var(--color-error-text)' }} title="Remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <Button size="sm" variant="secondary" onClick={addRow}>
            <Plus size={14} className="mr-1" /> Add line
          </Button>
        </div>

        <div className="mt-4 border-t pt-3 space-y-1.5 max-w-xs ml-auto text-sm" style={{ borderColor: 'var(--border-secondary)' }}>
          <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Subtotal</span><span style={{ color: 'var(--text-primary)' }}>{formatGbp(totals.subtotal)}</span></div>
          <div className="flex justify-between items-center">
            <span style={{ color: 'var(--text-secondary)' }}>Discount (£)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm w-28 text-right"
              style={inputStyle}
            />
          </div>
          <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Tax ({parseInt(taxRate) || 0}%)</span><span style={{ color: 'var(--text-primary)' }}>{formatGbp(totals.tax)}</span></div>
          <div className="flex justify-between font-semibold text-base pt-1"><span style={{ color: 'var(--text-primary)' }}>Total</span><span style={{ color: 'var(--text-primary)' }}>{formatGbp(totals.total)}</span></div>
        </div>
      </Card>

      <Card title="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Terms, scope, anything the client should see…"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={inputStyle}
        />
      </Card>

      <div className="flex items-center gap-3">
        <Button loading={busy === 'save'} onClick={save}>Save quote</Button>
        {saved && <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Saved.</span>}
        <button type="button" onClick={remove} className="ml-auto text-sm cursor-pointer" style={{ color: 'var(--color-error-text)' }}>
          Delete quote
        </button>
      </div>
    </div>
  );
}
