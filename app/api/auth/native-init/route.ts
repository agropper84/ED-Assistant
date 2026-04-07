import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/oauth';
import crypto from 'crypto';
import { setNativeAuthState } from '@/lib/kv';

export async function GET() {
  try {
    const csrfToken = crypto.randomBytes(16).toString('hex');
    const state = `${csrfToken}_NATIVE`;

    await setNativeAuthState(state);

    const authUrl = getAuthUrl(state);

    return NextResponse.json({ authUrl });
  } catch (err: any) {
    console.error('native-init error:', err);
    return NextResponse.json({ error: err.message || 'Failed to initialize login' }, { status: 500 });
  }
}
