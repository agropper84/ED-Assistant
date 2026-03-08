import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getShortcutTokenUser } from '@/lib/kv';
import {
  getSheetsContextForUser,
  getPatient,
  updatePatientFields,
  getStyleGuideFromSheet,
} from '@/lib/google-sheets';
import { processEncounter } from '@/lib/claude';

export const maxDuration = 60;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// POST /api/shortcuts/process — Process a patient encounter from device
// mode: "analyze" (synopsis + DDx + management + evidence)
//        "full" (analyze + generate encounter note)
export async function POST(request: NextRequest) {
  try {
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

    const { rowIndex, sheetName, mode } = await request.json();

    if (typeof rowIndex !== 'number' || !mode) {
      return NextResponse.json({ error: 'rowIndex and mode are required' }, { status: 400 });
    }

    const ctx = await getSheetsContextForUser(userId);
    const patient = await getPatient(ctx, rowIndex, sheetName);

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (!patient.transcript && !patient.triageVitals && !patient.additional) {
      return NextResponse.json({ error: 'No clinical data to process' }, { status: 400 });
    }

    // Load style guide
    let styleGuidance = '';
    try {
      const guide = await getStyleGuideFromSheet(ctx);
      if (guide?.guidance) styleGuidance = guide.guidance;
    } catch {}

    if (mode === 'full') {
      // Full processing: encounter note + DDx + analysis
      const result = await processEncounter(patient, {
        styleGuidance,
      });

      await updatePatientFields(ctx, rowIndex, {
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
      const result = await processEncounter(patient, {
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

      await updatePatientFields(ctx, rowIndex, fields, sheetName);

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
