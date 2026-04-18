import { NextResponse } from 'next/server';
import { getDeepgramApiKey } from '@/lib/api-keys';

/**
 * Returns the user's Deepgram API key for client-side WebSocket streaming.
 * Protected by session auth — only authenticated users can access.
 * The key is used immediately by the client for a single WebSocket connection.
 */
export async function GET() {
  try {
    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 400 }
      );
    }
    return NextResponse.json({ key: apiKey });
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
}
