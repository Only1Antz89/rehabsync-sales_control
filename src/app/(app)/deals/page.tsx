import { getSession } from '@/lib/auth';
import { DealsBoard } from './DealsBoard';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  await getSession();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Deals
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Your revenue pipeline — drag deals between stages, weighted by win probability. Won and
          lost deals close out of the board.
        </p>
      </div>
      <DealsBoard />
    </div>
  );
}
