import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CampaignsManager } from './CampaignsManager';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Campaigns
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Email a segment of the pipeline via SMTP2GO — tracked, suppressed-aware, one-click unsubscribe.
        </p>
      </div>
      <CampaignsManager isAdmin={isAdmin(session)} />
    </div>
  );
}
