import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserElevenlabsApiKey } from '@/lib/kv';

// GET — Generate a single-use token for ElevenLabs real-time WebSocket
export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const apiKey = await getUserElevenlabsApiKey(session.userId) || process.env.ELEVENLABS_API_KEY || '';
    if (!apiKey) return NextResponse.json({ error: 'ElevenLabs API key not configured', keyMissing: true }, { status: 400 });

    // Get single-use token for realtime WebSocket (client-side auth)
    // Endpoint from ElevenLabs SDK source: POST /v1/single-use-token/{token_type}
    const res = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error');
      console.error('ElevenLabs token error:', res.status, err);
      return NextResponse.json({ error: `Failed to get token: ${res.status}: ${err.substring(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const token = data.token || data.access_token;
    if (!token) {
      console.error('ElevenLabs token response missing token:', JSON.stringify(data).substring(0, 200));
      return NextResponse.json({ error: 'Token response missing token field' }, { status: 500 });
    }
    return NextResponse.json({ token });
  } catch (error: any) {
    console.error('ElevenLabs token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
