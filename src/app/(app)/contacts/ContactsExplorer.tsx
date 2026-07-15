'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Download, Plus, TrendingUp, X } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { STAGE_LABELS, STAGE_ORDER, formatGbp, stageVariant } from '@/lib/stages';
import { CsvImport } from './CsvImport';
import { DuplicatesPanel } from './DuplicatesPanel';

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
  leadScore: number;
  lastContactedAt: string | null;
  createdAt: string;
}

function scoreVariant(score: number): 'success' | 'warning' | 'neutral' {
  return score >= 70 ? 'success' : score >= 40 ? 'warning' : 'neutral';
}

interface SequenceOption {
  id: string;
  name: string;
  active: boolean;
  stepCount: number;
}

type BulkAction = 'tag' | 'untag' | 'stage' | 'owner' | 'enroll' | 'delete';

export function ContactsExplorer({ isAdmin }: { isAdmin: boolean }) {
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

  // Bulk-action + selection state.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>('tag');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [sequences, setSequences] = useState<SequenceOption[]>([]);
  const [showDupes, setShowDupes] = useState(false);
  const [sortByScore, setSortByScore] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (stage) params.set('stage', stage);
    if (sortByScore) params.set('sort', 'score');
    fetch(`/api/contacts?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { contacts: ContactRow[] }) => setContacts(d.contacts))
      .catch(() => setError('Could not load contacts.'));
  }, [q, stage, sortByScore]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  // Active sequences power the "enrol" bulk action.
  useEffect(() => {
    fetch('/api/sequences')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('seq'))))
      .then((d: { sequences: SequenceOption[] }) =>
        setSequences(d.sequences.filter((s) => s.active && s.stepCount > 0)),
      )
      .catch(() => undefined);
  }, []);

  // Drop selections that fell out of the current view (e.g. after a filter change or reload).
  useEffect(() => {
    if (!contacts) return;
    setSelected((prev) => {
      const ids = new Set(contacts.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [contacts]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (stage) params.set('stage', stage);
    const qs = params.toString();
    return `/api/contacts/export${qs ? `?${qs}` : ''}`;
  }, [q, stage]);

  const allSelected = !!contacts && contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!contacts) return;
    setSelected((prev) => (contacts.every((c) => prev.has(c.id)) ? new Set() : new Set(contacts.map((c) => c.id))));
  }

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

  async function applyBulk() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (bulkAction === 'delete' && !window.confirm(`Delete ${ids.length} contact(s)? This cannot be undone.`)) {
      return;
    }
    setBulkBusy(true);
    setBulkNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: bulkAction, value: bulkValue }),
      });
      const data = (await res.json().catch(() => null)) as
        | { updated?: number; enrolled?: number; skipped?: number; deleted?: number; error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? 'Bulk action failed.');
        return;
      }
      const affected = data?.deleted ?? data?.enrolled ?? data?.updated ?? 0;
      const verb =
        bulkAction === 'delete'
          ? 'Deleted'
          : bulkAction === 'enroll'
            ? `Enrolled${data?.skipped ? ` (${data.skipped} skipped)` : ''}`
            : 'Updated';
      setBulkNotice(`${verb} ${affected} contact(s).`);
      setSelected(new Set());
      setBulkValue('');
      load();
    } finally {
      setBulkBusy(false);
    }
  }

  const selectClass = 'rounded-lg border px-3 py-2 text-sm';
  const selectStyle = {
    backgroundColor: 'var(--bg-input)',
    borderColor: 'var(--border-primary)',
    color: 'var(--text-primary)',
  } as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-56">
          <Input placeholder="Search name, email or clinic…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={selectClass} style={selectStyle}>
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
        <a
          href={exportHref}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          style={{ backgroundColor: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
        >
          <Download size={14} className="mr-1.5" /> Export CSV
        </a>
        <Button variant={showDupes ? 'primary' : 'secondary'} onClick={() => setShowDupes((v) => !v)}>
          <Copy size={14} className="mr-1.5" /> Duplicates
        </Button>
        <Button
          variant={sortByScore ? 'primary' : 'secondary'}
          onClick={() => setSortByScore((v) => !v)}
          title="Sort by lead score"
        >
          <TrendingUp size={14} className="mr-1.5" /> Score
        </Button>
        <CsvImport onImported={load} />
      </div>

      {showAdd && (
        <Card title="New contact" description="Manually add a lead — CSV import and capture forms populate this list too.">
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

      {showDupes && <DuplicatesPanel isAdmin={isAdmin} onMerged={load} />}

      {error && (
        <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>
          {error}
        </p>
      )}
      {bulkNotice && (
        <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>
          {bulkNotice}
        </p>
      )}

      {/* Bulk-action toolbar — appears once at least one contact is ticked. */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--bg-card)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {selected.size} selected
          </span>
          <select
            value={bulkAction}
            onChange={(e) => {
              setBulkAction(e.target.value as BulkAction);
              setBulkValue('');
            }}
            className={selectClass}
            style={selectStyle}
          >
            <option value="tag">Add tag</option>
            <option value="untag">Remove tag</option>
            <option value="stage">Set stage</option>
            <option value="owner">Set owner</option>
            <option value="enroll">Enrol in sequence</option>
            {isAdmin && <option value="delete">Delete</option>}
          </select>

          {(bulkAction === 'tag' || bulkAction === 'untag') && (
            <input
              placeholder="tag"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className={selectClass}
              style={selectStyle}
            />
          )}
          {bulkAction === 'stage' && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">Choose stage…</option>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          )}
          {bulkAction === 'owner' && (
            <input
              placeholder="owner name (blank to clear)"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className={selectClass}
              style={selectStyle}
            />
          )}
          {bulkAction === 'enroll' && (
            <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className={selectClass} style={selectStyle}>
              <option value="">Choose sequence…</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          <Button
            variant={bulkAction === 'delete' ? 'danger' : 'primary'}
            size="sm"
            loading={bulkBusy}
            onClick={applyBulk}
          >
            Apply
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center text-sm cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} className="mr-1" /> Clear
          </button>
        </div>
      )}

      {contacts === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading…
        </p>
      ) : contacts.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No contacts match. New demo requests from the marketing site land here automatically.
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
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Clinic</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(contact.id)}
                      onChange={() => toggleOne(contact.id)}
                      aria-label={`Select ${contact.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {contact.name}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {contact.email}
                    </p>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {contact.clinicName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={stageVariant(contact.stage)}>{STAGE_LABELS[contact.stage] ?? contact.stage}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={scoreVariant(contact.leadScore)}>{contact.leadScore}</Badge>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {contact.source.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                    {contact.ownerName ?? '—'}
                  </td>
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
