import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { CustomFieldsManager } from './CustomFieldsManager';

export const dynamic = 'force-dynamic';

export default async function AdminCustomFieldsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isAdmin(session)) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Custom fields
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Add your own fields to contact records — text, numbers, dates, dropdowns or yes/no. They
          appear on every contact and can be used as report dimensions.
        </p>
      </div>
      <CustomFieldsManager />
    </div>
  );
}
