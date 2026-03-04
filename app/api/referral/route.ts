import { NextRequest, NextResponse } from 'next/server';
import { generateReferral } from '@/lib/claude';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';

// POST /api/referral - Generate referral letter
export async function POST(request: NextRequest) {
  try {
    const { rowIndex, sheetName, specialty, urgency, reason } = await request.json();

    const patient = await getPatient(rowIndex, sheetName);
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
        hpi: patient.hpi,
        objective: patient.objective,
        assessmentPlan: patient.assessmentPlan,
        diagnosis: patient.diagnosis,
        icd9: patient.icd9,
        icd10: patient.icd10,
      },
      { specialty, urgency, reason }
    );

    // Save referral to sheet
    await updatePatientFields(rowIndex, { referral: referralText }, sheetName);

    return NextResponse.json({ success: true, referral: referralText });
  } catch (error: any) {
    console.error('Error generating referral:', error);
    return NextResponse.json(
      { error: 'Failed to generate referral', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
