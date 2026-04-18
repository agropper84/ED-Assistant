import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDeepgramApiKey } from '@/lib/api-keys';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings } from '@/lib/kv';

export const maxDuration = 120; // 2 minutes for large recordings

/**
 * Fix common medical STT errors (same as transcribe-deepgram).
 */
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

/** Get calibration keywords for Deepgram keyword boosting */
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

/** Format diarized Deepgram response with speaker labels */
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
 * Server-side encounter transcription:
 * 1. Receive raw audio from client (no browser processing)
 * 2. Backup to Vercel Blob
 * 3. Send directly to Deepgram for transcription
 * 4. Return transcript
 *
 * This produces better results than client-side transcription because
 * the audio bypasses the browser's compressor/gain AudioContext chain.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    console.log(`[transcribe-server] Received ${(buffer.length / 1024).toFixed(1)}KB audio (${audioFile.type})`);

    // 1. Backup to Vercel Blob (awaited — we want the URL for logging)
    let blobUrl = '';
    try {
      const blob = await put(
        `encounter-audio/${session.userId}/${Date.now()}-${audioFile.name}`,
        new Blob([buffer], { type: audioFile.type }),
        { access: 'public', addRandomSuffix: true }
      );
      blobUrl = blob.url;
      console.log(`[transcribe-server] Backed up to blob: ${blobUrl}`);
    } catch (e) {
      console.warn('[transcribe-server] Blob backup failed:', (e as Error).message);
    }

    // 2. Send to Deepgram — encounter mode with diarization
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

    console.log(`[transcribe-server] Sending to Deepgram (${keywords.length} keywords)`);

    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': audioFile.type || 'audio/webm',
      },
      body: buffer,
    });

    if (!dgRes.ok) {
      const err = await dgRes.text();
      console.error('[transcribe-server] Deepgram error:', dgRes.status, err);
      return NextResponse.json(
        { error: `Deepgram error: ${dgRes.status}`, blobUrl },
        { status: 500 }
      );
    }

    const data = await dgRes.json();
    const rawTranscript = formatDiarizedTranscript(data);
    const transcript = fixCommonMedicalErrors(rawTranscript);

    console.log(`[transcribe-server] Transcript: ${transcript.length} chars, ${transcript.split('\n').length} lines`);

    return NextResponse.json({ text: transcript.trim(), blobUrl });
  } catch (error: any) {
    console.error('[transcribe-server] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Server transcription failed' },
      { status: 500 }
    );
  }
}
