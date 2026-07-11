'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { formatGbp } from '@/lib/stages';

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  ownerName: string | null;
  tags: string[];
  contactCount: number;
  openDeals: number;
  openValuePence: number;
}

export function CompaniesExplorer() {
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [industry, setIndustry] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/companies?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { companies: CompanyRow[] }) => setCompanies(d.companies))
      .catch(() => setError('Could not load companies.'));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domain, industry }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? 'Create failed.');
        return;
      }
      setName('');
      setDomain('');
      setIndustry('');
      setShowAdd(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-56">
          <Input placeholder="Search name or domain…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={() => setShowAdd((v) => !v)}>
          <Plus size={14} className="mr-1" /> Add company
        </Button>
      </div>

      {showAdd && (
        <Card title="New company">
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Domain (optional)" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="clinic.co.uk" />
            <Input label="Industry (optional)" value={industry} onChange={(e) => setIndustry(e.target.value)} />
            <div className="sm:col-span-3 flex gap-2">
              <Button type="submit" loading={busy}>Create</Button>
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {companies === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : companies.length === 0 ? (
        <Card><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No companies yet.</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-primary)' }}>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3 text-right">Contacts</th>
                <th className="px-4 py-3 text-right">Open deals</th>
                <th className="px-4 py-3 text-right">Open value</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{c.name}</Link>
                    {c.domain && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.domain}</p>}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>{c.contactCount}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>{c.openDeals}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>{formatGbp(c.openValuePence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
