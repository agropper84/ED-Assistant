import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 30;

// POST /api/shortcuts/admission-note
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
      max_tokens: 1536,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: `Write an admission note for this ED patient being admitted to hospital. Include: Admitting Service, Reason for Admission, HPI, PMHx, Medications, Allergies, Social History, Physical Exam, Investigations, Assessment, and Plan. Use standard admission note format.\n\n${parts.join('\n\n')}`,
      }],
    });

    const admission = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    await updatePatientFields(auth.ctx, rowIndex, { admission }, sheetName);

    return NextResponse.json({ admission });
  } catch (error: any) {
    console.error('Shortcut admission error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
