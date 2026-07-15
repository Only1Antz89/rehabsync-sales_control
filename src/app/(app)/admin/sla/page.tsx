import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { SlaManager } from './SlaManager';

export const dynamic = 'force-dynamic';

export default async function AdminSlaPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Response SLA
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Flag new leads that go unanswered for too long. The SLA check runs on the schedule and
          raises an in-app notification for admins (and the lead’s owner) when the threshold is passed.
        </p>
      </div>
      <SlaManager />
    </div>
  );
}
