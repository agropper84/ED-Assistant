import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 30;

// POST /api/shortcuts/referral
// Body: { rowIndex, sheetName }
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const anthropic = await getAnthropicClient();
    const { rowIndex, sheetName } = await request.json();

    const patient = await getPatient(auth.ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const parts: string[] = [];
    parts.push(`Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}`);
    if (patient.diagnosis) parts.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient.hpi) parts.push(`HPI: ${patient.hpi}`);
    if (patient.objective) parts.push(`Objective: ${patient.objective}`);
    if (patient.assessmentPlan) parts.push(`Assessment & Plan: ${patient.assessmentPlan}`);
    if (patient.triageVitals) parts.push(`Triage: ${patient.triageVitals}`);
    if (patient.transcript) parts.push(`Transcript: ${patient.transcript}`);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: `Write a professional specialist referral letter for this ED patient. Include: reason for referral, relevant history, examination findings, investigations, and urgency. Use formal letter format.\n\n${parts.join('\n\n')}`,
      }],
    });

    const referral = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    await updatePatientFields(auth.ctx, rowIndex, { referral }, sheetName);

    return NextResponse.json({ referral });
  } catch (error: any) {
    console.error('Shortcut referral error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
