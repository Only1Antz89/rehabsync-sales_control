import type { BadgeVariant } from '@/components/ui';

/** Display metadata for the platform's CRM stages (order = funnel order). */
export const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  demo_scheduled: 'Demo scheduled',
  demo_completed: 'Demo completed',
  onboarding: 'Onboarding',
  customer: 'Customer',
  churned: 'Churned',
  lost: 'Lost',
};

export const STAGE_ORDER = Object.keys(STAGE_LABELS);

/** Funnel stages shown as kanban columns (terminal churned/lost are shown collapsed). */
export const PIPELINE_STAGES = [
  'new',
  'contacted',
  'demo_scheduled',
  'demo_completed',
  'onboarding',
  'customer',
] as const;

export const TERMINAL_STAGES = ['churned', 'lost'] as const;

export function stageVariant(stage: string): BadgeVariant {
  if (stage === 'customer') return 'success';
  if (stage === 'churned' || stage === 'lost') return 'error';
  if (stage === 'new') return 'info';
  return 'neutral';
}

export function formatGbp(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(pence / 100);
}
