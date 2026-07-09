import { ContactsExplorer } from './ContactsExplorer';

export default function ContactsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Contacts
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Every lead in one place — search, filter by stage, and open a contact for the full timeline.
        </p>
      </div>
      <ContactsExplorer />
    </div>
  );
}
