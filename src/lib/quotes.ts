import { desc, eq, sql } from 'drizzle-orm';
import { getDb, QUOTE_STATUSES, salesQuoteLineItems, salesQuotes } from '@/db';
import type { QuoteStatus } from '@/db';

export interface LineItemInput {
  description?: string;
  quantity?: number;
  unitPricePence?: number;
}

export interface QuoteInput {
  title?: string;
  contactId?: string | null;
  dealId?: string | null;
  discountPence?: number;
  taxRatePct?: number;
  notes?: string | null;
  validUntil?: string | null;
  lineItems?: LineItemInput[];
}

type Quote = typeof salesQuotes.$inferSelect;
type LineItem = typeof salesQuoteLineItems.$inferSelect;

export interface QuoteWithItems extends Quote {
  lineItems: LineItem[];
}

const int = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;

/** Normalise raw line-item input into clean rows with per-line totals. */
function cleanLineItems(items: LineItemInput[] | undefined): {
  description: string;
  quantity: number;
  unitPricePence: number;
  lineTotalPence: number;
  sortOrder: number;
}[] {
  return (items ?? [])
    .map((it, idx) => {
      const description = (it.description ?? '').trim().slice(0, 300);
      const quantity = Math.max(0, int(it.quantity, 1));
      const unitPricePence = Math.max(0, int(it.unitPricePence, 0));
      return { description, quantity, unitPricePence, lineTotalPence: quantity * unitPricePence, sortOrder: idx };
    })
    .filter((it) => it.description.length > 0);
}

/** Compute subtotal / tax / total (all pence). Discount is applied before tax; nothing goes negative. */
export function computeTotals(
  lineItems: { lineTotalPence: number }[],
  discountPence: number,
  taxRatePct: number,
): { subtotalPence: number; discountPence: number; taxPence: number; totalPence: number } {
  const subtotalPence = lineItems.reduce((s, i) => s + i.lineTotalPence, 0);
  const discount = Math.min(Math.max(0, discountPence), subtotalPence);
  const afterDiscount = subtotalPence - discount;
  const rate = Math.min(100, Math.max(0, taxRatePct));
  const taxPence = Math.round((afterDiscount * rate) / 100);
  return { subtotalPence, discountPence: discount, taxPence, totalPence: afterDiscount + taxPence };
}

/** Next human-friendly quote number (Q-0001…). Retries on the unique-index race. */
async function nextQuoteNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(salesQuotes);
  const base = (row?.n ?? 0) + 1;
  return `Q-${String(base).padStart(4, '0')}`;
}

export async function getQuote(id: string): Promise<QuoteWithItems | null> {
  const db = getDb();
  const [quote] = await db.select().from(salesQuotes).where(eq(salesQuotes.id, id)).limit(1);
  if (!quote) return null;
  const lineItems = await db
    .select()
    .from(salesQuoteLineItems)
    .where(eq(salesQuoteLineItems.quoteId, id))
    .orderBy(salesQuoteLineItems.sortOrder);
  return { ...quote, lineItems };
}

export async function listQuotes(limit = 200): Promise<Quote[]> {
  return getDb().select().from(salesQuotes).orderBy(desc(salesQuotes.createdAt)).limit(limit);
}

export async function createQuote(
  input: QuoteInput,
  createdBy: string,
): Promise<{ quote: QuoteWithItems } | { error: string }> {
  const db = getDb();
  const title = input.title?.trim();
  if (!title) return { error: 'A quote title is required.' };
  const items = cleanLineItems(input.lineItems);
  const totals = computeTotals(items, int(input.discountPence, 0), int(input.taxRatePct, 0));

  // A couple of attempts to dodge a number collision under concurrency.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const number = await nextQuoteNumber();
    try {
      const [quote] = await db
        .insert(salesQuotes)
        .values({
          number,
          title: title.slice(0, 200),
          contactId: input.contactId ?? null,
          dealId: input.dealId ?? null,
          status: 'draft',
          notes: input.notes?.trim() || null,
          validUntil: input.validUntil || null,
          taxRatePct: Math.min(100, Math.max(0, int(input.taxRatePct, 0))),
          ...totals,
          createdBy,
        })
        .returning();
      if (items.length) {
        await db.insert(salesQuoteLineItems).values(items.map((it) => ({ ...it, quoteId: quote!.id })));
      }
      return { quote: (await getQuote(quote!.id))! };
    } catch (err) {
      if (attempt === 2) return { error: (err as Error).message };
    }
  }
  return { error: 'Could not allocate a quote number.' };
}

export async function updateQuote(
  id: string,
  input: QuoteInput & { status?: string },
): Promise<{ quote: QuoteWithItems } | { error: string }> {
  const db = getDb();
  const [existing] = await db.select().from(salesQuotes).where(eq(salesQuotes.id, id)).limit(1);
  if (!existing) return { error: 'Quote not found.' };

  const values: Partial<typeof salesQuotes.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { error: 'Title cannot be empty.' };
    values.title = t.slice(0, 200);
  }
  if (input.contactId !== undefined) values.contactId = input.contactId || null;
  if (input.dealId !== undefined) values.dealId = input.dealId || null;
  if (input.notes !== undefined) values.notes = input.notes?.trim() || null;
  if (input.validUntil !== undefined) values.validUntil = input.validUntil || null;

  if (input.status !== undefined) {
    if (!(QUOTE_STATUSES as readonly string[]).includes(input.status)) return { error: 'Unknown status.' };
    values.status = input.status as QuoteStatus;
    if (input.status === 'sent' && !existing.sentAt) values.sentAt = new Date();
    if (input.status === 'accepted') values.acceptedAt = new Date();
  }

  // If line items (or discount/tax) are supplied, replace the items and recompute totals.
  const itemsProvided = input.lineItems !== undefined;
  if (itemsProvided || input.discountPence !== undefined || input.taxRatePct !== undefined) {
    const items = itemsProvided
      ? cleanLineItems(input.lineItems)
      : (await db.select().from(salesQuoteLineItems).where(eq(salesQuoteLineItems.quoteId, id))).map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPricePence: i.unitPricePence,
          lineTotalPence: i.lineTotalPence,
          sortOrder: i.sortOrder,
        }));
    const discount = input.discountPence !== undefined ? int(input.discountPence, 0) : existing.discountPence;
    const taxRate = input.taxRatePct !== undefined ? int(input.taxRatePct, 0) : existing.taxRatePct;
    const totals = computeTotals(items, discount, taxRate);
    values.taxRatePct = Math.min(100, Math.max(0, taxRate));
    values.subtotalPence = totals.subtotalPence;
    values.discountPence = totals.discountPence;
    values.taxPence = totals.taxPence;
    values.totalPence = totals.totalPence;

    if (itemsProvided) {
      await db.delete(salesQuoteLineItems).where(eq(salesQuoteLineItems.quoteId, id));
      if (items.length) await db.insert(salesQuoteLineItems).values(items.map((it) => ({ ...it, quoteId: id })));
    }
  }

  await db.update(salesQuotes).set(values).where(eq(salesQuotes.id, id));
  return { quote: (await getQuote(id))! };
}
