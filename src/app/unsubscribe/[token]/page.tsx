import { eq } from 'drizzle-orm';
import { getDb, salesCampaignRecipients, salesSuppressions } from '@/db';
import { verifyUnsubscribeToken } from '@/lib/tokens';
import { Card, RehabSyncWordmark } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** One-click unsubscribe — must work logged-out, idempotent, and never reveal list membership. */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = verifyUnsubscribeToken(token);

  let message = 'This unsubscribe link is invalid or has expired.';
  if (email) {
    const db = getDb();
    await db
      .insert(salesSuppressions)
      .values({ email, reason: 'unsubscribed', source: 'unsubscribe_link' })
      .onConflictDoNothing();
    await db
      .update(salesCampaignRecipients)
      .set({ status: 'unsubscribed', updatedAt: new Date() })
      .where(eq(salesCampaignRecipients.email, email));
    message = `${email} has been unsubscribed. You won't receive further marketing emails from RehabSync.`;
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <RehabSyncWordmark color="#0d9488" />
      <Card className="w-full max-w-md text-center">
        <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {email ? 'Unsubscribed' : 'Link not recognised'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
      </Card>
    </div>
  );
}
