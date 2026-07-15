import { ProvisioningQueue } from './ProvisioningQueue';

export const dynamic = 'force-dynamic';

export default function ProvisioningPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Tenant provisioning
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Won deals turned into platform tenants. Successful provisions link the tenant back onto the
          contact and company; anything pending or failed can be completed or retried here.
        </p>
      </div>
      <ProvisioningQueue />
    </div>
  );
}
