import { NextRequest, NextResponse } from 'next/server';
import { TOTP, Secret } from 'otpauth';
import { getSessionFromCookies } from '@/lib/session';
import { getUserTotpSecret } from '@/lib/kv';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { code, unlock } = await request.json();
    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Code must be 6 digits' }, { status: 400 });
    }

    const secretBase32 = await getUserTotpSecret(session.userId);
    if (!secretBase32) {
      return NextResponse.json({ error: 'TOTP not configured' }, { status: 400 });
    }

    const totp = new TOTP({
      issuer: 'ED Assistant',
      label: session.email || 'User',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 403 });
    }

    // If this is an unlock request, update session
    if (unlock) {
      session.locked = false;
      session.lastActivity = Date.now();
      await session.save();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Verification failed' }, { status: 500 });
  }
}
