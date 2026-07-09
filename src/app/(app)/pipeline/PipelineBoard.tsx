'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { PIPELINE_STAGES, STAGE_LABELS, TERMINAL_STAGES, formatGbp, stageVariant } from '@/lib/stages';

interface ContactCard {
  id: string;
  name: string;
  email: string;
  clinicName: string | null;
  stage: string;
  source: string;
  ownerName: string | null;
  estimatedValuePence: number | null;
  updatedAt: string;
}

export function PipelineBoard() {
  const [contacts, setContacts] = useState<ContactCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/contacts')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { contacts: ContactCard[] }) => setContacts(d.contacts))
      .catch(() => setError('Could not load the pipeline.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moveStage(id: string, stage: string) {
    const current = contacts?.find((c) => c.id === id);
    if (!current || current.stage === stage) return;
    const previous = current.stage;
    // Optimistic move; revert on failure.
    setContacts((prev) => prev?.map((c) => (c.id === id ? { ...c, stage } : c)) ?? null);
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setContacts((prev) => prev?.map((c) => (c.id === id ? { ...c, stage: previous } : c)) ?? null);
      setError('Stage change failed — reverted.');
    }
  }

  if (error && !contacts) return <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>;
  if (!contacts) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading pipeline…</p>;

  const closed = contacts.filter((c) => (TERMINAL_STAGES as readonly string[]).includes(c.stage));

  return (
    <div className="space-y-4">
      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      <div className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar">
        {PIPELINE_STAGES.map((stage) => {
          const cards = contacts.filter((c) => c.stage === stage);
          const value = cards.reduce((sum, c) => sum + (c.estimatedValuePence ?? 0), 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                if (dragId) void moveStage(dragId, stage);
                setDragId(null);
              }}
              className="w-64 shrink-0 rounded-xl border flex flex-col max-h-[70vh]"
              style={{
                borderColor: overStage === stage ? 'var(--brand-primary)' : 'var(--border-primary)',
                backgroundColor: 'var(--bg-card)',
              }}
            >
              <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {STAGE_LABELS[stage]}
                  </span>
                  <Badge variant={stageVariant(stage)}>{cards.length}</Badge>
                </div>
                {value > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatGbp(value)}
                  </p>
                )}
              </div>
              <div className="p-2 space-y-2 overflow-y-auto custom-scrollbar">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDragId(card.id)}
                    onDragEnd={() => setDragId(null)}
                    className="rounded-lg border p-3 cursor-grab active:cursor-grabbing"
                    style={{
                      borderColor: 'var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      opacity: dragId === card.id ? 0.5 : 1,
                    }}
                  >
                    <Link href={`/contacts/${card.id}`} className="block">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {card.name}
                      </p>
                      {card.clinicName && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {card.clinicName}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {card.ownerName ?? card.source.replace(/_/g, ' ')}
                        </span>
                        {card.estimatedValuePence != null && (
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                            {formatGbp(card.estimatedValuePence)}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                    Drop a card here
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {closed.length > 0 && (
        <details className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-card)' }}>
          <summary className="text-sm font-medium cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            Closed ({closed.length}) — churned &amp; lost
          </summary>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {closed.map((card) => (
              <Link
                key={card.id}
                href={`/contacts/${card.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {card.name}
                </span>
                <Badge variant={stageVariant(card.stage)}>{STAGE_LABELS[card.stage]}</Badge>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
