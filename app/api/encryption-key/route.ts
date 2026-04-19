import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserEncryptionKey } from '@/lib/kv';

/** GET /api/encryption-key — returns user's encryption key for client-side audio encryption */
export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const key = await getUserEncryptionKey(session.userId);
    return NextResponse.json({ key: key || null });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
