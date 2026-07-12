'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, CheckSquare, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Button, Card, Input } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import type { SequenceStep } from '@/db/schema';
import { STAGE_LABELS, STAGE_ORDER } from '@/lib/stages';

interface SequenceRow {
  id: string;
  name: string;
  active: boolean;
  enrollOnStage: string | null;
  steps: SequenceStep[];
  stepCount: number;
  activeEnrollments: number;
  completedEnrollments: number;
  totalEnrollments: number;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
}

interface EnrollmentRow {
  id: string;
  contactId: string;
  contactName: string | null;
  status: string;
  currentStep: number;
  nextRunAt: string | null;
  lastError: string | null;
}

// Editable step shape — all fields present so the form never juggles undefined.
interface StepDraft {
  type: 'email' | 'task';
  delayDays: number;
  templateId: string;
  subject: string;
  html: string;
  taskTitle: string;
}

function emailStep(): StepDraft {
  return { type: 'email', delayDays: 0, templateId: '', subject: '', html: '', taskTitle: '' };
}
function taskStep(): StepDraft {
  return { type: 'task', delayDays: 1, templateId: '', subject: '', html: '', taskTitle: '' };
}

function enrollmentVariant(status: string): BadgeVariant {
  if (status === 'completed') return 'success';
  if (status === 'stopped') return 'error';
  return 'info';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One line describing a saved step, for the collapsed sequence summary. */
function stepSummary(step: SequenceStep, index: number): string {
  const when = step.delayDays === 0 ? 'immediately' : `after ${step.delayDays} day${step.delayDays === 1 ? '' : 's'}`;
  const what =
    step.type === 'email'
      ? `Email${step.templateId ? ' (template)' : step.subject ? ` — ${step.subject}` : ''}`
      : `Task — ${step.taskTitle ?? ''}`;
  return `${index + 1}. ${what} · ${when}`;
}

export function SequencesManager() {
  const [sequences, setSequences] = useState<SequenceRow[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // New-sequence form
  const [name, setName] = useState('');
  const [enrollOnStage, setEnrollOnStage] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([emailStep()]);

  // Expanded sequence detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[] | null>(null);

  const load = useCallback(() => {
    fetch('/api/sequences')
      .then((res) => (res.ok ? res.json() : { sequences: [] }))
      .then((d: { sequences: SequenceRow[] }) => setSequences(d.sequences))
      .catch(() => setSequences([]));
    fetch('/api/templates')
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((d: { templates: Template[] }) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patchStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      const payload = {
        name,
        enrollOnStage: enrollOnStage || null,
        steps: steps.map((s) =>
          s.type === 'email'
            ? { type: 'email', delayDays: s.delayDays, templateId: s.templateId || null, subject: s.subject, html: s.html }
            : { type: 'task', delayDays: s.delayDays, taskTitle: s.taskTitle },
        ),
      };
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Create failed.');
        return;
      }
      setName('');
      setEnrollOnStage('');
      setSteps([emailStep()]);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(seq: SequenceRow) {
    setBusy(seq.id);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${seq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !seq.active }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Update failed.');
      }
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(seq: SequenceRow) {
    if (!window.confirm(`Delete sequence “${seq.name}”? Enrolments will be removed.`)) return;
    setBusy(seq.id);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${seq.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Delete failed.');
      }
      if (expandedId === seq.id) setExpandedId(null);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function expand(seq: SequenceRow) {
    if (expandedId === seq.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(seq.id);
    setEnrollments(null);
    const res = await fetch(`/api/sequences/${seq.id}`);
    if (res.ok) {
      const d = (await res.json()) as { enrollments: EnrollmentRow[] };
      setEnrollments(d.enrollments);
    } else {
      setEnrollments([]);
    }
  }

  const canCreate = name.trim().length > 0 && steps.length > 0;

  return (
    <div className="space-y-5">
      <Card
        title="New sequence"
        description="Steps run in order on a schedule. Emails respect suppressions; a suppressed contact stops the sequence."
      >
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Post-demo nurture"
              required
            />
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Auto-enrol trigger
              </label>
              <select
                value={enrollOnStage}
                onChange={(e) => setEnrollOnStage(e.target.value)}
                className="block w-full rounded-lg border px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              >
                <option value="">Manual only</option>
                {STAGE_ORDER.map((stage) => (
                  <option key={stage} value={stage}>
                    When a contact enters “{STAGE_LABELS[stage] ?? stage}”
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Steps
            </p>
            {steps.map((step, index) => (
              <div
                key={index}
                className="rounded-lg border p-3 space-y-3"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {step.type === 'email' ? <Mail size={15} /> : <CheckSquare size={15} />}
                    <span>
                      Step {index + 1} · {step.type === 'email' ? 'Email' : 'Task'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    aria-label="Remove step"
                    className="p-1 rounded hover:opacity-80"
                    style={{ color: 'var(--color-error-text)' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span>Wait</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={step.delayDays}
                    onChange={(e) => patchStep(index, { delayDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    className="w-20 rounded-lg border px-2 py-1 text-sm"
                    style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  />
                  <span>day{step.delayDays === 1 ? '' : 's'} {index === 0 ? 'after enrolment' : 'after the previous step'}</span>
                </div>

                {step.type === 'email' ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                        Template (optional)
                      </label>
                      <select
                        value={step.templateId}
                        onChange={(e) => patchStep(index, { templateId: e.target.value })}
                        className="block w-full rounded-lg border px-3 py-2 text-sm"
                        style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                      >
                        <option value="">Write inline…</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!step.templateId && (
                      <>
                        <Input
                          label="Subject"
                          value={step.subject}
                          onChange={(e) => patchStep(index, { subject: e.target.value })}
                          placeholder="How are you getting on?"
                        />
                        <div>
                          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                            Body (HTML)
                          </label>
                          <textarea
                            value={step.html}
                            onChange={(e) => patchStep(index, { html: e.target.value })}
                            rows={4}
                            placeholder="<p>Hi {{name}}, …</p>"
                            className="block w-full rounded-lg border px-3 py-2 text-sm font-mono"
                            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <Input
                    label="Task title"
                    value={step.taskTitle}
                    onChange={(e) => patchStep(index, { taskTitle: e.target.value })}
                    placeholder="Call to check in"
                  />
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setSteps((p) => [...p, emailStep()])}>
                <Plus size={14} className="mr-1" /> Email step
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setSteps((p) => [...p, taskStep()])}>
                <Plus size={14} className="mr-1" /> Task step
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>
              {error}
            </p>
          )}
          <Button type="submit" loading={busy === 'create'} disabled={!canCreate}>
            Create sequence
          </Button>
        </form>
      </Card>

      <Card title="Sequences">
        {sequences === null ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Loading…
          </p>
        ) : sequences.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No sequences yet — build one above to start automating follow-ups.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
            {sequences.map((seq) => {
              const isOpen = expandedId === seq.id;
              return (
                <li key={seq.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button onClick={() => void expand(seq)} className="flex items-start gap-2 text-left min-w-0">
                      <span className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                      <span className="min-w-0">
                        <span className="text-sm font-medium block" style={{ color: 'var(--text-primary)' }}>
                          {seq.name}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {seq.stepCount} step{seq.stepCount === 1 ? '' : 's'} · {seq.activeEnrollments} active ·{' '}
                          {seq.completedEnrollments} completed
                          {seq.enrollOnStage ? ` · auto-enrols on “${STAGE_LABELS[seq.enrollOnStage] ?? seq.enrollOnStage}”` : ''}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant={seq.active ? 'success' : 'neutral'}>{seq.active ? 'active' : 'paused'}</Badge>
                      <Button size="sm" variant="secondary" disabled={busy === seq.id} onClick={() => void toggleActive(seq)}>
                        {seq.active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button size="sm" variant="danger" disabled={busy === seq.id} onClick={() => void remove(seq)}>
                        Delete
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 ml-6 space-y-3">
                      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-secondary)' }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                          Steps
                        </p>
                        <ol className="space-y-0.5">
                          {seq.steps.map((step, i) => (
                            <li key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {stepSummary(step, i)}
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div>
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                          Enrolments
                        </p>
                        {enrollments === null ? (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Loading…
                          </p>
                        ) : enrollments.length === 0 ? (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            No contacts enrolled yet. Enrol from a contact’s record, or set an auto-enrol trigger.
                          </p>
                        ) : (
                          <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                            {enrollments.map((en) => (
                              <li key={en.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                                <a href={`/contacts/${en.contactId}`} className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {en.contactName ?? 'Unknown contact'}
                                </a>
                                <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                  <span>step {en.currentStep + 1}</span>
                                  {en.status === 'active' && <span>· next {fmtDate(en.nextRunAt)}</span>}
                                  {en.lastError && <span style={{ color: 'var(--color-error-text)' }}>· {en.lastError}</span>}
                                  <Badge variant={enrollmentVariant(en.status)}>{en.status}</Badge>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
