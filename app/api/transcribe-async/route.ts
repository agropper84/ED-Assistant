import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getSessionFromCookies } from '@/lib/session';
import { getUserDeepgramApiKey, getUserElevenlabsApiKey, getUserWisprApiKey } from '@/lib/kv';

export const maxDuration = 300;

/** Build speaker-tagged transcript from Deepgram word-level diarization */
function buildSpeakerTranscript(words: { word: string; speaker?: number; punctuated_word?: string }[]): string {
  if (!words || words.length === 0) return '';
  const lines: string[] = [];
  let currentSpeaker = -1;
  let currentLine = '';

  for (const w of words) {
    const speaker = w.speaker ?? 0;
    const word = w.punctuated_word || w.word;
    if (speaker !== currentSpeaker) {
      if (currentLine.trim()) lines.push(`Speaker ${currentSpeaker + 1}: ${currentLine.trim()}`);
      currentSpeaker = speaker;
      currentLine = word;
    } else {
      currentLine += ' ' + word;
    }
  }
  if (currentLine.trim()) lines.push(`Speaker ${currentSpeaker + 1}: ${currentLine.trim()}`);

  return lines.length > 0 ? lines.join('\n') : '';
}

/**
 * POST /api/transcribe-async
 * Transcribes audio from a Vercel Blob URL using Deepgram, ElevenLabs, or Wispr.
 * Unlike /api/transcribe-server, this does NOT require encryption (iv).
 * Used for encounter mode recordings uploaded via doUploadBlob.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { blobUrl, mode, contentType, api } = await request.json() as {
      blobUrl: string;
      mode?: string;
      contentType?: string;
      api?: 'deepgram' | 'elevenlabs' | 'wispr';
    };

    if (!blobUrl) return NextResponse.json({ error: 'blobUrl is required' }, { status: 400 });

    console.log(`[transcribe-async] ${api || 'deepgram'} mode=${mode}, blobUrl=${blobUrl.substring(0, 80)}...`);

    // Route to ElevenLabs
    if (api === 'elevenlabs') {
      const elApiKey = await getUserElevenlabsApiKey(session.userId) || process.env.ELEVENLABS_API_KEY || '';
      if (!elApiKey) return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 400 });

      const audioRes = await fetch(blobUrl);
      if (!audioRes.ok) return NextResponse.json({ error: 'Failed to fetch audio' }, { status: 500 });
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      const ct = contentType?.split(';')[0].trim() || 'audio/webm';
      const ext = ct.includes('mp4') ? 'mp4' : 'webm';

      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(audioBuffer)], { type: ct }), `recording.${ext}`);
      fd.append('model_id', 'scribe_v2');
      fd.append('language_code', 'en');
      if (mode === 'encounter') fd.append('diarize', 'true');

      const elRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': elApiKey },
        body: fd,
      });

      del(blobUrl).catch(() => {});

      if (!elRes.ok) {
        const errText = await elRes.text().catch(() => '');
        console.error('[transcribe-async] ElevenLabs error:', elRes.status, errText.substring(0, 200));
        return NextResponse.json({ error: `ElevenLabs error: ${elRes.status}` }, { status: 500 });
      }
      const elData = await elRes.json();
      return NextResponse.json({ text: elData.text || '' });
    }

    // Route to Wispr
    if (api === 'wispr') {
      const wisprKey = await getUserWisprApiKey(session.userId);
      if (!wisprKey) return NextResponse.json({ error: 'Wispr API key not configured' }, { status: 400 });

      const audioRes = await fetch(blobUrl);
      if (!audioRes.ok) return NextResponse.json({ error: 'Failed to fetch audio' }, { status: 500 });
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      del(blobUrl).catch(() => {});

      const base64Audio = audioBuffer.toString('base64');
      const wRes = await fetch('https://platform-api.wisprflow.ai/api/v1/dash/api', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${wisprKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64Audio, language: ['en'] }),
      });
      if (!wRes.ok) return NextResponse.json({ error: `Wispr error: ${wRes.status}` }, { status: 500 });
      const wData = await wRes.json();
      return NextResponse.json({ text: wData.text || '' });
    }

    // Default: Deepgram nova-3-medical
    const apiKey = await getUserDeepgramApiKey(session.userId) || process.env.DEEPGRAM_API_KEY || '';
    if (!apiKey) return NextResponse.json({ error: 'Deepgram API key not configured' }, { status: 400 });

    const audioRes = await fetch(blobUrl);
    if (!audioRes.ok) return NextResponse.json({ error: 'Failed to fetch audio from storage' }, { status: 500 });
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    const params = new URLSearchParams({
      model: 'nova-3-medical',
      smart_format: 'true',
      punctuate: 'true',
      language: 'en',
    });
    if (mode === 'encounter') {
      params.set('diarize', 'true');
      params.set('smart_format', 'false');
    }

    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': contentType?.split(';')[0].trim() || 'audio/webm',
      },
      body: new Uint8Array(audioBuffer) as any,
    });

    del(blobUrl).catch(() => {});

    if (!dgRes.ok) {
      const err = await dgRes.text().catch(() => 'Unknown error');
      console.error('[transcribe-async] Deepgram error:', dgRes.status, err.substring(0, 200));
      return NextResponse.json({ error: `Transcription failed: ${dgRes.status}` }, { status: 500 });
    }

    const data = await dgRes.json();
    const alt = data?.results?.channels?.[0]?.alternatives?.[0];
    let transcript = alt?.transcript || '';

    if (mode === 'encounter' && alt?.words?.length) {
      const tagged = buildSpeakerTranscript(alt.words);
      if (tagged) transcript = tagged;
    }

    console.log(`[transcribe-async] Success: ${transcript.length} chars`);
    return NextResponse.json({ text: transcript.trim() });
  } catch (error: any) {
    console.error('[transcribe-async] Error:', error);
    return NextResponse.json({ error: error?.message || 'Transcription failed' }, { status: 500 });
  }
}
