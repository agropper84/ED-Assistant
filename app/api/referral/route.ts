import { NextRequest, NextResponse } from 'next/server';
import { generateReferral } from '@/lib/claude';
import { getDataContext, getPatient, updatePatientFields } from '@/lib/data-layer';
import { getStyleGuideFromSheet } from '@/lib/google-sheets';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { referralSchema } from '@/lib/schemas';

export const maxDuration = 60;

export const POST = withApiHandler(
  { rateLimit: { limit: 10, window: 60 }, auditEvent: 'generate.referral' },
  async (request: NextRequest) => {
    const { rowIndex, sheetName, specialty, urgency, reason, customInstructions } = await parseBody(request, referralSchema);
    const ctx = await getDataContext();

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

    // PHI protection is now mandatory inside generateReferral via callWithPHIProtection
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
          const guide = await getStyleGuideFromSheet(ctx.sheets);
          return (guide.examples as any).referral || [];
        } catch { return []; }
      })(),
      customInstructions,
    );

    await updatePatientFields(ctx, rowIndex, { referral: referralText }, sheetName, patient.name);

    return NextResponse.json({ success: true, referral: referralText });
  }
);
