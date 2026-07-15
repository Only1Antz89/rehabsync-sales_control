import { getSession } from '@/lib/auth';
import { ContactsExplorer } from './ContactsExplorer';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const session = await getSession();
  const isAdmin = session?.role === 'admin' || session?.role === 'super_admin';
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Contacts
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Every lead in one place — search, filter by stage, run bulk actions, export, and merge duplicates.
        </p>
      </div>
      <ContactsExplorer isAdmin={isAdmin} />
    </div>
  );
}
