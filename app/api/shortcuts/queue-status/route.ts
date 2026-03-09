import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getShortcutTokenUser, getPendingAudioIds } from '@/lib/kv';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// GET /api/shortcuts/queue-status — Check which queue items are still pending
// Token-authenticated (for watch app)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const hash = sha256(token);
    const userId = await getShortcutTokenUser(hash);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const ids = await getPendingAudioIds(userId);
    return NextResponse.json({ ids });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to check queue' }, { status: 500 });
  }
}
