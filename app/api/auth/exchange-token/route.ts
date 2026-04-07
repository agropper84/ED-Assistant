import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getAuthExchangeToken } from '@/lib/kv';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const raw = await getAuthExchangeToken(token);
  if (!raw) {
    return NextResponse.json({ error: 'Token expired or invalid' }, { status: 401 });
  }

  const data = JSON.parse(raw);

  // Set session cookie
  const session = await getSessionFromCookies();
  session.userId = data.userId;
  session.email = data.email;
  session.name = data.name;
  session.accessToken = data.accessToken;
  session.refreshToken = data.refreshToken;
  session.tokenExpiry = data.tokenExpiry;
  session.approved = data.approved;
  await session.save();

  // Detect native app (Accept: application/json or native=1 param)
  const isNative = request.nextUrl.searchParams.get('native') === '1' ||
    request.headers.get('accept')?.includes('application/json');

  if (isNative) {
    return NextResponse.json({ success: true, approved: data.approved });
  }

  // Web: redirect
  const redirectPath = request.nextUrl.searchParams.get('redirect') || '/';
  return NextResponse.redirect(new URL(redirectPath, request.nextUrl.origin));
}
