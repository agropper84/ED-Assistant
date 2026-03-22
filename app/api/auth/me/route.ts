import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings } from '@/lib/kv';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check terms acceptance (skip for admin)
    let termsAccepted = true;
    if (session.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      const settings = await getUserSettings(session.userId) || {};
      termsAccepted = !!settings.termsAccepted;
    }

    return NextResponse.json({
      email: session.email,
      name: session.name,
      termsAccepted,
    });
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
}
