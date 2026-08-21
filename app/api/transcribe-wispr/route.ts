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
    const blobUrl = formData.get('blobUrl') as string || '';
    const context = (formData.get('context') as string) || '';

    // Support both direct file upload and blob URL (for large files >4.5MB)
    let buffer: Buffer;
    if (blobUrl) {
      const blobRes = await fetch(blobUrl);
      if (!blobRes.ok) return NextResponse.json({ error: 'Failed to fetch audio from storage' }, { status: 500 });
      buffer = Buffer.from(await blobRes.arrayBuffer());
      import('@vercel/blob').then(({ del }) => del(blobUrl).catch(() => {}));
    } else if (audioFile && audioFile instanceof File) {
      buffer = Buffer.from(await audioFile.arrayBuffer());
    } else {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
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
