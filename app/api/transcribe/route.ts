import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

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

    return NextResponse.json({ text: transcription.text });
  } catch (error: any) {
    console.error('Transcription error:', error);
    const message = error?.message || 'Transcription failed';
    const status = error?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
