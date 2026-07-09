import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Campaigns</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Email campaigns (segments, scheduling, SMTP2GO delivery and tracking) arrive in M2.
        </p>
      </Card>
    </div>
  );
}
