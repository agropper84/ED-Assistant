import { NextRequest, NextResponse } from 'next/server';
import { processEncounter, ProcessedNote } from '@/lib/claude';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';

// Allow longer execution for Claude API calls
export const maxDuration = 60;

// Default billing code for standard ED visit
const DEFAULT_BILLING = {
  procCode: '1100',
  visitProcedure: 'ED Visit',
  fee: '50.90',
  unit: '1',
  total: '50.90',
};

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

    // Build fields to update: clinical notes + ICD codes + diagnosis
    const fieldsToUpdate: Record<string, string> = {
      ddx: result.ddx,
      investigations: result.investigations,
      hpi: result.hpi,
      objective: result.objective,
      assessmentPlan: result.assessmentPlan,
      diagnosis: result.diagnosis,
      icd9: result.icd9,
      icd10: result.icd10,
    };

    // Auto-assign billing if not already set (only on fresh processing, not modifications)
    if (!modifications && !patient.procCode) {
      fieldsToUpdate.visitProcedure = DEFAULT_BILLING.visitProcedure;
      fieldsToUpdate.procCode = DEFAULT_BILLING.procCode;
      fieldsToUpdate.fee = DEFAULT_BILLING.fee;
      fieldsToUpdate.unit = DEFAULT_BILLING.unit;
      fieldsToUpdate.total = DEFAULT_BILLING.total;
    }

    // Update the sheet
    await updatePatientFields(rowIndex, fieldsToUpdate, sheetName);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Error processing encounter:', error);
    return NextResponse.json(
      { error: 'Failed to process encounter', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
