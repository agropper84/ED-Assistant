import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import {
  getUserClaudeApiKey, setUserClaudeApiKey,
  getUserOpenAIApiKey, setUserOpenAIApiKey,
  getUserDeepgramApiKey, setUserDeepgramApiKey,
  getUserWisprApiKey, setUserWisprApiKey,
  getUserElevenlabsApiKey, setUserElevenlabsApiKey,
  getUserSettings, setUserSettings,
  deleteUserElevenlabsApiKey,
} from '@/lib/kv';

// GET /api/privacy-settings
export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [claudeKey, openaiKey, deepgramKey, wisprKey, elKey, settings] = await Promise.all([
      getUserClaudeApiKey(session.userId),
      getUserOpenAIApiKey(session.userId),
      getUserDeepgramApiKey(session.userId),
      getUserWisprApiKey(session.userId),
      getUserElevenlabsApiKey(session.userId),
      getUserSettings(session.userId),
    ]);

    // Strip any legacy API key fields from settings blob
    const { claudeApiKey: _c, openaiApiKey: _o, deepgramApiKey: _dg, wisprApiKey: _w, elevenlabsApiKey: _el, ...cleanSettings } = (settings || {}) as Record<string, unknown>;

    return NextResponse.json({
      hasClaudeApiKey: !!claudeKey,
      claudeApiKeyMasked: claudeKey ? `sk-ant-...${claudeKey.slice(-4)}` : null,
      hasOpenaiApiKey: !!openaiKey,
      openaiApiKeyMasked: openaiKey ? `sk-...${openaiKey.slice(-4)}` : null,
      hasDeepgramApiKey: !!deepgramKey,
      deepgramApiKeyMasked: deepgramKey ? `...${deepgramKey.slice(-4)}` : null,
      hasWisprApiKey: !!wisprKey,
      wisprApiKeyMasked: wisprKey ? `...${wisprKey.slice(-4)}` : null,
      hasElevenlabsApiKey: !!elKey,
      elevenlabsApiKeyMasked: elKey ? `...${elKey.slice(-4)}` : null,
      // Settings
      phiProtection: cleanSettings.phiProtection ?? false,
      encryptionEnabled: cleanSettings.encryptionEnabled ?? false,
      aiLearningEnabled: cleanSettings.aiLearningEnabled ?? true,
      dictationCalibration: cleanSettings.dictationCalibration || null,
      encounterCalibration: cleanSettings.encounterCalibration || null,
      medicalKeyterms: cleanSettings.medicalKeyterms || '',
      showSttEngine: cleanSettings.showSttEngine ?? false,
      ...cleanSettings,
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

    // Helper: detect masked API key values (returned by GET for display)
    const isMaskedKey = (v: string) => v.startsWith('...') || v.startsWith('sk-ant-...') || v.startsWith('sk-...');

    // Handle API keys separately — each gets dedicated encrypted storage
    if ('claudeApiKey' in body) {
      const key = body.claudeApiKey as string;
      if (key && isMaskedKey(key)) { /* skip — masked value, don't overwrite real key */ }
      else if (!key || key.trim() === '') { return NextResponse.json({ success: true, hasClaudeApiKey: false }); }
      else {
        if (!key.startsWith('sk-ant-')) return NextResponse.json({ error: 'Invalid API key format — should start with sk-ant-' }, { status: 400 });
        await setUserClaudeApiKey(session.userId, key.trim());
        return NextResponse.json({ success: true, hasClaudeApiKey: true });
      }
    }
    if ('openaiApiKey' in body) {
      const key = body.openaiApiKey as string;
      if (key && isMaskedKey(key)) { /* skip */ }
      else if (!key || key.trim() === '') { return NextResponse.json({ success: true, hasOpenaiApiKey: false }); }
      else { await setUserOpenAIApiKey(session.userId, key.trim()); return NextResponse.json({ success: true, hasOpenaiApiKey: true }); }
    }
    if ('deepgramApiKey' in body) {
      const key = body.deepgramApiKey as string;
      if (key && isMaskedKey(key)) { /* skip */ }
      else if (!key || key.trim() === '') { return NextResponse.json({ success: true, hasDeepgramApiKey: false }); }
      else { await setUserDeepgramApiKey(session.userId, key.trim()); return NextResponse.json({ success: true, hasDeepgramApiKey: true }); }
    }
    if ('wisprApiKey' in body) {
      const key = body.wisprApiKey as string;
      if (key && isMaskedKey(key)) { /* skip */ }
      else if (!key || key.trim() === '') { return NextResponse.json({ success: true, hasWisprApiKey: false }); }
      else { await setUserWisprApiKey(session.userId, key.trim()); return NextResponse.json({ success: true, hasWisprApiKey: true }); }
    }
    if ('elevenlabsApiKey' in body) {
      const key = body.elevenlabsApiKey as string;
      if (key && isMaskedKey(key)) { /* skip */ }
      else if (!key || key.trim() === '') { await deleteUserElevenlabsApiKey(session.userId); return NextResponse.json({ success: true, hasElevenlabsApiKey: false }); }
      else { await setUserElevenlabsApiKey(session.userId, key.trim()); return NextResponse.json({ success: true, hasElevenlabsApiKey: true }); }
    }

    // Whitelist allowed non-key settings
    const ALLOWED_SETTINGS = new Set([
      'phiProtection', 'encryptionEnabled', 'aiLearningEnabled',
      'dictationCalibration', 'encounterCalibration',
      'dictationCustomTerms', 'encounterCustomTerms',
      'medicalKeyterms', 'showSttEngine',
      'speechAPI', 'transcribeAPI', 'transcribeWebAPI', 'transcribeWatchAPI',
    ]);
    const filtered = Object.fromEntries(
      Object.entries(body).filter(([key]) => ALLOWED_SETTINGS.has(key))
    );

    if (Object.keys(filtered).length > 0) {
      const existing = await getUserSettings(session.userId) || {};
      // Strip legacy API keys from settings blob
      const { claudeApiKey: _c, openaiApiKey: _o, deepgramApiKey: _dg, wisprApiKey: _w, elevenlabsApiKey: _el, ...clean } = existing as Record<string, unknown>;
      const updated = { ...clean, ...filtered };
      await setUserSettings(session.userId, updated);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
