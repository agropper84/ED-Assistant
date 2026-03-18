import { NextRequest, NextResponse } from 'next/server';
import { getWisprApiKey } from '@/lib/api-keys';

export const maxDuration = 60;

const WISPR_API_URL = 'https://platform-api.wisprflow.ai/api/v1/dash/api';

export async function POST(request: NextRequest) {
  try {
    const apiKey = await getWisprApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Wispr Flow API key not configured. Add your key in Settings > API Keys.' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const context = (formData.get('context') as string) || '';

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Convert audio to base64
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const base64Audio = buffer.toString('base64');

    // Build context for Wispr
    const wisprContext: Record<string, unknown> = {};
    if (context) {
      wisprContext.dictionary_context = context.split(/\s+/).slice(-30);
    }

    const res = await fetch(WISPR_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: base64Audio,
        language: ['en'],
        context: wisprContext,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Wispr API error:', res.status, errText);
      return NextResponse.json({ error: `Wispr error: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    const transcript = data?.text || '';

    return NextResponse.json({ text: transcript.trim() });
  } catch (error: any) {
    console.error('Wispr transcription error:', error);
    return NextResponse.json(
      { error: error?.message || 'Wispr transcription failed' },
      { status: 500 }
    );
  }
}
