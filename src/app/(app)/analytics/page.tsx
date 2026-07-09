import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Funnel, source and campaign dashboards arrive in M3 — headline numbers are already on the Dashboard.
        </p>
      </Card>
    </div>
  );
}
