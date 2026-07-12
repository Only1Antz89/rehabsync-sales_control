import { NextResponse } from 'next/server';
import { processSequences } from '@/lib/sequences';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Advance due sequence steps. CRON_SECRET-guarded; drive from an external scheduler (see DEPLOYMENT.md). */
export async function GET(req: Request) {
  const secret = process.env['CRON_SECRET'];
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processSequences();
  return NextResponse.json({ ok: true, ...result });
}
