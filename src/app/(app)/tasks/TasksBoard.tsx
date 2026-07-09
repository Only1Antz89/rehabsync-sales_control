'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CheckSquare, RotateCcw, XSquare } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';

interface TaskRow {
  id: string;
  title: string;
  type: string;
  status: string;
  dueAt: string | null;
  assigneeEmail: string | null;
  contactId: string | null;
  contactName: string | null;
  clinicName: string | null;
}

type Bucket = 'Overdue' | 'Due today' | 'Upcoming' | 'No due date';

function bucketOf(task: TaskRow): Bucket {
  if (!task.dueAt) return 'No due date';
  const due = new Date(task.dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due < today) return 'Overdue';
  if (due < tomorrow) return 'Due today';
  return 'Upcoming';
}

const BUCKETS: Bucket[] = ['Overdue', 'Due today', 'Upcoming', 'No due date'];

export function TasksBoard() {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [scope, setScope] = useState<'mine' | 'open' | 'all'>('mine');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const load = useCallback(() => {
    fetch(`/api/tasks?scope=${scope}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((d: { tasks: TaskRow[] }) => setTasks(d.tasks))
      .catch(() => setError('Could not load tasks.'));
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy('create');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, dueAt: due || null }),
      });
      if (res.ok) {
        setTitle('');
        setDue('');
        load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: 'done' | 'cancelled' | 'open') {
    setBusy(id);
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  const open = (tasks ?? []).filter((t) => t.status === 'open');
  const closed = (tasks ?? []).filter((t) => t.status !== 'open');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-primary)' }}>
          {(['mine', 'open', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className="px-3 py-1.5 text-sm font-medium"
              style={
                scope === s
                  ? { backgroundColor: 'var(--brand-primary)', color: '#fff' }
                  : { color: 'var(--text-secondary)' }
              }
            >
              {s === 'mine' ? 'My open' : s === 'open' ? 'All open' : 'Everything'}
            </button>
          ))}
        </div>
      </div>

      <Card title="New task">
        <form onSubmit={createTask} className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-48">
            <Input placeholder="e.g. Chase Riverside Clinic about the demo" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
          />
          <Button type="submit" loading={busy === 'create'}>Add task</Button>
        </form>
      </Card>

      {error && <p className="text-sm" style={{ color: 'var(--color-error-text)' }}>{error}</p>}
      {tasks === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : (
        <>
          {BUCKETS.map((bucket) => {
            const rows = open.filter((t) => bucketOf(t) === bucket);
            if (rows.length === 0) return null;
            return (
              <Card key={bucket} title={`${bucket} (${rows.length})`}>
                <ul className="divide-y" style={{ borderColor: 'var(--border-secondary)' }}>
                  {rows.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {task.title}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {task.contactId && task.contactName ? (
                            <Link href={`/contacts/${task.contactId}`} className="underline">
                              {task.contactName}
                              {task.clinicName ? ` · ${task.clinicName}` : ''}
                            </Link>
                          ) : (
                            'General'
                          )}
                          {task.assigneeEmail ? ` · ${task.assigneeEmail}` : ''}
                          {task.dueAt ? (
                            <span className="inline-flex items-center gap-1 ml-1">
                              <CalendarClock size={11} /> {new Date(task.dueAt).toLocaleDateString('en-GB')}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" disabled={busy === task.id} onClick={() => void setStatus(task.id, 'done')}>
                          <CheckSquare size={13} className="mr-1" /> Done
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busy === task.id} onClick={() => void setStatus(task.id, 'cancelled')}>
                          <XSquare size={13} className="mr-1" /> Cancel
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {open.length === 0 && (
            <Card>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Nothing open — enjoy the quiet, or add a follow-up above.
              </p>
            </Card>
          )}
          {scope === 'all' && closed.length > 0 && (
            <Card title={`Completed & cancelled (${closed.length})`}>
              <ul className="space-y-1.5">
                {closed.slice(0, 30).map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{task.title}</span>
                    <Button size="sm" variant="ghost" disabled={busy === task.id} onClick={() => void setStatus(task.id, 'open')}>
                      <RotateCcw size={13} className="mr-1" /> Reopen
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
