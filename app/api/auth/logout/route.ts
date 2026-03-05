import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';

export async function POST() {
  const session = await getSessionFromCookies();
  session.destroy();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'));
}
