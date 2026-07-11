import { CompanyDetail } from './CompanyDetail';

export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetail companyId={id} />;
}
