import { QuotesList } from './QuotesList';

export const dynamic = 'force-dynamic';

export default function QuotesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Quotes
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Build proposals with line items and totals, then track them through to accepted.
        </p>
      </div>
      <QuotesList />
    </div>
  );
}
