import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { SuppressionsManager } from './SuppressionsManager';

export const dynamic = 'force-dynamic';

export default async function AdminSuppressionsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Suppressions
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Addresses we will never email — unsubscribes, bounces, spam complaints and manual opt-outs.
          Enforced at send time on every campaign.
        </p>
      </div>
      <SuppressionsManager />
    </div>
  );
}
