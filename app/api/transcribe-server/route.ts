import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDeepgramApiKey } from '@/lib/api-keys';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings } from '@/lib/kv';

export const maxDuration = 120;

function fixCommonMedicalErrors(text: string): string {
  return text
    .replace(/\bnew monya\b/gi, 'pneumonia')
    .replace(/\bnew monia\b/gi, 'pneumonia')
    .replace(/\bneumonia\b/gi, 'pneumonia')
    .replace(/\bsee ?pa\b/gi, 'CVA')
    .replace(/\bsee ?va\b/gi, 'CVA')
    .replace(/\btendered\b/gi, 'tender')
    .replace(/\bby pap\b/gi, 'BiPAP')
    .replace(/\bbe pap\b/gi, 'BiPAP')
    .replace(/\bsee pap\b/gi, 'CPAP')
    .replace(/\bgerd\b/gi, 'GERD')
    .replace(/\bsp ?02\b/gi, 'SpO2')
    .replace(/\bsp ?oh ?2\b/gi, 'SpO2')
    .replace(/\bg ?c ?s\b/gi, 'GCS')
    .replace(/\be ?k ?g\b/gi, 'EKG')
    .replace(/\be ?c ?g\b/gi, 'ECG')
    .replace(/\btylenol\b/gi, 'Tylenol')
    .replace(/\badvil\b/gi, 'Advil')
    .replace(/\bmotrin\b/gi, 'Motrin')
    .replace(/\bgravel\b/gi, 'Gravol')
    .replace(/\bnarcan\b/gi, 'Narcan')
    .replace(/\bventolin\b/gi, 'Ventolin')
    .replace(/\bativan\b/gi, 'Ativan')
    .replace(/\bdilaudid\b/gi, 'Dilaudid')
    .replace(/\btoradol\b/gi, 'Toradol')
    .replace(/\bzofran\b/gi, 'Zofran')
    .replace(/\bmaxeran\b/gi, 'Maxeran')
    .replace(/\bkeflex\b/gi, 'Keflex')
    .replace(/\baugmentin\b/gi, 'Augmentin')
    .replace(/\bcipro\b/gi, 'Cipro')
    .replace(/\bmils\b/gi, 'mLs')
    .replace(/\bmigs\b/gi, 'mg')
    .replace(/\bmikes\b/gi, 'mcg')
    .trim();
}

async function getCalibrationKeywords(userId: string): Promise<string[]> {
  try {
    const settings = await getUserSettings(userId);
    const cal = settings?.encounterCalibration as Record<string, string> | undefined;
    if (!cal?.terminology) return [];
    return cal.terminology
      .split('\n')
      .map(line => {
        const arrow = line.indexOf('→');
        return arrow >= 0 ? line.substring(arrow + 1).trim() : line.trim();
      })
      .filter(k => k.length > 1)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function formatDiarizedTranscript(data: any): string {
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (!Array.isArray(words) || words.length === 0) {
    return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }

  const turns: { speaker: number; text: string }[] = [];
  let currentSpeaker = -1;

  for (const word of words) {
    const speaker = word.speaker ?? 0;
    if (speaker !== currentSpeaker) {
      turns.push({ speaker, text: word.punctuated_word || word.word });
      currentSpeaker = speaker;
    } else {
      turns[turns.length - 1].text += ' ' + (word.punctuated_word || word.word);
    }
  }

  return turns
    .map(t => `Speaker ${t.speaker + 1}: ${t.text}`)
    .join('\n');
}

/**
 * POST /api/transcribe-server
 *
 * Two modes:
 * 1. FormData with 'audio' file — uploads to Blob, then transcribes
 * 2. JSON with 'blobUrl' — fetches from existing Blob URL, then transcribes
 *
 * Server-side transcription with Vercel Blob backup.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'Deepgram API key not configured' }, { status: 400 });
    }

    let audioArrayBuffer: ArrayBuffer;
    let contentType = 'audio/webm';
    let blobUrl = '';

    // Check if this is a blobUrl-based request (audio already uploaded)
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = await request.json();
      if (!body.blobUrl) {
        return NextResponse.json({ error: 'blobUrl required' }, { status: 400 });
      }
      blobUrl = body.blobUrl;
      console.log(`[transcribe-server] Fetching audio from blob: ${blobUrl}`);
      const blobRes = await fetch(blobUrl);
      if (!blobRes.ok) {
        return NextResponse.json({ error: 'Failed to fetch audio from blob' }, { status: 500 });
      }
      audioArrayBuffer = await blobRes.arrayBuffer();
      contentType = blobRes.headers.get('content-type') || 'audio/webm';
    } else {
      // FormData upload — store in Blob first, then transcribe
      const formData = await request.formData();
      const audioFile = formData.get('audio');
      if (!audioFile || !(audioFile instanceof File)) {
        return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
      }
      audioArrayBuffer = await audioFile.arrayBuffer();
      contentType = audioFile.type || 'audio/webm';

      // Backup to Vercel Blob
      try {
        const blob = await put(
          `encounter-audio/${session.userId}/${Date.now()}-${audioFile.name}`,
          new Blob([audioArrayBuffer], { type: contentType }),
          { access: 'public', addRandomSuffix: true }
        );
        blobUrl = blob.url;
      } catch (e) {
        console.warn('[transcribe-server] Blob backup failed:', (e as Error).message);
      }
    }

    console.log(`[transcribe-server] Audio: ${(audioArrayBuffer.byteLength / 1024).toFixed(1)}KB (${contentType}), blob: ${blobUrl || 'none'}`);

    // Send to Deepgram
    const keywords = await getCalibrationKeywords(session.userId);
    const params = new URLSearchParams({
      model: 'nova-3-medical',
      smart_format: 'false',
      punctuate: 'true',
      language: 'en',
      filler_words: 'true',
      diarize: 'true',
      utterances: 'true',
      paragraphs: 'true',
    });
    for (const kw of keywords) {
      params.append('keywords', `${kw}:2`);
    }

    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: new Uint8Array(audioArrayBuffer),
    });

    if (!dgRes.ok) {
      const err = await dgRes.text();
      console.error('[transcribe-server] Deepgram error:', dgRes.status, err);
      return NextResponse.json({ error: `Deepgram error: ${dgRes.status}`, blobUrl }, { status: 500 });
    }

    const data = await dgRes.json();
    const rawTranscript = formatDiarizedTranscript(data);
    const transcript = fixCommonMedicalErrors(rawTranscript);

    console.log(`[transcribe-server] Transcript: ${transcript.length} chars`);
    return NextResponse.json({ text: transcript.trim(), blobUrl });
  } catch (error: any) {
    console.error('[transcribe-server] Error:', error);
    return NextResponse.json({ error: error?.message || 'Server transcription failed' }, { status: 500 });
  }
}
