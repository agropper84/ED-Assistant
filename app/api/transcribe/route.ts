import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Medical terminology prompt to improve Whisper accuracy
const MEDICAL_PROMPT =
  'Emergency department medical dictation. Terms: HEENT, PERRL, PERRLA, ' +
  'troponin, D-dimer, CBC, BMP, CMP, ABG, EKG, ECG, CT, MRI, CXR, XR, ' +
  'dyspnea, tachycardia, bradycardia, diaphoresis, edema, JVD, CVA, TIA, ' +
  'STEMI, NSTEMI, afib, DVT, PE, pneumothorax, hemothorax, intubation, ' +
  'GCS, LOC, ROS, HPI, PMH, PSH, vitals, SpO2, prn, IV, IM, PO, BID, TID, ' +
  'mg, mL, mmHg, laceration, abscess, cellulitis, sepsis, meningitis, ' +
  'appendicitis, cholecystitis, diverticulitis, pyelonephritis, UTI, AMS, ' +
  'afebrile, normocephalic, atraumatic, midline trachea, bilateral breath sounds';

async function medicalize(rawText: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Convert this voice-dictated text into proper medical documentation language. Rules:
- Fix grammar, punctuation, and sentence structure
- Replace colloquial terms with correct medical terminology and abbreviations
- Keep the same meaning and all clinical details — do NOT add, infer, or remove information
- Use concise ED physician charting style
- Output ONLY the converted text, nothing else

Dictation:
${rawText}`,
    }],
  });

  const result = response.content[0].type === 'text' ? response.content[0].text : '';
  return result.trim() || rawText;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      prompt: MEDICAL_PROMPT,
      language: 'en',
    });

    const rawText = transcription.text?.trim();
    if (!rawText) {
      return NextResponse.json({ text: '' });
    }

    // Convert to medical language
    const medicalText = await medicalize(rawText);

    return NextResponse.json({ text: medicalText });
  } catch (error: any) {
    console.error('Transcription error:', error);
    const message = error?.message || 'Transcription failed';
    const status = error?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
