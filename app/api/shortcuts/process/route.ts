import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatient, updatePatientFields } from '@/lib/data-layer';
import { getStyleGuideFromSheet } from '@/lib/google-sheets';
import { processEncounter } from '@/lib/claude';

export const maxDuration = 60;

// POST /api/shortcuts/process — Process a patient encounter from device
// mode: "analyze" (synopsis + DDx + management + evidence)
//        "full" (analyze + generate encounter note)
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const { rowIndex, sheetName, mode } = await request.json();

    if (typeof rowIndex !== 'number' || !mode) {
      return NextResponse.json({ error: 'rowIndex and mode are required' }, { status: 400 });
    }

    const patient = await getPatient(auth.dataCtx, rowIndex, sheetName);

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (!patient.transcript && !patient.encounterNotes && !patient.triageVitals && !patient.additional) {
      return NextResponse.json({ error: 'No clinical data to process' }, { status: 400 });
    }

    // Merge transcript + encounterNotes (same as web /api/process does)
    const mergedTranscript = [patient.transcript, patient.encounterNotes]
      .filter(Boolean)
      .join('\n\n--- ENCOUNTER NOTES ---\n');
    // Override transcript on the patient object so processEncounter uses both
    const patientForProcessing = { ...patient, transcript: mergedTranscript };

    // Load style guide
    let styleGuidance = '';
    try {
      const guide = await getStyleGuideFromSheet(auth.dataCtx.sheets);
      const parts: string[] = [];
      for (const [section, examples] of Object.entries(guide.examples)) {
        if ((examples as string[]).length > 0) {
          parts.push(`${section.toUpperCase()} style examples:\n${(examples as string[]).map((e: string, i: number) => `Example ${i + 1}:\n${e}`).join('\n\n')}`);
        }
      }
      if (guide.extractedFeatures.length > 0) {
        parts.push(`Writing style features:\n${guide.extractedFeatures.join('\n')}`);
      }
      if (guide.customGuidance) {
        parts.push(`Custom guidance:\n${guide.customGuidance}`);
      }
      styleGuidance = parts.join('\n\n');
    } catch {}

    if (mode === 'full') {
      // Full processing: encounter note + DDx + analysis
      const result = await processEncounter(patientForProcessing, {
        styleGuidance,
      });

      await updatePatientFields(auth.dataCtx, rowIndex, {
        hpi: result.hpi || '',
        objective: result.objective || '',
        assessmentPlan: result.assessmentPlan || '',
        ddx: result.ddx || '',
        investigations: result.investigations || '',
        management: result.management || '',
        evidence: result.evidence || '',
        diagnosis: result.diagnosis || '',
        icd9: result.icd9 || '',
        icd10: result.icd10 || '',
      }, sheetName);

      return NextResponse.json({ success: true, mode: 'full' });
    } else {
      // Analyze only: synopsis + DDx + management + evidence via processEncounter
      // We use processEncounter but only save the analysis fields
      const result = await processEncounter(patientForProcessing, {
        styleGuidance,
      });

      const fields: Record<string, string> = {};
      if (result.ddx) fields.ddx = result.ddx;
      if (result.investigations) fields.investigations = result.investigations;
      if (result.management) fields.management = result.management;
      if (result.evidence) fields.evidence = result.evidence;
      if (result.diagnosis) fields.diagnosis = result.diagnosis;
      if (result.icd9) fields.icd9 = result.icd9;
      if (result.icd10) fields.icd10 = result.icd10;

      // Also generate synopsis from the result
      const synopsisText = [
        result.hpi ? `HPI: ${result.hpi.substring(0, 200)}` : '',
        result.assessmentPlan ? `A&P: ${result.assessmentPlan.substring(0, 200)}` : '',
      ].filter(Boolean).join(' | ');
      if (synopsisText) fields.synopsis = synopsisText;

      await updatePatientFields(auth.dataCtx, rowIndex, fields, sheetName);

      return NextResponse.json({ success: true, mode: 'analyze' });
    }
  } catch (error: any) {
    console.error('Shortcut process error:', error);
    return NextResponse.json(
      { error: error?.message || 'Processing failed' },
      { status: error?.message?.includes('Not approved') ? 403 : 500 }
    );
  }
}
