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
    const claudeKey = (settings?.claudeApiKey as string) || '';
    const openaiKey = (settings?.openaiApiKey as string) || '';
    return NextResponse.json({
      phiProtection: (settings?.phiProtection as boolean) || false,
      encryptionEnabled: (settings?.encryptionEnabled as boolean) || false,
      hasClaudeApiKey: !!claudeKey,
      claudeApiKeyMasked: claudeKey ? `sk-ant-...${claudeKey.slice(-4)}` : null,
      hasOpenaiApiKey: !!openaiKey,
      openaiApiKeyMasked: openaiKey ? `sk-...${openaiKey.slice(-4)}` : null,
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
