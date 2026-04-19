import { NextRequest, NextResponse } from 'next/server';
import { del as deleteBlob } from '@vercel/blob';
import crypto from 'crypto';
import { getDeepgramApiKey } from '@/lib/api-keys';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings, getUserEncryptionKey } from '@/lib/kv';

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
  return turns.map(t => `Speaker ${t.speaker + 1}: ${t.text}`).join('\n');
}

/** Decrypt AES-256-GCM encrypted audio blob */
function decryptAudio(encryptedBuffer: ArrayBuffer, keyBase64: string, ivBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const data = Buffer.from(encryptedBuffer);

  const TAG_LENGTH = 16;
  const authTag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(0, data.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * POST /api/transcribe-server
 *
 * Accepts JSON with { blobUrl, iv, contentType } — fetches encrypted audio
 * from Vercel Blob, decrypts, sends to Deepgram, returns transcript.
 * Deletes the blob after successful transcription.
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

    const body = await request.json();
    const { blobUrl, iv, contentType: audioContentType } = body;
    if (!blobUrl || !iv) {
      return NextResponse.json({ error: 'blobUrl and iv required' }, { status: 400 });
    }

    // Get user's encryption key
    const encryptionKey = await getUserEncryptionKey(session.userId);
    if (!encryptionKey) {
      return NextResponse.json({ error: 'No encryption key' }, { status: 400 });
    }

    // Fetch encrypted blob
    console.log(`[transcribe-server] Fetching encrypted blob: ${blobUrl}`);
    const blobRes = await fetch(blobUrl);
    if (!blobRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch blob' }, { status: 500 });
    }
    const encryptedBuffer = await blobRes.arrayBuffer();
    console.log(`[transcribe-server] Encrypted blob: ${(encryptedBuffer.byteLength / 1024).toFixed(1)}KB`);

    // Decrypt
    const audioBuffer = decryptAudio(encryptedBuffer, encryptionKey, iv);
    const contentType = audioContentType || 'audio/webm';
    console.log(`[transcribe-server] Decrypted audio: ${(audioBuffer.length / 1024).toFixed(1)}KB (${contentType})`);

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
      body: new Uint8Array(audioBuffer),
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

    // Delete blob after successful transcription (cleanup)
    try {
      await deleteBlob(blobUrl);
      console.log(`[transcribe-server] Deleted blob: ${blobUrl}`);
    } catch (e) {
      console.warn('[transcribe-server] Blob deletion failed (will be cleaned by cron):', (e as Error).message);
    }

    return NextResponse.json({ text: transcript.trim() });
  } catch (error: any) {
    console.error('[transcribe-server] Error:', error);
    return NextResponse.json({ error: error?.message || 'Server transcription failed' }, { status: 500 });
  }
}
