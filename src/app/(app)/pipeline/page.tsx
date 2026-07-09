import { Card } from '@/components/ui';

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Pipeline</h1>
      <Card>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          The drag-and-drop stage board arrives in M1 — it will manage the same crm_contacts data you can already see on the dashboard.
        </p>
      </Card>
    </div>
  );
}
