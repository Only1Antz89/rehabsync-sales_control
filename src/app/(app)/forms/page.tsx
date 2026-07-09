import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { FormsManager } from './FormsManager';

export const dynamic = 'force-dynamic';

export default async function FormsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Capture Forms
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Hosted and embeddable lead-capture forms — submissions land straight in the pipeline.
        </p>
      </div>
      <FormsManager isAdmin={isAdmin(session)} />
    </div>
  );
}
