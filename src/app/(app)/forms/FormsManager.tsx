'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';

interface CaptureForm {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  sourceTag: string;
  redirectUrl: string | null;
  active: boolean;
}

export function FormsManager({ isAdmin }: { isAdmin: boolean }) {
  const [forms, setForms] = useState<CaptureForm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [sourceTag, setSourceTag] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/forms')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { forms: CaptureForm[] }) => setForms(d.forms))
      .catch(() => setError('Could not load forms.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, headline, sourceTag }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Create failed.');
        return;
      }
      setName('');
      setHeadline('');
      setSourceTag('');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(form: CaptureForm) {
    setBusy(form.id);
    try {
      await fetch(`/api/forms/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !form.active }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  function copyEmbed(form: CaptureForm) {
    const url = `${window.location.origin}/f/${form.slug}`;
    const snippet = `<iframe src="${url}" style="width:100%;max-width:480px;height:640px;border:0;border-radius:12px" title="${form.name}"></iframe>`;
    void navigator.clipboard.writeText(snippet).catch(() => undefined);
    setCopied(form.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-5">
      {isAdmin && (
        <Card title="New capture form" description="Each form gets a hosted page and an embeddable iframe snippet. Submissions land in Contacts with the form's source tag.">
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Physio Show 2026 stand" required />
            <Input label="Headline (shown to visitors)" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Book your RehabSync demo" />
            <Input label="Source tag" value={sourceTag} onChange={(e) => setSourceTag(e.target.value)} placeholder="physio_show_2026" hint="How these leads are labelled in the pipeline." />
            <div className="sm:col-span-3">
              <Button type="submit" loading={busy === 'create'}>Create form</Button>
            </div>
          </form>
        </Card>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      <Card title="Capture forms">
        {forms === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : forms.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No forms yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {forms.map((form) => (
              <li key={form.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{form.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    /f/{form.slug} · source: {form.sourceTag}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={form.active ? 'success' : 'neutral'}>{form.active ? 'active' : 'off'}</Badge>
                  <a href={`/f/${form.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: 'var(--brand-primary)' }}>
                    Open
                  </a>
                  <Button size="sm" variant="secondary" onClick={() => copyEmbed(form)}>
                    {copied === form.id ? 'Copied!' : 'Copy embed'}
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant={form.active ? 'danger' : 'secondary'} disabled={busy === form.id} onClick={() => void toggleActive(form)}>
                      {form.active ? 'Disable' : 'Enable'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
