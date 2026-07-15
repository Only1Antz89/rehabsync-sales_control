import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { RoutingManager } from './RoutingManager';

export const dynamic = 'force-dynamic';

export default async function AdminRoutingPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Lead routing
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Automatically hand new capture-form leads to your reps in turn (round-robin). When routing
          is off, inbound leads arrive unassigned as before.
        </p>
      </div>
      <RoutingManager />
    </div>
  );
}
