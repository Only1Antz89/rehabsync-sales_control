import type { BadgeVariant } from '@/components/ui';
// Import enums/types from the schema module directly (not '@/db', which also pulls in the
// postgres driver) so this stays safe to import from client components.
import { DEAL_STAGES } from '@/db/schema';
import type { DealStage } from '@/db/schema';

/** Open deal-pipeline stages, in order (kanban columns). Won/Lost are a separate `status`. */
export const DEAL_STAGE_ORDER = DEAL_STAGES;

export const DEAL_STAGE_LABELS: Record<string, string> = {
  qualification: 'Qualification',
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
};

/** Default win probability per stage — used to weight open pipeline value. */
export const DEAL_STAGE_PROBABILITY: Record<DealStage, number> = {
  qualification: 20,
  discovery: 40,
  proposal: 60,
  negotiation: 80,
};

export function dealStageProbability(stage: string): number {
  return DEAL_STAGE_PROBABILITY[stage as DealStage] ?? 0;
}

export function dealStageVariant(stage: string): BadgeVariant {
  switch (stage) {
    case 'negotiation':
      return 'info';
    case 'proposal':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function dealStatusVariant(status: string): BadgeVariant {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'error';
  return 'neutral';
}

/** Weighted value (pence) of an open deal = amount × stage probability. */
export function weightedValuePence(amountPence: number, stage: string, probability: number | null): number {
  const p = probability ?? dealStageProbability(stage);
  return Math.round((amountPence * p) / 100);
}
