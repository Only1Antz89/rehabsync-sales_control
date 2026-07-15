'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { STAGE_LABELS, formatGbp, stageVariant } from '@/lib/stages';

interface DupContact {
  id: string;
  name: string;
  email: string;
  clinicName: string | null;
  stage: string;
  ownerName: string | null;
  estimatedValuePence: number | null;
  createdAt: string;
}

interface DupGroup {
  key: string;
  reason: 'email' | 'name_clinic';
  contacts: DupContact[];
}

const REASON_LABEL: Record<DupGroup['reason'], string> = {
  email: 'Same email',
  name_clinic: 'Same name & clinic',
};

/** Duplicate-contact finder with an admin merge control (survivor chosen per group). */
export function DuplicatesPanel({ isAdmin, onMerged }: { isAdmin: boolean; onMerged: () => void }) {
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setGroups(null);
    setError(null);
    fetch('/api/contacts/duplicates')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { groups: DupGroup[] }) => {
        setGroups(d.groups);
        setPrimaryByGroup(Object.fromEntries(d.groups.map((g) => [g.key, g.contacts[0]?.id ?? ''])));
      })
      .catch(() => setError('Could not scan for duplicates.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function merge(group: DupGroup) {
    const primaryId = primaryByGroup[group.key];
    const mergeIds = group.contacts.map((c) => c.id).filter((id) => id !== primaryId);
    if (!primaryId || mergeIds.length === 0) return;
    setBusyKey(group.key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId, mergeIds }),
      });
      const data = (await res.json().catch(() => null)) as { merged?: number; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Merge failed.');
        return;
      }
      setNotice(`Merged ${data?.merged ?? mergeIds.length} duplicate contact(s) into the primary.`);
      onMerged();
      load();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card
      title="Duplicate contacts"
      description="Contacts that share an email address, or the same name and clinic. Pick the record to keep — the rest are merged into it (their activities, deals, emails, tasks and sequence enrolments move across)."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={load}>
            Rescan
          </Button>
          {!isAdmin && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Merging is available to admins.
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>
            {error}
          </p>
        )}
        {notice && (
          <p className="text-sm" style={{ color: 'var(--color-success-text)' }}>
            {notice}
          </p>
        )}

        {groups === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Scanning…
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No duplicates found. 🎉
          </p>
        ) : (
          groups.map((group) => {
            const primaryId = primaryByGroup[group.key];
            return (
              <div
                key={group.key}
                className="rounded-lg border"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div
                  className="flex items-center justify-between gap-3 px-4 py-2.5 border-b"
                  style={{ borderColor: 'var(--border-secondary)' }}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">{REASON_LABEL[group.reason]}</Badge>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {group.contacts.length} contacts
                    </span>
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busyKey === group.key}
                      onClick={() => merge(group)}
                    >
                      Merge {group.contacts.length - 1} into selected
                    </Button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="text-left text-xs uppercase tracking-wide border-b"
                        style={{ color: 'var(--text-muted)', borderColor: 'var(--border-secondary)' }}
                      >
                        <th className="px-4 py-2">Keep</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Clinic</th>
                        <th className="px-4 py-2">Stage</th>
                        <th className="px-4 py-2">Owner</th>
                        <th className="px-4 py-2 text-right">Value</th>
                        <th className="px-4 py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.contacts.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b last:border-0"
                          style={{ borderColor: 'var(--border-secondary)' }}
                        >
                          <td className="px-4 py-2">
                            <input
                              type="radio"
                              name={`primary-${group.key}`}
                              checked={primaryId === c.id}
                              onChange={() => setPrimaryByGroup((m) => ({ ...m, [group.key]: c.id }))}
                              aria-label={`Keep ${c.name}`}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {c.name}
                            </span>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {c.email}
                            </p>
                          </td>
                          <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>
                            {c.clinicName ?? '—'}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={stageVariant(c.stage)}>{STAGE_LABELS[c.stage] ?? c.stage}</Badge>
                          </td>
                          <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>
                            {c.ownerName ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-right" style={{ color: 'var(--text-primary)' }}>
                            {c.estimatedValuePence != null ? formatGbp(c.estimatedValuePence) : '—'}
                          </td>
                          <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>
                            {new Date(c.createdAt).toLocaleDateString('en-GB')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
