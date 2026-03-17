import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getOpenAIClient, getDeepgramApiKey } from '@/lib/api-keys';
import { getShortcutTokenUser, setShortcutTranscript, getUserSettings } from '@/lib/kv';
import { getSheetsContextForUser, updatePatientFields } from '@/lib/google-sheets';
import { DEVICE_WHISPER_PROMPT } from '@/lib/whisper-prompts';

export const maxDuration = 60;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    // Validate Bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const hash = sha256(token);
    const userId = await getShortcutTokenUser(hash);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get audio file from multipart form data
    const formData = await request.formData();
    const audioFile = formData.get('audio');

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Check user's watch transcribe preference
    const userSettings = await getUserSettings(userId);
    const watchApi = (userSettings?.watchTranscribeApi as string) || 'deepgram';

    // Transcribe with user's preferred engine
    let transcriptionText = '';
    const dgKey = await getDeepgramApiKey();
    if (watchApi === 'deepgram' && dgKey) {
      const buffer = Buffer.from(await audioFile.arrayBuffer());
      const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-3-medical&smart_format=true&punctuate=true&language=en', {
        method: 'POST',
        headers: { 'Authorization': `Token ${dgKey}`, 'Content-Type': audioFile.type || 'audio/webm' },
        body: buffer,
      });
      if (dgRes.ok) {
        const data = await dgRes.json();
        transcriptionText = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      }
    }
    if (!transcriptionText) {
      const openai = await getOpenAIClient();
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile, model: 'whisper-1', prompt: DEVICE_WHISPER_PROMPT, language: 'en',
      });
      transcriptionText = transcriptionText || '';
    }

    // If rowIndex provided, assign directly to patient
    const rowIndexStr = formData.get('rowIndex');
    const sheetName = formData.get('sheetName') as string | null;

    if (rowIndexStr) {
      const rowIndex = parseInt(rowIndexStr as string, 10);
      const ctx = await getSheetsContextForUser(userId);
      await updatePatientFields(ctx, rowIndex, { transcript: transcriptionText }, sheetName || undefined);
      return NextResponse.json({ transcript: transcriptionText, assigned: true, rowIndex });
    }

    // Store transcript in KV with 10 min TTL
    const id = randomBytes(16).toString('hex');
    await setShortcutTranscript(id, { transcript: transcriptionText, userId }, 600);

    // Build URL
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const url = `${protocol}://${host}/?transcript=${id}`;

    return NextResponse.json({ id, url, transcript: transcriptionText });
  } catch (error: any) {
    console.error('Shortcut upload error:', error);
    const message = error?.message || 'Upload failed';
    const status = error?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
