import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb, salesCaptureForms } from '@/db';
import { RehabSyncWordmark } from '@/components/ui';
import { CaptureForm } from './CaptureForm';

export const dynamic = 'force-dynamic';

export default async function HostedCapturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [form] = await getDb()
    .select({
      slug: salesCaptureForms.slug,
      name: salesCaptureForms.name,
      headline: salesCaptureForms.headline,
      redirectUrl: salesCaptureForms.redirectUrl,
    })
    .from(salesCaptureForms)
    .where(and(eq(salesCaptureForms.slug, slug), eq(salesCaptureForms.active, true)))
    .limit(1);
  if (!form) notFound();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-10"
      style={{ backgroundColor: 'var(--brand-secondary)' }}
    >
      <RehabSyncWordmark color="#0d9488" />
      <CaptureForm
        slug={form.slug}
        headline={form.headline ?? 'Get in touch'}
        redirectUrl={form.redirectUrl}
      />
      <p className="text-xs text-white/40">
        We only use these details to respond to your enquiry. No marketing without your consent.
      </p>
    </div>
  );
}
