import { NextRequest, NextResponse } from 'next/server';
import { generateAdmission } from '@/lib/claude';
import { getSheetsContext, getPatient, updatePatientFields, getStyleGuideFromSheet } from '@/lib/google-sheets';

export const maxDuration = 60;

// POST /api/admission - Generate admission note
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName, service, reason, acuity } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (!patient.hasOutput) {
      return NextResponse.json(
        { error: 'Process encounter first before generating admission note' },
        { status: 400 }
      );
    }

    const admissionText = await generateAdmission(
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
        ddx: patient.ddx,
        investigations: patient.investigations,
        management: patient.management,
        evidence: patient.evidence,
        hpi: patient.hpi,
        objective: patient.objective,
        assessmentPlan: patient.assessmentPlan,
        diagnosis: patient.diagnosis,
        icd9: patient.icd9,
        icd10: patient.icd10,
      },
      { service, reason, acuity },
      await (async () => {
        try {
          const guide = await getStyleGuideFromSheet(ctx);
          return (guide.examples as any).admission || [];
        } catch { return []; }
      })(),
    );

    await updatePatientFields(ctx, rowIndex, { admission: admissionText }, sheetName);

    return NextResponse.json({ success: true, admission: admissionText });
  } catch (error: any) {
    console.error('Error generating admission note:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to generate admission note', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
