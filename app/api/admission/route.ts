import { NextRequest, NextResponse } from 'next/server';
import { generateAdmission } from '@/lib/claude';
import { getSheetsContext, getPatient, updatePatientFields, getStyleGuideFromSheet } from '@/lib/google-sheets';
import { withApiHandler } from '@/lib/api-handler';

export const maxDuration = 60;

export const POST = withApiHandler(
  { rateLimit: { limit: 10, window: 60 }, auditEvent: 'generate.admission' },
  async (request: NextRequest) => {
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

    // PHI protection is now mandatory inside generateAdmission via callWithPHIProtection
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
  }
);
