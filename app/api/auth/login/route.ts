import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthUrl } from '@/lib/oauth';
import crypto from 'crypto';

export async function GET() {
  // Generate CSRF state token
  const state = crypto.randomBytes(16).toString('hex');

  // Store state in a short-lived cookie
  const cookieStore = await cookies();
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  const authUrl = getAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
