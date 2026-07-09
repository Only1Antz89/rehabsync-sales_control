import { TasksBoard } from './TasksBoard';

export default function TasksPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Tasks
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Follow-ups across the pipeline — grouped by urgency.
        </p>
      </div>
      <TasksBoard />
    </div>
  );
}
