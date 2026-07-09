'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';

interface Template {
  id: string;
  name: string;
  subject: string;
  html: string;
  updatedAt: string;
}

const MERGE_HINT = 'Merge tags: {{name}}, {{first_name}}, {{clinic_name}}, {{email}}, {{unsubscribe_url}} — an unsubscribe footer is added automatically if you leave {{unsubscribe_url}} out.';

export function TemplatesManager() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/templates')
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((d: { templates: Template[] }) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditing(null);
    setName('');
    setSubject('');
    setHtml('<p>Hi {{first_name}},</p>\n<p>…</p>\n<p>The RehabSync team</p>');
  }

  function startEdit(template: Template) {
    setEditing(template);
    setName(template.name);
    setSubject(template.subject);
    setHtml(template.html);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    setNotice(null);
    try {
      const res = editing
        ? await fetch(`/api/templates/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, subject, html }),
          })
        : await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, subject, html }),
          });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setNotice(data?.error ?? 'Save failed.');
        return;
      }
      setNotice('Saved.');
      if (!editing) startNew();
      load();
      if (editing) {
        const data = (await res.json()) as { template: Template };
        setEditing(data.template);
      }
    } finally {
      setBusy(null);
    }
  }

  async function testSend() {
    if (!editing) return;
    setBusy('test');
    setNotice(null);
    try {
      const res = await fetch(`/api/templates/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_send' }),
      });
      const data = (await res.json().catch(() => null)) as { sent?: boolean; skipped?: boolean; error?: string } | null;
      setNotice(
        data?.sent
          ? 'Test sent — check your inbox.'
          : data?.skipped
            ? 'Email provider not configured (REHABSYNC_SMTP2GO_API_KEY) — nothing sent.'
            : `Test failed: ${data?.error ?? 'unknown error'}`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card title="Templates" className="lg:col-span-1">
        <Button size="sm" onClick={startNew} className="mb-3">
          New template
        </Button>
        {templates === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>None yet.</p>
        ) : (
          <ul className="space-y-1">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  onClick={() => startEdit(template)}
                  className="w-full text-left rounded-lg px-3 py-2 text-sm"
                  style={{
                    backgroundColor: editing?.id === template.id ? 'var(--bg-tertiary)' : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  {template.name}
                  <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {template.subject}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={editing ? `Edit: ${editing.name}` : 'New template'} className="lg:col-span-2">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              HTML body
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={12}
              className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{MERGE_HINT}</p>
          </div>
          {notice && <p className="text-sm" style={{ color: notice === 'Saved.' || notice.startsWith('Test sent') ? 'var(--color-success-text)' : 'var(--color-warning-text)' }}>{notice}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={busy === 'save'}>
              {editing ? 'Save changes' : 'Create template'}
            </Button>
            {editing && (
              <Button type="button" variant="secondary" loading={busy === 'test'} onClick={() => void testSend()}>
                Send test to me
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
