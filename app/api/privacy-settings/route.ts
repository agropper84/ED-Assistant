import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings, setUserSettings } from '@/lib/kv';

// GET /api/privacy-settings
export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const settings = await getUserSettings(session.userId);
    return NextResponse.json({
      phiProtection: (settings?.phiProtection as boolean) || false,
      encryptionEnabled: (settings?.encryptionEnabled as boolean) || false,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/privacy-settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const body = await request.json();
    const existing = await getUserSettings(session.userId) || {};
    const updated = { ...existing, ...body };
    await setUserSettings(session.userId, updated);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
