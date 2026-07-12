import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import {
  crmContacts,
  getDb,
  salesSequenceEnrollments,
  salesSequences,
  salesTasks,
} from '@/db';
import type { SequenceStep } from '@/db';
import { sendContactEmail } from './contact-email';

const SYSTEM_ACTOR = { email: 'sequence@rehabsync', name: 'Sequence' };

function dueAt(fromDays: number): Date {
  return new Date(Date.now() + Math.max(0, fromDays) * 86400000);
}

/** Enrol a contact into a sequence (idempotent — a contact can't be double-enrolled). */
export async function enrollContact(
  sequenceId: string,
  contactId: string,
  enrolledBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [sequence] = await db.select().from(salesSequences).where(eq(salesSequences.id, sequenceId)).limit(1);
  if (!sequence) return { ok: false, error: 'Sequence not found.' };
  if (!sequence.active) return { ok: false, error: 'Sequence is inactive.' };
  const steps = sequence.steps ?? [];
  if (steps.length === 0) return { ok: false, error: 'Sequence has no steps.' };

  const firstStep = steps[0]!;
  const inserted = await db
    .insert(salesSequenceEnrollments)
    .values({
      sequenceId,
      contactId,
      status: 'active',
      currentStep: 0,
      nextRunAt: dueAt(firstStep.delayDays),
      enrolledBy,
    })
    .onConflictDoNothing({ target: [salesSequenceEnrollments.sequenceId, salesSequenceEnrollments.contactId] })
    .returning({ id: salesSequenceEnrollments.id });

  return inserted.length > 0 ? { ok: true } : { ok: false, error: 'Contact is already enrolled.' };
}

/** Auto-enrol a contact that just entered `stage` into every sequence configured for it. */
export async function enrollOnStageEntered(contactId: string, stage: string): Promise<void> {
  const db = getDb();
  const sequences = await db
    .select({ id: salesSequences.id })
    .from(salesSequences)
    .where(and(eq(salesSequences.active, true), eq(salesSequences.enrollOnStage, stage)));
  for (const sequence of sequences) {
    await enrollContact(sequence.id, contactId, 'automation:stage_entered').catch(() => undefined);
  }
}

async function runStep(
  enrollment: typeof salesSequenceEnrollments.$inferSelect,
  step: SequenceStep,
): Promise<{ stop?: string }> {
  const db = getDb();
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, enrollment.contactId)).limit(1);
  if (!contact) return { stop: 'Contact no longer exists.' };

  if (step.type === 'email') {
    const result = await sendContactEmail(
      contact,
      { subject: step.subject, html: step.html, templateId: step.templateId ?? null },
      SYSTEM_ACTOR,
    );
    if (result.suppressed) return { stop: 'Contact suppressed — sequence stopped.' };
    // A provider hiccup (not suppression) doesn't stop the cadence; it's logged as failed and we move on.
  } else if (step.type === 'task') {
    await db.insert(salesTasks).values({
      contactId: enrollment.contactId,
      title: (step.taskTitle ?? 'Sequence task').slice(0, 200),
      type: 'todo',
      createdBy: 'sequence',
    });
  }
  return {};
}

/**
 * Advance every due, active enrolment by one step. Claimed with SKIP LOCKED so concurrent cron
 * invocations never double-run a step.
 */
export async function processSequences(limit = 50): Promise<{ processed: number }> {
  const db = getDb();
  const now = new Date();

  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(salesSequenceEnrollments)
      .where(and(eq(salesSequenceEnrollments.status, 'active'), lte(salesSequenceEnrollments.nextRunAt, now)))
      .orderBy(salesSequenceEnrollments.nextRunAt)
      .limit(limit)
      .for('update', { skipLocked: true });
    if (rows.length) {
      // Park them so a second worker won't also pick them up mid-run.
      await tx
        .update(salesSequenceEnrollments)
        .set({ nextRunAt: null, updatedAt: now })
        .where(inArray(salesSequenceEnrollments.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  let processed = 0;
  for (const enrollment of claimed) {
    const [sequence] = await db.select().from(salesSequences).where(eq(salesSequences.id, enrollment.sequenceId)).limit(1);
    const steps = sequence?.steps ?? [];
    const step = steps[enrollment.currentStep];
    if (!sequence || !step) {
      await db
        .update(salesSequenceEnrollments)
        .set({ status: 'completed', nextRunAt: null, updatedAt: new Date() })
        .where(eq(salesSequenceEnrollments.id, enrollment.id));
      continue;
    }

    let stop: string | undefined;
    try {
      ({ stop } = await runStep(enrollment, step));
    } catch (err) {
      stop = undefined; // transient error: leave the step to retry on the next tick
      await db
        .update(salesSequenceEnrollments)
        .set({ lastError: (err as Error).message.slice(0, 500), nextRunAt: dueAt(0), updatedAt: new Date() })
        .where(eq(salesSequenceEnrollments.id, enrollment.id));
      continue;
    }

    if (stop) {
      await db
        .update(salesSequenceEnrollments)
        .set({ status: 'stopped', lastError: stop, nextRunAt: null, updatedAt: new Date() })
        .where(eq(salesSequenceEnrollments.id, enrollment.id));
      processed += 1;
      continue;
    }

    const nextIndex = enrollment.currentStep + 1;
    const nextStep = steps[nextIndex];
    await db
      .update(salesSequenceEnrollments)
      .set(
        nextStep
          ? { currentStep: nextIndex, nextRunAt: dueAt(nextStep.delayDays), lastError: null, updatedAt: new Date() }
          : { currentStep: nextIndex, status: 'completed', nextRunAt: null, lastError: null, updatedAt: new Date() },
      )
      .where(eq(salesSequenceEnrollments.id, enrollment.id));
    processed += 1;
  }

  void sql;
  return { processed };
}
