import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatient, updatePatientFields } from '@/lib/data-layer';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 30;

// POST /api/shortcuts/profile-generate
// Body: { rowIndex, sheetName }
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const anthropic = await getAnthropicClient();
    const { rowIndex, sheetName } = await request.json();

    const patient = await getPatient(auth.dataCtx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const parts: string[] = [];
    if (patient.triageVitals) parts.push(`Triage Notes:\n${patient.triageVitals}`);
    if (patient.transcript) parts.push(`Transcript:\n${patient.transcript}`);
    if (patient.encounterNotes) parts.push(`Encounter Notes:\n${patient.encounterNotes}`);
    if (patient.additional) parts.push(`Exam Findings:\n${patient.additional}`);
    if (patient.pastDocs) parts.push(`Past Documents:\n${patient.pastDocs}`);
    if (patient.hpi) parts.push(`HPI:\n${patient.hpi}`);
    if (patient.objective) parts.push(`Objective:\n${patient.objective}`);
    if (patient.assessmentPlan) parts.push(`Assessment & Plan:\n${patient.assessmentPlan}`);

    if (parts.length === 0) {
      return NextResponse.json({ error: 'No clinical data available' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: `Extract a structured patient profile from the following clinical documentation. Return ONLY valid JSON matching this exact format — no markdown, no explanation:

{
  "presentingIssue": "one-sentence summary of why the patient is presenting to the ED",
  "age": "age with units if available, e.g. '45 yo' or ''",
  "gender": "M/F/Other or ''",
  "pmhx": ["list of past medical history items"],
  "medications": ["list of current medications with doses if available"],
  "allergies": ["list of allergies, include reaction type if mentioned"],
  "socialHistory": ["smoking status, alcohol, drugs, occupation, living situation, etc."],
  "familyHistory": ["relevant family history items"]
}

Rules:
- Extract ONLY what is explicitly stated or clearly implied
- Use empty arrays [] for categories with no information
- Keep items concise but include relevant details

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n---\n\n')}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    let profile;
    try {
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      profile = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 });
    }

    if (!profile.age && patient.age) profile.age = patient.age;
    if (!profile.gender && patient.gender) profile.gender = patient.gender;

    const profileJson = JSON.stringify(profile);
    await updatePatientFields(auth.dataCtx, rowIndex, { profile: profileJson }, sheetName);

    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error('Shortcut profile error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
