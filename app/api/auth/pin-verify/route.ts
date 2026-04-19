import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromCookies } from '@/lib/session';
import { getUserPin } from '@/lib/kv';

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { pin } = await request.json();
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });
    }

    const storedHash = await getUserPin(session.userId);
    if (!storedHash) {
      return NextResponse.json({ error: 'No PIN set' }, { status: 400 });
    }

    if (hashPin(pin) !== storedHash) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 403 });
    }

    // Unlock session
    session.locked = false;
    session.lastActivity = Date.now();
    await session.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
