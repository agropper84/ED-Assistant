import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionFromCookies } from '@/lib/session';
import { setUserPin, deleteUserPin } from '@/lib/kv';

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { pin, action } = await request.json();

    if (action === 'remove') {
      await deleteUserPin(session.userId);
      return NextResponse.json({ success: true });
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    await setUserPin(session.userId, hashPin(pin));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
