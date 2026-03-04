import { NextRequest, NextResponse } from 'next/server';
import { processEncounter, ProcessedNote } from '@/lib/claude';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';

// POST /api/process - Process patient encounter with Claude
export async function POST(request: NextRequest) {
  try {
    const { rowIndex, sheetName, modifications, styleGuidance, settings } = await request.json();

    // Get patient data
    const patient = await getPatient(rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build existing output if modifications are requested
    let existingOutput: ProcessedNote | undefined;
    if (modifications && patient.hasOutput) {
      existingOutput = {
        ddx: patient.ddx,
        investigations: patient.investigations,
        hpi: patient.hpi,
        objective: patient.objective,
        assessmentPlan: patient.assessmentPlan,
        diagnosis: patient.diagnosis,
        icd9: patient.icd9,
        icd10: patient.icd10,
      };
    }

    // Process with Claude
    const result = await processEncounter(
      {
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        birthday: patient.birthday,
        triageVitals: patient.triageVitals,
        transcript: patient.transcript,
        additional: patient.additional,
        pastDocs: patient.pastDocs,
      },
      {
        modifications,
        existingOutput,
        styleGuidance,
        settings,
      }
    );

    // Update the sheet
    await updatePatientFields(rowIndex, {
      ddx: result.ddx,
      investigations: result.investigations,
      hpi: result.hpi,
      objective: result.objective,
      assessmentPlan: result.assessmentPlan,
      diagnosis: result.diagnosis,
    }, sheetName);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Error processing encounter:', error);
    return NextResponse.json(
      { error: 'Failed to process encounter', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
