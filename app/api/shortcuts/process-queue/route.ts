import { NextResponse } from 'next/server';
import { getOpenAIClient, getDeepgramApiKey } from '@/lib/api-keys';
import { del as deleteBlob } from '@vercel/blob';
import { getSessionFromCookies } from '@/lib/session';
import {
  getPendingAudioIds,
  getPendingAudio,
  deletePendingAudio,
  PendingAudio,
} from '@/lib/kv';
import {
  getSheetsContextForUser,
  getPatient,
  updatePatientFields,
  getOrCreateDateSheet,
  getNextEmptyRow,
  getPatientCount,
  getStyleGuideFromSheet,
} from '@/lib/google-sheets';
import { processEncounter } from '@/lib/claude';
import { DEVICE_WHISPER_PROMPT } from '@/lib/whisper-prompts';

export const maxDuration = 60;

// POST /api/shortcuts/process-queue — Process pending audio uploads
// Called from the web app (session-authenticated)
export async function POST() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const pendingIds = await getPendingAudioIds(session.userId);
    if (pendingIds.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    // Process one at a time (within the 60s limit)
    const id = pendingIds[0];
    const pending = await getPendingAudio(id);

    if (!pending) {
      await deletePendingAudio(id, session.userId);
      return NextResponse.json({ processed: 0, skipped: 1 });
    }

    const result = await processOne(pending);
    await deletePendingAudio(id, session.userId);

    // Clean up blob storage
    try {
      const blobToken = process.env.ed_audio_blob_public_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
      await deleteBlob(pending.blobUrl, { token: blobToken });
    } catch (e) {
      console.warn('Failed to delete blob:', e);
    }

    return NextResponse.json({
      processed: 1,
      remaining: pendingIds.length - 1,
      result,
    });
  } catch (error: any) {
    console.error('Process queue error:', error);
    return NextResponse.json({ error: error?.message || 'Processing failed' }, { status: 500 });
  }
}

// GET — Check queue status
export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const pendingIds = await getPendingAudioIds(session.userId);
    const items: { id: string; mode?: string; sheetName?: string; rowIndex?: number; createdAt: string }[] = [];

    for (const id of pendingIds) {
      const pending = await getPendingAudio(id);
      if (pending) {
        items.push({
          id: pending.id,
          mode: pending.mode,
          sheetName: pending.sheetName,
          rowIndex: pending.rowIndex,
          createdAt: pending.createdAt,
        });
      } else {
        // Clean up stale reference
        await deletePendingAudio(id, session.userId);
      }
    }

    return NextResponse.json({ pending: items.length, items });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

async function processOne(pending: PendingAudio): Promise<{ transcript: string; mode: string }> {
  // 1. Fetch audio from Blob and transcribe
  const audioResponse = await fetch(pending.blobUrl);
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  const audioFile = new File([audioBuffer], pending.filename, { type: 'audio/m4a' });

  // Deepgram (preferred) or Whisper (fallback)
  let transcript = '';
  const dgKey = await getDeepgramApiKey();
  if (dgKey) {
    const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-3-medical&smart_format=true&punctuate=true&language=en', {
      method: 'POST',
      headers: { 'Authorization': `Token ${dgKey}`, 'Content-Type': 'audio/m4a' },
      body: audioBuffer,
    });
    if (dgRes.ok) {
      const data = await dgRes.json();
      transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    }
  }
  if (!transcript) {
    const openai = await getOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile, model: 'whisper-1', prompt: DEVICE_WHISPER_PROMPT, language: 'en',
    });
    transcript = transcription.text || '';
  }
  const ctx = await getSheetsContextForUser(pending.userId);

  // 2. Handle based on mode
  if (pending.mode === 'quick') {
    // Create new encounter row
    const sheetName = await getOrCreateDateSheet(ctx);
    const rowIndex = await getNextEmptyRow(ctx, sheetName);
    const patientCount = await getPatientCount(ctx, sheetName);
    const encounterNum = patientCount + 1;

    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Toronto',
    });

    await updatePatientFields(ctx, rowIndex, {
      patientNum: String(encounterNum),
      name: `New Encounter ${encounterNum}`,
      timestamp,
      transcript,
    }, sheetName);

    return { transcript, mode: 'quick' };
  }

  // Patient-specific modes
  const rowIndex = pending.rowIndex!;
  const sheetName = pending.sheetName;

  // Assign transcript (append if needed)
  if (pending.append) {
    const existing = await getPatient(ctx, rowIndex, sheetName);
    if (existing?.transcript) {
      await updatePatientFields(ctx, rowIndex, {
        transcript: existing.transcript + '\n\n---\n\n' + transcript,
      }, sheetName);
    } else {
      await updatePatientFields(ctx, rowIndex, { transcript }, sheetName);
    }
  } else {
    await updatePatientFields(ctx, rowIndex, { transcript }, sheetName);
  }

  // If mode is analyze or full, run AI processing
  if (pending.mode === 'analyze' || pending.mode === 'full') {
    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (patient) {
      let styleGuidance = '';
      try {
        const guide = await getStyleGuideFromSheet(ctx);
        const parts: string[] = [];
        for (const [section, examples] of Object.entries(guide.examples)) {
          if ((examples as string[]).length > 0) {
            parts.push(`${section.toUpperCase()} style examples:\n${(examples as string[]).map((e: string, i: number) => `Example ${i + 1}:\n${e}`).join('\n\n')}`);
          }
        }
        if (guide.extractedFeatures.length > 0) parts.push(`Writing style features:\n${guide.extractedFeatures.join('\n')}`);
        if (guide.customGuidance) parts.push(`Custom guidance:\n${guide.customGuidance}`);
        styleGuidance = parts.join('\n\n');
      } catch {}

      const result = await processEncounter(patient, { styleGuidance });

      if (pending.mode === 'full') {
        await updatePatientFields(ctx, rowIndex, {
          hpi: result.hpi || '', objective: result.objective || '', assessmentPlan: result.assessmentPlan || '',
          ddx: result.ddx || '', investigations: result.investigations || '',
          management: result.management || '', evidence: result.evidence || '',
          diagnosis: result.diagnosis || '', icd9: result.icd9 || '', icd10: result.icd10 || '',
        }, sheetName);
      } else {
        const fields: Record<string, string> = {};
        if (result.ddx) fields.ddx = result.ddx;
        if (result.investigations) fields.investigations = result.investigations;
        if (result.management) fields.management = result.management;
        if (result.evidence) fields.evidence = result.evidence;
        if (result.diagnosis) fields.diagnosis = result.diagnosis;
        await updatePatientFields(ctx, rowIndex, fields, sheetName);
      }
    }
  }

  return { transcript, mode: pending.mode || 'transcribe' };
}
