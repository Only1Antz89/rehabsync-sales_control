'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface Meeting {
  id: string;
  contactId: string;
  title: string;
  startsAt: string;
  durationMin: number;
  location: string | null;
  status: string;
  contactName: string;
  contactEmail: string;
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  scheduled: 'info',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'warning',
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MeetingsList() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');

  useEffect(() => {
    setMeetings(null);
    fetch(`/api/meetings?scope=${scope === 'all' ? 'all' : 'upcoming'}`)
      .then((res) => (res.ok ? res.json() : { meetings: [] }))
      .then((d: { meetings: Meeting[] }) => setMeetings(d.meetings))
      .catch(() => setMeetings([]));
  }, [scope]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={scope === 'upcoming' ? 'primary' : 'secondary'} onClick={() => setScope('upcoming')}>
          Upcoming
        </Button>
        <Button size="sm" variant={scope === 'all' ? 'primary' : 'secondary'} onClick={() => setScope('all')}>
          All
        </Button>
      </div>

      {meetings === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : meetings.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {scope === 'upcoming' ? 'No upcoming meetings. Book one from a contact’s record.' : 'No meetings yet.'}
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
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Meeting</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Where</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id} className="border-b last:border-0" style={{ borderColor: 'var(--border-secondary)' }}>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {formatWhen(m.startsAt)}
                    <span style={{ color: 'var(--text-muted)' }}> · {m.durationMin}m</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{m.title}</td>
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${m.contactId}`} className="hover:underline" style={{ color: 'var(--brand-primary)' }}>
                      {m.contactName}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{m.location ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[m.status] ?? 'neutral'}>{m.status.replace('_', ' ')}</Badge>
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
