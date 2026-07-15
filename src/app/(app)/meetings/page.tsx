import { MeetingsList } from './MeetingsList';

export const dynamic = 'force-dynamic';

export default function MeetingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Meetings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Upcoming calls and demos across all your contacts. Book meetings from a contact’s record.
        </p>
      </div>
      <MeetingsList />
    </div>
  );
}
