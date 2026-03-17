import { NextRequest, NextResponse } from 'next/server';
import { getDeepgramApiKey } from '@/lib/api-keys';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured. Add your key in Settings > Privacy.' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const mode = (formData.get('mode') as string) || 'dictation';

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // Call Deepgram REST API directly
    const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-3-medical&smart_format=true&punctuate=true&language=en' + (mode === 'encounter' ? '&diarize=true' : ''), {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': audioFile.type || 'audio/webm',
      },
      body: buffer,
    });

    if (!dgRes.ok) {
      const err = await dgRes.text();
      console.error('Deepgram API error:', dgRes.status, err);
      return NextResponse.json({ error: `Deepgram error: ${dgRes.status}` }, { status: 500 });
    }

    const data = await dgRes.json();
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    return NextResponse.json({ text: transcript.trim() });
  } catch (error: any) {
    console.error('Deepgram transcription error:', error);
    return NextResponse.json(
      { error: error?.message || 'Deepgram transcription failed' },
      { status: 500 }
    );
  }
}
