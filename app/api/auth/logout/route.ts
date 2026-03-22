import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';

async function handleLogout(request: NextRequest) {
  const session = await getSessionFromCookies();
  session.destroy();
  return NextResponse.redirect(new URL('/login', request.nextUrl.origin));
}

export async function POST(request: NextRequest) {
  return handleLogout(request);
}

export async function GET(request: NextRequest) {
  return handleLogout(request);
}
