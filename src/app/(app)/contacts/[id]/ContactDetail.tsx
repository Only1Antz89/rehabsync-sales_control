'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, Phone, Mail, ArrowRightLeft, CalendarClock, CheckSquare } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { STAGE_LABELS, STAGE_ORDER, stageVariant } from '@/lib/stages';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  clinicName: string | null;
  stage: string;
  source: string;
  sourceDetail: string | null;
  ownerName: string | null;
  estimatedValuePence: number | null;
  message: string | null;
  tags: string[];
  meetingUrl: string | null;
  scheduledAt: string | null;
  lastContactedAt: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
}

interface Activity {
  id: string;
  type: string;
  body: string | null;
  actorName: string | null;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  type: string;
  status: string;
  dueAt: string | null;
  assigneeEmail: string | null;
}

function activityIcon(type: string) {
  if (type === 'stage_change') return <ArrowRightLeft size={14} />;
  if (type === 'call' || type === 'call_scheduled') return <Phone size={14} />;
  if (type === 'email') return <Mail size={14} />;
  if (type === 'meeting') return <CalendarClock size={14} />;
  return <MessageSquare size={14} />;
}

interface Template {
  id: string;
  name: string;
}

interface Sequence {
  id: string;
  name: string;
  active: boolean;
}

interface CustomFieldDef {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options: string[];
  active: boolean;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ContactDetail({ id }: { id: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Editable profile fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [valueGbp, setValueGbp] = useState('');
  const [tags, setTags] = useState('');

  // Composers
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'note' | 'call' | 'meeting'>('note');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');

  // Email composer
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailHtml, setEmailHtml] = useState('');
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  // Sequence enrolment
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [enrollSeqId, setEnrollSeqId] = useState('');
  const [enrollNotice, setEnrollNotice] = useState<string | null>(null);

  // Custom fields
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>({});
  const [customSaved, setCustomSaved] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/contacts/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { contact: Contact; activities: Activity[]; tasks: Task[] }) => {
        setContact(d.contact);
        setActivities(d.activities);
        setTasks(d.tasks);
        setName(d.contact.name);
        setEmail(d.contact.email);
        setPhone(d.contact.phone ?? '');
        setClinicName(d.contact.clinicName ?? '');
        setOwnerName(d.contact.ownerName ?? '');
        setValueGbp(d.contact.estimatedValuePence != null ? (d.contact.estimatedValuePence / 100).toFixed(0) : '');
        setTags(d.contact.tags.join(', '));
        const cf = (d.contact.customFields ?? {}) as Record<string, unknown>;
        const initial: Record<string, string | boolean> = {};
        for (const [k, v] of Object.entries(cf)) {
          initial[k] = typeof v === 'boolean' ? v : v == null ? '' : String(v);
        }
        setCustomValues(initial);
      })
      .catch(() => setError('Could not load this contact.'));
  }, [id]);

  useEffect(() => {
    load();
    fetch('/api/templates')
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((d: { templates: Template[] }) => setTemplates(d.templates))
      .catch(() => undefined);
    fetch('/api/sequences')
      .then((res) => (res.ok ? res.json() : { sequences: [] }))
      .then((d: { sequences: Sequence[] }) => setSequences(d.sequences.filter((s) => s.active)))
      .catch(() => undefined);
    fetch('/api/custom-fields?entity=contact')
      .then((res) => (res.ok ? res.json() : { fields: [] }))
      .then((d: { fields: CustomFieldDef[] }) => setCustomFieldDefs(d.fields.filter((f) => f.active)))
      .catch(() => undefined);
  }, [load]);

  async function saveCustomFields(e: React.FormEvent) {
    e.preventDefault();
    setBusy('customFields');
    setCustomSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: customValues }),
      });
      if (res.ok) {
        setCustomSaved(true);
        load();
      } else {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? 'Could not save custom fields.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function enrollInSequence(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollSeqId) return;
    setBusy('enroll');
    setError(null);
    setEnrollNotice(null);
    try {
      const res = await fetch(`/api/sequences/${enrollSeqId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: id }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setEnrollNotice(data?.error ?? 'Could not enrol this contact.');
        return;
      }
      setEnrollNotice('Enrolled — the first step is scheduled.');
      setEnrollSeqId('');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy('email');
    setError(null);
    setEmailNotice(null);
    try {
      const res = await fetch(`/api/contacts/${id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, html: emailHtml, templateId: templateId || undefined }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; skipped?: boolean } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Could not send the email.');
        return;
      }
      setEmailNotice(data?.skipped ? 'Email provider not configured — logged but not delivered.' : 'Email sent and logged to the timeline.');
      setEmailSubject('');
      setEmailHtml('');
      setTemplateId('');
      load();
    } finally {
      setBusy(null);
    }
  }

  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Update failed.');
        return;
      }
      if (key === 'profile') setSaved(true);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const pence = valueGbp.trim() ? Math.round(parseFloat(valueGbp) * 100) : null;
    await patch(
      {
        name,
        email,
        phone: phone || null,
        clinicName: clinicName || null,
        ownerName: ownerName || null,
        estimatedValuePence: Number.isFinite(pence as number) ? pence : null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      },
      'profile',
    );
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setBusy('note');
    try {
      const res = await fetch(`/api/contacts/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteText, type: noteType }),
      });
      if (res.ok) {
        setNoteText('');
        load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setBusy('task');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: taskTitle, contactId: id, dueAt: taskDue || null }),
      });
      if (res.ok) {
        setTaskTitle('');
        setTaskDue('');
        load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function setTaskStatus(taskId: string, status: 'done' | 'open') {
    setBusy(taskId);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  if (error && !contact) return <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>;
  if (!contact) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/pipeline" className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft size={14} /> Pipeline
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{contact.name}</h1>
          <Badge variant={stageVariant(contact.stage)}>{STAGE_LABELS[contact.stage] ?? contact.stage}</Badge>
        </div>
        <select
          value={contact.stage}
          onChange={(e) => void patch({ stage: e.target.value }, 'stage')}
          disabled={busy === 'stage'}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
        >
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <Card title="Profile">
            <form onSubmit={saveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Clinic" value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
              <Input label="Owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              <Input label="Est. value (£)" inputMode="numeric" value={valueGbp} onChange={(e) => setValueGbp(e.target.value)} />
              <div className="sm:col-span-2">
                <Input label="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3">
                <Button type="submit" loading={busy === 'profile'}>Save profile</Button>
                {saved && <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Saved.</span>}
              </div>
            </form>
            <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              Source: {contact.source.replace(/_/g, ' ')}
              {contact.sourceDetail ? ` (${contact.sourceDetail})` : ''} · Added{' '}
              {new Date(contact.createdAt).toLocaleDateString('en-GB')}
              {contact.lastContactedAt ? ` · Last contacted ${formatDateTime(contact.lastContactedAt)}` : ''}
            </p>
            {contact.message && (
              <div className="mt-3 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Original enquiry</p>
                {contact.message}
              </div>
            )}
          </Card>

          <Card title="Tasks" description="Follow-ups for this contact.">
            <form onSubmit={addTask} className="flex flex-wrap gap-2 mb-3">
              <div className="flex-1 min-w-40">
                <Input placeholder="e.g. Call to confirm demo" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              </div>
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              />
              <Button type="submit" loading={busy === 'task'}>Add</Button>
            </form>
            {tasks.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No tasks yet.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => void setTaskStatus(task.id, task.status === 'done' ? 'open' : 'done')}
                      disabled={busy === task.id}
                      className="flex items-center gap-2 text-left text-sm"
                      style={{
                        color: task.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      }}
                    >
                      <CheckSquare size={14} style={{ color: task.status === 'done' ? 'var(--color-success-text)' : 'var(--text-muted)' }} />
                      {task.title}
                    </button>
                    {task.dueAt && (
                      <span className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <CalendarClock size={12} /> {new Date(task.dueAt).toLocaleDateString('en-GB')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Send email" description="A tracked 1:1 email — delivery, opens and clicks land on the timeline.">
            <form onSubmit={sendEmail} className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-40"
                  style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="">No template — write below</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <Input placeholder={templateId ? "Subject (leave blank to use the template's)" : 'Subject'} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              <textarea
                value={emailHtml}
                onChange={(e) => setEmailHtml(e.target.value)}
                rows={4}
                placeholder={templateId ? 'Leave blank to use the template body, or override here…' : 'Email body (HTML allowed). Merge tags: {{name}}, {{clinic_name}}.'}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              />
              <div className="flex items-center gap-3">
                <Button type="submit" loading={busy === 'email'}>Send to {contact.email}</Button>
                {emailNotice && <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>{emailNotice}</span>}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Suppressed and unsubscribed addresses are refused. A one-click unsubscribe footer is added automatically.
              </p>
            </form>
          </Card>

          <Card title="Sequences" description="Enrol this contact into an automated cadence of emails and follow-up tasks.">
            {sequences.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No active sequences.{' '}
                <Link href="/sequences" style={{ color: 'var(--brand-primary)' }}>
                  Build one
                </Link>{' '}
                to start automating follow-ups.
              </p>
            ) : (
              <form onSubmit={enrollInSequence} className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-40">
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Sequence
                  </label>
                  <select
                    value={enrollSeqId}
                    onChange={(e) => setEnrollSeqId(e.target.value)}
                    className="block w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Choose…</option>
                    {sequences.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" loading={busy === 'enroll'} disabled={!enrollSeqId}>
                  Enrol
                </Button>
                {enrollNotice && (
                  <span className="w-full text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {enrollNotice}
                  </span>
                )}
              </form>
            )}
          </Card>

          {customFieldDefs.length > 0 && (
            <Card title="Custom fields">
              <form onSubmit={saveCustomFields} className="space-y-3">
                {customFieldDefs.map((f) => {
                  if (f.type === 'boolean') {
                    return (
                      <label key={f.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={customValues[f.key] === true}
                          onChange={(e) => setCustomValues((p) => ({ ...p, [f.key]: e.target.checked }))}
                        />
                        {f.label}
                      </label>
                    );
                  }
                  if (f.type === 'select') {
                    return (
                      <div key={f.id}>
                        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                          {f.label}
                        </label>
                        <select
                          value={String(customValues[f.key] ?? '')}
                          onChange={(e) => setCustomValues((p) => ({ ...p, [f.key]: e.target.value }))}
                          className="block w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                        >
                          <option value="">—</option>
                          {f.options.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  return (
                    <Input
                      key={f.id}
                      label={f.label}
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      value={String(customValues[f.key] ?? '')}
                      onChange={(e) => setCustomValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  );
                })}
                <div className="flex items-center gap-3">
                  <Button type="submit" loading={busy === 'customFields'}>Save fields</Button>
                  {customSaved && <span className="text-sm" style={{ color: 'var(--color-success-text)' }}>Saved.</span>}
                </div>
              </form>
            </Card>
          )}
        </div>

        <Card title="Timeline" description="Notes, calls, emails and stage changes.">
          <form onSubmit={addNote} className="mb-4 space-y-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Add a note…"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
            <div className="flex items-center gap-2">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as 'note' | 'call' | 'meeting')}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                <option value="note">Note</option>
                <option value="call">Call logged</option>
                <option value="meeting">Meeting logged</option>
              </select>
              <Button type="submit" size="sm" loading={busy === 'note'}>
                Add to timeline
              </Button>
            </div>
          </form>

          {activities.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No activity yet.</p>
          ) : (
            <ol className="space-y-3">
              {activities.map((activity) => (
                <li key={activity.id} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  >
                    {activityIcon(activity.type)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {activity.type === 'stage_change' ? (
                        <>Stage: {activity.body?.replace(/_/g, ' ')}</>
                      ) : (
                        activity.body
                      )}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {activity.actorName ?? 'System'} · {formatDateTime(activity.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
