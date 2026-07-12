import type { SequenceStep } from '@/db/schema';

/** Validate + normalise a sequence step list; returns an error reason on the first bad step. */
export function cleanSteps(input: unknown): { steps: SequenceStep[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: 'Add at least one step.' };
  const steps: SequenceStep[] = [];
  for (const raw of input.slice(0, 25)) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const type = s['type'] === 'task' ? 'task' : s['type'] === 'email' ? 'email' : null;
    if (!type) return { error: 'Each step must be an email or a task.' };
    const delayDays = Math.max(0, Math.min(365, Math.round(Number(s['delayDays'] ?? 0) || 0)));
    if (type === 'email') {
      const templateId = typeof s['templateId'] === 'string' && s['templateId'] ? String(s['templateId']) : null;
      const subject = typeof s['subject'] === 'string' ? s['subject'].trim() : '';
      const html = typeof s['html'] === 'string' ? s['html'] : '';
      if (!templateId && (!subject || !html.trim())) return { error: 'Email steps need a template or a subject + body.' };
      steps.push({ type, delayDays, templateId, subject, html });
    } else {
      const taskTitle = typeof s['taskTitle'] === 'string' ? s['taskTitle'].trim() : '';
      if (!taskTitle) return { error: 'Task steps need a title.' };
      steps.push({ type, delayDays, taskTitle: taskTitle.slice(0, 200) });
    }
  }
  return { steps };
}
