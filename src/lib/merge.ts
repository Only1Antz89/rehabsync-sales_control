/** Merge-tag rendering for campaign emails: {{name}}, {{first_name}}, {{clinic_name}}, {{email}},
 *  {{unsubscribe_url}}. Unknown tags render as empty strings (never leak braces to recipients). */

export interface MergeContext {
  name?: string | null;
  clinicName?: string | null;
  email: string;
  unsubscribeUrl: string;
}

export function renderMergeTags(input: string, ctx: MergeContext): string {
  const values: Record<string, string> = {
    name: ctx.name?.trim() || 'there',
    first_name: (ctx.name?.trim().split(/\s+/)[0] ?? '') || 'there',
    clinic_name: ctx.clinicName?.trim() || 'your clinic',
    email: ctx.email,
    unsubscribe_url: ctx.unsubscribeUrl,
  };
  return input.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, tag: string) => values[tag.toLowerCase()] ?? '');
}

/** Compliance footer (PECR): sender identity + working unsubscribe, appended to every campaign
 *  email that doesn't already place {{unsubscribe_url}} itself. */
export function complianceFooter(unsubscribeUrl: string): string {
  const address = process.env['REHABSYNC_COMPANY_ADDRESS'] ?? 'IntAillium Ltd, United Kingdom';
  return [
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />',
    `<p style="font-size:12px;color:#64748b;line-height:1.5">You are receiving this because your clinic has been in touch with RehabSync. ${address}.<br/>`,
    `<a href="${unsubscribeUrl}" style="color:#0d9488">Unsubscribe</a> from these emails.</p>`,
  ].join('\n');
}

export function renderCampaignEmail(
  template: { subject: string; html: string },
  ctx: MergeContext,
): { subject: string; html: string } {
  const hasExplicitUnsub = /\{\{\s*unsubscribe_url\s*\}\}/i.test(template.html);
  const html = renderMergeTags(template.html, ctx) + (hasExplicitUnsub ? '' : complianceFooter(ctx.unsubscribeUrl));
  return { subject: renderMergeTags(template.subject, ctx), html };
}
