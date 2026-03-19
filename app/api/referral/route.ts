import { NextRequest, NextResponse } from 'next/server';
import { generateReferral } from '@/lib/claude';
import { getSheetsContext, getPatient, updatePatientFields, getStyleGuideFromSheet } from '@/lib/google-sheets';

export const maxDuration = 60;

// POST /api/referral - Generate referral letter
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName, specialty, urgency, reason } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (!patient.hasOutput) {
      return NextResponse.json(
        { error: 'Process encounter first before generating referral' },
        { status: 400 }
      );
    }

    const referralText = await generateReferral(
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
      { specialty, urgency, reason },
      await (async () => {
        try {
          const guide = await getStyleGuideFromSheet(ctx);
          return (guide.examples as any).referral || [];
        } catch { return []; }
      })(),
    );

    // Save referral to sheet
    await updatePatientFields(ctx, rowIndex, { referral: referralText }, sheetName);

    return NextResponse.json({ success: true, referral: referralText });
  } catch (error: any) {
    console.error('Error generating referral:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to generate referral', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
