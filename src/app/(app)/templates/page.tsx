import { TemplatesManager } from './TemplatesManager';

export default function TemplatesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Templates
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Reusable campaign emails with merge tags and a compliance footer.
        </p>
      </div>
      <TemplatesManager />
    </div>
  );
}
