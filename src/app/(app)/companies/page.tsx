import { CompaniesExplorer } from './CompaniesExplorer';

export const dynamic = 'force-dynamic';

export default function CompaniesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Companies
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          The clinics and organisations your contacts and deals belong to.
        </p>
      </div>
      <CompaniesExplorer />
    </div>
  );
}
