import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings, setUserSettings } from '@/lib/kv';

// POST /api/auth/accept-terms — Record that user accepted the beta agreement
export async function POST() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const existing = await getUserSettings(session.userId) || {};
    await setUserSettings(session.userId, {
      ...existing,
      termsAccepted: true,
      termsAcceptedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
