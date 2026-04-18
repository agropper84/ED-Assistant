import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';
import { getDataContext, getPatient, updatePatientFields } from '@/lib/data-layer';
import { MODELS } from '@/lib/config';

export const maxDuration = 30;

export interface PatientProfile {
  presentingIssue: string;
  age: string;
  gender: string;
  pmhx: string[];
  medications: string[];
  allergies: string[];
  socialHistory: string[];
  familyHistory: string[];
}

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    const ctx = await getDataContext();
    const { rowIndex, sheetName } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Gather all raw clinical inputs
    const parts: string[] = [];
    if (patient.triageVitals) parts.push(`Triage Notes:\n${patient.triageVitals}`);
    if (patient.transcript) parts.push(`Transcript:\n${patient.transcript}`);
    if (patient.encounterNotes) parts.push(`Encounter Notes:\n${patient.encounterNotes}`);
    if (patient.additional) parts.push(`Exam Findings / Additional:\n${patient.additional}`);
    if (patient.pastDocs) parts.push(`Past Documents:\n${patient.pastDocs}`);
    // Also use processed output if available for more complete extraction
    if (patient.hpi) parts.push(`HPI:\n${patient.hpi}`);
    if (patient.objective) parts.push(`Objective:\n${patient.objective}`);
    if (patient.assessmentPlan) parts.push(`Assessment & Plan:\n${patient.assessmentPlan}`);

    if (parts.length === 0) {
      return NextResponse.json({ error: 'No clinical data available' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 1024,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: `Extract a structured patient profile from the following clinical documentation. Return ONLY valid JSON matching this exact format — no markdown, no explanation:

{
  "presentingIssue": "one-sentence summary of why the patient is presenting to the ED, e.g. 'Chest pain radiating to left arm, onset 2 hours ago'",
  "age": "age with units if available, e.g. '45 yo' or ''",
  "gender": "M/F/Other or ''",
  "pmhx": ["list of past medical history items"],
  "medications": ["list of current medications with doses if available"],
  "allergies": ["list of allergies, include reaction type if mentioned"],
  "socialHistory": ["smoking status, alcohol, drugs, occupation, living situation, etc."],
  "familyHistory": ["relevant family history items"]
}

Rules:
- Extract ONLY what is explicitly stated or clearly implied in the text
- Do NOT fabricate or assume information not present
- Use empty arrays [] for categories with no information found
- Keep items concise but include relevant details (e.g. medication doses)
- For age/gender, use what's provided or leave as empty string
- Combine duplicate information from different sources

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n---\n\n')}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Parse the JSON response
    let profile: PatientProfile;
    try {
      // Strip any markdown code fences if present
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      profile = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse profile JSON:', text);
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: text },
        { status: 500 }
      );
    }

    // Use patient demographics as fallback
    if (!profile.age && patient.age) profile.age = patient.age;
    if (!profile.gender && patient.gender) profile.gender = patient.gender;

    const profileJson = JSON.stringify(profile);
    await updatePatientFields(ctx, rowIndex, { profile: profileJson }, sheetName, patient.name);

    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error('Error generating profile:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to generate profile', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
