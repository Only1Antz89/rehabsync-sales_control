import { NextResponse } from 'next/server';
import { processCampaigns } from '@/lib/campaigns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Cron target (see vercel.json) — advances scheduled/sending campaigns one batch. */
export async function GET(req: Request) {
  const secret = process.env['CRON_SECRET'];
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processCampaigns();
  return NextResponse.json({ ok: true, ...result });
}
