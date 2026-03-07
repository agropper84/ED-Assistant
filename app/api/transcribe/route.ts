import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Whisper prompt for physician dictation
const DICTATION_WHISPER_PROMPT =
  'Emergency department medical dictation. Terms: HEENT, PERRL, PERRLA, ' +
  'troponin, D-dimer, CBC, BMP, CMP, ABG, EKG, ECG, CT, MRI, CXR, XR, ' +
  'dyspnea, tachycardia, bradycardia, diaphoresis, edema, JVD, CVA, TIA, ' +
  'STEMI, NSTEMI, afib, DVT, PE, pneumothorax, hemothorax, intubation, ' +
  'GCS, LOC, ROS, HPI, PMH, PSH, vitals, SpO2, prn, IV, IM, PO, BID, TID, ' +
  'mg, mL, mmHg, laceration, abscess, cellulitis, sepsis, meningitis, ' +
  'appendicitis, cholecystitis, diverticulitis, pyelonephritis, UTI, AMS, ' +
  'afebrile, normocephalic, atraumatic, midline trachea, bilateral breath sounds';

// Whisper prompt for doctor-patient encounter recording
const ENCOUNTER_WHISPER_PROMPT =
  'Emergency department doctor-patient encounter. Two speakers: physician and patient. ' +
  'Medical terms: HEENT, troponin, D-dimer, CBC, BMP, CT, MRI, EKG, dyspnea, ' +
  'tachycardia, edema, CVA, TIA, STEMI, DVT, PE, SpO2, GCS, appendicitis, ' +
  'cholecystitis, diverticulitis, pyelonephritis, UTI, cellulitis, sepsis, ' +
  'laceration, abscess, intubation, vitals, mmHg, mg, mL';

async function medicalize(rawText: string, mode: string): Promise<string> {
  const prompt = mode === 'encounter'
    ? `Convert this recorded doctor-patient emergency department encounter into a structured clinical transcript. Rules:
- Identify and label speakers as "Dr:" and "Pt:" (or "Family:" if applicable)
- Convert patient's colloquial descriptions into medically relevant language while preserving their reported symptoms and timeline
- Convert physician's spoken language into proper medical terminology
- Preserve all clinically relevant information — do NOT add, infer, or remove details
- Fix filler words, false starts, and repetition
- Use concise, professional formatting
- Output ONLY the converted transcript, nothing else

Recording:
${rawText}`
    : `Convert this voice-dictated text into proper medical documentation language. Rules:
- Fix grammar, punctuation, and sentence structure
- Replace colloquial terms with correct medical terminology and abbreviations
- Keep the same meaning and all clinical details — do NOT add, infer, or remove information
- Use concise ED physician charting style
- Output ONLY the converted text, nothing else

Dictation:
${rawText}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const result = response.content[0].type === 'text' ? response.content[0].text : '';
  return result.trim() || rawText;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const mode = (formData.get('mode') as string) || 'dictation';

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const whisperPrompt = mode === 'encounter' ? ENCOUNTER_WHISPER_PROMPT : DICTATION_WHISPER_PROMPT;

    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      prompt: whisperPrompt,
      language: 'en',
    });

    const rawText = transcription.text?.trim();
    if (!rawText) {
      return NextResponse.json({ text: '' });
    }

    // Convert to medical language
    const medicalText = await medicalize(rawText, mode);

    return NextResponse.json({ text: medicalText });
  } catch (error: any) {
    console.error('Transcription error:', error);
    const message = error?.message || 'Transcription failed';
    const status = error?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
