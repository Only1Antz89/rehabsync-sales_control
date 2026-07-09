import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Contacts</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          The filterable contact list and detail timeline arrive in M1.
        </p>
      </Card>
    </div>
  );
}
