'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { formatGbp } from '@/lib/stages';

interface Quote {
  id: string;
  number: string;
  title: string;
  status: string;
  totalPence: number;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
};

export function QuotesList() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/quotes')
      .then((res) => (res.ok ? res.json() : { quotes: [] }))
      .then((d: { quotes: Quote[] }) => setQuotes(d.quotes))
      .catch(() => setQuotes([]));
  }, []);

  async function newQuote() {
    setCreating(true);
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New quote' }),
      });
      const d = (await res.json().catch(() => null)) as { quote?: { id: string } } | null;
      if (d?.quote) router.push(`/quotes/${d.quote.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={newQuote} loading={creating}>New quote</Button>
      </div>

      {quotes === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : quotes.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No quotes yet. Create one to build a proposal with line items and totals.
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
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>{q.number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/quotes/${q.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {q.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[q.status] ?? 'neutral'}>{q.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>{formatGbp(q.totalPence)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                    {new Date(q.createdAt).toLocaleDateString('en-GB')}
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
