import { NotificationsList } from './NotificationsList';

export const dynamic = 'force-dynamic';

export default function NotificationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Notifications
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Lead assignments and SLA alerts addressed to you.
        </p>
      </div>
      <NotificationsList />
    </div>
  );
}
