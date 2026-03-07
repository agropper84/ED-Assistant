import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import OpenAI from 'openai';
import { getShortcutTokenUser, setShortcutTranscript } from '@/lib/kv';
import { getSheetsContextForUser, updatePatientFields } from '@/lib/google-sheets';

export const maxDuration = 60;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Reuse medical prompt from transcribe route
const MEDICAL_PROMPT =
  'Emergency department medical dictation. Terms: HEENT, PERRL, PERRLA, ' +
  'troponin, D-dimer, CBC, BMP, CMP, ABG, EKG, ECG, CT, MRI, CXR, XR, ' +
  'dyspnea, tachycardia, bradycardia, diaphoresis, edema, JVD, CVA, TIA, ' +
  'STEMI, NSTEMI, afib, DVT, PE, pneumothorax, hemothorax, intubation, ' +
  'GCS, LOC, ROS, HPI, PMH, PSH, vitals, SpO2, prn, IV, IM, PO, BID, TID, ' +
  'mg, mL, mmHg, laceration, abscess, cellulitis, sepsis, meningitis, ' +
  'appendicitis, cholecystitis, diverticulitis, pyelonephritis, UTI, AMS, ' +
  'afebrile, normocephalic, atraumatic, midline trachea, bilateral breath sounds';

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

    // Transcribe with Whisper
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      prompt: MEDICAL_PROMPT,
      language: 'en',
    });

    // If rowIndex provided, assign directly to patient
    const rowIndexStr = formData.get('rowIndex');
    const sheetName = formData.get('sheetName') as string | null;

    if (rowIndexStr) {
      const rowIndex = parseInt(rowIndexStr as string, 10);
      const ctx = await getSheetsContextForUser(userId);
      await updatePatientFields(ctx, rowIndex, { transcript: transcription.text }, sheetName || undefined);
      return NextResponse.json({ transcript: transcription.text, assigned: true, rowIndex });
    }

    // Store transcript in KV with 10 min TTL
    const id = randomBytes(16).toString('hex');
    await setShortcutTranscript(id, { transcript: transcription.text, userId }, 600);

    // Build URL
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const url = `${protocol}://${host}/?transcript=${id}`;

    return NextResponse.json({ id, url });
  } catch (error: any) {
    console.error('Shortcut upload error:', error);
    const message = error?.message || 'Upload failed';
    const status = error?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
