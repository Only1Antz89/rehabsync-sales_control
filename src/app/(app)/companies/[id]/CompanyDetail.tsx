'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import { STAGE_LABELS, formatGbp, stageVariant } from '@/lib/stages';
import { dealStatusVariant } from '@/lib/deals';

interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  address: string | null;
  ownerName: string | null;
  tags: string[];
  notes: string | null;
}
interface ContactRow { id: string; name: string; email: string; stage: string }
interface DealRow { id: string; title: string; stage: string; status: string; amountPence: number; expectedCloseDate: string | null }
interface ContactOption { id: string; name: string; email: string }

export function CompanyDetail({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [allContacts, setAllContacts] = useState<ContactOption[]>([]);
  const [attachId, setAttachId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/companies/${companyId}`)
      .then((res) => {
        if (res.status === 404) { setNotFound(true); return null; }
        return res.ok ? res.json() : Promise.reject(new Error('load'));
      })
      .then((d: { company: Company; contacts: ContactRow[]; deals: DealRow[] } | null) => {
        if (!d) return;
        setCompany(d.company);
        setContacts(d.contacts);
        setDeals(d.deals);
      })
      .catch(() => setError('Could not load the company.'));
  }, [companyId]);

  useEffect(() => {
    load();
    fetch('/api/contacts')
      .then((res) => (res.ok ? res.json() : { contacts: [] }))
      .then((d: { contacts: ContactOption[] }) => setAllContacts(d.contacts))
      .catch(() => undefined);
  }, [load]);

  async function attach() {
    if (!attachId) return;
    const res = await fetch(`/api/contacts/${attachId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    }).catch(() => null);
    if (!res || !res.ok) { setError('Could not attach the contact.'); return; }
    setAttachId('');
    load();
  }

  async function detach(contactId: string) {
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: null }),
    }).catch(() => null);
    if (!res || !res.ok) { setError('Could not detach the contact.'); return; }
    load();
  }

  if (notFound) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Company not found. <Link href="/companies" className="underline">Back to companies</Link></p>;
  if (!company) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error ?? 'Loading…'}</p>;

  const openValue = deals.filter((d) => d.status === 'open').reduce((s, d) => s + d.amountPence, 0);
  const attachable = allContacts.filter((c) => !contacts.some((x) => x.id === c.id));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/companies" className="text-xs underline" style={{ color: 'var(--brand-primary)' }}>← Companies</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{company.name}</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {[company.industry, company.domain].filter(Boolean).join(' · ') || 'No details yet'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Open pipeline</p>
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatGbp(openValue)}</p>
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Contacts" description="People at this company.">
          {contacts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No contacts attached yet.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
              {contacts.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/contacts/${c.id}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{c.name}</Link>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={stageVariant(c.stage)}>{STAGE_LABELS[c.stage] ?? c.stage}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => void detach(c.id)}>Remove</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {attachable.length > 0 && (
            <div className="mt-3 flex gap-2">
              <select value={attachId} onChange={(e) => setAttachId(e.target.value)} className="flex-1 rounded-lg border px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
                <option value="">Attach an existing contact…</option>
                {attachable.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
              </select>
              <Button variant="secondary" onClick={() => void attach()} disabled={!attachId}>Attach</Button>
            </div>
          )}
        </Card>

        <Card title="Deals" description="Opportunities with this company.">
          {deals.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No deals yet. <Link href="/deals" className="underline" style={{ color: 'var(--brand-primary)' }}>Create one on the deals board.</Link>
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
              {deals.map((d) => (
                <li key={d.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{d.title}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatGbp(d.amountPence)}</p>
                  </div>
                  <Badge variant={d.status === 'open' ? 'neutral' : dealStatusVariant(d.status)}>
                    {d.status === 'open' ? d.stage : d.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
