import { NextRequest, NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';

export const maxDuration = 60;

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — max possible retention (user setting controls display)

/**
 * GET /api/cron/cleanup-blobs
 * Called by Vercel Cron every hour. Deletes encrypted audio blobs older than 12 hours.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = Date.now();
    let deleted = 0;
    let cursor: string | undefined;

    // Paginate through all blobs in the encounter-audio prefix
    do {
      const result = await list({ prefix: 'encounter-audio/', cursor, limit: 100 });
      cursor = result.cursor;

      const toDelete: string[] = [];
      for (const blob of result.blobs) {
        const age = now - new Date(blob.uploadedAt).getTime();
        if (age > MAX_AGE_MS) {
          toDelete.push(blob.url);
        }
      }

      if (toDelete.length > 0) {
        await del(toDelete);
        deleted += toDelete.length;
      }
    } while (cursor);

    console.log(`[cleanup-blobs] Deleted ${deleted} expired blobs`);
    return NextResponse.json({ deleted });
  } catch (error: any) {
    console.error('[cleanup-blobs] Error:', error);
    return NextResponse.json({ error: error?.message || 'Cleanup failed' }, { status: 500 });
  }
}
