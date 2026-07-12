import { SequencesManager } from './SequencesManager';

export const dynamic = 'force-dynamic';

export default function SequencesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Sequences
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Multi-step cadences — automated emails and follow-up tasks on a schedule. Optionally
          auto-enrol contacts when they reach a stage.
        </p>
      </div>
      <SequencesManager />
    </div>
  );
}
