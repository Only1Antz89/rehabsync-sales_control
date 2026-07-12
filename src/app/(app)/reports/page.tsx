import { ReportsBuilder } from './ReportsBuilder';

export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Reports
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Build ad-hoc reports over contacts and deals — choose a metric, break it down by any
          dimension (including your custom fields), filter, and save it for reuse.
        </p>
      </div>
      <ReportsBuilder />
    </div>
  );
}
