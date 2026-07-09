'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { STAGE_LABELS, STAGE_ORDER, formatGbp, stageVariant } from '@/lib/stages';

interface ContactRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  clinicName: string | null;
  stage: string;
  source: string;
  ownerName: string | null;
  estimatedValuePence: number | null;
  tags: string[];
  lastContactedAt: string | null;
  createdAt: string;
}

export function ContactsExplorer() {
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newClinic, setNewClinic] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (stage) params.set('stage', stage);
    fetch(`/api/contacts?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { contacts: ContactRow[] }) => setContacts(d.contacts))
      .catch(() => setError('Could not load contacts.'));
  }, [q, stage]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, clinicName: newClinic, phone: newPhone }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Create failed.');
        return;
      }
      setNewName('');
      setNewEmail('');
      setNewClinic('');
      setNewPhone('');
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
          <Input placeholder="Search name, email or clinic…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">All stages</option>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <Button onClick={() => setShowAdd((v) => !v)}>
          <Plus size={14} className="mr-1" /> Add contact
        </Button>
      </div>

      {showAdd && (
        <Card title="New contact" description="Manually add a lead — imports and capture forms arrive in M2.">
          <form onSubmit={createContact} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            <Input label="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            <Input label="Clinic (optional)" value={newClinic} onChange={(e) => setNewClinic(e.target.value)} />
            <Input label="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" loading={busy}>
                Create
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      {contacts === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : contacts.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No contacts match. New demo requests from the marketing site land here automatically.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-primary)' }}>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Clinic</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {contact.name}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{contact.email}</p>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{contact.clinicName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={stageVariant(contact.stage)}>{STAGE_LABELS[contact.stage] ?? contact.stage}</Badge>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{contact.source.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{contact.ownerName ?? '—'}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                    {contact.estimatedValuePence != null ? formatGbp(contact.estimatedValuePence) : '—'}
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
