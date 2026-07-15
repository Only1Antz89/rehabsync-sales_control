'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

const KIND_VARIANT: Record<string, BadgeVariant> = {
  sla_breach: 'warning',
  lead_assigned: 'info',
  system: 'neutral',
};

function entityHref(n: Notification): string | null {
  if (n.entityType === 'crm_contact' && n.entityId) return `/contacts/${n.entityId}`;
  return null;
}

export function NotificationsList() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/notifications')
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((d: { notifications: Notification[] }) => setNotifications(d.notifications))
      .catch(() => setNotifications([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' }).catch(() => undefined);
    load();
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => undefined);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (notifications === null) return <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="space-y-3">
      {hasUnread && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" loading={busy} onClick={markAllRead}>
            Mark all read
          </Button>
        </div>
      )}
      {notifications.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>You’re all caught up — no notifications.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const href = entityHref(n);
            const unread = !n.readAt;
            return (
              <li
                key={n.id}
                className="rounded-xl border p-4 flex items-start justify-between gap-3"
                style={{
                  borderColor: unread ? 'var(--brand-primary)' : 'var(--border-primary)',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={KIND_VARIANT[n.kind] ?? 'neutral'}>{n.kind.replace('_', ' ')}</Badge>
                    {unread && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--brand-primary)' }} />}
                  </div>
                  <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>
                    {href ? (
                      <Link href={href} className="hover:underline" onClick={() => void markRead(n.id)}>
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body && <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>}
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {new Date(n.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {unread && (
                  <button
                    type="button"
                    onClick={() => void markRead(n.id)}
                    className="text-xs cursor-pointer shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Mark read
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
