import { PipelineBoard } from './PipelineBoard';

export default function PipelinePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Pipeline
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Drag a lead between stages — every move is recorded on the contact&apos;s timeline.
        </p>
      </div>
      <PipelineBoard />
    </div>
  );
}
