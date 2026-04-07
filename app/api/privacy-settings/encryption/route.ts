import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserEncryptionKey, setUserEncryptionKey } from '@/lib/kv';
import { generateEncryptionKey } from '@med/shared';

// POST — generate encryption key if not exists
export async function POST() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const existing = await getUserEncryptionKey(session.userId);
    if (existing) {
      return NextResponse.json({ success: true, message: 'Key already exists' });
    }

    const key = generateEncryptionKey();
    await setUserEncryptionKey(session.userId, key);

    return NextResponse.json({ success: true, message: 'Encryption key generated' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
